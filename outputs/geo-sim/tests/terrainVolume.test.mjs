import assert from "node:assert/strict";
import { registerHooks } from "node:module";
registerHooks({ resolve(s, c, next) { return next(s === "three" ? new URL("../vendor/three/three.module.js", import.meta.url).href : s, c); } });
const { buildTerrainVolume, volumeDisplayConfig, sampleTerrainHeight, containsTerrainPoint, constrainTerrainCamera } = await import("../src/terrainVolume.js");
const model = {
  n: 5, sizeKm: 0.4, cellSizeKm: 0.1,
  height: Float32Array.from({ length: 25 }, (_, i) => 10 + (i % 5) * 10),
  subsurface: { gridN: 5, columnCellCount: 25, layerCount: 2, depthEdgesM: new Float32Array([0, 5, 20]),
    lithologyCode: new Uint8Array(50).fill(3), groundwaterSaturation: new Float32Array(50).fill(0.7) }
};
const before = structuredClone(model);
for (const worldView of ["solid", "section"]) {
  const config = volumeDisplayConfig(model, { worldView, sectionPosition: 50, subsurfaceDisplayScale: 10, verticalScale: 2, seaLevel: 30 });
  const volume = buildTerrainVolume(model, config);
  const edges = new Map();
  const recordTriangle = (a, b, c) => {
    const ab = b.map((v, i) => v - a[i]), ac = c.map((v, i) => v - a[i]);
    const area = Math.hypot(ab[1]*ac[2]-ab[2]*ac[1], ab[2]*ac[0]-ab[0]*ac[2], ab[0]*ac[1]-ab[1]*ac[0]);
    if (area < 1e-10) return;
    const keys = [a, b, c].map(p => p.map(v => v.toFixed(5)).join(','));
    for (let j = 0; j < 3; j++) {
      const key = [keys[j], keys[(j + 1) % 3]].sort().join('|');
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  };
  const position = volume.solid.getAttribute('position');
  const indices = volume.solid.index.array;
  for (let i = 0; i < indices.length; i += 3) recordTriangle(...Array.from(indices.slice(i, i + 3), index =>
    [position.getX(index), position.getY(index), position.getZ(index)]));
  const top = (x, y) => [(x / 4 - 0.5) * 0.4, model.height[y * 5 + x] * 2 / 1000, (y / 4 - 0.5) * 0.4];
  for (let y = 0; y < 4; y++) for (let x = 0; x < config.cutIndex; x++) {
    recordTriangle(top(x,y),top(x,y+1),top(x+1,y));
    recordTriangle(top(x,y+1),top(x+1,y+1),top(x+1,y));
  }
  assert.ok([...edges.values()].every(count => count === 2), 'terrain top, walls, section and floor must form a closed boundary');
  assert.equal(config.cutIndex, worldView === "section" ? 2 : 4);
  assert.ok(volume.solid.getAttribute("position").count > 0);
  assert.ok(volume.waterSides.getAttribute("position").count > 0);
  for (const geometry of [volume.solid, volume.waterSides]) {
    for (const value of geometry.getAttribute("position").array) assert.ok(Number.isFinite(value));
    geometry.computeBoundingBox();
    assert.ok(geometry.boundingBox.max.x <= config.cutX + 1e-7);
    geometry.dispose();
  }
  assert.equal(volume.baseY, (10 - 20 * 10) * 2 / 1000);
}
assert.ok(Math.abs(sampleTerrainHeight(model, -0.15, 0) - 15) < 1e-10);
assert.equal(sampleTerrainHeight(model, 0.3, 0), null);
assert.deepEqual(model, before);
const THREE = await import('three');
const { SceneVolume } = await import('../src/sceneVolume.js');
const scene = new THREE.Scene(), manager = new SceneVolume(scene);
assert.equal(manager.sky.geometry.getAttribute('position').count, 3, 'sky must use a full-screen primitive independent of near/far clipping');
const borrowed = new THREE.PlaneGeometry(0.4, 0.4, 4, 4);
borrowed.rotateX(-Math.PI/2);
const terrain = new THREE.Mesh(borrowed, new THREE.MeshStandardMaterial());
let sourceDisposed = false;
borrowed.addEventListener('dispose', () => { sourceDisposed = true; });
const params = { seaLevel: 30, worldView: 'section', verticalScale: 1, subsurfaceDisplayScale: 10 };
manager.rebuild(model, params, [{mesh: terrain}], 'landscape');
manager.applyClipping([terrain]);
assert.equal(terrain.material.clippingPlanes[0].distanceToPoint(new THREE.Vector3(0.2, 0, 0)) < 0, true);
manager.rebuild(model, {...params, worldView:'solid'}, [{mesh: terrain}], 'landscape');
const rock = manager.group.children.find(mesh => mesh.name === 'modeled columns and unclassified closure');
assert.ok(rock.material.userData.inspectionFill > 0, 'underside needs a geological inspection fill');
manager.applyClipping([terrain]);
assert.equal(terrain.material.clippingPlanes, null);
const camera = new THREE.PerspectiveCamera(50, 1, 0.00001, 10);
camera.position.set(-0.15, 0.025, 0);
manager.update(camera, 1);
assert.equal(manager.stats.underwater, true);
assert.equal(manager.sky.visible, false);
assert.equal(manager.waterMeshes[0].material.userData.waterUniforms.waterTime.value, 1);
camera.position.y = 0.04;
manager.update(camera, 2);
assert.equal(manager.stats.underwater, false);
assert.equal(manager.sky.visible, true);
camera.lookAt(0, 0.2, 0);
camera.updateMatrixWorld();
manager.sky.onBeforeRender(null, scene, camera);
assert.deepEqual(manager.sky.material.uniforms.skyProjectionInverse.value, camera.projectionMatrixInverse);
assert.deepEqual(manager.sky.material.uniforms.skyRotation.value, new THREE.Matrix3().setFromMatrix4(camera.matrixWorld));
assert.equal(manager.sky.material.depthTest, false);
assert.equal(manager.sky.material.depthWrite, false);
const config = manager.config;
const base = manager.baseY;
for (const [position, target] of [
  [[0,0,0],[0,0.08,0]], [[0,0,0],[-0.1,0,0]], [[0,-0.1,0],[0,-0.2,0]], [[0,0,0],[0,0,0]]
]) {
  camera.position.fromArray(position);
  camera.lookAt(...target);
  const orbitTarget = new THREE.Vector3(...target);
  const oldTarget = orbitTarget.clone();
  assert.equal(containsTerrainPoint(model, config, base, camera.position), true);
  assert.equal(constrainTerrainCamera(model, config, base, camera, orbitTarget), true);
  assert.equal(containsTerrainPoint(model, config, base, camera.position), false, 'camera cannot remain inside opaque rock');
  assert.equal(constrainTerrainCamera(model, config, base, camera, orbitTarget), false, 'camera correction must settle without oscillation');
  assert.deepEqual(orbitTarget, oldTarget);
}
const cutConfig = volumeDisplayConfig(model, {...params, worldView:'section'});
assert.equal(containsTerrainPoint(model, cutConfig, base, new THREE.Vector3(0.1, 0, 0)), false, 'cut-away air must remain navigable');
assert.equal(containsTerrainPoint(model, config, base, new THREE.Vector3(-0.15, 0.025, 0)), false, 'water above the seabed is not rock');
assert.equal(containsTerrainPoint(model, config, base, new THREE.Vector3(0, base - 0.05, 0)), false);
assert.deepEqual(model, before);
manager.setVisibility(params, 'slope');
assert.equal(manager.waterMeshes[0].visible, false);
manager.dispose();
assert.equal(sourceDisposed, false, 'water disposal must not release shared terrain buffers');
assert.equal(scene.children.length, 0);
borrowed.dispose(); terrain.material.dispose();
console.log("Closed volume, clipping, water boundaries, immersion, disposal and data isolation passed");
