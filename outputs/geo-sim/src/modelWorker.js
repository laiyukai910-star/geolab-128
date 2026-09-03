// Generated from src-ts/modelWorker.ts. Run npm run browser:build to regenerate.
import {
  buildModel,
  erodeModel,
  refreshModelAfterKernelIntegration,
  runModel,
  updateTemporalModel
} from "../src/geoEngine.js";
import {
  runBackendVerification
} from "./backendClient.js";
import {
  applyRustAuthoritativeSurfaceLayers,
  rejectedRustAuthoritativeState,
  skippedRustAuthoritativeState
} from "./modelKernel.js";
import { createRustWasmKernel } from "./wasmAbi.js";
import { createRetryableAsyncResource } from "./modelWorkerClient.js";
const MAX_AUTHORITATIVE_RESOLUTION = 512;
const scope = globalThis;
let taskQueue = Promise.resolve();
let wasmRequestSequence = 0;
const getWasmKernel = createRetryableAsyncResource(loadWasmKernel);
scope.addEventListener("message", (event) => {
  taskQueue = taskQueue.then(() => handleRequest(event.data), () => handleRequest(event.data));
});
async function handleRequest(request) {
  try {
    const params = request.params || {};
    let result;
    if (request.op === "build") {
      result = buildModel(params);
    } else if (request.op === "run") {
      if (!request.model) throw new Error("Run operation requires a model");
      result = runModel(request.model, params);
    } else if (request.op === "temporal") {
      if (!request.model) throw new Error("Temporal operation requires a model");
      result = updateTemporalModel(request.model, params);
    } else if (request.op === "erode") {
      if (!request.model) throw new Error("Erode operation requires a model");
      result = erodeModel(request.model, params, request.passes || 4);
    } else {
      throw new Error(`Unknown worker operation: ${String(request.op)}`);
    }
    if (request.op !== "temporal") {
      result = await reconcileRustAuthoritativeLayers(
        result,
        params,
        request.rustBackendEndpoint || null
      );
    }
    const transferList = collectTransferableBuffers(result);
    scope.postMessage({
      id: request.id,
      ok: true,
      model: result,
      transferDiagnostics: {
        mode: "transferable-zero-copy-return",
        bufferCount: transferList.length,
        totalBytes: transferList.reduce((sum, buffer) => sum + buffer.byteLength, 0)
      }
    }, transferList);
  } catch (error) {
    scope.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }, []);
  }
}
async function reconcileRustAuthoritativeLayers(model, params, endpoint) {
  const transportName = endpoint ? "native-sidecar" : "browser-wasm";
  if (params.rustAuthoritativeLayers === false) {
    setAuthorityState(model, skippedRustAuthoritativeState(model, "disabled-by-scenario", transportName));
    return model;
  }
  if (model.n > MAX_AUTHORITATIVE_RESOLUTION) {
    setAuthorityState(model, skippedRustAuthoritativeState(
      model,
      `working grid exceeds the phase-two ${MAX_AUTHORITATIVE_RESOLUTION} x ${MAX_AUTHORITATIVE_RESOLUTION} atomic-commit limit`,
      transportName
    ));
    return model;
  }
  try {
    const kernelTransport = endpoint ? void 0 : directWasmTransport();
    const verification = await runBackendVerification(
      model,
      params,
      endpoint,
      {
        resolution: model.n,
        maximumResolution: MAX_AUTHORITATIVE_RESOLUTION,
        includeLayers: false,
        authoritativeSurfaceLayers: true,
        kernelTransport
      }
    );
    applyRustAuthoritativeSurfaceLayers(model, verification);
    model.kernelExecutionRuntimeMs = verification.durationMs;
    model.runtimeMs = (Number(model.runtimeMs) || 0) + verification.durationMs;
    return refreshModelAfterKernelIntegration(model, params);
  } catch (error) {
    setAuthorityState(model, rejectedRustAuthoritativeState(
      model,
      error instanceof Error ? error.message : String(error),
      transportName
    ));
    return model;
  }
}
function setAuthorityState(model, state) {
  model.rustAuthoritative = state;
  const stats = model.stats;
  if (stats) stats.rustAuthoritative = state;
}
function directWasmTransport() {
  return {
    capabilities: async () => (await getWasmKernel()).capabilities(),
    simulate: async (scenario) => ({
      requestId: `model-wasm-${(++wasmRequestSequence).toString(36)}`,
      ...(await getWasmKernel()).simulate(scenario)
    })
  };
}
async function loadWasmKernel() {
  const wasmUrl = new URL("../vendor/geolab/geolab_core.wasm", scope.location.href);
  const response = await fetch(wasmUrl);
  if (!response.ok) throw new Error(`Unable to load bundled Rust WASM (${response.status})`);
  return createRustWasmKernel(await response.arrayBuffer());
}
function collectTransferableBuffers(value) {
  const visited = /* @__PURE__ */ new WeakSet();
  const buffers = /* @__PURE__ */ new Set();
  const visit = (entry) => {
    if (!entry || typeof entry !== "object") return;
    if (ArrayBuffer.isView(entry)) {
      if (entry.buffer instanceof ArrayBuffer) buffers.add(entry.buffer);
      return;
    }
    if (entry instanceof ArrayBuffer) {
      buffers.add(entry);
      return;
    }
    if (visited.has(entry)) return;
    visited.add(entry);
    if (Array.isArray(entry)) {
      for (const item of entry) visit(item);
      return;
    }
    for (const item of Object.values(entry)) visit(item);
  };
  visit(value);
  return Array.from(buffers);
}
