import { registerHooks } from "node:module";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "three") return nextResolve(new URL("../vendor/three/three.module.js", import.meta.url).href, context);
    if (specifier.startsWith("three/addons/")) {
      return nextResolve(new URL(`../vendor/three/addons/${specifier.slice("three/addons/".length)}`, import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  }
});

const { buildModel, createDefaultParams } = await import("../src/geoEngine.js");

/*
 * The engine's hazard object carries two sets of fields, and this test exists to keep them distinct.
 *
 * The composite fields (floodHazard, floodDepthM, droughtStress, ...) are the original dimensionless
 * weighted sums. `floodDepthM` is named as though it were a depth but is a scaled index: measured, it
 * reaches 2.70 in a default scenario, which no depth in that setting could be.
 *
 * The dimensional set lives under `hazards.dimensional` and carries a depth in metres, a velocity in
 * metres per second, a factor of safety, a deficit in millimetres and a fuel moisture as a fraction of
 * oven-dry mass, each with the method that produced it. Both are published so a consumer can move
 * across deliberately, and the point of this test is that a reader can tell which is which.
 */

const model = buildModel({ ...createDefaultParams(), resolution: 64, mapSizeKm: 128 });
const hazards = model.hazards;

// ---------------------------------------------------------------- the dimensional set is attached

{
  assert.equal(hazards.dimensionalAttached, true,
    "a default scenario must be able to support the dimensional quantities");
  assert.ok(hazards.dimensional, "the dimensional set must be present");
  assert.equal(hazards.dimensional.error, undefined, "and must carry no error");
  assert.equal(hazards.dimensional.cellCount, model.height.length, "and must cover the grid");
}

// ---------------------------------------------------------------- the two sets are not the same thing

{
  const legacy = hazards.floodDepthM;
  const dimensional = hazards.dimensional.floodDepthM;
  assert.ok(ArrayBuffer.isView(legacy) && ArrayBuffer.isView(dimensional), "both must be arrays");
  assert.equal(legacy.length, dimensional.length, "both must cover the same grid");

  const legacyMax = Math.max(...legacy);
  const dimensionalMax = Math.max(...dimensional);
  // The legacy field is a scaled index and overshoots any depth this terrain could produce; the
  // dimensional one is a depth. If these ever coincide the two sets have been conflated.
  assert.ok(legacyMax > 1.5,
    `the legacy field must still be its scaled index, got a maximum of ${legacyMax.toFixed(3)}`);
  assert.ok(dimensionalMax > 0 && dimensionalMax < 8,
    `the dimensional depth must be the order of a real flood, got ${dimensionalMax.toFixed(3)} m`);
  assert.notEqual(legacyMax.toFixed(3), dimensionalMax.toFixed(3),
    "the legacy index and the dimensional depth must not be the same number");

  // The legacy fields must be untouched by the addition: they are a published contract.
  for (const key of ["floodHazard", "floodDepthM", "droughtStress", "wildfireRisk", "landslideRisk",
    "hazardIndex", "cumulativeErosionM", "projectedVegetation"]) {
    assert.ok(ArrayBuffer.isView(hazards[key]), `${key} must still be published as an array`);
    for (let index = 0; index < hazards[key].length; index += 37) {
      assert.ok(Number.isFinite(hazards[key][index]), `${key} must stay finite`);
    }
  }
}

// ---------------------------------------------------------------- the dimensional set states its units

{
  const units = hazards.dimensional.units;
  assert.ok(units, "the dimensional set must state its units");
  assert.equal(units.floodDepthM, "m");
  assert.equal(units.floodVelocityMs, "m/s");
  assert.equal(units.factorOfSafety, "dimensionless ratio");
  assert.equal(units.waterDeficitMm, "mm");
  assert.ok(units.fineFuelMoisture.includes("oven-dry"),
    "the fuel moisture must say what it is a fraction of");

  const summary = hazards.dimensional.summary;
  assert.ok(summary.method.floodDepth.includes("Manning"), "the flood depth must name its method");
  assert.ok(summary.method.slopeStability.includes("Infinite slope"), "the stability must name its model");
  assert.ok(summary.method.fineFuelMoisture.includes("Van Wagner"), "the moisture must name its source");
  assert.ok(summary.method.waterDeficit.includes("millimetres"),
    "the deficit must state that it is a depth, not an index");
}

// ---------------------------------------------------------------- method names travel with the data

