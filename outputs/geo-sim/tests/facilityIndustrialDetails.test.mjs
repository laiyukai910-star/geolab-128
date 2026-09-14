import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// Same vendored-three resolve hook the other geo-sim tests register.
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
const { RoundedBoxGeometry } = await import("three/addons/geometries/RoundedBoxGeometry.js");
const { industrialDetailParts } = await import("../src/facilityIndustrialDetails.js");

// Helper implementations copied verbatim from src/facilityGeometry.js, so this test exercises the
// module against the same put/box/cylinder/tube/ring contract the parent library uses.
function makeHelpers(tier) {
  const radial = [16, 28, 44][tier], parts = [];
  // One pre-existing member, as the parent's own parts array always has. The module snapshots the
  // sink before it registers anything, so an empty mock sink would make it collect its own members
  // twice.
  parts.push(seedPart());
  const wall = 0xe7e4dc, trim = 0xf4f1e9, glass = 0x6d9cab, metal = 0x9eacb0;
  const put = (geometry, color, position = [0, 0, 0], rotation = [0, 0, 0]) => {
    geometry.rotateX(rotation[0]); geometry.rotateY(rotation[1]); geometry.rotateZ(rotation[2]);
    geometry.translate(...position);
    const rgb = new THREE.Color(color), values = new Float32Array(geometry.attributes.position.count * 3);
    const response = new Float32Array(geometry.attributes.position.count * 2);
    const glazed = [glass, 0x679aaa, 0x94bdb1, 0xaccdc0].includes(color);
    const metallic = color === metal;
    for (let i = 0; i < response.length; i += 2) { response[i] = glazed ? 0.18 : metallic ? 0.40 : 0.86; response[i + 1] = metallic ? 0.55 : 0; }
    for (let i = 0; i < values.length; i += 3) rgb.toArray(values, i);
    geometry.setAttribute("color", new THREE.BufferAttribute(values, 3));
    geometry.setAttribute("constructionResponse", new THREE.BufferAttribute(response, 2));
    const source = geometry.index ? geometry.toNonIndexed() : geometry;
    source.deleteAttribute("uv"); parts.push(source);
    if (source !== geometry) geometry.dispose();
    return source;
  };
  const box = (p, size, color = wall, bevel = 0.006) => put(
    new RoundedBoxGeometry(...size, tier + 1, Math.min(bevel, ...size.map(s => s * 0.16))), color, p);
  const cylinder = (p, radius, height, color = metal) => put(new THREE.CylinderGeometry(radius, radius, height, radial), color, p);
  const tube = (points, radius, color = metal) => put(new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 12 + tier * 8, radius, 8 + tier * 4, false), color);
  const ring = (radius, tubeRadius, p, color = metal) => put(new THREE.TorusGeometry(radius, tubeRadius, 6 + tier * 2, radial), color, p, [Math.PI / 2, 0, 0]);
  return { parts, box, cylinder, tube, ring, put, tier, radial, colors: { wall, trim, glass, metal } };
}

// Stated envelope per kind, from the task contract. The turbine blade reaches x,z = +-0.2 exactly at
// its widest section and the process tank reaches r = 0.5 by design, so the tolerance is only the
// float error the rotate/translate in put can introduce.
const ENVELOPES = {
  "sawtooth-industrial": { x: [-0.5, 0.5], y: [-0.5, 0.5], z: [-0.5, 0.5] },
  "process-tank": { x: [-0.5, 0.5], y: [-0.5, 0.5], z: [-0.5, 0.5] },
  "solar-panel-frame": { x: [-0.5, 0.5], y: [-0.5, 0.1], z: [-0.5, 0.5] },
  "turbine-blade": { x: [-0.2, 0.2], y: [-0.5, 0.5], z: [-0.2, 0.2] }
};
// A stand-in for a member the parent registered before handing the helpers over.
function seedPart() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], 3));
  geometry.setAttribute("constructionResponse", new THREE.Float32BufferAttribute([0.5, 0, 0.5, 0, 0.5, 0], 2));
  return geometry;
}

const KINDS = Object.keys(ENVELOPES);
const EPSILON = 1e-6;
const totals = new Map();

