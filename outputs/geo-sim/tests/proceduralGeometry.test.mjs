import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === "three"
      ? new URL("../vendor/three/three.module.js", import.meta.url).href
      : specifier.startsWith("three/addons/")
        ? new URL(`../vendor/three/addons/${specifier.slice(13)}`, import.meta.url).href
        : specifier, context);
  }
});
const { createProceduralGeometry, PROCEDURAL_ASSET_KINDS } = await import("../src/proceduralAssets.js");
const THREE = await import("three");
const { TerrainRenderer } = await import("../src/terrainRenderer.js");
const { createFoliageGeometry } = await import("../src/foliageGeometry.js");
const { FoliageInstances } = await import("../src/foliageInstances.js");

for (const kind of PROCEDURAL_ASSET_KINDS) {
  const geometry = createProceduralGeometry(kind, "high");
  const position = geometry.getAttribute("position");
  const color = geometry.getAttribute("color");
  assert.equal(color?.count, position.count, `${kind}: vertex-color materials require a complete color buffer`);
  for (const value of color.array) assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, kind);
  assert.ok(position.count > 0, kind);
  for (const value of position.array) assert.ok(Number.isFinite(value), kind);
  for (const index of geometry.index?.array || []) assert.ok(index >= 0 && index < position.count, kind);
  geometry.dispose();
}

for (const kind of ["fractured-rock", "talus-cluster"]) {
  let vertices = 0;
  for (const quality of ["high", "ultra", "exhaustive"]) {
    const geometry = createProceduralGeometry(kind, quality);
    assert.ok(geometry.attributes.position.count > vertices, 'mineral refinement must add surface detail');
    vertices = geometry.attributes.position.count;
    const tones = new Set(Array.from(geometry.attributes.color.array, value => value.toFixed(3)));
    assert.ok(tones.size > 20, 'rock needs intrinsic mineral variation');
    const size = geometry.boundingBox.getSize(new THREE.Vector3());
    assert.ok(size.toArray().every(value => Math.abs(value - 1) < 1e-5), 'instance dimensions must match normalized mineral bounds');
    geometry.dispose();
  }
}

const detailModel = { n: 17, sizeKm: 4, cellSizeKm: 0.25,
  height: Float32Array.from({length: 289}, (_, i) => 400 + (i % 17) * 15),
  slope: new Float32Array(289).fill(40), temperature: new Float32Array(289).fill(-3),
  terrainDiagnostics: {roughness: new Float32Array(289).fill(12)},
  wetnessIndex: new Float32Array(289).fill(12), riverSegments: [{from: 0, to: 1, order: 3}] };
const snapshot = structuredClone(detailModel);
const detailRenderer = Object.create(TerrainRenderer.prototype);
Object.assign(detailRenderer, {model: detailModel, params: {terrainDetail3DEnabled: true, seed: 42, seaLevel: 0, verticalScale: 2}, terrainDetailGroup: new THREE.Group()});
detailRenderer.buildTerrainDetails();
assert.ok(detailRenderer.terrainDetail3DStats.rockCount > 0);
assert.equal(detailRenderer.terrainDetail3DStats.wetMarginCount, 0, 'do not duplicate river/wetness surfaces');
assert.ok(detailRenderer.terrainDetailGroup.children.every(mesh => mesh.userData.assetKind !== 'wetland-ribbon'));
for (const mesh of detailRenderer.terrainDetailGroup.children) {
  assert.equal(mesh.geometry.attributes.color.count, mesh.geometry.attributes.position.count);
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, matrix); matrix.decompose(position, rotation, scale);
    const surfaceY = (400 + (position.x / 4 + 0.5) * 16 * 15) * 2 / 1000;
    assert.ok(Math.abs(position.y - surfaceY - scale.y * 0.36) < 1e-6, 'jittered details must use local terrain elevation');
    assert.ok(scale.x <= 0.071 && scale.y <= 0.013 && scale.z <= 0.051, 'regional cells must not inflate local models');
  }
  mesh.geometry.dispose(); mesh.material.dispose();
}
assert.deepEqual(detailModel, snapshot);
detailRenderer.rivers = new THREE.Group();
for (const name of ['subsurfaceGroup','windGroup','wildlifeGroup','hazardGroup']) detailRenderer[name] = new THREE.Group();
for (const visible of [false, true]) {
  detailRenderer.params.water3DEnabled = visible;
  detailRenderer.applySceneVisibility();
  assert.equal(detailRenderer.rivers.visible, visible, 'one water control must also control river visibility');
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
    assert.ok(positions.count > geometry.userData.foliage.leafCount * 12, "near leaves need curved multi-row surfaces");
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
const detailedLod = new FoliageInstances(geometry, proxy, material, transforms, 0x448833, 4, 10);
camera.position.z = 130; camera.updateMatrixWorld(); lod.update(camera);
detailedLod.updateMatrixWorld(); detailedLod.update(camera);
assert.equal(lod.near.count, 0, "high quality retains its original threshold");
assert.equal(detailedLod.near.count, 4, "desktop detail threshold must select more visible trees");
assert.equal(detailedLod.near.count + detailedLod.far.count, transforms.length);
for (const item of [geometry, proxy, material]) item.dispose();
console.log("Indexed assembly, botanical foliage and distance LOD tests passed");
