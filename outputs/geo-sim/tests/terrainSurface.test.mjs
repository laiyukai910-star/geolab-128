import assert from "node:assert/strict";
import { naturalTerrainColor, terrainSurfaceWeights, terrainVertexNormal } from "../src/terrainAppearance.js";

const model = {
  n: 5, cellSizeKm: 0.01,
  height: Float32Array.from({ length: 25 }, (_, i) => 100 + (i % 5) * 2 + Math.floor(i / 5) * 3),
  slope: new Float32Array(25).fill(25),
  wetnessIndex: new Float32Array(25).fill(8),
  surface: { vegetation: new Float32Array(25).fill(0.6), imperviousFraction: new Float32Array(25).fill(0.1) }
};
const before = structuredClone(model);
for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
  const normal = terrainVertexNormal(model, x, y, 2);
  const length = Math.hypot(-0.4, 1, -0.6);
  assert.ok(Math.abs(normal[0] + 0.4 / length) < 1e-7);
  assert.ok(Math.abs(normal[1] - 1 / length) < 1e-7);
  assert.ok(Math.abs(normal[2] + 0.6 / length) < 1e-7);
  const weights = terrainSurfaceWeights(model, { seaLevel: 0 }, y * 5 + x);
  assert.ok(weights.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
  assert.ok(weights[0] + weights[1] <= 1);
  assert.ok(naturalTerrainColor(model, { seaLevel: 0 }, y * 5 + x).every(value => value >= 0 && value <= 255));
}
assert.deepEqual(model, before, "render derivation must not mutate model arrays");
assert.deepEqual(terrainSurfaceWeights(model, { seaLevel: 200 }, 0), [0, 0, 0, 0]);
const steep = { ...model, slope: new Float32Array(25).fill(65) };
assert.ok(terrainSurfaceWeights(steep, { seaLevel: 0 }, 0)[0] > terrainSurfaceWeights(model, { seaLevel: 0 }, 0)[0]);
const flat = { ...model, height: new Float32Array(25).fill(50) };
assert.deepEqual(terrainVertexNormal(flat, 2, 2, 1), [-0, 1, -0]);

const { registerHooks } = await import("node:module");
registerHooks({
  resolve(specifier, context, nextResolve) {
    const local = specifier === "three" ? "../vendor/three/three.module.js"
      : specifier.startsWith("three/addons/") ? `../vendor/three/addons/${specifier.slice(13)}` : null;
    return nextResolve(local ? new URL(local, import.meta.url).href : specifier, context);
  }
});
const THREE = await import("three");
const { TerrainRenderer } = await import("../src/terrainRenderer.js");
const { colorForValue } = await import("../src/geoEngine.js");
const renderer = Object.create(TerrainRenderer.prototype);
const n = 257;
renderer.model = {
  n, sizeKm: 2.56, cellSizeKm: 0.01,
  height: Float32Array.from({ length: n * n }, (_, i) => 100 + (i % n) * 0.5 + Math.floor(i / n)),
  slope: new Float32Array(n * n).fill(10)
};
renderer.params = { seaLevel: 0, verticalScale: 2 };
renderer.scene = new THREE.Scene();
renderer.terrainTiles = [];
renderer.viewMode = "landscape";
renderer.buildTerrainMesh();
assert.equal(renderer.terrainTiles.length, 4);
const [left, right] = renderer.terrainTiles;
const seamNormal = tile => {
  const vertex = (64 - tile.y0) * (tile.segX + 1) + 128 - tile.x0;
  return Array.from(tile.mesh.geometry.getAttribute("normal").array.slice(vertex * 3, vertex * 3 + 3));
};
assert.deepEqual(seamNormal(left), seamNormal(right));
const oldNormal = seamNormal(right);
renderer.model.height[64 * n + 127] = 2000;
renderer.buildTerrainMesh({ x0: 127, y0: 64, x1: 127, y1: 64 });
assert.equal(renderer.lastTerrainTileStats.touchedTileCount, 2, "height edit must update adjacent-tile normals");
assert.deepEqual(seamNormal(left), seamNormal(right));
assert.notDeepEqual(seamNormal(right), oldNormal);
assert.equal(left.mesh.geometry.boundingBox.max.y, 4, "edit must refresh frustum bounds");
assert.equal(left.mesh.geometry.getAttribute("terrainSurface").array.BYTES_PER_ELEMENT, 1);
assert.equal(left.mesh.material.userData.terrainSurface.uniforms.geoSurfaceEnabled.value, 1);
const scientificBefore = structuredClone(renderer.model);
renderer.viewMode = "slope";
renderer.buildTerrainMesh();
assert.equal(left.mesh.material.userData.terrainSurface.uniforms.geoSurfaceEnabled.value, 0);
const expectedColor = colorForValue(renderer.model, renderer.params, "slope", 0);
const actualColor = left.mesh.geometry.getAttribute("color");
expectedColor.forEach((value, channel) => assert.ok(Math.abs(actualColor.array[channel] - value / 255) < 1e-7));
assert.deepEqual(renderer.model, scientificBefore);
for (const tile of renderer.terrainTiles) { tile.mesh.geometry.dispose(); tile.mesh.material.dispose(); }
console.log("Terrain appearance, shared tile normals, dirty updates, analytical isolation and packed buffer tests passed");
