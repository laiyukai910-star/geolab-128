import * as THREE from "three";

const VARYINGS = /* glsl */`
varying vec3 vGeoPositionM;
varying vec4 vGeoSurface;
varying vec4 vGeoStructure;
uniform float geoSurfaceEnabled;
uniform float geoSeaLevel;
// Structure bytes are logarithmic. See TERRAIN_STRUCTURE_RANGES in terrainAppearance.js.
const vec2 GEO_JOINT_SPACING_RANGE_M = vec2(0.02, 20.0);
const vec2 GEO_BED_THICKNESS_RANGE_M = vec2(0.01, 50.0);
float geoUnpackLog(float byte, vec2 range) {
  return range.x * pow(range.y / range.x, byte);
}
`;

const SURFACE_FUNCTIONS = /* glsl */`
float geoHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float geoNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(geoHash(i), geoHash(i + vec3(1,0,0)), f.x),
        mix(geoHash(i + vec3(0,1,0)), geoHash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(geoHash(i + vec3(0,0,1)), geoHash(i + vec3(1,0,1)), f.x),
        mix(geoHash(i + vec3(0,1,1)), geoHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float geoFilteredNoise(vec3 p, float wavelength, float footprint) {
  float fade = 1.0 - smoothstep(wavelength * 0.2, wavelength, footprint);
  if (fade < 0.001) return 0.5;
  return mix(0.5, geoNoise(p / wavelength), fade);
}
vec3 geoHash3(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
// Distance gaps produce bounded bevels and joints without a UV projection seam.
vec2 geoStoneCell(vec3 p) {
  vec3 cell = floor(p), local = fract(p);
  float first = 8.0, second = 8.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 offset = vec3(float(x), float(y), float(z));
    vec3 delta = offset + geoHash3(cell + offset) - local;
    float distanceSq = dot(delta, delta);
    second = min(second, max(first, distanceSq));
    first = min(first, distanceSq);
  }
  return vec2(sqrt(first), sqrt(second) - sqrt(first));
}
vec3 geoPerturbNormal(vec3 n, float height) {
  vec3 dx = dFdx(-vViewPosition) * 1000.0;
  vec3 dy = dFdy(-vViewPosition) * 1000.0;
  vec3 rx = cross(dy, n), ry = cross(n, dx);
  float determinant = dot(dx, rx);
  vec2 heightGradient = vec2(dFdx(height), dFdy(height));
  if (abs(determinant) < 1e-12) return n;
  vec3 gradient = sign(determinant) * (heightGradient.x * rx + heightGradient.y * ry);
  return normalize(abs(determinant) * n - gradient);
}
`;

