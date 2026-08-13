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
    }
  };
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
