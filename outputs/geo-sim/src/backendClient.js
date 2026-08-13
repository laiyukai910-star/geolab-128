const API_VERSION = "1.0";
const DEFAULT_AUDIT_RESOLUTION = 96;
const REQUEST_TIMEOUT_MS = 35_000;

export function configuredBackendUrl(locationLike = globalThis.location) {
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

export async function inspectBackend(endpoint, fetchImpl = globalThis.fetch) {
  if (!endpoint) return { status: "unavailable", endpoint: null, health: null, capabilities: null };
  const [health, capabilities] = await Promise.all([
    requestJson(`${endpoint}/health`, {}, fetchImpl, 3_000),
    requestJson(`${endpoint}/v1/capabilities`, {}, fetchImpl, 3_000)
  ]);
  if (health.apiVersion !== API_VERSION || capabilities.apiVersion !== API_VERSION) {
    throw new Error(`Rust backend API mismatch: expected ${API_VERSION}`);
  }
  return { status: "ready", endpoint, health, capabilities };
}

export async function runBackendVerification(model, params, endpoint, options = {}) {
  if (!endpoint) throw new Error("Rust backend endpoint is not configured");
  const request = buildBackendScenario(model, params, options);
  const startedAt = performance.now();
  const envelope = await requestJson(`${endpoint}/v1/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request)
  }, options.fetchImpl || globalThis.fetch);
  const report = envelope.report;
  if (!report || report.apiVersion !== API_VERSION || report.engine !== "geolab-core-rust") {
    throw new Error("Rust backend returned an incompatible simulation envelope");
  }
  return {
    type: "geolab-rust-backend-verification",
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    endpoint,
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

export function buildBackendScenario(model, params = {}, options = {}) {
  if (!model?.height?.length || !model.n) throw new Error("A completed GeoLab model is required");
  const resolution = clampInteger(
    options.resolution ?? Math.min(DEFAULT_AUDIT_RESOLUTION, model.n),
    3,
    Math.min(512, model.n)
  );
  const mapSizeM = finite(model.sizeKm, finite(params.mapSizeKm, 128)) * 1000;
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
    includeLayers: Boolean(options.includeLayers)
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
  const rustWater = report.waterBudget || {};
  const browserWater = model.stats?.waterBudget || {};
  return {
    interpretation: "Independent-kernel comparison; values need not match because the Rust audit uses a bounded resample and D8 routing.",
    browserProcessIntegrityIndex: finite(model.physicalCoupling?.summary?.processIntegrityIndex, null),
    rustProcessIntegrityIndex: finite(report.summary?.processIntegrityIndex, null),
    browserWaterResidualPercent: finite(browserWater.residualPctOfInput, null),
    rustWaterResidualPercent: finite(rustWater.residualPercentOfInput, null),
    browserMeanReferenceEtMm: finite(model.stats?.meanPotentialEvapotranspiration, null),
    rustMeanReferenceEtMm: finite(report.summary?.meanReferenceEvapotranspirationMm, null)
  };
}

async function requestJson(url, init, fetchImpl, timeoutMs = REQUEST_TIMEOUT_MS) {
  if (typeof fetchImpl !== "function") throw new Error("Fetch is unavailable in this runtime");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.message || `Rust backend request failed with HTTP ${response.status}`);
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
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