const SURFACE_COLOR = /* glsl */`
float geoHeight = 0.0;
float geoRoughness = 0.92;
vec3 p = vGeoPositionM;
float footprint = max(length(dFdx(p)), length(dFdy(p)));
if (geoSurfaceEnabled > 0.5 && vGeoPositionM.y > geoSeaLevel) {
  // Joint and bed spacings come from the lithology and bed thickness under this cell, so a
  // sparsely jointed granite and a closely fractured mudstone no longer share one cell size. The
  // fourth byte says which scale the first byte holds: a joint spacing in a rock mass, or an
  // aggregate scale in a loose material that has no joints at all.
  float jointSpacingM = geoUnpackLog(vGeoStructure.x, GEO_JOINT_SPACING_RANGE_M);
  float bedThicknessM = geoUnpackLog(vGeoStructure.y, GEO_BED_THICKNESS_RANGE_M);
  float competence = vGeoStructure.z;
  // 1.0 means a jointed rock mass; a loose material and an unresolved column both fall below it and
  // are drawn granular, so an unclassified cell never invents bedding or blocky joints.
  float rockMass = step(0.8, vGeoStructure.w);
  float macro = geoFilteredNoise(p, 160.0, footprint);
  float meadow = geoFilteredNoise(p + vec3(271.0, 0.0, 91.0), 48.0, footprint);
  float blocks = geoFilteredNoise(p + 37.0, 14.0, footprint);
  float chips = geoFilteredNoise(p + 71.0, 2.2, footprint);
  float grain = geoFilteredNoise(p, 0.18, footprint);
  float grit = geoFilteredNoise(p + 103.0, 0.045, footprint);
  float particles = geoFilteredNoise(p + 191.0, 0.008, footprint);
  float pores = geoFilteredNoise(p + 233.0, 0.002, footprint);
  float vegetation = clamp(vGeoSurface.y + (macro - 0.5) * 0.18, 0.0, 1.0);
  float rock = clamp(vGeoSurface.x + (blocks - 0.5) * 0.24, 0.0, 1.0);
  float wet = vGeoSurface.z, sealed = vGeoSurface.w;
  // One banding cycle per bed, so a thin-bedded unit reads as laminae and a thick unit as massive
  // beds. Surface relief also grows with joint spacing, which is what makes widely jointed rock
  // stand in bigger blocks. Loose material is not a fractured mass, so it carries neither bedding
  // nor blocky joints: only its aggregate scale survives.
  float layers = sin((p.y + geoFilteredNoise(p, 36.0, footprint) * 7.0) * 6.2831853 / max(0.05, bedThicknessM))
    * (1.0 - smoothstep(0.7, 4.5, footprint)) * rockMass;
  float fracture = (1.0 - smoothstep(0.025, 0.12, abs(blocks - 0.5)))
    * (1.0 - smoothstep(1.0, 5.0, footprint)) * rockMass;
  float cellFade = 1.0 - smoothstep(0.06, 0.4, footprint);
  vec2 stone = vec2(0.5, 0.18);
  if (cellFade > 0.001 && rock > 0.04) {
    vec3 warp = vec3(chips, geoNoise(p / 2.2 + 13.0), geoNoise(p / 2.2 + 29.0));
    // How squat a block is follows the rock. A bed is cut more closely across its thickness than
    // along the bedding, so the vertical squash is bed thickness against joint spacing rather than
    // one constant: thinly bedded rock breaks into flat slabs, a thick massive unit into blocks.
    // Loose material has no joints to be squat about, so it stays isotropic.
    float beddingRatio = bedThicknessM / max(0.05, jointSpacingM);
    float verticalSquash = mix(1.0, clamp(0.55 / max(0.08, beddingRatio), 1.0, 2.6), rockMass);
    stone = geoStoneCell((p + warp * 1.2) * vec3(1.0, verticalSquash, 1.0) / max(0.02, jointSpacingM));
  }
  float weathering = smoothstep(0.3, 0.7, blocks + (chips - 0.5) * 0.45);
  float joint = (1.0 - smoothstep(0.025, 0.12, stone.y)) * cellFade * weathering;
  float bevel = smoothstep(0.0, 0.17, stone.y) * cellFade * weathering;
  float stoneTone = 0.75 + chips * 0.26 + layers * 0.15 - fracture * 0.16
    + (grain - 0.5) * 0.48 + (grit - 0.5) * 0.22 - joint * 0.28 + (stone.x - 0.5) * cellFade * 0.3;
  float earthTone = 0.84 + blocks * 0.16 + grain * 0.16 + (grit - 0.5) * 0.14;
  float aggregate = smoothstep(0.38, 0.65, grain) - 0.5;
  float looseSoil = (1.0 - rock) * (1.0 - vegetation) * (1.0 - sealed);
  earthTone += aggregate * 0.12 + (particles - 0.5) * 0.22;
  stoneTone += (particles - 0.5) * 0.16 + (pores - 0.5) * 0.08;
  float coverPatch = smoothstep(0.31, 0.68, macro * 0.57 + meadow * 0.43);
  float turfTone = 0.73 + macro * 0.19 + meadow * 0.17 + blocks * 0.12 + chips * 0.045;
  float tone = mix(mix(earthTone, turfTone, vegetation), stoneTone, rock);
  diffuseColor.rgb *= mix(tone, 0.94 + grain * 0.1, sealed);
  // Broad, filtered patches remain continuous across source-grid cells. Local pigment is
  // constrained by the classified surface weights rather than inventing a new land cover.
  vec3 grassPigment = mix(vec3(0.91, 0.97, 0.79), vec3(1.04, 1.02, 0.89), coverPatch);
  vec3 soilPigment = mix(vec3(0.89, 0.94, 0.95), vec3(1.08, 0.98, 0.82), meadow);
  vec3 stonePigment = mix(vec3(0.88, 0.94, 1.02), vec3(1.06, 1.02, 0.93), macro);
  diffuseColor.rgb *= mix(mix(soilPigment, grassPigment, vegetation), stonePigment, rock)
    * (1.0 - sealed) + vec3(sealed);
  diffuseColor.rgb += rock * (chips - 0.5) * vec3(0.022, 0.026, 0.03);
  diffuseColor.rgb += looseSoil * (grit - 0.5) * vec3(0.035, 0.021, 0.008);
  diffuseColor.rgb = max(diffuseColor.rgb, vec3(0.0));
  geoHeight = mix(mix(0.035 * grain + 0.07 * chips + 0.008 * grit,
    0.012 * grain + 0.022 * chips + 0.018 * blocks,vegetation),
    (0.32 * blocks + 0.12 * chips + layers * 0.035 - fracture * 0.09
    + bevel * 0.07 + grain * 0.06 + grit * 0.008) * (0.55 + 0.45 * competence), rock) * (1.0 - sealed * 0.85);  geoHeight += (particles * 0.00065 + pores * 0.00012) * (1.0 - sealed)
    + looseSoil * aggregate * 0.006;
  float mineralSpark = smoothstep(0.61, 0.78, particles) * rock;
  float dampPores = wet * (1.0 - smoothstep(0.35, 0.65, grain)) * (1.0 - sealed);
  diffuseColor.rgb *= 1.0 - dampPores * 0.09;
  geoRoughness = clamp(mix(0.94, 0.79, rock) + (grain - 0.5) * 0.1 - wet * 0.27
    - mineralSpark * 0.12 - dampPores * 0.06, 0.42, 0.99);
} else if (geoSurfaceEnabled > 0.5) {
  float sediment = geoFilteredNoise(p, 0.18, footprint);
  float sand = geoFilteredNoise(p + 191.0, 0.008, footprint);
  float ripple = sin(p.x * 3.8 + geoFilteredNoise(p, 2.2, footprint) * 4.0)
    * (1.0 - smoothstep(0.2, 1.4, footprint));
  diffuseColor.rgb *= 0.86 + sediment * 0.22 + ripple * 0.08 + (sand - 0.5) * 0.16;
  geoHeight = sediment * 0.015 + ripple * 0.018 + sand * 0.0006;
  geoRoughness = 0.75;
}
`;

