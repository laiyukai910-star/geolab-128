import {
  buildModel,
  erodeModel,
  refreshModelAfterKernelIntegration,
  runModel,
  updateTemporalModel
} from "../src/geoEngine.js";
import {
  runBackendVerification,
  type BackendScenario,
  type KernelTransport,
  type ScenarioParams
} from "./backendClient.js";
import {
  applyRustAuthoritativeSurfaceLayers,
  rejectedRustAuthoritativeState,
  skippedRustAuthoritativeState,
  type KernelMutableModel
} from "./modelKernel.js";
import { createRustWasmKernel } from "./wasmAbi.js";

type ModelOperation = "build" | "run" | "temporal" | "erode";

interface ModelRequest {
  id: number;
  op: ModelOperation;
  params?: Record<string, unknown>;
  model?: KernelMutableModel;
  passes?: number;
  rustBackendEndpoint?: string | null;
}

type ModelResponse =
  | {
      id: number;
      ok: true;
      model: KernelMutableModel;
      transferDiagnostics: { mode: string; bufferCount: number; totalBytes: number };
    }
  | { id: number; ok: false; error: string };

interface ModelWorkerScope {
  location: Location;
  addEventListener(type: "message", listener: (event: MessageEvent<ModelRequest>) => void): void;
  postMessage(message: ModelResponse, transfer: Transferable[]): void;
}

const MAX_AUTHORITATIVE_RESOLUTION = 512;
const scope = globalThis as unknown as ModelWorkerScope;
let taskQueue = Promise.resolve();
let wasmKernelPromise: ReturnType<typeof loadWasmKernel> | null = null;
let wasmRequestSequence = 0;

scope.addEventListener("message", (event) => {
  taskQueue = taskQueue.then(() => handleRequest(event.data), () => handleRequest(event.data));
});

async function handleRequest(request: ModelRequest) {
  try {
    const params = request.params || {};
    let result: KernelMutableModel;
    if (request.op === "build") {
      result = buildModel(params) as KernelMutableModel;
    } else if (request.op === "run") {
      if (!request.model) throw new Error("Run operation requires a model");
      result = runModel(request.model, params) as KernelMutableModel;
    } else if (request.op === "temporal") {
      if (!request.model) throw new Error("Temporal operation requires a model");
      result = updateTemporalModel(request.model, params) as KernelMutableModel;
    } else if (request.op === "erode") {
      if (!request.model) throw new Error("Erode operation requires a model");
      result = erodeModel(request.model, params, request.passes || 4) as KernelMutableModel;
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

async function reconcileRustAuthoritativeLayers(
  model: KernelMutableModel,
  params: Record<string, unknown>,
  endpoint: string | null
) {
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
    const kernelTransport = endpoint ? undefined : directWasmTransport();
    const verification = await runBackendVerification(
      model,
      params as ScenarioParams,
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
    return refreshModelAfterKernelIntegration(model, params) as KernelMutableModel;
  } catch (error) {
    setAuthorityState(model, rejectedRustAuthoritativeState(
      model,
      error instanceof Error ? error.message : String(error),
      transportName
    ));
    return model;
  }
}

function setAuthorityState(model: KernelMutableModel, state: NonNullable<KernelMutableModel["rustAuthoritative"]>) {
  model.rustAuthoritative = state;
  const stats = model.stats as Record<string, unknown> | undefined;
  if (stats) stats.rustAuthoritative = state;
}

function directWasmTransport(): KernelTransport {
  return {
    capabilities: async () => (await getWasmKernel()).capabilities(),
    simulate: async (scenario: BackendScenario) => ({
      requestId: `model-wasm-${(++wasmRequestSequence).toString(36)}`,
      ...(await getWasmKernel()).simulate(scenario)
    })
  };
}

function getWasmKernel() {
  wasmKernelPromise ||= loadWasmKernel();
  return wasmKernelPromise;
}

async function loadWasmKernel() {
  const wasmUrl = new URL("../vendor/geolab/geolab_core.wasm", scope.location.href);
  const response = await fetch(wasmUrl);
  if (!response.ok) throw new Error(`Unable to load bundled Rust WASM (${response.status})`);
  return createRustWasmKernel(await response.arrayBuffer());
}

function collectTransferableBuffers(value: unknown) {
  const visited = new WeakSet<object>();
  const buffers = new Set<ArrayBuffer>();
  const visit = (entry: unknown) => {
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
    for (const item of Object.values(entry as Record<string, unknown>)) visit(item);
  };
  visit(value);
  return Array.from(buffers);
}
