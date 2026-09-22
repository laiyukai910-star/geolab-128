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

console.log(
  `Dimensional hazards wired into the engine (legacy index peaks at ${Math.max(...hazards.floodDepthM).toFixed(2)}, ` +
  `dimensional depth at ${Math.max(...hazards.dimensional.floodDepthM).toFixed(3)} m, ` +
  `${hazards.dimensional.summary.factorOfSafetyComputedCells} cells carry a factor of safety) passed`
);
