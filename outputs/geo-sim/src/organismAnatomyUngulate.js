import * as THREE from "three";

/*
 * Ungulate anatomy families for the geo-sim organism pipeline.
 *
 * `ungulateAnatomy` returns parts and does NOT merge them: the caller merges the
 * returned array with mergeGeometries, matching the other anatomy modules.
 *
 * Morphotypes covered, selected by `variant`:
 *   0 — cervid-antelope: deer / sheep / antelope.  Slender torso, four jointed
 *       legs with visible upper and lower segments and hooves, long neck held
 *       forward, wedge head with a muzzle, ears and eyes, and a branched
 *       antler beam on even variants.
 *   1 — moose: short body, high humped shoulders, long overhanging muzzle,
 *       palmate antler (a broad flattened blade carrying tines).
 *   2 — zebra / horse: deeper barrel chest, longer legs, upright neck with a
 *       mane ridge, long face, large ears, full tail with a tuft.
 *
 * Each family is a procedural morphotype, not a scanned specimen.  Every vertex
 * is generated from the primitives below, so the three families differ because
 * their construction parameters differ (body depth, neck angle, crown, tail),
 * not because measured landmark data was fitted to any individual animal.
 *
 * Body proportions are chosen so the silhouette reads at the engine's on-screen
 * size — an organism is a few dozen pixels tall — rather than to be
 * anatomically measurable.  The cues that survive that size (leg length, neck
 * angle, muzzle length, crown shape, tail) are exaggerated and everything else
 * (musculature, digits, jaw structure, coat pattern detail) is simplified away.
 * Lines marked CALIBRATED are proportions picked for that on-screen read rather
 * than observed from the morphotype.
 *
 * Axis convention, matching the engine's X-along-body scaling: +X is the head
 * end / forward, +Y is up, +Z is the animal's left.  Body length runs along X
 * and the hooves stand on y = 0, the ground plane the engine places an organism
 * on; the model is centred on x = 0 / z = 0.
 *
 * Parts are returned unmerged — the caller merges them.  Every part carries
 * position / normal / color / uv and is indexed.  `detail` is the quality
 * tier's subdivision count (18, 32 or 48) and is used directly for sphere
 * segments and tube segments so each tier differs visibly.
 */

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

// ---------------------------------------------------------------------------
// Local support.  Everything below only composes the primitives above.

// A subdivision count derived from the tier.  The floor keeps a degenerate
// 1-segment ring out of skin(); it never re-bands `detail` itself.
const seg=(detail,fraction)=>Math.max(1,Math.round(detail*fraction));

// Piecewise-linear control curve over [[u,value],...] stops.
function ramp(stops,u) {
  if(u<=stops[0][0])return stops[0][1];
  for(let i=1;i<stops.length;i++)if(u<=stops[i][0]){
    const previous=stops[i-1],current=stops[i],k=(u-previous[0])/Math.max(1e-9,current[0]-previous[0]);
    return previous[1]+(current[1]-previous[1])*k;
  }
  return stops[stops.length-1][1];
}

// Coat painter: darker along the back, pale countershading on the belly.
// CALIBRATED: the countershading weight and the faint banding frequency are
// chosen so the flank still reads as a lit surface at engine size.
function plainCoat(topHex,bellyHex,phase=0){
  const top=new THREE.Color(topHex),belly=new THREE.Color(bellyHex);
  return (u,v)=>{
    const up=Math.cos(v*TAU);
    return top.clone().lerp(belly,Math.pow(Math.max(0,-up),1.5)*0.78)
      .multiplyScalar(0.94+Math.sin(u*41+phase)*0.02+up*0.05+Math.sin(v*TAU*3+phase)*0.015);
  };
}

// CALIBRATED: nine body bands and the band width are picked so the stripes read
// as zebra striping at engine size instead of dissolving into grey.
function zebraCoat(){
  const light=new THREE.Color(0xd9d4c7),dark=new THREE.Color(0x2c2b28);
  return (u,v)=>{
    const up=Math.cos(v*TAU);
    const band=Math.sin(u*9*TAU+Math.sin(v*TAU)*1.15)*(1-Math.abs(up)*0.35);
    const coat=(band>0.18?dark.clone().lerp(light,0.12):light.clone()).multiplyScalar(0.93+up*0.06);
    return coat.lerp(dark,Math.max(0,-up)*0.22);
  };
}

