import { buildModel, erodeModel, runModel, updateTemporalModel } from "./geoEngine.js";

function collectTransferableBuffers(value) {
  const visited = new WeakSet();
  const buffers = new Set();
  const visit = (entry) => {
    if (!entry || typeof entry !== "object") return;
    if (ArrayBuffer.isView(entry)) {
      if (entry.buffer) buffers.add(entry.buffer);
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

self.addEventListener("message", (event) => {
  const { id, op, params, model, passes } = event.data || {};
  try {
    let result = null;
    if (op === "build") {
      result = buildModel(params);
    } else if (op === "run") {
      result = runModel(model, params);
    } else if (op === "temporal") {
      result = updateTemporalModel(model, params);
    } else if (op === "erode") {
      result = erodeModel(model, params, passes || 4);
    } else {
      throw new Error(`Unknown worker operation: ${op}`);
    }
    const transferList = collectTransferableBuffers(result);
    self.postMessage({
      id,
      ok: true,
      model: result,
      transferDiagnostics: {
        mode: "transferable-zero-copy-return",
        bufferCount: transferList.length,
        totalBytes: transferList.reduce((sum, buffer) => sum + buffer.byteLength, 0)
      }
    }, transferList);
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error?.message || String(error)
    });
  }
});
