import { createRustWasmKernel } from "./wasmAbi.js";

type WorkerRequest =
  | { id: string; kind: "capabilities" }
  | { id: string; kind: "simulate"; scenario: unknown };

type WorkerResponse =
  | { id: string; ok: true; payload: unknown }
  | { id: string; ok: false; error: string };

interface WorkerScope {
  location: Location;
  addEventListener(type: "message", listener: (event: MessageEvent<WorkerRequest>) => void): void;
  postMessage(message: WorkerResponse): void;
}

const scope = globalThis as unknown as WorkerScope;
const wasmUrl = new URL("../vendor/geolab/geolab_core.wasm", scope.location.href);
const kernelPromise = fetch(wasmUrl)
  .then((response) => {
    if (!response.ok) throw new Error(`Unable to load bundled Rust WASM (${response.status})`);
    return response.arrayBuffer();
  })
  .then(createRustWasmKernel);

scope.addEventListener("message", (event) => {
  void handleRequest(event.data);
});

async function handleRequest(request: WorkerRequest): Promise<void> {
  try {
    const kernel = await kernelPromise;
    const payload = request.kind === "capabilities"
      ? kernel.capabilities()
      : { requestId: `wasm-${request.id}`, ...kernel.simulate(request.scenario) };
    scope.postMessage({ id: request.id, ok: true, payload });
  } catch (error) {
    scope.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
