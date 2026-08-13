const API_VERSION = "1.0";
const DEFAULT_AUDIT_RESOLUTION = 96;
const REQUEST_TIMEOUT_MS = 35_000;

type NumericLayer = ArrayLike<number> | null | undefined;
type FetchResponse = { ok: boolean; status: number; json(): Promise<unknown> };
type FetchLike = (url: string, init?: RequestInit) => Promise<FetchResponse>;

interface GeoModel {
  n: number;
  sizeKm?: number;
  height: ArrayLike<number>;
  precipitation?: NumericLayer;
  temperature?: NumericLayer;
  surface?: {
    curveNumber?: NumericLayer;
    hydraulicConductivityMmHr?: NumericLayer;
    availableWaterCapacityMm?: NumericLayer;
    imperviousFraction?: NumericLayer;
    vegetation?: NumericLayer;
    rootDepthM?: NumericLayer;
  };
  infrastructureInfluence?: {
    irrigationMm?: NumericLayer;
    waterDemandMm?: NumericLayer;
    buildingDensity?: NumericLayer;
  };
  subsurface?: {
    gridN?: number;
    depthM?: number;
    columnBedrockDepthM?: NumericLayer;
    columnWaterTableDepthM?: NumericLayer;
  };
  stats?: {
    waterBudget?: { residualPctOfInput?: number };
    meanPotentialEvapotranspiration?: number;
    subsurface?: { meanWaterTableDepthM?: number };
    landscapeNetwork?: { meanConnectivity?: number };
  };
  physicalCoupling?: { summary?: { processIntegrityIndex?: number } };
}

interface ScenarioParams {
  mapSizeKm?: number;
  seed?: number;
  currentYear?: number;
  baseTemperature?: number;
  humidity?: number;
  windSpeed?: number;
  latitude?: number;
  dayOfYear?: number;
}

interface BackendOptions {
  resolution?: number;
  includeLayers?: boolean;
  fetchImpl?: FetchLike;
  kernelTransport?: KernelTransport;
}

interface KernelTransport {
  capabilities(): Promise<unknown>;
  simulate(scenario: BackendScenario): Promise<unknown>;
}

interface BackendState {
  status: "ready" | "unavailable";
  endpoint: string | null;
  transport: "native-sidecar" | "browser-wasm" | null;
  health: Record<string, unknown> | null;
  capabilities: Record<string, unknown> | null;
}

interface BackendScenario {
  apiVersion: string;
  scenarioId: string;
  grid: {
    width: number;
    height: number;
    pointSpacingM: number;
    cellSupportAreaM2: number;
    elevationM: number[];
  };
  climate: Record<string, unknown>;
  surface: Record<string, unknown>;
  management: Record<string, unknown>;
  routing: Record<string, unknown>;
  subsurface: Record<string, unknown>;
  geomorphology: Record<string, unknown>;
  ecology: Record<string, unknown>;
  control: Record<string, unknown>;
  includeLayers: boolean;
}

interface SimulationReport extends Record<string, unknown> {
  apiVersion: string;
  engine: string;
  summary: Record<string, unknown>;
  waterBudget: Record<string, unknown>;
  subsurfaceBudget: Record<string, unknown>;
  sedimentBudget: Record<string, unknown>;
  ecology: Record<string, unknown>;
}

interface SimulationEnvelope {
  requestId: string;
  report: SimulationReport;
}

interface WorkerRequest {
  id: string;
  kind: "capabilities" | "simulate";
  scenario?: BackendScenario;
}

type WorkerResponse =
  | { id: string; ok: true; payload: unknown }
  | { id: string; ok: false; error: string };

