const MAX_SPATIAL_SAMPLES = 262144;

export const PROCESS_METHOD_REFERENCES = Object.freeze([
  {
    id: "fao56-reference-et",
    organization: "FAO",
    title: "Crop evapotranspiration - Guidelines for computing crop water requirements (FAO-56)",
    url: "https://www.fao.org/4/X0490E/x0490e00.htm",
    role: "Reference evapotranspiration and atmospheric-demand structure"
  },
  {
    id: "nrcs-direct-runoff",
    organization: "USDA NRCS",
    title: "NEH Part 630, Subpart H - Estimation of Direct Runoff from Storm Rainfall",
    url: "https://directives.nrcs.usda.gov/sites/default/files2/1754923466/Subpart%20H%20%E2%80%93%20Estimation%20of%20Direct%20Runoff%20from%20Storm%20Rainfall.pdf",
    role: "Curve-number event-response screening and hydrologic-soil interpretation"
  },
  {
    id: "usgs-stream-power",
    organization: "USGS",
    title: "Assessment of ephemeral stream channel stability and erosion mechanisms",
    url: "https://pubs.usgs.gov/publication/sir20235145/full",
    role: "Shear-stress and stream-power interpretation for erosion potential"
  },
  {
    id: "unccd-aridity",
    organization: "UNCCD",
    title: "P/PET aridity-zone definitions",
    url: "https://www.unccd.int/sites/default/files/sessions/documents/ICCD_CRIC6_3_Add.1/3add1eng.pdf",
    role: "Climatic aridity screening"
  }
]);

