import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return next(s==='three'?new URL('../vendor/three/three.module.js',import.meta.url).href:s.startsWith('three/addons/')?new URL(`../vendor/three/addons/${s.slice(13)}`,import.meta.url).href:s,c)}});
const THREE=await import('three');
const {createFacilityGeometry}=await import('../src/facilityGeometry.js');
const {createFoliageGeometry}=await import('../src/foliageGeometry.js');
const {createSiteFoundation}=await import('../src/siteFoundation.js');
const terrain={n:5,sizeKm:1,height:Float32Array.from({length:25},(_,i)=>100+(i%5)*10)};
const original=terrain.height.slice();
for(const angle of [0,0.7,Math.PI/2]) {
  const site=createSiteFoundation(terrain,{x:0,z:0,sx:0.2,sz:0.3,ry:angle},2);
  assert.ok(site && Number.isFinite(site.top));
  const p=site.geometry.attributes.position;
  for(let i=0;i<p.count;i+=2) {
    assert.ok(Math.abs(p.getY(i)-site.top)<1e-6);
    assert.ok(p.getY(i)>p.getY(i+1));
    const expected=(120+p.getX(i)*40)*2/1000-0.0003;
    assert.ok(Math.abs(p.getY(i+1)-expected)<1e-6,'foundation skirt follows rotated footprint terrain');
  }
  site.geometry.dispose();
}
assert.deepEqual(terrain.height,original,'render foundations must not alter terrain');
assert.equal(createSiteFoundation(terrain,{x:2,z:0,sx:0.2,sz:0.3,ry:0},1),null);
for(const [tier,quality] of ['high','ultra','exhaustive'].entries()){
  const geometry=createFacilityGeometry('setback-tower',quality);
  const {normalization,windowOpenings,entrances}=geometry.userData.facilityRebuild;
  assert.ok(windowOpenings>50);assert.ok(entrances>0);
  const rows=3+tier,width=0.94,ww=width/rows*0.64;
  const x=(0.5/rows-0.5)*width+ww*0.2,y=-0.5+0.6*0.36/rows;
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.updateMatrixWorld();
  const origin=new THREE.Vector3((x-normalization.center[0])/normalization.size[0],(y-normalization.center[1])/normalization.size[1],2);
  const hits=new THREE.Raycaster(origin,new THREE.Vector3(0,0,-1)).intersectObject(mesh);
  assert.ok(hits.length>0);
  const roughness=geometry.attributes.constructionResponse.getX(hits[0].face.a);
  assert.ok(Math.abs(roughness-0.18)<1e-6,'window ray must meet recessed glazing, not a solid wall behind an overlay');
  for(const attribute of Object.values(geometry.attributes))assert.ok(attribute.array.every(Number.isFinite));
  geometry.dispose();mesh.material.dispose();
}
for(const kind of ['courtyard-midrise','l-plan-lowrise','sawtooth-industrial','cross-plan-civic']){
  const geometry=createFacilityGeometry(kind,'high');assert.ok(geometry.userData.facilityRebuild.windowOpenings>0);geometry.dispose();
}
let previous=0;
for(const quality of ['high','ultra','exhaustive']){
  const geometry=createFoliageGeometry(false,quality,2);
  assert.ok(geometry.attributes.position.count>previous);previous=geometry.attributes.position.count;
  for(const attribute of Object.values(geometry.attributes))assert.ok(attribute.array.every(Number.isFinite));
  assert.ok(geometry.index.array.every(i=>i<geometry.attributes.position.count));geometry.dispose();
}
console.log('Perforated envelopes, recessed glazing rays, entrances and curved foliage tiers passed');
