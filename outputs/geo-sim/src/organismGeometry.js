import * as THREE from "three";
import { mergeGeometries } from "../vendor/three/addons/utils/BufferGeometryUtils.js";

export const ORGANISM_KINDS = Object.freeze(["fish-trout","fish-perch","fish-reef","ray","octopus","jelly","crab","mussel","bat","fern","fungus","coral","kelp"]);
const TAU=Math.PI*2;
const vec=p=>new THREE.Vector3(...p);

function tint(geometry, hex) {
  const color=new THREE.Color(hex), positions=geometry.getAttribute("position"), colors=new Float32Array(positions.count*3);
  for(let i=0;i<positions.count;i++)color.toArray(colors,i*3);
  geometry.setAttribute("color",new THREE.BufferAttribute(colors,3));
  if(!geometry.getAttribute("uv"))geometry.setAttribute("uv",new THREE.BufferAttribute(new Float32Array(positions.count*2),2));
  return geometry;
}

function skin(n,m,point,color) {
  const positions=[],colors=[],uvs=[],indices=[];
  for(let i=0;i<=n;i++)for(let j=0;j<=m;j++){
    const u=i/n,v=j/m,p=point(u,v),c=new THREE.Color(color(u,v,p));
    positions.push(...p);colors.push(c.r,c.g,c.b);uvs.push(u,v);
  }
  for(let i=0;i<n;i++)for(let j=0;j<m;j++){
    const a=i*(m+1)+j,b=a+m+1;
    for(const [p,q,r] of [[a,a+1,b],[b,a+1,b+1]]){
      const ab=new THREE.Vector3().fromArray(positions,q*3).sub(new THREE.Vector3().fromArray(positions,p*3));
      const ac=new THREE.Vector3().fromArray(positions,r*3).sub(new THREE.Vector3().fromArray(positions,p*3));
      if(ab.cross(ac).lengthSq()>1e-20)indices.push(p,q,r);
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));g.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));
  g.setIndex(indices);g.computeVertexNormals();return g;
}

function tube(points,radius,color,segments=24,radial=8) {
  const curve=new THREE.CatmullRomCurve3(points.map(vec)),g=new THREE.TubeGeometry(curve,segments,radius,radial,false);
  return tint(g,color);
}

function ellipsoid(position,scale,color,segments) {
  const g=new THREE.SphereGeometry(1,segments,Math.max(10,segments/2));g.scale(...scale);g.translate(...position);return tint(g,color);
}

function taperedArm(points,radius,color,detail) {
  const curve=new THREE.CatmullRomCurve3(points.map(vec)),frames=curve.computeFrenetFrames(detail,false);
  return skin(detail,12,(u,v)=>{
    const k=Math.min(detail,Math.round(u*detail)),r=radius*(0.035+Math.pow(1-u,0.85));
    return curve.getPointAt(u).addScaledVector(frames.normals[k],Math.cos(v*TAU)*r).addScaledVector(frames.binormals[k],Math.sin(v*TAU)*r).toArray();
  },(u,v)=>new THREE.Color(color).multiplyScalar(0.8+Math.sin(v*TAU)*0.15+u*0.12));
}

function fin(root,tip1,tip2,color,parts,detail) {
  const a=vec(root),b=vec(tip1),c=vec(tip2);
  parts.push(skin(12,detail,(u,v)=>{
    const edge=b.clone().lerp(c,v);return a.clone().lerp(edge,0.02+u*0.98).add(new THREE.Vector3(0,0,Math.sin(v*Math.PI)*Math.sin(u*Math.PI)*0.018)).toArray();
  },(u,v)=>new THREE.Color(color).multiplyScalar(0.78+u*0.22+Math.sin(v*detail*TAU)*0.06)));
  for(let i=0;i<=detail;i++)parts.push(tube([root,a.clone().lerp(b.clone().lerp(c,i/detail),0.6).toArray(),b.clone().lerp(c,i/detail).toArray()],0.0016,0xb9b699,8,5));
}

