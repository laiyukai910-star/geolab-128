import * as THREE from "three";
import { caveContains } from "./caveField.js";
import { lithologyDisplayColor, unclassifiedDisplayColor, wetRockDisplayColor, stratigraphicProfile, cavePassagePlan } from "./geoLithology.js";
import { SUBSURFACE_LITHOLOGY } from "./lithologyTable.js";

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
// The bedding period the subsurface lamination used before it was derived from the model.
const DEFAULT_BEDDING_SPACING_M = 1.571;

export function volumeDisplayConfig(model, params = {}) {
  const sizeKm = Number(model.sizeKm) || 128;
  const caveFocus=params.worldView==="cave";
  const mode = caveFocus?"section":["solid", "section", "underwater"].includes(params.worldView) ? params.worldView : "solid";
  const cutIndex = mode === "section" && model.n > 2
    ? clamp(Math.round((Number(params.sectionPosition) || 50) / 100 * (model.n - 1)), 1, model.n - 2)
    : model.n - 1;
  const config = {
    mode, sizeKm, cutIndex, cutX: (cutIndex / (model.n - 1) - 0.5) * sizeKm,
    verticalScale: Number(params.verticalScale) || 1,
    depthScale: clamp(Number(params.subsurfaceDisplayScale) || 20, 1, 100),
    seaLevel: Number(params.seaLevel) || 0,
    depthM: Number(model.subsurface?.depthEdgesM?.[model.subsurface.layerCount]) || Number(params.subsurfaceDepthM) || 240,
    // Replaced by the modelled column's own bed thickness once the volume is built; this is the
    // spacing the subsurface lamination used before it was derived.
    beddingSpacingM: DEFAULT_BEDDING_SPACING_M
  };
  if(caveFocus){
    const span=Math.min(clamp(Number(params.caveLengthM)||480,80,800)/2000,sizeKm*0.08,(config.cutX+sizeKm/2)/1.35);
    const radius=Math.min(clamp(Number(params.caveRadiusM)||12,3,25),config.depthM*0.15)/1000;
    const roofDepth=clamp(Number(params.caveDepthM)||100,Math.min(20,config.depthM*0.4)+radius*1800,config.depthM-radius*1800);
    let h=Infinity;
    for(let z=-1;z<=1;z++)for(let x=-1;x<=1;x++){
      const sample=sampleTerrainHeight(model,config.cutX-span*0.24+x*span,z*radius/0.24);
      if(sample!==null)h=Math.min(h,sample);
    }
    config.caveFocus=true;
    config.cave={center:[config.cutX-span*0.24,(h-roofDepth*config.depthScale)*config.verticalScale/1000,0],
      halfSize:[span,radius/0.24*config.verticalScale*config.depthScale,radius/0.24]};
    // Anchor the passage skeleton to the real layer stack under the cave, so a cave in a thick host
    // spans that host and one in a thin host cannot. Without a dissolved host the fixed outline is
    // kept, because inventing bedding contacts would be worse than an honest generic cavity.
    const caveCellX = Math.round(clamp((config.cutX - span * 0.24) / sizeKm + 0.5, 0, 1) * (model.n - 1));
    const caveCellY = Math.round((model.n - 1) / 2);
    const column = subsurfaceColumnIndex(model, caveCellY * model.n + caveCellX);
    if (column >= 0) {
      try {
        const profile = stratigraphicProfile(model, column, { lithologyTable: SUBSURFACE_LITHOLOGY });
        const plan = cavePassagePlan(profile);
        if (plan) {
          config.cave.passagePlan = plan;
          config.cave.columnIndex = column;
        }
      } catch {
        // A malformed subsurface must leave the generic cavity rather than break the volume view.
      }
    }
  }
  return config;
}