export function configuredBackendUrl(locationLike: Pick<Location, "search"> | undefined = globalThis.location) {
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

export async function inspectBackend(
  endpoint: string | null,
  fetchImpl: FetchLike = globalThis.fetch as FetchLike,
  options: BackendOptions = {}
): Promise<BackendState> {
  if (!endpoint) {
    const capabilities = asRecord(await (options.kernelTransport || defaultKernelTransport()).capabilities());
    assertApiCompatibility(capabilities);
    return {
      status: "ready",
      endpoint: null,
      transport: "browser-wasm",
      health: { status: "ready", engine: capabilities.engine, apiVersion: capabilities.apiVersion },
      capabilities
    };
  }
  const [health, capabilities] = await Promise.all([
    requestJson<Record<string, unknown>>(`${endpoint}/health`, {}, fetchImpl, 3_000),
    requestJson<Record<string, unknown>>(`${endpoint}/v1/capabilities`, {}, fetchImpl, 3_000)
  ]);
  assertApiCompatibility(health);
  assertApiCompatibility(capabilities);
  return { status: "ready", endpoint, transport: "native-sidecar", health, capabilities };
}

export async function runBackendVerification(
  model: GeoModel,
  params: ScenarioParams,
  endpoint: string | null,
  options: BackendOptions = {}
) {
  const request = buildBackendScenario(model, params, options);
  const startedAt = performance.now();
  const envelope = endpoint
    ? await requestJson<SimulationEnvelope>(`${endpoint}/v1/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      }, options.fetchImpl || globalThis.fetch as FetchLike)
    : asSimulationEnvelope(await (options.kernelTransport || defaultKernelTransport()).simulate(request));
  const report = envelope.report;
  if (!report || report.apiVersion !== API_VERSION || report.engine !== "geolab-core-rust") {
    throw new Error("Rust kernel returned an incompatible simulation envelope");
  }
  return {
    type: "geolab-rust-kernel-verification",
    schemaVersion: "1.1.0",
    generatedAt: new Date().toISOString(),
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

export function buildBackendScenario(
  model: GeoModel,
  params: ScenarioParams = {},
  options: BackendOptions = {}
): BackendScenario {
  if (!model?.height?.length || !model.n) throw new Error("A completed GeoLab model is required");
  const resolution = clampInteger(
    options.resolution ?? Math.min(DEFAULT_AUDIT_RESOLUTION, model.n),
    3,
    Math.min(512, model.n)
  );
  const mapSizeM = finite(model.sizeKm, finite(params.mapSizeKm, 128)) * 1000;
  const sample = (values: NumericLayer, fallback: number, minimum: number, maximum: number) => sampleLayer(
    values,
    model.n,
    resolution,
    fallback,
    minimum,
    maximum
  );
  return {
    apiVersion: API_VERSION,
    scenarioId: `geolab-${Math.round(mapSizeM / 1000)}km-${Math.round(finite(params.seed, 0))}-${Math.round(finite(params.currentYear, 0))}`,
    grid: {
      width: resolution,
      height: resolution,
      pointSpacingM: mapSizeM / Math.max(1, resolution - 1),
      cellSupportAreaM2: mapSizeM * mapSizeM / (resolution * resolution),
      elevationM: sample(model.height, 0, -12_000, 10_000)
    },
    climate: {
      annualPrecipitationMm: sample(model.precipitation, 900, 0, 15_000),
      meanTemperatureC: sample(model.temperature, finite(params.baseTemperature, 15), -80, 65),
      relativeHumidityFraction: clamp(finite(params.humidity, 0.65), 0.01, 1),
      windSpeedMS: clamp(finite(params.windSpeed, 2), 0, 100),
      latitudeDegrees: clamp(finite(params.latitude, 0), -90, 90),
      dayOfYear: clampInteger(params.dayOfYear ?? 183, 1, 366)
    },
    surface: {
      curveNumber: sample(model.surface?.curveNumber, 75, 30, 100),
      hydraulicConductivityMmH: sample(model.surface?.hydraulicConductivityMmHr, 12, 0, 2_000),
      availableWaterCapacityMm: sample(model.surface?.availableWaterCapacityMm, 120, 0, 1_000),
      imperviousFraction: sample(model.surface?.imperviousFraction, 0, 0, 1),
      vegetationFraction: sample(model.surface?.vegetation, 0.35, 0, 1)
    },
    management: {
      irrigationMm: sample(model.infrastructureInfluence?.irrigationMm, 0, 0, 5_000),
      requestedDemandMm: sample(model.infrastructureInfluence?.waterDemandMm, 0, 0, 10_000)
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
    includeLayers: Boolean(options.includeLayers)
  };
}

function buildSubsurfaceInput(
  model: GeoModel,
  targetResolution: number,
  sampleSurface: (values: NumericLayer, fallback: number, minimum: number, maximum: number) => number[]
) {
  const soilDepthM = sampleSurface(model.surface?.rootDepthM, 1, 0.05, 100);
  const volume = model.subsurface;
  const sourceResolution = clampInteger(volume?.gridN, 1, 4096);
  const expectedLength = sourceResolution * sourceResolution;
  const hasColumns = volume?.columnBedrockDepthM?.length === expectedLength &&
    volume?.columnWaterTableDepthM?.length === expectedLength;
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
    5_000
  );
  const waterTableDepthM = sampleLayer(
    volume.columnWaterTableDepthM,
    sourceResolution,
    targetResolution,
    finite(volume.depthM, 40) * 0.5,
    0,
    5_000
  );
  const aquiferThicknessM = bedrockDepthM.map((depth, index) =>
    clamp(depth - soilDepthM[index], 0.1, 5_000)
  );
  const initialStorageFraction = aquiferThicknessM.map((thickness, index) =>
    clamp(1 - Math.max(0, waterTableDepthM[index] - soilDepthM[index]) / Math.max(0.1, thickness), 0, 1)
  );
  return {
    soilDepthM,
    aquiferThicknessM,
    specificYieldFraction: [],
    initialStorageFraction,
    annualBaseflowRecessionFraction: 0.22
  };
}

function sampleLayer(
  values: NumericLayer,
  sourceResolution: number,
  targetResolution: number,
  fallback: number,
  minimum: number,
  maximum: number
) {
  const output = new Array<number>(targetResolution * targetResolution);
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

function bilinear(values: NumericLayer, resolution: number, x: number, y: number, fallback: number) {
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

function buildComparison(model: GeoModel, report: SimulationReport) {
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

class WorkerKernelTransport implements KernelTransport {
  private readonly worker: Worker;
  private readonly pending = new Map<string, {
    resolve(value: unknown): void;
    reject(reason: Error): void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  private sequence = 0;

  constructor() {
    if (typeof Worker !== "function") throw new Error("Web Workers are unavailable in this runtime");
    this.worker = new Worker(new URL("./rustKernelWorker.js", import.meta.url), { type: "module", name: "geolab-rust-wasm" });
    this.worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => this.handleMessage(event.data));
    this.worker.addEventListener("error", (event) => this.rejectAll(new Error(event.message || "Rust WASM worker failed")));
  }

  capabilities() {
    return this.request({ kind: "capabilities" });
  }

  simulate(scenario: BackendScenario) {
    return this.request({ kind: "simulate", scenario });
  }

  private request(request: Omit<WorkerRequest, "id">) {
    const id = (++this.sequence).toString(36);
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Rust WASM worker request timed out"));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.worker.postMessage({ id, ...request });
    });
  }

  private handleMessage(response: WorkerResponse) {
    const pending = this.pending.get(response.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(response.id);
    if (response.ok) pending.resolve(response.payload);
    else pending.reject(new Error(response.error));
  }

  private rejectAll(error: Error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

let sharedKernelTransport: KernelTransport | null = null;

function defaultKernelTransport() {
  sharedKernelTransport ||= new WorkerKernelTransport();
  return sharedKernelTransport;
}

async function requestJson<T>(url: string, init: RequestInit, fetchImpl: FetchLike, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
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
    return payload as T;
  } finally {
    clearTimeout(timer);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Rust kernel returned an invalid object");
  return value as Record<string, unknown>;
}

function asSimulationEnvelope(value: unknown): SimulationEnvelope {
  const envelope = asRecord(value);
  const report = asRecord(envelope.report) as SimulationReport;
  if (typeof envelope.requestId !== "string") throw new Error("Rust kernel returned no request identifier");
  return { requestId: envelope.requestId, report };
}

function assertApiCompatibility(value: Record<string, unknown>) {
  if (value.apiVersion !== API_VERSION) throw new Error(`Rust kernel API mismatch: expected ${API_VERSION}`);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function finite(value: unknown, fallback: null): number | null;
function finite(value: unknown, fallback?: number): number;
function finite(value: unknown, fallback: number | null = 0): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function clampInteger(value: unknown, minimum: number, maximum: number) {
  return Math.round(clamp(finite(value, minimum), minimum, maximum));
}
