import assert from "node:assert/strict";
import { ModelWorkerClient, createRetryableAsyncResource } from "../src/modelWorkerClient.js";

class FakeWorker {
  listeners = new Map();
  messages = [];
  terminated = false;

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  postMessage(message) {
    if (this.terminated) throw new Error("worker is terminated");
    this.messages.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  emit(type, data = {}) {
    for (const listener of this.listeners.get(type) || []) {
      listener(type === "message" ? { data } : data);
    }
  }
}

const workers = [];
const diagnostics = [];
const client = new ModelWorkerClient({
  workerUrl: new URL("https://example.invalid/modelWorker.js"),
  workerFactory: () => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  },
  onTransferDiagnostics: (value) => diagnostics.push(value)
});

const first = client.execute("build", { params: { resolution: 32 } }, null);
assert.equal(workers.length, 1);
assert.equal(workers[0].messages[0].op, "build");
workers[0].emit("message", {
  id: workers[0].messages[0].id,
  ok: true,
  model: { n: 32 },
  transferDiagnostics: { mode: "test", bufferCount: 2, totalBytes: 128 }
});
assert.deepEqual(await first, { n: 32 });
assert.equal(diagnostics[0].totalBytes, 128);

const interrupted = client.execute("run", { model: { n: 32 } }, null);
workers[0].emit("error", { message: "synthetic crash", preventDefault() {} });
await assert.rejects(interrupted, /synthetic crash/);
assert.equal(workers[0].terminated, true);

const recovered = client.execute("build", { params: { resolution: 64 } }, "http://127.0.0.1:1");
assert.equal(workers.length, 2);
workers[1].emit("message", {
  id: workers[1].messages[0].id,
  ok: true,
  model: { n: 64 },
  transferDiagnostics: { mode: "test", bufferCount: 1, totalBytes: 64 }
});
assert.deepEqual(await recovered, { n: 64 });

const malformed = client.execute("run", { model: { n: 64 } }, null);
workers[1].emit("messageerror");
await assert.rejects(malformed, /unreadable message/);
assert.equal(workers[1].terminated, true);
client.dispose();

const disposableWorker = new FakeWorker();
const disposableClient = new ModelWorkerClient({
  workerUrl: new URL("https://example.invalid/modelWorker.js"),
  workerFactory: () => disposableWorker
});
const disposedRequest = disposableClient.execute("build", { params: {} }, null);
disposableClient.dispose();
await assert.rejects(disposedRequest, (error) => error.name === "AbortError");
assert.equal(disposableWorker.terminated, true);

let attempts = 0;
const retryable = createRetryableAsyncResource(async () => {
  attempts += 1;
  if (attempts === 1) throw new Error("temporary load failure");
  return { ready: true };
});
await assert.rejects(retryable(), /temporary load failure/);
assert.deepEqual(await retryable(), { ready: true });
assert.equal(attempts, 2);

console.log("model Worker recovery tests passed");
