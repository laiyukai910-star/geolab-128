import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return next(s==='three'?new URL('../vendor/three/three.module.js',import.meta.url).href:s,c)}});

const {SKY_CLOUD_LIBRARY,SKY_FRAGMENT_SHADER,SKY_VERTEX_SHADER,createSkyMaterial}=await import('../src/skyEnvironment.js');

function glslFunction(library,name){
  const pattern=new RegExp(`(?:^|\\n)\\s*(?:void|float)\\s+${name}\\s*\\(([^)]*)\\)\\s*\\{`);
  const match=pattern.exec(library);
  assert.ok(match,`expected a top-level GLSL function named ${name}`);
  const start=match.index+match[0].length;
  let depth=1,end=start;
  while(end<library.length&&depth>0){if(library[end]==='{')depth++;else if(library[end]==='}')depth--;end++;}
  assert.equal(depth,0,`unbalanced braces in ${name}`);
  const params=match[1].split(',').map(part=>part.trim().split(/\s+/).at(-1)).filter(Boolean);
  return {params,body:library.slice(start,end-1)};
}

const field=glslFunction(SKY_CLOUD_LIBRARY,'skyField');
assert.deepEqual(field.params,['ray','drift','outCloud','outDome','outDomeLength','outExtent','outSlope'],'skyField must expose its cloud coordinates through out parameters');
const weightFunction=glslFunction(SKY_CLOUD_LIBRARY,'skyOctaveWeight');
assert.deepEqual(weightFunction.params,['footprint','scale'],'skyOctaveWeight must take a footprint and an octave scale');

// A GLSL out parameter shadows a same-named local in the caller, leaving it uninitialized. The
// shader compiled and linked while the footprint read garbage, so guard the names explicitly.
const outParameters=field.params.slice(2);
assert.ok(outParameters.every(name=>/^out[A-Z]/.test(name)),'out parameters must not be named like caller locals');
const callerDeclarations=(/(?:^|\n)\s*(?:float|vec2)\s+([^;]+);/g).exec(SKY_FRAGMENT_SHADER.replace(SKY_CLOUD_LIBRARY,''));
assert.ok(callerDeclarations,'the shader must declare its cloud locals');
const declaredNames=callerDeclarations[1].split(',').map(part=>part.trim());
for(const name of outParameters){
  assert.ok(!declaredNames.includes(name),`out parameter ${name} would shadow the caller's own declaration`);
}

/**
 * Transcribe the cloud field exactly as written in the shader. The shader steps are asserted
 * literally below, so this copy cannot drift away from the GLSL without a test failure.
 */
function cloudField(ray,drift){
  const source=Math.min(Math.max(ray.y+0.22,0.06),2.0);
  const dome={x:ray.x/source+drift,y:ray.z/source};
  const domeLength=Math.max(Math.hypot(dome.x,dome.y),0.0001);
  const radius=Math.min(domeLength,12);
  const squeeze=1+0.3*radius;
  const extent=radius/squeeze;
  const slope=1/(squeeze*squeeze);
  const scale=extent/domeLength;
  return {cloudPoint:{x:dome.x*scale,y:dome.y*scale},dome,source,domeLength,extent,slope,radius,fold:extent};
}
const skyOctaveWeight=(footprint,scale)=>1-smoothstep(0.5,1.8,footprint*scale);
function smoothstep(edge0,edge1,x){const t=Math.min(1,Math.max(0,(x-edge0)/(edge1-edge0)));return t*t*(3-2*t);}

const compact=value=>value.replace(/\s+/g,'');
const statements=field.body.replace(/\/\/.*$/gm,'').split(';').map(part=>compact(part)).filter(Boolean);
assert.equal(statements.length,8,'the cloud field must stay a short, reviewable computation');
assert.ok(statements[0].includes('source=clamp(ray.y+0.22,0.06,2.0)'),'the cloud field must floor the source above the horizon instead of dividing by a vanishing ray height');
assert.ok(statements[1].includes('outDome=ray.xz/source+vec2(drift,0.0)'),'the cloud coordinates must come from one continuous dome division');
assert.ok(statements[2].includes('outDomeLength=max(length(outDome),0.0001)'),'the dome length must be guarded against a zero direction');
assert.ok(statements[3].includes('radius=min(outDomeLength,12.0)'),'the dome radius must be bounded');
assert.ok(statements[4].includes('squeeze=1.0+0.3*radius'),'the ring map must keep a fixed far-field squeeze');
assert.ok(statements[5].includes('outExtent=radius/squeeze'),'the ring must fold the dome into a bounded extent');
assert.ok(statements[6].includes('outSlope=1.0/(squeeze*squeeze)'),'the ring slope must stay available for the footprint');
assert.ok(statements[7].includes('outCloud=outDome/outDomeLength*outExtent'),'the cloud coordinates must be the folded dome direction');

