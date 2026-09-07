import * as THREE from "three";
import { sampleTerrainHeight } from "./terrainVolume.js";

export function buildRiverGeometry(model,params) {
  const positions=[],colors=[],indices=[],sea=Number(params.seaLevel)||0,vertical=Number(params.verticalScale)||1;
  const cell=model.sizeKm/(model.n-1),segments=(model.riverSegments||[]).slice(0,120000);
  const downstream=new Map(segments.map(s=>[s.from,s.to])),upstream=new Map();
  for(const s of segments)if(!upstream.has(s.to))upstream.set(s.to,s.from);
  const point=i=>new THREE.Vector3((i%model.n)/(model.n-1)*model.sizeKm-model.sizeKm/2,0,Math.floor(i/model.n)/(model.n-1)*model.sizeKm-model.sizeKm/2);
  const centerColor=new THREE.Color(0x417e86),edgeColor=new THREE.Color(0x668d88);
  for(const s of segments){
    if(model.height[s.from]<=sea&&model.height[s.to]<=sea)continue;
    const a=point(s.from),b=point(s.to),prev=point(upstream.get(s.from)??s.from),next=point(downstream.get(s.to)??s.to);
    const tangentA=b.clone().sub(prev).normalize(),tangentB=next.clone().sub(a).normalize(),distance=a.distanceTo(b);
    const curve=new THREE.CubicBezierCurve3(a,a.clone().addScaledVector(tangentA,distance/3),b.clone().addScaledVector(tangentB,-distance/3),b);
    const start=positions.length/3;
    for(let j=0;j<=4;j++){
      const t=j/4,p=curve.getPoint(t),direction=curve.getTangent(t),normal=new THREE.Vector3(-direction.z,0,direction.x);
      const widthA=Math.max(1,Number(model.hydraulics?.channelWidthM?.[s.from])||2),widthB=Math.max(1,Number(model.hydraulics?.channelWidthM?.[s.to])||2);
      const halfWidth=Math.min(cell*0.45,THREE.MathUtils.lerp(widthA,widthB,t)/2000);
      const depth=THREE.MathUtils.lerp(Number(model.hydraulics?.channelDepthM?.[s.from])||0.1,Number(model.hydraulics?.channelDepthM?.[s.to])||0.1,t);
      const bed=sampleTerrainHeight(model,p.x,p.z);if(bed===null)continue;
      for(const side of [-1,0,1]){
        positions.push(p.x+normal.x*halfWidth*side,(bed+depth+0.02)*vertical/1000,p.z+normal.z*halfWidth*side);
        const color=side===0?centerColor:edgeColor;colors.push(color.r,color.g,color.b);
      }
    }
    if(positions.length/3-start!==15){positions.length=start*3;colors.length=start*3;continue;}
    for(let j=0;j<4;j++)for(let k=0;k<2;k++){const a=start+j*3+k,b=a+3;indices.push(a,a+1,b,b,a+1,b+1);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
  geometry.userData.representation="Hydraulic-width display ribbons; smoothed sub-grid centerlines are not surveyed channels";
  return geometry;
}
