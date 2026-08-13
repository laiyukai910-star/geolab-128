import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildBackendScenario } from "../src/backendClient.js";
import { buildModel, createDefaultParams, refreshModelAfterKernelIntegration } from "../src/geoEngine.js";
import { applyRustAuthoritativeSurfaceLayers } from "../src/modelKernel.js";
import { createRustWasmKernel } from "../src/wasmAbi.js";

const params = {
  ...createDefaultParams(),
  resolution: 32,
  mapSizeKm: 32,
  flowRouting: "mfd",
  landscapeBlockGrid: 8,
  wildlifeMaxAgents: 20
};
const model = buildModel(params);
const scenario = buildBackendScenario(model, params, {
  resolution: model.n,
  maximumResolution: 512,
  authoritativeSurfaceLayers: true,
  includeLayers: false
});
scenario.management.runoffRetentionFraction[5] = 0.39;
const wasmBytes = await readFile(new URL("../vendor/geolab/geolab_core.wasm", import.meta.url));
const kernel = await createRustWasmKernel(wasmBytes);
const envelope = kernel.simulate(scenario);
const completeEnvelope = kernel.simulate({
  ...scenario,
  output: { authoritativeSurfaceLayers: false },
  includeLayers: true
});

assert.equal(envelope.report.layers, null);
assert.equal(envelope.report.authoritativeSurfaceLayers.filledElevationM.length, model.n * model.n);
assert.equal(envelope.report.authoritativeSurfaceLayers.flowTargetOffsets.length, model.n * model.n + 1);
assert.equal(envelope.report.summary.failedGateCount, 0);
assert.equal(envelope.report.summary.passedGateCount, 13);
assert.ok(envelope.report.waterBudget.retainedRunoffM3 > 0);
assert.ok(JSON.stringify(envelope).length < JSON.stringify(completeEnvelope).length * 0.75);

const previousReceiver = model.receiver;
const state = applyRustAuthoritativeSurfaceLayers(model, {
  transport: "browser-wasm",
  durationMs: 12,
  report: envelope.report
});
assert.equal(state.status, "applied");
assert.equal(state.appliedLayers.length, 13);
assert.equal(model.flowRouting, "mfd");
assert.notEqual(model.receiver, previousReceiver);
assert.equal(model.rustFlowTargets.offsets.length, model.n * model.n + 1);
assert.equal(model.sortedByHeight.length, model.n * model.n);
assert.equal(model.hydroBudget.method, "rust-authoritative-annual-water-partition-with-managed-retention");
assert.ok(model.retainedFlowAnnualM3[5] > 0);
assert.ok(model.rustAuthoritative.comparison.dominantReceiverAgreement >= 0);

refreshModelAfterKernelIntegration(model, params);
assert.equal(model.lastUpdateMode, "rust-authoritative");
assert.equal(model.stats.rustAuthoritative.status, "applied");
assert.equal(model.physicalCoupling.summary.failedGateCount, 0);
assert.ok(model.riverSegments.length > 0);

const rejectedModel = buildModel(params);
const rejectedReceiver = rejectedModel.receiver;
const rejectedReport = {
  ...envelope.report,
  summary: { ...envelope.report.summary, failedGateCount: 1 }
};
assert.throws(
  () => applyRustAuthoritativeSurfaceLayers(rejectedModel, {
    transport: "browser-wasm",
    durationMs: 12,
    report: rejectedReport
  }),
  /gates rejected commit/
);
assert.equal(rejectedModel.receiver, rejectedReceiver);
assert.equal(rejectedModel.rustAuthoritative, undefined);

const cyclicModel = buildModel(params);
const cyclicReceiver = cyclicModel.receiver;
const cyclicLayers = structuredClone(envelope.report.authoritativeSurfaceLayers);
let cycleSource = -1;
let cycleTarget = -1;
for (let index = 0; index < model.n * model.n; index += 1) {
  const start = cyclicLayers.flowTargetOffsets[index];
  const end = cyclicLayers.flowTargetOffsets[index + 1];
  if (end - start !== 1) continue;
  const target = cyclicLayers.flowTargetIndices[start];
  if (cyclicLayers.flowTargetOffsets[target + 1] - cyclicLayers.flowTargetOffsets[target] !== 1) continue;
  cycleSource = index;
  cycleTarget = target;
  break;
}
assert.ok(cycleSource >= 0 && cycleTarget >= 0);
const returnTargetOffset = cyclicLayers.flowTargetOffsets[cycleTarget];
cyclicLayers.flowTargetIndices[returnTargetOffset] = cycleSource;
cyclicLayers.dominantFlowReceiver[cycleTarget] = cycleSource;
const cycleElevation = Math.min(
  cyclicLayers.filledElevationM[cycleSource],
  cyclicLayers.filledElevationM[cycleTarget]
) - 1;
cyclicLayers.filledElevationM[cycleSource] = cycleElevation;
cyclicLayers.filledElevationM[cycleTarget] = cycleElevation;
const cyclicReport = {
  ...envelope.report,
  authoritativeSurfaceLayers: cyclicLayers
};
assert.throws(
  () => applyRustAuthoritativeSurfaceLayers(cyclicModel, {
    transport: "browser-wasm",
    durationMs: 12,
    report: cyclicReport
  }),
  /flow graph contains a cycle/
);
assert.equal(cyclicModel.receiver, cyclicReceiver);
assert.equal(cyclicModel.rustAuthoritative, undefined);

console.log("Rust authoritative model integration tests passed");
