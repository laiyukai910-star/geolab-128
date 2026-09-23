import { registerHooks } from "node:module";
import assert from "node:assert/strict";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "three") return nextResolve(new URL("../vendor/three/three.module.js", import.meta.url).href, context);
    if (specifier.startsWith("three/addons/")) {
      return nextResolve(new URL(`../vendor/three/addons/${specifier.slice("three/addons/".length)}`, import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  }
});

const { readLayerFile, readLayerObject, mergeLayerBundle } = await import("../src/dataAdapters.js");
const { buildModel, createDefaultParams, getCell, makeGridCSV, DATA_SOURCE_FLAGS, SUBSURFACE_EVIDENCE_FLAGS } = await import("../src/geoEngine.js");

const n = 8;
const raster = (data, extra = {}) => ({ width: n, height: n, bounds: [0, 0, 8, 8], data, unit: "m", ...extra });
const bathymetry = readLayerObject(raster(Array(n * n).fill(100)), "bathymetry", "seabed.json");
const groundwater = readLayerObject(raster(Array(n * n).fill(0)), "groundwater", "water-table.json");
assert.equal(bathymetry.bathymetryDepth.data[0], 100);
assert.equal(groundwater.waterTableDepth.data[0], 0, "zero depth-to-water is a valid measurement");

const feet = readLayerObject(raster(Array(n * n).fill(10), { unit: "feet" }), "groundwater");
assert.ok(Math.abs(feet.waterTableDepth.data[0] - 3.048) < 1e-4);
const missing = readLayerObject(raster([null, "bad", ...Array(n * n - 2).fill(5)]), "groundwater");
assert.ok(Number.isNaN(missing.waterTableDepth.data[0]));
assert.ok(Number.isNaN(missing.waterTableDepth.data[1]));
const explicitlyMissingZero = readLayerObject(raster(Array(n * n).fill(0), { noData: 0 }), "groundwater");
assert.ok(Number.isNaN(explicitlyMissingZero.waterTableDepth.data[0]), "declared NoData must still mask zero");
const csvInput = `x,y,water_table_depth_m\n${Array.from({ length: n * n }, (_, i) => `${i % n},${Math.floor(i / n)},5`).join("\n")}`;
const csvLayer = await readLayerFile({ name: "water-table.csv", text: async () => csvInput }, "groundwater");
assert.equal(csvLayer.waterTableDepth.data[0], 5);

const params = { ...createDefaultParams(), resolution: n, mapSizeKm: 8, wildlifeEnabled: false, seaLevel: 90, externalDataWeight: 1 };
const seaDem = readLayerObject(raster(Array(n * n).fill(50)), "dem", "sea-dem.json");
const marine = buildModel({ ...params, externalLayers: mergeLayerBundle(mergeLayerBundle({}, seaDem), bathymetry) });
assert.ok(Math.abs(marine.height[0] + 10) < 1e-4, "bathymetry must set seabed below scenario sea level");
assert.ok(marine.externalQuality.some((item) => item.key === "bathymetryDepth"));
assert.equal(marine.dataConfidence.sourceMask[0] & DATA_SOURCE_FLAGS.bathymetry, DATA_SOURCE_FLAGS.bathymetry);
assert.equal(getCell(marine, 0, 0).observedBathymetryDepthM, 100);
const partial = readLayerObject(raster(Array(4 * 4).fill(100), { width: 4, height: 4, bounds: [0, 0, 4, 4] }), "bathymetry");
const partialModel = buildModel({ ...params, externalLayers: mergeLayerBundle({}, partial) });
assert.ok(Number.isNaN(partialModel.externalResampled.bathymetryDepth[n * n - 1]), "uncovered cells must not inherit the nearest measured depth");
assert.equal(getCell(partialModel, n - 1, n - 1).observedBathymetryDepthM, null);

const dryDem = readLayerObject(raster(Array(n * n).fill(200)), "dem", "land-dem.json");
const dryLayers = mergeLayerBundle(mergeLayerBundle(mergeLayerBundle({}, dryDem), bathymetry), groundwater);
const dry = buildModel({ ...params, externalLayers: dryLayers });
assert.ok(Math.abs(dry.height[0] - 200) < 1e-4, "dry DEM must take precedence over overlapping bathymetry");
assert.equal(getCell(dry, 0, 0).observedWaterTableDepthM, 0);
assert.equal(dry.dataConfidence.sourceMask[0] & DATA_SOURCE_FLAGS.groundwater, DATA_SOURCE_FLAGS.groundwater);
assert.equal(dry.dataConfidence.sourceMask[0] & DATA_SOURCE_FLAGS.subsurface, 0, "groundwater raster is not borehole evidence");
assert.equal(dry.subsurface.columnBoreholeObserved[0], 0);
assert.ok(dry.subsurface.columnWaterTableDepthM[0] < params.subsurfaceDepthM * 0.3);
assert.equal(dry.subsurface.voxelEvidenceMask[0] & SUBSURFACE_EVIDENCE_FLAGS.waterTableRaster, SUBSURFACE_EVIDENCE_FLAGS.waterTableRaster);
assert.ok(dry.externalQuality.some((item) => item.key === "waterTableDepth"));

const csv = makeGridCSV(dry).split("\n");
const header = csv.find((line) => line.startsWith("x_km,"));
const row = csv[csv.indexOf(header) + 1];
assert.equal(header.split(",").length, row.split(",").length);
assert.equal(row.split(",")[header.split(",").indexOf("observed_water_table_depth_m")], "0");

console.log("geographic data inputs: passed");