// An elliptical loft from `from` to `to`: torso segments, skulls, muzzles,
// tail hair.  `droop` bends the axis down over its length.
function limbPart(from,to,radiusY,radiusZ,detail,color,options={}) {
  const {bulge=0,droop=0,lengthFraction=0.7,radialFraction=0.45}=options;
  const n=seg(detail,lengthFraction),m=seg(detail,radialFraction);
  return skin(n,m,(u,v)=>{
    const a=v*TAU,k=Math.sin(Math.PI*u)*bulge;
    return [from[0]+(to[0]-from[0])*u,
      from[1]+(to[1]-from[1])*u-droop*u*u+Math.cos(a)*(radiusY[0]+(radiusY[1]-radiusY[0])*u+k),
      from[2]+(to[2]-from[2])*u+Math.sin(a)*(radiusZ[0]+(radiusZ[1]-radiusZ[0])*u)];
  },color);
}

// Rotation wrapper around the repository's ellipsoid(): the helper is
// axis-aligned, and crown plates, eyes and ears need a tilt.
function tiltedEllipsoid(position,scale,color,segments,rotation) {
  const g=ellipsoid([0,0,0],scale,color,segments);
  if(rotation){g.rotateX(rotation[0]);g.rotateY(rotation[1]);g.rotateZ(rotation[2]);}
  g.translate(...position);return g;
}

// A leaf-shaped plate (ear, brow flap): length root->tip, width across,
// thickness along `outward`, closed at both ends by the collapsing width.
function earPlate(root,tip,outward,color,detail,halfWidth) {
  const o=vec(root),t=vec(tip),along=t.clone().sub(o),length=along.length();
  if(length<1e-6)return null;
  along.divideScalar(length);
  const out=vec(outward).normalize();
  const across=new THREE.Vector3().crossVectors(along,out).normalize();
  return skin(seg(detail,0.55),seg(detail,0.3),(u,v)=>{
    const w=(v-0.5)*2;
    const p=o.clone().addScaledVector(along,u*length)
      .addScaledVector(across,w*halfWidth*Math.sin(Math.pow(u,0.72)*Math.PI));
    p.addScaledVector(out,Math.cos(w*Math.PI*0.5)*halfWidth*0.34*(1-u*0.45));
    return p.toArray();
  },(u,v)=>new THREE.Color(color).multiplyScalar(0.72+u*0.32+Math.abs(v-0.5)*0.24));
}

// CALIBRATED: a hoof is a truncated cone about a third of the cannon-bone
// radius in height, sized to survive at engine size as a dark foot tip.
function hoof(foot,radius,color,detail) {
  return skin(seg(detail,0.35),seg(detail,0.45),(u,v)=>{
    const a=v*TAU,r=radius*(1.05-u*0.6);
    return [foot[0]+(u-0.35)*radius*0.55,foot[1]+u*radius*2,foot[2]+Math.sin(a)*r];
  },(u,v)=>new THREE.Color(color).multiplyScalar(0.82+u*0.36+Math.cos(v*TAU)*0.06));
}

// One jointed leg: upper segment hip->knee, narrower lower segment
// knee->ankle, hoof at the ankle.  The knee is offset from the straight line
// between hip and ankle so the joint reads in silhouette.
function legAssembly(parts,plan,detail,side) {
  const m=p=>[p[0],p[1],side*p[2]];
  parts.push(taperedArm([m(plan.upper[0]),m(plan.upper[1]),m(plan.upper[2])],plan.radius,plan.upperColor,detail));
  parts.push(taperedArm([m(plan.lower[0]),m(plan.lower[1]),m(plan.lower[2])],plan.radius*0.66,plan.lowerColor,detail));
  parts.push(hoof(m(plan.foot),plan.hoofRadius,plan.hoofColor,detail));
}

// Branched antler: one arcing beam carrying separate tines, never a spike.
function branchAntler(parts,detail,side,color) {
  const s=side;
  parts.push(taperedArm([[0.452,0.694,s*0.030],[0.436,0.760,s*0.058],[0.408,0.820,s*0.080],[0.372,0.856,s*0.090]],0.013,color,detail));
  const tines=[
    [[0.444,0.716,s*0.038],[0.492,0.702,s*0.044],[0.520,0.696,s*0.046]],
    [[0.428,0.762,s*0.060],[0.470,0.806,s*0.054],[0.494,0.826,s*0.050]],
    [[0.404,0.816,s*0.078],[0.436,0.856,s*0.072],[0.452,0.874,s*0.068]]
  ];
  for(const tine of tines)parts.push(taperedArm(tine,0.0065,new THREE.Color(color).multiplyScalar(1.08).getHex(),seg(detail,0.5)));
}

