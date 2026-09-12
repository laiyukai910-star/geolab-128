import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return next(s==='three'?new URL('../vendor/three/three.module.js',import.meta.url).href:s.startsWith('three/addons/')?new URL(`../vendor/three/addons/${s.slice(13)}`,import.meta.url).href:s,c)}});
const THREE=await import('three');
const {ScannedAssetLibrary}=await import('../src/scannedAssets.js');
const {ScannedRockInstances,referenceRockMatrix}=await import('../src/scannedRockInstances.js');
const {TerrainRenderer}=await import('../src/terrainRenderer.js');
for(const [name,triangles] of [['detail',12416],['distant',2730]]){
  const bytes=await readFile(new URL(`../assets/scanned/rock-09-${name}.glb`,import.meta.url));
  assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
  const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  assert.ok(json.buffers.every(buffer=>!buffer.uri));assert.ok((json.images||[]).every(image=>!image.uri&&image.bufferView!==undefined));
  assert.equal(json.accessors[json.meshes[0].primitives[0].indices].count/3,triangles);
  if(name==='detail'){assert.ok(json.materials[0].normalTexture);assert.ok(json.materials[0].pbrMetallicRoughness.baseColorTexture);}
}
function payload(textured=true){
  const scene=new THREE.Scene(),geometry=new THREE.BoxGeometry(1,0.4,0.8),material=new THREE.MeshStandardMaterial();
  if(textured){material.map=new THREE.Texture();material.normalMap=new THREE.Texture();}
  scene.add(new THREE.Mesh(geometry,material));return {scene};
}
let calls=0;
const library=new ScannedAssetLibrary(async url=>{calls++;return payload(url.includes('detail'))});
const [a,b]=await Promise.all([library.loadRock(),library.loadRock()]);assert.equal(a,b);assert.equal(calls,2);
assert.ok(a.geometry.userData.sharedGeometryCacheOwned);assert.ok(a.material.userData.scannedLibraryOwned);
for(const normal of [[0,1,0],[-0.6,0.8,0]]){
  const source={x:3,y:12,z:4,surfaceY:10,surfaceNormal:normal,sx:2,sy:8,sz:3,ry:0.72};
  const matrix=referenceRockMatrix(source,a.geometry.boundingBox);
  const bottom=new THREE.Vector3(0,a.geometry.boundingBox.min.y,0).applyMatrix4(matrix);
  const depth=bottom.sub(new THREE.Vector3(source.x,source.surfaceY,source.z)).dot(new THREE.Vector3(...normal));
  const thickness=a.geometry.boundingBox.max.y-a.geometry.boundingBox.min.y;
  assert.ok(Math.abs(depth+thickness*2*0.12)<1e-7,'scan base must embed relative to actual thickness, not old primitive height');
  const up=new THREE.Vector3(0,1,0).transformDirection(matrix);
  assert.ok(up.distanceTo(new THREE.Vector3(...normal))<1e-7,'scan must follow the local terrain normal');
}
const source=[{x:0,y:0,z:0,sx:1,sy:2,sz:0.8,color:0x777777}];
const geometry=new THREE.BoxGeometry(1,1,1),material=new THREE.MeshStandardMaterial();
material.clippingPlanes=[new THREE.Plane(new THREE.Vector3(1,0,0),0)];
const lod=new ScannedRockInstances(geometry,material,source,0x777777,library);
const camera=new THREE.PerspectiveCamera(45,1,0.01,10000);camera.position.z=1000;camera.updateMatrixWorld();lod.updateMatrixWorld();lod.update(camera);
assert.equal(lod.loadAttempted,false,'overview must not load photographic assets');
camera.position.z=2;camera.updateMatrixWorld();lod.update(camera);await new Promise(r=>setTimeout(r,0));lod.update(camera);
assert.equal(lod.referenceReady,true);assert.equal(lod.near.count,1);assert.equal(lod.near.count+lod.far.count,source.length);
assert.equal(lod.near.material.clippingPlanes,material.clippingPlanes);
const transform=new THREE.Matrix4(),scale=new THREE.Vector3();lod.near.getMatrixAt(0,transform);transform.decompose(new THREE.Vector3(),new THREE.Quaternion(),scale);
assert.ok(Math.abs(scale.x-scale.y)<1e-7&&Math.abs(scale.y-scale.z)<1e-7,'reference proportions must remain uniform');
assert.ok(lod.near.instanceColor.array.every(v=>v===1));
const cachedMatrices=lod.matrices.slice();
camera.position.z=1000;camera.updateMatrixWorld();lod.update(camera);
assert.equal(lod.far.count,1);assert.deepEqual(lod.matrices,cachedMatrices,'camera changes must reuse placement matrices');
lod.disposeReference();
let geometryDisposed=0,materialDisposed=0;a.geometry.addEventListener('dispose',()=>geometryDisposed++);a.material.addEventListener('dispose',()=>materialDisposed++);
library.dispose();library.dispose();assert.equal(geometryDisposed,1);assert.equal(materialDisposed,1);
await assert.rejects(library.loadRock(),/disposed/);
let resolve;
const pending=new ScannedAssetLibrary(url=>url.includes('detail')?new Promise(r=>resolve=r):Promise.resolve(payload(false)));
const task=pending.loadRock();pending.dispose();resolve(payload());await assert.rejects(task,/disposed/);
let attempts=0;const retry=new ScannedAssetLibrary(async url=>{if(attempts++===0)throw new Error('offline');return payload(url.includes('detail'))});
await assert.rejects(retry.loadRock(),/offline/);await retry.loadRock();retry.dispose();
let invalidDisposed=0;
const invalid=new ScannedAssetLibrary(async url=>{
  const result=payload(url.includes('detail'));
  if(url.includes('distant')){
    result.scene.children[0].geometry.setIndex(null);
    result.scene.children[0].geometry.addEventListener('dispose',()=>invalidDisposed++);
  }
  return result;
});
await assert.rejects(invalid.loadRock(),/Invalid distant/);assert.equal(invalidDisposed,1);
invalid.dispose();
for(const sizeKm of [8,128,256]){
  const renderer=Object.create(TerrainRenderer.prototype);
  Object.assign(renderer,{model:{sizeKm},scene:{fog:{}},camera:new THREE.PerspectiveCamera(),controls:{},updateGrid(){},resetCamera(){}});
  renderer.updateSceneScale(true);assert.equal(renderer.controls.minDistance,0.0005);
}
const model={n:9,sizeKm:0.08,cellSizeKm:0.01,height:Float32Array.from({length:81},(_,i)=>150+(i%9)*5),
  slope:new Float32Array(81).fill(40),terrainDiagnostics:{roughness:new Float32Array(81).fill(12)}};
