/*
 * Carnivore anatomy for the geo-sim organism kit.
 *
 * Morphotypes covered: variant 0 canid (wolf / fox), variant 1 felid (tiger / leopard / lion / lynx),
 * variant 2 bear (ursid). Each is a procedural morphotype and not a scanned specimen: the meshes are
 * built from parametric surfaces and primitives, so they read as the intended animal in silhouette and
 * in proportion, not as a measured or photogrammetric copy of any individual.
 *
 * Body proportions are chosen to read at the engine's on-screen size rather than to be anatomically
 * measurable: every judgement that is a display decision instead of an observation is marked
 * CALIBRATED below, and the module finishes by normalising the assembled animal into a fixed
 * per-variant display envelope (largest extent 1.2 units) so the silhouette survives the engine's
 * bodyScale instead of the mesh being modelled in real metres.
 *
 * Axis convention (the engine scales bodies along X): +X is the head end / forward, +Y is up,
 * +Z is the animal's left. Body length therefore runs along X.
 *
 * The felid variant is one morphotype -- a tiger-proportioned pantherine with a long muscular tail.
 * The mane collar is reserved for the lion and is emitted only when variant 1 is requested with the
 * second argument, carnivoreAnatomy(48,1,{mane:true}); the default felid is the maneless tiger build.
 */
import * as THREE from "three";

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

/*
 * Axis remap "fwd" -> "x". The three anatomies below are authored with +fwd as the muzzle end so the
 * heads stay readable while they are written; this is the single place that guarantees the engine's
 * convention (+X forward, +Y up, +Z the animal's left). A plain swap keeps winding, and therefore
 * computeVertexNormals output, unchanged.
 */
const xform=(g,mapFwd)=>g.applyMatrix4(mapFwd?new THREE.Matrix4().set(0,1,0,0,0,0,1,0,1,0,0,0,0,0,0,1):new THREE.Matrix4());
const put=(parts,geometry,mapFwd)=>parts.push(xform(geometry,mapFwd));

function colours(hex){const c=new THREE.Color(hex);return {c,shade:(k=1)=>c.clone().multiplyScalar(k)};}

function ringRadius(detail){return Math.max(5,Math.round(detail/4));}

/*
 * Display envelope per morphotype, CALIBRATED: height and width are expressed in the engine's own
 * units once the animal has been normalised to LENGTH units long. These are on-screen silhouette
 * judgements -- a low long canid, a slimmer and longer-backed felid, a short tall heavy bear -- and
 * they are deliberately decoupled from the raw modelling units above so the three morphotypes stay
 * legibly different however long each raw body happens to be authored.
 */
const LENGTH=1.2;
const ENVELOPE=[
  [0.400,0.345], // 0 canid: low slung, deep narrow chest, bushy low tail keeps the box shallow
  [0.395,0.320], // 1 felid: longer back than the canid but a slimmer, lithe waist and shoulder
  [0.560,0.440]  // 2 bear: short-backed and tall, the heavy barrel and shoulder hump dominate
];

