/**
 * Human presence: where people are, and how concentrated.
 *
 * WHAT THIS IS
 *
 * The model previously had no human representation at all. "Population estimate" in the interface is
 * a WILDLIFE figure, and the only built-environment outputs were damage and resilience indices. This
 * module adds a spatial human layer: a relative population density per cell, and the settlements that
 * density forms.
 *
 * WHAT IT DOES NOT CLAIM, AND WHY
 *
 * The absolute number of people in a region is not knowable from terrain, land cover and infrastructure
 * alone. It requires a census or a gridded population product, and this repository consumes neither.
 * So this module does not publish a head count and never labels anything "population". What it publishes
 * is:
 *
 *   1. builtAreaKm2  - the built-up land area, which IS measured from the model's own cover and
 *                      infrastructure layers, and is a real physical quantity.
 *   2. densityIndex  - a relative concentration, normalised so the region's own maximum is 1. Mean
 *                      density of the built area is 1 by construction. It answers "where are people
 *                      concentrated", not "how many people are there".
 *   3. settlement patches with a size class, which are a property of the built pattern itself and do
 *                      not depend on any density assumption.
 *
 * If a scenario ever supplies a real population total, `peoplePerBuiltKm2` converts densityIndex into
 * an absolute figure. Until then it is deliberately left unset, and `absolutePopulation` stays null
 * rather than being filled with a plausible-looking number.
 *
 * THE ONE CALIBRATED CONSTANT
 *
 * `DEFAULT_PEOPLE_PER_BUILT_KM2` is the density assumed only when a caller asks for an absolute figure
 * WITHOUT supplying a regional total. It is a coarse global-average figure for built-up land and is
 * marked CALIBRATED. Nothing in the density index or the settlement classification depends on it.
 */

/** CALIBRATED: coarse mean density of built-up land, used ONLY to convert to an absolute figure when
 * no regional total is supplied. Not used for the density index or settlement classification. */
export const DEFAULT_PEOPLE_PER_BUILT_KM2 = 1200;

/** Settlement size classes by built-up area, in square kilometres. A hamlet, a village, a town and a
 * city are distinguished by how much built land they cover, which is measurable, rather than by a
 * head count, which is not. */
export const SETTLEMENT_SIZE_CLASSES = Object.freeze([
  Object.freeze({ code: 1, id: "hamlet", minBuiltAreaKm2: 0 }),
  Object.freeze({ code: 2, id: "village", minBuiltAreaKm2: 1 }),
  Object.freeze({ code: 3, id: "town", minBuiltAreaKm2: 10 }),
  Object.freeze({ code: 4, id: "city", minBuiltAreaKm2: 50 })
]);

export function settlementSizeClass(builtAreaKm2) {
  let match = SETTLEMENT_SIZE_CLASSES[0];
  for (const entry of SETTLEMENT_SIZE_CLASSES) if (builtAreaKm2 >= entry.minBuiltAreaKm2) match = entry;
  return match;
}

/**
 * How built-up one cell is, as a fraction of its area, from what the model already knows.
 *
 * Two independent sources are combined by taking the larger rather than the sum, because both describe
 * the same physical thing - sealed or built land - and adding them would double-count a cell that is
 * both classified urban and carries mapped infrastructure:
 *
 *   - the surface cover's own impervious fraction, which comes from an imported land-cover layer or
 *     from the model's cover derivation;
 *   - the infrastructure layer's impervious fraction, which is placed from imported features.
 *
 * A cell with neither reads as zero built land, which is correct: the model has no evidence of
 * buildings there.
 */
function builtFractionAt(model, index) {
  const cover = Number(model.surface?.imperviousFraction?.[index]);
  const mapped = Number(model.infrastructureInfluence?.imperviousFraction?.[index]);
  const a = Number.isFinite(cover) ? Math.max(0, Math.min(1, cover)) : 0;
  const b = Number.isFinite(mapped) ? Math.max(0, Math.min(1, mapped)) : 0;
  return Math.max(a, b);
}

/** Cell area in square kilometres, from the model's own support-area convention. */
function cellAreaKm2(model) {
  const stated = Number(model?.cellSupportAreaKm2);
  if (Number.isFinite(stated) && stated > 0) return stated;
  const size = Number(model?.sizeKm);
  const n = Number(model?.n);
  if (!Number.isFinite(size) || !Number.isFinite(n) || n <= 0) return 0;
  return (size * size) / (n * n);
}

/**
 * Label the connected built-up patches and return them by size.
 *
 * A settlement is a connected group of cells that carry built land, found with a four-neighbour flood
 * fill. Connectivity is over the built mask threshold rather than over density, so the patches do not
 * depend on the density normalisation.
 */
