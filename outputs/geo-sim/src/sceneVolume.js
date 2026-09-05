import * as THREE from "three";
import { buildTerrainVolume, volumeDisplayConfig, sampleTerrainHeight, underwaterFocus } from "./terrainVolume.js";

function createSky() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false,
    uniforms: { time: { value: 0 } },
    vertexShader: `varying vec3 direction;
      void main() { direction = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec3 direction; uniform float time;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p) { vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.0),f.x),f.y); }
      void main() {
        vec3 ray=normalize(direction);
        vec3 sky=mix(vec3(0.57,0.73,0.80),vec3(0.035,0.16,0.32),pow(max(ray.y,0.0),0.45));
        vec3 sun=normalize(vec3(-0.5,0.72,0.42));
        float alignment=max(dot(ray,sun),0.0);
        sky+=vec3(1.0,0.84,0.54)*(pow(alignment,700.0)*1.5+pow(alignment,16.0)*0.12);
        vec2 p=ray.xz/max(ray.y+0.2,0.15)*2.5+vec2(time*0.006,0.0);
        float cloud=noise(p)*0.55+noise(p*2.1)*0.28+noise(p*4.3)*0.17;
        float cover=smoothstep(0.55,0.74,cloud)*smoothstep(0.0,0.22,ray.y);
        sky=mix(sky,vec3(0.87,0.90,0.89),cover*0.82);
        sky=mix(vec3(0.27,0.34,0.38),sky,smoothstep(-0.22,0.02,ray.y));
        gl_FragColor=vec4(sky,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), material);
  sky.name = "atmosphere display";
  sky.frustumCulled = false;
  sky.renderOrder = -10000;
  return sky;
}

function createWaterMaterial(config) {
  const uniforms = { waterLevel: { value: config.seaLevel * config.verticalScale / 1000 },
    waterVerticalScale: { value: config.verticalScale }, waterTime: { value: 0 } };
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0, roughness: 0.24,
    transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
  material.forceSinglePass = true;
  material.userData.waterUniforms = uniforms;
  material.customProgramCacheKey = () => "geolab-water-volume-v1";
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    const shared = `uniform float waterLevel; uniform float waterVerticalScale; uniform float waterTime;
      varying float waterDepthM; varying vec3 waterWorld;`;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${shared}`)
      .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>\nobjectNormal = vec3(0.0,1.0,0.0);`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        waterDepthM=(waterLevel-position.y)*1000.0/waterVerticalScale;
        transformed.y=waterLevel;
        waterWorld=(modelMatrix*vec4(transformed,1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${shared}`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        if(waterDepthM<=0.0) discard;
        float attenuation=1.0-exp(-waterDepthM/18.0);
        diffuseColor.rgb=mix(vec3(0.10,0.42,0.43),vec3(0.015,0.12,0.20),attenuation);
        float foam=(1.0-smoothstep(0.05,1.6,waterDepthM))*0.20;
        diffuseColor.rgb+=foam;
        diffuseColor.a=mix(0.20,0.88,attenuation)*smoothstep(0.0,0.25,waterDepthM);`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        vec2 p=waterWorld.xz*1000.0;
        float footprint=max(length(dFdx(p)),length(dFdy(p)));
        float farFade=1.0-smoothstep(3.0,18.0,footprint);
        float fineFade=1.0-smoothstep(0.8,5.5,footprint);
        float wave=sin(dot(p,vec2(0.34,0.08))-waterTime*1.2)*0.12*farFade;
        float ripple=sin(dot(p,vec2(-0.4,1.05))+waterTime*1.6)*0.045*fineFade;
        vec3 waterNormal=normalize(vec3(wave+ripple,1.0,wave*0.4-ripple));
        normal=normalize(mat3(viewMatrix)*waterNormal)*(gl_FrontFacing?1.0:-1.0);`);
  };
  return material;
}

function createRockSectionMaterial() {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  material.customProgramCacheKey = () => "geolab-section-rock-v1";
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 sectionPosition;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nsectionPosition=position;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 sectionPosition;")
      .replace("#include <color_fragment>", `#include <color_fragment>
        float footprint=max(length(dFdx(sectionPosition)),length(dFdy(sectionPosition)));
        float band=sin(sectionPosition.y*37.0+sin(sectionPosition.x*6.0+sectionPosition.z*7.0));
        float grain=sin(dot(sectionPosition,vec3(119.0,173.0,127.0)))*sin(sectionPosition.y*233.0);
        diffuseColor.rgb*=0.91+band*0.055*(1.0-smoothstep(0.02,0.12,footprint))
          +grain*0.045*(1.0-smoothstep(0.002,0.025,footprint));`);
  };
  return material;
}