function canid(detail,parts,mane){
  const ring=ringRadius(detail),legSeg=Math.max(20,detail);
  const hide=colours(0x8b7455),hideDark=colours(0x6d5a42),pelt=colours(0xc9bda3);
  // Deep narrow chest and tucked waist. CALIBRATED: ribcage length ~0.4 and waist pinch ~9% are
  // silhouette choices that read as a canid at engine scale, not measurements.
  const bodyRadius=x=>0.082+0.106*Math.exp(-Math.pow((x-0.14)/0.125,2))+0.05*Math.exp(-Math.pow((x+0.14)/0.15,2));
  const bodyLift=x=>0.005-0.03*Math.exp(-Math.pow((x-0.02)/0.16,2));
  put(parts,skin(detail*2,36,(u,v)=>{
    const x=-0.30+u*0.56,a=v*TAU,r=bodyRadius(x),shade=0.055+0.03*Math.sin(v*3.1)-0.03*Math.sin(v*7.3);
    return [x,bodyLift(x)+Math.sin(a)*r*0.93,Math.cos(a)*r*(0.66+shade)];
  },(u,v)=>{
    const top=Math.sin(v*TAU),base=hide.c.clone(),belly=pelt.c.clone();
    if(top<-0.35)base.lerp(belly,Math.min(1,(-top-0.35)/0.45)*0.85);
    return base.multiplyScalar(0.93+Math.sin(u*61)*0.045+Math.sin(u*17+2.1)*0.03+(top>0.6?0.05:0));
  },detail),false);
  put(parts,ellipsoid([0.155,-0.004,0],[0.19,0.026,0.115],pelt.c.getHex(),detail),false);
  put(parts,ellipsoid([-0.16,-0.03,0],[0.105,0.075,0.062],hideDark.c.getHex(),detail),false);
  // Neck ruff and throat frill.
  put(parts,skin(detail*2,detail*2,(u,v)=>{
    const x=0.245-Math.abs(v-0.5)*0.26,a=u*TAU,r=0.115+0.075*Math.pow(Math.sin(Math.PI*v),0.8);
    return [x,0.01+Math.sin(a)*r*0.92,Math.cos(a)*r*0.92];
  },(u,v)=>pelt.c.clone().multiplyScalar(0.78+0.18*Math.sin(v*12)+0.06*Math.sin(u*31)),detail),false);
  put(parts,tube([[0.25,0.05,0],[0.31,0.078,0],[0.365,0.082,0]],0.068,hideDark.c.getHex(),legSeg,ring),false);
  // Head: long tapering muzzle with a visible snout, dark nose and lip line.
  put(parts,ellipsoid([0.385,0.078,0],[0.072,0.063,0.058],hide.c.getHex(),detail),false);
  put(parts,ellipsoid([0.475,0.057,0],[0.079,0.041,0.039],hide.c.getHex(),detail),false);
  put(parts,ellipsoid([0.546,0.052,0],[0.015,0.014,0.017],0x1b1917,detail),false);
  put(parts,tube([[0.426,0.038,0],[0.552,0.045,0]],0.0045,0x2b2620,Math.max(14,detail),6),false);
  for(const s of [-1,1])put(parts,ellipsoid([0.428,0.086,s*0.05],[0.013,0.013,0.013],0x1c1a17,detail),false);
  // Erect triangular ears.
  for(const s of [-1,1])put(parts,skin(10,detail,(u,v)=>{
    const t=0.1+0.9*v,splay=0.38*s;
    return [0.355-(1-t)*0.048-t*t*0.03,0.118+t*0.098-u*0.026,splay*t*0.072+u*s*0.011];
  },(u,v)=>hideDark.c.clone().multiplyScalar(0.62+0.3*u+0.12*v)),false);
  // Bushy tail carried low: short bone, fat fur plume sloping down and back.
  const tail=[[-0.28,0.035,0],[-0.40,0.012,0],[-0.50,-0.042,0]];
  put(parts,tube(tail,0.036,hide.c.getHex(),legSeg,ring),false);
  const tailCurve=new THREE.CatmullRomCurve3(tail.map(vec));
  put(parts,skin(detail*2,22,(u,v)=>{
    const p=tailCurve.getPointAt(Math.min(0.999,u*0.94+0.03)),a=v*TAU,r=0.055*Math.sin(Math.PI*(0.14+u*0.86))*(0.88+0.12*Math.sin(a));
    return [p.x+Math.sin(u*15)*0.012,p.y+Math.sin(a)*r,p.z+Math.cos(a)*r];
  },(u,v)=>pelt.c.clone().multiplyScalar(0.84+0.12*Math.sin(v*9)+0.08*Math.sin(u*23))),false);
  // Four digitigrade legs with paws; hind legs tucked slightly narrower than the fore pair.
  for(const s of [-1,1])for(const fore of [true,false]){
    const shoulder=fore?[0.185,-0.03,0]:[-0.185,-0.04,0],width=fore?0.008:0.004;
    const knee=fore?[0.152,-0.145,s*0.078+width]:[-0.238,-0.138,s*0.075+width];
    const ankle=fore?[0.138,-0.218,s*0.074+width]:[-0.198,-0.212,s*0.072+width];
    put(parts,taperedArm([shoulder,knee,ankle,[fore?0.163:-0.176,-0.252,s*0.073]],fore?0.047:0.051,hide.c.getHex(),legSeg),false);
    put(parts,ellipsoid([fore?0.176:-0.163,-0.258,s*0.073],[0.038,0.022,0.027],hideDark.c.getHex(),detail),false);
    for(const t of [-1,1])put(parts,ellipsoid([(fore?0.203:-0.192)+Math.abs(t)*0.004,-0.262,s*0.073+t*0.013],[0.02,0.015,0.011],0x3a332b,detail),false);
  }
  // Optional collar kept so the canid call path stays total when options.mane is passed by mistake.
  if(mane)put(parts,skin(detail*2,detail,(u,v)=>{
    const a=u*TAU,r=0.148+0.042*Math.sin(TAU*v*7);
    return [0.275+(v-0.5)*0.3,0.012+Math.sin(a)*r*0.9,Math.cos(a)*r*0.9];
  },(u,v)=>hideDark.c.clone().multiplyScalar(0.82+0.2*Math.sin(v*9))),false);
}