function rayedFin(baseA,baseB,edgePoints,color,parts) {
  const curve=new THREE.CatmullRomCurve3(edgePoints.map(vec)),a=vec(baseA),b=vec(baseB);
  const p=(u,v)=>a.clone().lerp(b,v).lerp(curve.getPoint(v),u);
  parts.push(skin(16,32,(u,v)=>p(u,v).toArray(),(u,v)=>new THREE.Color(color).multiplyScalar(0.87+u*0.12+Math.sin(v*16*TAU)*0.035)));
  for(let i=0;i<=16;i++)parts.push(tube([p(0,i/16).toArray(),p(0.5,i/16).toArray(),p(1,i/16).toArray()],0.0012,new THREE.Color(color).multiplyScalar(1.13),12,5));
}

function fish(kind,detail,variant) {
  const parts=[],reef=kind==="fish-reef",perch=kind==="fish-perch";
  const width=reef?0.095:0.12,depth=reef?0.31:perch?0.22:0.16;
  parts.push(skin(detail*2,40,(u,v)=>{
    const a=v*TAU,r=Math.pow(Math.sin(Math.PI*(u*0.96+0.02)),0.68)*(0.65+u*0.35);
    return [-0.58+u*1.13,Math.cos(a)*r*depth,Math.sin(a)*r*width];
  },(u,v)=>{
    const top=Math.cos(v*TAU),base=new THREE.Color(top>0.1?(reef?0xefba35:perch?0x6e8249:0x658b85):0xd9d5b7);
    const band=Math.sin(u*(reef?7:6)*TAU+0.3*Math.sin(v*TAU));
    if(reef && band>0.75)base.set(0x273b44);
    if(perch && band>0.8 && top>-0.6)base.multiplyScalar(0.45);
    if(!reef&&!perch && Math.abs(top)<0.4)base.lerp(new THREE.Color(0xb5697c),0.5);
    const spot=Math.sin(u*179+variant)*Math.sin(v*127+Math.floor(u*24)*2.4);
    if(!reef&&spot>0.82&&top>-0.25)base.multiplyScalar(0.3);
    return base.multiplyScalar(0.92+Math.sin(u*240+Math.sin(v*120))*0.045);
  }));
  const finColor=reef?0xeac442:perch?0xb86735:0x7b9790;
  rayedFin([-0.55,0.036,0],[-0.55,-0.036,0],[[-0.84,0.2,0],[-0.77,0.15,0],[-0.69,0,0],[-0.77,-0.15,0],[-0.84,-0.2,0]],finColor,parts);
  rayedFin([-0.31,depth*0.52,0],[0.13,depth*0.75,0],[[-0.37,depth*0.6,0],[-0.21,depth+0.12,0],[0.04,depth+0.09,0],[0.13,depth*0.78,0]],finColor,parts);
  rayedFin([-0.32,-depth*0.7,0],[-0.1,-depth*0.91,0],[[-0.4,-depth-0.03,0],[-0.22,-depth-0.08,0],[-0.1,-depth*0.91,0]],finColor,parts);
  for(const side of [-1,1]){
    rayedFin([0.19,-0.014,side*width*0.85],[0.28,-0.047,side*width*0.83],[[-0.1,-0.12,side*0.23],[-0.04,-0.15,side*0.23],[0.28,-0.047,side*width*0.83]],finColor,parts);
    parts.push(ellipsoid([0.41,0.038,side*width*0.66],[0.027,0.025,0.013],0x9e9665,detail));
    parts.push(ellipsoid([0.417,0.04,side*(width*0.66+0.01)],[0.015,0.017,0.006],0x102123,detail));
    parts.push(tube([[0.28,depth*0.65,side*width*0.4],[0.23,0,side*width*0.97],[0.3,-depth*0.62,side*width*0.45]],0.0035,0x435a51,detail,6));
    parts.push(tube([[0.55,-0.025,side*0.017],[0.52,-0.042,side*0.045],[0.46,-0.044,side*0.069]],0.0025,0x344945,12,6));
  }
  return parts;
}

