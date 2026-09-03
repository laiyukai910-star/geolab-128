export interface ModelWorkerTransferDiagnostics {
  mode: string;
  bufferCount: number;
  totalBytes: number;
}

interface ModelWorkerSuccess {
  id: number;
  ok: true;
  model: unknown;
  transferDiagnostics?: ModelWorkerTransferDiagnostics;
}

interface ModelWorkerFailure {
  id: number;
  ok: false;
  error?: string;
}

type ModelWorkerResponse = ModelWorkerSuccess | ModelWorkerFailure;

interface WorkerEventMap {
  message: MessageEvent<ModelWorkerResponse>;
  error: ErrorEvent;
  messageerror: MessageEvent<unknown>;
}

export interface ModelWorkerLike {
  addEventListener<K extends keyof WorkerEventMap>(
    type: K,
    listener: (event: WorkerEventMap[K]) => void
  ): void;
  postMessage(message: unknown): void;
  terminate(): void;
}

type WorkerFactory = (url: URL) => ModelWorkerLike;

interface PendingRequest {
  resolve: (model: unknown) => void;
  reject: (error: Error) => void;
}

export interface ModelWorkerClientOptions {
  workerUrl: URL;
  workerFactory?: WorkerFactory;
  onTransferDiagnostics?: (diagnostics: ModelWorkerTransferDiagnostics | null) => void;
}

export class ModelWorkerClient {
  readonly workerUrl: URL;
  private readonly workerFactory: WorkerFactory;
  private readonly onTransferDiagnostics?: ModelWorkerClientOptions["onTransferDiagnostics"];
  private worker: ModelWorkerLike | null = null;
  private requestSequence = 0;
  private readonly pending = new Map<number, PendingRequest>();
  private disposed = false;

  constructor(options: ModelWorkerClientOptions) {
    this.workerUrl = options.workerUrl;
    this.workerFactory = options.workerFactory || defaultWorkerFactory;
    this.onTransferDiagnostics = options.onTransferDiagnostics;
    this.ensureWorker();
  }

  execute(
    operation: string,
    payload: Record<string, unknown>,
    rustBackendEndpoint: string | null
  ): Promise<unknown> {
    if (this.disposed) return Promise.reject(new Error("Model Worker client is disposed"));
    let worker: ModelWorkerLike;
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

  private ensureWorker() {
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

  private handleMessage(worker: ModelWorkerLike, event: MessageEvent<ModelWorkerResponse>) {
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

  private invalidateWorker(worker: ModelWorkerLike, error: Error) {
    if (worker !== this.worker) return;
    worker.terminate();
    this.worker = null;
    this.rejectPending(error);
  }

  private rejectPending(error: Error) {
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
  }
}

export function createRetryableAsyncResource<T>(factory: () => Promise<T>) {
  let pending: Promise<T> | null = null;
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

function defaultWorkerFactory(url: URL): ModelWorkerLike {
  if (typeof Worker !== "function") throw new Error("Web Workers are unavailable in this runtime");
  return new Worker(url, { type: "module" });
}

function normalizeError(error: unknown, fallback: string) {
  return error instanceof Error ? error : new Error(String(error || fallback));
}