function felid(detail,parts,mane){
  const ring=ringRadius(detail),legSeg=Math.max(20,detail);
  const coat=0xc08a3e,pale=0xe6dcc4,coatC=colours(coat),paleC=colours(pale);
  const stripe=(u,v,k=1)=>{const band=Math.sin(u*26)*Math.sin(v*13+1.7);return band>0.72?0.42:k;};
  const bodyRadius=x=>0.078+0.086*Math.exp(-Math.pow((x-0.06)/0.2,2))+0.042*Math.exp(-Math.pow((x+0.22)/0.16,2));
  const bodyLift=x=>0.012-0.012*Math.pow(x,2);
  put(parts,skin(detail*2,36,(u,v)=>{
    const x=-0.33+u*0.62,a=v*TAU,r=bodyRadius(x),shade=0.06+0.03*Math.sin(v*2.7);
    return [x,bodyLift(x)+Math.sin(a)*r*0.9,Math.cos(a)*r*(0.72+shade)];
  },(u,v)=>{
    const top=Math.sin(v*TAU),base=coatC.c.clone();
    if(top<-0.3)base.lerp(paleC.c,Math.min(1,(-top-0.3)/0.5)*0.9);
    return base.multiplyScalar(stripe(u,v,0.96+Math.sin(u*43)*0.035));
  },detail),false);
  // Lithe waist under a long back, with a heavier shoulder and haunch over the top.
  put(parts,ellipsoid([-0.245,-0.012,0],[0.105,0.092,0.082],coatC.c.getHex(),detail),false);
  put(parts,ellipsoid([0.085,-0.012,0],[0.088,0.058,0.048],paleC.c.getHex(),detail),false);
  put(parts,ellipsoid([0,0.015,0],[0.14,0.03,0.09],paleC.c.getHex(),detail),false);
  // Rounded head with a short muzzle and a cheek ruff; lip line is short, unlike the canid snout.
  put(parts,ellipsoid([0.415,0.086,0],[0.086,0.075,0.082],coat,detail),false);
  put(parts,ellipsoid([0.483,0.061,0],[0.052,0.043,0.05],pale,detail),false);
  put(parts,ellipsoid([0.528,0.057,0],[0.016,0.014,0.019],0x2a2024,detail),false);
  put(parts,tube([[0.508,0.044,0],[0.538,0.05,0]],0.004,0x2f2622,14,6),false);
  for(const s of [-1,1]){
    put(parts,skin(detail,detail*2,(u,v)=>{
      const a=v*TAU,r=0.05*(0.5+0.5*u);
      return [0.415+u*0.02,0.078+Math.sin(a)*r*1.1,s*0.075+Math.cos(a)*r];
    },(u,v)=>paleC.c.clone().multiplyScalar(0.94+0.1*Math.sin(v*7))),false);
    put(parts,ellipsoid([0.469,0.086,s*0.045],[0.015,0.015,0.015],0xd9c98a,detail),false);
    put(parts,ellipsoid([0.472,0.086,s*0.045],[0.006,0.012,0.006],0x1b1a16,detail),false);
    // Rounded ears.
    put(parts,ellipsoid([0.36+Math.abs(s)*0.005,0.168,s*0.066],[0.05,0.055,0.016],coat,detail),false);
    put(parts,ellipsoid([0.357,0.166,s*0.08],[0.031,0.035,0.008],0xb9776a,detail),false);
  }
  // Long muscular tail. CALIBRATED: the tail is held nearly level and only slightly hooked, which
  // keeps the total silhouette inside the display envelope while still reading as a pantherine tail.
  put(parts,tube([[0.29,0.0,0],[0.14,0.035,0],[0.0,0.03,0]],0.072,coat,legSeg,ring),false);
  const tail=[[-0.32,0.018,0],[-0.44,-0.01,0.012],[-0.54,-0.055,0.03],[-0.61,-0.088,0.05]];
  put(parts,taperedArm(tail,0.056,coat,legSeg),false);
  const tailCurve=new THREE.CatmullRomCurve3(tail.map(vec));
  put(parts,skin(detail*2,20,(u,v)=>{
    const p=tailCurve.getPointAt(Math.min(0.999,0.04+u*0.96)),a=v*TAU;
    const r=(0.014+0.004*Math.sin(u*21))*Math.sin(Math.PI*(0.05+u*0.95));
    return [p.x,p.y+Math.sin(a)*r,p.z+Math.cos(a)*r];
  },(u,v)=>{
    const tuft=mane?Math.max(0,Math.sin((u-0.55)*4.2)):0;
    return coatC.c.clone().multiplyScalar(stripe(u*1.3,v,0.9+0.12*Math.sin(v*13))+tuft*0.36);
  }),false);
  // Retractile-paw forelimbs: paw carries the pad, with clawed digits held back.
  for(const s of [-1,1]){
    put(parts,taperedArm([[0.205,-0.02,s*0.085],[0.19,-0.16,s*0.088],[0.185,-0.255,s*0.085],[0.2,-0.285,s*0.083]],0.054,coat,legSeg),false);
    put(parts,ellipsoid([0.222,-0.291,s*0.083],[0.043,0.021,0.03],coat,detail),false);
    for(const t of [-1,0,1])put(parts,ellipsoid([0.252,-0.293,s*0.083+t*0.015],[0.017,0.014,0.011],pale,detail),false);
    for(const t of [-1,0,1])put(parts,tube([[0.243,-0.296,s*0.083+t*0.015],[0.268,-0.294,s*0.083+t*0.016]],0.0032,0x3a332c,10,5),false);
    put(parts,taperedArm([[-0.245,-0.02,s*0.09],[-0.262,-0.15,s*0.092],[-0.315,-0.22,s*0.088],[-0.29,-0.282,s*0.084]],0.057,coat,legSeg),false);
    put(parts,ellipsoid([-0.272,-0.289,s*0.084],[0.046,0.022,0.032],coat,detail),false);
    for(const t of [-1,0,1])put(parts,ellipsoid([-0.243,-0.291,s*0.084+t*0.016],[0.018,0.015,0.012],pale,detail),false);
  }
  // Lion mane collar: reserved for the lion morphotype, requested explicitly.
  if(mane)put(parts,skin(detail*3,detail*2,(u,v)=>{
    const a=u*TAU,r=0.132+0.045*Math.sin(TAU*v*6+1.2)+0.02*Math.sin(u*17);
    return [0.35+(v-0.5)*0.34,0.02+Math.sin(a)*r*0.95,Math.cos(a)*r];
  },(u,v)=>new THREE.Color(0x7a5730).multiplyScalar(0.78+0.22*Math.sin(v*11)+0.08*Math.sin(u*23))),false);
}