export function buildPhysicalCouplingState(model, params = {}) {
  if (!model?.height?.length || !model?.surface || !model?.hydroBudget) {
    throw new Error("A fully evaluated surface and hydro-budget state is required");
  }

  const len = model.height.length;
  const stride = Math.max(1, Math.ceil(len / MAX_SPATIAL_SAMPLES));
  const seaLevel = finite(params.seaLevel, 0);
  let samples = 0;
  let etBoundPass = 0;
  let energyBoundPass = 0;
  let routingPass = 0;
  let routingChecks = 0;
  let accumulationPass = 0;
  let accumulationChecks = 0;
  let localClosureScore = 0;
  let recomputedResidualAbsMm = 0;
  let ledgerMismatchAbsMm = 0;
  let maximumRecomputedResidualAbsMm = 0;
  let orographicUpliftRain = 0;
  let orographicUpliftCount = 0;
  let orographicNeutralRain = 0;
  let orographicNeutralCount = 0;
  let populationChecks = 0;
  let populationCapacityPass = 0;
  const infiltrationRunoff = pairAccumulator();
  const streamPowerErosion = pairAccumulator();
  const rootsErosion = pairAccumulator();
  const imperviousRunoff = pairAccumulator();
  const waterVegetation = pairAccumulator();

  for (let i = 0; i < len; i += stride) {
    if (model.height[i] <= seaLevel) continue;
    samples += 1;
    const precipitation = Math.max(0, finite(model.precipitation?.[i], 0));
    const irrigation = Math.max(0, finite(model.infrastructureInfluence?.irrigationMm?.[i], 0));
    const demand = Math.max(0, finite(model.hydroBudget.allocatedDemandMm?.[i], 0));
    const actualEt = Math.max(0, finite(model.surface.actualEvapotranspiration?.[i], 0));
    const potentialEt = Math.max(0, finite(model.surface.potentialEvapotranspiration?.[i], 0));
    const radiation = Math.max(0, finite(model.surface.netRadiationMjM2Day?.[i], 0));
    const runoff = Math.max(0, finite(model.hydroBudget.localRunoffDepthMm?.[i], 0));
    const recharge = Math.max(0, finite(model.hydroBudget.groundwaterRechargeMm?.[i], 0));
    const storage = Math.max(0, finite(model.hydroBudget.soilStorageChangeMm?.[i], 0));
    const storedResidual = finite(model.hydroBudget.waterBudgetResidualMm?.[i], 0);
    const input = precipitation + irrigation;
    const recomputedResidual = input - demand - actualEt - runoff - recharge - storage;
    const residualAbs = Math.abs(recomputedResidual);
    const ledgerMismatch = Math.abs(storedResidual - recomputedResidual);
    recomputedResidualAbsMm += residualAbs;
    ledgerMismatchAbsMm += ledgerMismatch;
    maximumRecomputedResidualAbsMm = Math.max(maximumRecomputedResidualAbsMm, residualAbs);
    localClosureScore += clamp(1 - (residualAbs + ledgerMismatch) / Math.max(1, input) * 20, 0, 1);
    if (actualEt <= Math.max(0, input - Math.min(input, demand)) + 0.01 && actualEt <= potentialEt * 1.15 + 0.01) etBoundPass += 1;
    if (potentialEt <= 3200.01 && radiation <= 42 && Number.isFinite(potentialEt) && Number.isFinite(radiation)) energyBoundPass += 1;

    const routingMode = String(model.flowRouting || "d8");
    if (routingMode === "mfd") {
      for (const route of mfdReceiverFractions(model, i)) {
        routingChecks += 1;
        accumulationChecks += 1;
        if (finite(model.filledHeight?.[route.receiver], Infinity) < finite(model.filledHeight?.[i], -Infinity)) routingPass += 1;
        const requiredContribution = finite(model.flowAccumulation?.[i], 0) * route.fraction;
        if (finite(model.flowAccumulation?.[route.receiver], 0) + 1e-6 >= requiredContribution) accumulationPass += 1;
      }
    } else {
      const receiver = routingMode === "dinf"
        ? model.dInfinityReceiver?.[i] ?? model.receiver?.[i] ?? -1
        : model.receiver?.[i] ?? -1;
      if (receiver >= 0) {
        routingChecks += 1;
        if (finite(model.filledHeight?.[receiver], Infinity) <= finite(model.filledHeight?.[i], -Infinity) + 0.05) routingPass += 1;
        accumulationChecks += 1;
        const routedFraction = routingMode === "dinf"
          ? clamp(finite(model.dInfinityPrimaryFraction?.[i], 1), 0, 1)
          : 1;
        const requiredContribution = finite(model.flowAccumulation?.[i], 0) * routedFraction;
        if (finite(model.flowAccumulation?.[receiver], 0) + 1e-6 >= requiredContribution) accumulationPass += 1;
      }
    }

    const uplift = finite(model.windUplift?.[i], 0);
    if (uplift > 0.015) {
      orographicUpliftRain += precipitation;
      orographicUpliftCount += 1;
    } else if (uplift < 0.003) {
      orographicNeutralRain += precipitation;
      orographicNeutralCount += 1;
    }

    addPair(infiltrationRunoff, finite(model.surface.infiltrationCapacity?.[i], 0), finite(model.runoffCoefficient?.[i], 0));
    addPair(streamPowerErosion, Math.log1p(Math.max(0, finite(model.hydraulics?.streamPowerWm2?.[i], 0))), finite(model.hydraulics?.erosionRisk?.[i], 0));
    addPair(rootsErosion, finite(model.surface.rootCohesion?.[i], 0), finite(model.hydraulics?.erosionRisk?.[i], 0));
    addPair(imperviousRunoff, finite(model.surface.imperviousFraction?.[i], 0), finite(model.runoffCoefficient?.[i], 0));
    addPair(waterVegetation, clamp((precipitation - actualEt + recharge + storage) / 1800, -1, 1), finite(model.surface.vegetation?.[i], 0));
  }

  for (const population of model.wildlife?.populations || []) {
    populationChecks += 1;
    if (finite(population.populationEstimate, 0) <= finite(population.carryingCapacity, 0) + 1) populationCapacityPass += 1;
  }

  const areaClosureScore = clamp(1 - Math.abs(finite(model.stats?.rasterAreaClosurePct, 100) - 100) / 2, 0, 1);
  const waterClosureScore = samples ? localClosureScore / samples : 0;
  const etBoundScore = samples ? etBoundPass / samples : 0;
  const energyBoundScore = samples ? energyBoundPass / samples : 0;
  const routingScore = routingChecks ? routingPass / routingChecks : 1;
  const accumulationScore = accumulationChecks ? accumulationPass / accumulationChecks : 1;
  const populationCapacityScore = populationChecks ? populationCapacityPass / populationChecks : 1;
  const upliftMean = orographicUpliftCount ? orographicUpliftRain / orographicUpliftCount : 0;
  const neutralMean = orographicNeutralCount ? orographicNeutralRain / orographicNeutralCount : upliftMean;
  const orographicScore = orographicUpliftCount && orographicNeutralCount
    ? clamp(0.68 + (upliftMean - neutralMean) / Math.max(200, neutralMean) * 0.8, 0, 1)
    : 0.65;
  const soilRunoffScore = inverseCorrelationScore(correlation(infiltrationRunoff));
  const streamPowerScore = positiveCorrelationScore(correlation(streamPowerErosion));
  const rootStabilityScore = inverseCorrelationScore(correlation(rootsErosion));
  const imperviousRunoffScore = positiveCorrelationScore(correlation(imperviousRunoff));
  const waterVegetationScore = positiveCorrelationScore(correlation(waterVegetation), 0.45);
  const ecologicalConsistencyScore = clamp(finite(model.landscapeNetwork?.geographicConsistency?.meanClimateVegetationConsistency, waterVegetationScore), 0, 1);
  const subsurfaceRechargeScore = subsurfaceRechargeConsistency(model);

  const gates = [
    gate("water-mass-closure", "Local annual water partition closes", waterClosureScore, "P + irrigation = demand + actual ET + runoff + recharge + soil storage"),
    gate("evapotranspiration-bounds", "Actual evapotranspiration respects available water and reference ET", etBoundScore, "Actual ET cannot exceed allocable water or materially exceed reference atmospheric demand"),
    gate("energy-demand-bounds", "Reference ET energy terms remain bounded", energyBoundScore, "FAO-56 radiation and vapor-pressure terms are screened for physical range"),
    gate("downslope-routing", "Flow receivers follow the depression-resolved surface", routingScore, "Priority-Flood surface must not route uphill beyond numerical epsilon"),
    gate("accumulation-continuity", "Primary receiver accumulation is non-decreasing", accumulationScore, "Contributing area should not decrease along a primary flow path"),
    gate("raster-area-closure", "Raster support area equals declared map area", areaClosureScore, "Cell support area is map area divided by cell count"),
    gate("orographic-response", "Windward uplift increases precipitation response", orographicScore, "Uplift and neutral terrain samples are compared under the active wind field"),
    gate("wildlife-capacity", "Species populations remain within carrying capacity", populationCapacityScore, "Population state is capped by habitat-weighted carrying capacity")
  ];

  const couplings = [
    coupling("atmosphere-water", "Atmosphere to water balance", geometricMean([waterClosureScore, etBoundScore, energyBoundScore]), ["precipitation", "reference ET", "actual ET", "runoff", "recharge", "storage"]),
    coupling("terrain-atmosphere", "Terrain to wind and precipitation", geometricMean([orographicScore, routingScore]), ["wind exposure", "orographic uplift", "rain shadow", "elevation lapse"]),
    coupling("soil-water", "Soil and cover to runoff partition", geometricMean([soilRunoffScore, waterClosureScore]), ["hydrologic soil group", "Ksat", "available water", "curve number", "runoff"]),
    coupling("water-subsurface", "Surface water to subsurface recharge", geometricMean([subsurfaceRechargeScore, waterClosureScore]), ["recharge", "water table", "aquifer saturation", "permeability"]),
    coupling("water-geomorphology", "Hydraulics to erosion and deposition", geometricMean([streamPowerScore, routingScore]), ["discharge", "shear stress", "unit stream power", "erosion", "deposition"]),
    coupling("ecology-stability", "Vegetation to slope and erosion resistance", geometricMean([rootStabilityScore, ecologicalConsistencyScore]), ["root cohesion", "vegetation resilience", "erosion risk", "landslide risk"]),
    coupling("human-water", "Built surface to runoff and retention", geometricMean([imperviousRunoffScore, waterClosureScore]), ["imperviousness", "water demand", "irrigation", "local retention", "runoff"]),
    coupling("water-ecology", "Water availability to habitat condition", geometricMean([waterVegetationScore, ecologicalConsistencyScore]), ["P/PET", "water balance", "vegetation", "effective habitat", "edge pressure"])
  ];

  const processIntegrityIndex = geometricMean(gates.map((item) => Math.max(0.01, item.score)));
  const couplingIntegrityIndex = geometricMean(couplings.map((item) => Math.max(0.01, item.score)));
  const failedGates = gates.filter((item) => item.status === "fail");
  const reviewGates = gates.filter((item) => item.status === "review");

  return {
    type: "geolab-physical-coupling-state",
    method: "constraint-led-cross-system-screening",
    summary: {
      processIntegrityIndex,
      couplingIntegrityIndex,
      passedGateCount: gates.filter((item) => item.status === "pass").length,
      reviewGateCount: reviewGates.length,
      failedGateCount: failedGates.length,
      activeCouplingCount: couplings.length,
      limitingCouplingId: couplings.slice().sort((a, b) => a.score - b.score)[0]?.id || null,
      sampledLandCellCount: samples,
      spatialSampleStride: stride,
      interpretationClass: processIntegrityIndex >= 0.9 && couplingIntegrityIndex >= 0.8 ? "coherent-screening" : processIntegrityIndex >= 0.72 ? "conditional-screening" : "review-required"
    },
    waterPartition: compactWaterPartition(model.stats?.waterBudget),
    gates,
    couplings,
    diagnostics: {
      upliftMeanPrecipitationMmYr: upliftMean,
      neutralMeanPrecipitationMmYr: neutralMean,
      infiltrationRunoffCorrelation: correlation(infiltrationRunoff),
      streamPowerErosionCorrelation: correlation(streamPowerErosion),
      rootCohesionErosionCorrelation: correlation(rootsErosion),
      imperviousRunoffCorrelation: correlation(imperviousRunoff),
      waterVegetationCorrelation: correlation(waterVegetation),
      meanAbsoluteRecomputedWaterResidualMm: samples ? recomputedResidualAbsMm / samples : 0,
      maximumAbsoluteRecomputedWaterResidualMm: maximumRecomputedResidualAbsMm,
      meanWaterLedgerMismatchMm: samples ? ledgerMismatchAbsMm / samples : 0
    },
    limitations: [
      "These are screening-level process constraints, not a calibrated CFD, groundwater, sediment, or ecosystem forecast.",
      "FAO-56 radiation, humidity, and daily temperature range are derived when measured meteorological fields are absent.",
      "The NRCS curve-number term is used as an event-response constraint; it is not treated as a continuous infiltration equation.",
      "Engine exports preserve model geometry and diagnostics but do not create certified engineering or ecological assets."
    ],
    methodReferences: PROCESS_METHOD_REFERENCES,
    generatedAt: new Date().toISOString()
  };
}