export function subsurfaceColumnIndex(model, surfaceIndex) {
  const volume = model.subsurface;
  if (!volume?.columnCellCount) return -1;
  if (volume.columnCellCount === model.n * model.n) return surfaceIndex;
  const x = surfaceIndex % model.n, y = Math.floor(surfaceIndex / model.n);
  const gx = Math.round(x / (model.n - 1) * (volume.gridN - 1));
  const gy = Math.round(y / (model.n - 1) * (volume.gridN - 1));
  return gy * volume.gridN + gx;
}

// Subsurface tones come from the lithology table through the sRGB-to-linear derivation in
// geoLithology.js, so a material's colour is stated once, where the material is. A voxel whose code
// the table does not carry draws as code 0, the model's own unresolved material, as it already did.
const LITHOLOGY_COLORS = Object.keys(SUBSURFACE_LITHOLOGY)
  .map(code => new THREE.Color(...lithologyDisplayColor(SUBSURFACE_LITHOLOGY[code])));
// How much a saturated voxel darkens toward the wet tone depends on how much pore space it has:
// a saturated gravel changes appearance far more than a saturated granite, whose water sits in
// cracks the eye never sees. Porosity is the table's own property, so the display follows the rock.
const WET_DARKENING_AT_FULL_POROSITY = 0.30;
const WET_DARKENING_REFERENCE_POROSITY = 0.42;
const wetDarkening = porosity => WET_DARKENING_AT_FULL_POROSITY
  * Math.min(1, Math.max(0.25, (Number(porosity) || 0) / WET_DARKENING_REFERENCE_POROSITY));
const UNCLASSIFIED_COLOR = unclassifiedDisplayColor();
const WET_ROCK = new THREE.Color(...wetRockDisplayColor());
const unclassifiedTone = () => new THREE.Color(...UNCLASSIFIED_COLOR);
function splineWeights(t) {
  return [(1-t)**3/6, (3*t**3-6*t*t+4)/6, (-3*t**3+3*t*t+3*t+1)/6, t**3/6];
}

export function sampleStratumColor(model, surfaceX, surfaceY, layer) {
  const volume = model.subsurface;
  if (!volume?.columnCellCount || layer < 0) return unclassifiedTone();
  const grid = volume.columnCellCount === model.n * model.n ? model.n : volume.gridN;
  const x = surfaceX / (model.n - 1) * (grid - 1), y = surfaceY / (model.n - 1) * (grid - 1);
  const ix = Math.floor(x), iy = Math.floor(y), wx = splineWeights(x-ix), wy = splineWeights(y-iy);
  const color = new THREE.Color(0,0,0);
  let saturation = 0, wetDepth = 0;
  // Reconstruct display colors, never interpolate categorical IDs or rewrite scientific columns.
  for (let j=0;j<4;j++) for (let i=0;i<4;i++) {
    const voxel = layer * volume.columnCellCount + clamp(iy+j-1,0,grid-1)*grid + clamp(ix+i-1,0,grid-1);
    const weight = wx[i]*wy[j];
    const tone = LITHOLOGY_COLORS[volume.lithologyCode?.[voxel]] || LITHOLOGY_COLORS[0];
    color.r += tone.r*weight; color.g += tone.g*weight; color.b += tone.b*weight;
    const voxelSaturation = clamp(Number(volume.groundwaterSaturation?.[voxel]) || 0,0,1);
    saturation += voxelSaturation*weight;
    // Weight the darkening by the pore space that can actually hold the water. The volume's own
    // porosity is authoritative where it is present; otherwise the table's value for that code is.
    const porosity = Number.isFinite(volume.porosity?.[voxel])
      ? volume.porosity[voxel]
      : SUBSURFACE_LITHOLOGY[volume.lithologyCode?.[voxel]]?.porosity;
    wetDepth += voxelSaturation*wetDarkening(porosity)*weight;
  }
  return color.lerp(WET_ROCK, Math.min(0.45, wetDepth));
}