{
  // The same method string must reach a caller through the engine, not only through the module, so a
  // consumer of the model can always answer where a number came from.
  const methods = hazards.dimensional.summary.method;
  assert.ok(Object.keys(methods).length >= 6, "every quantity must be accounted for");
  for (const [key, value] of Object.entries(methods)) {
    assert.ok(typeof value === "string" && value.length > 10, `${key} must name its method`);
  }
}

// ---------------------------------------------------------------- the export can be told apart

// The index export is a contract read by position, so a column added in the middle would corrupt every
// row. The dimensional columns are appended at the end and the header is checked against the row
// builder, because a header and a row that disagree is how an export silently lies about its own data.
{
  const source = readFileSync(new URL("../src/geoEngine.js", import.meta.url), "utf8");
  const lines = source.split(/\r?\n/);
  const headerLine = lines.findIndex(line => line.includes("flood_hazard,flood_depth_m,drought_stress"));
  assert.ok(headerLine >= 0, "the index export header must still exist");
  const header = lines[headerLine].trim().replace(/^"/, "").replace(/",?$/, "").replace(/"\s*$/, "").split(",");

  // Count the entries of the row array that belongs to that header.
  let rowStart = -1;
  for (let i = headerLine; i < headerLine + 4000; i += 1) {
    if (lines[i]?.includes("round(x * model.cellSizeKm, 4)")) { rowStart = i - 1; break; }
  }
  assert.ok(rowStart >= 0, "the index export row builder must still exist");
  let depth = 0, rowEnd = -1;
  for (let i = rowStart; i < rowStart + 400; i += 1) {
    for (const ch of lines[i]) {
      if (ch === "[") depth += 1;
      else if (ch === "]") { depth -= 1; if (depth === 0) { rowEnd = i; break; } }
    }
    if (rowEnd >= 0) break;
  }
  assert.ok(rowEnd > rowStart, "the row array must terminate");
  let body = lines.slice(rowStart, rowEnd + 1).join("\n");
  body = body.slice(body.indexOf("[") + 1, body.lastIndexOf("]"));
  let nesting = 0, current = "";
  const entries = [];
  for (const ch of body) {
    if ("([{".includes(ch)) nesting += 1;
    if (")]}".includes(ch)) nesting -= 1;
    if (ch === "," && nesting === 0) { entries.push(current.trim()); current = ""; continue; }
    current += ch;
  }
  if (current.trim()) entries.push(current.trim());
  const nonEmpty = entries.filter(entry => entry.length > 0);
  assert.equal(header.length, nonEmpty.length,
    "every header column must have exactly one row value, or the export is misaligned: header " +
    header.length + " against " + nonEmpty.length + " values");

  // The dimensional columns are present, at the end, and each is wired to its own quantity.
  const dimensionalColumns = [
    ["flood_depth_dimensional_m", "dimensional?.floodDepthM"],
    ["flood_velocity_dimensional_ms", "dimensional?.floodVelocityMs"],
    ["slope_factor_of_safety", "dimensional?.factorOfSafety"],
    ["water_deficit_mm", "dimensional?.waterDeficitMm"],
    ["fine_fuel_moisture_fraction", "dimensional?.fineFuelMoisture"]
  ];
  for (const [name, expression] of dimensionalColumns) {
    const index = header.indexOf(name);
    assert.ok(index >= 0, name + " must be exported");
    assert.ok(index >= header.length - dimensionalColumns.length,
      name + " must be appended at the end, so no existing column moves");
    assert.ok(nonEmpty[index].includes(expression),
      name + " must be wired to " + expression + ", got " + nonEmpty[index].slice(0, 60));
  }
  // The legacy column keeps its own value, so a reader can see both and tell them apart.
  const legacyIndex = header.indexOf("flood_depth_m");
  assert.ok(legacyIndex >= 0 && legacyIndex < header.indexOf("flood_depth_dimensional_m"),
    "the legacy flood depth column must stay where it was");
  assert.ok(nonEmpty[legacyIndex].includes("hazards?.floodDepthM"),
    "the legacy column must keep reading the legacy field");
}

console.log(
  `Dimensional hazards wired into the engine (legacy index peaks at ${Math.max(...hazards.floodDepthM).toFixed(2)}, ` +
  `dimensional depth at ${Math.max(...hazards.dimensional.floodDepthM).toFixed(3)} m, ` +
  `${hazards.dimensional.summary.factorOfSafetyComputedCells} cells carry a factor of safety) passed`
);
