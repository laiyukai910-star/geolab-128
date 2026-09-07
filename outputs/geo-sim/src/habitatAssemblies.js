import * as THREE from "three";
import { createOrganismGeometry, createOrganismMaterial } from "./organismGeometry.js";

export function sessileHabitatSites(model) {
  const candidates=[];
  for(const block of model.landscapeNetwork?.blocks||[])for(const site of block.aquaticSites?.marine||[]){
    if(site.depthM<1||site.depthM>30||site.salinityPSU<28||block.meanImpervious>0.08)continue;
    const kind=site.temperatureC>=21&&site.temperatureC<=30?"coral":site.temperatureC>=4&&site.temperatureC<=20?"kelp":null;
    if(kind)candidates.push({kind,site});
  }
  return candidates;
}

export function createHabitatAssemblies(model,params,clippingPlanes,focus) {
  const group=new THREE.Group();group.name="Habitat-constrained sessile life";
  const vertical=Number(params.verticalScale)||1,half=model.sizeKm/2;
  const radiusKm=Math.max(0.25,model.sizeKm/(model.n-1));
  const candidates={coral:[],kelp:[]};
  for(const candidate of sessileHabitatSites(model)){
    const x=(candidate.site.index%model.n)/(model.n-1)*model.sizeKm-half;
    const z=Math.floor(candidate.site.index/model.n)/(model.n-1)*model.sizeKm-half;
    const distance=Math.hypot(x-focus.x,z-focus.z);
    if(distance<=radiusKm)candidates[candidate.kind].push({...candidate,distance});
  }
  const dummy=new THREE.Object3D();let count=0;
  for(const [kind,sites] of Object.entries(candidates)){
    const selected=sites.sort((a,b)=>a.distance-b.distance).slice(0,48);
    if(!selected.length)continue;
    const material=createOrganismMaterial(kind);material.clippingPlanes=clippingPlanes;
    const mesh=new THREE.InstancedMesh(createOrganismGeometry(kind,"high"),material,selected.length);
    selected.forEach(({site},i)=>{
      const x=(site.index%model.n)/(model.n-1)*model.sizeKm-half,z=Math.floor(site.index/model.n)/(model.n-1)*model.sizeKm-half;
      const scale=Math.min(kind==="coral"?0.0012:0.003,site.depthM*vertical/1000*0.2);
      dummy.position.set(x,site.bedM*vertical/1000+0.00002,z);dummy.scale.setScalar(scale);dummy.rotation.y=i*2.39996;dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    });
    mesh.name=kind;mesh.computeBoundingBox();mesh.computeBoundingSphere();group.add(mesh);count+=selected.length;
  }
  group.userData.habitat={count,radiusKm,deferred:false,method:"depth, marine connectivity, salinity assumption and air-temperature proxy screen; not a calibrated benthic habitat model"};
  return group;
}