function mfdReceiverFractions(model, index) {
  const n = model.n;
  const x = index % n;
  const y = Math.floor(index / n);
  const sourceHeight = finite(model.filledHeight?.[index], 0);
  const cellSizeM = Math.max(1, finite(model.cellSizeKm, 1) * 1000);
  const routes = [];
  let totalWeight = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
      const receiver = ny * n + nx;
      const drop = sourceHeight - finite(model.filledHeight?.[receiver], sourceHeight);
      if (drop <= 0) continue;
      const distanceM = Math.hypot(dx, dy) * cellSizeM;
      const weight = Math.pow(drop / Math.max(1, distanceM), 1.1);
      if (!(weight > 0)) continue;
      routes.push({ receiver, weight });
      totalWeight += weight;
    }
  }
  if (!(totalWeight > 0)) return [];
  return routes.map((route) => ({ receiver: route.receiver, fraction: route.weight / totalWeight }));
}

export function buildPhysicalCouplingReport(model, params = {}) {
  const state = model?.physicalCoupling || buildPhysicalCouplingState(model, params);
  return {
    ...state,
    type: "geolab-physical-coupling-report",
    map: {
      sizeKm: finite(model?.sizeKm, null),
      areaKm2: finite(model?.areaKm2, null),
      resolution: model?.n || null,
      cellSupportAreaKm2: finite(model?.cellSupportAreaKm2, null),
      spatialContext: model?.spatialContext || null
    },
    generatedAt: new Date().toISOString()
  };
}

