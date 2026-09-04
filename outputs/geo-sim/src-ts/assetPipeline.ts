export type RenderDetailQuality = "high" | "ultra" | "exhaustive";

export type ProceduralMaterialClass =
  | "mineral"
  | "organic"
  | "water"
  | "glass"
  | "metal"
  | "masonry"
  | "wildlife"
  | "technical";

export interface DetailBudgetInput {
  n?: number;
  resolution?: number;
  renderDetailQuality?: string;
}

export interface DetailBudgetPlan {
  mode: string;
  quality: RenderDetailQuality;
  resolution: number;
  scale: number;
  subsurfaceStep: number;
  terrainDetailStep: number;
  vegetationStride: number;
  hazardStep: number;
  maxTerrainDetailInstances: number;
  maxVegetationInstances: number;
  maxHazardInstances: number;
  maxBuildingDiagnosticInstances: number;
}

export interface ProceduralDetailProfile {
  quality: RenderDetailQuality;
  radial: number;
  curve: number;
  lobes: number;
  bars: number;
  repetitions: number;
  surfaceSegments: number;
  organicSubdivision: number;
  bevelSegments: number;
}

export interface ProceduralMaterialProfile {
  materialClass: ProceduralMaterialClass;
  roughness: number;
  metalness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  sheen: number;
  sheenRoughness: number;
  envMapIntensity: number;
  specularIntensity: number;
}

export interface AssetVariantSource {
  x?: number;
  y?: number;
  z?: number;
  sx?: number;
  sy?: number;
  sz?: number;
  color?: number;
}

export const ASSET_PIPELINE_SCHEMA_VERSION = 3;

const HIGH_FACILITY_TYPES = Object.freeze([
  "highrise", "village", "industrial", "hospital", "transport", "rail", "reservoir",
  "dam", "canal", "solar_farm", "wind_farm", "park", "airport", "quarry"
]);

const ULTRA_FACILITY_TYPES = Object.freeze([
  ...HIGH_FACILITY_TYPES,
  "apartment", "school", "data_center", "bridge", "port", "powerplant", "greenhouse",
  "flood_pump_station", "observatory", "mountain_refuge", "ranger_station", "water_treatment_plant"
]);

const ORGANIC_KINDS = new Set([
  "fluted-trunk", "broadleaf-canopy", "layered-conifer", "irregular-shrub", "understory-cluster",
  "reed-cluster", "crop-row", "crossed-grass", "roof-garden", "garden-court", "bioswale",
  "firebreak-strip"
]);

const WATER_KINDS = new Set(["rippled-water", "wetland-ribbon"]);
const GLASS_KINDS = new Set(["curtain-wall", "greenhouse-bay", "observatory-dome"]);
const MINERAL_KINDS = new Set([
  "fractured-rock", "talus-cluster", "snow-drift", "stone-retaining-wall", "quarry-bench",
  "levee", "canal-bank"
]);
const METAL_KINDS = new Set([
  "facade-fin", "antenna-array", "sensor-mast", "streetlight", "railing", "rail-profile",
  "solar-panel-frame", "solar-rack", "turbine-blade", "tapered-mast", "process-tank",
  "water-tower-tank", "truss-tower", "telescope-mount", "braided-cable", "crane-tower",
  "crane-boom", "electrical-gantry", "louver-screen", "cooling-rack", "sluice-gate"
]);
const TECHNICAL_KINDS = new Set([
  "placement-beacon", "service-sign", "gauge-board", "beveled-marking", "helipad",
  "sports-court", "patterned-plaza", "security-forecourt"
]);

const QUALITY_PROFILES: Record<RenderDetailQuality, ProceduralDetailProfile> = {
  high: {
    quality: "high", radial: 14, curve: 9, lobes: 6, bars: 7,
    repetitions: 8, surfaceSegments: 12, organicSubdivision: 1, bevelSegments: 1
  },
  ultra: {
    quality: "ultra", radial: 24, curve: 18, lobes: 10, bars: 12,
    repetitions: 14, surfaceSegments: 24, organicSubdivision: 2, bevelSegments: 3
  },
  exhaustive: {
    quality: "exhaustive", radial: 40, curve: 32, lobes: 16, bars: 20,
    repetitions: 22, surfaceSegments: 40, organicSubdivision: 3, bevelSegments: 5
  }
};

const MATERIAL_PROFILES: Record<ProceduralMaterialClass, ProceduralMaterialProfile> = {
  mineral: material("mineral", 0.91, 0.01, 0.06, 0.82, 0, 1, 0.55, 0.35),
  organic: material("organic", 0.88, 0, 0.03, 0.9, 0.28, 0.72, 0.45, 0.42),
  water: material("water", 0.2, 0.03, 0.92, 0.12, 0, 1, 1.2, 0.92),
  glass: material("glass", 0.16, 0.12, 0.86, 0.1, 0, 1, 1.35, 1),
  metal: material("metal", 0.42, 0.56, 0.48, 0.24, 0, 1, 1.05, 0.92),
  masonry: material("masonry", 0.72, 0.025, 0.18, 0.64, 0, 1, 0.7, 0.55),
  wildlife: material("wildlife", 0.82, 0.005, 0.04, 0.78, 0.36, 0.62, 0.55, 0.5),
  technical: material("technical", 0.48, 0.14, 0.44, 0.32, 0, 1, 0.9, 0.82)
};

