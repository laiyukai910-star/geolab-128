import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === "three"
      ? new URL("../vendor/three/three.module.js", import.meta.url).href
      : specifier, context);
  }
});
const { createProceduralGeometry, PROCEDURAL_ASSET_KINDS } = await import("../src/proceduralAssets.js");
const THREE = await import("three");
const { createFoliageGeometry } = await import("../src/foliageGeometry.js");
const { FoliageInstances } = await import("../src/foliageInstances.js");

for (const kind of PROCEDURAL_ASSET_KINDS) {
  const geometry = createProceduralGeometry(kind, "high");
  const position = geometry.getAttribute("position");
  assert.ok(position.count > 0, kind);
  for (const value of position.array) assert.ok(Number.isFinite(value), kind);
  for (const index of geometry.index?.array || []) assert.ok(index >= 0 && index < position.count, kind);
  geometry.dispose();
}

for (const kind of ["process-tank", "setback-tower", "fluted-trunk"]) {
  const geometry = createProceduralGeometry(kind, "ultra");
  assert.ok(geometry.index, `${kind}: assemblies must retain indexed surfaces`);
  assert.ok(geometry.getAttribute("position").count < geometry.index.count);
  for (const value of geometry.getAttribute("normal").array) assert.ok(Number.isFinite(value));
  geometry.dispose();
}

for (const kind of ["broadleaf-canopy", "layered-conifer"]) {
  let lastCount = 0;
  for (const quality of ["high", "ultra", "exhaustive"]) {
    const geometry = createProceduralGeometry(kind, quality, 1);
    const repeat = createProceduralGeometry(kind, quality, 1);
    const other = createProceduralGeometry(kind, quality, 2);
    const positions = geometry.getAttribute("position");
    const colors = geometry.getAttribute("color");
    assert.ok(geometry.userData.foliage?.leafCount >= 200, `${kind}: individual foliage required`);
    assert.ok(geometry.userData.foliage.branchCount >= 20);
    assert.ok(geometry.userData.foliage.leafCount > lastCount);
    lastCount = geometry.userData.foliage.leafCount;
    assert.equal(colors.count, positions.count);
    assert.equal(geometry.getAttribute("normal").count, positions.count);
    assert.deepEqual(positions.array, repeat.getAttribute("position").array);
    assert.notDeepEqual(positions.array, other.getAttribute("position").array);
    for (const value of positions.array) assert.ok(Number.isFinite(value) && Math.abs(value) < 1.2);
    for (const value of colors.array) assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
    const normals = geometry.getAttribute("normal");
    for (let i = 0; i < normals.count; i++) {
      assert.ok(Math.abs(Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i)) - 1) < 1e-5);
    }
    for (const item of [geometry, repeat, other]) item.dispose();
  }
}
const geometry = createProceduralGeometry("broadleaf-canopy", "high");
const proxy = createFoliageGeometry(false, "distant");
assert.ok(proxy.index.count < geometry.index.count / 10);
const material = new THREE.MeshStandardMaterial();
const transforms = Array.from({ length: 4 }, (_, i) => ({ x: i * 0.2, y: 0, z: 0, sx: 1, sy: 1, sz: 1 }));
const lod = new FoliageInstances(geometry, proxy, material, transforms, 0x448833, 2);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
camera.position.set(0, 0, 3);camera.updateMatrixWorld();lod.updateMatrixWorld();lod.update(camera);
assert.equal(lod.near.count, 2, "near detail must obey the per-batch limit");
assert.equal(lod.near.count + lod.far.count, transforms.length);
camera.position.z = 500;camera.updateMatrixWorld();lod.update(camera);
assert.equal(lod.near.count, 0);
assert.equal(lod.far.count, transforms.length);
for (const item of [geometry, proxy, material]) item.dispose();
console.log("Indexed assembly, botanical foliage and distance LOD tests passed");
