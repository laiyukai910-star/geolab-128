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

const { buildModel, createDefaultParams, makeGridCSV } = await import("../src/geoEngine.js");
const { buildEngineScenePackage } = await import("../src/engineInterop.js");

/*
 * A value that has a unit must reach the consumer WITH that unit. This is the end of the chain that
 * starts in hazardQuantities: the quantity is computed with a physical dimension, carried on the model,
 * and then exported in a form where a reader can recover it. A normalised image of metres is not metres,
 * and a column named flood_depth_m holding a screening index is the defect in miniature, so both are
 * asserted here rather than assumed.
 */

const model = buildModel({ ...createDefaultParams(), resolution: 32, mapSizeKm: 64 });

// ---------------------------------------------------------------- the grid CSV declares its own columns

{
  const csv = makeGridCSV(model);
  const rows = csv.split("\n");
  const legend = rows.filter(row => row.startsWith("#"));
  const header = rows.find(row => row.startsWith("x_km,y_km,elevation_m"));
  const data = rows.filter(row => row && !row.startsWith("#") && !row.startsWith("x_km"));
  assert.ok(legend.length >= 5, `the export must carry a legend, got ${legend.length} lines`);
  assert.ok(header, "the export must still have its header row");
  assert.ok(data.length > 0, "the export must still have data rows");

  // Every row must have the same number of columns, including the header, or the file is misaligned.
  const counts = new Set([header.split(",").length, ...data.slice(0, 5).map(row => row.split(",").length)]);
  assert.equal(counts.size, 1, `every row must have the same column count, saw ${[...counts].join(", ")}`);
  const columnCount = [...counts][0];
  assert.ok(columnCount > 60, `the export must still carry its full column set, got ${columnCount}`);

  const legendText = legend.join("\n");
  // The legend must name the mislabelled columns as indices, so a reader is not misled by the name.
  for (const mislabelled of ["flood_depth_m", "flood_hazard", "landslide_risk", "hazard_index"]) {
    assert.ok(legendText.includes(mislabelled),
      `${mislabelled} holds a screening index despite its name and must be declared as one`);
  }
  assert.ok(/NOT measurements/i.test(legendText),
    "the legend must state plainly which columns are not measurements");
  // And it must name the dimensional columns as the measured ones.
  for (const measured of ["flood_depth_dimensional_m", "slope_factor_of_safety", "water_deficit_mm"]) {
    assert.ok(legendText.includes(measured), `${measured} is a measurement and must be declared as one`);
  }
  // The header must actually carry the dimensional columns the legend promises.
  const columns = header.split(",");
  for (const name of ["flood_depth_dimensional_m", "flood_velocity_dimensional_ms",
    "slope_factor_of_safety", "water_deficit_mm", "fine_fuel_moisture_fraction"]) {
    assert.ok(columns.includes(name), `${name} is promised by the legend and must be a column`);
  }
  // The legacy column keeps its place, so no existing consumer shifts.
  assert.ok(columns.indexOf("flood_depth_m") < columns.indexOf("flood_depth_dimensional_m"),
    "the legacy column must stay ahead of its replacement");
}

// ---------------------------------------------------------------- exported layers carry range and unit

{
  const exported = await buildEngineScenePackage(model, { engine: "unity", resolution: 64, seaLevel: 0 });
  const layers = exported?.manifest?.layers || [];
  assert.ok(layers.length > 0, "the engine export must produce layers");

  const floodDepth = layers.find(layer => layer.path.includes("flood-depth-dimensional"));
  assert.ok(floodDepth, "the dimensional flood depth layer must be exported");
  assert.deepEqual(floodDepth.range, [0, 3],
    "the encoded range must be the physical range, or the value cannot be recovered");
  assert.equal(floodDepth.unit, "m", "the layer must state that it recovers to metres");

  const deficit = layers.find(layer => layer.path.includes("water-deficit"));
  assert.ok(deficit, "the water deficit layer must be exported");
  assert.deepEqual(deficit.range, [-800, 800], "a deficit can be negative, and the range must say so");
  assert.equal(deficit.unit, "mm/yr");

  // A dimensionless index must NOT claim a unit, which is itself information for a consumer.
  for (const layer of layers) {
    if (layer.unit === undefined) continue;
    assert.ok(typeof layer.unit === "string" && layer.unit.length > 0, `${layer.path} must state a real unit`);
  }
  // Every layer must state a range, because a normalised image without one is not decodable.
  for (const layer of layers) {
    assert.ok(Array.isArray(layer.range) && layer.range.length === 2,
      `${layer.path} must state the range its values are encoded against`);
    assert.ok(layer.range[0] < layer.range[1], `${layer.path} range must be ordered`);
  }
}

console.log(
  `Hazard display and export verified (grid CSV carries a legend naming its indices, ` +
  `${(await buildEngineScenePackage(model, { engine: "unity", resolution: 64, seaLevel: 0 })).manifest.layers.length} engine layers ` +
  `each state a range, the dimensional flood layer recovers to metres) passed`
);
