import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRustWasmKernel, WATER_MARINE, WATER_RIVER } from "../src/wasmAbi.js";
import { aquaticContext, aquaticSite, classifyWaterCellsFallback, setAquaticConnectivityKernel } from "../src/aquaticHabitats.js";
import { buildLandscapeBlockNetwork, buildWildlifeState } from "../src/landscapeEcology.js";

const bytes = await readFile(new URL("../vendor/geolab/geolab_core.wasm", import.meta.url));
const kernel = await createRustWasmKernel(bytes);

// Independent copy of the pre-migration JavaScript algorithm, including its Set representation.
function legacyConnectivity({ width, height, seaLevel, elevation, riverNodes }) {
  const count = width * height, marine = new Uint8Array(count), queue = new Uint32Array(count);
  let head = 0, tail = 0;
  const visit = index => {
    if (!marine[index] && elevation[index] < seaLevel) {
      marine[index] = 1;
      queue[tail++] = index;
    }
  };
  for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
  while (head < tail) {
    const index = queue[head++], x = index % width;
    if (x) visit(index - 1);
    if (x < width - 1) visit(index + 1);
    if (index >= width) visit(index - width);
    if (index < count - width) visit(index + width);
  }
  return { marine, rivers: new Set(riverNodes) };
}

function fixture(width, height, seed = 17) {
  let state = seed >>> 0;
  const elevation = Float32Array.from({ length: width * height }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state / 4294967296 - 0.62) * 200;
  });
  return { width, height, elevation, seaLevel: 0, riverNodes: new Uint32Array([0, elevation.length - 1]) };
}

for (const [width, height] of [[1, 1], [1, 25], [31, 1], [5, 7], [32, 32], [64, 48], [257, 129]]) {
  for (const seed of [1, 29, 404]) {
    const input = fixture(width, height, seed), before = structuredClone(input);
    const legacy = legacyConnectivity(input);
    const expected = Uint8Array.from(legacy.marine, (marine, index) => marine | (legacy.rivers.has(index) ? WATER_RIVER : 0));
    assert.deepEqual(kernel.waterContext(input), expected, `Rust parity: ${width}x${height}, seed ${seed}`);
    assert.deepEqual(classifyWaterCellsFallback(input), expected, "fallback parity");
    assert.deepEqual(input, before, "kernel must not mutate model-owned input arrays");
  }
}

const isolated = { width: 5, height: 5, seaLevel: 0, elevation: new Float32Array(25).fill(10), riverNodes: new Uint32Array([0, 7, 7, 8]) };
isolated.elevation[0] = isolated.elevation[6] = isolated.elevation[12] = -1;
const closed = kernel.waterContext(isolated);
assert.equal(closed[0], WATER_MARINE | WATER_RIVER);
assert.equal(closed[6], 0, "diagonal connectivity is not marine connectivity");
assert.equal(closed[12], 0, "closed depressions are not ocean");
isolated.elevation[1] = -1;
assert.equal(kernel.waterContext(isolated)[6], WATER_MARINE, "in-place terrain changes must be recomputed");
assert.equal(closed[6], 0, "returned arrays must survive later WASM allocations");
isolated.elevation[1] = 10;
assert.equal(kernel.waterContext(isolated)[6], 0, "closing a connection must remove seawater");
assert.equal(kernel.waterContext({ ...fixture(1, 1), elevation: new Float32Array([1]), seaLevel: 1 + Number.EPSILON })[0], 3);
assert.equal(kernel.waterContext({ ...fixture(1, 1), elevation: new Float32Array([1]), seaLevel: 1 })[0], 2);

for (const change of [
  { width: 0 }, { width: 1.5 }, { width: 4097 }, { height: -1 },
  { seaLevel: NaN }, { seaLevel: Infinity },
  { elevation: new Float32Array(3) }, { elevation: new Float64Array(4) },
  { elevation: new Float32Array([0, 0, NaN, 0]) },
  { elevation: new Float32Array([0, 0, Infinity, 0]) },
  { riverNodes: new Uint32Array([4]) }, { riverNodes: new Uint32Array(9) }
]) {
  for (const run of [kernel.waterContext, classifyWaterCellsFallback]) assert.throws(() => run({ ...fixture(2, 2), ...change }));
}