// Swept horns for the odd (sheep / antelope) variants of the same morphotype.
function sweptHorns(parts,detail,side,color) {
  const s=side;
  parts.push(taperedArm([[0.444,0.700,s*0.032],[0.436,0.756,s*0.056],[0.410,0.794,s*0.070],[0.378,0.806,s*0.064]],0.015,color,detail));
}

// Palmate antler: a beam up to a broad flattened blade whose outer rim
// carries tines.  CALIBRATED: the blade is roughly twice as wide as it is
// deep, which is what separates it from variant 0's branched beam on screen.
function palmateAntler(parts,detail,side,color) {
  const s=side;
  parts.push(taperedArm([[0.362,0.596,s*0.040],[0.340,0.658,s*0.096],[0.318,0.704,s*0.138]],0.020,color,detail));
  const centre=[0.286,0.744,s*0.166];
  parts.push(tiltedEllipsoid(centre,[0.104,0.017,0.076],color,detail,[-0.30*s,0,0.16*s]));
  const tineColor=new THREE.Color(color).multiplyScalar(1.06).getHex();
  for(let i=0;i<5;i++){
    const a=-0.15+i*(2.5/4);
    const root=[centre[0]+Math.cos(a)*0.084,centre[1]+0.012,centre[2]+s*Math.sin(a)*0.062];
    parts.push(taperedArm([root,[root[0]+Math.cos(a)*0.014,root[1]+0.032,root[2]+s*Math.sin(a)*0.014],
      [root[0]+Math.cos(a)*0.022,root[1]+0.052,root[2]+s*Math.sin(a)*0.024]],0.0085,tineColor,seg(detail,0.5)));
  }
}