function material(
  materialClass: ProceduralMaterialClass,
  roughness: number,
  metalness: number,
  clearcoat: number,
  clearcoatRoughness: number,
  sheen: number,
  sheenRoughness: number,
  envMapIntensity: number,
  specularIntensity: number
): ProceduralMaterialProfile {
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

export function normalizeRenderDetailQuality(value: unknown): RenderDetailQuality {
  return value === "high" || value === "exhaustive" ? value : "ultra";
}

export function proceduralDetailProfile(value: unknown): ProceduralDetailProfile {
  return { ...QUALITY_PROFILES[normalizeRenderDetailQuality(value)] };
}

export function createRenderDetailBudgetPlan(input: DetailBudgetInput = {}): DetailBudgetPlan {
  const resolution = Math.max(1, Math.round(Number(input.n ?? input.resolution ?? 256) || 256));
  const quality = normalizeRenderDetailQuality(input.renderDetailQuality);
  const scale = adaptiveResolutionScale(resolution);
  const profile = quality === "exhaustive"
    ? { multiplier: 6, subsurface: 224, terrain: 560, vegetation: 480, hazard: 320 }
    : quality === "ultra"
      ? { multiplier: 2.75, subsurface: 144, terrain: 360, vegetation: 300, hazard: 208 }
      : { multiplier: 1.2, subsurface: 84, terrain: 224, vegetation: 168, hazard: 112 };
  return {
    mode: `typed-adaptive-asset-budget-${quality}-v${ASSET_PIPELINE_SCHEMA_VERSION}`,
    quality,
    resolution,
    scale,
    subsurfaceStep: adaptiveLayerStep(resolution, profile.subsurface),
    terrainDetailStep: adaptiveLayerStep(resolution, profile.terrain),
    vegetationStride: adaptiveLayerStep(resolution, profile.vegetation),
    hazardStep: adaptiveLayerStep(resolution, profile.hazard),
    maxTerrainDetailInstances: Math.max(7200, Math.round(24000 * scale * profile.multiplier)),
    maxVegetationInstances: Math.max(5200, Math.round(12000 * scale * profile.multiplier)),
    maxHazardInstances: Math.max(6000, Math.round(18000 * scale * profile.multiplier)),
    maxBuildingDiagnosticInstances: Math.max(3000, Math.round(6000 * scale * Math.min(3.5, profile.multiplier)))
  };
}

export function block3DRendererFacilityTypes(value: unknown): readonly string[] | null {
  const quality = normalizeRenderDetailQuality(value);
  if (quality === "exhaustive") return null;
  return quality === "high" ? HIGH_FACILITY_TYPES : ULTRA_FACILITY_TYPES;
}

export function proceduralMaterialClass(kind: unknown): ProceduralMaterialClass {
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

export function proceduralMaterialProfile(kind: unknown): ProceduralMaterialProfile {
  return MATERIAL_PROFILES[proceduralMaterialClass(kind)];
}

export function proceduralAssetVariantCount(kind: unknown, value: unknown): number {
  const quality = normalizeRenderDetailQuality(value);
  const materialClass = proceduralMaterialClass(kind);
  if (quality === "high") return materialClass === "water" || materialClass === "technical" ? 1 : 2;
  if (quality === "ultra") return materialClass === "organic" || materialClass === "wildlife" ? 3 : 2;
  if (materialClass === "organic" || materialClass === "wildlife" || materialClass === "mineral") return 5;
  return materialClass === "masonry" || materialClass === "metal" ? 4 : 3;
}

export function proceduralAssetVariantIndex(
  kind: unknown,
  source: AssetVariantSource,
  variantCount: number
): number {
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

export function assetPipelineDiagnostics(): Record<string, unknown> {
  return {
    schemaVersion: ASSET_PIPELINE_SCHEMA_VERSION,
    implementation: "strict-typescript",
    detailProfiles: Object.fromEntries(Object.entries(QUALITY_PROFILES).map(([key, profile]) => [key, { ...profile }])),
    materialClasses: Object.keys(MATERIAL_PROFILES),
    variantPolicy: "deterministic-spatial-multi-template"
  };
}

function adaptiveResolutionScale(resolution: number): number {
  if (resolution >= 4096) return 0.66;
  if (resolution >= 3072) return 0.74;
  if (resolution >= 2048) return 0.82;
  if (resolution >= 1024) return 0.91;
  return 1;
}

function adaptiveLayerStep(resolution: number, targetSamplesPerAxis: number): number {
  return Math.max(1, Math.ceil(resolution / targetSamplesPerAxis));
}

function quantize(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 1000) : 0;
}