const model = {
  n: 9, sizeKm: 8, areaKm2: 64, cellSizeKm: 1,
  height: new Float32Array(81).fill(20), temperature: new Float32Array(81).fill(15),
  riverSegments: [{ from: 31, to: 40 }],
  hydraulics: { channelDepthM: new Float32Array(81).fill(1), channelWidthM: new Float32Array(81).fill(80) }
};
for (let y = 0; y < 9; y++) for (let x = 0; x < 3; x++) model.height[y * 9 + x] = -10;
const params = { seaLevel: 0, wildlifeMaxAgents: 40 };
const fallbackNetwork = buildLandscapeBlockNetwork(model, params, { gridSize: 4 });
setAquaticConnectivityKernel(kernel.waterContext);
try {
  const network = buildLandscapeBlockNetwork(model, params, { gridSize: 4 });
  assert.equal(network.summary.waterConnectivity.backend, "rust-wasm");
  assert.equal(network.summary.waterConnectivity.fallbackReason, null);
  assert.deepEqual(network.blocks, fallbackNetwork.blocks);
  assert.deepEqual(network.links, fallbackNetwork.links);
  assert.deepEqual(buildWildlifeState(model, params, network), buildWildlifeState(model, params, fallbackNetwork));
  const context = aquaticContext(model, params);
  for (const index of [-1, 81, NaN, 0.1]) assert.equal(aquaticSite(model, context, index), null);
  for (const index of [-1, 1.5, 81, 4294967296]) {
    assert.throws(() => aquaticContext({ ...model, riverSegments: [{ from: index, to: 40 }] }, params), /endpoint/);
  }
  assert.throws(() => aquaticContext(model, { seaSalinityPSU: NaN }), /salinity/);
  assert.equal(aquaticSite({ ...model, cellSizeKm: 0 }, context, 0), null);
  assert.equal(aquaticSite({ ...model, hydraulics: { ...model.hydraulics, channelDepthM: new Float32Array(81).fill(Infinity) } }, context, 31), null);
  setAquaticConnectivityKernel(() => { throw new Error("kernel unavailable in test"); });
  const recovered = aquaticContext(model, params);
  assert.equal(recovered.diagnostics.backend, "typescript-fallback");
  assert.equal(recovered.diagnostics.fallbackReason, "kernel unavailable in test");
  assert.deepEqual(recovered.flags, context.flags);
  setAquaticConnectivityKernel(() => new Uint8Array(1));
  assert.equal(aquaticContext(model, params).diagnostics.backend, "typescript-fallback");
} finally {
  setAquaticConnectivityKernel(null);
}

// Exercise the exported allocator/deallocator pair independently of the typed bridge.
const { instance } = await WebAssembly.instantiate(bytes, {});
const raw = instance.exports;
assert.equal(raw.geolab_alloc_words(0), 0);
assert.equal(raw.geolab_alloc_words(4096 * 4096 * 3 + 1), 0);
function rawCall(invalid = false) {
  const words = 128 * 128, pointer = raw.geolab_alloc_words(words);
  try {
    new Float32Array(raw.memory.buffer, pointer, words).fill(invalid ? NaN : -1);
    const packed = raw.geolab_water_context_f32(pointer, words, 128, 128, 0);
    if (invalid) { assert.equal(packed, 0n); return; }
    const address = Number(packed & 0xffffffffn), length = Number(packed >> 32n);
    assert.equal(length, words);
    try { assert.ok(new Uint8Array(raw.memory.buffer, address, length).every(value => value === 1)); }
    finally { raw.geolab_dealloc(address, length); }
  } finally { raw.geolab_dealloc_words(pointer, words); }
}
for (let i = 0; i < 8; i++) rawCall(i % 2 === 0);
const memoryBytes = raw.memory.buffer.byteLength;
for (let i = 0; i < 100; i++) rawCall(i % 2 === 0);
assert.equal(raw.memory.buffer.byteLength, memoryBytes, "repeated successful and rejected calls must release allocations");

const maximum = { width: 4096, height: 4096, seaLevel: 0, elevation: new Float32Array(4096 * 4096).fill(-1), riverNodes: new Uint32Array([0, 4096 * 4096 - 1]) };
const maximumFlags = kernel.waterContext(maximum);
assert.equal(maximumFlags.length, 16777216);
assert.ok(maximumFlags.every(value => (value & WATER_MARINE) !== 0), "the full 4096x4096 grid must be classified");
assert.equal(maximumFlags.at(-1), 3);
console.log("Aquatic Rust/TypeScript/legacy parity, block and wildlife integration, validation, allocation lifetime and 4096x4096 tests passed");

if (process.argv.includes("--benchmark")) {
  const rows = [];
  const medianMs = run => {
    for (let i = 0; i < 4; i++) run();
    const times = [];
    for (let i = 0; i < 9; i++) { const start = performance.now(); run(); times.push(performance.now() - start); }
    return times.sort((a, b) => a - b)[4];
  };
  for (const [n, surface] of [[256, "marine"], [1024, "marine"], [4096, "marine"], [1024, "dry"], [1024, "mixed"]]) {
    const input = n === 4096 ? maximum : fixture(n, n);
    if (surface !== "mixed") input.elevation.fill(surface === "marine" ? -1 : 1);
    const legacyMs = medianMs(() => legacyConnectivity(input));
    const rustMs = medianMs(() => kernel.waterContext(input));
    rows.push({ grid: n, surface, legacyMs: +legacyMs.toFixed(2), rustMs: +rustMs.toFixed(2), speedup: +(legacyMs / rustMs).toFixed(2) });
  }
  console.log(JSON.stringify({ workload: "marine, dry and seeded mixed grids; prepared typed arrays; Rust includes ABI input/output copies and validation; excludes terrain/rendering", node: process.version, rows }, null, 2));
}
