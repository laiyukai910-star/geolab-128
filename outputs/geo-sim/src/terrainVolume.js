import * as THREE from "three";
import { caveContains } from "./caveField.js";

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

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
    depthM: Number(model.subsurface?.depthEdgesM?.[model.subsurface.layerCount]) || Number(params.subsurfaceDepthM) || 240
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

const LITHOLOGY = [0x626569, 0x9a7048, 0x897b5c, 0xb79b61, 0x777b79, 0x5f666b, 0x725f59];
const UNCLASSIFIED_COLOR = 0x72787e;
const LITHOLOGY_COLORS = LITHOLOGY.map(hex => new THREE.Color(hex));
const WET_ROCK = new THREE.Color(0x59615e);
function splineWeights(t) {
  return [(1-t)**3/6, (3*t**3-6*t*t+4)/6, (-3*t**3+3*t*t+3*t+1)/6, t**3/6];
}

export function sampleStratumColor(model, surfaceX, surfaceY, layer) {
  const volume = model.subsurface;
  if (!volume?.columnCellCount || layer < 0) return new THREE.Color(UNCLASSIFIED_COLOR);
  const grid = volume.columnCellCount === model.n * model.n ? model.n : volume.gridN;
  const x = surfaceX / (model.n - 1) * (grid - 1), y = surfaceY / (model.n - 1) * (grid - 1);
  const ix = Math.floor(x), iy = Math.floor(y), wx = splineWeights(x-ix), wy = splineWeights(y-iy);
  const color = new THREE.Color(0,0,0);
  let saturation = 0;
  // Reconstruct display colors, never interpolate categorical IDs or rewrite scientific columns.
  for (let j=0;j<4;j++) for (let i=0;i<4;i++) {
    const voxel = layer * volume.columnCellCount + clamp(iy+j-1,0,grid-1)*grid + clamp(ix+i-1,0,grid-1);
    const weight = wx[i]*wy[j];
    const tone = LITHOLOGY_COLORS[volume.lithologyCode?.[voxel]] || LITHOLOGY_COLORS[0];
    color.r += tone.r*weight; color.g += tone.g*weight; color.b += tone.b*weight;
    saturation += clamp(Number(volume.groundwaterSaturation?.[voxel]) || 0,0,1)*weight;
  }
  return color.lerp(WET_ROCK, saturation*0.12);
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
  const layerTones=Array.from({length:edges.length-1},(_,layer)=>{
    const color=new THREE.Color(0,0,0);
    for(let y=0;y<8;y++)for(let x=0;x<8;x++){
      const sample=sampleStratumColor(model,(x+0.5)/8*(n-1),(y+0.5)/8*(n-1),layer);
      color.r+=sample.r/64;color.g+=sample.g/64;color.b+=sample.b/64;
    }
    return color;
  });
  const solid = geometryBuilder(), water = geometryBuilder();
  const unknown = new THREE.Color(UNCLASSIFIED_COLOR);
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
  const origin = camera.position.clone();
  const direction = target ? origin.clone().sub(target) : camera.getWorldDirection(new THREE.Vector3()).negate();
  if (direction.lengthSq() < 1e-12) direction.set(0, 1, 0);
  direction.normalize();
  const point = new THREE.Vector3();
  let low = 0, high = 2 * (config.sizeKm + Math.abs(baseY) + Math.abs(origin.y) + 1);
  // Pull back along the viewing ray, preserving the orbit target and section orientation.
  for (let i = 0; i < 28; i++) {
    const distance = (low + high) * 0.5;
    point.copy(origin).addScaledVector(direction, distance);
    if (containsTerrainPoint(model, config, baseY, point)) low = distance; else high = distance;
  }
  const clearance = Math.max(0.00005, Math.min(0.02, config.sizeKm / (model.n - 1) * 0.005));
  camera.position.copy(origin).addScaledVector(direction, high + clearance);
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