function bear(detail,parts,mane){
  const ring=ringRadius(detail),legSeg=Math.max(20,detail);
  const fur=0x4a3a2d,furDark=0x372b21;
  const furC=colours(fur);
  // Heavy barrel torso. CALIBRATED: barrel radius ~0.20 against the 0.55 body length is the display
  // ratio that makes the bear read as massive beside the canid and felid at the same on-screen length.
  const bodyRadius=x=>0.196+0.116*Math.exp(-Math.pow(x/0.5,4))-0.045*Math.max(0,x-0.18);
  const bodyLift=x=>-0.012+0.02*Math.exp(-Math.pow(x/0.3,2));
  put(parts,skin(detail*2,36,(u,v)=>{
    const x=-0.29+u*0.58,a=v*TAU,r=bodyRadius(x),shade=0.045+0.025*Math.sin(v*3.4);
    // Shoulder hump: the back rises above the barrel ridge at the withers and falls to the rump.
    const hump=Math.max(0,Math.sin(a))*0.062*Math.exp(-Math.pow((x-0.13)/0.15,2));
    return [x,bodyLift(x)+Math.sin(a)*r*0.86+hump,Math.cos(a)*r*(0.74+shade)];
  },(u,v)=>{
    const top=Math.sin(v*TAU),base=furC.c.clone();
    if(top<-0.45)base.lerp(new THREE.Color(0x54432f),0.7);
    return base.multiplyScalar(0.93+Math.sin(u*37)*0.04+Math.sin(u*11+1.3)*0.035);
  },detail),false);
  // High shoulder hump.
  put(parts,ellipsoid([0.115,0.115,0],[0.115,0.088,0.095],fur,detail),false);
  put(parts,ellipsoid([0.19,0.072,0],[0.105,0.072,0.098],fur,detail),false);
  put(parts,ellipsoid([-0.245,-0.02,0],[0.105,0.085,0.085],furDark,detail),false);
  // Short face, blunt muzzle, small rounded ears.
  put(parts,ellipsoid([0.345,0.062,0],[0.112,0.098,0.098],fur,detail),false);
  put(parts,ellipsoid([0.455,0.035,0],[0.058,0.048,0.048],furDark,detail),false);
  put(parts,ellipsoid([0.498,0.032,0],[0.018,0.016,0.02],0x1a1512,detail),false);
  for(const s of [-1,1]){
    put(parts,ellipsoid([0.408,0.086,s*0.055],[0.014,0.014,0.014],0x141110,detail),false);
    put(parts,ellipsoid([0.325,0.158,s*0.076],[0.036,0.03,0.013],fur,detail),false);
    put(parts,ellipsoid([0.322,0.157,s*0.082],[0.023,0.019,0.007],0x5d4a3c,detail),false);
  }
  // Plantigrade limbs: broad flat feet that sit flat on the ground plane.
  for(const s of [-1,1])for(const fore of [true,false]){
    const hip=fore?[0.16,-0.06,s*0.125]:[-0.2,-0.06,s*0.12];
    const mid=fore?[0.175,-0.2,s*0.132]:[-0.245,-0.185,s*0.128];
    const ankle=fore?[0.155,-0.3,s*0.13]:[-0.2,-0.31,s*0.126];
    put(parts,taperedArm([hip,mid,ankle,[fore?0.175:-0.175,-0.352,s*0.13]],fore?0.098:0.104,fur,legSeg),false);
    put(parts,ellipsoid([fore?0.198:-0.152,-0.357,s*0.13],[0.062,0.019,0.05],furDark,detail),false);
    for(const t of [-1,0,1])put(parts,ellipsoid([(fore?0.248:-0.202)+(t===0?0.008:0),-0.359,s*0.13+t*0.026],[0.022,0.015,0.015],0x2b2119,detail),false);
  }
  if(mane)put(parts,skin(detail*2,detail,(u,v)=>{
    const a=u*TAU,r=0.2+0.05*Math.sin(TAU*v*5);
    return [0.3+(v-0.5)*0.3,0.05+Math.sin(a)*r,Math.cos(a)*r];
  },(u,v)=>furC.c.clone().multiplyScalar(0.85+0.2*Math.sin(v*7))),false);
}

