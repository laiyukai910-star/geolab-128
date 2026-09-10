export interface RustCapabilities {
  apiVersion: string;
  engine: string;
  maxApiCells: number;
  maxCoreCells: number;
  routing: string[];
  processes: string[];
  outputLayers: string[];
}

export interface RustSimulationReport {
  apiVersion: string;
  engine: string;
  [key: string]: unknown;
}

export interface RustSimulationEnvelope {
  report: RustSimulationReport;
}

interface RustErrorBody {
  code: string;
  message: string;
  field: string | null;
}

interface RustWasmExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  geolab_alloc(length: number): number;
  geolab_dealloc(pointer: number, length: number): void;
  geolab_capabilities_json(): bigint;
  geolab_simulate_json(pointer: number, length: number): bigint;
}

interface RustWireEnvelope {
  report?: RustSimulationReport;
  error?: RustErrorBody;
}

export interface RustWasmKernel {
  capabilities(): RustCapabilities;
  simulate(scenario: unknown): RustSimulationEnvelope;
  waterContext(input: WaterConnectivityInput): Uint8Array;
}

export const MAX_WATER_AXIS = 4096;
export const WATER_MARINE = 1;
export const WATER_RIVER = 2;

export interface WaterConnectivityInput {
  width: number;
  height: number;
  seaLevel: number;
  elevation: Float32Array;
  riverNodes: Uint32Array;
}

interface WaterWasmExports extends RustWasmExports {
  geolab_alloc_words(length: number): number;
  geolab_dealloc_words(pointer: number, length: number): void;
  geolab_water_context_f32(pointer: number, words: number, width: number, height: number, seaLevel: number): bigint;
}

export function validateWaterInput(input: WaterConnectivityInput): number {
  const { width, height, seaLevel, elevation, riverNodes } = input;
  if (![width, height].every(value => Number.isInteger(value) && value > 0 && value <= MAX_WATER_AXIS)) {
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

export async function createRustWasmKernel(moduleBytes: BufferSource): Promise<RustWasmKernel> {
  const module = await WebAssembly.compile(moduleBytes);
  const instance = await WebAssembly.instantiate(module, {});
  const exports = validateExports(instance.exports);
  return {
    capabilities: () => invokeJson<RustCapabilities>(exports, "geolab_capabilities_json"),
    simulate: (scenario: unknown) => {
      const envelope = invokeJson<RustWireEnvelope>(exports, "geolab_simulate_json", scenario);
      if (envelope.error) {
        const field = envelope.error.field ? ` (${envelope.error.field})` : "";
        throw new Error(`${envelope.error.code}${field}: ${envelope.error.message}`);
      }
      if (!envelope.report) throw new Error("Rust WASM returned no simulation report");
      return { report: envelope.report };
    },
    waterContext: input => invokeWaterContext(exports, input)
  };
}

function invokeWaterContext(base: RustWasmExports, input: WaterConnectivityInput): Uint8Array {
  const count = validateWaterInput(input);
  const exports = base as WaterWasmExports;
  if ([exports.geolab_alloc_words, exports.geolab_dealloc_words, exports.geolab_water_context_f32]
    .some(value => typeof value !== "function")) {
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
    outputPointer = Number(packed & 0xffff_ffffn);
    outputLength = Number(packed >> 32n);
    if (!outputPointer || outputLength !== count) {
      throw new Error("Rust water kernel rejected the grid: elevations must be finite");
    }
    // The kernel can grow memory. Acquire the view after execution and copy before freeing.
    return new Uint8Array(exports.memory.buffer, outputPointer, outputLength).slice();
  } finally {
    if (outputPointer && outputLength) exports.geolab_dealloc(outputPointer, outputLength);
    exports.geolab_dealloc_words(pointer, words);
  }
}

function validateExports(exports: WebAssembly.Exports): RustWasmExports {
  const candidate = exports as unknown as Partial<RustWasmExports>;
  const functions = [
    candidate.geolab_alloc,
    candidate.geolab_dealloc,
    candidate.geolab_capabilities_json,
    candidate.geolab_simulate_json
  ];
  if (!(candidate.memory instanceof WebAssembly.Memory) || functions.some((value) => typeof value !== "function")) {
    throw new Error("GeoLab Rust WASM exports do not match ABI version 1");
  }
  return candidate as RustWasmExports;
}

function invokeJson<T>(
  exports: RustWasmExports,
  operation: "geolab_capabilities_json" | "geolab_simulate_json",
  input?: unknown
): T {
  let inputPointer = 0;
  let inputLength = 0;
  try {
    let packed: bigint;
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
    return decodePackedJson<T>(exports, packed);
  } finally {
    if (inputPointer && inputLength) exports.geolab_dealloc(inputPointer, inputLength);
  }
}

function decodePackedJson<T>(exports: RustWasmExports, packed: bigint): T {
  const pointer = Number(packed & 0xffff_ffffn);
  const length = Number(packed >> 32n);
  if (!pointer || !length) throw new Error("Rust WASM returned an empty ABI response");
  try {
    const bytes = new Uint8Array(exports.memory.buffer, pointer, length);
    return JSON.parse(decoder.decode(bytes)) as T;
  } finally {
    exports.geolab_dealloc(pointer, length);
  }
}
