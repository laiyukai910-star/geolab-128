// Generated from src-ts/backendClient.ts. Run npm run browser:build to regenerate.
const API_VERSION = "1.0";
const DEFAULT_AUDIT_RESOLUTION = 96;
const REQUEST_TIMEOUT_MS = 35e3;
function configuredBackendUrl(locationLike = globalThis.location) {
  const raw = new URLSearchParams(locationLike?.search || "").get("backend");
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    if (url.protocol !== "http:" || !loopback || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}
async function inspectBackend(endpoint, fetchImpl = globalThis.fetch, options = {}) {
  if (!endpoint) {
    const capabilities2 = asRecord(await (options.kernelTransport || defaultKernelTransport()).capabilities());
    assertApiCompatibility(capabilities2);
    return {
      status: "ready",
      endpoint: null,
      transport: "browser-wasm",
      health: { status: "ready", engine: capabilities2.engine, apiVersion: capabilities2.apiVersion },
      capabilities: capabilities2
    };
  }
  const [health, capabilities] = await Promise.all([
    requestJson(`${endpoint}/health`, {}, fetchImpl, 3e3),
    requestJson(`${endpoint}/v1/capabilities`, {}, fetchImpl, 3e3)
  ]);
  assertApiCompatibility(health);
  assertApiCompatibility(capabilities);
  return { status: "ready", endpoint, transport: "native-sidecar", health, capabilities };
}
async function runBackendVerification(model, params, endpoint, options = {}) {
  const request = buildBackendScenario(model, params, options);
  const startedAt = performance.now();
  const envelope = endpoint ? await requestJson(`${endpoint}/v1/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request)
  }, options.fetchImpl || globalThis.fetch) : asSimulationEnvelope(await (options.kernelTransport || defaultKernelTransport()).simulate(request));
  const report = envelope.report;
  if (!report || report.apiVersion !== API_VERSION || report.engine !== "geolab-core-rust") {
    throw new Error("Rust kernel returned an incompatible simulation envelope");
  }
  return {
    type: "geolab-rust-kernel-verification",
    schemaVersion: "1.1.0",
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    endpoint,
    transport: endpoint ? "native-sidecar" : "browser-wasm",
    requestId: envelope.requestId,
    durationMs: performance.now() - startedAt,
    sample: {
      sourceResolution: model.n,
      auditResolution: request.grid.width,
      pointSpacingM: request.grid.pointSpacingM,
      cellSupportAreaM2: request.grid.cellSupportAreaM2,
      includedLayers: request.includeLayers
    },
    comparison: buildComparison(model, report),
    report
  };
}
function buildBackendScenario(model, params = {}, options = {}) {
  if (!model?.height?.length || !model.n) throw new Error("A completed GeoLab model is required");
  const resolution = clampInteger(
    options.resolution ?? Math.min(DEFAULT_AUDIT_RESOLUTION, model.n),
    3,
    Math.min(clampInteger(options.maximumResolution ?? 512, 3, 1024), model.n)
  );
  const mapSizeM = finite(model.sizeKm, finite(params.mapSizeKm, 128)) * 1e3;
  const sample = (values, fallback, minimum, maximum) => sampleLayer(
    values,
    model.n,
    resolution,
    fallback,
    minimum,
    maximum
  );
  return {
    apiVersion: API_VERSION,
    scenarioId: `geolab-${Math.round(mapSizeM / 1e3)}km-${Math.round(finite(params.seed, 0))}-${Math.round(finite(params.currentYear, 0))}`,
    grid: {
      width: resolution,
      height: resolution,
      pointSpacingM: mapSizeM / Math.max(1, resolution - 1),
      cellSupportAreaM2: mapSizeM * mapSizeM / (resolution * resolution),
      elevationM: sample(model.height, 0, -12e3, 1e4)
    },
    climate: {
      annualPrecipitationMm: sample(model.precipitation, 900, 0, 15e3),
      meanTemperatureC: sample(model.temperature, finite(params.baseTemperature, 15), -80, 65),
      relativeHumidityFraction: clamp(finite(params.humidity, 0.65), 0.01, 1),
      windSpeedMS: clamp(finite(params.windSpeed, 2), 0, 100),
      latitudeDegrees: clamp(finite(params.latitude, 0), -90, 90),
      dayOfYear: clampInteger(params.dayOfYear ?? 183, 1, 366)
    },
    surface: {
      curveNumber: sample(model.surface?.curveNumber, 75, 30, 100),
      hydraulicConductivityMmH: sample(model.surface?.hydraulicConductivityMmHr, 12, 0, 2e3),
      availableWaterCapacityMm: sample(model.surface?.availableWaterCapacityMm, 120, 0, 1e3),
      imperviousFraction: sample(model.surface?.imperviousFraction, 0, 0, 1),
      vegetationFraction: sample(model.surface?.vegetation, 0.35, 0, 1)
    },
    management: {
      irrigationMm: sample(model.infrastructureInfluence?.irrigationMm, 0, 0, 5e3),
      requestedDemandMm: sample(model.infrastructureInfluence?.waterDemandMm, 0, 0, 1e4),
      runoffRetentionFraction: sample(model.infrastructureInfluence?.flowRetention, 0, 0, 0.95).map((value) => value * 0.78)
    },
    routing: { method: "multiple-flow-direction", mfdExponent: 1.1 },
    subsurface: buildSubsurfaceInput(model, resolution, sample),
    geomorphology: {
      soilErodibilityFactor: [],
      supportPracticeFactor: [],
      rainfallErosivityMjMmHaHYear: null,
      transportCapacityCoefficient: 0.035
    },
    ecology: {
      barrierFraction: sample(model.infrastructureInfluence?.buildingDensity, 0, 0, 1),
      preferredTemperatureC: 15,
      temperatureToleranceC: 16,
      preferredMoistureIndex: 0.85,
      moistureTolerance: 0.7,
      maximumSlopeDegrees: 38,
      habitatThreshold: 0.55
    },
    control: { durationDays: 365, timestepDays: 30 },
    output: { authoritativeSurfaceLayers: Boolean(options.authoritativeSurfaceLayers) },
    includeLayers: Boolean(options.includeLayers)
  };
}
function buildSubsurfaceInput(model, targetResolution, sampleSurface) {
  const soilDepthM = sampleSurface(model.surface?.rootDepthM, 1, 0.05, 100);
  const volume = model.subsurface;
  const sourceResolution = clampInteger(volume?.gridN, 1, 4096);
  const expectedLength = sourceResolution * sourceResolution;
  const hasColumns = volume?.columnBedrockDepthM?.length === expectedLength && volume?.columnWaterTableDepthM?.length === expectedLength;
  if (!hasColumns) {
    return {
      soilDepthM,
      aquiferThicknessM: [],
      specificYieldFraction: [],
      initialStorageFraction: [],
      annualBaseflowRecessionFraction: 0.22
    };
  }
  const bedrockDepthM = sampleLayer(
    volume.columnBedrockDepthM,
    sourceResolution,
    targetResolution,
    finite(volume.depthM, 40) * 0.65,
    0.1,
    5e3
  );
  const waterTableDepthM = sampleLayer(
    volume.columnWaterTableDepthM,
    sourceResolution,
    targetResolution,
    finite(volume.depthM, 40) * 0.5,
    0,
    5e3
  );
  const aquiferThicknessM = bedrockDepthM.map(
    (depth, index) => clamp(depth - soilDepthM[index], 0.1, 5e3)
  );
  const initialStorageFraction = aquiferThicknessM.map(
    (thickness, index) => clamp(1 - Math.max(0, waterTableDepthM[index] - soilDepthM[index]) / Math.max(0.1, thickness), 0, 1)
  );
  return {
    soilDepthM,
    aquiferThicknessM,
    specificYieldFraction: [],
    initialStorageFraction,
    annualBaseflowRecessionFraction: 0.22
  };
}
function sampleLayer(values, sourceResolution, targetResolution, fallback, minimum, maximum) {
  const output = new Array(targetResolution * targetResolution);
  let cursor = 0;
  for (let y = 0; y < targetResolution; y += 1) {
    const sourceY = y / Math.max(1, targetResolution - 1) * (sourceResolution - 1);
    for (let x = 0; x < targetResolution; x += 1) {
      const sourceX = x / Math.max(1, targetResolution - 1) * (sourceResolution - 1);
      output[cursor] = clamp(bilinear(values, sourceResolution, sourceX, sourceY, fallback), minimum, maximum);
      cursor += 1;
    }
  }
  return output;
}
function bilinear(values, resolution, x, y, fallback) {
  if (!values?.length) return fallback;
  const x0 = clampInteger(Math.floor(x), 0, resolution - 1);
  const y0 = clampInteger(Math.floor(y), 0, resolution - 1);
  const x1 = Math.min(resolution - 1, x0 + 1);
  const y1 = Math.min(resolution - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const a = finite(values[y0 * resolution + x0], fallback);
  const b = finite(values[y0 * resolution + x1], a);
  const c = finite(values[y1 * resolution + x0], a);
  const d = finite(values[y1 * resolution + x1], c);
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}
function buildComparison(model, report) {
  const rustWater = report.waterBudget;
  const browserWater = model.stats?.waterBudget;
  return {
    interpretation: "Independent-kernel comparison on a bounded resample using Priority-Flood and MFD routing.",
    browserProcessIntegrityIndex: finite(model.physicalCoupling?.summary?.processIntegrityIndex, null),
    rustProcessIntegrityIndex: finite(report.summary.processIntegrityIndex, null),
    browserWaterResidualPercent: finite(browserWater?.residualPctOfInput, null),
    rustWaterResidualPercent: finite(rustWater.residualPercentOfInput, null),
    browserMeanReferenceEtMm: finite(model.stats?.meanPotentialEvapotranspiration, null),
    rustMeanReferenceEtMm: finite(report.summary.meanReferenceEvapotranspirationMm, null),
    browserMeanWaterTableDepthM: finite(model.stats?.subsurface?.meanWaterTableDepthM, null),
    rustMeanWaterTableDepthM: finite(report.subsurfaceBudget.meanWaterTableDepthM, null),
    rustGroundwaterResidualPercent: finite(report.subsurfaceBudget.residualPercentOfInput, null),
    rustSedimentResidualPercent: finite(report.sedimentBudget.residualPercentOfDetachment, null),
    browserHabitatConnectivity: finite(model.stats?.landscapeNetwork?.meanConnectivity, null),
    rustHabitatConnectivity: finite(report.ecology.meanResistanceConnectivity, null)
  };
}
class WorkerKernelTransport {
  worker = null;
  workerFactory;
  pending = /* @__PURE__ */ new Map();
  sequence = 0;
  constructor(workerFactory) {
    if (!workerFactory && typeof Worker !== "function") throw new Error("Web Workers are unavailable in this runtime");
    this.workerFactory = workerFactory || (() => new Worker(
      new URL("./rustKernelWorker.js", import.meta.url),
      { type: "module", name: "geolab-rust-wasm" }
    ));
    this.ensureWorker();
  }
  capabilities() {
    return this.request({ kind: "capabilities" });
  }
  simulate(scenario) {
    return this.request({ kind: "simulate", scenario });
  }
  request(request) {
    const id = (++this.sequence).toString(36);
    const worker = this.ensureWorker();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        const error = new Error("Rust WASM worker request timed out");
        reject(error);
        this.invalidateWorker(worker, error);
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      try {
        worker.postMessage({ id, ...request });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
  ensureWorker() {
    if (this.worker) return this.worker;
    const worker = this.workerFactory();
    this.worker = worker;
    worker.addEventListener("message", (event) => {
      if (worker === this.worker) this.handleMessage(event.data);
    });
    worker.addEventListener("error", (event) => {
      event.preventDefault?.();
      this.invalidateWorker(worker, new Error(event.message || "Rust WASM worker failed"));
    });
    worker.addEventListener("messageerror", () => {
      this.invalidateWorker(worker, new Error("Rust WASM worker returned an unreadable message"));
    });
    return worker;
  }
  handleMessage(response) {
    const pending = this.pending.get(response.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(response.id);
    if (response.ok) pending.resolve(response.payload);
    else pending.reject(new Error(response.error));
  }
  invalidateWorker(worker, error) {
    if (worker !== this.worker) return;
    worker.terminate();
    this.worker = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
let sharedKernelTransport = null;
function defaultKernelTransport() {
  sharedKernelTransport ||= new WorkerKernelTransport();
  return sharedKernelTransport;
}
async function requestJson(url, init, fetchImpl, timeoutMs = REQUEST_TIMEOUT_MS) {
  if (typeof fetchImpl !== "function") throw new Error("Fetch is unavailable in this runtime");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const body = asRecord(payload);
      throw new Error(typeof body.message === "string" ? body.message : `Rust backend request failed with HTTP ${response.status}`);
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}
function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Rust kernel returned an invalid object");
  return value;
}
function asSimulationEnvelope(value) {
  const envelope = asRecord(value);
  const report = asRecord(envelope.report);
  if (typeof envelope.requestId !== "string") throw new Error("Rust kernel returned no request identifier");
  return { requestId: envelope.requestId, report };
}
function assertApiCompatibility(value) {
  if (value.apiVersion !== API_VERSION) throw new Error(`Rust kernel API mismatch: expected ${API_VERSION}`);
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
function clampInteger(value, minimum, maximum) {
  return Math.round(clamp(finite(value, minimum), minimum, maximum));
}
export {
  WorkerKernelTransport,
  buildBackendScenario,
  configuredBackendUrl,
  inspectBackend,
  runBackendVerification
};