function ray(detail) {
  const parts=[skin(detail*2,detail*2,(u,v)=>{
    const x=(u-0.5)*1.15,z=(v-0.5)*1.65*Math.pow(Math.sin(Math.PI*(u*0.96+0.02)),0.6);
    const y=0.075*Math.exp(-z*z*22)*(0.5+Math.sin(u*Math.PI)*0.5)-Math.abs(z)*0.11+Math.sin(v*TAU)*0.025;
    return [x,y,z];
  },(u,v)=>new THREE.Color(0x827b67).multiplyScalar(0.82+Math.sin(u*130)*Math.sin(v*87)*0.09))];
  parts.push(taperedArm([[-0.48,0,0],[-0.9,0,0.05],[-1.3,0.06,0.18],[-1.6,0.17,0.09]],0.032,0x706e5b,detail*2));
  for(const s of [-1,1]){
    parts.push(ellipsoid([0.23,0.072,s*0.1],[0.055,0.04,0.026],0x99937c,detail));
    parts.push(ellipsoid([0.245,0.094,s*0.1],[0.023,0.014,0.023],0x151f1a,detail));
    for(let i=0;i<5;i++)parts.push(tube([[0.06-i*0.045,-0.015,s*0.07],[0.07-i*0.045,-0.02,s*0.14],[0.1-i*0.045,-0.016,s*0.2]],0.003,0x3f473c,10,5));
  }
  return parts;
}

function octopus(detail) {
  const parts=[ellipsoid([0,0.24,0],[0.22,0.31,0.19],0xb36c50,detail*2)];
  for(let arm=0;arm<8;arm++){
    const a=arm*TAU/8,cs=Math.cos(a),sn=Math.sin(a);
    const points=[[cs*0.1,0.07,sn*0.1],[cs*0.36,-0.07,sn*0.36],[cs*0.7,-0.12,sn*0.7],[cs*0.9+sn*0.18,0.02,sn*0.9-cs*0.18]];
    parts.push(taperedArm(points,0.065,0xb87554,detail*2));
    const curve=new THREE.CatmullRomCurve3(points.map(vec));
    for(let i=0;i<16;i++)for(const side of [-1,1]){
      const u=0.1+i/19,p=curve.getPointAt(u),radius=0.018*(1-u)+0.004;
      p.y-=0.035*(1-u);p.x+=sn*side*radius;p.z-=cs*side*radius;
      const g=new THREE.TorusGeometry(radius,radius*0.3,6,10);g.rotateX(Math.PI/2);g.translate(p.x,p.y,p.z);parts.push(tint(g,0xd2b6a0));
    }
  }
  for(const s of [-1,1]){
    parts.push(ellipsoid([s*0.18,0.13,0.075],[0.058,0.063,0.052],0xbd8659,detail));
    parts.push(ellipsoid([s*0.2,0.14,0.108],[0.041,0.014,0.025],0x162427,detail));
  }
  return parts;
}

function jelly(detail) {
  const parts=[skin(detail,detail*2,(u,v)=>{
    const a=u*Math.PI*0.49,r=Math.sin(a)*0.39;return [Math.cos(v*TAU)*r,Math.cos(a)*0.28,Math.sin(v*TAU)*r];
  },(u,v)=>new THREE.Color(0xb6d0d3).lerp(new THREE.Color(0x977baa),u*0.3+Math.sin(v*8*TAU)*0.06))];
  for(let i=0;i<32;i++){
    const a=i*TAU/32,c=Math.cos(a),s=Math.sin(a);
    parts.push(taperedArm([[c*0.38,0.012,s*0.38],[c*0.4,-0.22,s*0.4],[c*0.36,-0.48,s*0.36],[c*0.28,-0.68,s*0.32]],0.005,0xbc9fbd,detail));
  }
  for(let i=0;i<4;i++){
    const a=i*Math.PI/2;
    parts.push(skin(detail,12,(u,v)=>{
      const r=0.09+Math.sin(u*15+v*TAU)*0.036;
      return [Math.cos(a)*r+Math.sin(a)*(v-0.5)*0.11,-u*0.75,Math.sin(a)*r+Math.cos(a)*(v-0.5)*0.11];
    },()=>0xc2a4c1));
  }
  return parts;
}

