import assert from "node:assert/strict";
import {
  applyTerrainPresetParams,
  buildModel,
  colorForValue,
  createDefaultParams
} from "../src/geoEngine.js";

const base = { ...createDefaultParams(), resolution: 64, mapSizeKm: 32, wildlifeEnabled: false };
const selection = { geomorphologyPreset: "custom", scenicPreset: "grand_canyon" };
const params = applyTerrainPresetParams(base, selection);
assert.equal(params.geomorphologyPreset, "canyon_plateau");
assert.equal(params.seaLevel, 0);
assert.equal(params.precipitationScale, 0.5);
assert.equal(params.vegetationCoverScale, 0.5);
assert.equal(params.seed, base.seed, "applying a preset must not change the user seed");
assert.equal(applyTerrainPresetParams(params, selection).seed, params.seed, "reapplying must be stable");

const model = buildModel(params);
const n = model.n;
const centerX = Math.floor(n / 2);
const profile = Array.from({ length: n }, (_, y) => model.height[y * n + centerX]);
const channelFloor = Math.min(...profile);
assert.ok(profile[0] > 2200 && profile[0] < 2700, "north rim should remain a high plateau");
assert.ok(profile[n - 1] > 1900 && profile[n - 1] < 2400, "south rim should remain a high plateau");
assert.ok(channelFloor > 650 && channelFloor < 1050, "river corridor should cut below both rims");
assert.equal(model.stats.landFraction, 1, "inland canyon must not acquire a sea coast");
assert.ok(model.stats.meanPrecipitation > 200 && model.stats.meanPrecipitation < 650,
  "canyon preset should not inherit a humid regional climate");
assert.ok(model.stats.meanVegetation < 0.35, "arid reference should not be blanketed by dense vegetation");
assert.ok(colorForValue(model, params, "elevation", centerX * n + centerX).every(Number.isFinite),
  "preset elevation coloring must not throw or return invalid channels");

for (const mapSizeKm of [8, 128]) {
  const scaleModel = buildModel({ ...params, mapSizeKm });
  assert.equal(scaleModel.stats.landFraction, 1, "a resized inland reference must stay inland");
  assert.ok(scaleModel.height.every(Number.isFinite), "resizing the scenic reference must not create invalid elevation");
}

for (const seed of [base.seed, 543210]) {
  const scenario = seed === base.seed ? model : buildModel({ ...params, seed });
  const principalReaches = [...scenario.riverSegments].sort((a, b) => b.catchment - a.catchment).slice(0, 12);
  assert.ok(principalReaches.length >= 12, "the main canyon should have a routed river network");
  for (const reach of principalReaches) {
    const x = reach.from % n;
    const y = Math.floor(reach.from / n);
    const floor = Math.min(...Array.from({ length: n }, (_, row) => scenario.height[row * n + x]));
    assert.ok(scenario.height[y * n + x] - floor < 30,
      "the largest river reaches should follow the canyon floor, not a rim or tributary wall");
  }
}

const wetter = buildModel({ ...params, precipitationScale: 1 });
assert.ok(wetter.stats.meanPrecipitation > model.stats.meanPrecipitation * 1.5,
  "the precipitation control must remain effective after applying a scenic preset");

const switched = applyTerrainPresetParams(params, { geomorphologyPreset: "canyon_plateau", scenicPreset: "yosemite_valley" });
assert.equal(switched.geomorphologyPreset, "alpine_glacier", "the new scenic selection must own its landform");
assert.equal(switched.precipitationScale, 1, "dry conditions must not leak into a different preset");
assert.equal(switched.vegetationCoverScale, 1);
assert.equal(switched.seaLevel, createDefaultParams().seaLevel);

console.log("scenic preset: passed");
