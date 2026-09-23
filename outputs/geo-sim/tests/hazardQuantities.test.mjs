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

const {
  floodDepthFromDischarge, floodVelocityFromDepth, manningRoughness, computeHazardQuantities,
  relativeHumidityFromVpd,
  slopeFactorOfSafety, fineFuelEquilibriumMoisture, climaticWaterDeficitMm,
  rootCohesionPa, frictionAngleForLithology, effectiveCohesionForLithology,
  HAZARD_METHODS
} = await import("../src/hazardQuantities.js");
const { buildModel, createDefaultParams } = await import("../src/geoEngine.js");

const { readFileSync } = await import("node:fs");
const SOURCE = readFileSync(new URL("../src/hazardQuantities.js", import.meta.url), "utf8");
for (const forbidden of ["Math.random", "Date.now", "performance.now"]) {
  assert.ok(!SOURCE.includes(forbidden), `hazard quantities must be deterministic: source contains ${forbidden}`);
}

// ---------------------------------------------------------------- Manning depth is real Manning

// The closed form, evaluated independently here rather than compared against a number copied from the
// implementation. q = 1 m2/s of unit discharge, n = 0.05, S = 0.001:
//   y = ( q n / sqrt(S) )^(3/5)
{
  const q = 1, n = 0.05, S = 0.001;
  const expected = Math.pow((q * n) / Math.sqrt(S), 0.6);
  const depth = floodDepthFromDischarge({ dischargeM3S: q, widthM: 1, slope: S, roughness: n });
  assert.ok(Math.abs(depth - expected) < 1e-9,
    `Manning depth must equal the closed form: expected ${expected.toFixed(6)} m, got ${depth.toFixed(6)}`);
  // Against a known flood: 1 m2/s per metre of width on a 0.001 slope is about 1.3 m deep, which is the
  // order of a real flood rather than an index. A dimensionless composite could not be checked that way.
  assert.ok(depth > 1.2 && depth < 1.5, `the closed form must be a plausible flood depth, got ${depth.toFixed(3)} m`);
}

// The two directions that must hold for any normal-depth relation.
{
  const base = { dischargeM3S: 10, widthM: 20, slope: 0.002, roughness: 0.05 };
  const low = floodDepthFromDischarge({ ...base, dischargeM3S: 5 });
  const high = floodDepthFromDischarge({ ...base, dischargeM3S: 40 });
  assert.ok(high > low, "depth must rise with discharge");
  const steep = floodDepthFromDischarge({ ...base, slope: 0.02 });
  const flat = floodDepthFromDischarge({ ...base, slope: 0.0002 });
  assert.ok(flat > steep, "a flatter slope must pond deeper for the same discharge");
  const rough = floodDepthFromDischarge({ ...base, roughness: 0.16 });
  const smooth = floodDepthFromDischarge({ ...base, roughness: 0.014 });
  assert.ok(rough > smooth, "a rougher surface must run deeper for the same discharge");
  // Width spreads the same flow: a wider section is shallower.
  assert.ok(floodDepthFromDischarge({ ...base, widthM: 100 }) < floodDepthFromDischarge({ ...base, widthM: 5 }),
    "the same discharge spread wider must be shallower");
}

// Depth scales as q^0.6 exactly, which is the hallmark of the inverted Manning relation rather than a
// linear index. A linear scaling would give 8x for an 8x discharge; Manning gives 8^0.6.
{
  const one = floodDepthFromDischarge({ dischargeM3S: 1, widthM: 1, slope: 0.001, roughness: 0.05 });
  const eight = floodDepthFromDischarge({ dischargeM3S: 8, widthM: 1, slope: 0.001, roughness: 0.05 });
  const expected = Math.pow(8, 0.6);
  assert.ok(Math.abs(eight / one - expected) < 0.01,
    `depth must scale as q^0.6, expected a ratio of ${expected.toFixed(3)}, got ${(eight / one).toFixed(3)}`);
}

