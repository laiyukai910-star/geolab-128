import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return next(s==='three'?new URL('../vendor/three/three.module.js',import.meta.url).href:s.startsWith('three/addons/')?new URL(`../vendor/three/addons/${s.slice(13)}`,import.meta.url).href:s,c)}});
const THREE=await import('three');
const {createFacilityGeometry}=await import('../src/facilityGeometry.js');
const {createFoliageGeometry}=await import('../src/foliageGeometry.js');
for(const conifer of [false,true]) for(const quality of ['high','ultra','exhaustive']) {
  const tree=createFoliageGeometry(conifer,quality,3,true);
  assert.equal(tree.userData.foliage.completeTree,true);
  assert.ok(tree.userData.foliage.leafCount>500);
  for(const axis of ['x','y','z']) {
    assert.ok(Math.abs(tree.boundingBox.min[axis]+0.5)<1e-6);
    assert.ok(Math.abs(tree.boundingBox.max[axis]-0.5)<1e-6);
  }
  for(const attribute of Object.values(tree.attributes)) assert.ok(attribute.array.every(Number.isFinite));
  const colors=tree.attributes.color.array;
  let bark=false,leaf=false;
  for(let i=0;i<colors.length;i+=3){bark ||= colors[i]>colors[i+1];leaf ||= colors[i+1]>colors[i]*1.5;}
  assert.ok(bark&&leaf,'complete-tree wood and leaves must keep separate colours');
  tree.dispose();
}
const {createSiteFoundation}=await import('../src/siteFoundation.js');
const terrain={n:5,sizeKm:1,height:Float32Array.from({length:25},(_,i)=>100+(i%5)*10)};
const original=terrain.height.slice();
for(const angle of [0,0.7,Math.PI/2]) {
  const site=createSiteFoundation(terrain,{x:0,z:0,sx:0.2,sz:0.3,ry:angle},2);
  assert.ok(site && Number.isFinite(site.top));
  const p=site.geometry.attributes.position;
  for(let i=0;i<p.count;i++) {
    const expected=(120+p.getX(i)*40)*2/1000-0.0003;
    assert.ok(Math.abs(p.getY(i)-site.top)<1e-6 || Math.abs(p.getY(i)-expected)<1e-6,'vertices lie on bearing plane or sampled ground');
  }
  for(let i=0;i<p.count;i+=3) {
    if([0,1,2].every(j=>Math.abs(p.getY(i+j)-site.top)<1e-6)) {
      for(let j=0;j<3;j++) assert.ok(site.geometry.attributes.normal.getY(i+j)>0.999,'bearing surface must have vertical normals');
    }
  }
  site.geometry.dispose();
}
assert.deepEqual(terrain.height,original,'render foundations must not alter terrain');
assert.equal(createSiteFoundation(terrain,{x:2,z:0,sx:0.2,sz:0.3,ry:0},1),null);
assert.equal(createSiteFoundation(terrain,{x:0,z:0,sx:0.2,sz:0.3,ry:0},NaN),null);
for(const [tier,quality] of ['high','ultra','exhaustive'].entries()){
  const geometry=createFacilityGeometry('setback-tower',quality);
  const {normalization,windowOpenings,entrances}=geometry.userData.facilityRebuild;
  assert.ok(windowOpenings>50);assert.ok(entrances>0);
  assert.equal(geometry.userData.facilityRebuild.windowFrames,windowOpenings,'each opening must have a perimeter frame');
  assert.equal(geometry.userData.facilityRebuild.drainRuns,6,'each tower setback has two connected drainage runs');
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
// Calibrated subsurface depth-edge power law. SUBSURFACE_DEPTH_EDGE_EXPONENT is the only writer of
// model.subsurface.depthEdgesM, so it fixes every layer thickness and, through them, the surface
// joint spacing, the surface bedding frequency and the subsurface lamination period.
const {SUBSURFACE_DEPTH_EDGE_EXPONENT,buildModel,createDefaultParams}=await import('../src/geoEngine.js');
const subsurfaceParams={...createDefaultParams(),resolution:24,mapSizeKm:24,landscapeBlockGrid:8,wildlifeMaxAgents:10};
const {layerCount,depthEdgesM}=buildModel(subsurfaceParams).subsurface;
// Tripwire: the exponent is a deliberate calibration, so changing it must come with a re-measured envelope.
assert.equal(SUBSURFACE_DEPTH_EDGE_EXPONENT,1.18,'the calibrated exponent moved; re-check the measured thickness sequence');
assert.equal(depthEdgesM.length,layerCount+1,'depth edges must be one longer than the layer count');
assert.equal(depthEdgesM[0],0,'the shallowest depth edge must sit at the surface');
const depths=Array.from(depthEdgesM);
for(let i=1;i<depths.length;i++)assert.ok(depths[i]>depths[i-1],`depth edge ${i} must be strictly deeper than edge ${i-1}`);
for(let i=0;i<depths.length;i++){
  const expected=subsurfaceParams.subsurfaceDepthM*(i/layerCount)**SUBSURFACE_DEPTH_EDGE_EXPONENT;
  assert.ok(Math.abs(depths[i]-expected)<1e-4,`depth edge ${i} must follow the calibrated power law of depth`);
}
const thicknesses=depths.slice(1).map((depth,i)=>depth-depths[i]);
assert.equal(thicknesses.length,layerCount,'every layer must own exactly one thickness');
for(const [i,thickness] of thicknesses.entries())assert.ok(Number.isFinite(thickness)&&thickness>0,`layer ${i} thickness must be positive and finite`);
// Measured behaviour, not the assumed one: the calibrated exponent is greater than 1, so the power law
// compresses the shallow edges and beds are THINNEST at the top and thicken downward. They do not thin
// downward. An exponent below 1 is what reverses the trend, which the next block asserts.
for(let i=1;i<thicknesses.length;i++)assert.ok(thicknesses[i]>thicknesses[i-1],`layer ${i} must be thicker than layer ${i-1} while the exponent ${SUBSURFACE_DEPTH_EDGE_EXPONENT} exceeds 1`);
const shallowModel=buildModel({...subsurfaceParams,subsurfaceDepthEdgeExponent:0.82});
const shallowDepths=Array.from(shallowModel.subsurface.depthEdgesM);
assert.equal(shallowDepths.length,layerCount+1);
const shallowThicknesses=shallowDepths.slice(1).map((depth,i)=>depth-shallowDepths[i]);
assert.notDeepEqual(shallowThicknesses,thicknesses,'a changed exponent must change the thickness sequence, or the constant is not load-bearing');
for(let i=1;i<shallowThicknesses.length;i++)assert.ok(shallowThicknesses[i]<shallowThicknesses[i-1],'an exponent below 1 must thin beds downward');
assert.notDeepEqual(Array.from(buildModel(subsurfaceParams).subsurface.depthEdgesM),shallowDepths,'the override must not leak into a default model');
console.log(`Subsurface depth edges at exponent ${SUBSURFACE_DEPTH_EDGE_EXPONENT}: ${layerCount} layers over ${subsurfaceParams.subsurfaceDepthM} m, thicknesses [${thicknesses.map(t=>t.toFixed(4)).join(', ')}] m`);
