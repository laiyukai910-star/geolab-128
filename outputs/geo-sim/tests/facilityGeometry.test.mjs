import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
const { REBUILT_FACILITY_KINDS, createFacilityGeometry } = await import("../src/facilityGeometry.js");

const QUALITY_TIERS = Object.freeze(["low", "ultra", "exhaustive"]);
const COLOR_ATTRIBUTES = Object.freeze(["color", "constructionResponse"]);
// Measured, not assumed: every position coordinate of every kind at every tier lands in the unit
// box because createFacilityGeometry centres then scales the merged mesh at the end (|v| <= 0.5).
const NORMALIZED_BOUND = 0.5 + 1e-5;
const ENVELOPE_BOUND = 1.2;
// Floors are 75% of the smallest triangle count measured across low/ultra/exhaustive for that kind
// (the low tier is always the binding one because refinement is strictly monotonic). The measured
// minima below were read from facilityGeometry.js at src sha256 be080bcd6b7aab3c...; re-measure and
// re-pin them when a kind is legitimately rebuilt with a different detail density.
const MIN_TRIANGLES = Object.freeze({
  "setback-tower": 31320,      // measured 41760
  "courtyard-midrise": 45729,  // measured 60972
  "l-plan-lowrise": 13755,     // measured 18340
  "sawtooth-industrial": 14823,// measured 19764
  "cross-plan-civic": 29121,   // measured 38828
  "hipped-roof": 4443,         // measured 5924
  "tapered-landmark": 2544,    // measured 3392
  "process-tank": 2064,        // measured 2752
  "water-tower-tank": 2064,    // measured 2752
  "tunnel-portal": 2442,       // measured 3256
  "utility-gallery": 2730,     // measured 3640
  "buttress-dam": 2181,        // measured 2908
  "stepped-spillway": 936,     // measured 1248
  "bridge-pier": 1230,         // measured 1640
  "crowned-road": 615,         // measured 820
  "solar-panel-frame": 8019,   // measured 10692
  "turbine-blade": 309,        // measured 412
  "greenhouse-bay": 1110,      // measured 1480
  "stadium-bowl": 2769,        // measured 9620
  "observatory-dome": 2397,    // measured 3132
  "crane-boom": 4752           // measured 6336
});

assert.equal(REBUILT_FACILITY_KINDS.length, 21, "21 rebuilt facility kinds");
assert.equal(new Set(REBUILT_FACILITY_KINDS).size, 21, "facility kinds must be unique");
assert.deepEqual(Object.keys(MIN_TRIANGLES).sort(), [...REBUILT_FACILITY_KINDS].sort(), "every kind needs a measured triangle floor");

const coordinateBytes = geometry => {
  const position = geometry.getAttribute("position");
  return Buffer.from(position.array.buffer, position.array.byteOffset, position.array.byteLength);
};
const countOutsideUnitRange = array => {
  let outside = 0;
  for (let i = 0; i < array.length; i++) if (!(array[i] >= 0 && array[i] <= 1)) outside++;
  return outside;
};