// Degenerate input must not produce a non-finite depth, and must not invent flow.
{
  for (const bad of [null, undefined, {}, { dischargeM3S: 0 }, { dischargeM3S: NaN }, { dischargeM3S: -5 }]) {
    const depth = floodDepthFromDischarge({ ...bad });
    assert.ok(Number.isFinite(depth) && depth >= 0, `depth must stay finite and non-negative for ${JSON.stringify(bad)}, got ${depth}`);
    assert.equal(depth, 0, "no discharge is no depth, not a default depth");
  }
  const capped = floodDepthFromDischarge({ dischargeM3S: 1e9, widthM: 1, slope: 1e-5, roughness: 0.4 });
  assert.ok(capped <= 25, "depth must respect the stated ceiling rather than running away");
}

// Velocity follows from the same relation, and rises with depth as y^(2/3).
{
  const v1 = floodVelocityFromDepth({ depthM: 1, slope: 0.001, roughness: 0.05 });
  const v8 = floodVelocityFromDepth({ depthM: 8, slope: 0.001, roughness: 0.05 });
  assert.ok(Math.abs(v8 / v1 - Math.pow(8, 2 / 3)) < 0.01, "velocity must scale as y^(2/3)");
  assert.equal(floodVelocityFromDepth({ depthM: 0, slope: 0.001, roughness: 0.05 }), 0, "no depth is no velocity");
}

// Roughness is a look-up over the cover classes this model carries, and is bounded.
{
  assert.ok(manningRoughness(42) > manningRoughness(71), "forest must be rougher than grassland");
  assert.ok(manningRoughness(22) < manningRoughness(31), "paved must be smoother than barren");
  for (const cover of [11, 21, 22, 23, 24, 31, 41, 42, 43, 52, 71, 81, 82, 90, 95, undefined, NaN]) {
    const n = manningRoughness(cover);
    assert.ok(n >= 0.010 && n <= 0.400, `roughness for cover ${cover} must be physical, got ${n}`);
  }
  // With no cover class it must fall back on the vegetation fraction, not a constant.
  assert.ok(manningRoughness(undefined, 1) > manningRoughness(undefined, 0),
    "the fallback must use the vegetation fraction");
}

// ---------------------------------------------------------------- infinite slope factor of safety

// The textbook result: for a cohesionless, dry, infinite slope the factor of safety reduces to
// tan(phi)/tan(beta), so it equals exactly 1 at the friction angle. This is the check that ties the
// implementation to the published model rather than to the author's expectations.
{
  const cohesionless = {
    soilThicknessM: 1.5, effectiveCohesionPa: 0, rootCohesionPa: 0, frictionAngleDeg: 33,
    saturatedFraction: 0, bulkDensityKgM3: 1600, porosityFraction: 0.35
  };
  assert.ok(Math.abs(slopeFactorOfSafety({ ...cohesionless, slopeDeg: 33 }) - 1) < 1e-9,
    "a cohesionless dry slope must reach exactly FS 1 at its friction angle");
  assert.ok(slopeFactorOfSafety({ ...cohesionless, slopeDeg: 32 }) > 1, "below the friction angle it is stable");
  assert.ok(slopeFactorOfSafety({ ...cohesionless, slopeDeg: 34 }) < 1, "above the friction angle it is not");
  // FS must fall monotonically with slope for a cohesionless material.
  let previous = Infinity;
  for (let angle = 5; angle <= 80; angle += 5) {
    const fs = slopeFactorOfSafety({ ...cohesionless, slopeDeg: angle });
    assert.ok(fs < previous, `the factor of safety must fall with slope, at ${angle} degrees`);
    previous = fs;
  }
}

