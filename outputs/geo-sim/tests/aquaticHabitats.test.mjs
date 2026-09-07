import assert from "node:assert/strict";
import { aquaticContext, aquaticSite, aquaticFit } from "../src/aquaticHabitats.js";
import {buildLandscapeBlockNetwork,buildWildlifeState,WILDLIFE_SPECIES} from "../src/landscapeEcology.js";
const n=9, height=new Float32Array(n*n).fill(20);
for(let y=0;y<n;y++)for(let x=0;x<3;x++)height[y*n+x]=-10;
height[4*n+6]=-5;
const model={n,sizeKm:1,cellSizeKm:1/8,height,temperature:new Float32Array(n*n).fill(15),
  riverSegments:[{from:31,to:40}],hydraulics:{channelDepthM:new Float32Array(n*n).fill(1),channelWidthM:new Float32Array(n*n).fill(4)}};
const before=structuredClone(model),context=aquaticContext(model,{seaLevel:0});
assert.equal(aquaticSite(model,context,0).environment,"marine");
assert.equal(aquaticSite(model,context,42),null,"an isolated low depression is not evidence of seawater or a freshwater lake");
const river=aquaticSite(model,context,31);
assert.equal(river.environment,"freshwater");
assert.equal(river.waterSurfaceM,21);
const fish={aquaticEnvironment:"freshwater",temperature:[14,14],depthRangeM:[0.2,30],salinityRange:[0,1]};
assert.ok(aquaticFit(fish,river)>0);
assert.equal(aquaticFit(fish,aquaticSite(model,context,0)),0);
assert.equal(aquaticFit({...fish,depthRangeM:[2,30]},river),0);
assert.equal(aquaticFit(fish,{...river,salinityPSU:4}),0);
assert.deepEqual(model,before);
const regional={...model,sizeKm:8,areaKm2:64,cellSizeKm:1,hydraulics:{...model.hydraulics,channelWidthM:new Float32Array(n*n).fill(80)}};
const network=buildLandscapeBlockNetwork(regional,{seaLevel:0},{gridSize:4});
const state=buildWildlifeState({...regional,landscapeNetwork:network},{seaLevel:0,wildlifeMaxAgents:40,wildlifeReleases:[{batchId:"wrong-water",speciesId:"river_trout",count:10,targetHabitat:"coast",targetBlockId:0}]},network);
assert.equal(state.releaseOutcomes[0].survivingCount,0,"freshwater releases into marine-only blocks must be rejected");
assert.ok(state.agents.some(a=>a.waterSite),"eligible water must contain aquatic agents");
for(const agent of state.agents){
  const species=WILDLIFE_SPECIES.find(s=>s.id===agent.speciesId);
  if(species.aquaticEnvironment){assert.ok(aquaticFit(species,agent.waterSite)>0);assert.equal(agent.waterSite.environment,species.aquaticEnvironment);}
}
for(const link of state.migrationLinks){
  assert.notEqual(link.speciesId,'freshwater_mussel','stationary adults cannot use active migration links');
  const species=WILDLIFE_SPECIES.find(s=>s.id===link.speciesId);
  if(species.aquaticEnvironment)assert.ok(network.links.find(l=>l.fromBlockId===link.fromBlockId&&l.toBlockId===link.toBlockId).aquaticContinuity.includes(species.aquaticEnvironment));
}
console.log("Aquatic connectivity, dry/depression rejection, depth, salinity and data isolation passed");