export function makePhysicalCouplingCSV(input) {
  const report = input?.type === "geolab-physical-coupling-report" ? input : { ...(input || {}) };
  const rows = [
    ["record_type", "id", "label", "status", "score", "evidence_or_signals"],
    ...(report.gates || []).map((item) => ["gate", item.id, item.label, item.status, round(item.score, 6), item.evidence]),
    ...(report.couplings || []).map((item) => ["coupling", item.id, item.label, item.status, round(item.score, 6), item.signals.join(" | ")])
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function compactWaterPartition(waterBudget) {
  if (!waterBudget) return null;
  return {
    totalWaterInputM3: finite(waterBudget.totalWaterInputM3, 0),
    actualEvapotranspirationVolumeM3: finite(waterBudget.actualEvapotranspirationVolumeM3, 0),
    infrastructureDemandVolumeM3: finite(waterBudget.infrastructureDemandVolumeM3, 0),
    infrastructureDemandRequestedVolumeM3: finite(waterBudget.infrastructureDemandRequestedVolumeM3, 0),
    infrastructureUnmetDemandVolumeM3: finite(waterBudget.infrastructureUnmetDemandVolumeM3, 0),
    infrastructureDemandSatisfactionRatio: finite(waterBudget.infrastructureDemandSatisfactionRatio, 0),
    generatedRunoffAnnualM3: finite(waterBudget.generatedRunoffAnnualM3, 0),
    groundwaterRechargeVolumeM3: finite(waterBudget.groundwaterRechargeVolumeM3, 0),
    soilStorageChangeVolumeM3: finite(waterBudget.soilStorageChangeVolumeM3, 0),
    unresolvedResidualM3: finite(waterBudget.unresolvedResidualM3, 0),
    residualPctOfInput: finite(waterBudget.residualPctOfInput, 0),
    closureClass: waterBudget.closureClass || "unresolved"
  };
}

function subsurfaceRechargeConsistency(model) {
  const recharge = finite(model.stats?.waterBudget?.groundwaterRechargeVolumeM3, 0);
  const input = finite(model.stats?.waterBudget?.totalWaterInputM3, 0);
  const rechargeFraction = input > 0 ? recharge / input : 0;
  const saturation = finite(model.subsurface?.stats?.meanSaturation, finite(model.subsurface?.stats?.saturatedPoreFraction, 0.4));
  const infiltration = finite(model.stats?.meanInfiltrationCapacity, 0.5);
  const expected = clamp(0.04 + infiltration * 0.42, 0.04, 0.5);
  const fractionAgreement = clamp(1 - Math.abs(rechargeFraction - expected) / Math.max(0.12, expected), 0, 1);
  const saturationAgreement = clamp(0.55 + Math.min(rechargeFraction, 0.4) + saturation * 0.18, 0, 1);
  return geometricMean([fractionAgreement, saturationAgreement]);
}

function gate(id, label, score, evidence) {
  const value = clamp(finite(score, 0), 0, 1);
  return { id, label, score: value, status: statusForScore(value), evidence };
}

function coupling(id, label, score, signals) {
  const value = clamp(finite(score, 0), 0, 1);
  return { id, label, score: value, status: statusForScore(value, 0.82, 0.58), signals };
}

function statusForScore(score, pass = 0.9, review = 0.65) {
  if (score >= pass) return "pass";
  if (score >= review) return "review";
  return "fail";
}

function positiveCorrelationScore(value, neutralScore = 0.55) {
  if (!Number.isFinite(value)) return neutralScore;
  return clamp(0.55 + value * 0.45, 0, 1);
}

function inverseCorrelationScore(value) {
  if (!Number.isFinite(value)) return 0.55;
  return clamp(0.55 - value * 0.45, 0, 1);
}

function pairAccumulator() {
  return { n: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0 };
}

function addPair(state, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  state.n += 1;
  state.sx += x;
  state.sy += y;
  state.sxx += x * x;
  state.syy += y * y;
  state.sxy += x * y;
}

function correlation(state) {
  if (!state || state.n < 3) return null;
  const numerator = state.n * state.sxy - state.sx * state.sy;
  const denominator = Math.sqrt(
    Math.max(0, state.n * state.sxx - state.sx * state.sx) *
    Math.max(0, state.n * state.syy - state.sy * state.sy)
  );
  return denominator > 1e-12 ? clamp(numerator / denominator, -1, 1) : null;
}

function geometricMean(values) {
  const clean = values.filter(Number.isFinite).map((value) => clamp(value, 0.0001, 1));
  if (!clean.length) return 0;
  return Math.exp(clean.reduce((sum, value) => sum + Math.log(value), 0) / clean.length);
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return null;
  const power = 10 ** digits;
  return Math.round(value * power) / power;
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