function geometryBuilder() {
  const positions = [], colors = [], indices = [], depths = [];
  return {
    polygon(points, tones, depthValues = []) {
      const start = positions.length / 3;
      points.forEach((point, i) => { positions.push(...point); colors.push(tones[i].r, tones[i].g, tones[i].b); depths.push(depthValues[i] || 0); });
      for (let i = 1; i < points.length - 1; i++) indices.push(start, start + i, start + i + 1);
    },
    finish() {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      geometry.setAttribute("stratumDepth", new THREE.Float32BufferAttribute(depths, 1));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      return geometry;
    }
  };
}

export function buildTerrainVolume(model, config) {
  const { sizeKm, cutIndex, verticalScale, depthScale, seaLevel, depthM } = config;
  const n = model.n, rim = [];
  for (let x = 0; x <= cutIndex; x++) rim.push(x);
  for (let y = 1; y < n; y++) rim.push(y * n + cutIndex);
  for (let x = cutIndex - 1; x >= 0; x--) rim.push((n - 1) * n + x);
  for (let y = n - 2; y > 0; y--) rim.push(y * n);
  const point = index => [(index % n) / (n - 1) * sizeKm - sizeKm / 2,
    model.height[index] * verticalScale / 1000,
    Math.floor(index / n) / (n - 1) * sizeKm - sizeKm / 2];
  let minHeight = Infinity;
  // A common floor closes the display solid; extensions below modeled columns are unclassified.
  for (let y = 0; y < n; y++) for (let x = 0; x <= cutIndex; x++) minHeight = Math.min(minHeight, model.height[y * n + x]);
  const baseY = (minHeight - depthM * depthScale) * verticalScale / 1000;
  const edges = model.subsurface?.depthEdgesM || [0, depthM];
  // Characteristic bed thickness of the modelled column, so the subsurface lamination is drawn at
  // the package's own bedding scale instead of one fixed period. Thickness-weighted harmonic mean,
  // matching how the surface shader derives its bedding frequency.
  const modeledThicknesses = [];
  for (let layer = 0; layer < Math.max(0, edges.length - 1); layer += 1) {
    const thickness = Number(edges[layer + 1]) - Number(edges[layer]);
    if (Number.isFinite(thickness) && thickness > 0.02) modeledThicknesses.push(thickness);
  }
  config.beddingSpacingM = modeledThicknesses.length
    ? modeledThicknesses.length / modeledThicknesses.reduce((sum, thickness) => sum + 1 / thickness, 0)
    : DEFAULT_BEDDING_SPACING_M;
  const layerTones=Array.from({length:edges.length-1},(_,layer)=>{
    const color=new THREE.Color(0,0,0);
    for(let y=0;y<8;y++)for(let x=0;x<8;x++){
      const sample=sampleStratumColor(model,(x+0.5)/8*(n-1),(y+0.5)/8*(n-1),layer);
      color.r+=sample.r/64;color.g+=sample.g/64;color.b+=sample.b/64;
    }
    return color;
  });
  const solid = geometryBuilder(), water = geometryBuilder();
  const unknown = unclassifiedTone();
  const seaY = seaLevel * verticalScale / 1000;
  const waterTop = new THREE.Color(0x5fa6b3), waterBottom = new THREE.Color(0x145064);
  for (let r = 0; r < rim.length; r++) {
    const ia = rim[r], ib = rim[(r + 1) % rim.length];
    const a = point(ia), b = point(ib);
    for (let layer = 0; layer < edges.length; layer++) {
      const top = edges[layer] * depthScale * verticalScale / 1000;
      const low = edges[layer + 1] * depthScale * verticalScale / 1000;
      const last = layer === edges.length - 1;
      const ca = last ? unknown : sampleStratumColor(model, ia % n, Math.floor(ia/n), layer).lerp(layerTones[layer],0.92);
      const cb = last ? unknown : sampleStratumColor(model, ib % n, Math.floor(ib/n), layer).lerp(layerTones[layer],0.92);
      solid.polygon([[a[0], a[1] - top, a[2]], [b[0], b[1] - top, b[2]],
        [b[0], last ? baseY : b[1] - low, b[2]], [a[0], last ? baseY : a[1] - low, a[2]]], [ca, cb, cb, ca],
        [edges[layer], edges[layer], last ? (b[1]-baseY)*1000/(depthScale*verticalScale) : edges[layer+1], last ? (a[1]-baseY)*1000/(depthScale*verticalScale) : edges[layer+1]]);
    }
    solid.polygon([[(config.cutX - sizeKm / 2) / 2, baseY, 0], [a[0], baseY, a[2]], [b[0], baseY, b[2]]], [unknown, unknown, unknown]);
    if (a[1] < seaY || b[1] < seaY) {
      let wa = a, wb = b;
      if (a[1] >= seaY || b[1] >= seaY) {
        const t = (seaY - a[1]) / (b[1] - a[1]);
        const shore = [a[0] + (b[0] - a[0]) * t, seaY, a[2] + (b[2] - a[2]) * t];
        if (a[1] >= seaY) wa = shore; else wb = shore;
      }
      water.polygon([[wa[0], seaY, wa[2]], [wb[0], seaY, wb[2]], wb, wa], [waterTop, waterTop, waterBottom, waterBottom]);
    }
  }
  return { solid: solid.finish(), waterSides: water.finish(), baseY, boundarySamples: rim.length, modeledLayerCount: edges.length - 1 };
}

