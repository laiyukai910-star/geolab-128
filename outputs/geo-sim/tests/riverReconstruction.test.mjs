import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return next(s==='three'?new URL('../vendor/three/three.module.js',import.meta.url).href:s,c)}});
const {solveRectangularNormalDepth}=await import('../src/channelHydraulics.js');
const {buildRiverNetwork}=await import('../src/riverNetwork.js');
const {buildRiverGeometry}=await import('../src/riverGeometry.js');
const {surfaceDetailSuitability,terrainSurfaceWeights}=await import('../src/terrainAppearance.js');
for(const width of [0.5,2,20,200])for(const depth of [0.001,0.1,1,10,100]){
  const slope=0.003,n=0.035,area=width*depth,radius=area/(width+2*depth);
  const q=area*Math.pow(radius,2/3)*Math.sqrt(slope)/n;
  const result=solveRectangularNormalDepth(q,width,slope,n);
  assert.equal(result.status,'solved');assert.ok(Math.abs(result.depthM/depth-1)<2e-8);
  assert.ok(result.relativeResidual<1e-8);
  assert.ok(Math.abs(result.areaM2*result.velocityMps/q-1)<1e-12);
}
assert.equal(solveRectangularNormalDepth(0,2,0.001,0.03).status,'dry');
assert.equal(solveRectangularNormalDepth(1,2,0,0.03).status,'zero-slope');
assert.equal(solveRectangularNormalDepth(1000,1,0.001,0.03,0.5).status,'depth-limit');
for(const args of [[-1,1,.01,.03],[1,0,.01,.03],[1,1,-.01,.03],[1,1,.01,0],[NaN,1,.01,.03]])assert.throws(()=>solveRectangularNormalDepth(...args),RangeError);
const model={n:5,sizeKm:0.1,height:new Float32Array(25).fill(20),riverSegments:[{from:6,to:12},{from:8,to:12},{from:12,to:18},{from:18,to:23}],
  hydraulics:{channelWidthM:new Float32Array(25).fill(4),channelDepthM:new Float32Array(25).fill(1),flowVelocity:new Float32Array(25).fill(1)}};
const before=structuredClone(model),params={seaLevel:0,verticalScale:1,renderDetailQuality:'high'};
const mesh=buildRiverGeometry(model,params),reordered=buildRiverGeometry({...model,riverSegments:model.riverSegments.slice().reverse()},params);
assert.deepEqual(mesh.attributes.position.array,reordered.attributes.position.array,'input ordering must not change confluences');
assert.deepEqual(mesh.index.array,reordered.index.array);
assert.equal(mesh.userData.riverNetwork.confluences,1);
assert.equal(mesh.userData.riverNetwork.junctionPatches,1);
const edgeUses=new Map();
for(let i=0;i<mesh.index.count;i+=3)for(let k=0;k<3;k++){
  const a=mesh.index.array[i+k],b=mesh.index.array[i+(k+1)%3],key=a<b?`${a}:${b}`:`${b}:${a}`;
  edgeUses.set(key,(edgeUses.get(key)||0)+1);
}
assert.ok([...edgeUses.values()].every(count=>count<=2),'junction triangles must not create non-manifold shared edges');
for(const attribute of Object.values(mesh.attributes))assert.ok(attribute.array.every(Number.isFinite));
const empty=buildRiverGeometry({...model,hydraulics:{...model.hydraulics,channelDepthM:new Float32Array(25)}},params);
assert.equal(empty.index.count,0);assert.equal(empty.userData.riverNetwork.dryEdges,4);
const malformed=buildRiverNetwork({...model,riverSegments:[...model.riverSegments,null,{from:6,to:12},{from:-1,to:3},{from:4,to:4}]});
assert.equal(malformed.diagnostics.duplicateEdges,1);assert.equal(malformed.diagnostics.invalidEdges,3);
const cyclic=buildRiverNetwork({...model,riverSegments:[{from:6,to:12},{from:12,to:6},{from:12,to:18}]});
assert.equal(cyclic.edges.length,0);assert.equal(cyclic.diagnostics.cyclicEdges,3);
assert.throws(()=>buildRiverGeometry({...model,sizeKm:NaN},params),RangeError);
const narrowGrid=buildRiverGeometry({...model,sizeKm:0.01},params);
assert.ok(Math.abs(narrowGrid.attributes.riverMetric.getY(0)-2)<1e-6,'valid four-metre channel width must not be capped to a smaller grid cell');
narrowGrid.dispose();
const terrain={height:[100],slope:[50],wetnessIndex:[4],surface:{vegetation:[0],imperviousFraction:[0]}};
const wet={...terrain,wetnessIndex:[14]},sealed={...terrain,surface:{imperviousFraction:[1]}};
assert.ok(surfaceDetailSuitability(wet,0).scree<surfaceDetailSuitability(terrain,0).scree);
assert.deepEqual(surfaceDetailSuitability(sealed,0),{rock:0,scree:0});
assert.deepEqual(surfaceDetailSuitability({...terrain,hydraulics:{channelMask:[1],channelDepthM:[1]}},0),{rock:0,scree:0});
assert.ok(terrainSurfaceWeights({...terrain,hydraulics:{depositionRisk:[1]}},params,0)[0]<terrainSurfaceWeights(terrain,params,0)[0]);
assert.deepEqual(model,before,'display reconstruction must leave scientific arrays untouched');
for(const geometry of [mesh,reordered,empty])geometry.dispose();
const {buildModel,createDefaultParams}=await import('../src/geoEngine.js');
const scenario=buildModel({...createDefaultParams(),resolution:32,mapSizeKm:32,landscapeBlockGrid:8,wildlifeMaxAgents:10,riverThreshold:2});
const diagnostics=scenario.stats.hydraulicDiagnostics.normalDepth;
assert.equal(diagnostics.method,'finite-width-rectangular-manning');assert.ok(diagnostics.solvedCells>0);
assert.ok(diagnostics.maximumRelativeResidual<1e-8);assert.equal(diagnostics.depthLimitedCells,0);
for(let i=0;i<scenario.height.length;i++)if(scenario.hydraulics.channelMask[i]){
  const q=scenario.discharge[i]/31557600*2.35;
  const computed=scenario.hydraulics.channelWidthM[i]*scenario.hydraulics.channelDepthM[i]*scenario.hydraulics.flowVelocity[i];
  assert.ok(Math.abs(computed-q)<=Math.max(1e-7,q*3e-7),'stored width/depth/velocity must conserve modeled channel discharge');
}
console.log('Normal-depth inversion, continuity, dry/limited flow, connected river topology and process-conditioned detail tests passed');