function crab(detail) {
  const parts=[ellipsoid([0,0.085,0],[0.27,0.12,0.21],0x9f5e42,detail*2)];
  for(const s of [-1,1]){
    for(let i=0;i<4;i++){
      const z=-0.15+i*0.09,x=s*(0.42+Math.sin(i)*0.06);
      parts.push(taperedArm([[s*0.17,0.07,z],[x,0.12,z-0.07],[x+s*0.12,-0.07,z-0.16]],0.024,0xbb7950,detail));
    }
    parts.push(taperedArm([[s*0.17,0.09,0.14],[s*0.34,0.12,0.26],[s*0.39,0.16,0.43]],0.039,0xb7734a,detail));
    parts.push(ellipsoid([s*0.35,0.17,0.44],[0.092,0.064,0.09],0xc28654,detail));
    for(const p of [-1,1])parts.push(taperedArm([[s*0.35+p*0.055,0.17,0.46],[s*0.35+p*0.06,0.19,0.56],[s*0.35+p*0.02,0.2,0.62]],0.028,0xd4a171,detail));
    parts.push(tube([[s*0.095,0.14,0.16],[s*0.115,0.22,0.21]],0.014,0x9b6b48,12,8));
    parts.push(ellipsoid([s*0.115,0.22,0.21],[0.025,0.025,0.025],0x172424,detail));
  }
  return parts;
}

function mussel(detail) {
  const parts=[];
  for(const side of [-1,1])parts.push(skin(detail*2,detail,(u,v)=>{
    const a=u*TAU,r=Math.sin(v*Math.PI*0.98+0.01),ridge=1+Math.sin(v*120)*0.012;
    return [Math.cos(a)*r*0.35*(0.86+Math.sin(a)*0.12),Math.sin(a)*r*0.2+0.2,side*Math.cos(v*Math.PI/2)*0.1*ridge];
  },(u,v)=>new THREE.Color(0x514f32).lerp(new THREE.Color(0xb0a56c),Math.pow(v,4)).multiplyScalar(0.82+Math.sin(v*120)*0.08)));
  parts.push(tube([[0.24,0.19,0],[0.32,0.22,0],[0.36,0.24,0]],0.021,0xb6a68e,detail,10));return parts;
}