// With cohesion present the model is much more stable, and that is a property of the model rather than
// a defect to be tuned away: a 1.5 m slab with 7 kPa of combined cohesion does not reach FS 1 at any
// slope, because the resisting term grows with the same cos^2 as the driving term and cohesion is added
// on top. Asserted so that a later change which silently makes cohesive slopes fail would be noticed.
{
  const cohesive = {
    soilThicknessM: 1.5, effectiveCohesionPa: 5000, rootCohesionPa: 2000, frictionAngleDeg: 33,
    saturatedFraction: 0, bulkDensityKgM3: 1600, porosityFraction: 0.35
  };
  assert.ok(slopeFactorOfSafety({ ...cohesive, slopeDeg: 89 }) > 1,
    "a thin cohesive slab stays stable to the vertical in this model, which is why saturation and" +
    " thickness matter more than slope alone for it");
  // Saturation is what destabilises it, which is the physically meaningful lever.
  let dry = slopeFactorOfSafety({ ...cohesive, slopeDeg: 50, saturatedFraction: 0 });
  let wet = slopeFactorOfSafety({ ...cohesive, slopeDeg: 50, saturatedFraction: 0.8 });
  assert.ok(wet < dry, "saturation must destabilise a cohesive slope");
  assert.ok(wet < 1, "a heavily saturated cohesive slope at 50 degrees must cross the threshold");
}

// Saturation must reduce stability at every slope, and roots and cohesion must reinforce.
{
  const base = {
    slopeDeg: 28, soilThicknessM: 1.5, effectiveCohesionPa: 5000, rootCohesionPa: 2000,
    frictionAngleDeg: 33, bulkDensityKgM3: 1600, porosityFraction: 0.35
  };
  for (const slopeDeg of [10, 25, 40, 60]) {
    assert.ok(slopeFactorOfSafety({ ...base, slopeDeg, saturatedFraction: 1 })
      < slopeFactorOfSafety({ ...base, slopeDeg, saturatedFraction: 0 }),
      `a saturated slope must be less stable than a dry one at ${slopeDeg} degrees`);
  }
  assert.ok(slopeFactorOfSafety({ ...base, rootCohesionPa: 5000 }) > slopeFactorOfSafety({ ...base, rootCohesionPa: 0 }),
    "roots must reinforce the slope");
  assert.ok(slopeFactorOfSafety({ ...base, effectiveCohesionPa: 20000 }) > slopeFactorOfSafety({ ...base, effectiveCohesionPa: 0 }),
    "cohesion must reinforce the slope");
}

// A frictionless, cohesionless material on any slope is unstable; a level surface cannot fail this way.
{
  const base = { soilThicknessM: 1, effectiveCohesionPa: 0, rootCohesionPa: 0, frictionAngleDeg: 0, saturatedFraction: 0, bulkDensityKgM3: 1600 };
  assert.ok(slopeFactorOfSafety({ ...base, slopeDeg: 20 }) < 1, "no strength means no stability");
  assert.equal(slopeFactorOfSafety({ ...base, slopeDeg: 0 }), Infinity, "a level surface cannot fail by this mechanism");
}

// Degenerate input must stay finite or be explicitly infinite, never NaN.
{
  for (const bad of [{ slopeDeg: NaN }, { slopeDeg: 90 }, { soilThicknessM: 0 }, { saturatedFraction: 5 }]) {
    const fs = slopeFactorOfSafety({ slopeDeg: 25, soilThicknessM: 1, bulkDensityKgM3: 1600, ...bad });
    assert.ok(Number.isFinite(fs) || fs === Infinity, `the factor of safety must not be NaN for ${JSON.stringify(bad)}, got ${fs}`);
  }
}

// ---------------------------------------------------------------- Van Wagner moisture

// The published equilibrium values. At 100 percent humidity the air is saturated and the fuel tends to
// about 35 percent; hot dry air drives it far lower.
{
  const humid = fineFuelEquilibriumMoisture({ relativeHumidityPercent: 100, temperatureC: 20 });
  assert.ok(humid > 0.30 && humid < 0.40, `saturated air must give about 35 percent, got ${(humid * 100).toFixed(1)}`);
  const dry = fineFuelEquilibriumMoisture({ relativeHumidityPercent: 20, temperatureC: 30 });
  assert.ok(dry < 0.07, `hot dry air must give a low moisture, got ${(dry * 100).toFixed(1)}`);
  assert.ok(dry < humid, "drier air must give drier fuel");
  const cold = fineFuelEquilibriumMoisture({ relativeHumidityPercent: 50, temperatureC: 5 });
  const warm = fineFuelEquilibriumMoisture({ relativeHumidityPercent: 50, temperatureC: 35 });
  assert.ok(warm < cold, "at the same humidity, warmer air must dry the fuel");
  for (const [h, t] of [[1, -40], [100, 60], [NaN, NaN], [200, 200], [-5, -90]]) {
    const emc = fineFuelEquilibriumMoisture({ relativeHumidityPercent: h, temperatureC: t });
    assert.ok(Number.isFinite(emc) && emc >= 0.005 && emc <= 0.45,
      `moisture must stay inside its physical band for (${h}, ${t}), got ${emc}`);
  }
}