// Mane ridge: a thin fin standing off the neck's upper surface plus loose
// strands, so the horse's crest reads without a separate hair system.
function maneRidge(points,height,thickness,color,detail,strandCount) {
  const curve=new THREE.CatmullRomCurve3(points.map(vec));
  const crestAt=u=>height*Math.sin(Math.pow(u,0.6)*Math.PI*0.94);
  const parts=[skin(seg(detail,0.8),seg(detail,0.3),(u,v)=>{
    const w=(v-0.5)*2,p=curve.getPointAt(u),t=curve.getTangentAt(u);
    const up=new THREE.Vector3(-t.y,t.x,0).normalize(),crest=crestAt(u)*(1-Math.abs(w)*0.35);
    return [p.x+up.x*crest,p.y+up.y*crest,p.z+w*thickness];
  },(u,v)=>new THREE.Color(color).multiplyScalar(0.76+Math.abs(v-0.5)*0.42+0.05*Math.sin(u*53)))];
  for(let i=0;i<strandCount;i++){
    const u=0.08+i*(0.86/Math.max(1,strandCount-1));
    const p=curve.getPointAt(u),t=curve.getTangentAt(u),up=new THREE.Vector3(-t.y,t.x,0).normalize();
    const root=p.clone().addScaledVector(up,crestAt(u)*0.55);
    parts.push(taperedArm([root.toArray(),root.clone().addScaledVector(up,0.022).toArray(),
      root.clone().addScaledVector(up,0.018).add(new THREE.Vector3(0,0,0.017)).toArray()],0.0045,color,seg(detail,0.4)));
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Morphotype 0 — cervid-antelope (deer / sheep / antelope).

function cervidAntelopeAnatomy(detail,variant) {
  const parts=[],sides=[1,-1];
  const coat=plainCoat(0x9b704c,0xd8c6a6,0),headCoat=plainCoat(0x9b704c,0xc3ad8c,3.1);
  const muzzleCoat=plainCoat(0x8f6642,0xb59a78,5.2);
  const rear=-0.300,chest=0.245;
  parts.push(skin(seg(detail,2),40,(u,v)=>{
    const a=v*TAU;
    const back=ramp([[0,0.505],[0.28,0.552],[0.62,0.560],[0.86,0.540],[1,0.505]],u);
    const belly=ramp([[0,0.405],[0.3,0.362],[0.66,0.356],[1,0.416]],u);
    const width=ramp([[0,0.050],[0.14,0.080],[0.5,0.072],[0.8,0.082],[1,0.058]],u);
    return [rear+u*(chest-rear),(back+belly)/2+Math.cos(a)*(back-belly)/2,Math.sin(a)*width*(1+Math.cos(a)*0.12)];
  },coat));
  for(const side of sides){
    legAssembly(parts,{upper:[[0.158,0.430,0.050],[0.148,0.338,0.054],[0.132,0.252,0.055]],
      lower:[[0.132,0.252,0.055],[0.150,0.158,0.054],[0.166,0.070,0.052]],foot:[0.166,0,0.052],
      radius:0.026,hoofRadius:0.024,upperColor:0x8a6440,lowerColor:0xa98a67,hoofColor:0x2b2620},detail,side);
    legAssembly(parts,{upper:[[-0.190,0.428,0.052],[-0.168,0.336,0.058],[-0.152,0.262,0.058]],
      lower:[[-0.152,0.262,0.058],[-0.206,0.132,0.056],[-0.200,0.062,0.054]],foot:[-0.196,0,0.054],
      radius:0.030,hoofRadius:0.027,upperColor:0x8a6440,lowerColor:0xa98a67,hoofColor:0x2b2620},detail,side);
  }
  parts.push(taperedArm([[0.212,0.498,0],[0.286,0.556,0],[0.352,0.604,0],[0.406,0.640,0]],0.058,0x8a6440,detail));
  parts.push(limbPart([0.398,0.664,0],[0.522,0.628,0],[0.064,0.040],[0.050,0.032],detail,headCoat,{bulge:0.004,droop:0.004}));
  parts.push(limbPart([0.505,0.632,0],[0.608,0.586,0],[0.038,0.020],[0.030,0.015],detail,muzzleCoat,{droop:0.010,bulge:0.002,lengthFraction:0.6,radialFraction:0.4}));
  parts.push(ellipsoid([0.610,0.578,0],[0.017,0.014,0.012],0x33291f,detail));
  for(const side of sides){
    const ear=earPlate([0.418,0.688,side*0.030],[0.352,0.782,side*0.070],[0.50,-0.15,side*0.85],0x8b6444,detail,0.030);
    if(ear)parts.push(ear);
    parts.push(ellipsoid([0.470,0.652,side*0.042],[0.020,0.019,0.014],0x1a1512,detail));
    parts.push(ellipsoid([0.474,0.654,side*0.050],[0.010,0.010,0.006],0x0a0908,detail));
    if(variant%2===0)branchAntler(parts,detail,side,0xb7a080);
    else sweptHorns(parts,detail,side,0x8d8071);
  }
  parts.push(tube([[-0.296,0.468,0],[-0.340,0.426,0],[-0.356,0.372,0]],0.016,0x7d5838,detail,Math.round(detail/3)));
  parts.push(ellipsoid([-0.358,0.352,0],[0.016,0.030,0.016],0x6b4a30,detail));
  return parts;
}

// ---------------------------------------------------------------------------
// Morphotype 1 — moose: short body, humped shoulders, overhanging muzzle.

function mooseAnatomy(detail) {
  const parts=[],sides=[1,-1];
  const coat=plainCoat(0x6b5644,0xb0a08a,0.6),headCoat=plainCoat(0x6b5644,0xa2937d,2.4);
  const muzzleCoat=plainCoat(0x5d4a39,0x8d7f6a,4.4);
  const rear=-0.262,chest=0.226;
  parts.push(skin(seg(detail,2),40,(u,v)=>{
    const a=v*TAU;
    const back=ramp([[0,0.470],[0.20,0.520],[0.46,0.576],[0.66,0.598],[0.86,0.558],[1,0.520]],u);
    const belly=ramp([[0,0.335],[0.3,0.312],[0.7,0.320],[1,0.400]],u);
    const width=ramp([[0,0.055],[0.16,0.088],[0.5,0.084],[0.8,0.098],[1,0.070]],u);
    return [rear+u*(chest-rear),(back+belly)/2+Math.cos(a)*(back-belly)/2,Math.sin(a)*width*(1+Math.cos(a)*0.10)];
  },coat));
  // Shoulder hump: the withers mass that separates the moose silhouette.
  parts.push(ellipsoid([0.078,0.582,0],[0.118,0.072,0.086],0x735e4a,detail));
  for(const side of sides){
    legAssembly(parts,{upper:[[0.152,0.430,0.058],[0.142,0.336,0.062],[0.138,0.246,0.062]],
      lower:[[0.138,0.246,0.062],[0.150,0.156,0.060],[0.156,0.072,0.058]],foot:[0.156,0,0.058],
      radius:0.030,hoofRadius:0.028,upperColor:0x5b4a3a,lowerColor:0x6b5946,hoofColor:0x241f19},detail,side);
    legAssembly(parts,{upper:[[-0.166,0.428,0.060],[-0.146,0.334,0.066],[-0.130,0.256,0.066]],
      lower:[[-0.130,0.256,0.066],[-0.180,0.130,0.062],[-0.176,0.066,0.060]],foot:[-0.172,0,0.060],
      radius:0.034,hoofRadius:0.031,upperColor:0x5b4a3a,lowerColor:0x6b5946,hoofColor:0x241f19},detail,side);
  }
  parts.push(taperedArm([[0.198,0.500,0],[0.258,0.540,0],[0.312,0.556,0]],0.086,0x5b4a3a,detail));
  parts.push(limbPart([0.312,0.560,0],[0.452,0.546,0],[0.058,0.046],[0.050,0.040],detail,headCoat,{bulge:0.006,droop:0.004}));
  // Long muzzle that overhangs below the jaw line.
  parts.push(limbPart([0.436,0.548,0],[0.588,0.482,0],[0.042,0.026],[0.038,0.024],detail,muzzleCoat,{droop:0.022,lengthFraction:0.6,radialFraction:0.42}));
  parts.push(ellipsoid([0.588,0.452,0],[0.030,0.026,0.026],0x3b3025,detail));
  parts.push(taperedArm([[0.408,0.492,0],[0.418,0.436,0],[0.422,0.392,0]],0.026,0x574636,seg(detail,0.7)));
  for(const side of sides){
    const ear=earPlate([0.336,0.588,side*0.044],[0.286,0.640,side*0.086],[0.45,-0.2,side*0.87],0x6f5a45,detail,0.030);
    if(ear)parts.push(ear);
    parts.push(ellipsoid([0.392,0.560,side*0.042],[0.018,0.017,0.013],0x191410,detail));
    parts.push(ellipsoid([0.396,0.562,side*0.050],[0.009,0.009,0.006],0x090807,detail));
    palmateAntler(parts,detail,side,0xa89a80);
  }
  parts.push(tube([[-0.258,0.436,0],[-0.290,0.408,0],[-0.300,0.384,0]],0.014,0x574636,detail,Math.round(detail/3)));
  parts.push(ellipsoid([-0.302,0.370,0],[0.014,0.024,0.014],0x4b3a2c,detail));
  return parts;
}

// ---------------------------------------------------------------------------
// Morphotype 2 — zebra / horse: deep barrel, long legs, upright neck, mane,
// long face, large ears, full tufted tail.

function horseAnatomy(detail) {
  const parts=[],sides=[1,-1];
  const coat=zebraCoat(),headCoat=plainCoat(0xcfc9bc,0xe0dbd0,2.2);
  const neck=[[0.250,0.512,0],[0.330,0.610,0],[0.392,0.700,0],[0.428,0.760,0]];
  const rear=-0.318,chest=0.262;
  parts.push(skin(seg(detail,2),40,(u,v)=>{
    const a=v*TAU;
    const back=ramp([[0,0.520],[0.25,0.575],[0.60,0.578],[0.85,0.556],[1,0.520]],u);
    const belly=ramp([[0,0.395],[0.3,0.302],[0.66,0.298],[1,0.380]],u);
    const width=ramp([[0,0.056],[0.16,0.086],[0.5,0.080],[0.8,0.092],[1,0.064]],u);
    return [rear+u*(chest-rear),(back+belly)/2+Math.cos(a)*(back-belly)/2,Math.sin(a)*width*(1+Math.cos(a)*0.09)];
  },coat));
  for(const side of sides){
    legAssembly(parts,{upper:[[0.170,0.436,0.056],[0.166,0.336,0.060],[0.166,0.238,0.060]],
      lower:[[0.166,0.238,0.060],[0.174,0.148,0.058],[0.174,0.062,0.058]],foot:[0.174,0,0.058],
      radius:0.025,hoofRadius:0.023,upperColor:0x3f3d38,lowerColor:0x8d887d,hoofColor:0x232322},detail,side);
    legAssembly(parts,{upper:[[-0.200,0.434,0.058],[-0.180,0.334,0.064],[-0.160,0.248,0.064]],
      lower:[[-0.160,0.248,0.064],[-0.212,0.120,0.060],[-0.206,0.056,0.058]],foot:[-0.204,0,0.058],
      radius:0.029,hoofRadius:0.026,upperColor:0x3f3d38,lowerColor:0x8d887d,hoofColor:0x232322},detail,side);
  }
  parts.push(taperedArm(neck,0.062,0x5b574e,detail));
  parts.push(...maneRidge(neck,0.030,0.010,0x232323,detail,6));
  parts.push(limbPart([0.420,0.762,0],[0.500,0.744,0],[0.055,0.046],[0.046,0.040],detail,headCoat,{bulge:0.004}));
  // Long face: the horse's length is in the face, not the cranium.
  parts.push(limbPart([0.492,0.748,0],[0.638,0.652,0],[0.046,0.032],[0.042,0.030],detail,headCoat,{droop:0.006,lengthFraction:0.65,radialFraction:0.42}));
  parts.push(ellipsoid([0.642,0.632,0],[0.020,0.020,0.018],0x3a3a38,detail));
  for(const side of sides){
    const ear=earPlate([0.430,0.772,side*0.026],[0.394,0.890,side*0.058],[0.42,-0.22,side*0.88],0xcfc9bc,detail,0.034);
    if(ear)parts.push(ear);
    parts.push(ellipsoid([0.462,0.744,side*0.045],[0.019,0.018,0.014],0x1b1712,detail));
    parts.push(ellipsoid([0.466,0.746,side*0.053],[0.010,0.010,0.006],0x0a0908,detail));
  }
  // Full tail: dock, hanging hair mass and loose strands, never a stub.
  parts.push(taperedArm([[-0.310,0.468,0],[-0.352,0.384,0],[-0.386,0.268,0]],0.022,0x4a463d,detail));
  parts.push(limbPart([-0.384,0.276,0],[-0.394,0.140,0],[0.028,0.034],[0.024,0.030],detail,()=>0x26251f,{bulge:0.008,lengthFraction:0.6,radialFraction:0.4}));
  for(let i=0;i<3;i++){
    const a=(i-1)*0.5;
    parts.push(taperedArm([[-0.386,0.250,0],[-0.392-Math.cos(a)*0.008,0.190,Math.sin(a)*0.014],
      [-0.398-Math.cos(a)*0.014,0.132,Math.sin(a)*0.024]],0.008,0x201f1a,seg(detail,0.5)));
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Assembly.

// CALIBRATED: per-morphotype nose-to-tail length in engine units (the caller's
// bodyScale carries the real body size).  Mid-band on purpose — comfortably
// inside the 0.75..1.35 box the engine expects, while keeping the zebra longer
// than the deer and the moose short-bodied.  Scaling happens about x = 0 / z = 0
// with y = 0 fixed, so the hooves stay on the ground plane.
const BODY_LENGTH=[1.02,0.94,1.10];

function normaliseLength(parts,target) {
  const box=new THREE.Box3();
  for(const part of parts){part.computeBoundingBox();box.union(part.boundingBox);}
  const size=box.getSize(new THREE.Vector3()),centre=box.getCenter(new THREE.Vector3());
  if(!(size.x>1e-6))return;
  const k=target/size.x;
  for(const part of parts){
    part.translate(-centre.x,0,-centre.z);
    part.scale(k,k,k);
    part.computeBoundingBox();
  }
}

export function ungulateAnatomy(detail,variant) {
  const morphotype=Math.abs(Math.floor(Number(variant)||0))%3;
  const parts=morphotype===0?cervidAntelopeAnatomy(detail,variant)
    :morphotype===1?mooseAnatomy(detail)
    :horseAnatomy(detail);
  normaliseLength(parts,BODY_LENGTH[morphotype]);
  return parts;
}