export function createTerrainSurfaceMaterial() {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.02 });
  const uniforms = {
    geoSurfaceEnabled: { value: 0 },
    geoSeaLevel: { value: 0 },
    geoVerticalScale: { value: 1 }
  };
  material.userData.terrainSurface = {
    version: 4,
    representation: "illustrative procedural surface, not surveyed microtopography",
    coordinates: "unexaggerated local metres",
    wavelengthsM: [160, 48, 36, 14, 2.2, 0.18, 0.045, 0.008, 0.002],
    jointSpacingSource: "lithology and bed thickness, see geoLithology.js",
    structureRangesM: { jointSpacing: [0.02, 20], bedThickness: [0.01, 50] },
    uniforms
  };
  material.customProgramCacheKey = () => "geolab-terrain-surface-v4";
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VARYINGS}\nattribute vec4 terrainSurface;\nattribute vec4 terrainStructure;\nuniform float geoVerticalScale;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vec3 geoWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        vGeoPositionM = vec3(geoWorld.x, geoWorld.y / geoVerticalScale, geoWorld.z) * 1000.0;
        vGeoSurface = terrainSurface;
        vGeoStructure = terrainStructure;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${VARYINGS}\n${SURFACE_FUNCTIONS}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\n${SURFACE_COLOR}`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>\nif (geoSurfaceEnabled > 0.5) roughnessFactor = geoRoughness;`)
      .replace("#include <metalnessmap_fragment>", `#include <metalnessmap_fragment>\nif (geoSurfaceEnabled > 0.5) metalnessFactor = 0.0;`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>\nif (geoSurfaceEnabled > 0.5) normal = geoPerturbNormal(normal, geoHeight);`);
  };
  return material;
}

export function updateTerrainSurfaceMaterial(material, params, viewMode) {
  const uniforms = material.userData.terrainSurface.uniforms;
  uniforms.geoSurfaceEnabled.value = viewMode === "landscape" ? 1 : 0;
  uniforms.geoSeaLevel.value = Number(params?.seaLevel) || 0;
  uniforms.geoVerticalScale.value = Number(params?.verticalScale) || 1;
}
