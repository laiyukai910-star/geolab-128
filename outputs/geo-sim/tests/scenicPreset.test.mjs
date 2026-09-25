import assert from "node:assert/strict";
import {
  applyTerrainPresetParams,
  buildModel,
  colorForValue,
  createDefaultParams
} from "../src/geoEngine.js";
import { naturalTerrainColor } from "../src/terrainAppearance.js";

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
assert.equal(switched.precipitationScale, 0.8, "a new scenic reference must replace the previous dry climate");
assert.equal(switched.vegetationCoverScale, 1);
assert.equal(switched.seaLevel, 0);

const yosemite = buildModel({ ...switched, resolution: 64, mapSizeKm: 32, wildlifeEnabled: false });
const valleyX = Math.floor(yosemite.n / 2);
const valleyProfile = Array.from({ length: yosemite.n }, (_, y) => yosemite.height[y * yosemite.n + valleyX]);
const valleyFloor = Math.min(...valleyProfile);
assert.ok(valleyFloor > 1150 && valleyFloor < 1400, "Yosemite valley floor should stay near the NPS elevation");
assert.ok(Math.min(valleyProfile[0], valleyProfile.at(-1)) - valleyFloor > 700,
  "glacial valley walls must stand well above the broad floor");
assert.ok(valleyProfile.filter(height => height < valleyFloor + 80).length >= 3,
  "the Yosemite trough must have a flat floor, not a narrow V-shaped slot");
assert.ok(yosemite.stats.maxElevation < 3300, "the valley reference must not inherit implausibly high generic peaks");
assert.ok(yosemite.stats.meanPrecipitation > 750 && yosemite.stats.meanPrecipitation < 1200);
assert.equal(yosemite.stats.landFraction, 1);

const guilinParams = applyTerrainPresetParams(switched, { scenicPreset: "guilin_lijiang" });
assert.equal(guilinParams.seed, base.seed);
assert.equal(guilinParams.geomorphologyPreset, "karst_towers");
const guilin = buildModel({ ...guilinParams, resolution: 64, mapSizeKm: 32, wildlifeEnabled: false });
assert.equal(guilin.stats.landFraction, 1, "Guilin's inland river plain must not become a coast");
assert.ok(guilin.stats.minElevation > 80 && guilin.stats.maxElevation < 1100);
assert.ok(guilin.stats.maxElevation - guilin.stats.minElevation > 400,
  "karst towers must rise distinctly above the floodplain");
assert.ok(guilin.riverSegments.length > 30, "the riverine karst reference needs a routed drainage network");
const channelIndex = guilin.hydraulics.channelMask.findIndex(Boolean);
assert.ok(channelIndex >= 0, "the riverine reference needs routed channel cells");
const channelColor = naturalTerrainColor(guilin, guilinParams, channelIndex);
const channelFreeModel = { ...guilin, hydraulics: { ...guilin.hydraulics, channelMask: null } };
const dryColor = naturalTerrainColor(channelFreeModel, guilinParams, channelIndex);
assert.ok(channelColor[2] > dryColor[2] + 10, "the water tint must follow computed channels");

const fujiParams = applyTerrainPresetParams(guilinParams, { scenicPreset: "mount_fuji" });
assert.equal(fujiParams.seed, base.seed);
assert.equal(fujiParams.geomorphologyPreset, "volcanic_island");
const fuji = buildModel({ ...fujiParams, resolution: 128, mapSizeKm: 32, wildlifeEnabled: false });
const summit = Math.floor(fuji.n / 2);
const centerHeight = fuji.height[summit * fuji.n + summit];
const ringHeight = Math.max(...[-2, -1, 0, 1, 2].flatMap(dy =>
  [-2, -1, 0, 1, 2].map(dx => fuji.height[(summit + dy) * fuji.n + summit + dx])));
assert.ok(fuji.stats.maxElevation > 3600 && fuji.stats.maxElevation < 3900,
  "the summit should remain near Mount Fuji's surveyed 3776 m height");
assert.ok(ringHeight - centerHeight > 80, "the summit crater must be lower than its rim");
assert.ok(centerHeight - fuji.height[summit * fuji.n] > 1800,
  "the cone must rise sharply above its lower slopes");
assert.equal(fuji.stats.landFraction, 1, "the 32 km Fuji reference is an inland mountain, not an island");

for (const reference of [switched, guilinParams, fujiParams]) {
  for (const mapSizeKm of [8, 128]) {
    const scaled = buildModel({ ...reference, mapSizeKm, resolution: 64, wildlifeEnabled: false });
    assert.equal(scaled.stats.landFraction, 1);
    assert.ok(scaled.height.every(Number.isFinite), "dedicated references must remain finite across map extents");
  }
}

console.log("scenic preset: passed");
