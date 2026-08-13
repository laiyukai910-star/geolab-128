// Generated from src-ts/wasmAbi.ts. Run npm run browser:build to regenerate.
const decoder = new TextDecoder();
const encoder = new TextEncoder();
async function createRustWasmKernel(moduleBytes) {
  const module = await WebAssembly.compile(moduleBytes);
  const instance = await WebAssembly.instantiate(module, {});
  const exports = validateExports(instance.exports);
  return {
    capabilities: () => invokeJson(exports, "geolab_capabilities_json"),
    simulate: (scenario) => {
      const envelope = invokeJson(exports, "geolab_simulate_json", scenario);
      if (envelope.error) {
        const field = envelope.error.field ? ` (${envelope.error.field})` : "";
        throw new Error(`${envelope.error.code}${field}: ${envelope.error.message}`);
      }
      if (!envelope.report) throw new Error("Rust WASM returned no simulation report");
      return { report: envelope.report };
    }
  };
}
function validateExports(exports) {
  const candidate = exports;
  const functions = [
    candidate.geolab_alloc,
    candidate.geolab_dealloc,
    candidate.geolab_capabilities_json,
    candidate.geolab_simulate_json
  ];
  if (!(candidate.memory instanceof WebAssembly.Memory) || functions.some((value) => typeof value !== "function")) {
    throw new Error("GeoLab Rust WASM exports do not match ABI version 1");
  }
  return candidate;
}
function invokeJson(exports, operation, input) {
  let inputPointer = 0;
  let inputLength = 0;
  try {
    let packed;
    if (operation === "geolab_simulate_json") {
      const bytes = encoder.encode(JSON.stringify(input));
      inputLength = bytes.byteLength;
      inputPointer = exports.geolab_alloc(inputLength);
      if (!inputPointer && inputLength > 0) throw new Error("Rust WASM could not allocate scenario memory");
      new Uint8Array(exports.memory.buffer, inputPointer, inputLength).set(bytes);
      packed = exports.geolab_simulate_json(inputPointer, inputLength);
    } else {
      packed = exports.geolab_capabilities_json();
    }
    return decodePackedJson(exports, packed);
  } finally {
    if (inputPointer && inputLength) exports.geolab_dealloc(inputPointer, inputLength);
  }
}
function decodePackedJson(exports, packed) {
  const pointer = Number(packed & 0xffffffffn);
  const length = Number(packed >> 32n);
  if (!pointer || !length) throw new Error("Rust WASM returned an empty ABI response");
  try {
    const bytes = new Uint8Array(exports.memory.buffer, pointer, length);
    return JSON.parse(decoder.decode(bytes));
  } finally {
    exports.geolab_dealloc(pointer, length);
  }
}
export {
  createRustWasmKernel
};
