import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export const REBUILT_FACILITY_KINDS = Object.freeze([
  "setback-tower", "courtyard-midrise", "l-plan-lowrise", "sawtooth-industrial",
  "cross-plan-civic", "hipped-roof", "tapered-landmark", "process-tank",
  "water-tower-tank", "tunnel-portal", "utility-gallery", "buttress-dam",
  "stepped-spillway", "bridge-pier", "crowned-road", "solar-panel-frame",
  "turbine-blade", "greenhouse-bay", "stadium-bowl", "observatory-dome", "crane-boom"
]);

// Normalized display envelopes retain existing placement transforms and pivots.
export function createFacilityGeometry(kind, quality = "ultra") {
  if (!REBUILT_FACILITY_KINDS.includes(kind)) return null;
  const tier = quality === "exhaustive" ? 2 : quality === "ultra" ? 1 : 0;
  const radial = [16, 28, 44][tier], parts = [];
  const wall = 0xe7e4dc, trim = 0xf4f1e9, glass = 0x6d9cab, metal = 0x9eacb0;
  const put = (geometry, color, position = [0, 0, 0], rotation = [0, 0, 0]) => {
    geometry.rotateX(rotation[0]); geometry.rotateY(rotation[1]); geometry.rotateZ(rotation[2]);
    geometry.translate(...position);
    const rgb = new THREE.Color(color), values = new Float32Array(geometry.attributes.position.count * 3);
    const response = new Float32Array(geometry.attributes.position.count * 2);
    const glazed = [glass,0x679aaa,0x94bdb1,0xaccdc0].includes(color);
    const metallic = color === metal;
    for(let i=0;i<response.length;i+=2){response[i]=glazed?0.18:metallic?0.40:0.86;response[i+1]=metallic?0.55:0;}
    for (let i = 0; i < values.length; i += 3) rgb.toArray(values, i);
    geometry.setAttribute("color", new THREE.BufferAttribute(values, 3));
    geometry.setAttribute("constructionResponse", new THREE.BufferAttribute(response, 2));
    const source = geometry.index ? geometry.toNonIndexed() : geometry;
    source.deleteAttribute("uv"); parts.push(source);
    if (source !== geometry) geometry.dispose();
  };
  const box = (p, size, color = wall, bevel = 0.006) => put(
    new RoundedBoxGeometry(...size, tier + 1, Math.min(bevel, ...size.map(s => s * 0.16))), color, p);
  const cylinder = (p, radius, height, color = metal) => put(new THREE.CylinderGeometry(radius, radius, height, radial), color, p);
  const tube = (points, radius, color = metal) => put(new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 12 + tier * 8, radius, 8 + tier * 4, false), color);
  const ring = (radius, tubeRadius, p, color = metal) => put(new THREE.TorusGeometry(radius, tubeRadius, 6 + tier * 2, radial), color, p, [Math.PI / 2, 0, 0]);
  const block = (p, size, rows, cols) => {
    box(p, size);
    const [x, y, z] = p, [w, h, d] = size;
    // Glazing sits inside raised reveals; no coplanar facade overlays.
    for (let face = 0; face < 4; face++) {
      const alongX = face < 2, sign = face % 2 ? -1 : 1, width = alongX ? w : d;
      const windows = Math.max(1, Math.round(cols * width / w));
      for (let row = 0; row < rows; row++) for (let col = 0; col < windows; col++) {
        const u = (col + 0.5) / windows - 0.5;
        const yy = y - h / 2 + (row + 0.6) * h / rows;
        const ww = width / windows * 0.64, hh = h / rows * 0.55;
        const position = alongX ? [x + u * w, yy, z + sign * (d / 2 + 0.001)] : [x + sign * (w / 2 + 0.001), yy, z + u * d];
        box(position, alongX ? [ww, hh, 0.006] : [0.006, hh, ww], glass, 0.001);
        const sill = [...position]; sill[1] -= hh / 2 + 0.003;
        box(sill, alongX ? [ww + 0.015, 0.01, 0.014] : [0.014, 0.01, ww + 0.015], trim, 0.001);
        const mullion = [...position];
        box(mullion, alongX ? [0.007, hh, 0.012] : [0.012, hh, 0.007], metal, 0.001);
      }
    }
    box([x, y + h / 2 + 0.009, z], [w + 0.025, 0.018, d + 0.025], trim);
  };
  const roof = (x, y, z, w, h, d) => {
    const vertices = [[-w/2,0,-d/2],[w/2,0,-d/2],[w/2,0,d/2],[-w/2,0,d/2],[0,h,-d*0.25],[0,h,d*0.25]];
    const faces = [0,4,1,1,4,5,1,5,2,2,5,3,3,5,4,3,4,0,0,1,2,0,2,3];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position",new THREE.Float32BufferAttribute(faces.flatMap(i=>vertices[i]),3));
    geometry.computeVertexNormals();put(geometry,0xac795d,[x,y,z]);
    const courses = 5 + tier * 3;
    for (const sign of [-1,1]) for (let row = 1; row < courses; row++) {
      const t = row / courses;
      box([x + sign * w / 2 * t, y + h * (1 - t) + 0.002, z], [0.012,0.009,d*(0.5+0.5*t)], 0xc69975, 0.001);
    }
    put(new THREE.CylinderGeometry(0.016,0.016,d*0.5+0.025,radial),0xc69975,[x,y+h,z],[Math.PI/2,0,0]);
  };
  if (kind === "setback-tower") {
    for (let level = 0; level < 3; level++) {
      const width = 0.94 - level * 0.18, height = level === 0 ? 0.36 : 0.28;
      block([0,-0.5+(level===0?0.18:0.36+(level-1)*0.28+0.14),0], [width,height,width*0.82],3+tier,3+tier);
    }
    box([0,0.46,0],[0.34,0.08,0.27],metal); cylinder([0,0.53,0],0.012,0.08);
  } else if (kind === "courtyard-midrise") {
    block([0,-0.06,-0.37],[0.96,0.86,0.22],4+tier,5+tier);
    block([0,-0.1,0.37],[0.96,0.78,0.22],4+tier,5+tier);
    block([-0.37,-0.12,0],[0.22,0.74,0.52],3+tier,1);
    block([0.37,-0.12,0],[0.22,0.74,0.52],3+tier,1);
    box([0,-0.48,0],[0.48,0.035,0.48],0xb6b2a4);
  } else if (kind === "l-plan-lowrise") {
    block([-0.15,-0.15,0.06],[0.66,0.62,0.68],2,3);
    block([0.31,-0.25,-0.22],[0.30,0.42,0.46],1,2);
    roof(-0.15,0.18,0.06,0.72,0.27,0.74); roof(0.31,-0.02,-0.22,0.35,0.19,0.52);
    box([-0.28,0.37,0.19],[0.07,0.22,0.07],0xb8aa9c);
    for (let step = 0; step < 3; step++) box([-0.15,-0.44+step*0.025,0.47-step*0.018],[0.20,0.035,0.08],trim);
  } else if (kind === "sawtooth-industrial") {
    block([0,-0.15,0],[0.96,0.64,0.96],2,4+tier);
    const bays = 4 + tier;
    for (let bay = 0; bay < bays; bay++) roof(-0.48+(bay+0.5)*0.96/bays,0.18,0,0.96/bays,0.20,0.98);
    box([0,-0.23,0.489],[0.34,0.37,0.012],0xa8b2b3);
    for (let row = 0; row < 9; row++) box([0,-0.39+row*0.04,0.497],[0.32,0.009,0.006],metal,0.001);
    tube([[0.37,0.16,-0.25],[0.37,0.46,-0.25],[0.3,0.49,-0.25]],0.023);
  } else if (kind === "cross-plan-civic") {
    block([0,-0.12,0],[0.40,0.72,0.96],3,2);
    block([0,-0.15,0],[0.96,0.66,0.40],3,5);
    box([0,0.30,0],[0.38,0.10,0.38],trim);
    for (const x of [-0.15,0.15]) cylinder([x,-0.15,0.52],0.023,0.55,trim);
    box([0,0.14,0.52],[0.4,0.04,0.18],trim);
  } else if (kind === "hipped-roof") {
    roof(0,-0.45,0,0.98,0.90,0.96);
  } else if (kind === "tapered-landmark") {
    const points = Array.from({length:17},(_,i)=>new THREE.Vector2(0.38*(1-i/22)+0.055*Math.sin(i/16*Math.PI*2),i/16-0.5));
    put(new THREE.LatheGeometry(points,radial*2),glass);
    for (let i=0;i<12+tier*6;i++) {const t=i/(12+tier*6),r=0.38*(1-t*16/22)+0.055*Math.sin(t*Math.PI*2);ring(r,0.007,[0,t-0.5,0],trim);}
    cylinder([0,0.49,0],0.115,0.025,trim);
  } else if (kind === "process-tank" || kind === "water-tower-tank") {
    const elevated = kind === "water-tower-tank", bottom = elevated ? -0.05 : -0.38, top = 0.32;
    cylinder([0,(top+bottom)/2,0],0.39,top-bottom,0xcbd3d1);
    put(new THREE.SphereGeometry(0.39,radial,radial/2,0,Math.PI*2,0,Math.PI/2),0xdce0da,[0,top,0]);
    parts.at(-1).scale(1,0.45,1); // Dome center is restored after scaling.
    parts.at(-1).translate(0,top*0.55,0);
    for (const y of [bottom, (bottom+top)/2,top]) ring(0.397,0.012,[0,y,0]);
    for (const x of [-0.075,0.075]) tube([[x,bottom,0.42],[x,top+0.10,0.42]],0.008);
    for (let i=0;i<12;i++) box([0,bottom+i*(top-bottom)/11,0.42],[0.16,0.008,0.014],metal,0.001);
    tube([[0.3,bottom+0.15,0],[0.48,bottom+0.15,0],[0.48,-0.45,0]],0.025);
  } else if (kind === "buttress-dam") {
    box([0,0,0.20],[0.98,0.94,0.14],0xc2c4bf);
    box([0,0.48,0.18],[1,0.035,0.27],trim);
    for(let i=0;i<5+tier*2;i++) {
      const x=-0.45+i*0.9/(4+tier*2),shape=new THREE.Shape();
      shape.moveTo(-0.42,-0.48);shape.lineTo(0.13,-0.48);shape.lineTo(0.13,0.43);shape.closePath();
      const g=new THREE.ExtrudeGeometry(shape,{depth:0.035,bevelEnabled:true,bevelSegments:tier+1,bevelSize:0.005,bevelThickness:0.005});
      put(g,wall,[x,0,0],[0,-Math.PI/2,0]);
    }
    for(const x of [-0.30,0,0.30]){box([x,-0.15,0.279],[0.14,0.48,0.014],metal);for(let i=0;i<7;i++)box([x,-0.36+i*0.07,0.29],[0.14,0.012,0.015],trim,0.002);}
  } else if (kind === "stepped-spillway") {
    const steps=8+tier*4;
    for(let i=0;i<steps;i++){const t=i/(steps-1);box([0,0.42-t*0.84,-0.45+t*0.9],[0.7,0.075,1/steps+0.015],wall);}
    for(const x of [-0.4,0.4])tube([[x,0.5,-0.5],[x,0.08,0],[x,-0.34,0.5]],0.035,trim);
  } else if (kind === "bridge-pier") {
    box([0,-0.44,0],[0.96,0.10,0.86],wall,0.02);
    for(const x of [-0.25,0.25]) {
      const g=new THREE.CylinderGeometry(0.13,0.17,0.76,radial);put(g,wall,[x,-0.01,0]);
      box([x,0.41,0],[0.25,0.07,0.29],metal);
    }
    box([0,0.35,0],[0.98,0.17,0.46],trim,0.03);
  } else if (kind === "crowned-road") {
    const geometry=new THREE.PlaneGeometry(1,1,4,8+tier*4);geometry.rotateX(-Math.PI/2);
    const position=geometry.attributes.position;
    for(let i=0;i<position.count;i++)position.setY(i,0.02*(1-Math.abs(position.getZ(i))*2));
    geometry.computeVertexNormals();put(geometry,0xa4a8a5);
    for(const z of [-0.47,0.47])box([0,0.018,z],[1,0.038,0.045],trim);
    for(let i=0;i<5+tier;i++)box([-0.43+i*0.86/(4+tier),0.023,0],[0.065,0.002,0.014],0xf0e4bb,0.0001);
  } else if (kind === "solar-panel-frame") {
    box([0,0,0],[0.98,0.035,0.98],metal);
    const columns=6+tier*2,rows=8+tier*2;
    for(let x=0;x<columns;x++)for(let z=0;z<rows;z++){
      const px=(x+0.5)/columns-0.5,pz=(z+0.5)/rows-0.5;
      box([px,0.025,pz],[0.94/columns,0.012,0.94/rows],0x679aaa,0.002);
      box([px,0.032,pz],[0.002,0.001,0.93/rows],0xc4d6d7,0.0001);
    }
    for(const z of [-0.35,0.35])box([0,-0.05,z],[0.88,0.065,0.035],metal);
  } else if (kind === "turbine-blade") {
    const rings=12+tier*8,sides=16+tier*8,positions=[],indices=[];
    for(let row=0;row<=rings;row++){
      const t=row/rings,chord=0.025+0.28*Math.sin((t*0.85+0.12)*Math.PI)*(1-t*0.7),twist=(1-t)*0.48;
      for(let side=0;side<sides;side++){
        const a=side/sides*Math.PI*2,x=Math.cos(a)*chord,z=Math.sin(a)*chord*0.16;
        positions.push(x*Math.cos(twist)-z*Math.sin(twist)+t*t*0.12,t-0.5,x*Math.sin(twist)+z*Math.cos(twist));
      }
    }
    for(let row=0;row<rings;row++)for(let side=0;side<sides;side++){
      const a=row*sides+side,b=row*sides+(side+1)%sides;indices.push(a,a+sides,b,b,a+sides,b+sides);
    }
    for(let i=1;i<sides-1;i++)indices.push(0,i+1,i,rings*sides,rings*sides+i,rings*sides+i+1);
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();put(g,trim);
  } else if (kind === "greenhouse-bay") {
    box([0,-0.45,0],[1,0.08,1],wall);
    for(let i=0;i<6+tier*2;i++){
      const z=-0.48+i*0.96/(5+tier*2);
      tube([[-0.47,-0.4,z],[-0.47,0.12,z],[0,0.47,z],[0.47,0.12,z],[0.47,-0.4,z]],0.012,trim);
    }
    for(const x of [-0.47,0.47])box([x,-0.13,0],[0.014,0.50,0.96],0x94bdb1);
    for(const sign of [-1,1]){
      const g=new THREE.PlaneGeometry(Math.hypot(0.47,0.35),0.96);g.rotateX(-Math.PI/2);g.rotateZ(sign*-Math.atan2(0.35,0.47));put(g,0xaccdc0,[sign*0.235,0.295,0]);
    }
  } else if (kind === "stadium-bowl") {
    const profile=[new THREE.Vector2(0.49,-0.44),new THREE.Vector2(0.49,0.33)];
    for(let i=10+tier*5;i>=0;i--){const t=i/(10+tier*5);profile.push(new THREE.Vector2(0.28+t*0.19,-0.4+t*0.7+0.025),new THREE.Vector2(0.28+t*0.19,-0.4+t*0.7));}
    profile.push(new THREE.Vector2(0.28,-0.44),new THREE.Vector2(0.49,-0.44));
    put(new THREE.LatheGeometry(profile,radial*2),wall);
    for(let i=0;i<10+tier*5;i++){
      const t=i/(9+tier*5),radius=0.29+t*0.19;
      ring(radius,0.012,[0,-0.4+t*0.70,0],i%3===0?0xb6cad0:0xd4d3c5);
    }
    cylinder([0,-0.44,0],0.49,0.055,wall);
    box([0,-0.40,0],[0.34,0.012,0.48],0x80a674);
  } else if (kind === "observatory-dome") {
    cylinder([0,-0.28,0],0.46,0.35,wall);ring(0.46,0.02,[0,-0.08,0],metal);
    put(new THREE.SphereGeometry(0.46,radial*2,radial,0.16,Math.PI*2-0.32,0,Math.PI/2),trim,[0,-0.08,0]);
    cylinder([0,-0.14,0],0.08,0.40,metal);
    tube([[0,0.01,0],[0.24,0.33,0]],0.06,0x8bafb9);
  } else if (kind === "crane-boom") {
    const bays=7+tier*3;
    for(const y of [-0.12,0.12])for(const z of [-0.12,0.12])tube([[-0.5,y,z],[0.5,y,z]],0.012,0xd4b967);
    for(let i=0;i<bays;i++)for(const z of [-0.12,0.12]){
      const x=-0.5+i/bays; tube([[x,-0.12,z],[x+1/bays,0.12,z]],0.008,0xe1ca85);
      tube([[x,0.12,z],[x+1/bays,-0.12,z]],0.008,0xe1ca85);
    }
    tube([[0.45,0.12,0],[0.45,-0.40,0]],0.008,metal);
  } else {
    // An extruded arch with an actual hole, not a dark rectangle painted on a wall.
    const shape = new THREE.Shape(); shape.moveTo(-0.49,-0.5);shape.lineTo(0.49,-0.5);shape.lineTo(0.49,0);
    shape.absarc(0,0,0.49,0,Math.PI,false);shape.closePath();
    const hole = new THREE.Path();hole.moveTo(-0.35,-0.43);hole.lineTo(-0.35,0);hole.absarc(0,0,0.35,Math.PI,0,true);hole.lineTo(0.35,-0.43);hole.closePath();shape.holes.push(hole);
    const depth = kind === "utility-gallery" ? 0.98 : 0.75;
    const shell = new THREE.ExtrudeGeometry(shape,{depth,steps:1,curveSegments:radial,bevelEnabled:true,bevelSegments:tier+1,bevelSize:0.008,bevelThickness:0.008});
    shell.translate(0,0,-depth/2);put(shell,wall);
    for (let i=0;i<5+tier*2;i++) {
      const z=-depth/2+0.04+i*(depth-0.08)/(4+tier*2);
      const arch = Array.from({length:17},(_,j)=>[0.326*Math.cos(j/16*Math.PI),0.326*Math.sin(j/16*Math.PI),z]);
      tube(arch,0.014,0xc5c5bc);
      for(const x of [-0.326,0.326])box([x,-0.21,z],[0.025,0.42,0.025],metal);
      box([0,0.33,z],[0.10,0.018,0.04],0xf1e4b0,0.002);
    }
    box([0,-0.46,0],[0.71,0.05,depth],0xa6aaa6);
    if(kind==='utility-gallery')for(const x of [-0.28,0.28])tube([[x,-0.20,-depth/2],[x,-0.20,depth/2]],0.035,0x9ebfc0);
  }
  const merged = mergeGeometries(parts,false); parts.forEach(part=>part.dispose());
  const geometry = mergeVertices(merged, 1e-6); merged.dispose();
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3()), center = geometry.boundingBox.getCenter(new THREE.Vector3());
  geometry.translate(-center.x,-center.y,-center.z); geometry.scale(1/size.x,1/size.y,1/size.z);
  geometry.userData.facilityRebuild = { version:1, kind, detailTier:tier, representation:"illustrative construction assembly; not a structural design" };
  return geometry;
}
