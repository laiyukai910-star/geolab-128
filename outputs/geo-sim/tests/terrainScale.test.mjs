import assert from "node:assert/strict";
import { buildModel, createDefaultParams } from "../src/geoEngine.js";

const base = { ...createDefaultParams(), wildlifeEnabled: false };
const at = (model, xKm, yKm) => {
  const x = Math.round((xKm / model.sizeKm + 0.5) * (model.n - 1));
  const y = Math.round((yKm / model.sizeKm + 0.5) * (model.n - 1));
  return model.height[y * model.n + x];
};
const edgeWetFraction = (model, seaLevel) => {
  let wet = 0;
  for (let i = 0; i < model.n; i += 1) {
    for (const index of [i, (model.n - 1) * model.n + i, i * model.n, i * model.n + model.n - 1]) {
      if (model.height[index] <= seaLevel) wet += 1;
    }
  }
  return wet / (model.n * 4);
};

const local8 = buildModel({ ...base, mapSizeKm: 8, resolution: 129 });
const local16 = buildModel({ ...base, mapSizeKm: 16, resolution: 129 });
const regional32 = buildModel({ ...base, mapSizeKm: 32, resolution: 257 });
const regional128 = buildModel({ ...base, mapSizeKm: 128, resolution: 129 });

assert.equal(local8.stats.landFraction, 1, "a local inland map must not inherit a synthetic coast");
assert.equal(edgeWetFraction(local16, base.seaLevel), 0);
assert.ok(local8.stats.minElevation > local16.stats.minElevation + 40,
  "changing map extent must expose more terrain, not stretch the same normalized heightfield");
assert.ok(regional128.stats.landFraction < 0.95);
assert.ok(edgeWetFraction(regional128, base.seaLevel) > 0.1);
assert.ok(edgeWetFraction(regional128, base.seaLevel) < 0.9,
  "the large-area coast must not flood the whole square perimeter");

for (const [xKm, yKm] of [[0, 0], [2, -1], [-4, 3], [6, 5]]) {
  assert.ok(Math.abs(at(local16, xKm, yKm) - at(regional32, xKm, yKm)) < 0.001,
    "the same physical coordinate and sampling pitch must retain its elevation across map extents");
}
assert.ok(Math.abs(at(local16, 0, 0) - at(regional128, 0, 0)) < 20,
  "coast framing must not reshape the inland center of a larger map");

const coarse16 = buildModel({ ...base, mapSizeKm: 16, resolution: 65 });
const fine16 = buildModel({ ...base, mapSizeKm: 16, resolution: 257 });
const meanSlope = model => model.slope.reduce((sum, value) => sum + value, 0) / model.slope.length;
assert.ok(meanSlope(fine16) < meanSlope(coarse16) * 1.25,
  "high-frequency noise must not make terrain progressively steeper as the grid is refined");

const observedHeight = 1234;
const dem = { width: 8, height: 8, data: new Float32Array(64).fill(observedHeight), bounds: [0, 0, 8, 8] };
const imported = buildModel({ ...base, mapSizeKm: 8, resolution: 65, externalDataWeight: 1, externalLayers: { dem } });
assert.ok(imported.height.every(value => value === observedHeight),
  "imported elevations at full weight must remain authoritative over procedural terrain");

console.log("metric terrain scale and sampling: passed");