/*
 * Assemble the parts into the fixed display envelope for the morphotype. Topology, colour and uv are
 * untouched; only a rigid translate plus an axis scale is applied. The cross sections are scaled so
 * that the FINISHED length is exactly LENGTH, which is why the height and width factors divide by
 * size.y/size.z rather than by the raw units the bodies were authored in. Every tier runs through
 * exactly the same step, so returned bounding boxes agree across detail levels.
 */
function normalise(parts,variant){
  const box=new THREE.Box3();
  for(const part of parts){part.computeBoundingBox();box.union(part.boundingBox);}
  const size=new THREE.Vector3();box.getSize(size),size.x=Math.max(size.x,1e-6),size.y=Math.max(size.y,1e-6),size.z=Math.max(size.z,1e-6);
  // CALIBRATED: LENGTH units is the target length; the engine's own bodyScale supplies the real size.
  const [height,width]=ENVELOPE[variant];
  const scale=new THREE.Vector3(LENGTH/size.x,LENGTH*height/size.y,LENGTH*width/size.z);
  const centre=new THREE.Vector3();box.getCenter(centre);
  for(const part of parts){
    part.translate(-centre.x,-centre.y,-centre.z);part.scale(scale.x,scale.y,scale.z);
    part.computeBoundingBox();part.computeBoundingSphere();
  }
  return parts;
}

export function carnivoreAnatomy(detail,variant=0,options={}){
  const segments=Math.max(6,Math.round(Number(detail)||0));
  const morphotype=Math.abs(Math.floor(Number(variant)||0))%3;
  const mane=Boolean(options&&options.mane);
  const parts=[];
  if(morphotype===0)canid(segments,parts,mane);
  else if(morphotype===1)felid(segments,parts,mane);
  else bear(segments,parts,mane);
  return normalise(parts,morphotype);
}
