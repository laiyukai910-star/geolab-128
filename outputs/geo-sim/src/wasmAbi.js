// Generated from src-ts/wasmAbi.ts. Run npm run browser:build to regenerate.
const MAX_WATER_AXIS = 4096;
const WATER_MARINE = 1;
const WATER_RIVER = 2;
function validateWaterInput(input) {
  const { width, height, seaLevel, elevation, riverNodes } = input;
  if (![width, height].every((value) => Number.isInteger(value) && value > 0 && value <= MAX_WATER_AXIS)) {
    throw new RangeError("Water grid axes must be integers between 1 and 4096");
  }
  const count = width * height;
  if (!(elevation instanceof Float32Array) || elevation.length !== count || !Number.isFinite(seaLevel)) {
    throw new RangeError("Water grid requires matching Float32 elevations and a finite sea level");
  }
  if (!(riverNodes instanceof Uint32Array) || riverNodes.length > count * 2) {
    throw new RangeError("Water grid requires at most two Uint32 river endpoints per cell");
  }
  for (const index of riverNodes) {
    if (index >= count) throw new RangeError("River endpoint is outside the water grid");
  }
  return count;
}
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
    },
    waterContext: (input) => invokeWaterContext(exports, input)
  };
}
function invokeWaterContext(base, input) {
  const count = validateWaterInput(input);
  const exports = base;
  if ([exports.geolab_alloc_words, exports.geolab_dealloc_words, exports.geolab_water_context_f32].some((value) => typeof value !== "function")) {
    throw new Error("Bundled Rust WASM does not expose the binary water kernel");
  }
  const words = count + input.riverNodes.length;
  const pointer = exports.geolab_alloc_words(words);
  if (!pointer) throw new Error("Rust WASM could not allocate water grid memory");
  let outputPointer = 0;
  let outputLength = 0;
  try {
    new Float32Array(exports.memory.buffer, pointer, count).set(input.elevation);
    new Uint32Array(exports.memory.buffer, pointer + count * 4, input.riverNodes.length).set(input.riverNodes);
    const packed = exports.geolab_water_context_f32(pointer, words, input.width, input.height, input.seaLevel);
    outputPointer = Number(packed & 0xffffffffn);
    outputLength = Number(packed >> 32n);
    if (!outputPointer || outputLength !== count) {
      throw new Error("Rust water kernel rejected the grid: elevations must be finite");
    }
    return new Uint8Array(exports.memory.buffer, outputPointer, outputLength).slice();
  } finally {
    if (outputPointer && outputLength) exports.geolab_dealloc(outputPointer, outputLength);
    exports.geolab_dealloc_words(pointer, words);
  }
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
  MAX_WATER_AXIS,
  WATER_MARINE,
  WATER_RIVER,
  createRustWasmKernel,
  validateWaterInput
};
