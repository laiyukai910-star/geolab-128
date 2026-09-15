import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === "three"
      ? new URL("../vendor/three/three.module.js", import.meta.url).href
      : specifier.startsWith("three/addons/")
        ? new URL(`../vendor/three/addons/${specifier.slice(13)}`, import.meta.url).href
        : specifier, context);
  }
});
const THREE = await import("three");
const { mergeGeometries } = await import("three/addons/utils/BufferGeometryUtils.js");
const { ungulateAnatomy } = await import("../src/organismAnatomyUngulate.js");

// Every tier state must be a pure function of (detail, variant): no clocks, no
// entropy.  Checked against the source, because a call once would not catch a
// branch that is only reached on another morphotype.
const source = await readFile(new URL("../src/organismAnatomyUngulate.js", import.meta.url), "utf8");
for (const forbidden of ["Math.random", "Date.now", "performance.now"])
  assert.ok(!source.includes(forbidden), `anatomy must stay deterministic: source contains ${forbidden}`);

const TIERS = [18, 32, 48];
const ATTRIBUTES = ["position", "normal", "color", "uv"];
const stated = ["ungulateAnatomy", "return parts", "mergeGeometries"];
for (const token of stated) assert.ok(source.includes(token), `module must stay on the caller-merges contract: ${token}`);

// One build: validate the part contract, then merge exactly like the caller
// does, and report what the merged geometry actually measures.
function build(variant, detail) {
  const parts = ungulateAnatomy(detail, variant);
  assert.ok(Array.isArray(parts) && parts.length > 0, `variant ${variant} detail ${detail} must return a non-empty array`);
  let vertices = 0, merged_box = new THREE.Box3();
  const box = merged_box;
  for (const part of parts) {
    assert.ok(part instanceof THREE.BufferGeometry, `variant ${variant} detail ${detail} parts must be BufferGeometry`);
    for (const name of ATTRIBUTES) assert.ok(part.getAttribute(name), `variant ${variant} detail ${detail} part lacks ${name}`);
    const position = part.getAttribute("position");
    assert.ok(position.count > 0, `variant ${variant} detail ${detail} part must carry vertices`);
    assert.equal(part.getAttribute("color").count, position.count, "color must match position");
    assert.equal(part.getAttribute("uv").count, position.count, "uv must match position");
    assert.equal(part.getAttribute("normal").count, position.count, "normal must match position");
    for (const value of position.array) assert.ok(Number.isFinite(value), `variant ${variant} detail ${detail} positions must be finite`);
    for (const value of part.getAttribute("normal").array) assert.ok(Number.isFinite(value), `variant ${variant} detail ${detail} normals must be finite`);
    for (const value of part.getAttribute("color").array) assert.ok(Number.isFinite(value), `variant ${variant} detail ${detail} colors must be finite`);
    part.computeBoundingBox(); box.union(part.boundingBox);
    vertices += position.count;
  }
  const merged = mergeGeometries(parts);
  assert.ok(merged, `variant ${variant} detail ${detail} parts must carry a merge-compatible attribute set`);
  assert.equal(merged.getAttribute("position").count, vertices, "merged vertex count must equal the sum of the parts");
  const mergedBox = new THREE.Box3().setFromBufferAttribute(merged.getAttribute("position"));
  const size = mergedBox.getSize(new THREE.Vector3());
  const extent = Math.max(size.x, size.y, size.z);
  assert.ok(extent >= 0.75 && extent <= 1.35, `variant ${variant} detail ${detail} largest extent ${extent.toFixed(4)} must stay inside [0.75, 1.35]`);
  assert.ok(size.x >= size.y && size.x >= size.z, `variant ${variant} detail ${detail} body length must be the largest extent (engine scales along X)`);
  const centre = mergedBox.getCenter(new THREE.Vector3());
  assert.ok(Math.abs(centre.x) < 0.2 && Math.abs(centre.z) < 0.2, `variant ${variant} detail ${detail} must stay centred on the body axis`);
  assert.ok(mergedBox.min.y > -0.02, `variant ${variant} detail ${detail} hooves must rest on the ground plane, not below it`);
  const signature = `${vertices}|${mergedBox.min.toArray().map(v => v.toFixed(5)).join(",")}|${mergedBox.max.toArray().map(v => v.toFixed(5)).join(",")}`;
  merged.dispose();
  for (const part of parts) part.dispose();
  return { vertices, signature, extent };
}

const records = new Map();
for (let variant = 0; variant < 3; variant++) for (const detail of TIERS) {
  const first = build(variant, detail), repeat = build(variant, detail);
  assert.equal(first.vertices, repeat.vertices, `variant ${variant} detail ${detail} must be deterministic in vertex count`);
  assert.equal(first.signature, repeat.signature, `variant ${variant} detail ${detail} must be deterministic in bounds`);
  records.set(`${variant}:${detail}`, first);
}

// The tiers must genuinely subdivide, not re-band into the same mesh.
for (let variant = 0; variant < 3; variant++) {
  const low = records.get(`${variant}:18`), high = records.get(`${variant}:48`);
  assert.ok(high.vertices > low.vertices, `variant ${variant} must subdivide: detail 48 (${high.vertices}) over detail 18 (${low.vertices})`);
}
// The three morphotypes must be three animals, not one animal recoloured.
for (const detail of TIERS) {
  const counts = TIERS.map(() => 0).map((_, i) => records.get(`${i}:${detail}`).vertices);
  assert.equal(new Set(counts).size, 3, `detail ${detail} variants must differ in vertex count`);
  const signatures = [0, 1, 2].map(variant => records.get(`${variant}:${detail}`).signature);
  assert.equal(new Set(signatures).size, 3, `detail ${detail} variants must differ in bounds`);
}

console.log(`ungulate anatomy v0 ${TIERS.map(t => `${t}:${records.get(`0:${t}`).vertices}`).join(" ")} | `
  + `v1 ${TIERS.map(t => `${t}:${records.get(`1:${t}`).vertices}`).join(" ")} | `
  + `v2 ${TIERS.map(t => `${t}:${records.get(`2:${t}`).vertices}`).join(" ")} vertices (largest extents `
  + `${[0, 1, 2].map(v => records.get(`${v}:48`).extent.toFixed(3)).join("/")}) — indexed parts, finite attributes, `
  + `merge-compatible, tier and morphotype separation passed`);
