import assert from "node:assert/strict";
import {registerHooks} from "node:module";
registerHooks({resolve(s,c,next){return next(s==="three"?new URL("../vendor/three/three.module.js",import.meta.url).href:s.startsWith("three/addons/")?new URL(`../vendor/three/addons/${s.slice("three/addons/".length)}`,import.meta.url).href:s,c);}});
const THREE=await import("three");
const {mergeGeometries}=await import("../vendor/three/addons/utils/BufferGeometryUtils.js");
const {carnivoreAnatomy}=await import("../src/organismAnatomyCarnivore.js");

const ATTRS=["position","normal","color","uv"];
const VARIANTS=[0,1,2];
const DETAILS=[18,32,48];

function merge(parts) {
  const merged=mergeGeometries(parts);
  assert.ok(merged, "mergeGeometries must accept every part carnivoreAnatomy returns");
  return merged;
}

const summary=[], vertexCounts=new Map(), boxes=new Map();
for(const variant of VARIANTS)for(const detail of DETAILS){
  const parts=carnivoreAnatomy(detail,variant);
  assert.ok(Array.isArray(parts)&&parts.length>0, `variant ${variant} detail ${detail} returns a non-empty array`);
  for(const part of parts)assert.ok(part instanceof THREE.BufferGeometry, `variant ${variant} detail ${detail} parts are BufferGeometry`);
  for(const part of parts)for(const name of ATTRS){
    const attr=part.getAttribute(name);
    assert.ok(attr, `variant ${variant} detail ${detail} carries ${name}`);
    assert.equal(attr.count,part.getAttribute("position").count, `variant ${variant} detail ${detail} ${name} count matches position`);
    for(const value of attr.array)assert.ok(Number.isFinite(value), `variant ${variant} detail ${detail} ${name} is finite`);
  }
  const merged=merge(parts);
  const count=merged.getAttribute("position").count;
  assert.ok(count>0, `variant ${variant} detail ${detail} merges to vertices`);
  for(const value of merged.getAttribute("position").array)assert.ok(Number.isFinite(value), `variant ${variant} detail ${detail} merged positions are finite`);
  merged.computeBoundingBox();
  const box=merged.boundingBox;
  const size=box.getSize(new THREE.Vector3());
  const extent=Math.max(size.x,size.y,size.z);
  assert.ok(extent>=0.75&&extent<=1.35, `variant ${variant} detail ${detail} largest extent ${extent.toFixed(4)} must sit inside [0.75,1.35]`);
  assert.ok(size.x>=size.y&&size.x>=size.z, `variant ${variant} detail ${detail} must run longest along +X, the engine's forward axis`);
  merged.dispose();
  for(const part of parts)part.dispose();
  summary.push(`v${variant}/d${detail}:${count}`);
  vertexCounts.set(`${variant}/${detail}`,count);
  boxes.set(`${variant}/${detail}`,box);
}

for(const variant of VARIANTS){
  assert.ok(vertexCounts.get(`${variant}/48`)>vertexCounts.get(`${variant}/18`),
    `variant ${variant} detail 48 (${vertexCounts.get(`${variant}/48`)}) must exceed detail 18 (${vertexCounts.get(`${variant}/18`)})`);
}

for(const detail of DETAILS){
  const parts=carnivoreAnatomy(detail,0),repeat=carnivoreAnatomy(detail,0);
  const a=merge(parts),b=merge(repeat);
  assert.equal(a.getAttribute("position").count,b.getAttribute("position").count, `detail ${detail} repeats identical merged vertex counts`);
  a.computeBoundingBox();b.computeBoundingBox();
  assert.deepEqual(a.boundingBox.min.toArray(),b.boundingBox.min.toArray(), `detail ${detail} repeats identical bounding box min`);
  assert.deepEqual(a.boundingBox.max.toArray(),b.boundingBox.max.toArray(), `detail ${detail} repeats identical bounding box max`);
  assert.deepEqual(a.getAttribute("position").array,b.getAttribute("position").array, `detail ${detail} repeats identical vertices`);
  a.dispose();b.dispose();
  for(const part of [...parts,...repeat])part.dispose();
}

// Each morphotype owns a display envelope, so its box must not drift with the quality tier; the
// variants stay distinguishable by vertex count and by the proportions of that shared envelope.
for(const variant of VARIANTS)for(let i=1;i<DETAILS.length;i++){
  const a=boxes.get(`${variant}/${DETAILS[0]}`).getSize(new THREE.Vector3()),b=boxes.get(`${variant}/${DETAILS[i]}`).getSize(new THREE.Vector3());
  const axis=Math.max(a.x,a.y,a.z);
  assert.ok(Math.abs(a.x-b.x)/axis<0.02&&Math.abs(a.y-b.y)/axis<0.02&&Math.abs(a.z-b.z)/axis<0.02,
    `variant ${variant} envelope must not drift between detail ${DETAILS[0]} and ${DETAILS[i]}`);
}
for(const detail of DETAILS){
  const shapes=VARIANTS.map(v=>({v,count:vertexCounts.get(`${v}/${detail}`),box:boxes.get(`${v}/${detail}`)}));
  for(let i=0;i<shapes.length;i++)for(let j=i+1;j<shapes.length;j++){
    const ca=shapes[i].count,cb=shapes[j].count;
    const sameBox=shapes[i].box.min.toArray().every((n,k)=>Math.abs(n-shapes[j].box.min.toArray()[k])<1e-9)
      &&shapes[i].box.max.toArray().every((n,k)=>Math.abs(n-shapes[j].box.max.toArray()[k])<1e-9);
    assert.ok(ca!==cb||!sameBox, `variants ${shapes[i].v} and ${shapes[j].v} at detail ${detail} must differ in merged vertex count or bounding box`);
  }
}

// Anatomy shape checks: the three morphotypes must be proportioned the way the brief describes them
// rather than being one body with swapped colours.
function shapeOf(variant,name){
  const merged=merge(carnivoreAnatomy(48,variant));
  merged.computeBoundingBox();
  const size=merged.boundingBox.getSize(new THREE.Vector3());
  merged.dispose();
  return {name,size};
}
const [dog,cat,bearShape]=[shapeOf(0,"canid"),shapeOf(1,"felid"),shapeOf(2,"bear")];
assert.ok(bearShape.size.y/dog.size.y>1.25, "bear must stand visibly taller than the canid at the same body length");
assert.ok(bearShape.size.z/dog.size.z>1.25, "bear barrel must be visibly broader than the canid's narrow chest");
assert.ok(bearShape.size.z/cat.size.z>1.25, "bear barrel must be visibly broader than the felid's lithe waist");
assert.ok(cat.size.y<bearShape.size.y&&cat.size.z<dog.size.z, "felid must stay slimmer and lower than the bear, and slimmer than the canid");

const source=await (await import("node:fs/promises")).readFile(new URL("../src/organismAnatomyCarnivore.js",import.meta.url),"utf8");
for(const forbidden of ["Math.random","Date.now","performance.now"])assert.ok(!source.includes(forbidden), `anatomy must stay deterministic without ${forbidden}`);

console.log(`${summary.join(" ")} \u2014 carnivore morphotypes deterministic, tier-separated and inside the display envelope passed`);