export function sampleTerrainHeight(model, xKm, zKm) {
  const sizeKm = Number(model.sizeKm) || 128, n = model.n;
  const gx = (xKm / sizeKm + 0.5) * (n - 1), gy = (zKm / sizeKm + 0.5) * (n - 1);
  if (gx < 0 || gy < 0 || gx > n - 1 || gy > n - 1) return null;
  const x = Math.min(n - 2, Math.floor(gx)), y = Math.min(n - 2, Math.floor(gy));
  const fx = gx - x, fy = gy - y, i = y * n + x, h = model.height;
  return fx + fy <= 1 ? h[i] + fx * (h[i + 1] - h[i]) + fy * (h[i + n] - h[i])
    : h[i + n + 1] + (1 - fx) * (h[i + n] - h[i + n + 1]) + (1 - fy) * (h[i + 1] - h[i + n + 1]);
}

export function containsTerrainPoint(model, config, baseY, point) {
  if(caveContains(config.cave,point,0.015))return false;
  if (point.y <= baseY || (config.mode === "section" && point.x >= config.cutX)) return false;
  const height = sampleTerrainHeight(model, point.x, point.z);
  return height !== null && point.y < height * config.verticalScale / 1000;
}

export function constrainTerrainCamera(model, config, baseY, camera, target = null) {
  if (!containsTerrainPoint(model, config, baseY, camera.position)) return false;
  const surfaceY = sampleTerrainHeight(model, camera.position.x, camera.position.z) * config.verticalScale / 1000;
  const clearance = Math.max(0.00005, Math.min(0.02, config.sizeKm / (model.n - 1) * 0.005));
  // Resolve penetration locally: a shallow viewing ray can otherwise exit at a distant map edge.
  camera.position.y = surfaceY + clearance;
  if (target) camera.lookAt(target);
  return true;
}

export function underwaterFocus(model, config) {
  let best = null, score = 0;
  for (let i = 0; i < model.height.length; i++) {
    const depthM = config.seaLevel - model.height[i];
    const x = i % model.n, y = Math.floor(i / model.n);
    const centrality = 1 - Math.hypot(x / (model.n - 1) - 0.5, y / (model.n - 1) - 0.5);
    if (depthM > 0.5 && depthM * centrality > score) {
      score = depthM * centrality;
      best = { x: (x / (model.n - 1) - 0.5) * config.sizeKm, z: (y / (model.n - 1) - 0.5) * config.sizeKm,
        y: model.height[i] * config.verticalScale / 1000, depthKm: depthM * config.verticalScale / 1000 };
    }
  }
  return best;
}
