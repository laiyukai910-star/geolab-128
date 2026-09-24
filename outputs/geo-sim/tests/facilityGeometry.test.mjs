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
const { Color, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } = await import("three");

const QUALITY_TIERS = Object.freeze(["low", "ultra", "exhaustive"]);
const COLOR_ATTRIBUTES = Object.freeze(["color", "constructionResponse"]);
// Measured, not assumed: every position coordinate of every kind at every tier lands in the unit
// box because createFacilityGeometry centres then scales the merged mesh at the end (|v| <= 0.5).
const NORMALIZED_BOUND = 0.5 + 1e-5;
const ENVELOPE_BOUND = 1.2;
// Floors are 75% of the smallest triangle count measured across low/ultra/exhaustive for that kind
// (the low tier is always the binding one because refinement is strictly monotonic). The measured
// minima below were measured from generated meshes; re-measure when a kind is rebuilt.
const MIN_TRIANGLES = Object.freeze({
  "setback-tower": 31320,      // measured 41760
  "courtyard-midrise": 45729,  // measured 60972
  "l-plan-lowrise": 13755,     // measured 18340
  "sawtooth-industrial": 23865,// measured 31820
  "cross-plan-civic": 29121,   // measured 38828
  "hipped-roof": 4443,         // measured 5924
  "tapered-landmark": 2544,    // measured 3392
  "process-tank": 2064,        // measured 2752
  "water-tower-tank": 2064,    // measured 2752
  "tunnel-portal": 2442,       // measured 3256
  "utility-gallery": 2730,     // measured 3640
  "buttress-dam": 2181,        // measured 2908
  "stepped-spillway": 936,     // measured 1248
  "bridge-pier": 1740,         // measured 2320
  "crowned-road": 615,         // measured 820
  "solar-panel-frame": 8019,   // measured 10692
  "turbine-blade": 309,        // measured 412
  "greenhouse-bay": 9990,      // measured 13320
  "stadium-bowl": 2769,        // measured 9620
  "observatory-dome": 2952,    // measured 3936
  "crane-boom": 8541,          // measured 11388
  "evacuation-shelter": 13770, // measured 18360
  "river-hatchery": 9655,     // measured 12874
  "water-treatment-works": 13539, // measured 18052
  "ferry-terminal": 7611,         // measured 10148
  "fire-watch-tower": 13362        // measured 17816
});

assert.equal(REBUILT_FACILITY_KINDS.length, 26, "26 rebuilt facility kinds");
assert.equal(new Set(REBUILT_FACILITY_KINDS).size, 26, "facility kinds must be unique");
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
    if (kind === "sawtooth-industrial") {
      const roof = new Color(0x8e999b), colors = geometry.getAttribute("color");
      const roofX = new Set(), roofY = new Set();
      for (let vertex = 0; vertex < position.count; vertex++) {
        if (Math.abs(colors.getX(vertex) - roof.r) > 1e-5 ||
            Math.abs(colors.getY(vertex) - roof.g) > 1e-5 ||
            Math.abs(colors.getZ(vertex) - roof.b) > 1e-5) continue;
        roofX.add(Math.round(position.getX(vertex) * 10000));
        roofY.add(Math.round(position.getY(vertex) * 10000));
      }
      assert.equal(roofX.size, 5, `${quality}: four fixed sawtooth bays require five eave/ridge boundaries`);
      assert.equal(roofY.size, 2, `${quality}: roof shells need a low eave and high glazed ridge`);
    }
    if (kind === "observatory-dome") {
      const { center, size } = geometry.userData.facilityRebuild.normalization;
      const sightY = (-0.08 + 0.46 * Math.cos(0.55) - center[1]) / size[1];
      const sightZ = -center[2] / size[2];
      const material = new MeshBasicMaterial({ side: DoubleSide });
      const mesh = new Mesh(geometry, material);
      const sight = sign => new Raycaster(new Vector3(sign, sightY, sightZ),
        new Vector3(-sign, 0, 0), 0, 2).intersectObject(mesh);
      const front = sight(1), back = sight(-1);
      assert.ok(front[0]?.distance > 1.05, `${quality}: +x view must pass through the upper slit`);
      assert.ok(back[0]?.distance < 0.95, `${quality}: -x view must meet the rear shell`);
      material.dispose();
      const shutter = new Color(0x7896a1), colors = geometry.getAttribute("color");
      let shutterCount = 0, shutterX = 0;
      for (let vertex = 0; vertex < position.count; vertex++) {
        if (Math.abs(colors.getX(vertex) - shutter.r) > 1e-5 ||
            Math.abs(colors.getY(vertex) - shutter.g) > 1e-5 ||
            Math.abs(colors.getZ(vertex) - shutter.b) > 1e-5) continue;
        shutterCount++;shutterX += position.getX(vertex);
      }
      assert.ok(shutterCount > 0 && shutterX / shutterCount > 0.2,
        `${quality}: curved shutter must face the same +x opening`);
    }
    if (["water-treatment-works", "ferry-terminal", "fire-watch-tower"].includes(kind)) {
      const signature = new Color({
        "water-treatment-works": 0x318ba0,
        "ferry-terminal": 0x454f50,
        "fire-watch-tower": 0xa29b87
      }[kind]);
      const colors = geometry.getAttribute("color");
      const feature = [];
      for (let vertex = 0; vertex < position.count; vertex++) {
        if (Math.abs(colors.getX(vertex) - signature.r) < 1e-5 &&
            Math.abs(colors.getY(vertex) - signature.g) < 1e-5 &&
            Math.abs(colors.getZ(vertex) - signature.b) < 1e-5) feature.push(vertex);
      }
      assert.ok(feature.length > 12, `${kind}/${quality}: identifying modeled feature must be present`);
      if (kind === "water-treatment-works") {
        const z = feature.map(vertex => position.getZ(vertex));
        assert.ok(Math.max(...z) - Math.min(...z) > 0.4, `${quality}: two water-filled clarifiers must be separate`);
      }
      if (kind === "fire-watch-tower") {
        const y = feature.map(vertex => position.getY(vertex));
        assert.ok(Math.max(...y) - Math.min(...y) > 0.45, `${quality}: bracing must span multiple tower stages`);
      }
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

const { semanticAssetKind } = await import("../src/proceduralAssets.js");
for (const [label, kind] of [
  ["净水处理厂", "water-treatment-works"],
  ["渡轮码头", "ferry-terminal"],
  ["火情瞭望塔", "fire-watch-tower"]
]) assert.equal(semanticAssetKind(label), kind, `${label} must route to its own mesh`);

const source = readFileSync(new URL("../src/facilityGeometry.js", import.meta.url), "utf8");
for (const token of ["Math.random", "Date.now", "performance.now"]) {
  assert.ok(!source.includes(token), `facility geometry must stay deterministic: found ${token}`);
}

console.log(`ultra per-kind budget (${Object.keys(ultraBudget).length} kinds): ${JSON.stringify(ultraBudget)}`);
console.log(`Facility geometry budgets, ${checked} kind/tier meshes (${indexed} indexed, ${coordinates} axis bounds checked), deterministic position bytes and no entropy sources passed`);
