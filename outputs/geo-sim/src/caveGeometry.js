import * as THREE from "three";
import { MarchingCubes } from "../vendor/three/addons/objects/MarchingCubes.js";
import { caveDistance } from "./caveField.js";
import { createOrganismGeometry, createOrganismMaterial } from "./organismGeometry.js";
import { createGeologyMaterial } from "./geologyMaterial.js";

function caveVerticalBounds(x,z){
  let roof=null,floor=null;
  for(let y=0.6;y>=-0.6;y-=0.006){
    if(caveDistance(x,y,z)<0){if(roof===null)roof=y;floor=y;}
  }
  if(roof===null)return null;
  const refine=(inside,outside)=>{
    for(let i=0;i<12;i++){const mid=(inside+outside)/2;if(caveDistance(x,mid,z)<0)inside=mid;else outside=mid;}
    return (inside+outside)/2;
  };
  return {roof:refine(roof,roof+0.006),floor:refine(floor,floor-0.006)};
}

function speleothemGeometry(ceiling){
  const profile=Array.from({length:40},(_,i)=>{
    const y=i/39;
    const radius=ceiling?0.2*(1-y)**1.6:0.17*(1-y)**0.34;
    return new THREE.Vector2(radius*(1+Math.sin(y*23)*0.035),y);
  });
  const geometry=new THREE.LatheGeometry(profile,32),positions=geometry.getAttribute('position');
  for(let i=0;i<positions.count;i++){
    const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
    const ribs=1+Math.sin(Math.atan2(z,x)*7+y*5)*0.06+Math.sin(y*65)*0.018;
    positions.setXYZ(i,x*ribs+y*y*0.025,y,z*ribs+Math.sin(y*3)*0.009);
  }
  geometry.computeVertexNormals();return geometry;
}

export function createCaveDisplay(plan,clippingPlanes) {
  const group=new THREE.Group();group.name="Illustrative karst cavity";
  const material=createGeologyMaterial(null,0.18);material.side=THREE.BackSide;material.clippingPlanes=clippingPlanes;
  const resolution=96,domain=1.25;
  const cubes=new MarchingCubes(resolution,material,false,false,100000);cubes.isolation=0;
  for(let z=0;z<resolution;z++)for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++)cubes.setCell(x,y,z,-caveDistance((x/(resolution/2)-1)*domain,(y/(resolution/2)-1)*domain,(z/(resolution/2)-1)*domain));
  cubes.update();
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute("position",new THREE.BufferAttribute(cubes.positionArray.slice(0,cubes.count*3),3));
  geometry.setAttribute("normal",new THREE.BufferAttribute(cubes.normalArray.slice(0,cubes.count*3),3));
  cubes.geometry.dispose();
  geometry.scale(...plan.halfSize.map(v=>v*domain));geometry.translate(...plan.center);
  const positions=geometry.getAttribute("position"),colors=new Float32Array(positions.count*3),depths=new Float32Array(positions.count);
  for(let i=0;i<positions.count;i++){
    const x=(positions.getX(i)-plan.center[0])*1000,y=(positions.getY(i)-plan.center[1])*1000,z=(positions.getZ(i)-plan.center[2])*1000;
    const color=new THREE.Color(0x8e8675).multiplyScalar(0.88+Math.sin(y*0.08+z*0.003)*0.07);color.toArray(colors,i*3);
    depths[i]=-positions.getY(i)*1000;
  }
  geometry.setAttribute("color",new THREE.BufferAttribute(colors,3));material.vertexColors=true;
  geometry.setAttribute("stratumDepth",new THREE.BufferAttribute(depths,1));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const wall=new THREE.Mesh(geometry,material);group.add(wall);
  const light=new THREE.PointLight(0xffe8c5,1.3,plan.halfSize[0]*4,0);
  light.position.fromArray(plan.center).add(new THREE.Vector3(plan.halfSize[0]*0.3,0,0));group.add(light);
  // Speleothems are geometry in the illustrative cavity, not an inferred deposition rate.
  const dripGeometry=speleothemGeometry(true),floorGeometry=speleothemGeometry(false);
  const dripMaterial=new THREE.MeshStandardMaterial({color:0xc3b493,roughness:0.86,clippingPlanes,emissive:0x665742,emissiveIntensity:0.15});
  for(let i=0;i<40;i++){
    const random=n=>{const v=Math.sin((n+1)*127.1)*43758.5453;return v-Math.floor(v);};
    const x=-0.7+random(i*2)*1.4,z=-0.2+random(i*2+1)*0.44;
    const bounds=caveVerticalBounds(x,z);
    if(!bounds)continue;
    for(const ceiling of [true,false]){
      const mesh=new THREE.Mesh(ceiling?dripGeometry:floorGeometry,dripMaterial);
      const length=(0.025+random(i*3+41)*0.08)*plan.halfSize[1]*(ceiling?1:0.65);
      mesh.scale.set(length,length,length);if(ceiling)mesh.rotation.z=Math.PI;
      mesh.position.set(plan.center[0]+x*plan.halfSize[0],plan.center[1]+(ceiling?bounds.roof:bounds.floor)*plan.halfSize[1]+(ceiling?1:-1)*length*0.06,plan.center[2]+z*plan.halfSize[2]);
      mesh.userData.speleothem=ceiling?'stalactite':'stalagmite';group.add(mesh);
    }
  }
  for(const [kind,position,scale] of [["bat",[-0.18,0.13,0],0.0012],["fungus",[-0.18,-0.13,0.08],0.0008]]){
    const mesh=new THREE.Mesh(createOrganismGeometry(kind,"high"),createOrganismMaterial(kind));
    mesh.material.clippingPlanes=clippingPlanes;mesh.scale.setScalar(scale);
    mesh.position.set(...position.map((v,i)=>plan.center[i]+v*plan.halfSize[i]));group.add(mesh);
    if(kind==='fungus')mesh.position.y=plan.center[1]+caveVerticalBounds(position[0],position[2]).floor*plan.halfSize[1];
  }
  group.userData.cave={method:"explicit illustrative karst scenario",passages:5,triangles:cubes.count/3,
    hydrogeology:"not included in groundwater storage or conductance",ecology:"bat and detrital fungi exemplars; no dark-zone photosynthetic vegetation"};
  return group;
}

export function disposeCaveDisplay(group) {
  if(!group)return;
  const geometries=new Set(),materials=new Set();
  group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});
  for(const g of geometries)g.dispose();for(const m of materials)m.dispose();group.removeFromParent();
}
