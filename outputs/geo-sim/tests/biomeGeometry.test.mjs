import assert from "node:assert/strict";
import {registerHooks} from "node:module";
registerHooks({resolve(s,c,next){return next(s==="three"?new URL("../vendor/three/three.module.js",import.meta.url).href:s,c);}});
const THREE=await import("three");
const {createOrganismGeometry,ORGANISM_KINDS}=await import("../src/organismGeometry.js");
const {createCaveDisplay,disposeCaveDisplay}=await import("../src/caveGeometry.js");
const {caveContains,caveDistance}=await import("../src/caveField.js");
const {buildRiverGeometry}=await import("../src/riverGeometry.js");
const {sampleStratumColor,volumeDisplayConfig}=await import("../src/terrainVolume.js");
const {createHabitatAssemblies,sessileHabitatSites}=await import("../src/habitatAssemblies.js");
for(const kind of ORGANISM_KINDS){
  const geometry=createOrganismGeometry(kind,"high"),repeat=createOrganismGeometry(kind,"high");
  assert.deepEqual(geometry.getAttribute("position").array,repeat.getAttribute("position").array);
  assert.ok(geometry.userData.anatomy.parts>1);
  assert.ok(geometry.index.count>3000);
  for(const attr of Object.values(geometry.attributes))for(const v of attr.array)assert.ok(Number.isFinite(v),`${kind} finite attributes`);
  assert.equal(geometry.getAttribute("color").count,geometry.getAttribute("position").count);
  geometry.dispose();repeat.dispose();
}
const plan={center:[0,-0.12,0],halfSize:[0.32,0.045,0.224]};
assert.ok(caveContains(plan,new THREE.Vector3(0,-0.12,0)));
assert.ok(!caveContains(plan,new THREE.Vector3(0,0,0)));
const cave=createCaveDisplay(plan,null),wall=cave.children[0],position=wall.geometry.getAttribute("position");
for(const mesh of cave.children.filter(o=>o.userData.speleothem)){
  assert.ok(!caveContains(plan,mesh.position),'speleothem roots must embed in cave walls, not float in air');
}
const edges=new Map();
for(let i=0;i<position.count;i+=3){
  const keys=[0,1,2].map(k=>[position.getX(i+k),position.getY(i+k),position.getZ(i+k)].map(v=>v.toFixed(7)).join(","));
  if(new Set(keys).size<3)continue;
  for(let j=0;j<3;j++){const edge=[keys[j],keys[(j+1)%3]].sort().join("|");edges.set(edge,(edges.get(edge)||0)+1);}
}
assert.ok([...edges.values()].every(n=>n===2),"cavity mesh must close at every branch end without sky leaks");
for(let i=0;i<position.count;i+=30){
  const d=caveDistance((position.getX(i)-plan.center[0])/plan.halfSize[0],(position.getY(i)-plan.center[1])/plan.halfSize[1],(position.getZ(i)-plan.center[2])/plan.halfSize[2]);
  assert.ok(Math.abs(d)<0.018,"camera and rendered void must share the field");
}
disposeCaveDisplay(cave);
const model={n:5,sizeKm:1,cellSizeKm:0.25,height:new Float32Array(25).fill(20),riverSegments:[{from:6,to:12},{from:12,to:18}],
  hydraulics:{channelWidthM:new Float32Array(25).fill(4),channelDepthM:new Float32Array(25).fill(1)},
  subsurface:{gridN:5,columnCellCount:25,lithologyCode:Uint8Array.from({length:25},(_,i)=>i%2?3:5),groundwaterSaturation:new Float32Array(25)}};
const before=structuredClone(model),river=buildRiverGeometry(model,{seaLevel:0,verticalScale:1});
assert.ok(river.index.count>0);
assert.equal(river.attributes.riverData.count,river.attributes.position.count);
assert.equal(river.attributes.riverDirection.count,river.attributes.position.count);
const highRiver=buildRiverGeometry(model,{seaLevel:0,verticalScale:1,renderDetailQuality:"high"});
assert.ok(highRiver.attributes.position.count<river.attributes.position.count);
highRiver.dispose();
const badRiver=buildRiverGeometry({...model,riverSegments:[...model.riverSegments,{from:-1,to:99999}],hydraulics:{flowVelocity:new Float32Array(25).fill(Infinity)}},{seaLevel:0,verticalScale:1});
for(const name of ["position","riverData","riverDirection"]) for(const v of badRiver.attributes[name].array)assert.ok(Number.isFinite(v));
badRiver.dispose();
for(const v of river.getAttribute("position").array)assert.ok(Number.isFinite(v));
const a=sampleStratumColor(model,1-1e-6,2,0),b=sampleStratumColor(model,1+1e-6,2,0);
assert.ok(Math.abs(a.r-b.r)+Math.abs(a.g-b.g)+Math.abs(a.b-b.b)<1e-5,"no color jump at column boundaries");
assert.deepEqual(model,before);river.dispose();
const fern=createOrganismGeometry('fern','high'),kelp=createOrganismGeometry('kelp','high');
assert.notEqual(fern.index.count,kelp.index.count,'kelp must not reuse terrestrial fern architecture');
fern.dispose();kelp.dispose();
const shallow={...model,subsurface:undefined};
const config=volumeDisplayConfig(shallow,{worldView:'cave',subsurfaceDepthM:20,caveRadiusM:25,subsurfaceDisplayScale:1});
assert.ok(config.cave.center.every(Number.isFinite));
assert.ok(config.cave.center[1]+config.cave.halfSize[1]*0.4<0.02,'cave roof must stay below flat ground');
assert.ok(config.cave.center[1]-config.cave.halfSize[1]*0.4>0,'cave floor must fit shallow modeled depth');
const habitatModel={...model,landscapeNetwork:{blocks:[{meanImpervious:0,aquaticSites:{marine:[
  {index:0,depthM:10,salinityPSU:35,temperatureC:26,bedM:-10},
  {index:24,depthM:10,salinityPSU:35,temperatureC:15,bedM:-10},
  {index:12,depthM:100,salinityPSU:35,temperatureC:26,bedM:-100}
]}}]}};
assert.equal(sessileHabitatSites(habitatModel).length,2,'deep seabeds do not imply photosynthetic benthos');
const assembly=createHabitatAssemblies(habitatModel,{},null,{x:-0.5,z:-0.5});
assert.equal(assembly.userData.habitat.count,1,'load only geographically nearby compatible habitat');
assert.equal(assembly.children[0].name,'coral');
disposeCaveDisplay(assembly);
console.log("13 organism meshes, continuous strata, closed cave field and river data isolation passed");
