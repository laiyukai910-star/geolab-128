import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildBackendScenario } from "../src/backendClient.js";
import { createRustWasmKernel } from "../src/wasmAbi.js";

const n = 4;
const length = n * n;
const model = {
  n,
  sizeKm: 8,
  height: Float32Array.from({ length }, (_, index) => 120 - index * 2),
  precipitation: Float32Array.from({ length }, () => 950),
  temperature: Float32Array.from({ length }, () => 15),
  surface: {
    curveNumber: Float32Array.from({ length }, () => 70),
    hydraulicConductivityMmHr: Float32Array.from({ length }, () => 20),
    availableWaterCapacityMm: Float32Array.from({ length }, () => 145),
    imperviousFraction: Float32Array.from({ length }, () => 0.05),
    vegetation: Float32Array.from({ length }, () => 0.7)
  }
};
const scenario = buildBackendScenario(model, {
  seed: 7,
  currentYear: 2,
  humidity: 0.65,
  windSpeed: 3,
  latitude: 32,
  dayOfYear: 183
}, { resolution: 4 });
const wasmPath = new URL("../vendor/geolab/geolab_core.wasm", import.meta.url);
const wasmBytes = await readFile(wasmPath);
const wasmModule = await WebAssembly.compile(wasmBytes);
assert.deepEqual(WebAssembly.Module.imports(wasmModule), []);
const kernel = await createRustWasmKernel(wasmBytes);
const capabilities = kernel.capabilities();

assert.equal(capabilities.apiVersion, "1.0");
assert.equal(capabilities.engine, "geolab-core-rust");
assert.equal(capabilities.maxApiCells, 1048576);
assert.ok(capabilities.routing.includes("priority-flood-freeman-mfd"));

const { report } = kernel.simulate(scenario);
assert.equal(report.apiVersion, "1.0");
assert.equal(report.engine, "geolab-core-rust");
assert.equal(report.terrain.routingMethod, "multiple-flow-direction");
assert.equal(report.grid.cellCount, length);
assert.equal(report.summary.failedGateCount, 0);
assert.ok(report.summary.processIntegrityIndex > 0.9);
assert.throws(
  () => kernel.simulate({
    ...scenario,
    grid: { ...scenario.grid, elevationM: [100] }
  }),
  /invalid_scenario \(grid\.elevationM\)/
);

console.log("Rust WebAssembly ABI simulation test passed");