const snapshot=structuredClone(model),terrain=Object.create(TerrainRenderer.prototype);
Object.assign(terrain,{model,params:{terrainDetail3DEnabled:true,seed:42,seaLevel:0,verticalScale:1},
  terrainDetailGroup:new THREE.Group(),activeDetailBudgetPlan:{quality:'high',terrainDetailStep:1,maxTerrainDetailInstances:200}});
terrain.terrainDetailGroup.scannedAssets=new ScannedAssetLibrary();
terrain.buildTerrainDetails();
const batches=terrain.terrainDetailGroup.children.filter(child=>child instanceof ScannedRockInstances);
assert.ok(batches.length>0,'actual terrain construction must use reference rock batches');
for(const batch of batches)for(const source of batch.sources){
  assert.ok(Math.abs(source.surfaceY-(150+(source.x+0.04)*500)/1000)<1e-6);
  if(Math.abs(source.x)<0.035&&Math.abs(source.z)<0.035){
    assert.ok(Math.abs(source.surfaceNormal[0]+0.5/Math.sqrt(1.25))<1e-6);
    assert.ok(Math.abs(source.surfaceNormal[1]-1/Math.sqrt(1.25))<1e-6);
  }
}
assert.deepEqual(model,snapshot,'reference placement must not alter scientific fields');
terrain.terrainDetailGroup.traverse(object=>{object.disposeReference?.();object.geometry?.dispose();object.material?.dispose()});
terrain.terrainDetailGroup.scannedAssets.dispose();
geometry.dispose();material.dispose();
console.log('Embedded GLB/PBR contracts, shared loads, retry, disposal, reference LOD and desktop close inspection passed');
