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
  humanPresence,
  attachHumanPresence,
  settlementSizeClass,
  SETTLEMENT_SIZE_CLASSES,
  DEFAULT_PEOPLE_PER_BUILT_KM2
} = await import("../src/humanPresence.js");

// A region with one dense settlement in one corner and scattered building elsewhere, so both the
// patch finder and the density normalisation have something structured to work on.
function builtModel({ side = 24, impervious = null, mapped = null, sizeKm = 96 } = {}) {
  const n = side, len = n * n;
  const surfaceImpervious = new Float32Array(len);
  const infrastructureImpervious = new Float32Array(len);
  for (let index = 0; index < len; index += 1) {
    const x = index % n, y = (index - x) / n;
    if (impervious) surfaceImpervious[index] = impervious(x, y, index);
    if (mapped) infrastructureImpervious[index] = mapped(x, y, index);
  }
  return {
    n, sizeKm, cellSupportAreaKm2: (sizeKm * sizeKm) / len,
    surface: { imperviousFraction: surfaceImpervious },
    infrastructureInfluence: { imperviousFraction: infrastructureImpervious }
  };
}

// ---------------------------------------------------------------- built area is measured, not assumed

{
  // Half of every cell is built, so built area must be exactly half the region area.
  const model = builtModel({ side: 20, sizeKm: 100, impervious: () => 0.5 });
  const presence = humanPresence(model);
  const regionAreaKm2 = 100 * 100;
  // The per-cell fraction is a Float32, so the sum carries Float32 rounding rather than being exact.
  const expectedBuiltKm2 = Math.fround(0.5) * ((100 * 100) / 400) * 400;
  assert.ok(Math.abs(presence.builtAreaKm2 - expectedBuiltKm2) <= Math.max(1e-3, expectedBuiltKm2 * 1e-6),
    `built area must be the measured built share of the region, got ${presence.builtAreaKm2} of ${expectedBuiltKm2}`);
  assert.ok(Math.abs(presence.builtAreaFraction - 0.5) < 1e-9, "built area fraction must match the cover");
  assert.equal(presence.builtCellCount, 400, "every cell with built land must be counted");
}

{
  // No built evidence anywhere reads as no built land, not as an assumed default.
  const model = builtModel({ side: 16, sizeKm: 64, impervious: () => 0, mapped: () => 0 });
  const presence = humanPresence(model);
  assert.equal(presence.builtAreaKm2, 0, "a region with no built evidence must report no built area");
  assert.equal(presence.builtCellCount, 0);
  assert.equal(presence.settlementCount, 0, "no built land means no settlements");
  assert.ok(presence.densityIndex.every(value => value === 0), "an unbuilt region must carry no density index");
}

{
  // The two evidence sources describe the same physical thing, so the larger is taken, never the sum.
  const model = builtModel({ side: 12, sizeKm: 48, impervious: () => 0.4, mapped: () => 0.3 });
  const presence = humanPresence(model);
  const regionAreaKm2 = 48 * 48;
  // The larger of the two sources, never their sum: 0.4, not 0.7.
  const expectedBuiltKm2 = Math.fround(0.4) * regionAreaKm2;
  assert.ok(Math.abs(presence.builtAreaKm2 - expectedBuiltKm2) <= Math.max(1e-3, expectedBuiltKm2 * 1e-6),
    `overlapping cover and infrastructure must not be double-counted: got ${presence.builtAreaKm2}, expected ${expectedBuiltKm2}, and 0.7 would be ${expectedBuiltKm2 * 1.75}`);
}

// ---------------------------------------------------------------- no head count is ever invented

{
  const model = builtModel({ side: 20, sizeKm: 100, impervious: () => 0.35 });
  const presence = humanPresence(model);
  assert.equal(presence.absolutePopulation, null,
    "without a supplied density the module must not publish a population total");
  assert.equal(presence.peoplePerBuiltKm2, null);
  assert.equal(presence.densityBasis, "relative-index-only");
  assert.equal(JSON.stringify(presence).includes("populationEstimate"), false,
    "the layer must not emit a wildlife-style population estimate field");
}

