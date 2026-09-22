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
assert.equal(left.mesh.geometry.getAttribute("terrainStructure").array.BYTES_PER_ELEMENT, 1);
// The structure attribute is uploaded normalized, so its bytes must be exactly what the packer
// produced. BufferAttribute.setXYZW normalizes its arguments, and passing packed bytes through it
// scales them again and wraps the byte array, which silently fed the shader (256 - byte) / 255 and
// drew competent bedrock as loose material. Compare the shipped buffer against the packer instead
// of trusting it to be written correctly.
{
  const { surfaceGeomorphology: derive, packTerrainStructure: pack, MATERIAL_CLASS_CODE } = await import("../src/terrainAppearance.js");
  const shipped = left.mesh.geometry.getAttribute("terrainStructure");
  assert.equal(shipped.normalized, true, "the structure attribute is expected to be uploaded normalized");
  const model = renderer.model;
  for (const [gx, gy] of [[0, 0], [32, 17], [64, 40], [128, 64]]) {
    const vertex = (gy - left.y0) * (left.segX + 1) + (gx - left.x0);
    const expected = pack(model, derive(model, renderer.params, gy * model.n + gx));
    const actual = Array.from(shipped.array.slice(vertex * 4, vertex * 4 + 4));
    assert.deepEqual(actual, expected,
      `the shipped structure bytes must equal the packer's output at ${gx},${gy} (shipped ${actual} vs packed ${expected})`);
    assert.ok(actual.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255));
  }
  // The class byte must land on the side of the shader's threshold that its class means.
  assert.ok(MATERIAL_CLASS_CODE.rock / 255 > 0.8 && MATERIAL_CLASS_CODE.unconsolidated / 255 < 0.8,
    "the material classes must straddle the shader's step(0.8, ...) threshold");
}

// Document the hazard the write path exists to avoid. BufferAttribute.normalize() scales an argument
// by the array's normalisation factor, so handing packed bytes to setXYZW on a normalized byte
// attribute multiplies them a second time and the byte array then wraps. This is asserted rather
// than assumed: if a future three release stops behaving this way, this test says so instead of the
// buffer silently decoding negated again.
{
  const normalized = new THREE.BufferAttribute(new Uint8Array(4), 4, true);
  normalized.setXYZW(0, 99, 131, 231, 255);
  assert.notDeepEqual(Array.from(normalized.array), [99, 131, 231, 255],
    "setXYZW on a normalized byte attribute must not be byte-preserving; the write path must not use it");
  const direct = new THREE.BufferAttribute(new Uint8Array(4), 4, true);
  direct.array.set([99, 131, 231, 255]);
  assert.deepEqual(Array.from(direct.array), [99, 131, 231, 255],
    "writing the packed bytes straight into the array must be exact");
}
assert.equal(left.mesh.material.userData.terrainSurface.uniforms.geoSurfaceEnabled.value, 1);
assert.equal(left.mesh.material.userData.terrainSurface.version, 3);
assert.ok(left.mesh.material.userData.terrainSurface.wavelengthsM.includes(0.002));
assert.deepEqual(left.mesh.material.userData.terrainSurface.structureRangesM, { jointSpacing: [0.02, 20], bedThickness: [0.01, 50] });
const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
left.mesh.material.onBeforeCompile(shader);
assert.match(shader.fragmentShader, /geoFilteredNoise\(p \+ 233.0, 0.002, footprint\)/);
assert.match(shader.fragmentShader, /geoPerturbNormal\(normal, geoHeight\)/);
assert.match(shader.vertexShader, /vGeoStructure = terrainStructure/);
assert.match(shader.fragmentShader, /geoUnpackLog\(vGeoStructure\.x, GEO_JOINT_SPACING_RANGE_M\)/);
assert.match(shader.fragmentShader, /geoUnpackLog\(vGeoStructure\.y, GEO_BED_THICKNESS_RANGE_M\)/);
const scientificBefore = structuredClone(renderer.model);
renderer.viewMode = "slope";
renderer.buildTerrainMesh();
assert.equal(left.mesh.material.userData.terrainSurface.uniforms.geoSurfaceEnabled.value, 0);
const expectedColor = colorForValue(renderer.model, renderer.params, "slope", 0);
const actualColor = left.mesh.geometry.getAttribute("color");
expectedColor.forEach((value, channel) => assert.ok(Math.abs(actualColor.array[channel] - value / 255) < 1e-7));
assert.deepEqual(renderer.model, scientificBefore);
for (const tile of renderer.terrainTiles) { tile.mesh.geometry.dispose(); tile.mesh.material.dispose(); }
{
  const { sampleTerrainHeight } = await import('../src/terrainVolume.js');
  const r = Object.create(TerrainRenderer.prototype);
  r.model = { n: 2, sizeKm: 0.1, cellSizeKm: 0.1, height: new Float32Array([10, 80, 90, 20]), slope: new Float32Array(4) };
  r.params = { seaLevel: 0, verticalScale: 2 };
  r.scene = new THREE.Scene(); r.terrainTiles = []; r.viewMode = 'landscape';
  const verify = () => {
    r.scene.updateMatrixWorld(true);
    for (const [x, z] of [[0, 0], [-0.025, 0.015], [0.025, -0.015], [-0.02, -0.01]]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(x, 1, z), new THREE.Vector3(0, -1, 0));
      const hits = ray.intersectObject(r.terrainTileGroup, true);
      assert.ok(hits.length, 'triangles must face upward');
      assert.ok(Math.abs(hits[0].point.y - sampleTerrainHeight(r.model, x, z) * 0.002) < 1e-7,
        'rendered surface, river sampling and camera collision must agree');
    }
  };
  r.buildTerrainMesh(); verify();
  assert.equal(sampleTerrainHeight(r.model, 0, 0), 15);
  const oldIndex = r.terrainTiles[0].mesh.geometry.index.array.slice();
  r.model.height.set([100, 10, 20, 100]);
  r.buildTerrainMesh({ x0: 0, y0: 0, x1: 1, y1: 1 }); verify();
  assert.equal(sampleTerrainHeight(r.model, 0, 0), 15);
  assert.notDeepEqual(r.terrainTiles[0].mesh.geometry.index.array, oldIndex, 'height edits must retriangulate existing tiles');
  for (const tile of r.terrainTiles) { tile.mesh.geometry.dispose(); tile.mesh.material.dispose(); }
}
console.log("Terrain appearance, shared tile normals, dirty updates, analytical isolation and packed buffer tests passed");
