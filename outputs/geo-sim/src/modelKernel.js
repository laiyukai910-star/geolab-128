// Generated from src-ts/modelKernel.ts. Run npm run browser:build to regenerate.
const REQUIRED_CONTINUOUS_CELL_LAYERS = [
  "filledElevationM",
  "slopeDegrees",
  "contributingAreaM2",
  "annualDischargeM3",
  "referenceEvapotranspirationMm",
  "actualEvapotranspirationMm",
  "runoffDepthMm",
  "retainedRunoffDepthMm",
  "groundwaterRechargeMm",
  "soilStorageChangeMm",
  "waterBalanceResidualMm"
];
const APPLIED_LAYERS = [
  "filled-elevation",
  "slope",
  "dominant-flow-receiver",
  "fractional-flow-targets",
  "contributing-area",
  "annual-discharge",
  "reference-et",
  "actual-et",
  "runoff",
  "managed-runoff-retention",
  "groundwater-recharge",
  "soil-storage-change",
  "water-balance-residual"
];
function applyRustAuthoritativeSurfaceLayers(model, verification) {
  const report = record(verification.report, "verification.report");
  const grid = record(report.grid, "report.grid");
  const terrain = record(report.terrain, "report.terrain");
  const summary = record(report.summary, "report.summary");
  const waterBudget = record(report.waterBudget, "report.waterBudget");
  const subsurfaceBudget = record(report.subsurfaceBudget, "report.subsurfaceBudget");
  const sedimentBudget = record(report.sedimentBudget, "report.sedimentBudget");
  const layers = parseLayers(report.authoritativeSurfaceLayers, model.n);
  const topologicalOrder = assertCommitGates(
    model,
    report,
    grid,
    terrain,
    summary,
    waterBudget,
    subsurfaceBudget,
    sedimentBudget,
    layers
  );
  const cellCount = model.n * model.n;
  const filledHeight = Float32Array.from(layers.filledElevationM);
  const slope = Float32Array.from(layers.slopeDegrees);
  const receiver = Int32Array.from(layers.dominantFlowReceiver);
  const flowAccumulation = Float64Array.from(layers.contributingAreaM2, (value) => value / 1e6);
  const discharge = Float64Array.from(layers.annualDischargeM3);
  const referenceEt = Float32Array.from(layers.referenceEvapotranspirationMm);
  const actualEt = Float32Array.from(layers.actualEvapotranspirationMm);
  const runoffDepth = Float32Array.from(layers.runoffDepthMm);
  const retainedRunoffDepth = Float32Array.from(layers.retainedRunoffDepthMm);
  const rechargeDepth = Float32Array.from(layers.groundwaterRechargeMm);
  const storageChange = Float32Array.from(layers.soilStorageChangeMm);
  const residual = Float32Array.from(layers.waterBalanceResidualMm);
  const targetOffsets = Uint32Array.from(layers.flowTargetOffsets);
  const targetIndices = Uint32Array.from(layers.flowTargetIndices);
  const targetFractions = Float32Array.from(layers.flowTargetFractions);
  const flowDivergence = new Uint8Array(cellCount);
  for (let index = 0; index < cellCount; index += 1) {
    flowDivergence[index] = targetOffsets[index + 1] - targetOffsets[index];
  }
  const { receiverDistance, flowDirection } = deriveReceiverGeometry(receiver, model.n);
  const comparison = compareCandidateLayers(model, {
    slope,
    receiver,
    flowAccumulation,
    discharge,
    runoffDepth,
    rechargeDepth
  });
  const cellAreaM2 = finite(grid.cellSupportAreaM2, Number(model.areaKm2) * 1e6 / cellCount);
  const localRunoffAnnualM3 = Float64Array.from(runoffDepth, (value) => value / 1e3 * cellAreaM2);
  const retainedFlowAnnualM3 = Float64Array.from(retainedRunoffDepth, (value) => value / 1e3 * cellAreaM2);
  const runoffCoefficient = new Float32Array(cellCount);
  const allocatedDemandMm = new Float32Array(cellCount);
  const unmetDemandMm = new Float32Array(cellCount);
  for (let index = 0; index < cellCount; index += 1) {
    const precipitation = Math.max(0, Number(model.precipitation?.[index]) || 0);
    const irrigation = Math.max(0, Number(model.infrastructureInfluence?.irrigationMm?.[index]) || 0);
    const requestedDemand = Math.max(0, Number(model.infrastructureInfluence?.waterDemandMm?.[index]) || 0);
    const input = precipitation + irrigation;
    allocatedDemandMm[index] = Math.min(input, requestedDemand);
    unmetDemandMm[index] = Math.max(0, requestedDemand - allocatedDemandMm[index]);
    runoffCoefficient[index] = clamp(runoffDepth[index] / Math.max(1, input), 0, 0.95);
  }
  const state = {
    status: "applied",
    schemaVersion: "1.0.0",
    reason: null,
    transport: typeof verification.transport === "string" ? verification.transport : null,
    resolution: model.n,
    processIntegrityIndex: finiteOrNull(summary.processIntegrityIndex),
    passedGateCount: integerOrNull(summary.passedGateCount),
    reviewGateCount: integerOrNull(summary.reviewGateCount),
    failedGateCount: integerOrNull(summary.failedGateCount),
    executionMs: finiteOrNull(verification.durationMs),
    appliedLayers: [...APPLIED_LAYERS],
    comparison
  };
  model.filledHeight = filledHeight;
  model.slope = slope;
  model.receiver = receiver;
  model.receiverDistance = receiverDistance;
  model.flowDirection = flowDirection;
  model.flowAccumulation = flowAccumulation;
  model.discharge = discharge;
  model.runoffCoefficient = runoffCoefficient;
  model.localRunoffAnnualM3 = localRunoffAnnualM3;
  model.retainedFlowAnnualM3 = retainedFlowAnnualM3;
  model.flowDivergence = flowDivergence;
  model.flowRouting = "mfd";
  model.sortedByHeight = topologicalOrder;
  model.rustFlowTargets = { offsets: targetOffsets, indices: targetIndices, fractions: targetFractions };
  model.hydroBudget = {
    ...model.hydroBudget || {},
    method: "rust-authoritative-annual-water-partition-with-managed-retention",
    localRunoffDepthMm: runoffDepth,
    retainedRunoffDepthMm: retainedRunoffDepth,
    groundwaterRechargeMm: rechargeDepth,
    soilStorageChangeMm: storageChange,
    waterBudgetResidualMm: residual,
    allocatedDemandMm,
    unmetDemandMm
  };
  if (model.surface) {
    model.surface.potentialEvapotranspiration = referenceEt;
    model.surface.actualEvapotranspiration = actualEt;
  }
  model.rustAuthoritative = state;
  return state;
}
function skippedRustAuthoritativeState(model, reason, transport = null) {
  return {
    status: "skipped",
    schemaVersion: "1.0.0",
    reason,
    transport,
    resolution: model.n,
    processIntegrityIndex: null,
    passedGateCount: null,
    reviewGateCount: null,
    failedGateCount: null,
    executionMs: null,
    appliedLayers: [],
    comparison: null
  };
}
function rejectedRustAuthoritativeState(model, reason, transport = null) {
  return { ...skippedRustAuthoritativeState(model, reason, transport), status: "rejected" };
}
function assertCommitGates(model, report, grid, terrain, summary, waterBudget, subsurfaceBudget, sedimentBudget, layers) {
  if (report.apiVersion !== "1.0" || report.engine !== "geolab-core-rust") {
    throw new Error("Rust authoritative report uses an incompatible engine contract");
  }
  if (integer(grid.width) !== model.n || integer(grid.height) !== model.n) {
    throw new Error(`Rust authoritative grid must match the ${model.n} x ${model.n} working grid`);
  }
  if (terrain.routingMethod !== "multiple-flow-direction") {
    throw new Error("Rust authoritative commit requires multiple-flow-direction routing");
  }
  const failedGateCount = integer(summary.failedGateCount);
  const integrity = finite(summary.processIntegrityIndex, 0);
  if (failedGateCount !== 0 || integrity < 0.98) {
    throw new Error(`Rust authoritative gates rejected commit (${failedGateCount} failed, integrity ${integrity})`);
  }
  const gates = array(report.gates, "report.gates");
  if (gates.some((gate) => record(gate, "report.gates[]").status === "fail")) {
    throw new Error("Rust authoritative report contains a failed process gate");
  }
  for (const [label, value] of [
    ["surface water", waterBudget.residualPercentOfInput],
    ["groundwater", subsurfaceBudget.residualPercentOfInput],
    ["sediment", sedimentBudget.residualPercentOfDetachment]
  ]) {
    if (Math.abs(finite(value, Number.POSITIVE_INFINITY)) > 1e-5) {
      throw new Error(`Rust authoritative ${label} residual exceeds commit tolerance`);
    }
  }
  validatePhysicalRanges(layers, grid, model.n);
  return validateFlowGraph(layers, model.n);
}
function parseLayers(value, cellCountSide) {
  const source = record(value, "report.authoritativeSurfaceLayers");
  const cellCount = cellCountSide * cellCountSide;
  const output = {};
  for (const key of REQUIRED_CONTINUOUS_CELL_LAYERS) {
    output[key] = finiteArray(source[key], key, cellCount);
  }
  output.dominantFlowReceiver = integerArray(
    source.dominantFlowReceiver,
    "dominantFlowReceiver",
    cellCount
  );
  output.flowTargetOffsets = integerArray(source.flowTargetOffsets, "flowTargetOffsets", cellCount + 1);
  output.flowTargetIndices = integerArray(source.flowTargetIndices, "flowTargetIndices");
  output.flowTargetFractions = finiteArray(source.flowTargetFractions, "flowTargetFractions");
  if (output.flowTargetIndices.length !== output.flowTargetFractions.length) {
    throw new Error("Rust authoritative flow target indices and fractions differ in length");
  }
  return output;
}
function validatePhysicalRanges(layers, grid, side) {
  const cellCount = side * side;
  const cellAreaM2 = finite(grid.cellSupportAreaM2, -1);
  if (cellAreaM2 <= 0) throw new Error("Rust authoritative grid has an invalid cell support area");
  const domainAreaM2 = cellAreaM2 * cellCount;
  for (let index = 0; index < cellCount; index += 1) {
    const slope = layers.slopeDegrees[index];
    const area = layers.contributingAreaM2[index];
    const runoff = layers.runoffDepthMm[index];
    const retained = layers.retainedRunoffDepthMm[index];
    if (slope < 0 || slope > 90) {
      throw new Error(`Rust authoritative slope is outside physical bounds at cell ${index}`);
    }
    if (area < cellAreaM2 * (1 - 1e-7) || area > domainAreaM2 * (1 + 1e-7)) {
      throw new Error(`Rust authoritative contributing area is outside domain bounds at cell ${index}`);
    }
    if (layers.annualDischargeM3[index] < 0 || layers.referenceEvapotranspirationMm[index] < 0 || layers.actualEvapotranspirationMm[index] < 0 || runoff < 0 || retained < 0 || retained > runoff + 1e-7 || layers.groundwaterRechargeMm[index] < 0 || layers.soilStorageChangeMm[index] < 0 || Math.abs(layers.waterBalanceResidualMm[index]) > 1e-6) {
      throw new Error(`Rust authoritative water layers are outside physical bounds at cell ${index}`);
    }
  }
}
function validateFlowGraph(layers, side) {
  const cellCount = side * side;
  const upstreamCount = new Uint8Array(cellCount);
  let previousOffset = 0;
  for (let index = 0; index < cellCount; index += 1) {
    const start = layers.flowTargetOffsets[index];
    const end = layers.flowTargetOffsets[index + 1];
    if (start !== previousOffset || end < start || end > layers.flowTargetIndices.length) {
      throw new Error(`Rust authoritative flow offsets are invalid at cell ${index}`);
    }
    if (end - start > 8) throw new Error(`Rust authoritative flow fan-out exceeds D8 neighbors at cell ${index}`);
    const dominant = layers.dominantFlowReceiver[index];
    if (end === start && dominant !== -1 || end > start && dominant < 0) {
      throw new Error(`Rust authoritative dominant receiver disagrees with routing targets at cell ${index}`);
    }
    let fractionSum = 0;
    let dominantFound = end === start;
    const uniqueTargets = /* @__PURE__ */ new Set();
    for (let cursor = start; cursor < end; cursor += 1) {
      const target = layers.flowTargetIndices[cursor];
      const fraction = layers.flowTargetFractions[cursor];
      if (target < 0 || target >= cellCount || target === index || fraction <= 0 || fraction > 1) {
        throw new Error(`Rust authoritative flow target is invalid at cell ${index}`);
      }
      const dx = Math.abs(target % side - index % side);
      const dy = Math.abs(Math.floor(target / side) - Math.floor(index / side));
      if (dx > 1 || dy > 1) throw new Error(`Rust authoritative flow target is nonlocal at cell ${index}`);
      if (uniqueTargets.has(target)) throw new Error(`Rust authoritative flow target is duplicated at cell ${index}`);
      if (layers.filledElevationM[target] > layers.filledElevationM[index] + 1e-7) {
        throw new Error(`Rust authoritative flow target climbs uphill at cell ${index}`);
      }
      uniqueTargets.add(target);
      upstreamCount[target] += 1;
      fractionSum += fraction;
      if (target === dominant) dominantFound = true;
    }
    if (end > start && Math.abs(fractionSum - 1) > 1e-5) {
      throw new Error(`Rust authoritative flow fractions do not close at cell ${index}`);
    }
    if (!dominantFound) throw new Error(`Rust authoritative dominant receiver is absent at cell ${index}`);
    previousOffset = end;
  }
  if (previousOffset !== layers.flowTargetIndices.length) {
    throw new Error("Rust authoritative flow offsets do not consume every target");
  }
  const queue = [];
  for (let index = 0; index < cellCount; index += 1) {
    if (upstreamCount[index] === 0) queue.push(index);
  }
  const topologicalOrder = [];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    topologicalOrder.push(index);
    const start = layers.flowTargetOffsets[index];
    const end = layers.flowTargetOffsets[index + 1];
    for (let targetCursor = start; targetCursor < end; targetCursor += 1) {
      const target = layers.flowTargetIndices[targetCursor];
      upstreamCount[target] -= 1;
      if (upstreamCount[target] === 0) queue.push(target);
    }
  }
  if (topologicalOrder.length !== cellCount) {
    throw new Error("Rust authoritative flow graph contains a cycle");
  }
  return topologicalOrder;
}
function deriveReceiverGeometry(receiver, side) {
  const receiverDistance = new Float32Array(receiver.length);
  const flowDirection = new Int8Array(receiver.length);
  flowDirection.fill(-1);
  const directions = /* @__PURE__ */ new Map([
    ["1,0", 0],
    ["1,1", 1],
    ["0,1", 2],
    ["-1,1", 3],
    ["-1,0", 4],
    ["-1,-1", 5],
    ["0,-1", 6],
    ["1,-1", 7]
  ]);
  for (let index = 0; index < receiver.length; index += 1) {
    const target = receiver[index];
    if (target < 0) continue;
    const dx = target % side - index % side;
    const dy = Math.floor(target / side) - Math.floor(index / side);
    receiverDistance[index] = Math.hypot(dx, dy);
    flowDirection[index] = directions.get(`${dx},${dy}`) ?? -1;
  }
  return { receiverDistance, flowDirection };
}
function compareCandidateLayers(model, candidate) {
  return {
    slope: layerDelta(model.slope, candidate.slope),
    logContributingArea: layerDelta(model.flowAccumulation, candidate.flowAccumulation, logTransform),
    logAnnualDischarge: layerDelta(model.discharge, candidate.discharge, logTransform),
    runoffDepth: layerDelta(model.hydroBudget?.localRunoffDepthMm, candidate.runoffDepth),
    rechargeDepth: layerDelta(model.hydroBudget?.groundwaterRechargeMm, candidate.rechargeDepth),
    dominantReceiverAgreement: receiverAgreement(model.receiver, candidate.receiver)
  };
}
function layerDelta(left, right, transform = identity) {
  if (!left || !right || left.length !== right.length || left.length === 0) return null;
  const stride = Math.max(1, Math.floor(left.length / 65536));
  let count = 0;
  let absolute = 0;
  let squared = 0;
  let bias = 0;
  let magnitude = 0;
  for (let index = 0; index < left.length; index += stride) {
    const a = transform(Number(left[index]));
    const b = transform(Number(right[index]));
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const delta = b - a;
    absolute += Math.abs(delta);
    squared += delta * delta;
    bias += delta;
    magnitude += (Math.abs(a) + Math.abs(b)) * 0.5;
    count += 1;
  }
  if (!count) return null;
  const scale = Math.max(1e-9, magnitude / count);
  return {
    sampleCount: count,
    meanAbsoluteDifference: absolute / count,
    rootMeanSquareDifference: Math.sqrt(squared / count),
    meanBias: bias / count,
    normalizedMeanAbsoluteDifference: absolute / count / scale
  };
}
function receiverAgreement(left, right) {
  if (!left || !right || left.length !== right.length || left.length === 0) return null;
  let comparable = 0;
  let equal = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = integer(left[index]);
    const b = integer(right[index]);
    if (a < 0 && b < 0) continue;
    comparable += 1;
    if (a === b) equal += 1;
  }
  return comparable ? equal / comparable : 1;
}
function finiteArray(value, label, expectedLength) {
  const values = array(value, label);
  if (expectedLength !== void 0 && values.length !== expectedLength) {
    throw new Error(`${label} expected ${expectedLength} values, received ${values.length}`);
  }
  return values.map((entry, index) => {
    const number = Number(entry);
    if (!Number.isFinite(number)) throw new Error(`${label}[${index}] is not finite`);
    return number;
  });
}
function integerArray(value, label, expectedLength) {
  return finiteArray(value, label, expectedLength).map((entry, index) => {
    if (!Number.isSafeInteger(entry)) throw new Error(`${label}[${index}] is not an integer`);
    return entry;
  });
}
function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}
function array(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}
function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function integer(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : -1;
}
function integerOrNull(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}
function identity(value) {
  return value;
}
function logTransform(value) {
  return Math.log1p(Math.max(0, value));
}
function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
export {
  applyRustAuthoritativeSurfaceLayers,
  rejectedRustAuthoritativeState,
  skippedRustAuthoritativeState
};