function settlementPatches(built, n, areaKm2, threshold) {
  const seen = new Uint8Array(built.length);
  const patches = [];
  const stack = [];
  for (let start = 0; start < built.length; start += 1) {
    if (seen[start] || built[start] < threshold) continue;
    let cells = 0, builtAreaKm2 = 0, peakBuiltFraction = 0;
    let minX = n, maxX = -1, minY = n, maxY = -1;
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const index = stack.pop();
      const x = index % n, y = (index - x) / n;
      cells += 1;
      builtAreaKm2 += built[index] * areaKm2;
      if (built[index] > peakBuiltFraction) peakBuiltFraction = built[index];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      // Four-neighbour so a diagonal touch does not merge two settlements across a corner.
      if (x > 0 && !seen[index - 1] && built[index - 1] >= threshold) { seen[index - 1] = 1; stack.push(index - 1); }
      if (x < n - 1 && !seen[index + 1] && built[index + 1] >= threshold) { seen[index + 1] = 1; stack.push(index + 1); }
      if (y > 0 && !seen[index - n] && built[index - n] >= threshold) { seen[index - n] = 1; stack.push(index - n); }
      if (y < n - 1 && !seen[index + n] && built[index + n] >= threshold) { seen[index + n] = 1; stack.push(index + n); }
    }
    const sizeClass = settlementSizeClass(builtAreaKm2);
    patches.push({
      cells, builtAreaKm2, peakBuiltFraction, sizeClass: sizeClass.code, sizeClassId: sizeClass.id,
      // Cell bounds, not coordinates: the caller maps them onto the scenario's own projection.
      boundsCells: [minX, minY, maxX, maxY]
    });
  }
  patches.sort((a, b) => b.builtAreaKm2 - a.builtAreaKm2);
  return patches;
}

/**
 * Derive the human presence layer for a model.
 *
 * Returns the per-cell built fraction and a relative density index, plus the settlements and the
 * aggregate built area. `absolutePopulation` is populated ONLY when the caller supplies
 * `peoplePerBuiltKm2`; otherwise it is null and `densityBasis` says so.
 */
export function humanPresence(model, options = {}) {
  const n = Math.max(0, Math.trunc(Number(model?.n) || 0));
  const len = n * n;
  const areaKm2 = cellAreaKm2(model);
  const builtFraction = new Float32Array(len);
  const densityIndex = new Float32Array(len);
  if (!len) {
    return {
      cellCount: 0, builtCellCount: 0, builtAreaKm2: 0, builtAreaFraction: 0,
      builtFraction, densityIndex, settlements: [], settlementCount: 0,
      settlementsBySizeClass: {}, meanBuiltDensity: 0, maxBuiltDensity: 1,
      absolutePopulation: null, densityBasis: "not-derived", peoplePerBuiltKm2: null
    };
  }
  let builtAreaTotal = 0, builtCellCount = 0;
  for (let index = 0; index < len; index += 1) {
    const fraction = builtFractionAt(model, index);
    builtFraction[index] = fraction;
    if (fraction > 0) { builtCellCount += 1; builtAreaTotal += fraction * areaKm2; }
  }
  const regionAreaKm2 = areaKm2 * len;
  const builtAreaFraction = regionAreaKm2 > 0 ? builtAreaTotal / regionAreaKm2 : 0;

  // Relative concentration: a cell's share of built land against the mean built share across the
  // region. A cell at the regional mean reads 1, a cell twice as built-up reads 2, and a cell with no
  // built land reads 0. This is a shape, not a head count.
  const meanBuiltFraction = len > 0 ? builtAreaTotal / (areaKm2 * len) : 0;
  let peak = 0;
  for (let index = 0; index < len; index += 1) {
    const value = meanBuiltFraction > 0 ? builtFraction[index] / meanBuiltFraction : 0;
    densityIndex[index] = Number.isFinite(value) ? value : 0;
    if (densityIndex[index] > peak) peak = densityIndex[index];
  }

  // A settlement is a connected patch of cells that carry meaningful built land. The threshold is a
  // share of the region's own PEAK BUILT FRACTION - the same quantity it is applied to - rather than of
  // the density index, which is a different scale entirely.
  let peakBuiltFraction = 0;
  for (let index = 0; index < len; index += 1) {
    if (builtFraction[index] > peakBuiltFraction) peakBuiltFraction = builtFraction[index];
  }
  const threshold = Math.max(0.02, peakBuiltFraction * 0.08);
  const settlements = settlementPatches(builtFraction, n, areaKm2, threshold);
  const settlementsBySizeClass = {};
  for (const entry of SETTLEMENT_SIZE_CLASSES) settlementsBySizeClass[entry.id] = 0;
  for (const patch of settlements) settlementsBySizeClass[patch.sizeClassId] += 1;

  const stated = Number(options.peoplePerBuiltKm2);
  const peoplePerBuiltKm2 = Number.isFinite(stated) && stated > 0 ? stated : null;
  return {
    cellCount: len,
    builtCellCount,
    builtAreaKm2: builtAreaTotal,
    builtAreaFraction,
    builtFraction,
    densityIndex,
    settlements,
    settlementCount: settlements.length,
    settlementsBySizeClass,
    meanBuiltDensity: meanBuiltFraction,
    maxDensityIndex: peak,
    // Null unless the caller supplied a density. A head count is never invented here.
    absolutePopulation: peoplePerBuiltKm2 === null ? null : builtAreaTotal * peoplePerBuiltKm2,
    densityBasis: peoplePerBuiltKm2 === null ? "relative-index-only" : "scenario-supplied-density",
    peoplePerBuiltKm2
  };
}

/** Attach the layer to a model, for callers that want it alongside the other scenario state. */
export function attachHumanPresence(model, options = {}) {
  if (!model) return null;
  model.humanPresence = humanPresence(model, options);
  return model.humanPresence;
}