{
  // A caller who supplies a real density gets an absolute figure, and it is the built area times it.
  const model = builtModel({ side: 20, sizeKm: 100, impervious: () => 0.5 });
  const presence = humanPresence(model, { peoplePerBuiltKm2: 800 });
  assert.equal(presence.densityBasis, "scenario-supplied-density");
  assert.ok(Math.abs(presence.absolutePopulation - presence.builtAreaKm2 * 800) < 1e-6,
    "a supplied density must convert the measured built area into the absolute figure");
  // A nonsense density is treated as absent rather than silently used.
  assert.equal(humanPresence(model, { peoplePerBuiltKm2: -5 }).absolutePopulation, null);
  assert.equal(humanPresence(model, { peoplePerBuiltKm2: "many" }).absolutePopulation, null);
  assert.ok(DEFAULT_PEOPLE_PER_BUILT_KM2 > 0, "the calibrated constant must be positive");
}

// ---------------------------------------------------------------- settlements

{
  // Two well-separated dense blocks must resolve as two settlements, not one.
  const side = 30;
  const model = builtModel({
    side, sizeKm: 120,
    impervious: (x, y) => {
      const inFirst = x >= 1 && x <= 4 && y >= 1 && y <= 4;
      const inSecond = x >= 24 && x <= 27 && y >= 24 && y <= 27;
      return inFirst || inSecond ? 0.8 : 0;
    }
  });
  const presence = humanPresence(model);
  assert.equal(presence.settlementCount, 2, `expected two settlements, got ${presence.settlementCount}`);
  const [largest, second] = presence.settlements;
  assert.ok(Math.abs(largest.builtAreaKm2 - second.builtAreaKm2) < 1e-6,
    "the two equal blocks must report equal built area");
  assert.ok(largest.builtAreaKm2 > 0, "a settlement must carry a positive built area");
  assert.ok(presence.settlements[0].builtAreaKm2 >= presence.settlements[1].builtAreaKm2,
    "settlements must be ordered largest first");
  for (const patch of presence.settlements) {
    assert.ok(Number.isInteger(patch.sizeClass) && patch.sizeClass >= 1 && patch.sizeClass <= 4);
    assert.ok(SETTLEMENT_SIZE_CLASSES.some(entry => entry.id === patch.sizeClassId));
    assert.equal(patch.boundsCells.length, 4);
  }
}

{
  // A diagonal touch must NOT merge two settlements: four-neighbour connectivity, not eight.
  const side = 20;
  const model = builtModel({
    side, sizeKm: 80,
    impervious: (x, y) => ((x === 4 && y === 4) || (x === 5 && y === 5) ? 0.9 : 0)
  });
  const presence = humanPresence(model);
  assert.equal(presence.settlementCount, 2, "diagonally touching cells are two settlements, not one");
}

{
  // Size classes are driven by built area, which is measurable, not by a head count.
  assert.equal(settlementSizeClass(0.2).id, "hamlet");
  assert.equal(settlementSizeClass(1).id, "village");
  assert.equal(settlementSizeClass(10).id, "town");
  assert.equal(settlementSizeClass(50).id, "city");
  assert.equal(settlementSizeClass(5000).id, "city");
  assert.equal(settlementSizeClass(-1).id, "hamlet", "a negative area must fall to the lowest class, not throw");
}

// ---------------------------------------------------------------- density index is a shape

{
  // A cell at twice the regional mean built share must read 2, and one at the mean must read 1.
  const side = 10;
  const model = builtModel({
    side, sizeKm: 50,
    impervious: (x, y) => (y === 0 ? 0.4 : x === 0 && y === 1 ? 0.4 : 0.1)
  });
  const presence = humanPresence(model);
  const meanBuilt = presence.meanBuiltDensity;
  assert.ok(meanBuilt > 0, "a partly built region must have a positive mean built fraction");
  for (let index = 0; index < presence.cellCount; index += 1) {
    const expected = presence.builtFraction[index] / meanBuilt;
    assert.ok(Math.abs(presence.densityIndex[index] - expected) < 1e-5,
      `density index at ${index} must be the built share over the regional mean`);
  }
}

// ---------------------------------------------------------------- degenerate input