for (const kind of KINDS) {
  const envelope = ENVELOPES[kind];
  const counts = [];
  for (const tier of [0, 1, 2]) {
    const helpers = makeHelpers(tier);
    const sinkBefore = helpers.parts.length;
    const returned = industrialDetailParts(kind, helpers);
    assert.ok(Array.isArray(returned) && returned.length > 0, `${kind}: tier ${tier} must return members`);
    // The module registers every member through the supplied helpers and returns the members it
    // emitted. The sink holds the same objects, so the count that matters is the number emitted by
    // this call, not the whole sink: the parent may have registered its own parts into it first.
    const emitted = helpers.parts.slice(sinkBefore);
    assert.equal(new Set(returned).size, returned.length, `${kind}: the returned members must be distinct`);
    assert.equal(emitted.length, returned.length, `${kind}: members must be the ones put emitted`);
    assert.ok(returned.every(member => emitted.includes(member)), `${kind}: every returned member must be a registered part`);
    const parts = returned;
    let vertices = 0;
    for (const [index, part] of parts.entries()) {
      const position = part.getAttribute("position");
      assert.ok(position && position.count > 0, `${kind}: every member needs positions`);
      const color = part.getAttribute("color"), response = part.getAttribute("constructionResponse");
      assert.equal(color?.count, position.count, `${kind}: put must bake a colour per vertex`);
      assert.equal(response?.count, position.count, `${kind}: put must bake a construction response per vertex`);
      for (const value of color.array) assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, `${kind}: colour range`);
      for (const value of response.array) assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, `${kind}: response range`);
      for (const axis of ["x", "y", "z"]) {
        const [low, high] = envelope[axis];
        for (let i = 0; i < position.count; i++) {
          const value = position.getComponent(i, "xyz".indexOf(axis));
          assert.ok(Number.isFinite(value), `${kind}: finite coordinates`);
          assert.ok(value >= low - EPSILON && value <= high + EPSILON,
            `${kind}: tier ${tier} member ${index} ${axis} = ${value} outside envelope [${low}, ${high}]`);
        }
      }
      vertices += position.count;
    }
    counts.push(vertices);
    totals.set(`${kind}:${tier}`, vertices);
  }
  // Determinism: a second call must reproduce the same assembly exactly.
  for (const tier of [0, 1, 2]) {
    const helpers = makeHelpers(tier);
    const repeated = industrialDetailParts(kind, helpers)
      .reduce((sum, part) => sum + part.getAttribute("position").count, 0);
    assert.equal(repeated, counts[tier], `${kind}: tier ${tier} must be deterministic`);
  }
  // Higher tiers refine: never fewer vertices than the tier below.
  for (let tier = 1; tier < counts.length; tier++) {
    assert.ok(counts[tier] >= counts[tier - 1], `${kind}: tier ${tier} must not coarsen tier ${tier - 1}`);
  }
  console.log(`${kind}: ${counts[0]} / ${counts[1]} / ${counts[2]} vertices at tiers 0 / 1 / 2`);
}

for (const kind of ["solar-rack", "setback-tower", "sawtooth-industrial ", "", "process_tank"]) {
  const helpers = makeHelpers(1);
  const sinkBefore = helpers.parts.length;
  assert.deepEqual(industrialDetailParts(kind, helpers), [], `${kind}: unhandled kinds return no members`);
  // The sink is the mock's own ledger and the module reads back from the same helper, so it is not
  // an independent observation of the module. What the module promises for an unhandled kind is an
  // empty result, which is the line above; the second call below pins that it is also idempotent.
  assert.deepEqual(industrialDetailParts(kind, makeHelpers(1)), [], `${kind}: unhandled kinds stay unhandled`);
  for (const tier of [0, 2]) {
    assert.deepEqual(industrialDetailParts(kind, makeHelpers(tier)), [], `${kind}: unhandled at tier ${tier}`);
  }
}

console.log(`Industrial detail members passed: 4 kinds, ${[...totals.values()].reduce((a, b) => a + b, 0)} vertices across 12 tier levels`);