// ---------------------------------------------------------------- water deficit and reinforcements

{
  assert.equal(climaticWaterDeficitMm({ precipitationMm: 800, potentialEvapotranspirationMm: 600 }), -200);
  assert.equal(climaticWaterDeficitMm({ precipitationMm: 300, potentialEvapotranspirationMm: 900 }), 600);
  assert.equal(climaticWaterDeficitMm({}), 0, "absent terms must read as no deficit, not as NaN");

  assert.equal(rootCohesionPa(0), 0, "no roots is no reinforcement");
  assert.ok(rootCohesionPa(1) > rootCohesionPa(0.2), "more root area must reinforce more");
  assert.ok(Number.isFinite(rootCohesionPa(NaN)) && rootCohesionPa(NaN) === 0);

  // The lithology look-ups must be ordered sensibly and bounded for every class in the table.
  assert.ok(frictionAngleForLithology(6) < frictionAngleForLithology(5), "a clay aquitard is weaker than competent bedrock");
  assert.ok(effectiveCohesionForLithology(5) > effectiveCohesionForLithology(1), "bedrock is more cohesive than peat");
  for (let code = 0; code <= 7; code += 1) {
    const phi = frictionAngleForLithology(code);
    const c = effectiveCohesionForLithology(code);
    assert.ok(phi >= 5 && phi <= 55, `friction angle for class ${code} must be physical, got ${phi}`);
    assert.ok(c >= 0 && c <= 30000, `cohesion for class ${code} must be physical, got ${c}`);
  }
}

// ---------------------------------------------------------------- the model-level derivation