// The ring map has to shrink the dome, never stretch it, or the horizon would gain a magic scale.
for(let radius=0;radius<=12;radius+=0.001){
  const squeeze=1+0.3*radius;
  assert.ok(radius/squeeze<=radius+1e-12,`ring map must not stretch the dome at r=${radius}`);
  const slope=1/(squeeze*squeeze);
  assert.ok(slope>0.04&&slope<=1+1e-12,`ring map must stay monotone with a slope inside (0, 1], got ${slope} at r=${radius}`);
}
assert.ok(2.9/(1+0.3*2.9)>0.6,'the folded ring must still be wide at a typical horizon radius');
assert.ok(12/(1+0.3*12)<4,'the ring extent must stay bounded across the clamp');
assert.ok(1e6/(1+0.3*1e6)<4,'the ring map must stay bounded in the far field');

function direction(azimuthDeg,elevationDeg){
  const azimuth=azimuthDeg*Math.PI/180,elevation=elevationDeg*Math.PI/180;
  return {x:Math.cos(elevation)*Math.cos(azimuth),y:Math.sin(elevation),z:Math.cos(elevation)*Math.sin(azimuth)};
}
const sample=(azimuthDeg,elevationDeg,drift=0)=>cloudField(direction(azimuthDeg,elevationDeg),drift);

// The cloud field must stay finite and bounded across the whole visible dome, including the
// horizon and straight up, so that no pixel straddles an unbounded gradient.
let widest=0,smallestDomeLength=Infinity;
for(let elevation=-22;elevation<=90;elevation+=0.25){
  for(let azimuth=0;azimuth<360;azimuth+=1.5){
    const {cloudPoint,dome,domeLength,extent,slope}=sample(azimuth,elevation);
    for(const value of [cloudPoint.x,cloudPoint.y,domeLength,extent,slope])assert.ok(Number.isFinite(value),`non-finite cloud field at ${azimuth},${elevation}`);
    assert.ok(domeLength>=0.0001,'the dome length must stay guarded');
    assert.ok(extent<1/0.3,'the ring extent must stay below its asymptote, got '+extent);
    assert.ok(slope>0&&slope<=1+1e-12,`the ring slope must stay in (0,1], got ${slope}`);
    assert.ok(Math.hypot(cloudPoint.x,cloudPoint.y)<=Math.hypot(dome.x,dome.y)+1e-9,'the ring fold must only shrink the dome');
    assert.ok(Math.hypot(cloudPoint.x,cloudPoint.y)<=2.9,`cloud coordinates must stay bounded, got ${Math.hypot(cloudPoint.x,cloudPoint.y)}`);
    widest=Math.max(widest,Math.hypot(cloudPoint.x,cloudPoint.y));
    smallestDomeLength=Math.min(smallestDomeLength,domeLength);
  }
}
assert.ok(widest>0.85,'the dome ring should be used, not collapsed');
assert.ok(Math.abs(smallestDomeLength-0.0001)<1e-9||smallestDomeLength>1,'the dome length guard must not distort normal rays');
assert.ok(sample(180,-1).extent>0.8,'rays below the horizon must stay inside the same field');

// Neighbouring rays must move the cloud coordinates by a small, uniform amount, at every elevation
// including the grazing rays along the horizon.
const step=0.02;
let worst=0,worstAt=null;
for(let elevation=-1.5;elevation<=70;elevation+=0.5){
  for(let azimuth=0;azimuth<360;azimuth+=2){
    const here=sample(azimuth,elevation).cloudPoint;
    const along=sample(azimuth+step,elevation).cloudPoint;
    const up=sample(azimuth,elevation+step).cloudPoint;
    const local=Math.max(Math.hypot(here.x-along.x,here.y-along.y),Math.hypot(here.x-up.x,here.y-up.y))/step;
    if(local>worst){worst=local;worstAt=[azimuth,elevation];}
  }
}
assert.ok(worst<0.12,`cloud coordinates must change smoothly across the sky; worst local change was ${worst} per degree at ${worstAt}`);

