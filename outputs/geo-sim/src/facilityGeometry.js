import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { buildingDetailParts } from "./facilityEnvelopeDetails.js";
import { industrialDetailParts } from "./facilityIndustrialDetails.js";
import { civilDetailParts } from "./facilityCivilDetails.js";

export const REBUILT_FACILITY_KINDS = Object.freeze([
  "setback-tower", "courtyard-midrise", "l-plan-lowrise", "sawtooth-industrial",
  "cross-plan-civic", "hipped-roof", "tapered-landmark", "process-tank",
  "water-tower-tank", "tunnel-portal", "utility-gallery", "buttress-dam",
  "stepped-spillway", "bridge-pier", "crowned-road", "solar-panel-frame",
  "turbine-blade", "greenhouse-bay", "stadium-bowl", "observatory-dome", "crane-boom",
  "evacuation-shelter", "river-hatchery"
]);

// Normalized display envelopes retain existing placement transforms and pivots.
export function createFacilityGeometry(kind, quality = "ultra") {
  if (!REBUILT_FACILITY_KINDS.includes(kind)) return null;
  const tier = quality === "exhaustive" ? 2 : quality === "ultra" ? 1 : 0;
  const radial = [16, 28, 44][tier], parts = [];
  let windowOpenings=0,entrances=0,windowFrames=0,drainRuns=0;
  const wall = 0xe7e4dc, trim = 0xf4f1e9, glass = 0x6d9cab, metal = 0x9eacb0;
  const put = (geometry, color, position = [0, 0, 0], rotation = [0, 0, 0], sink = parts) => {
    geometry.rotateX(rotation[0]); geometry.rotateY(rotation[1]); geometry.rotateZ(rotation[2]);
    geometry.translate(...position);
    const rgb = new THREE.Color(color), values = new Float32Array(geometry.attributes.position.count * 3);
    const response = new Float32Array(geometry.attributes.position.count * 2);
    const glazed = [glass,0x679aaa,0x94bdb1,0xaccdc0,0x78b8ba].includes(color);
    const metallic = [metal,0x7896a1,0x91abb2].includes(color);
    for(let i=0;i<response.length;i+=2){response[i]=glazed?0.18:metallic?0.40:0.86;response[i+1]=metallic?0.55:0;}
    for (let i = 0; i < values.length; i += 3) rgb.toArray(values, i);
    geometry.setAttribute("color", new THREE.BufferAttribute(values, 3));
    geometry.setAttribute("constructionResponse", new THREE.BufferAttribute(response, 2));
    const source = geometry.index ? geometry.toNonIndexed() : geometry;
    source.deleteAttribute("uv"); sink.push(source);
    if (source !== geometry) geometry.dispose();
    // Returns the member it just added. The detail modules build their members through these helpers
    // and hand the results back for the caller to append, so a helper that only pushed would leave
    // them with nothing to return and silently contribute no members.
    return source;
  };
  const box = (p, size, color = wall, bevel = 0.006) => put(
    new RoundedBoxGeometry(...size, tier + 1, Math.min(bevel, ...size.map(s => s * 0.16))), color, p);
  const cylinder = (p, radius, height, color = metal) => put(new THREE.CylinderGeometry(radius, radius, height, radial), color, p);
  const tube = (points, radius, color = metal) => put(new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 12 + tier * 8, radius, 8 + tier * 4, false), color);
  const ring = (radius, tubeRadius, p, color = metal) => put(new THREE.TorusGeometry(radius, tubeRadius, 6 + tier * 2, radial), color, p, [Math.PI / 2, 0, 0]);
  const block = (p, size, rows, cols) => {
    const [x, y, z] = p, [w, h, d] = size;
    const thickness=Math.min(0.014,w*0.08,d*0.08);
    box([x,y-h/2+thickness/2,z],[w,thickness,d],wall,0.001);
    box([x,y+h/2-thickness/2,z],[w,thickness,d],wall,0.001);
    // Each facade is a continuous perforated wall, with glazing behind its outer face.
    for (let face = 0; face < 4; face++) {
      const alongX = face < 2, sign = face % 2 ? -1 : 1, width = alongX ? w : d;
      const windows = Math.max(1, Math.round(cols * width / w));
      const shape=new THREE.Shape();
      shape.moveTo(-width/2,-h/2);shape.lineTo(width/2,-h/2);shape.lineTo(width/2,h/2);shape.lineTo(-width/2,h/2);shape.closePath();
      for (let row = 0; row < rows; row++) for (let col = 0; col < windows; col++) {
        const u = (col + 0.5) / windows - 0.5;
        let yy = y - h / 2 + (row + 0.6) * h / rows;
        const ww = width / windows * 0.64;
        let hh = h / rows * 0.55;
        if(face===0 && row===0 && col===Math.floor(windows/2) && y-h/2<=-0.43){
          const top=yy+hh/2,bottom=y-h/2+thickness;
          yy=(top+bottom)/2;hh=top-bottom;entrances++;
        }
        const left=u*width-ww/2,right=u*width+ww/2,bottom=yy-y-hh/2,top=yy-y+hh/2;
        const hole=new THREE.Path();hole.moveTo(left,bottom);hole.lineTo(left,top);hole.lineTo(right,top);hole.lineTo(right,bottom);hole.closePath();shape.holes.push(hole);windowOpenings++;
        const position = alongX ? [x + u * w, yy, z + sign * (d / 2 - thickness*0.7)] : [x + sign * (w / 2 - thickness*0.7), yy, z + u * d];
        box(position, alongX ? [ww, hh, 0.006] : [0.006, hh, ww], glass, 0.001);
        const sill = [...position]; sill[1] -= hh / 2 + 0.003;
        box(sill, alongX ? [ww + 0.015, 0.01, 0.014] : [0.014, 0.01, ww + 0.015], trim, 0.001);
        const mullion = [...position];
        box(mullion, alongX ? [0.007, hh, 0.012] : [0.012, hh, 0.007], metal, 0.001);
        const transom=[...position];transom[1]+=hh*0.15;
        box(transom,alongX?[ww,0.006,0.009]:[0.009,0.006,ww],metal,0.001);
        const frameDepth = thickness * 0.8;
        const faceAxis = alongX ? 2 : 0, spanAxis = alongX ? 0 : 2;
        const frame = [...position];frame[faceAxis] += sign * thickness * 0.35;
        for (const side of [-1,1]) {
          const jamb=[...frame];jamb[spanAxis]+=side*(ww/2-0.002);
          put(new THREE.BoxGeometry(...(alongX?[0.004,hh,frameDepth]:[frameDepth,hh,0.004])),metal,jamb);
        }
        const lintel=[...frame];lintel[1]+=hh/2-0.002;
        put(new THREE.BoxGeometry(...(alongX?[ww,0.004,frameDepth]:[frameDepth,0.004,ww])),metal,lintel);
        windowFrames++;
      }
      const panel=new THREE.ExtrudeGeometry(shape,{depth:thickness,steps:1,bevelEnabled:false});
      panel.translate(0,0,-thickness);
      const rotation=alongX?(sign>0?0:Math.PI):(sign>0?Math.PI/2:-Math.PI/2);
      put(panel,wall,alongX?[x,y,z+sign*d/2]:[x+sign*w/2,y,z],[0,rotation,0]);
    }
    box([x, y + h / 2 + 0.009, z], [w + 0.025, 0.018, d + 0.025], trim);
    // Open channels below the roof edge connect to downpipes on the narrow end faces.
    for (const sign of [-1,1]) {
      const gx=x+sign*(w/2+0.004),gy=y+h/2-0.008;
      box([gx,gy-0.004,z],[0.012,0.003,d],metal,0.0004);
      for(const lip of [-1,1])box([gx+lip*0.005,gy,z],[0.002,0.009,d],metal,0.0003);
      const dz=z+d/2-0.02;
      tube([[gx,gy,dz],[gx,y-h/2+0.025,dz],[gx+sign*0.006,y-h/2+0.009,dz]],0.003,metal);
      for(let bracket=1;bracket<=2+tier;bracket++) {
        const by=y-h/2+bracket*h/(3+tier);
        box([gx-sign*0.002,by,dz],[0.007,0.004,0.009],trim,0.0004);
      }
      drainRuns++;
    }
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
    const bays = 4, bayWidth = 0.96 / bays;
    for (let bay = 0; bay < bays; bay++) {
      const x0 = -0.48 + bay * bayWidth, x1 = x0 + bayWidth;
      const section = new THREE.Shape();
      section.moveTo(x0,0.17); section.lineTo(x1,0.17); section.lineTo(x1,0.37); section.closePath();
      const shell = new THREE.ExtrudeGeometry(section,{depth:0.96,steps:1,bevelEnabled:false});
      shell.translate(0,0,-0.48);
      put(shell,0x8e999b);
      box([x1+0.004,0.27,0],[0.007,0.19,0.9],glass,0.001);
      for (const z of [-0.45,0.45]) box([x1+0.009,0.27,z],[0.012,0.21,0.018],metal,0.001);
      for (let mullion = 1; mullion < 2+tier; mullion++) {
        const z = -0.45 + mullion * 0.9 / (2+tier);
        box([x1+0.009,0.27,z],[0.01,0.2,0.01],metal,0.001);
      }
      box([x1+0.01,0.275,0],[0.012,0.008,0.92],metal,0.001);
      box([x0,0.175,0],[0.018,0.018,0.98],0x7f9298,0.001);
      box([x1,0.376,0],[0.018,0.014,0.98],0xb5b8af,0.001);
      if (tier > 0) for (let seam = 1; seam < 3+tier*2; seam++) {
        const z = -0.44 + seam * 0.88 / (3+tier*2);
        tube([[x0+0.025,0.20,z],[x1-0.025,0.35,z]],0.003,metal);
      }
    }
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
    // A roof is not a building. This carries the walls, a plinth, a real entrance with a canopy, a
    // chimney and a rainwater butt under the roof, so it reads as a dwelling rather than a roof
    // floating on nothing.
    const w = 0.86, d = 0.74, height = 0.56;
    // A dwelling is a small structure, so its walls carry few openings: the perforated-wall block is
    // used at its lowest subdivision rather than the tower rates, which would cost an order of
    // magnitude more triangles for a building a fraction of the size.
    block([0, -0.5 + height / 2, 0], [w, height, d], 1, 2);
    box([0, -0.485, 0], [w + 0.04, 0.03, d + 0.04], trim);
    roof(0, -0.5 + height, 0, 0.98, 0.90, 0.96);
    // A chimney breaking the ridge, as a real flue does.
    box([0.22, -0.5 + height + 0.34, -0.10], [0.075, 0.30, 0.075], 0xb8aa9c);
    box([0.22, -0.5 + height + 0.50, -0.10], [0.095, 0.02, 0.095], trim);
    // Entrance canopy and step.
    box([0, -0.30, d / 2 + 0.045], [0.24, 0.02, 0.09], trim);
    for (const x of [-0.11, 0.11]) box([x, -0.38, d / 2 + 0.075], [0.012, 0.15, 0.012], wall);
    box([0, -0.485, d / 2 + 0.05], [0.26, 0.035, 0.12], 0xb6b2a4);
    // Rainwater butt and downpipe on the flank.
    cylinder([-w / 2 - 0.04, -0.40, 0.14], 0.045, 0.16, 0x7f8a86);
    tube([[-w / 2 + 0.01, -0.30, 0.20], [-w / 2 - 0.04, -0.34, 0.17]], 0.008, metal);
  } else if (kind === "evacuation-shelter") {
    // Accessible raised floor, sheltered entrance, backup storage and a working roof silhouette.
    box([0,-0.46,0],[0.98,0.08,0.88],0x9ba6a0,0.012);
    block([0,-0.12,-0.04],[0.90,0.64,0.72],2,4+tier);
    roof(0,0.21,-0.04,0.96,0.13,0.78);
    box([0,-0.34,0.35],[0.36,0.025,0.20],0xd1d4c7);
    for(const x of [-0.16,0.16])cylinder([x,-0.30,0.43],0.012,0.20,metal);
    put(new THREE.BoxGeometry(0.36,0.025,0.25),0xb8c2bd,[0,-0.42,0.48],[-0.35,0,0]);
    for(const x of [-0.18,0.18])tube([[x,-0.34,0.42],[x,-0.40,0.48],[x,-0.43,0.56]],0.006,metal);
    for(const x of [-0.32,0.32]){
      box([x,0.275,-0.29],[0.07,0.045,0.07],metal,0.002);
      cylinder([x,0.36,-0.29],0.060,0.13,0x8fa8ac);
      ring(0.061,0.005,[x,0.42,-0.29],trim);
      tube([[x,0.29,-0.23],[x,0.18,-0.23],[x+0.04,0.13,-0.23]],0.009,metal);
    }
    for(const side of [-1,1])for(let col=0;col<2+tier;col++){
      const x=side*(0.12+col*0.17/(1+tier));
      const roofY=0.21+0.13*(1-Math.abs(x)/0.48);
      const pitch=-side*Math.atan2(0.13,0.48);
      put(new THREE.BoxGeometry(0.11,0.008,0.18),0x679aaa,[x,roofY+0.012,0.07],[0,0,pitch]);
      for(const z of [-0.02,0.16])put(new THREE.BoxGeometry(0.11,0.004,0.005),metal,[x,roofY+0.017,z],[0,0,pitch]);
    }
  } else if (kind === "river-hatchery") {
    // Open raceways are modeled as separate walls and a recessed water plane, not solid blue blocks.
    box([0,-0.47,0],[0.98,0.06,0.96],0x9aa7a2,0.006);
    block([-0.31,-0.21,-0.08],[0.34,0.48,0.72],1,2+tier);
    roof(-0.31,0.05,-0.08,0.38,0.13,0.78);
    const lanes=3+tier;
    for(let lane=0;lane<lanes;lane++){
      const x=0.02+lane*0.42/(lanes-1),width=0.32/lanes;
      box([x,-0.43,0],[width,0.025,0.75],0xcbd2cd,0.002);
      for(const side of [-1,1])box([x+side*width*0.49,-0.36,0],[0.012,0.16,0.77],0xd1d4cf,0.001);
      for(const z of [-0.38,0.38])box([x,-0.36,z],[width,0.16,0.012],0xd1d4cf,0.001);
      box([x,-0.305,0],[width-0.024,0.012,0.72],0x348fa3,0.001);
      for(const z of [-0.22,0.02,0.25])box([x,-0.296,z],[width-0.034,0.002,0.007],0x9dcbd0,0.0004);
      tube([[x,-0.21,-0.43],[x,-0.29,-0.43],[x,-0.29,-0.31]],0.009,metal);
      for(let aerator=0;aerator<2+tier;aerator++){
        const z=-0.26+aerator*0.52/(1+tier);
        cylinder([x,-0.33,z],0.015,0.035,trim);
        ring(0.02,0.003,[x,-0.31,z],metal);
      }
    }
    box([0.24,-0.26,0.42],[0.43,0.025,0.08],0xabbab7,0.002);
    for(const x of [0.02,0.44])cylinder([x,-0.37,0.43],0.009,0.2,metal);
    tube([[-0.18,-0.16,-0.34],[-0.02,-0.16,-0.34],[0.44,-0.16,-0.34]],0.018,0x7c979c);
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
      const plan=new THREE.Shape();
      plan.moveTo(0,0.52);
      plan.quadraticCurveTo(0.13,0.45,0.15,0.18);
      plan.lineTo(0.15,-0.32);plan.quadraticCurveTo(0.13,-0.43,0.05,-0.44);
      plan.lineTo(-0.05,-0.44);plan.quadraticCurveTo(-0.13,-0.43,-0.15,-0.32);
      plan.lineTo(-0.15,0.18);plan.quadraticCurveTo(-0.13,0.45,0,0.52);
      const shaft=new THREE.ExtrudeGeometry(plan,{
        depth:0.68,steps:2+tier,curveSegments:6+tier*4,
        bevelEnabled:true,bevelSegments:1+tier,bevelThickness:0.006,bevelSize:0.006
      });
      shaft.rotateX(-Math.PI/2);
      const position=shaft.attributes.position;
      for(let vertex=0;vertex<position.count;vertex++){
        const t=Math.max(0,Math.min(1,position.getY(vertex)/0.68));
        position.setX(vertex,position.getX(vertex)*(1.12-0.18*t));
        position.setZ(vertex,position.getZ(vertex)*(1.03-0.08*t));
      }
      position.needsUpdate=true;shaft.computeVertexNormals();put(shaft,wall,[x,-0.39,0]);
      // A pier carries its bearing, not the deck directly: a plinth, then the bearing pad, then the
      // girder seat, which is what a real pier head looks like from the side.
      box([x,0.30,0],[0.30,0.06,0.34],wall);
      box([x,0.35,0],[0.20,0.035,0.24],0x6f7a7c);
      box([x,0.375,0],[0.24,0.02,0.28],metal);
      tube([[x,-0.31,-0.535],[x,-0.10,-0.535],[x,0.13,-0.51]],0.011,metal);
    }
    box([0,0.435,0],[0.98,0.10,0.46],trim,0.016);
    box([0,0.387,0],[0.96,0.012,0.48],0xb8c1c2,0.002);
    // Bearing seats under the deck soffit and a maintenance kerb along it.
    for(const x of [-0.25,0.25]) box([x,0.30,0],[0.34,0.03,0.52],0x8f9798);
    for(const z of [-0.24,0.24]) box([0,0.49,z],[0.98,0.018,0.04],0x9aa0a0,0.002);
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
    // An airfoil, not a body of revolution. A real blade section is a thin cambered wing: a rounded
    // leading edge, a sharp trailing edge, and a thickness that is a small fraction of the chord and
    // keeps falling toward the tip. A circular section with a constant thickness ratio - which is
    // what this was - turns the blade into a teardrop.
    const rings=12+tier*8,sides=20+tier*10,positions=[],indices=[];
    // The planform of a real blade: the chord grows quickly out of the cylindrical root, peaks around
    // a fifth of the span, then tapers to the tip.
    const chordAt=t=>{
      if(t<0.12)return 0.075+0.09*(t/0.12);
      const u=(t-0.12)/0.88;
      return 0.165*(1-0.62*u)+(1-u)*(1-u)*0.055;
    };
    // Thickness-to-chord falls from a thick root to a thin tip, as a structural blade does.
    const thicknessAt=t=>0.17-0.11*t;
    const twistAt=t=>(1-t)*0.42;
    for(let row=0;row<=rings;row++){
      const t=row/rings,chord=chordAt(t),thick=chord*thicknessAt(t),twist=twistAt(t);
      const sweep=(t-0.5)*0.04;
      for(let side=0;side<sides;side++){
        const a=side/sides*Math.PI*2,cosA=Math.cos(a);
        const x=cosA*chord*0.5;
        const z=Math.sin(a)*thick*0.5*(1-0.22*cosA);
        positions.push(x*Math.cos(twist)-z*Math.sin(twist)+sweep,t-0.5,x*Math.sin(twist)+z*Math.cos(twist));
      }
    }
    for(let row=0;row<rings;row++)for(let side=0;side<sides;side++){
      const a=row*sides+side,b=row*sides+(side+1)%sides;indices.push(a,a+sides,b,b,a+sides,b+sides);
    }
    for(let i=1;i<sides-1;i++)indices.push(0,i+1,i,rings*sides,rings*sides+i,rings*sides+i+1);
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();put(g,trim);
  } else if (kind === "greenhouse-bay") {
    const halfWidth=0.475, frameBays=6, archSteps=12+tier*8;
    const archY=x=>0.07+0.40*Math.sqrt(Math.max(0,1-(x/halfWidth)**2));
    box([0,-0.45,0],[1,0.08,1],0xb9c3b9);
    const positions=[],indices=[],stride=(archSteps+1)*(frameBays+1);
    for(const offset of [-0.003,0.003])for(let bay=0;bay<=frameBays;bay++)for(let step=0;step<=archSteps;step++){
      const x=-halfWidth+step*2*halfWidth/archSteps;
      positions.push(x,archY(x)+offset,-0.48+bay*0.96/frameBays);
    }
    for(let bay=0;bay<frameBays;bay++)for(let step=0;step<archSteps;step++){
      const a=bay*(archSteps+1)+step,b=a+1,c=b+archSteps+1,d=a+archSteps+1;
      indices.push(a,b,c,a,c,d,stride+a,stride+c,stride+b,stride+a,stride+d,stride+c);
    }
    for(const side of [0,archSteps])for(let bay=0;bay<frameBays;bay++){
      const a=bay*(archSteps+1)+side,b=a+archSteps+1;
      indices.push(a,b,stride+b,a,stride+b,stride+a);
    }
    for(const bay of [0,frameBays])for(let step=0;step<archSteps;step++){
      const a=bay*(archSteps+1)+step,b=a+1;
      indices.push(a,stride+a,stride+b,a,stride+b,b);
    }
    const glazedRoof=new THREE.BufferGeometry();
    glazedRoof.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
    glazedRoof.setIndex(indices);glazedRoof.computeVertexNormals();put(glazedRoof,0xaccdc0);
    for(let bay=0;bay<=frameBays;bay++){
      const z=-0.48+bay*0.96/frameBays;
      tube(Array.from({length:17+tier*8},(_,step)=>{
        const x=-halfWidth+step*2*halfWidth/(16+tier*8);
        return [x,archY(x)+0.006,z];
      }),0.009,trim);
      for(const x of [-halfWidth,halfWidth])box([x,-0.16,z],[0.018,0.48,0.026],metal,0.002);
    }
    for(const x of [-0.35,0,0.35])tube([[x,archY(x)+0.008,-0.48],[x,archY(x)+0.008,0.48]],0.006,metal);
    for(const x of [-halfWidth,halfWidth])for(let bay=0;bay<frameBays;bay++){
      const z=-0.40+bay*0.96/frameBays;
      box([x,-0.16,z],[0.009,0.46,0.96/frameBays-0.014],0x94bdb1,0.001);
    }
    for(const z of [-0.48,0.48]){
      const gable=new THREE.Shape();gable.moveTo(-halfWidth,0.07);
      for(let step=1;step<=archSteps;step++){
        const x=-halfWidth+step*2*halfWidth/archSteps;gable.lineTo(x,archY(x));
      }
      gable.lineTo(halfWidth,0.07);gable.closePath();
      put(new THREE.ExtrudeGeometry(gable,{depth:0.006,bevelEnabled:false}),0x94bdb1,[0,0,z-0.003]);
      for(const x of [-0.32,0.32])box([x,-0.16,z],[0.26,0.47,0.009],0x94bdb1,0.001);
      for(const x of [-0.14,0.14])box([x,-0.16,z],[0.012,0.49,0.017],metal,0.001);
      box([0,0.08,z],[0.29,0.015,0.018],metal,0.001);
    }
    box([0,-0.16,-0.48],[0.26,0.47,0.009],0x94bdb1,0.001);
    for(const x of [-0.24,0.24]){
      box([x,-0.32,0],[0.19,0.13,0.82],0xb4b6a8);
      box([x,-0.247,0],[0.17,0.015,0.79],0x497b57,0.001);
      for(let plant=0;plant<8+tier*4;plant++){
        const z=-0.36+plant*0.72/(7+tier*4);
        tube([[x,-0.24,z],[x,-0.18,z],[x+0.045,-0.14,z+0.012]],0.004,0x5a915d);
        tube([[x,-0.18,z],[x-0.045,-0.15,z-0.012]],0.004,0x70a76d);
      }
    }
    tube([[0.42,-0.36,-0.40],[0.42,-0.36,0.40]],0.012,metal);
    cylinder([0.39,-0.32,0.34],0.055,0.16,0x839fa3);
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
    // Vomitory openings, floodlight masts and the pitch perimeter barrier are contributed by
    // facilityCivilDetails.js, which turns the portals onto the measured seating cone rather than
    // axis-aligning them, so they are deliberately not built here.
  } else if (kind === "observatory-dome") {
    // A slit, a shutter that slides over it, the shutter rails, and the telescope the building
    // exists for, all on a drum that rotates.
    //
    // SphereGeometry maps phi=PI to +x. The omitted sector, rails, shutter and telescope all face +x.
    const slitHalfAngle = 0.16, shellRadius = 0.46, shellCentreY = -0.08;
    cylinder([0,-0.28,0],0.46,0.35,wall);ring(0.46,0.02,[0,shellCentreY,0],metal);
    put(new THREE.SphereGeometry(shellRadius,radial*2,radial,Math.PI+slitHalfAngle,Math.PI*2-slitHalfAngle*2,0,Math.PI/2),trim,[0,shellCentreY,0]);
    // The two slit edges, each an arc up the meridian at the slit boundary azimuth.
    for(const theta of [slitHalfAngle, -slitHalfAngle]){
      const arc=Array.from({length:13},(_,j)=>{
        const phi=j/12*Math.PI/2;
        return [Math.sin(phi)*Math.cos(theta)*shellRadius,
          shellCentreY+Math.cos(phi)*shellRadius,
          Math.sin(phi)*Math.sin(theta)*shellRadius];
      });
      tube(arc,0.012,metal);
    }
    // Curved shutter leaves sit on the shell radius; straight plates would float above the dome.
    const shutterStart=0.92, shutterSpan=0.64, shutterRadius=shellRadius+0.012, leaves=4;
    for(let leaf=0;leaf<leaves;leaf++){
      const theta=shutterStart+leaf*shutterSpan/leaves;
      put(new THREE.SphereGeometry(shutterRadius,radial,3+tier*3,
        Math.PI-slitHalfAngle+0.01,slitHalfAngle*2-0.02,theta,shutterSpan/leaves+0.003),
        leaf%2?0x7896a1:0x91abb2,[0,shellCentreY,0]);
    }
    for(let seam=0;seam<=leaves;seam++){
      const theta=shutterStart+seam*shutterSpan/leaves;
      tube(Array.from({length:9+tier*4},(_,step)=>{
        const phi=-slitHalfAngle+step*(slitHalfAngle*2)/(8+tier*4);
        return [shutterRadius*Math.sin(theta)*Math.cos(phi),
          shellCentreY+shutterRadius*Math.cos(theta),
          shutterRadius*Math.sin(theta)*Math.sin(phi)];
      }),0.005,metal);
    }
    // The telescope: a pier, a fork mount, and a tube aimed along the slit centreline at 45 degrees
    // elevation, long enough to reach the shell.
    cylinder([0,-0.36,0],0.10,0.14,wall);
    for(const z of [-0.09,0.09]) tube([[0,-0.22,z],[0,-0.02,z]],0.014,metal);
    cylinder([0,-0.02,0],0.055,0.05,metal);
    const tubeTip=[Math.cos(Math.PI/4)*0.34,-0.02+Math.sin(Math.PI/4)*0.34,0];
    tube([[0,-0.02,0],tubeTip],0.052,0x8bafb9);
    cylinder([0,-0.02,0],0.062,0.05,metal);
    tube([[tubeTip[0],tubeTip[1],tubeTip[2]],[tubeTip[0]*1.06,tubeTip[1]*1.06-0.02,tubeTip[2]]],0.030,metal);
  } else if (kind === "crane-boom") {
    const bays=7;
    for(const y of [-0.12,0.12])for(const z of [-0.12,0.12])tube([[-0.5,y,z],[0.5,y,z]],0.012,0xd4b967);
    for(let i=0;i<bays;i++)for(const z of [-0.12,0.12]){
      const x=-0.5+i/bays; tube([[x,-0.12,z],[x+1/bays,0.12,z]],0.008,0xe1ca85);
      tube([[x,0.12,z],[x+1/bays,-0.12,z]],0.008,0xe1ca85);
    }
    put(new THREE.CylinderGeometry(0.044,0.044,0.056,radial),metal,[0.43,-0.15,0],[Math.PI/2,0,0]);
    for(const z of [-0.032,0.032])put(new THREE.TorusGeometry(0.045,0.006,6+tier*2,radial),trim,[0.43,-0.15,z]);
    tube([[0.34,0.10,0],[0.43,0.10,0],[0.47,-0.13,0],[0.47,-0.18,0],[0.43,-0.21,0],[0.43,-0.39,0]],0.005,metal);
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
  // Construction members contributed by the per-family detail modules. They receive helpers bound to
  // their own sink rather than to `parts`, because the helpers register what they are handed; a
  // module that both registers through them and returns the members would otherwise have every
  // member added twice, doubling the merge cost for geometry that renders identically.
  const detailParts = [];
  const detailPut = (geometry, color, position = [0, 0, 0], rotation = [0, 0, 0]) =>
    put(geometry, color, position, rotation, detailParts);
  const detailHelpers = {
    put: detailPut,
    box: (p, size, color = wall, bevel = 0.006) => detailPut(
      new RoundedBoxGeometry(...size, tier + 1, Math.min(bevel, ...size.map(s => s * 0.16))), color, p),
    cylinder: (p, radius, height, color = metal) => detailPut(new THREE.CylinderGeometry(radius, radius, height, radial), color, p),
    tube: (points, radius, color = metal) => detailPut(new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point))), 12 + tier * 8, radius, 8 + tier * 4, false), color),
    ring: (radius, tubeRadius, p, color = metal) => detailPut(new THREE.TorusGeometry(radius, tubeRadius, 6 + tier * 2, radial), color, p, [Math.PI / 2, 0, 0]),
    tier, radial,
    // The sink the helpers register into, exposed because the detail modules read it back to collect
    // exactly the members their own helper calls emitted.
    parts: detailParts,
    colors: { wall, trim, glass, metal }
  };
  for (const contribute of [buildingDetailParts, industrialDetailParts, civilDetailParts]) {
    const contributed = contribute(kind, detailHelpers);
    for (const member of Array.isArray(contributed) ? contributed : []) {
      if (!parts.includes(member)) parts.push(member);
    }
  }
  const merged = mergeGeometries(parts,false); parts.forEach(part=>part.dispose());
  const geometry = mergeVertices(merged, 1e-6); merged.dispose();
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3()), center = geometry.boundingBox.getCenter(new THREE.Vector3());
  geometry.translate(-center.x,-center.y,-center.z); geometry.scale(1/size.x,1/size.y,1/size.z);
  geometry.userData.facilityRebuild = { version:3, kind, detailTier:tier, windowOpenings, windowFrames, drainRuns, entrances,
    normalization:{center:center.toArray(),size:size.toArray()},representation:"perforated building envelopes and construction assemblies; not a structural design" };
  return geometry;
}