function plant(kind,detail) {
  const parts=[];
  if(kind==="fungus"){
    for(let i=0;i<5;i++){
      const x=Math.sin(i*2.4)*0.25,z=Math.cos(i*2.4)*0.2,h=0.3+i*0.085;
      parts.push(taperedArm([[x,0,z],[x+0.02,h*0.5,z],[x,h,z]],0.025,0xcdbf9d,detail));
      parts.push(skin(detail,detail*2,(u,v)=>{const r=(0.02+u*0.98)*(0.13+i*0.015);return[x+Math.cos(v*TAU)*r,h+Math.cos(u*Math.PI/2)*0.085,z+Math.sin(v*TAU)*r];},(u)=>new THREE.Color(0x95734f).lerp(new THREE.Color(0xd0bf8e),u*0.5)));
      for(let g=0;g<30;g++){const a=g*TAU/30;parts.push(tube([[x,h,z],[x+Math.cos(a)*0.08,h+0.015,z+Math.sin(a)*0.08],[x+Math.cos(a)*(0.13+i*0.015),h,z+Math.sin(a)*(0.13+i*0.015)]],0.0016,0xddd3b3,8,4));}
    }
  } else if(kind==="coral"){
    for(let i=0;i<12;i++){
      const a=i*2.4,x=Math.cos(a)*0.32,z=Math.sin(a)*0.32,h=0.4+(i%4)*0.11;
      parts.push(taperedArm([[0,0,0],[x*0.5,h*0.4,z*0.5],[x,h,z]],0.055,0xbc967e,detail));
      for(let j=0;j<3;j++)parts.push(taperedArm([[x*0.7,h*0.65,z*0.7],[x+(j-1)*0.13,h*0.9,z+0.05],[x+(j-1)*0.18,h+0.18,z+0.09]],0.027,0xdab89a,detail));
    }
  } else if(kind==='kelp'){
    for(let i=0;i<14;i++){
      const a=i*2.4,dx=Math.cos(a),dz=Math.sin(a);
      parts.push(taperedArm([[0,0.06,0],[dx*0.06,0.018,dz*0.06],[dx*0.15,0.006,dz*0.15]],0.009,0x706442,18));
    }
    for(let i=0;i<6;i++){
      const a=i*2.4,dx=Math.cos(a),dz=Math.sin(a),height=0.8+(i%3)*0.19;
      const curve=new THREE.CatmullRomCurve3([[0,0.035,0],[dx*0.12,height*0.4,dz*0.12],[dx*0.32,height,dz*0.32]].map(vec));
      parts.push(tube(curve.points.map(p=>p.toArray()),0.006,0x837743,detail,8));
      for(let j=0;j<9;j++){
        const p=curve.getPoint(0.13+j*0.088),angle=a+j*2.4,direction=new THREE.Vector3(Math.cos(angle),0.26,Math.sin(angle));
        const across=new THREE.Vector3(-direction.z,0,direction.x),length=0.24+(j%4)*0.04;
        const bladder=p.clone().addScaledVector(direction,0.018);
        parts.push(ellipsoid(bladder.toArray(),[0.015,0.024,0.015],0x8b8047,Math.max(12,detail/2)));
        const root=p.clone().addScaledVector(direction,0.035);
        parts.push(skin(Math.max(28,detail),12,(u,v)=>{
          const width=0.045*Math.pow(Math.sin(u*Math.PI),0.75)*(2*v-1);
          const blade=root.clone().addScaledVector(direction,u*length).addScaledVector(across,width);
          blade.y+=0.095*Math.sin(u*Math.PI*0.85)+Math.sin(u*19+j)*Math.abs(width)*0.35;
          blade.z+=Math.sin(u*8+i)*u*u*0.025;
          return blade.toArray();
        },(u,v)=>new THREE.Color(0x887c35).multiplyScalar(0.84+u*0.17+Math.abs(v-0.5)*0.2)));
      }
    }
  } else {
    for(let i=0;i<9;i++){
      const a=i*2.4,dx=Math.cos(a),dz=Math.sin(a),h=0.55;
      const curve=new THREE.CatmullRomCurve3([[0,0,0],[dx*0.16,h*0.48,dz*0.16],[dx*0.48,h*0.9,dz*0.48]].map(vec));
      parts.push(tube(curve.points.map(p=>p.toArray()),0.007,0x58753d,detail,6));
      for(let j=1;j<14;j++)for(const side of [-1,1]){
        const p=curve.getPoint(j/14),length=(1-j/15)*0.16;
        parts.push(skin(10,8,(u,v)=>{
          const along=u*length,width=Math.sin(u*Math.PI)*0.017*(v-0.5)*2;
          return [p.x+side*dz*along+dx*width,p.y+along*0.4+Math.sin(u*9)*width*0.8,p.z-side*dx*along+dz*width];
        },(u,v)=>new THREE.Color(0x386b39).multiplyScalar(0.84+Math.abs(v-0.5)*0.35)));
      }
    }
  }
  return parts;
}

function bat(detail) {
  const parts=[ellipsoid([0,0,0],[0.095,0.12,0.06],0x625044,detail),ellipsoid([0,0.14,0],[0.07,0.067,0.045],0x705b49,detail)];
  for(const s of [-1,1]){
    for(let i=0;i<4;i++){
      const end=[s*(0.66-i*0.1),0.06-i*0.08,-0.06-i*0.045];
      fin([s*0.065,0.05,0],[s*0.36,0.18,0],end,0x866655,parts,5);
      parts.push(tube([[s*0.06,0.07,0],[s*0.36,0.18,0],end],0.006,0xb79a78,detail,6));
    }
    parts.push(ellipsoid([s*0.055,0.21,0],[0.028,0.077,0.012],0x9c7b66,detail));
    parts.push(ellipsoid([s*0.033,0.15,0.039],[0.008,0.009,0.005],0x172420,detail));
  }
  return parts;
}