{
  const empty = humanPresence(null);
  assert.equal(empty.cellCount, 0);
  assert.equal(empty.settlementCount, 0);
  assert.equal(empty.absolutePopulation, null);
  assert.equal(empty.densityIndex.length, 0);

  const tiny = humanPresence({ n: 1, sizeKm: 1, surface: {}, infrastructureInfluence: null });
  assert.equal(tiny.cellCount, 1);
  assert.equal(tiny.builtAreaKm2, 0);

  // Non-finite and out-of-range cover values must be clamped, not propagated.
  const wild = builtModel({ side: 8, sizeKm: 32, impervious: (x, y) => (x === 0 ? NaN : x === 1 ? 5 : x === 2 ? -3 : 0.25) });
  const presence = humanPresence(wild);
  assert.ok(Number.isFinite(presence.builtAreaKm2), "built area must stay finite under non-finite cover");
  for (const value of presence.builtFraction) assert.ok(value >= 0 && value <= 1, "built fraction must be clamped to [0,1]");
}

// ---------------------------------------------------------------- no derived number is ever NaN

// A model with no cell size made the mean built density 0/0 and reported NaN, which then flowed into
// anything that read it as a density. Every number the layer publishes must be finite for every input,
// including the degenerate ones.
{
  const degenerate = [
    ["zero map size", { n: 4, sizeKm: 0, surface: { imperviousFraction: new Float32Array(16).fill(0.5) } }],
    ["absent map size", { n: 4, surface: { imperviousFraction: new Float32Array(16).fill(0.5) } }],
    ["zero cell area", { n: 3, sizeKm: 9, cellSupportAreaKm2: 0, surface: { imperviousFraction: new Float32Array(9).fill(0.5) } }],
    ["absent cell area", { n: 3, sizeKm: 9, cellSupportAreaKm2: null, infrastructureInfluence: { imperviousFraction: new Float32Array(9).fill(0.7) } }],
    ["single cell", { n: 1, sizeKm: 10, surface: { imperviousFraction: Float32Array.from([0.9]) } }],
    ["no built land", { n: 4, sizeKm: 10, surface: { imperviousFraction: new Float32Array(16) } }],
    ["nothing at all", { n: 2 }]
  ];
  for (const [label, model] of degenerate) {
    const presence = humanPresence(model);
    for (const key of ["cellCount", "builtCellCount", "builtAreaKm2", "builtAreaFraction", "meanBuiltDensity", "maxDensityIndex"]) {
      assert.ok(Number.isFinite(presence[key]),
        `${label}: ${key} must be finite, got ${presence[key]}`);
    }
    assert.ok(Number.isFinite(presence.builtAreaKm2) && presence.builtAreaKm2 >= 0,
      `${label}: built area must be a finite non-negative number`);
    if (presence.absolutePopulation !== null) {
      assert.ok(Number.isFinite(presence.absolutePopulation), `${label}: a claimed population must be finite`);
    }
  }
}

// ---------------------------------------------------------------- attachment and determinism

{
  const model = builtModel({ side: 16, sizeKm: 64, impervious: () => 0.3 });
  const attached = attachHumanPresence(model);
  assert.equal(model.humanPresence, attached, "attach must place the layer on the model");
  assert.equal(attachHumanPresence(null), null);
  const again = humanPresence(model);
  assert.equal(again.settlementCount, attached.settlementCount, "the derivation must be deterministic");
  assert.equal(again.builtAreaKm2, attached.builtAreaKm2);
}

const summary = humanPresence(builtModel({ side: 24, sizeKm: 96, impervious: (x, y) => (x < 6 && y < 6 ? 0.7 : 0.04) }));
console.log(
  `Human presence verified (built area ${summary.builtAreaKm2.toFixed(2)} km2 of ${(summary.cellCount * (96 * 96) / (24 * 24)).toFixed(0)} km2, ` +
  `${summary.settlementCount} settlements, classes ${JSON.stringify(summary.settlementsBySizeClass)}, ` +
  `absolute population ${summary.absolutePopulation === null ? "deliberately not claimed" : summary.absolutePopulation.toFixed(0)}) passed`
);