export class SceneVolume {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = "closed terrain and water volume";
    this.sky = createSky();
    scene.add(this.group, this.sky);
    this.plane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
    this.clippingPlanes = [this.plane];
    this.waterMeshes = [];
    this.stats = {};
  }

  clear() {
    for (const mesh of [...this.group.children]) {
      // Water surfaces borrow the exact terrain geometry and must never dispose it.
      if (!mesh.userData.borrowedTerrainGeometry) mesh.geometry.dispose();
      mesh.material.dispose();
      this.group.remove(mesh);
    }
    this.waterMeshes = [];
  }

  rebuild(model, params, terrainTiles, viewMode) {
    this.clear();
    this.model = model;
    this.params = params;
    this.config = volumeDisplayConfig(model, params);
    const volume = buildTerrainVolume(model, this.config);
    this.baseY = volume.baseY;
    this.plane.constant = this.config.cutX;
    const solid = new THREE.Mesh(volume.solid, createRockSectionMaterial());
    solid.name = "modeled columns and unclassified closure";
    this.group.add(solid);
    const sides = new THREE.Mesh(volume.waterSides, new THREE.MeshStandardMaterial({ vertexColors: true,
      transparent: true, opacity: 0.65, depthWrite: false, roughness: 0.28, metalness: 0, side: THREE.DoubleSide }));
    sides.name = "water column boundary";
    this.group.add(sides);
    this.waterSides = sides;
    for (const tile of terrainTiles) {
      if (tile.mesh.geometry.boundingBox?.min.y >= this.config.seaLevel * this.config.verticalScale / 1000) continue;
      const water = new THREE.Mesh(tile.mesh.geometry, createWaterMaterial(this.config));
      water.position.copy(tile.mesh.position);
      water.userData.borrowedTerrainGeometry = true;
      water.name = "sea surface";
      water.frustumCulled = false;
      water.renderOrder = 2;
      water.material.clippingPlanes = this.config.mode === "section" ? this.clippingPlanes : null;
      this.group.add(water);
      this.waterMeshes.push(water);
    }
    this.focus = underwaterFocus(model, this.config);
    this.stats = { mode: this.config.mode, boundarySamples: volume.boundarySamples,
      modeledLayerCount: volume.modeledLayerCount, modeledDepthM: this.config.depthM,
      undergroundDisplayExaggeration: this.config.depthScale, baseYKm: volume.baseY,
      sectionColumn: this.config.cutIndex, cutXKm: this.config.cutX, seaSurfaceTiles: this.waterMeshes.length,
      underwaterAvailable: Boolean(this.focus), underwater: false,
      closure: "unclassified below modeled columns", waterModel: "sea-level surface and optical display; not a 3D fluid solver" };
    this.setVisibility(params, viewMode);
    globalThis.__geoLabVolumeStats = this.stats;
  }

  setVisibility(params, viewMode) {
    this.params = params;
    this.waterVisible = params.water3DEnabled !== false && viewMode === "landscape";
    for (const mesh of this.waterMeshes) mesh.visible = this.waterVisible;
    if (this.waterSides) this.waterSides.visible = this.waterVisible;
  }

  applyClipping(groups) {
    const planes = this.config?.mode === "section" ? this.clippingPlanes : null;
    for (const group of groups) group?.traverse(object => {
      const materials = object.material ? Array.isArray(object.material) ? object.material : [object.material] : [];
      for (const material of materials) {
        if (material.clippingPlanes !== planes) { material.clippingPlanes = planes; material.needsUpdate = true; }
      }
    });
  }

  update(camera, seconds) {
    if (!this.model) return;
    const { verticalScale, seaLevel, sizeKm, cutX, mode } = this.config;
    const h = sampleTerrainHeight(this.model, camera.position.x, camera.position.z);
    const submerged = this.waterVisible && h !== null && (mode !== "section" || camera.position.x <= cutX)
      && camera.position.y < seaLevel * verticalScale / 1000 && camera.position.y > h * verticalScale / 1000;
    this.sky.visible = this.params.sky3DEnabled !== false && !submerged;
    this.sky.position.copy(camera.position);
    this.sky.scale.setScalar(camera.far * 0.8);
    this.sky.material.uniforms.time.value = seconds;
    for (const water of this.waterMeshes) water.material.userData.waterUniforms.waterTime.value = seconds;
    if (!this.scene.fog) this.scene.fog = new THREE.FogExp2();
    this.scene.fog.color.set(submerged ? 0x19566a : this.sky.visible ? 0xacc4ce : 0x081210);
    this.scene.fog.density = submerged ? 1 / Math.max(0.01, (seaLevel - h) * verticalScale / 1000 * 3) : 0.035 / sizeKm;
    if (!this.scene.background?.isColor) this.scene.background = new THREE.Color();
    this.scene.background.set(submerged ? 0x19566a : this.sky.visible ? 0xacc4ce : 0x081210);
    this.stats.underwater = submerged;
  }

  dispose() {
    this.clear();
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.scene.remove(this.group, this.sky);
  }
}