export function createOrganismGeometry(kind,quality="ultra",variant=0) {
  if(!ORGANISM_KINDS.includes(kind))throw new Error(`Unknown organism anatomy: ${kind}`);
  const detail=quality==="exhaustive"?48:quality==="ultra"?32:18;
  const parts=kind.startsWith("fish-")?fish(kind,detail,variant):kind==="ray"?ray(detail):kind==="octopus"?octopus(detail):kind==="jelly"?jelly(detail):kind==="crab"?crab(detail):kind==="mussel"?mussel(detail):kind==="bat"?bat(detail):plant(kind,detail);
  const geometry=mergeGeometries(parts);for(const part of parts)part.dispose();
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  geometry.userData.anatomy={kind,quality,parts:parts.length,variant,representation:"procedural anatomical morphotype, not a scanned specimen"};
  return geometry;
}

export function createOrganismMaterial(kind) {
  const material=new THREE.MeshPhysicalMaterial({color:0xffffff,vertexColors:true,side:THREE.DoubleSide,
    roughness:["mussel","crab"].includes(kind)?0.38:0.57,metalness:0,
    clearcoat:kind.startsWith("fish-")?0.38:0.08,clearcoatRoughness:0.3,
    emissive:0x34433e,emissiveIntensity:0.025});
  const time={value:0};material.userData.organismTime=time;
  material.customProgramCacheKey=()=>`organism-motion-${kind}`;
  material.onBeforeCompile=shader=>{
    shader.uniforms.organismTime=time;
    shader.vertexShader=shader.vertexShader.replace("#include <common>","#include <common>\nuniform float organismTime;varying vec3 anatomyPoint;");
    const motion=kind.startsWith("fish-")?"transformed.z+=sin(organismTime*4.0+position.x*7.0)*0.027*(1.0-smoothstep(-0.6,0.25,position.x));"
      :kind==="ray"?"transformed.y+=sin(organismTime*2.3+abs(position.z)*6.0)*position.z*position.z*0.045;"
      :kind==="jelly"?"transformed.xz*=1.0+sin(organismTime*2.0)*0.035;transformed.y+=sin(organismTime*2.0+position.y*7.0)*0.016;"
      :kind==="octopus"?"transformed.y+=sin(organismTime*1.4+position.x*5.0+position.z*4.0)*0.018*(1.0-smoothstep(0.02,0.15,position.y));"
      :kind==="bat"?"transformed.z+=sin(organismTime*4.0)*abs(position.x)*0.12;"
      :["kelp","fern"].includes(kind)?"transformed.x+=sin(organismTime*0.8+position.y*3.0)*position.y*0.025;":"";
    shader.vertexShader=shader.vertexShader.replace("#include <begin_vertex>",`#include <begin_vertex>\nanatomyPoint=position;${motion}`);
    shader.fragmentShader=shader.fragmentShader.replace("#include <common>",`#include <common>
      varying vec3 anatomyPoint;
      float tissueHash(vec3 p){p=fract(p*0.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
      float tissueNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(mix(tissueHash(i),tissueHash(i+vec3(1,0,0)),f.x),mix(tissueHash(i+vec3(0,1,0)),tissueHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(tissueHash(i+vec3(0,0,1)),tissueHash(i+vec3(1,0,1)),f.x),mix(tissueHash(i+vec3(0,1,1)),tissueHash(i+1.0),f.x),f.y),f.z);}
    `).replace("#include <color_fragment>",`#include <color_fragment>
      float footprint=max(length(dFdx(anatomyPoint)),length(dFdy(anatomyPoint)));
      float mottling=tissueNoise(anatomyPoint*18.0);
      float micro=mix(0.5,tissueNoise(anatomyPoint*190.0),1.0-smoothstep(0.001,0.008,footprint));
      diffuseColor.rgb*=0.73+mottling*0.36+(micro-0.5)*0.12;
      ${kind==="octopus"?"diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.45,1.32,1.1),smoothstep(0.55,0.8,mottling)*0.6);":""}
    `);
  };
  return material;
}