// The folded dome must move less than one cloud unit per screen pixel, at every elevation. The
// shader this replaced measured its sampling rate with dFdx of a projected coordinate whose
// screen-space rate swings by orders of magnitude across one frame, so the fade band that decides
// how much cloud detail to draw was itself sub-pixel near the horizon and jumped between frames.
// The replacement measures the view ray, whose per-pixel change is no more than the field of view.
const pixelStep=0.031;
let worstStride=0;
for(let elevation=-1.5;elevation<=70;elevation+=0.5){
  for(let azimuth=0;azimuth<360;azimuth+=3){
    const here=sample(azimuth,elevation).cloudPoint;
    const along=sample(azimuth+pixelStep,elevation).cloudPoint;
    const up=sample(azimuth,elevation+pixelStep).cloudPoint;
    worstStride=Math.max(worstStride,Math.hypot(here.x-along.x,here.y-along.y),Math.hypot(here.x-up.x,here.y-up.y));
  }
}
assert.ok(worstStride<0.2,`the folded dome must move well under one unit per pixel, got ${worstStride}`);

// Drift must translate the cloud coordinates, never tear or distort them, and the folded ring must
// stay a pure rescaling of its dome.
for(const [azimuth,elevation] of [[20,6],[100,-1],[200,45],[300,80]]){
  const before=sample(azimuth,elevation,0),after=sample(azimuth,elevation,5);
  assert.ok(Math.abs(after.dome.x-before.dome.x-5)<1e-9,'drift must shift the cloud field without distortion');
  assert.ok(Math.abs(after.dome.y-before.dome.y)<1e-12,'drift must not move the cloud field vertically');
  assert.ok(Math.abs(Math.hypot(before.cloudPoint.x,before.cloudPoint.y)-before.extent)<1e-9,'the folded point must sit at the ring extent');
  assert.ok(Math.abs(before.cloudPoint.x*before.dome.y-before.cloudPoint.y*before.dome.x)<1e-12,'folding must preserve the cloud direction');
}

// Detail octaves have to fade out as one pixel covers them, while the base octave survives.
assert.ok(skyOctaveWeight(0.01,1)>0.99,'the base cloud octave must be fully present when magnified');
assert.equal(skyOctaveWeight(2,4.31),0,'fine cloud octaves must vanish once they fall below the sampling rate');
let previous=-1;
for(let footprint=0;footprint<=3;footprint+=0.01){
  const value=skyOctaveWeight(footprint,2.13);
  assert.ok(value>=0&&value<=1,'octave weights must stay normalized');
  if(previous>=0)assert.ok(value<=previous+1e-12,'octave weights must fade monotonically with the footprint');
  previous=value;
}

// The shader must derive the footprint analytically and apply it to every octave. Screen-space
// derivatives of the cloud coordinates are what made the pattern crawl between frames.
assert.ok(!/dFdx\s*\(\s*cloudPoint/.test(SKY_FRAGMENT_SHADER),'the footprint must not be derived from the cloud coordinates');
assert.ok(/dFdx\s*\(\s*ray\.x\s*\)/.test(SKY_FRAGMENT_SHADER),'the footprint must come from the stable view ray');
assert.equal((SKY_FRAGMENT_SHADER.match(/skyOctaveWeight\s*\(/g)||[]).length,4,'every cloud octave must carry an explicit filter weight');
assert.ok(!SKY_FRAGMENT_SHADER.includes('max(ray.y+0.2,0.15)'),'the clamped cloud projection must not return');
assert.ok(SKY_FRAGMENT_SHADER.includes('skyField(ray,time*0.004,cloudPoint,dome,domeLength,extent,slope)'),'the shader must use the shared cloud field');
assert.ok(SKY_FRAGMENT_SHADER.includes('rayJacobian*(direction-ray.y*dome)/clamp(ray.y+0.22,0.06,2.0)'),'the footprint must confine the dome derivative to the unit sphere');
assert.ok(SKY_FRAGMENT_SHADER.includes('extent/domeLength*length(domeSpread-radialPart)+slope*length(radialPart)'),'the footprint must split the fold into its angular and radial parts');
assert.ok(SKY_VERTEX_SHADER.includes('gl_Position = vec4(position.xy, 0.999999, 1.0)'),'the sky must stay a depth-free full-screen background');

const material=createSkyMaterial();
assert.equal(material.depthTest,false);
assert.equal(material.depthWrite,false);
assert.ok(material.uniforms.time&&material.uniforms.skyProjectionInverse&&material.uniforms.skyRotation,'camera uniforms must remain available');
material.dispose();
console.log('Sky field continuity, octave filtering and shader wiring tests passed');