const modelled = buildModel({ ...createDefaultParams(), resolution: 64, mapSizeKm: 128 });
const quantities = computeHazardQuantities(modelled);
{
  assert.ok(quantities.computedCells > 0, "a real scenario must produce quantities");
  assert.equal(quantities.floodDepthM.length, modelled.height.length, "every field must cover the grid");

  // THE DISCHARGE UNIT BUG. model.discharge is an annual runoff VOLUME in cubic metres. Treated as a
  // rate it peaks near 3.6e8 m3/s in a default scenario, which is orders of magnitude beyond any river
  // on Earth, and it drove the flood depth into its ceiling. The conversion has to be the engine's own,
  // and the resulting depth has to be the order of a real flood.
  const peakAnnualM3 = Math.max(...Array.from(modelled.discharge));
  assert.ok(peakAnnualM3 > 1e6, "the fixture must exercise the annual-volume case, or this proves nothing");
  const peakRateM3s = peakAnnualM3 / (365.25 * 24 * 3600);
  assert.ok(peakRateM3s < 1e5,
    "converted to a rate the peak must be plausible, got " + peakRateM3s.toFixed(1) + " m3/s");
  const deepest = quantities.summary.floodDepthM.max;
  assert.ok(deepest > 0 && deepest < 8,
    "flood depth must be the order of a real flood, got " + deepest + " m; a value pinned at a ceiling means the discharge unit is wrong");
  const fastest = quantities.summary.floodVelocityMs.max;
  assert.ok(fastest > 0 && fastest < 8, "flood velocity must be physically possible, got " + fastest + " m/s");

  // THE NOT-COMPUTED BUG. A cell with no soil cannot have a factor of safety. Leaving the array at its
  // initialiser of 0 made 416 of 4085 land cells report as maximally unstable, so a value is published
  // only where one was computed and the mask says which those are.
  let noSoil = 0, computedWithoutSoil = 0;
  for (let index = 0; index < modelled.height.length; index += 1) {
    if (Number(modelled.surface?.rootDepthM?.[index]) > 0) continue;
    noSoil += 1;
    if (quantities.factorOfSafetyComputed[index]) computedWithoutSoil += 1;
    assert.equal(quantities.factorOfSafety[index], 0,
      "a cell with no soil must carry no factor rather than an initialiser that reads as unstable");
  }
  assert.ok(noSoil > 0, "the fixture must contain soil-free cells, or this proves nothing");
  assert.equal(computedWithoutSoil, 0, "no cell without soil may claim a computed factor");
  assert.ok(quantities.summary.factorOfSafety.min > 1,
    "the reported factor must exclude the not-computed cells, got " + quantities.summary.factorOfSafety.min);
  assert.equal(quantities.summary.factorOfSafety.cells, quantities.summary.factorOfSafetyComputedCells,
    "the reported range must count exactly the cells that carry a value");

  // Drier scenarios must have greater PET-minus-precipitation deficit than wetter ones.
  const arid = computeHazardQuantities(buildModel({ ...createDefaultParams(), resolution: 48, mapSizeKm: 128, precipitationScale: 0.25 }));
  const wet = computeHazardQuantities(buildModel({ ...createDefaultParams(), resolution: 48, mapSizeKm: 128, precipitationScale: 2.2 }));
  assert.ok(arid.summary.waterDeficitMm.min > wet.summary.waterDeficitMm.min,
    "a drier scenario must have the larger deficit");
  assert.ok(arid.summary.waterDeficitMm.max > wet.summary.waterDeficitMm.max,
    "a drier scenario must have the larger deficit");

  // Units are stated, so a consumer cannot mistake a depth for an index.
  for (const [field, unit] of Object.entries(quantities.units)) {
    assert.ok(typeof unit === "string" && unit.length > 0, field + " must state its unit");
  }
  assert.equal(quantities.units.floodDepthM, "m");
  assert.equal(quantities.units.factorOfSafety, "dimensionless ratio");

  // Humidity from VPD must follow the Magnus relation and stay inside a screen-height band.
  const humid = relativeHumidityFromVpd({ temperatureC: 20, vaporPressureDeficitKPa: 0 });
  assert.ok(Math.abs(humid - 100) < 1e-6, "no deficit is saturated air");
  const dry = relativeHumidityFromVpd({ temperatureC: 30, vaporPressureDeficitKPa: 3 });
  assert.ok(dry < 30, "a 3 kPa deficit in 30 degree air must be arid, got " + dry.toFixed(1) + " percent");
  for (const [t, v] of [[-30, 0.1], [45, 6], [NaN, NaN], [20, -5]]) {
    const rh = relativeHumidityFromVpd({ temperatureC: t, vaporPressureDeficitKPa: v });
    assert.ok(Number.isFinite(rh) && rh >= 5 && rh <= 100,
      "humidity must stay in band for (" + t + ", " + v + "), got " + rh);
  }

  // A model with nothing in it must produce empty fields rather than throw.
  const empty = computeHazardQuantities(null);
  assert.equal(empty.cellCount, 0);
  assert.equal(empty.floodDepthM.length, 0);
}

// ---------------------------------------------------------------- methods are named, not implied

{
  for (const [key, value] of Object.entries(HAZARD_METHODS)) {
    assert.ok(typeof value === "string" && value.length > 10, `${key} must name the method it uses`);
  }
  assert.ok(Object.keys(HAZARD_METHODS).length >= 6, "every computed quantity must be accounted for");
  // The module must say what it is not, so a reader cannot mistake it for a study.
  assert.ok(/not a flood study|not a study|geotechnical assessment/i.test(SOURCE),
    "the module must state its own limits");
}

console.log(
  `Hazard quantities verified (Manning depth equals the closed form exactly, cohesionless FS is 1.0000 at the friction angle, ` +
  `on slope and falls with saturation, Van Wagner moisture reaches ${(fineFuelEquilibriumMoisture({ relativeHumidityPercent: 100, temperatureC: 20 }) * 100).toFixed(1)}% at saturation, ` +
  `${Object.keys(HAZARD_METHODS).length} named methods) passed`
);
