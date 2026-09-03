// Generated from src-ts/modelWorkerClient.ts. Run npm run browser:build to regenerate.
class ModelWorkerClient {
  workerUrl;
  workerFactory;
  onTransferDiagnostics;
  worker = null;
  requestSequence = 0;
  pending = /* @__PURE__ */ new Map();
  disposed = false;
  constructor(options) {
    this.workerUrl = options.workerUrl;
    this.workerFactory = options.workerFactory || defaultWorkerFactory;
    this.onTransferDiagnostics = options.onTransferDiagnostics;
    this.ensureWorker();
  }
  execute(operation, payload, rustBackendEndpoint) {
    if (this.disposed) return Promise.reject(new Error("Model Worker client is disposed"));
    let worker;
    try {
      worker = this.ensureWorker();
    } catch (error) {
      return Promise.reject(normalizeError(error, "Model Worker could not start"));
    }
    const id = ++this.requestSequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        worker.postMessage({ id, op: operation, ...payload, rustBackendEndpoint });
      } catch (error) {
        this.pending.delete(id);
        reject(normalizeError(error, "Model Worker request could not be sent"));
      }
    });
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.worker?.terminate();
    this.worker = null;
    const error = new Error("Model Worker client was disposed");
    error.name = "AbortError";
    this.rejectPending(error);
  }
  ensureWorker() {
    if (this.worker) return this.worker;
    const worker = this.workerFactory(this.workerUrl);
    this.worker = worker;
    worker.addEventListener("message", (event) => this.handleMessage(worker, event));
    worker.addEventListener("error", (event) => {
      event.preventDefault?.();
      this.invalidateWorker(worker, new Error(event.message || "Model Worker failed"));
    });
    worker.addEventListener("messageerror", () => {
      this.invalidateWorker(worker, new Error("Model Worker returned an unreadable message"));
    });
    return worker;
  }
  handleMessage(worker, event) {
    if (worker !== this.worker) return;
    const response = event.data;
    if (!response || !Number.isSafeInteger(response.id)) return;
    const request = this.pending.get(response.id);
    if (!request) return;
    this.pending.delete(response.id);
    if (response.ok) {
      this.onTransferDiagnostics?.(response.transferDiagnostics || null);
      request.resolve(response.model);
      return;
    }
    request.reject(new Error(response.error || "Model Worker task failed"));
  }
  invalidateWorker(worker, error) {
    if (worker !== this.worker) return;
    worker.terminate();
    this.worker = null;
    this.rejectPending(error);
  }
  rejectPending(error) {
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
  }
}
function createRetryableAsyncResource(factory) {
  let pending = null;
  return () => {
    if (!pending) {
      pending = factory().catch((error) => {
        pending = null;
        throw error;
      });
    }
    return pending;
  };
}
function defaultWorkerFactory(url) {
  if (typeof Worker !== "function") throw new Error("Web Workers are unavailable in this runtime");
  return new Worker(url, { type: "module" });
}
function normalizeError(error, fallback) {
  return error instanceof Error ? error : new Error(String(error || fallback));
}
export {
  ModelWorkerClient,
  createRetryableAsyncResource
};
