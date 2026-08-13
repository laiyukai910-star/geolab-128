import assert from "node:assert/strict";
import {
  buildBackendScenario,
  configuredBackendUrl,
  inspectBackend,
  runBackendVerification
} from "../src/backendClient.js";

const n = 4;
const length = n * n;
const model = {
  n,
  sizeKm: 8,
  height: Float32Array.from({ length }, (_, index) => 100 + index),
  precipitation: Float32Array.from({ length }, () => 1_000),
  temperature: Float32Array.from({ length }, () => 16),
  surface: {
    curveNumber: Float32Array.from({ length }, () => 72),
    hydraulicConductivityMmHr: Float32Array.from({ length }, () => 18),
    availableWaterCapacityMm: Float32Array.from({ length }, () => 140),
    imperviousFraction: Float32Array.from({ length }, () => 0.1),
    vegetation: Float32Array.from({ length }, () => 0.65)
  },
  infrastructureInfluence: {
    irrigationMm: Float32Array.from({ length }, () => 0),
    waterDemandMm: Float32Array.from({ length }, () => 0),
    buildingDensity: Float32Array.from({ length }, (_, index) => index === 5 ? 0.8 : 0)
  },
  subsurface: {
    gridN: 2,
    depthM: 40,
    columnBedrockDepthM: Float32Array.from([22, 24, 26, 28]),
    columnWaterTableDepthM: Float32Array.from([4, 6, 8, 10])
  },
  stats: {
    waterBudget: { residualPctOfInput: 0 },
    meanPotentialEvapotranspiration: 900,
    landscapeNetwork: { meanConnectivity: 0.81 }
  },
  physicalCoupling: { summary: { processIntegrityIndex: 0.99 } }
};
const params = { seed: 42, currentYear: 5, humidity: 0.7, windSpeed: 4, latitude: 32, dayOfYear: 183 };

assert.equal(configuredBackendUrl({ search: "?backend=http%3A%2F%2F127.0.0.1%3A48129" }), "http://127.0.0.1:48129");
assert.equal(configuredBackendUrl({ search: "?backend=https%3A%2F%2Fexample.com" }), null);

const request = buildBackendScenario(model, params, { resolution: 4 });
assert.equal(request.apiVersion, "1.0");
assert.equal(request.grid.elevationM.length, length);
assert.equal(request.grid.pointSpacingM, 8_000 / 3);
assert.equal(request.grid.cellSupportAreaM2, 4_000_000);
assert.equal(request.grid.cellSupportAreaM2 * length, 64_000_000);
assert.equal(request.routing.method, "multiple-flow-direction");
assert.equal(request.subsurface.aquiferThicknessM.length, length);
assert.equal(request.subsurface.aquiferThicknessM[0], 21);
assert.equal(request.subsurface.initialStorageFraction.length, length);
assert.ok(request.subsurface.initialStorageFraction.every((value) => value >= 0 && value <= 1));
assert.equal(request.ecology.barrierFraction.length, length);
assert.equal(request.control.durationDays, 365);

const fetchImpl = async (url, init = {}) => {
  if (url.endsWith("/health")) return jsonResponse({ status: "ready", engine: "geolab-core-rust", apiVersion: "1.0" });
  if (url.endsWith("/v1/capabilities")) return jsonResponse({ apiVersion: "1.0", maxApiCells: 262144 });
  assert.equal(init.method, "POST");
  const body = JSON.parse(init.body);
  return jsonResponse({
    requestId: "rust-00000001",
    report: {
      apiVersion: "1.0",
      engine: "geolab-core-rust",
      summary: {
        processIntegrityIndex: 1,
        meanReferenceEvapotranspirationMm: 880,
        failedGateCount: 0,
        passedGateCount: 6,
        reviewGateCount: 0
      },
      waterBudget: { residualPercentOfInput: 0 },
      subsurfaceBudget: { residualPercentOfInput: 0, meanWaterTableDepthM: 12 },
      sedimentBudget: { residualPercentOfDetachment: 0 },
      ecology: { meanResistanceConnectivity: 0.73 },
      grid: { width: body.grid.width, height: body.grid.height }
    }
  });
};

const status = await inspectBackend("http://127.0.0.1:48129", fetchImpl);
assert.equal(status.status, "ready");
const verification = await runBackendVerification(model, params, "http://127.0.0.1:48129", {
  resolution: 4,
  fetchImpl
});
assert.equal(verification.report.engine, "geolab-core-rust");
assert.equal(verification.comparison.rustProcessIntegrityIndex, 1);
assert.equal(verification.comparison.rustHabitatConnectivity, 0.73);
assert.equal(verification.comparison.browserHabitatConnectivity, 0.81);
assert.equal(verification.sample.auditResolution, 4);

const kernelTransport = {
  capabilities: async () => ({
    apiVersion: "1.0",
    engine: "geolab-core-rust",
    maxApiCells: 1048576
  }),
  simulate: async (scenario) => ({
    requestId: "wasm-test-1",
    report: {
      apiVersion: "1.0",
      engine: "geolab-core-rust",
      summary: {
        processIntegrityIndex: 1,
        meanReferenceEvapotranspirationMm: 875,
        failedGateCount: 0,
        passedGateCount: 12,
        reviewGateCount: 0
      },
      waterBudget: { residualPercentOfInput: 0 },
      subsurfaceBudget: { residualPercentOfInput: 0, meanWaterTableDepthM: 11 },
      sedimentBudget: { residualPercentOfDetachment: 0 },
      ecology: { meanResistanceConnectivity: 0.76 },
      grid: { width: scenario.grid.width, height: scenario.grid.height }
    }
  })
};
const wasmStatus = await inspectBackend(null, fetchImpl, { kernelTransport });
assert.equal(wasmStatus.status, "ready");
assert.equal(wasmStatus.transport, "browser-wasm");
const wasmVerification = await runBackendVerification(model, params, null, {
  resolution: 4,
  kernelTransport
});
assert.equal(wasmVerification.transport, "browser-wasm");
assert.equal(wasmVerification.requestId, "wasm-test-1");
assert.equal(wasmVerification.report.summary.passedGateCount, 12);

console.log("Rust native/WASM kernel client tests passed");

function jsonResponse(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => value
  };
}
