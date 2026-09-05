import * as THREE from "three";

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export function volumeDisplayConfig(model, params = {}) {
  const sizeKm = Number(model.sizeKm) || 128;
  const mode = ["solid", "section", "underwater"].includes(params.worldView) ? params.worldView : "solid";
  const cutIndex = mode === "section" && model.n > 2
    ? clamp(Math.round((Number(params.sectionPosition) || 50) / 100 * (model.n - 1)), 1, model.n - 2)
    : model.n - 1;
  return {
    mode, sizeKm, cutIndex, cutX: (cutIndex / (model.n - 1) - 0.5) * sizeKm,
    verticalScale: Number(params.verticalScale) || 1,
    depthScale: clamp(Number(params.subsurfaceDisplayScale) || 20, 1, 100),
    seaLevel: Number(params.seaLevel) || 0,
    depthM: Number(model.subsurface?.depthEdgesM?.[model.subsurface.layerCount]) || Number(params.subsurfaceDepthM) || 240
  };
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
function layerColor(model, surfaceIndex, layer) {
  const volume = model.subsurface, column = subsurfaceColumnIndex(model, surfaceIndex);
  if (column < 0 || layer < 0) return new THREE.Color(0x454b50);
  const voxel = layer * volume.columnCellCount + column;
  const color = new THREE.Color(LITHOLOGY[volume.lithologyCode?.[voxel] || 0] || LITHOLOGY[0]);
  const saturation = clamp(Number(volume.groundwaterSaturation?.[voxel]) || 0, 0, 1);
  color.lerp(new THREE.Color(0x447b88), saturation * 0.28);
  return color;
}

function geometryBuilder() {
  const positions = [], colors = [], indices = [];
  return {
    polygon(points, tones) {
      const start = positions.length / 3;
      points.forEach((point, i) => { positions.push(...point); colors.push(tones[i].r, tones[i].g, tones[i].b); });
      for (let i = 1; i < points.length - 1; i++) indices.push(start, start + i, start + i + 1);
    },
    finish() {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
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
  const solid = geometryBuilder(), water = geometryBuilder();
  const unknown = new THREE.Color(0x454b50);
  const seaY = seaLevel * verticalScale / 1000;
  const waterTop = new THREE.Color(0x5fa6b3), waterBottom = new THREE.Color(0x145064);
  for (let r = 0; r < rim.length; r++) {
    const ia = rim[r], ib = rim[(r + 1) % rim.length];
    const a = point(ia), b = point(ib);
    for (let layer = 0; layer < edges.length; layer++) {
      const top = edges[layer] * depthScale * verticalScale / 1000;
      const low = edges[layer + 1] * depthScale * verticalScale / 1000;
      const last = layer === edges.length - 1;
      const ca = last ? unknown : layerColor(model, ia, layer);
      const cb = last ? unknown : layerColor(model, ib, layer);
      solid.polygon([[a[0], a[1] - top, a[2]], [b[0], b[1] - top, b[2]],
        [b[0], last ? baseY : b[1] - low, b[2]], [a[0], last ? baseY : a[1] - low, a[2]]], [ca, cb, cb, ca]);
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