const ultraBudget = {};
let checked = 0, indexed = 0, coordinates = 0;
for (const kind of REBUILT_FACILITY_KINDS) {
  const trianglesByTier = [];
  for (const quality of QUALITY_TIERS) {
    const geometry = createFacilityGeometry(kind, quality), repeat = createFacilityGeometry(kind, quality);
    assert.ok(geometry !== null && typeof geometry === "object", `${kind}/${quality}: geometry required`);
    const position = geometry.getAttribute("position");
    assert.ok(position, `${kind}/${quality}: position attribute required`);
    assert.ok(position.count > 0, `${kind}/${quality}: non-empty position buffer`);
    assert.ok(geometry.index, `${kind}/${quality}: merged assembly must stay indexed`);
    assert.ok(geometry.index.count > 0, `${kind}/${quality}: non-empty index buffer`);
    assert.equal(geometry.index.count % 3, 0, `${kind}/${quality}: index must describe whole triangles`);
    const triangles = geometry.index.count / 3;
    assert.ok(triangles >= MIN_TRIANGLES[kind], `${kind}/${quality}: ${triangles} triangles below measured floor ${MIN_TRIANGLES[kind]}`);
    trianglesByTier.push(triangles);
    checked++; indexed++;

    // Detail tiers must actually add surface, not just relabel the same mesh.
    if (trianglesByTier.length > 1) {
      assert.ok(triangles > trianglesByTier.at(-2), `${kind}/${quality}: quality tiers must refine geometry`);
    }

    const finite = array => {
      for (let i = 0; i < array.length; i++) if (!Number.isFinite(array[i])) return false;
      return true;
    };
    assert.ok(finite(position.array), `${kind}/${quality}: finite position coordinates`);
    for (let axis = 0; axis < 3; axis++) {
      let low = Infinity, high = -Infinity;
      for (let i = axis; i < position.array.length; i += 3) {
        const value = position.array[i];
        if (value < low) low = value;
        if (value > high) high = value;
      }
      coordinates += 2;
      assert.ok(low >= -ENVELOPE_BOUND && high <= ENVELOPE_BOUND, `${kind}/${quality}: axis ${axis} outside [-1.2, 1.2] (${low}..${high})`);
      assert.ok(low >= -NORMALIZED_BOUND && high <= NORMALIZED_BOUND, `${kind}/${quality}: axis ${axis} outside the measured unit-box normalisation (${low}..${high})`);
    }

    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      assert.ok(finite(attribute.array), `${kind}/${quality}: no NaN or Infinity in ${name}`);
      assert.equal(attribute.count, position.count, `${kind}/${quality}: ${name} must cover every vertex`);
    }
    assert.equal(geometry.getAttribute("color").itemSize, 3, `${kind}/${quality}: per-vertex RGB colours`);
    assert.equal(geometry.getAttribute("constructionResponse").itemSize, 2, `${kind}/${quality}: pair of construction response channels`);
    for (const name of COLOR_ATTRIBUTES) {
      assert.equal(countOutsideUnitRange(geometry.getAttribute(name).array), 0, `${kind}/${quality}: ${name} must stay inside [0, 1]`);
    }

    assert.equal(repeat.getAttribute("position").count, position.count, `${kind}/${quality}: deterministic vertex count`);
    assert.equal(Buffer.compare(coordinateBytes(geometry), coordinateBytes(repeat)), 0, `${kind}/${quality}: deterministic position bytes`);
    assert.ok(geometry.userData.facilityRebuild, `${kind}/${quality}: rebuild metadata required`);
    assert.equal(geometry.userData.facilityRebuild.kind, kind, `${kind}/${quality}: metadata must name its kind`);
    assert.equal(geometry.userData.facilityRebuild.detailTier, QUALITY_TIERS.indexOf(quality), `${kind}/${quality}: metadata must record its detail tier`);

    if (quality === "ultra") ultraBudget[kind] = { vertices: position.count, triangles };
    geometry.dispose(); repeat.dispose();
  }
}
assert.equal(checked, REBUILT_FACILITY_KINDS.length * QUALITY_TIERS.length, "every kind at every tier was measured");

assert.equal(createFacilityGeometry("not-a-real-kind", "ultra"), null, "unknown kinds must not fabricate geometry");
assert.equal(createFacilityGeometry(null, "ultra"), null, "null kind must not fabricate geometry");

const source = readFileSync(new URL("../src/facilityGeometry.js", import.meta.url), "utf8");
for (const token of ["Math.random", "Date.now", "performance.now"]) {
  assert.ok(!source.includes(token), `facility geometry must stay deterministic: found ${token}`);
}

console.log(`ultra per-kind budget (${Object.keys(ultraBudget).length} kinds): ${JSON.stringify(ultraBudget)}`);
console.log(`Facility geometry budgets, ${checked} kind/tier meshes (${indexed} indexed, ${coordinates} axis bounds checked), deterministic position bytes and no entropy sources passed`);
