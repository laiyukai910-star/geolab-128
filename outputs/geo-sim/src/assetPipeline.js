// Generated from src-ts/assetPipeline.ts. Run npm run browser:build to regenerate.
const ASSET_PIPELINE_SCHEMA_VERSION = 3;
const HIGH_FACILITY_TYPES = Object.freeze([
  "highrise",
  "village",
  "industrial",
  "hospital",
  "transport",
  "rail",
  "reservoir",
  "dam",
  "canal",
  "solar_farm",
  "wind_farm",
  "park",
  "airport",
  "quarry"
]);
const ULTRA_FACILITY_TYPES = Object.freeze([
  ...HIGH_FACILITY_TYPES,
  "apartment",
  "school",
  "data_center",
  "bridge",
  "port",
  "powerplant",
  "greenhouse",
  "flood_pump_station",
  "observatory",
  "mountain_refuge",
  "ranger_station",
  "water_treatment_plant"
]);
const ORGANIC_KINDS = /* @__PURE__ */ new Set([
  "fluted-trunk",
  "broadleaf-canopy",
  "layered-conifer",
  "irregular-shrub",
  "understory-cluster",
  "reed-cluster",
  "crop-row",
  "crossed-grass",
  "roof-garden",
  "garden-court",
  "bioswale",
  "firebreak-strip"
]);
const WATER_KINDS = /* @__PURE__ */ new Set(["rippled-water", "wetland-ribbon"]);
const GLASS_KINDS = /* @__PURE__ */ new Set(["curtain-wall", "greenhouse-bay", "observatory-dome"]);
const MINERAL_KINDS = /* @__PURE__ */ new Set([
  "fractured-rock",
  "talus-cluster",
  "snow-drift",
  "stone-retaining-wall",
  "quarry-bench",
  "levee",
  "canal-bank"
]);
const METAL_KINDS = /* @__PURE__ */ new Set([
  "facade-fin",
  "antenna-array",
  "sensor-mast",
  "streetlight",
  "railing",
  "rail-profile",
  "solar-panel-frame",
  "solar-rack",
  "turbine-blade",
  "tapered-mast",
  "process-tank",
  "water-tower-tank",
  "truss-tower",
  "telescope-mount",
  "braided-cable",
  "crane-tower",
  "crane-boom",
  "electrical-gantry",
  "louver-screen",
  "cooling-rack",
  "sluice-gate"
]);
const TECHNICAL_KINDS = /* @__PURE__ */ new Set([
  "placement-beacon",
  "service-sign",
  "gauge-board",
  "beveled-marking",
  "helipad",
  "sports-court",
  "patterned-plaza",
  "security-forecourt"
]);
const QUALITY_PROFILES = {
  high: {
    quality: "high",
    radial: 14,
    curve: 9,
    lobes: 6,
    bars: 7,
    repetitions: 8,
    surfaceSegments: 12,
    organicSubdivision: 1,
    bevelSegments: 1
  },
  ultra: {
    quality: "ultra",
    radial: 24,
    curve: 18,
    lobes: 10,
    bars: 12,
    repetitions: 14,
    surfaceSegments: 24,
    organicSubdivision: 2,
    bevelSegments: 3
  },
  exhaustive: {
    quality: "exhaustive",
    radial: 40,
    curve: 32,
    lobes: 16,
    bars: 20,
    repetitions: 22,
    surfaceSegments: 40,
    organicSubdivision: 3,
    bevelSegments: 5
  }
};
const MATERIAL_PROFILES = {
  mineral: material("mineral", 0.91, 0.01, 0.06, 0.82, 0, 1, 0.55, 0.35),
  organic: material("organic", 0.88, 0, 0.03, 0.9, 0.28, 0.72, 0.45, 0.42),
  water: material("water", 0.2, 0.03, 0.92, 0.12, 0, 1, 1.2, 0.92),
  glass: material("glass", 0.16, 0.12, 0.86, 0.1, 0, 1, 1.35, 1),
  metal: material("metal", 0.42, 0.56, 0.48, 0.24, 0, 1, 1.05, 0.92),
  masonry: material("masonry", 0.72, 0.025, 0.18, 0.64, 0, 1, 0.7, 0.55),
  wildlife: material("wildlife", 0.82, 5e-3, 0.04, 0.78, 0.36, 0.62, 0.55, 0.5),
  technical: material("technical", 0.48, 0.14, 0.44, 0.32, 0, 1, 0.9, 0.82)
};
function material(materialClass, roughness, metalness, clearcoat, clearcoatRoughness, sheen, sheenRoughness, envMapIntensity, specularIntensity) {
  return Object.freeze({
    materialClass,
    roughness,
    metalness,
    clearcoat,
    clearcoatRoughness,
    sheen,
    sheenRoughness,
    envMapIntensity,
    specularIntensity
  });
}
function normalizeRenderDetailQuality(value) {
  return value === "high" || value === "exhaustive" ? value : "ultra";
}
function proceduralDetailProfile(value) {
  return { ...QUALITY_PROFILES[normalizeRenderDetailQuality(value)] };
}
function createRenderDetailBudgetPlan(input = {}) {
  const resolution = Math.max(1, Math.round(Number(input.n ?? input.resolution ?? 256) || 256));
  const quality = normalizeRenderDetailQuality(input.renderDetailQuality);
  const scale = adaptiveResolutionScale(resolution);
  const profile = quality === "exhaustive" ? { multiplier: 6, subsurface: 224, terrain: 560, vegetation: 480, hazard: 320 } : quality === "ultra" ? { multiplier: 2.75, subsurface: 144, terrain: 360, vegetation: 300, hazard: 208 } : { multiplier: 1.2, subsurface: 84, terrain: 224, vegetation: 168, hazard: 112 };
  return {
    mode: `typed-adaptive-asset-budget-${quality}-v${ASSET_PIPELINE_SCHEMA_VERSION}`,
    quality,
    resolution,
    scale,
    subsurfaceStep: adaptiveLayerStep(resolution, profile.subsurface),
    terrainDetailStep: adaptiveLayerStep(resolution, profile.terrain),
    vegetationStride: adaptiveLayerStep(resolution, profile.vegetation),
    hazardStep: adaptiveLayerStep(resolution, profile.hazard),
    maxTerrainDetailInstances: Math.max(7200, Math.round(24e3 * scale * profile.multiplier)),
    maxVegetationInstances: Math.max(5200, Math.round(12e3 * scale * profile.multiplier)),
    maxHazardInstances: Math.max(6e3, Math.round(18e3 * scale * profile.multiplier)),
    maxBuildingDiagnosticInstances: Math.max(3e3, Math.round(6e3 * scale * Math.min(3.5, profile.multiplier)))
  };
}
function block3DRendererFacilityTypes(value) {
  const quality = normalizeRenderDetailQuality(value);
  if (quality === "exhaustive") return null;
  return quality === "high" ? HIGH_FACILITY_TYPES : ULTRA_FACILITY_TYPES;
}
function proceduralMaterialClass(kind) {
  const normalized = String(kind || "").toLowerCase();
  if (normalized.startsWith("wildlife-")) return "wildlife";
  if (WATER_KINDS.has(normalized)) return "water";
  if (GLASS_KINDS.has(normalized)) return "glass";
  if (ORGANIC_KINDS.has(normalized)) return "organic";
  if (MINERAL_KINDS.has(normalized)) return "mineral";
  if (METAL_KINDS.has(normalized)) return "metal";
  if (TECHNICAL_KINDS.has(normalized)) return "technical";
  return "masonry";
}
function proceduralMaterialProfile(kind) {
  return MATERIAL_PROFILES[proceduralMaterialClass(kind)];
}
function proceduralAssetVariantCount(kind, value) {
  const quality = normalizeRenderDetailQuality(value);
  const materialClass = proceduralMaterialClass(kind);
  if (quality === "high") return materialClass === "water" || materialClass === "technical" ? 1 : 2;
  if (quality === "ultra") return materialClass === "organic" || materialClass === "wildlife" ? 3 : 2;
  if (materialClass === "organic" || materialClass === "wildlife" || materialClass === "mineral") return 5;
  return materialClass === "masonry" || materialClass === "metal" ? 4 : 3;
}
function proceduralAssetVariantIndex(kind, source, variantCount) {
  const count = Math.max(1, Math.floor(variantCount));
  if (count === 1) return 0;
  let hash = 2166136261 >>> 0;
  const token = `${String(kind || "asset")}|${quantize(source.x)}|${quantize(source.y)}|${quantize(source.z)}|${quantize(source.sx)}|${quantize(source.sy)}|${quantize(source.sz)}|${Number(source.color ?? 0) >>> 0}`;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash % count;
}
function assetPipelineDiagnostics() {
  return {
    schemaVersion: ASSET_PIPELINE_SCHEMA_VERSION,
    implementation: "strict-typescript",
    detailProfiles: Object.fromEntries(Object.entries(QUALITY_PROFILES).map(([key, profile]) => [key, { ...profile }])),
    materialClasses: Object.keys(MATERIAL_PROFILES),
    variantPolicy: "deterministic-spatial-multi-template"
  };
}
function adaptiveResolutionScale(resolution) {
  if (resolution >= 4096) return 0.66;
  if (resolution >= 3072) return 0.74;
  if (resolution >= 2048) return 0.82;
  if (resolution >= 1024) return 0.91;
  return 1;
}
function adaptiveLayerStep(resolution, targetSamplesPerAxis) {
  return Math.max(1, Math.ceil(resolution / targetSamplesPerAxis));
}
function quantize(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 1e3) : 0;
}
export {
  ASSET_PIPELINE_SCHEMA_VERSION,
  assetPipelineDiagnostics,
  block3DRendererFacilityTypes,
  createRenderDetailBudgetPlan,
  normalizeRenderDetailQuality,
  proceduralAssetVariantCount,
  proceduralAssetVariantIndex,
  proceduralDetailProfile,
  proceduralMaterialClass,
  proceduralMaterialProfile
};
