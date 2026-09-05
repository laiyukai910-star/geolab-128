import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createFoliageGeometry } from "./foliageGeometry.js";
import { FoliageInstances } from "./foliageInstances.js";
import { naturalTerrainColor, terrainSurfaceWeights, terrainVertexNormal } from "./terrainAppearance.js";
import { createTerrainSurfaceMaterial, updateTerrainSurfaceMaterial } from "./terrainSurfaceMaterial.js";
import { SceneVolume } from "./sceneVolume.js";
import {
  buildAdaptiveInfrastructurePlacementPlan,
  buildBlockDetailAtlas,
  colorForValue,
  INFRASTRUCTURE_CODE_TYPES,
  MAP_SIZE_KM,
  terrainPresetMaterialPlan,
  VEGETATION_TYPES
} from "./geoEngine.js";
import {
  createProceduralGeometry as createAssetGeometry,
  createSemanticAssetGeometry,
  proceduralAssetDiagnostics,
  semanticAssetKind,
  wildlifeProceduralKind
} from "./proceduralAssets.js";
import {
  assetPipelineDiagnostics,
  block3DRendererFacilityTypes,
  createRenderDetailBudgetPlan as detailBudgetPlan,
  proceduralAssetVariantCount,
  proceduralAssetVariantIndex,
  proceduralMaterialProfile
} from "./assetPipeline.js";

function cameraHome(sizeKm, aspect = 1.5) {
  const fit = Math.max(1, 1.2 / aspect);
  return {
    x: sizeKm * 0.8 * fit,
    y: sizeKm * 0.32 * fit,
    z: sizeKm * 0.9 * fit
  };
}

function modelSizeKm(model) {
  return Number(model?.sizeKm) || MAP_SIZE_KM;
}

function terrainCameraFocusY(model, params = {}) {
  if (!model?.height?.length || !model.n) return 0.6;
  const n = model.n;
  const cx = Math.floor((n - 1) / 2);
  const cy = Math.floor((n - 1) / 2);
  let total = 0;
  let count = 0;
  for (let oy = -2; oy <= 2; oy += 1) {
    for (let ox = -2; ox <= 2; ox += 1) {
      const x = Math.min(n - 1, Math.max(0, cx + ox));
      const y = Math.min(n - 1, Math.max(0, cy + oy));
      const elevationM = Number(model.height[y * n + x]);
      if (!Number.isFinite(elevationM)) continue;
      total += elevationM;
      count += 1;
    }
  }
  const meanElevationM = count ? total / count : 0;
  return (meanElevationM / 1000) * (Number(params.verticalScale) || 1) + 0.08;
}

const BUILDING_HEIGHT_VISUAL_SCALE = 1.08;
const MAX_BUILDING_INSTANCES = 90000;
const MAX_FACILITY_INSTANCES = 52000;
const TERRAIN_TILE_SEGMENTS = 128;
const WILDLIFE_MATRIX_DUMMY = new THREE.Object3D();
const FIRST_PHASE_LAYER_NAMES = Object.freeze(["scene-scale", "terrain-surface", "rivers", "wind-arrows"]);
const DEFERRED_DETAIL_LAYER_NAMES = Object.freeze(["subsurface", "terrain-details", "vegetation", "wildlife", "infrastructure", "hazards"]);
const TEMPORAL_VIEW_MODES = new Set(["hazard", "flood", "drought", "wildfire", "landslide", "builtDamage", "timechange"]);
const SUBSURFACE_3D_VIEW_MODES = new Set(["subsurface", "aquifer", "geostress", "subsurfaceConfidence", "undergroundRisk"]);
const HAZARD_3D_VIEW_MODES = new Set(["hazard", "flood", "drought", "wildfire", "landslide", "timechange"]);
const WILDLIFE_ANIMATION_INTERVAL_MS = 1000 / 30;
const INDUSTRIAL_SILHOUETTE_TYPES = new Set([
  "industrial", "logistics", "airport", "port", "greenhouse", "quarry",
  "data_center", "flood_pump_station", "desalination_plant", "hydropower_plant",
  "geothermal_plant", "water_treatment_plant", "ferry_terminal"
]);
const CIVIC_SILHOUETTE_TYPES = new Set([
  "civic", "hospital", "clinic", "school", "library", "community_center",
  "police_station", "fire_station"
]);
const MIDRISE_SILHOUETTE_TYPES = new Set(["apartment", "commercial", "urban"]);
const LOWRISE_ROOF_TYPES = new Set([
  "villa", "residential", "village", "bus_terminal", "observatory", "cable_car_station",
  "visitor_center", "scenic_overlook", "trailhead", "ranger_station", "gauging_station",
  "mountain_refuge", "fire_watch_tower"
]);

function isTemporalViewMode(viewMode) {
  return TEMPORAL_VIEW_MODES.has(String(viewMode || ""));
}

function gpuCapabilitySnapshot(renderer) {
  const gl = renderer.getContext();
  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
  const rendererName = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "") : "";
  const vendorName = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || "") : "";
  const softwarePattern = /swiftshader|llvmpipe|software|microsoft basic render/i;
  return {
    requestedPowerPreference: "high-performance",
    webglVersion: renderer.capabilities.isWebGL2 ? "WebGL2" : "WebGL1",
    hardwareAccelerated: rendererName ? !softwarePattern.test(rendererName) : null,
    renderer: rendererName || "浏览器GPU",
    vendor: vendorName || "未公开",
    maxTextureSize: renderer.capabilities.maxTextureSize,
    maxAnisotropy: renderer.capabilities.getMaxAnisotropy(),
    precision: renderer.capabilities.precision
  };
}

const VISUAL_BUILDING_PROPORTIONS = {
  highrise: { minFootprintKm: 0.15, minDepthKm: 0.13, maxAspect: 4.6 },
  apartment: { minFootprintKm: 0.1, minDepthKm: 0.09, maxAspect: 4.1 },
  commercial: { minFootprintKm: 0.11, minDepthKm: 0.095, maxAspect: 4.0 },
  residential: { minFootprintKm: 0.06, minDepthKm: 0.052, maxAspect: 3.2 },
  urban: { minFootprintKm: 0.075, minDepthKm: 0.065, maxAspect: 3.5 },
  village: { minFootprintKm: 0.048, minDepthKm: 0.044, maxAspect: 2.4 },
  villa: { minFootprintKm: 0.055, minDepthKm: 0.048, maxAspect: 2.3 },
  industrial: { minFootprintKm: 0.15, minDepthKm: 0.12, maxAspect: 2.35 },
  logistics: { minFootprintKm: 0.16, minDepthKm: 0.125, maxAspect: 2.2 },
  civic: { minFootprintKm: 0.095, minDepthKm: 0.085, maxAspect: 3.2 },
  hospital: { minFootprintKm: 0.105, minDepthKm: 0.095, maxAspect: 3.5 },
  school: { minFootprintKm: 0.082, minDepthKm: 0.07, maxAspect: 2.5 },
  stadium: { minFootprintKm: 0.18, minDepthKm: 0.15, maxAspect: 1.9 },
  airport: { minFootprintKm: 0.18, minDepthKm: 0.12, maxAspect: 2.1 },
  port: { minFootprintKm: 0.13, minDepthKm: 0.095, maxAspect: 2.7 },
  powerplant: { minFootprintKm: 0.13, minDepthKm: 0.105, maxAspect: 2.7 },
  wastewater: { minFootprintKm: 0.09, minDepthKm: 0.075, maxAspect: 2.2 },
  greenhouse: { minFootprintKm: 0.12, minDepthKm: 0.07, maxAspect: 1.8 },
  quarry: { minFootprintKm: 0.14, minDepthKm: 0.11, maxAspect: 1.5 },
  clinic: { minFootprintKm: 0.085, minDepthKm: 0.072, maxAspect: 2.35 },
  library: { minFootprintKm: 0.092, minDepthKm: 0.08, maxAspect: 2.25 },
  community_center: { minFootprintKm: 0.09, minDepthKm: 0.078, maxAspect: 2.2 },
  bus_terminal: { minFootprintKm: 0.12, minDepthKm: 0.075, maxAspect: 1.9 },
  water_tower: { minFootprintKm: 0.055, minDepthKm: 0.052, maxAspect: 3.0 },
  observatory: { minFootprintKm: 0.075, minDepthKm: 0.068, maxAspect: 2.4 },
  cable_car_station: { minFootprintKm: 0.08, minDepthKm: 0.055, maxAspect: 2.2 },
  flood_pump_station: { minFootprintKm: 0.09, minDepthKm: 0.07, maxAspect: 2.0 },
  desalination_plant: { minFootprintKm: 0.14, minDepthKm: 0.1, maxAspect: 2.2 },
  hydropower_plant: { minFootprintKm: 0.13, minDepthKm: 0.105, maxAspect: 2.35 },
  geothermal_plant: { minFootprintKm: 0.12, minDepthKm: 0.09, maxAspect: 2.15 },
  water_treatment_plant: { minFootprintKm: 0.12, minDepthKm: 0.085, maxAspect: 2.05 },
  mountain_refuge: { minFootprintKm: 0.055, minDepthKm: 0.046, maxAspect: 1.8 },
  ferry_terminal: { minFootprintKm: 0.12, minDepthKm: 0.08, maxAspect: 1.95 },
  fire_watch_tower: { minFootprintKm: 0.045, minDepthKm: 0.038, maxAspect: 2.15 },
  visitor_center: { minFootprintKm: 0.095, minDepthKm: 0.078, maxAspect: 2.15 },
  scenic_overlook: { minFootprintKm: 0.05, minDepthKm: 0.04, maxAspect: 1.8 },
  trailhead: { minFootprintKm: 0.052, minDepthKm: 0.042, maxAspect: 1.9 },
  ranger_station: { minFootprintKm: 0.07, minDepthKm: 0.058, maxAspect: 2.1 },
  gauging_station: { minFootprintKm: 0.036, minDepthKm: 0.03, maxAspect: 1.7 },
  custom: { minFootprintKm: 0.065, minDepthKm: 0.056, maxAspect: 2.8 }
};

const D8_WORLD_DIRECTIONS = [
  { x: 1, z: 0 },
  { x: 1, z: 1 },
  { x: 0, z: 1 },
  { x: -1, z: 1 },
  { x: -1, z: 0 },
  { x: -1, z: -1 },
  { x: 0, z: -1 },
  { x: 1, z: -1 }
];

const BUILDING_DEFAULTS = {
  highrise: { heightM: 170, density: 0.72, footprint: 0.18, color: 0xb8c5c7 },
  apartment: { heightM: 58, density: 0.55, footprint: 0.2, color: 0xb6a795 },
  commercial: { heightM: 92, density: 0.58, footprint: 0.22, color: 0x9fb5bd },
  residential: { heightM: 16, density: 0.32, footprint: 0.16, color: 0xb99f85 },
  urban: { heightM: 28, density: 0.42, footprint: 0.17, color: 0xb6a69b },
  village: { heightM: 8, density: 0.18, footprint: 0.14, color: 0xc1a37d },
  villa: { heightM: 8, density: 0.18, footprint: 0.12, color: 0xd1bda1 },
  industrial: { heightM: 18, density: 0.36, footprint: 0.3, color: 0x9f9a8f },
  logistics: { heightM: 16, density: 0.34, footprint: 0.34, color: 0x9a9588 },
  civic: { heightM: 24, density: 0.28, footprint: 0.24, color: 0xc5b48e },
  hospital: { heightM: 38, density: 0.34, footprint: 0.22, color: 0xd6d6cf },
  school: { heightM: 16, density: 0.24, footprint: 0.2, color: 0xc7ad7f },
  stadium: { heightM: 26, density: 0.32, footprint: 0.32, color: 0xb8b4a9 },
  airport: { heightM: 18, density: 0.12, footprint: 0.42, color: 0xaeb1ad },
  port: { heightM: 22, density: 0.26, footprint: 0.32, color: 0x8e999c },
  powerplant: { heightM: 32, density: 0.3, footprint: 0.28, color: 0x8f8c83 },
  wastewater: { heightM: 12, density: 0.18, footprint: 0.22, color: 0x849398 },
  greenhouse: { heightM: 7, density: 0.46, footprint: 0.18, color: 0xb8d1c6 },
  quarry: { heightM: 8, density: 0.08, footprint: 0.24, color: 0x9a8971 },
  office_tower: { heightM: 138, density: 0.66, footprint: 0.2, color: 0xa8bec8 },
  hotel: { heightM: 72, density: 0.42, footprint: 0.2, color: 0xc4b49c },
  market: { heightM: 18, density: 0.42, footprint: 0.24, color: 0xc0a074 },
  fire_station: { heightM: 12, density: 0.22, footprint: 0.18, color: 0xb86b5f },
  police_station: { heightM: 12, density: 0.2, footprint: 0.18, color: 0x8fa0ad },
  data_center: { heightM: 18, density: 0.28, footprint: 0.28, color: 0x87929b },
  substation: { heightM: 7, density: 0.12, footprint: 0.22, color: 0x8c8878 },
  metro_station: { heightM: 12, density: 0.24, footprint: 0.2, color: 0x8297a3 },
  tunnel_portal: { heightM: 8, density: 0.1, footprint: 0.18, color: 0x7c7468 },
  research_station: { heightM: 12, density: 0.18, footprint: 0.18, color: 0xb8c0b7 },
  farmstead: { heightM: 7, density: 0.12, footprint: 0.16, color: 0xc4a56f },
  terrace_farm: { heightM: 4, density: 0.04, footprint: 0.2, color: 0xa6b579 },
  clinic: { heightM: 14, density: 0.22, footprint: 0.2, color: 0xd7ddd6 },
  library: { heightM: 16, density: 0.2, footprint: 0.22, color: 0xb9a884 },
  community_center: { heightM: 14, density: 0.22, footprint: 0.22, color: 0xc1ae86 },
  bus_terminal: { heightM: 10, density: 0.2, footprint: 0.28, color: 0x8f9ba0 },
  water_tower: { heightM: 8, density: 0.08, footprint: 0.14, color: 0xa7b4b8 },
  observatory: { heightM: 16, density: 0.18, footprint: 0.18, color: 0xb5c5c7 },
  cable_car_station: { heightM: 10, density: 0.16, footprint: 0.18, color: 0xa8a899 },
  flood_pump_station: { heightM: 9, density: 0.18, footprint: 0.22, color: 0x879da1 },
  desalination_plant: { heightM: 14, density: 0.24, footprint: 0.3, color: 0x8da7ad },
  hydropower_plant: { heightM: 26, density: 0.22, footprint: 0.28, color: 0x7f9aa3 },
  geothermal_plant: { heightM: 22, density: 0.22, footprint: 0.26, color: 0xa39182 },
  water_treatment_plant: { heightM: 16, density: 0.2, footprint: 0.25, color: 0x8facb2 },
  mountain_refuge: { heightM: 8, density: 0.13, footprint: 0.13, color: 0xb19870 },
  ferry_terminal: { heightM: 12, density: 0.22, footprint: 0.26, color: 0x8da3a9 },
  fire_watch_tower: { heightM: 10, density: 0.05, footprint: 0.09, color: 0xb28b63 },
  visitor_center: { heightM: 14, density: 0.26, footprint: 0.21, color: 0xc6ad78 },
  scenic_overlook: { heightM: 4, density: 0.05, footprint: 0.11, color: 0xb8aa82 },
  trailhead: { heightM: 5, density: 0.07, footprint: 0.12, color: 0xa9976c },
  ranger_station: { heightM: 9, density: 0.16, footprint: 0.15, color: 0x9dae8e },
  gauging_station: { heightM: 3, density: 0.03, footprint: 0.08, color: 0x83a9b2 },
  custom: { heightM: 10, density: 0.1, footprint: 0.16, color: 0xb4a18d }
};

const BUILDING_MATERIAL_PALETTES = {
  highrise: [0xb7c9cc, 0xc9d5d3, 0xa7bdc5],
  apartment: [0xb6a795, 0xc1b6a6, 0xa89483],
  commercial: [0x9fb5bd, 0xb8cbd0, 0x91a7b0],
  residential: [0xb99f85, 0xc6ae91, 0xa98e74],
  villa: [0xd1bda1, 0xc7a984, 0xd8c8ab],
  village: [0xc1a37d, 0xb98b62, 0xd0b28b],
  industrial: [0x9f9a8f, 0x8f9492, 0xa6a093],
  logistics: [0x9a9588, 0x8e928a, 0xa8a18f],
  civic: [0xc5b48e, 0xd0c4a0, 0xb7a77d],
  hospital: [0xd9ddd8, 0xf0f0ea, 0xcfdad8],
  school: [0xc7ad7f, 0xd0ba8b, 0xb99c70],
  greenhouse: [0xb8d1c6, 0xd4fff0, 0xa6c7bc],
  office_tower: [0xa8bec8, 0xc0d2d8, 0x90aab5],
  hotel: [0xc4b49c, 0xd3c3a8, 0xae9b82],
  market: [0xc0a074, 0xd2b486, 0xa88860],
  fire_station: [0xb86b5f, 0xc47b6e, 0x9f5a50],
  police_station: [0x8fa0ad, 0xa4b4bf, 0x788995],
  data_center: [0x87929b, 0x9aa5ad, 0x747f88],
  substation: [0x8c8878, 0xa09b89, 0x746f60],
  metro_station: [0x8297a3, 0x9aadb6, 0x6f828d],
  tunnel_portal: [0x7c7468, 0x92887b, 0x625c52],
  research_station: [0xb8c0b7, 0xcbd2c8, 0x9da79f],
  farmstead: [0xc4a56f, 0xd2b680, 0xa98d5b],
  terrace_farm: [0xa6b579, 0xb7c887, 0x8d9f62],
  clinic: [0xd7ddd6, 0xecf0e8, 0xbccdc8],
  library: [0xb9a884, 0xc7b894, 0xa38f6e],
  community_center: [0xc1ae86, 0xd1bf95, 0xa99270],
  bus_terminal: [0x8f9ba0, 0xa5b1b4, 0x747f83],
  water_tower: [0xa7b4b8, 0xc0cace, 0x8e9aa0],
  observatory: [0xb5c5c7, 0xcbd4d2, 0x9fb0b5],
  cable_car_station: [0xa8a899, 0xb8b7a4, 0x8f9284],
  flood_pump_station: [0x879da1, 0x9cafb2, 0x718589],
  desalination_plant: [0x8da7ad, 0x9db8bd, 0x77939a],
  hydropower_plant: [0x7f9aa3, 0x94adb4, 0x69838c],
  geothermal_plant: [0xa39182, 0xb3a08f, 0x8d7e73],
  water_treatment_plant: [0x8facb2, 0xa3bec3, 0x78949b],
  mountain_refuge: [0xb19870, 0xc0a67c, 0x927c5d],
  ferry_terminal: [0x8da3a9, 0xa0b5ba, 0x748b93],
  fire_watch_tower: [0xb28b63, 0xc29c70, 0x93704e],
  visitor_center: [0xc6ad78, 0xd0bd8a, 0xaa956d],
  scenic_overlook: [0xb8aa82, 0xc5b990, 0x92886d],
  trailhead: [0xa9976c, 0xbeab7c, 0x8e805e],
  ranger_station: [0x9dae8e, 0xb2bf9c, 0x829572],
  gauging_station: [0x83a9b2, 0x9abdc4, 0x6f919d],
  airport: [0xaeb1ad, 0xc0c5c0, 0x949d9d],
  port: [0x8e999c, 0x78909a, 0xa0a7a6],
  powerplant: [0x8f8c83, 0xa39b8c, 0x777870],
  wastewater: [0x849398, 0x91a4a2, 0x6f8185],
  stadium: [0xb8b4a9, 0xc4c0b6, 0x9f9c94],
  custom: [0xb4a18d, 0xc0ad95, 0xa58f78]
};

const BUILDING_FACADE_PROFILES = {
  highrise: { family: "glass-curtain-wall", floorHeightM: 3.7, minRows: 3, maxRows: 10, rowsPerBand: 8, minCols: 3, maxCols: 6, windowSpacingKm: 0.034, faceCount: 2, window: 0x94d2e2, litWindow: 0xf1d38c, band: 0x617f90, mullion: 0x425c66, entrance: 0x6d91a1, roof: 0xcbd6d7, roofEquipment: 3, verticalMullions: true },
  apartment: { family: "warm-balcony-apartment", floorHeightM: 3.1, minRows: 2, maxRows: 7, rowsPerBand: 5, minCols: 3, maxCols: 5, windowSpacingKm: 0.036, faceCount: 2, window: 0x77aabb, litWindow: 0xf0c978, band: 0x8f8176, mullion: 0x675f58, entrance: 0x8b6d55, balcony: true, roof: 0x8d6850, roofGarden: true },
  commercial: { family: "retail-glass-podium", floorHeightM: 3.8, minRows: 3, maxRows: 8, rowsPerBand: 6, minCols: 3, maxCols: 6, windowSpacingKm: 0.032, faceCount: 2, window: 0xa2d8e4, litWindow: 0xf4d48b, band: 0x6c8d9a, mullion: 0x4f6971, entrance: 0x7aa3b2, roof: 0xa5b8bc, roofEquipment: 3, verticalMullions: true },
  residential: { family: "lowrise-residential-roof", floorHeightM: 3.1, minRows: 2, maxRows: 4, rowsPerBand: 4, minCols: 2, maxCols: 4, windowSpacingKm: 0.042, faceCount: 1, window: 0x78a8b6, litWindow: 0xefc77b, band: 0x927964, mullion: 0x69594c, entrance: 0x9c744f, balcony: true, roof: 0x8f5e43 },
  villa: { family: "villa-warm-roof", floorHeightM: 3.1, minRows: 1, maxRows: 3, rowsPerBand: 3, minCols: 2, maxCols: 3, windowSpacingKm: 0.044, faceCount: 1, window: 0x7da9b1, litWindow: 0xf3cf86, band: 0xa88966, mullion: 0x6f5944, entrance: 0x9e744c, balcony: true, roof: 0x9f6645, roofGarden: true },
  village: { family: "village-masonry", floorHeightM: 3.0, minRows: 1, maxRows: 3, rowsPerBand: 3, minCols: 2, maxCols: 3, windowSpacingKm: 0.046, faceCount: 1, window: 0x739aaa, litWindow: 0xeec06f, band: 0xa2744d, mullion: 0x6d4f3d, entrance: 0x8f5d3b, balcony: false, roof: 0x9b6a3f },
  urban: { family: "mixed-urban-block", floorHeightM: 3.2, minRows: 2, maxRows: 6, rowsPerBand: 5, minCols: 3, maxCols: 5, windowSpacingKm: 0.038, faceCount: 2, window: 0x82b7c4, litWindow: 0xefcb82, band: 0x7c837f, mullion: 0x5d6663, entrance: 0x7b8b82, balcony: true, roof: 0x8d7460, roofEquipment: 1 },
  hospital: { family: "civic-clinical", floorHeightM: 3.5, minRows: 2, maxRows: 6, rowsPerBand: 5, minCols: 3, maxCols: 5, windowSpacingKm: 0.038, faceCount: 2, window: 0x9dd7d5, litWindow: 0xf4e3a0, band: 0x5fa99d, mullion: 0x6c918e, entrance: 0x7fb4ac, roof: 0xd8ddd7, roofEquipment: 2, roofGarden: true },
  clinic: { family: "urgent-care-clinic", floorHeightM: 3.5, minRows: 1, maxRows: 4, rowsPerBand: 3, minCols: 3, maxCols: 5, windowSpacingKm: 0.042, faceCount: 1, window: 0x9dd7d5, litWindow: 0xf4e3a0, band: 0x65aaa0, mullion: 0x668c88, entrance: 0x7fb4ac, roof: 0xd8ddd7, roofEquipment: 2, roofGarden: true },
  school: { family: "campus-masonry", floorHeightM: 3.2, minRows: 2, maxRows: 4, rowsPerBand: 4, minCols: 3, maxCols: 5, windowSpacingKm: 0.042, faceCount: 1, window: 0x7faec0, litWindow: 0xf0cf82, band: 0x9a7a56, mullion: 0x6f604d, entrance: 0x927251, roof: 0x8d7051, roofGarden: true },
  civic: { family: "civic-stone", floorHeightM: 3.6, minRows: 2, maxRows: 5, rowsPerBand: 4, minCols: 3, maxCols: 5, windowSpacingKm: 0.04, faceCount: 2, window: 0x90bfca, litWindow: 0xf2d18b, band: 0x9b8c70, mullion: 0x706858, entrance: 0x9b8a6a, roof: 0xb8ac88, roofEquipment: 1 },
  library: { family: "library-stone-reading-room", floorHeightM: 3.8, minRows: 2, maxRows: 4, rowsPerBand: 4, minCols: 3, maxCols: 5, windowSpacingKm: 0.044, faceCount: 2, window: 0x91bec8, litWindow: 0xf2d18b, band: 0xa8936e, mullion: 0x6f604c, entrance: 0xaa946f, roof: 0xb9a884, roofGarden: true },
  community_center: { family: "community-civic-pavilion", floorHeightM: 3.6, minRows: 1, maxRows: 4, rowsPerBand: 3, minCols: 3, maxCols: 5, windowSpacingKm: 0.046, faceCount: 1, window: 0x95c1c6, litWindow: 0xf3d38c, band: 0xb09768, mullion: 0x75614b, entrance: 0xb48c60, roof: 0xb7a071, roofGarden: true },
  industrial: { family: "industrial-shed", floorHeightM: 4.6, minRows: 1, maxRows: 3, rowsPerBand: 3, minCols: 2, maxCols: 4, windowSpacingKm: 0.06, faceCount: 1, window: 0x8fb0b6, litWindow: 0xe8c477, band: 0x777b76, mullion: 0x62665f, entrance: 0x77766a, roof: 0x8b8d86, roofEquipment: 4 },
  logistics: { family: "logistics-shed", floorHeightM: 4.8, minRows: 1, maxRows: 3, rowsPerBand: 3, minCols: 2, maxCols: 4, windowSpacingKm: 0.064, faceCount: 1, window: 0x91adb4, litWindow: 0xe8c477, band: 0x787a72, mullion: 0x62655f, entrance: 0x7f7b6c, roof: 0x898a80, roofEquipment: 4 },
  airport: { family: "transport-terminal", floorHeightM: 4.2, minRows: 2, maxRows: 4, rowsPerBand: 4, minCols: 3, maxCols: 6, windowSpacingKm: 0.044, faceCount: 2, window: 0xa4c8d1, litWindow: 0xf1d08a, band: 0x7b898b, mullion: 0x626d6f, entrance: 0x858f8d, roof: 0xaeb1ad, roofEquipment: 3 },
  port: { family: "port-terminal", floorHeightM: 4.0, minRows: 1, maxRows: 4, rowsPerBand: 4, minCols: 2, maxCols: 5, windowSpacingKm: 0.052, faceCount: 1, window: 0x8fb6c3, litWindow: 0xe9c276, band: 0x637c82, mullion: 0x53656b, entrance: 0x637b80, roof: 0x7d8d91, roofEquipment: 3 },
  powerplant: { family: "utility-plant", floorHeightM: 4.4, minRows: 1, maxRows: 3, rowsPerBand: 3, minCols: 2, maxCols: 4, windowSpacingKm: 0.06, faceCount: 1, window: 0x8fa6ad, litWindow: 0xe4bd75, band: 0x737068, mullion: 0x5f5d57, entrance: 0x777166, roof: 0x777870, roofEquipment: 5 },
  wastewater: { family: "utility-waterworks", floorHeightM: 3.6, minRows: 1, maxRows: 3, rowsPerBand: 3, minCols: 2, maxCols: 4, windowSpacingKm: 0.058, faceCount: 1, window: 0x8dbac0, litWindow: 0xe6c77d, band: 0x6b8587, mullion: 0x556b70, entrance: 0x687d80, roof: 0x74868a, roofEquipment: 3 },
  greenhouse: { family: "translucent-greenhouse", floorHeightM: 3.2, minRows: 1, maxRows: 2, rowsPerBand: 3, minCols: 3, maxCols: 5, windowSpacingKm: 0.038, faceCount: 2, window: 0xc9f7ea, litWindow: 0xe7fff6, band: 0x8ac2b3, mullion: 0x74a99c, entrance: 0x91c8ba, roof: 0xc9f3e5, roofEquipment: 1, verticalMullions: true },
  stadium: { family: "stadium-concourse", floorHeightM: 4.0, minRows: 1, maxRows: 3, rowsPerBand: 3, minCols: 3, maxCols: 5, windowSpacingKm: 0.05, faceCount: 1, window: 0xa5c4cb, litWindow: 0xf0cf83, band: 0x8a897f, mullion: 0x686860, entrance: 0x8a867a, roof: 0xaaa79b },
  landmark: { family: "landmark-tower", floorHeightM: 4.2, minRows: 3, maxRows: 10, rowsPerBand: 9, minCols: 2, maxCols: 5, windowSpacingKm: 0.04, faceCount: 2, window: 0xa5d2dc, litWindow: 0xf4da94, band: 0x7e9297, mullion: 0x606f73, entrance: 0x879a9b, roof: 0xd6ddd9, roofEquipment: 2, verticalMullions: true },
  office_tower: { family: "office-glass-grid", floorHeightM: 3.8, minRows: 3, maxRows: 9, rowsPerBand: 7, minCols: 3, maxCols: 6, windowSpacingKm: 0.034, faceCount: 2, window: 0xa9d0dc, litWindow: 0xf4d78c, band: 0x6d8793, mullion: 0x4d626b, entrance: 0x748f99, roof: 0xc4d0d2, roofEquipment: 3, verticalMullions: true },
  hotel: { family: "hotel-balcony-tower", floorHeightM: 3.4, minRows: 2, maxRows: 7, rowsPerBand: 5, minCols: 3, maxCols: 5, windowSpacingKm: 0.038, faceCount: 2, window: 0x8fb8c2, litWindow: 0xf3cf86, band: 0xa28e73, mullion: 0x746554, entrance: 0xa08460, balcony: true, roof: 0xaa9678, roofGarden: true },
  market: { family: "market-arcade", floorHeightM: 3.6, minRows: 1, maxRows: 3, rowsPerBand: 3, minCols: 3, maxCols: 6, windowSpacingKm: 0.052, faceCount: 1, window: 0x89b2ba, litWindow: 0xf4cf7f, band: 0xb28a5d, mullion: 0x7c5f45, entrance: 0xb07b4e, roof: 0x9a7350 },
  fire_station: { family: "emergency-red-bay", floorHeightM: 3.8, minRows: 1, maxRows: 3, rowsPerBand: 3, minCols: 2, maxCols: 4, windowSpacingKm: 0.052, faceCount: 1, window: 0x9fc3c9, litWindow: 0xf2cf80, band: 0xb45d52, mullion: 0x7f463f, entrance: 0xc26a5b, roof: 0x8e6b64, roofEquipment: 1 },
  police_station: { family: "civic-security", floorHeightM: 3.5, minRows: 1, maxRows: 3, rowsPerBand: 3, minCols: 2, maxCols: 4, windowSpacingKm: 0.048, faceCount: 1, window: 0x96bdc7, litWindow: 0xeed086, band: 0x778a9a, mullion: 0x566675, entrance: 0x6f8493, roof: 0x8e989e, roofEquipment: 1 },
  data_center: { family: "data-center-utility", floorHeightM: 4.8, minRows: 1, maxRows: 3, rowsPerBand: 3, minCols: 2, maxCols: 5, windowSpacingKm: 0.07, faceCount: 1, window: 0x879daa, litWindow: 0xd9c582, band: 0x737f88, mullion: 0x59646d, entrance: 0x747d84, roof: 0x7d858c, roofEquipment: 5 },
  substation: { family: "substation-yard", floorHeightM: 3.8, minRows: 1, maxRows: 2, rowsPerBand: 3, minCols: 1, maxCols: 3, windowSpacingKm: 0.06, faceCount: 1, window: 0x8fa7aa, litWindow: 0xe4c27a, band: 0x837b68, mullion: 0x625c4d, entrance: 0x766f5f, roof: 0x837f73, roofEquipment: 5 },
  metro_station: { family: "metro-station-pavilion", floorHeightM: 4.0, minRows: 1, maxRows: 3, rowsPerBand: 3, minCols: 3, maxCols: 5, windowSpacingKm: 0.046, faceCount: 2, window: 0x9ec2cf, litWindow: 0xf0d489, band: 0x6f8390, mullion: 0x536675, entrance: 0x738795, roof: 0x919da4, roofEquipment: 2 },
  bus_terminal: { family: "bus-terminal-platform", floorHeightM: 4.2, minRows: 1, maxRows: 3, rowsPerBand: 3, minCols: 3, maxCols: 6, windowSpacingKm: 0.052, faceCount: 2, window: 0x9ec2cf, litWindow: 0xf0d489, band: 0x718590, mullion: 0x53646a, entrance: 0x7d8e93, roof: 0x8f9ba0, roofEquipment: 2 },
  water_tower: { family: "waterworks-service-base", floorHeightM: 3.8, minRows: 1, maxRows: 2, rowsPerBand: 3, minCols: 1, maxCols: 3, windowSpacingKm: 0.06, faceCount: 1, window: 0x94b8bf, litWindow: 0xe6c77d, band: 0x7b8d91, mullion: 0x5b686c, entrance: 0x708186, roof: 0x9da9ad, roofEquipment: 1 },
  observatory: { family: "observatory-dome-base", floorHeightM: 3.6, minRows: 1, maxRows: 3, rowsPerBand: 3, minCols: 2, maxCols: 4, windowSpacingKm: 0.05, faceCount: 1, window: 0xa8d0d4, litWindow: 0xf4d88c, band: 0x7e9290, mullion: 0x606f6d, entrance: 0x829493, roof: 0xc8d3d2, roofEquipment: 1 },
  cable_car_station: { family: "cable-car-terminal", floorHeightM: 3.8, minRows: 1, maxRows: 2, rowsPerBand: 3, minCols: 2, maxCols: 4, windowSpacingKm: 0.052, faceCount: 1, window: 0x9fc2c7, litWindow: 0xf0d489, band: 0x838a82, mullion: 0x626861, entrance: 0x85897e, roof: 0x9fa08e, roofEquipment: 1 },
  flood_pump_station: { family: "flood-pump-works", floorHeightM: 3.8, minRows: 1, maxRows: 2, rowsPerBand: 3, minCols: 1, maxCols: 3, windowSpacingKm: 0.06, faceCount: 1, window: 0x91bdc3, litWindow: 0xe9c276, band: 0x6e8588, mullion: 0x566b70, entrance: 0x6d7f82, roof: 0x77898d, roofEquipment: 3 },
  desalination_plant: { family: "desalination-process-plant", floorHeightM: 4.4, minRows: 1, maxRows: 3, rowsPerBand: 3, minCols: 2, maxCols: 4, windowSpacingKm: 0.058, faceCount: 1, window: 0x96c4cc, litWindow: 0xe6c77d, band: 0x718b90, mullion: 0x596e73, entrance: 0x738489, roof: 0x80979d, roofEquipment: 5 },
  hydropower_plant: { family: "hydropower-turbine-hall", floorHeightM: 4.6, minRows: 2, maxRows: 4, rowsPerBand: 3, minCols: 2, maxCols: 5, windowSpacingKm: 0.058, faceCount: 1, window: 0x8fb9c2, litWindow: 0xe6c77d, band: 0x6d858c, mullion: 0x53676d, entrance: 0x6d7b80, roof: 0x72868c, roofEquipment: 5 },
  geothermal_plant: { family: "geothermal-wellfield-plant", floorHeightM: 4.4, minRows: 1, maxRows: 3, rowsPerBand: 3, minCols: 2, maxCols: 4, windowSpacingKm: 0.058, faceCount: 1, window: 0x9fb6b4, litWindow: 0xe9c276, band: 0x8a7a6c, mullion: 0x695e55, entrance: 0x83776a, roof: 0x8d8176, roofEquipment: 5 },
  water_treatment_plant: { family: "water-treatment-process-plant", floorHeightM: 4.0, minRows: 1, maxRows: 3, rowsPerBand: 3, minCols: 2, maxCols: 4, windowSpacingKm: 0.056, faceCount: 1, window: 0x96c3ca, litWindow: 0xe6c77d, band: 0x6f8b91, mullion: 0x587078, entrance: 0x71848a, roof: 0x7d9298, roofEquipment: 4 },
  mountain_refuge: { family: "alpine-refuge-stone-lodge", floorHeightM: 3.1, minRows: 1, maxRows: 2, rowsPerBand: 2, minCols: 2, maxCols: 3, windowSpacingKm: 0.044, faceCount: 1, window: 0x8db1b5, litWindow: 0xf0c978, band: 0x9b815c, mullion: 0x6f5f48, entrance: 0x8e704d, roof: 0x80634b, roofGarden: true },
  ferry_terminal: { family: "ferry-terminal-pavilion", floorHeightM: 3.8, minRows: 1, maxRows: 3, rowsPerBand: 3, minCols: 3, maxCols: 5, windowSpacingKm: 0.05, faceCount: 2, window: 0x9ec7d0, litWindow: 0xf0d489, band: 0x708894, mullion: 0x536974, entrance: 0x748895, roof: 0x879ba2, roofEquipment: 2 },
  fire_watch_tower: { family: "fire-watch-lookout-tower", floorHeightM: 3.2, minRows: 1, maxRows: 2, rowsPerBand: 2, minCols: 1, maxCols: 2, windowSpacingKm: 0.05, faceCount: 1, window: 0x9cc1c3, litWindow: 0xefc577, band: 0x9c7855, mullion: 0x6f543e, entrance: 0x876247, roof: 0x7f6146, roofEquipment: 1 },
  visitor_center: { family: "visitor-center-lodge", floorHeightM: 3.6, minRows: 1, maxRows: 3, rowsPerBand: 3, minCols: 3, maxCols: 5, windowSpacingKm: 0.048, faceCount: 1, window: 0x91bdc5, litWindow: 0xf2cf80, band: 0xb08e5d, mullion: 0x75654f, entrance: 0xb38a58, roof: 0x8b6c49, roofGarden: true },
  scenic_overlook: { family: "scenic-overlook-deck", floorHeightM: 3.2, minRows: 1, maxRows: 2, rowsPerBand: 2, minCols: 1, maxCols: 3, windowSpacingKm: 0.05, faceCount: 1, window: 0xa9c8ca, litWindow: 0xeecb7e, band: 0x9d8e6d, mullion: 0x6f6652, entrance: 0x9b8158, roof: 0x8e7e60 },
  trailhead: { family: "trailhead-kiosk", floorHeightM: 3.0, minRows: 1, maxRows: 2, rowsPerBand: 2, minCols: 1, maxCols: 3, windowSpacingKm: 0.052, faceCount: 1, window: 0x8eb2ad, litWindow: 0xe9c879, band: 0x937d54, mullion: 0x665943, entrance: 0x806b45, roof: 0x7a6446 },
  ranger_station: { family: "ranger-field-station", floorHeightM: 3.2, minRows: 1, maxRows: 3, rowsPerBand: 3, minCols: 2, maxCols: 4, windowSpacingKm: 0.048, faceCount: 1, window: 0x8fb8b4, litWindow: 0xefc577, band: 0x7d915e, mullion: 0x596843, entrance: 0x78834f, roof: 0x617548, roofGarden: true },
  gauging_station: { family: "hydrometric-instrument-hut", floorHeightM: 3.0, minRows: 1, maxRows: 1, rowsPerBand: 2, minCols: 1, maxCols: 2, windowSpacingKm: 0.05, faceCount: 1, window: 0x96c5cf, litWindow: 0xd9c582, band: 0x6d939b, mullion: 0x526f76, entrance: 0x6f8a90, roof: 0x6f9098 },
  tunnel_portal: { family: "tunnel-portal-concrete", floorHeightM: 4.2, minRows: 1, maxRows: 2, rowsPerBand: 3, minCols: 1, maxCols: 3, windowSpacingKm: 0.06, faceCount: 1, window: 0x7f9094, litWindow: 0xd8bf78, band: 0x70685d, mullion: 0x555047, entrance: 0x746b60, roof: 0x797267 },
  research_station: { family: "research-field-station", floorHeightM: 3.3, minRows: 1, maxRows: 3, rowsPerBand: 3, minCols: 2, maxCols: 4, windowSpacingKm: 0.046, faceCount: 1, window: 0x9fc4c0, litWindow: 0xefd28b, band: 0xa3ad9a, mullion: 0x707867, entrance: 0x89927f, roof: 0x9ca58f, roofGarden: true },
  farmstead: { family: "farmstead-courtyard", floorHeightM: 3.0, minRows: 1, maxRows: 2, rowsPerBand: 3, minCols: 2, maxCols: 3, windowSpacingKm: 0.048, faceCount: 1, window: 0x7fa5a8, litWindow: 0xefc577, band: 0xb08755, mullion: 0x6f583c, entrance: 0xa47045, roof: 0x9b6b3c, roofGarden: true },
  terrace_farm: { family: "terrace-service-shed", floorHeightM: 3.0, minRows: 1, maxRows: 2, rowsPerBand: 3, minCols: 1, maxCols: 3, windowSpacingKm: 0.052, faceCount: 1, window: 0x8eb2a4, litWindow: 0xe9c879, band: 0x8fa064, mullion: 0x667143, entrance: 0x7d8a4f, roof: 0x8b9a55, roofGarden: true },
  custom: { family: "custom-mixed", floorHeightM: 3.2, minRows: 1, maxRows: 4, rowsPerBand: 4, minCols: 2, maxCols: 4, windowSpacingKm: 0.044, faceCount: 1, window: 0x83aebe, litWindow: 0xedc77d, band: 0x82776a, mullion: 0x62584d, entrance: 0x81705f, roof: 0x8f5e43, roofEquipment: 1 }
};

const LINEAR_INFRA_TYPES = new Set(["transport", "rail", "bridge", "canal", "levee", "dam", "metro_station", "tunnel_portal", "cable_car_station", "ferry_terminal"]);

export const rendererScaleDiagnostics = {
  buildingMetrics({ type = "custom", heightM = 10, density = 0.1, cellKm = 0.5, verticalScale = 1, x = 0, y = 0, seed = 0 } = {}) {
    const heightKm = visualBuildingHeight(heightM, verticalScale);
    const width0 = buildingFootprint(type, density, cellKm, 0, x, y, seed);
    const depth0 = width0 * 0.9;
    const balanced = balanceBuildingPrism(type, width0, depth0, heightKm, cellKm);
    return {
      heightKm: roundDiagnostic(heightKm),
      widthKm: roundDiagnostic(balanced.width),
      depthKm: roundDiagnostic(balanced.depth),
      slenderness: roundDiagnostic(balanced.slenderness)
    };
  },
  buildingFacadePlan({ type = "custom", heightM = 10, widthKm = 0.12, depthKm = 0.1 } = {}) {
    return buildingFacadeDetailPlan(type, heightM, widthKm, depthKm);
  },
  buildingRealityPlan({ type = "custom", heightM = 10, widthKm = 0.12, depthKm = 0.1 } = {}) {
    return buildingRealityDetailPlan(type, heightM, widthKm, depthKm);
  },
  buildingMaterialPlan({ type = "custom", fallback = undefined, heightM = 10, widthKm = 0.12, depthKm = 0.1, x = 0, y = 0, seed = 0, disasterVisual = 0 } = {}) {
    return buildingMaterialColorPlan({ type, fallback, heightM, widthKm, depthKm, x, y, seed, disasterVisual });
  },
  towerMetrics({ heightM = 100, cellKm = 0.5, verticalScale = 1, minRadiusKm = 0.045, maxAspect = 7 } = {}) {
    const heightKm = visualBuildingHeight(heightM, verticalScale);
    const radiusKm = towerPlanWidth(heightKm, cellKm, minRadiusKm, maxAspect);
    return {
      heightKm: roundDiagnostic(heightKm),
      radiusKm: roundDiagnostic(radiusKm),
      slenderness: roundDiagnostic(heightKm / Math.max(0.001, radiusKm))
    };
  },
  vegetationMetrics({ canopyM = 20, cover = 0.6, cellKm = 0.5, verticalScale = 1 } = {}) {
    const heightKm = visualCanopyHeight(canopyM, cover, verticalScale);
    const crownRadiusKm = vegetationCrownRadius(heightKm, cover, cellKm);
    return {
      heightKm: roundDiagnostic(heightKm),
      crownRadiusKm: roundDiagnostic(crownRadiusKm),
      slenderness: roundDiagnostic(heightKm / Math.max(0.001, crownRadiusKm))
    };
  }
};

export const rendererRefreshDiagnostics = {
  terrainRefreshStats({ n = 0, dirtyBounds = null, tileSize = 64 } = {}) {
    return terrainRefreshStats(n, dirtyBounds, tileSize);
  }
};

export const rendererLoadDiagnostics = {
  detailBudgetPlan(input = {}) {
    return detailBudgetPlan(input);
  }
};

if (typeof globalThis !== "undefined") {
  globalThis.__geoLabRendererLoadDiagnostics = rendererLoadDiagnostics;
}

export class TerrainRenderer {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x081210);
    this.scene.fog = new THREE.FogExp2(0x081210, 0.035 * (20 / MAP_SIZE_KM));

    this.camera = new THREE.PerspectiveCamera(54, 1, 0.01, Math.max(160, MAP_SIZE_KM * 10));
    const home = cameraHome(MAP_SIZE_KM);
    this.camera.position.set(home.x, home.y, home.z);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      precision: "highp",
      logarithmicDepthBuffer: true
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = false;
    this.renderer.localClippingEnabled = true;
    this.parallelShaderCompileSupported = Boolean(
      this.renderer.getContext().getExtension("KHR_parallel_shader_compile")
    );
    this.container.appendChild(this.renderer.domElement);
    this.gpuStats = gpuCapabilitySnapshot(this.renderer);
    if (typeof globalThis !== "undefined") globalThis.__geoLabGpuStats = this.gpuStats;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 0.28;
    this.controls.maxDistance = Math.max(68, MAP_SIZE_KM * 3.4);
    this.controls.maxPolarAngle = Math.PI * 0.97;
    this.controls.target.set(0, 0.6, 0);

    this.terrain = null;
    this.terrainTileGroup = new THREE.Group();
    this.terrainTileGroup.name = "terrain tile surface";
    this.terrainTiles = [];
    this.terrainTileKey = "";
    this.rivers = null;
    this.vegetation = null;
    this.vegetationVisible = true;
    this.lastTerrainRefreshStats = null;
    this.lastTerrainTileStats = null;
    this.detailBuildToken = 0;
    this.detailBuildTask = null;
    this.detailLayerSchedulerMode = typeof globalThis.scheduler?.postTask === "function"
      ? "user-blocking-post-task"
      : "animation-frame-fallback";
    this.renderLoadStats = null;
    this.blockDetailAtlasCache = new WeakMap();
    this.sharedGeometryCache = new Map();
    this.gpuPipelineWarmupStats = { status: "idle", phases: [] };
    this.sceneDiagnosticsDirty = true;
    this.disposed = false;
    this.isDocumentVisible = !document.hidden;
    this.lastWildlifeAnimationAt = 0;
    this.renderContextState = { status: "ready", lossCount: 0, restoredCount: 0 };
    this.contextRecovery = null;
    if (typeof globalThis !== "undefined") globalThis.__geoLabRenderContextState = this.renderContextState;
    this.terrainDetailGroup = new THREE.Group();
    this.terrainDetailGroup.name = "精细地表构件";
    this.subsurfaceGroup = new THREE.Group();
    this.subsurfaceGroup.name = "地下立方体剖切";
    this.infrastructureGroup = new THREE.Group();
    this.infrastructureGroup.name = "程序化人造环境";
    this.wildlifeGroup = new THREE.Group();
    this.wildlifeGroup.name = "动物与迁徙廊道";
    this.wildlifeRenderSets = [];
    this.hazardGroup = new THREE.Group();
    this.hazardGroup.name = "时间灾害叠加";
    this.windGroup = new THREE.Group();
    this.windGroup.name = "局地风矢量";
    [
      this.subsurfaceGroup,
      this.terrainDetailGroup,
      this.infrastructureGroup,
      this.wildlifeGroup,
      this.hazardGroup,
      this.windGroup
    ].forEach((group) => bindSharedGeometryCache(group, this.sharedGeometryCache));
    this.scene.add(this.terrainTileGroup);
    this.scene.add(this.subsurfaceGroup);
    this.scene.add(this.terrainDetailGroup);
    this.scene.add(this.infrastructureGroup);
    this.scene.add(this.wildlifeGroup);
    this.scene.add(this.hazardGroup);
    this.scene.add(this.windGroup);

    const hemi = new THREE.HemisphereLight(0xd8f2ff, 0x405246, 1.4);
    this.scene.add(hemi);
    this.scene.add(new THREE.AmbientLight(0xc8d8d1, 0.28));
    const sun = new THREE.DirectionalLight(0xfff0cf, 2.5);
    sun.position.set(-12, 18, 10);
    this.scene.add(sun);
    const skyFill = new THREE.DirectionalLight(0x9fc8dd, 0.82);
    skyFill.position.set(14, 7, -11);
    this.scene.add(skyFill);
    this.sceneVolume = new SceneVolume(this.scene);

    this.grid = null;
    this.gridSizeKm = 0;
    this.updateGrid(MAP_SIZE_KM);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.handleWebGLContextLost = this.handleWebGLContextLost.bind(this);
    this.handleWebGLContextRestored = this.handleWebGLContextRestored.bind(this);
    this.handleTerrainDoubleClick = this.handleTerrainDoubleClick.bind(this);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.renderer.domElement.addEventListener("webglcontextlost", this.handleWebGLContextLost, false);
    this.renderer.domElement.addEventListener("webglcontextrestored", this.handleWebGLContextRestored, false);
    this.renderer.domElement.addEventListener("dblclick", this.handleTerrainDoubleClick);
    this.resize();
    this.animate = this.animate.bind(this);
    this.frame = requestAnimationFrame(this.animate);
  }

  setModel(model, params, viewMode) {
    this.cancelDeferredDetailBuild();
    const loadStart = performance.now();
    const stageTimings = [];
    const timedBuild = (name, build) => {
      const start = performance.now();
      build();
      stageTimings.push({ name, ms: roundDiagnostic(performance.now() - start) });
    };
    const token = ++this.detailBuildToken;
    const previousSizeKm = modelSizeKm(this.model);
    this.model = model;
    this.params = params;
    this.viewMode = viewMode;
    this.activeDetailBudgetPlan = detailBudgetPlan({ n: model.n, renderDetailQuality: params?.renderDetailQuality });
    const pixelRatioCap = this.activeDetailBudgetPlan.quality === "exhaustive"
      ? 3
      : this.activeDetailBudgetPlan.quality === "ultra" ? 2.5 : 2;
    const supersamplingFactor = this.activeDetailBudgetPlan.quality === "exhaustive"
      ? 1.5
      : this.activeDetailBudgetPlan.quality === "ultra" ? 1.2 : 1;
    const activePixelRatio = Math.min((window.devicePixelRatio || 1) * supersamplingFactor, pixelRatioCap);
    this.renderer.setPixelRatio(activePixelRatio);
    this.gpuStats = {
      ...gpuCapabilitySnapshot(this.renderer),
      activePixelRatio,
      supersamplingFactor,
      renderDetailQuality: this.activeDetailBudgetPlan.quality
    };
    if (typeof globalThis !== "undefined") globalThis.__geoLabGpuStats = this.gpuStats;
    this.activeTerrainMaterialPlan = terrainPresetMaterialPlan(params, model.stats);
    this.clearDeferredDetailLayers();
    timedBuild("scene-scale", () => this.updateSceneScale(previousSizeKm !== modelSizeKm(model)));
    timedBuild("terrain-surface", () => this.buildTerrainMesh());
    timedBuild("rivers", () => this.buildRivers());
    timedBuild("wind-arrows", () => this.buildWindArrows());
    if (["section", "underwater"].includes(params.worldView)) this.focusVolumeView();
    this.applySceneVisibility();
    this.renderLoadStats = {
      mode: "staged-detail-layers",
      token,
      completed: false,
      cancelled: false,
      firstPhaseLayerNames: [...FIRST_PHASE_LAYER_NAMES],
      deferredLayerNames: [...DEFERRED_DETAIL_LAYER_NAMES],
      detailLayerSchedulerMode: this.detailLayerSchedulerMode,
      detailBudgetPlan: this.activeDetailBudgetPlan,
      terrainMaterialPlan: this.activeTerrainMaterialPlan,
      completedLayerNames: [...FIRST_PHASE_LAYER_NAMES],
      pendingLayerNames: [...DEFERRED_DETAIL_LAYER_NAMES],
      stageTimings,
      startedAtMs: loadStart,
      firstPhaseMs: roundDiagnostic(performance.now() - loadStart),
      totalMs: roundDiagnostic(performance.now() - loadStart)
    };
    this.publishRenderLoadStats();
    this.warmGpuPipelines(token, "first-phase");
    this.scheduleDeferredDetailLayers(token, loadStart);
  }

  cancelDeferredDetailBuild() {
    if (this.detailBuildTask !== null) {
      this.detailBuildTask.cancel();
      this.detailBuildTask = null;
    }
    if (this.renderLoadStats && !this.renderLoadStats.completed) {
      this.renderLoadStats.cancelled = true;
      this.renderLoadStats.pendingLayerNames = [];
      this.publishRenderLoadStats();
    }
  }

  clearDeferredDetailLayers() {
    disposeObjectTree(this.subsurfaceGroup);
    disposeObjectTree(this.terrainDetailGroup);
    disposeObjectTree(this.infrastructureGroup);
    disposeObjectTree(this.wildlifeGroup);
    this.wildlifeRenderSets = [];
    disposeObjectTree(this.hazardGroup);
    if (this.vegetation) {
      this.scene.remove(this.vegetation);
      disposeObjectTree(this.vegetation);
      this.vegetation = null;
    }
  }

  scheduleDetailLayerTask(callback) {
    if (this.detailLayerSchedulerMode === "user-blocking-post-task") {
      const task = {
        cancelled: false,
        cancel() {
          task.cancelled = true;
        }
      };
      try {
        globalThis.scheduler.postTask(() => {
          if (!task.cancelled) callback();
        }, { priority: "user-blocking" }).catch((error) => {
          if (!task.cancelled) setTimeout(() => { throw error; }, 0);
        });
        return task;
      } catch {
        this.detailLayerSchedulerMode = "animation-frame-fallback";
      }
    }
    const frame = requestAnimationFrame(callback);
    return {
      cancel() {
        cancelAnimationFrame(frame);
      }
    };
  }

  scheduleDeferredDetailLayers(token, loadStart, startIndex = 0) {
    const layers = [
      { name: "subsurface", build: () => this.buildSubsurface3D() },
      { name: "terrain-details", build: () => this.buildTerrainDetails() },
      { name: "vegetation", build: () => this.buildVegetation() },
      { name: "wildlife", build: () => this.buildWildlife3D() },
      { name: "infrastructure", build: () => this.buildInfrastructure3D() },
      { name: "hazards", build: () => this.buildHazards3D() }
    ];
    const runLayer = (index) => {
      if (token !== this.detailBuildToken || !this.renderLoadStats) return;
      if (index >= layers.length) {
        this.detailBuildTask = null;
        this.renderLoadStats.completed = true;
        this.renderLoadStats.pendingLayerNames = [];
        this.renderLoadStats.totalMs = roundDiagnostic(performance.now() - loadStart);
        this.publishRenderLoadStats();
        this.sceneDiagnosticsDirty = true;
        if (typeof globalThis !== "undefined" && globalThis.__geoLabStartupStats) {
          globalThis.__geoLabStartupStats.renderCompletedAtMs = performance.now();
          globalThis.__geoLabStartupStats.totalReadyMs = roundDiagnostic(performance.now() - globalThis.__geoLabStartupStats.bootStartedAtMs);
          globalThis.__geoLabStartupStats.completed = true;
        }
        if (this.renderContextState.status === "restoring") {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (this.disposed || token !== this.detailBuildToken || this.renderContextState.status !== "restoring") return;
              this.renderContextState = {
                ...this.renderContextState,
                status: "ready",
                readyAtMs: performance.now()
              };
              if (typeof globalThis !== "undefined") globalThis.__geoLabRenderContextState = this.renderContextState;
              this.warmGpuPipelines(token, "full-scene");
            });
          });
          return;
        }
        this.warmGpuPipelines(token, "full-scene");
        return;
      }
      this.detailBuildTask = this.scheduleDetailLayerTask(() => {
        if (token !== this.detailBuildToken || !this.renderLoadStats) return;
        const layer = layers[index];
        const start = performance.now();
        layer.build();
        this.applySceneVisibility();
        this.renderLoadStats.stageTimings.push({ name: layer.name, ms: roundDiagnostic(performance.now() - start) });
        this.renderLoadStats.completedLayerNames.push(layer.name);
        this.renderLoadStats.pendingLayerNames = layers.slice(index + 1).map((item) => item.name);
        this.renderLoadStats.totalMs = roundDiagnostic(performance.now() - loadStart);
        this.publishRenderLoadStats();
        runLayer(index + 1);
      });
    };
    runLayer(startIndex);
  }

  publishRenderLoadStats() {
    if (typeof globalThis !== "undefined") {
      globalThis.__geoLabRenderLoadStats = this.renderLoadStats;
    }
  }

  warmGpuPipelines(token, phase) {
    const startedAt = performance.now();
    const phaseRecord = { phase, status: "running", ms: 0 };
    this.gpuPipelineWarmupStats = {
      status: "running",
      method: this.parallelShaderCompileSupported && typeof this.renderer.compileAsync === "function"
        ? "parallel-shader-compile"
        : "synchronous-compile-fallback",
      token,
      phases: [...(this.gpuPipelineWarmupStats?.phases || []).filter((item) => item.phase !== phase), phaseRecord]
    };
    if (typeof globalThis !== "undefined") globalThis.__geoLabGpuPipelineWarmupStats = this.gpuPipelineWarmupStats;
    const updateWarmupStatus = () => {
      const phases = this.gpuPipelineWarmupStats?.phases || [];
      const fullScene = phases.find((item) => item.phase === "full-scene");
      if (!fullScene || fullScene.status === "running") {
        this.gpuPipelineWarmupStats.status = "running";
      } else if (fullScene.status === "error" || phases.some((item) => item.status === "error")) {
        this.gpuPipelineWarmupStats.status = "degraded";
      } else {
        this.gpuPipelineWarmupStats.status = "ready";
      }
    };
    requestAnimationFrame(() => {
      if (this.disposed || token !== this.detailBuildToken) return;
      if (this.renderContextState.status === "lost") {
        phaseRecord.status = "deferred-context-lost";
        phaseRecord.ms = roundDiagnostic(performance.now() - startedAt);
        updateWarmupStatus();
        if (typeof globalThis !== "undefined") globalThis.__geoLabGpuPipelineWarmupStats = this.gpuPipelineWarmupStats;
        return;
      }
      let compileTask;
      try {
        compileTask = this.parallelShaderCompileSupported && typeof this.renderer.compileAsync === "function"
          ? this.renderer.compileAsync(this.scene, this.camera)
          : Promise.resolve(this.renderer.compile(this.scene, this.camera));
      } catch (error) {
        compileTask = Promise.reject(error);
      }
      Promise.resolve(compileTask).then(() => {
        if (this.disposed || token !== this.detailBuildToken) return;
        phaseRecord.status = "ready";
        phaseRecord.ms = roundDiagnostic(performance.now() - startedAt);
        updateWarmupStatus();
        if (typeof globalThis !== "undefined") globalThis.__geoLabGpuPipelineWarmupStats = this.gpuPipelineWarmupStats;
      }).catch((error) => {
        if (this.disposed || token !== this.detailBuildToken) return;
        phaseRecord.status = "error";
        phaseRecord.ms = roundDiagnostic(performance.now() - startedAt);
        phaseRecord.error = error?.message || String(error);
        updateWarmupStatus();
        if (typeof globalThis !== "undefined") globalThis.__geoLabGpuPipelineWarmupStats = this.gpuPipelineWarmupStats;
      });
    });
  }

  updateTerrainSurface(model, params, viewMode, dirtyBounds = null) {
    const previousSizeKm = modelSizeKm(this.model);
    this.model = model;
    this.params = params;
    this.viewMode = viewMode;
    this.updateSceneScale(previousSizeKm !== modelSizeKm(model));
    this.buildTerrainMesh(dirtyBounds);
    if (["section", "underwater"].includes(params.worldView)) this.focusVolumeView();
    if (typeof globalThis !== "undefined") {
      globalThis.__geoLabTerrainRefreshStats = this.lastTerrainRefreshStats;
      globalThis.__geoLabTerrainTileStats = this.lastTerrainTileStats;
    }
  }

  updateInfrastructure3DOptions(params = this.params) {
    this.params = params || this.params;
    if (!this.model) return null;
    this.buildInfrastructure3D();
    this.applySceneVisibility();
    this.sceneDiagnosticsDirty = true;
    return this.infrastructure3DStats || null;
  }

  updateWildlife3DOptions(params = this.params) {
    this.params = params || this.params;
    if (!this.model) return null;
    this.buildWildlife3D();
    this.applySceneVisibility();
    this.sceneDiagnosticsDirty = true;
    return this.wildlife3DStats || null;
  }

  updateDetailQualityOptions(params = this.params, viewMode = this.viewMode) {
    this.params = params || this.params;
    if (!this.model) return null;
    this.setModel(this.model, this.params, viewMode || this.viewMode);
    return this.activeDetailBudgetPlan || null;
  }

  updateWorldViewOptions(params = this.params) {
    if (!this.model || !this.sceneVolume) return null;
    const previous = this.sceneVolume.config;
    this.params = params;
    this.sceneVolume.rebuild(this.model, params, this.terrainTiles, this.viewMode);
    if (this.shouldShowSubsurface3D()) this.buildSubsurface3D();
    this.applySceneVisibility();
    const next = this.sceneVolume.config;
    if (previous?.mode !== next.mode || (next.mode === "section" && (previous.cutX !== next.cutX || previous.depthScale !== next.depthScale))) this.focusVolumeView();
    this.sceneDiagnosticsDirty = true;
    return this.sceneVolume.stats;
  }

  focusVolumeView() {
    const volume = this.sceneVolume;
    if (!volume?.config) return;
    const { mode, sizeKm, cutX } = volume.config;
    if (mode === "underwater") {
      if (!volume.focus) return;
      const { x, y, z, depthKm } = volume.focus;
      this.controls.minDistance = Math.max(0.0001, depthKm * 0.05);
      this.camera.near = Math.max(0.00001, depthKm * 0.001);
      this.controls.target.set(x, y + depthKm * 0.25, z - depthKm);
      this.camera.position.set(x, y + depthKm * 0.65, z);
    } else if (mode === "section") {
      const targetY = (volume.baseY + terrainCameraFocusY(this.model, this.params)) * 0.5;
      this.controls.target.set(cutX - sizeKm * 0.1, targetY, 0);
      const aspectScale = Math.max(1, 1.2 / this.camera.aspect);
      this.camera.position.set(cutX + sizeKm * 0.8 * aspectScale, targetY + sizeKm * 0.36 * aspectScale, sizeKm * 0.8 * aspectScale);
    } else {
      this.resetCamera();
    }
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  updateView(viewMode, dirtyBounds = null) {
    this.viewMode = viewMode;
    if (!this.model || !this.terrainTiles?.length) return;
    const range = terrainDirtyVertexRange(this.model, dirtyBounds);
    const touchedTiles = selectTerrainTilesForRange(this.terrainTiles, range);
    touchedTiles.forEach((tile) => {
      updateTerrainTileMesh(tile, this.model, this.params, viewMode, { updateHeights: false, updateColors: true });
    });
    this.updateSceneVisibility(this.params, viewMode);
  }

  updateSceneVisibility(params = this.params, viewMode = this.viewMode) {
    this.params = params || this.params || {};
    this.viewMode = viewMode || this.viewMode;
    if (this.model) {
      if (this.shouldShowSubsurface3D() && this.subsurfaceGroup.children.length === 0) this.buildSubsurface3D();
      if (this.shouldShowTerrainDetails3D() && this.terrainDetailGroup.children.length === 0) this.buildTerrainDetails();
      if (this.shouldShowWind3D() && this.windGroup.children.length === 0) this.buildWindArrows();
      if (this.shouldShowHazards3D() && this.hazardGroup.children.length === 0) this.buildHazards3D();
    }
    this.applySceneVisibility();
    this.sceneDiagnosticsDirty = true;
    return {
      volume: this.sceneVolume?.stats,
      subsurface: this.subsurfaceGroup.visible,
      terrainDetails: this.terrainDetailGroup.visible,
      wind: this.windGroup.visible,
      grid: this.grid?.visible === true,
      wildlife: this.wildlifeGroup.visible,
      hazards: this.hazardGroup.visible
    };
  }

  shouldShowSubsurface3D() {
    return this.params?.subsurface3DEnabled === true || SUBSURFACE_3D_VIEW_MODES.has(String(this.viewMode || ""));
  }

  shouldShowTerrainDetails3D() {
    return this.params?.terrainDetail3DEnabled === true;
  }

  shouldShowWind3D() {
    return this.params?.wind3DEnabled === true || this.viewMode === "wind";
  }

  shouldShowHazards3D() {
    return String(this.params?.disasterMode || "none") !== "none" || HAZARD_3D_VIEW_MODES.has(String(this.viewMode || ""));
  }

  applySceneVisibility() {
    this.subsurfaceGroup.visible = this.shouldShowSubsurface3D();
    this.terrainDetailGroup.visible = this.shouldShowTerrainDetails3D();
    this.windGroup.visible = this.shouldShowWind3D();
    this.wildlifeGroup.visible = this.params?.wildlife3DEnabled === true;
    this.hazardGroup.visible = this.shouldShowHazards3D();
    if (this.grid) this.grid.visible = this.params?.grid3DEnabled === true;
    this.sceneVolume?.setVisibility(this.params, this.viewMode);
    this.sceneVolume?.applyClipping([this.terrainTileGroup, this.rivers, this.vegetation,
      this.terrainDetailGroup, this.infrastructureGroup, this.wildlifeGroup, this.hazardGroup, this.windGroup, this.subsurfaceGroup, this.grid]);
  }

  updateTemporalState(model, params, viewMode) {
    const start = performance.now();
    this.model = model;
    this.params = params;
    this.viewMode = viewMode;
    const updatedLayers = [];
    const stageTimings = [];
    const timed = (name, build) => {
      const stageStart = performance.now();
      build();
      stageTimings.push({ name, ms: roundDiagnostic(performance.now() - stageStart) });
      updatedLayers.push(name);
    };
    if (isTemporalViewMode(viewMode)) timed("terrain-surface-colors", () => this.updateView(viewMode));
    timed("hazards", () => this.buildHazards3D());
    timed("wildlife", () => this.buildWildlife3D());
    timed("infrastructure", () => this.buildInfrastructure3D());
    this.applySceneVisibility();
    this.sceneDiagnosticsDirty = true;
    this.lastTemporalRenderStats = {
      mode: "temporal-layer-refresh",
      updatedLayers,
      stageTimings,
      totalMs: roundDiagnostic(performance.now() - start),
      renderLoadToken: this.renderLoadStats?.token ?? null,
      hazardEventDynamics: model?.hazards?.summary?.eventDynamics || null,
      wildlife3DStats: this.wildlife3DStats || null,
      infrastructure3DStats: this.infrastructure3DStats || null,
      hazard3DStats: this.hazard3DStats || null
    };
    if (typeof globalThis !== "undefined") globalThis.__geoLabTemporalRenderStats = this.lastTemporalRenderStats;
    return this.lastTemporalRenderStats;
  }

  setRiversVisible(visible) {
    if (this.rivers) this.rivers.visible = visible;
  }

  setVegetationVisible(visible) {
    this.vegetationVisible = visible;
    if (this.vegetation) this.vegetation.visible = visible;
  }

  resetCamera() {
    const sizeKm = modelSizeKm(this.model);
    const focusY = terrainCameraFocusY(this.model, this.params);
    const home = cameraHome(sizeKm, this.camera.aspect);
    this.camera.position.set(home.x, home.y + focusY, home.z);
    this.controls.target.set(0, focusY, 0);
    this.controls.update();
    if (typeof globalThis !== "undefined") {
      globalThis.__geoLabCameraFocusState = { mode: "full-map", sizeKm, target: [0, focusY, 0] };
    }
  }

  focusRegion(bounds = {}, options = {}) {
    if (!this.model) return null;
    const sizeKm = modelSizeKm(this.model);
    const centerXKm = Number.isFinite(Number(bounds.centerXKm))
      ? Number(bounds.centerXKm)
      : (Number(bounds.x0) + Number(bounds.x1)) / 2;
    const centerYKm = Number.isFinite(Number(bounds.centerYKm))
      ? Number(bounds.centerYKm)
      : (Number(bounds.y0) + Number(bounds.y1)) / 2;
    const xKm = THREE.MathUtils.clamp(Number.isFinite(centerXKm) ? centerXKm : sizeKm / 2, 0, sizeKm);
    const yKm = THREE.MathUtils.clamp(Number.isFinite(centerYKm) ? centerYKm : sizeKm / 2, 0, sizeKm);
    const cellKm = this.model.cellSizeKm || sizeKm / Math.max(1, this.model.n - 1);
    const widthKm = Math.max(0, Number(bounds.widthKm) || Math.abs(Number(bounds.x1) - Number(bounds.x0)) || 0);
    const heightKm = Math.max(0, Number(bounds.heightKm) || Math.abs(Number(bounds.y1) - Number(bounds.y0)) || 0);
    const spanKm = Math.max(widthKm, heightKm, Number(options.minimumSpanKm) || cellKm * 1.25, sizeKm * 0.002);
    const target = new THREE.Vector3(
      xKm - sizeKm / 2,
      terrainSurfaceYAtLocalKm(this.model, this.params, xKm, yKm),
      yKm - sizeKm / 2
    );
    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(0.2, this.camera.aspect));
    const fitDistance = Math.max(
      spanKm / (2 * Math.tan(verticalFov / 2)),
      spanKm / (2 * Math.tan(horizontalFov / 2))
    ) * 1.75;
    const distance = THREE.MathUtils.clamp(
      Math.max(fitDistance, cellKm * 2.2, this.controls.minDistance * 1.1),
      this.controls.minDistance,
      this.controls.maxDistance
    );
    const offsetDirection = this.camera.position.clone().sub(this.controls.target);
    if (offsetDirection.lengthSq() < 0.0001) offsetDirection.set(0.7, 0.55, 0.7);
    offsetDirection.normalize();
    this.controls.target.copy(target);
    this.camera.position.copy(target).addScaledVector(offsetDirection, distance);
    this.controls.update();
    const focusState = {
      mode: options.mode || "region",
      xKm: roundDiagnostic(xKm),
      yKm: roundDiagnostic(yKm),
      spanKm: roundDiagnostic(spanKm),
      distance: roundDiagnostic(distance),
      target: target.toArray().map(roundDiagnostic)
    };
    if (typeof globalThis !== "undefined") globalThis.__geoLabCameraFocusState = focusState;
    return focusState;
  }

  updateSceneScale(shouldResetCamera = false) {
    const sizeKm = modelSizeKm(this.model);
    this.scene.fog.density = 0.035 * (20 / sizeKm);
    this.camera.far = Math.max(160, sizeKm * 10);
    this.camera.near = 0.00005;
    this.camera.updateProjectionMatrix();
    this.controls.minDistance = Math.max(0.05, sizeKm * 0.0025);
    this.controls.maxDistance = Math.max(68, sizeKm * 3.4);
    this.updateGrid(sizeKm);
    if (shouldResetCamera) {
      this.resetCamera();
    } else {
      const focusY = terrainCameraFocusY(this.model, this.params);
      const verticalShift = focusY - this.controls.target.y;
      this.controls.target.y = focusY;
      this.camera.position.y += verticalShift;
      this.controls.update();
    }
  }

  updateGrid(sizeKm) {
    if (this.grid && this.gridSizeKm === sizeKm) return;
    if (this.grid) {
      this.scene.remove(this.grid);
      this.grid.geometry.dispose();
      this.grid.material.dispose();
    }
    const grid = new THREE.GridHelper(sizeKm, 10, 0x3a4f46, 0x26332e);
    grid.position.y = -0.012;
    grid.material.opacity = 0.28;
    grid.material.transparent = true;
    this.grid = grid;
    this.gridSizeKm = sizeKm;
    grid.visible = this.params?.grid3DEnabled === true;
    this.scene.add(grid);
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const aspect = width / height;
    if (this.sceneVolume?.config?.mode !== "underwater") {
      const oldFit = this.lastViewportAspect ? Math.max(1, 1.2 / this.lastViewportAspect) : 1;
      const fit = Math.max(1, 1.2 / aspect) / oldFit;
      this.camera.position.sub(this.controls.target).multiplyScalar(fit).add(this.controls.target);
    }
    this.lastViewportAspect = aspect;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  handleVisibilityChange() {
    this.isDocumentVisible = !document.hidden;
    if (this.isDocumentVisible) this.lastWildlifeAnimationAt = 0;
  }

  handleWebGLContextLost(event) {
    event.preventDefault();
    this.contextRecovery = this.renderLoadStats && !this.renderLoadStats.completed
      ? {
          token: this.detailBuildToken,
          startedAtMs: this.renderLoadStats.startedAtMs || performance.now(),
          pendingLayerNames: [...(this.renderLoadStats.pendingLayerNames || [])]
        }
      : null;
    this.cancelDeferredDetailBuild();
    this.renderContextState = {
      ...this.renderContextState,
      status: "lost",
      lossCount: this.renderContextState.lossCount + 1,
      lostAtMs: performance.now()
    };
    if (typeof globalThis !== "undefined") globalThis.__geoLabRenderContextState = this.renderContextState;
  }

  handleWebGLContextRestored() {
    this.renderContextState = {
      ...this.renderContextState,
      status: "restoring",
      restoredCount: this.renderContextState.restoredCount + 1,
      restoredAtMs: performance.now()
    };
    this.sceneDiagnosticsDirty = true;
    if (typeof globalThis !== "undefined") globalThis.__geoLabRenderContextState = this.renderContextState;
    const recovery = this.contextRecovery;
    this.contextRecovery = null;
    if (recovery?.pendingLayerNames?.length && this.renderLoadStats && recovery.token === this.detailBuildToken) {
      const startIndex = DEFERRED_DETAIL_LAYER_NAMES.indexOf(recovery.pendingLayerNames[0]);
      this.renderLoadStats.cancelled = false;
      this.renderLoadStats.pendingLayerNames = [...recovery.pendingLayerNames];
      this.publishRenderLoadStats();
      this.scheduleDeferredDetailLayers(
        recovery.token,
        recovery.startedAtMs,
        Math.max(0, startIndex)
      );
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (this.disposed || this.renderContextState.status !== "restoring") return;
        this.renderContextState = { ...this.renderContextState, status: "ready", readyAtMs: performance.now() };
        if (typeof globalThis !== "undefined") globalThis.__geoLabRenderContextState = this.renderContextState;
        this.warmGpuPipelines(this.detailBuildToken, "context-restored");
      });
    });
  }

  handleTerrainDoubleClick(event) {
    if (!this.model || !this.terrainTileGroup?.children?.length) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, this.camera);
    const hit = raycaster.intersectObjects(this.terrainTileGroup.children, false).find(candidate =>
      this.sceneVolume?.config?.mode !== "section" || candidate.point.x <= this.sceneVolume.config.cutX);
    if (!hit) return;
    const sizeKm = modelSizeKm(this.model);
    const cellKm = this.model.cellSizeKm || sizeKm / Math.max(1, this.model.n - 1);
    this.focusRegion({
      centerXKm: hit.point.x + sizeKm / 2,
      centerYKm: hit.point.z + sizeKm / 2,
      widthKm: Math.max(cellKm * 1.5, sizeKm * 0.004),
      heightKm: Math.max(cellKm * 1.5, sizeKm * 0.004)
    }, { mode: "terrain-double-click" });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelDeferredDetailBuild();
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.renderer.domElement.removeEventListener("webglcontextlost", this.handleWebGLContextLost, false);
    this.renderer.domElement.removeEventListener("webglcontextrestored", this.handleWebGLContextRestored, false);
    this.renderer.domElement.removeEventListener("dblclick", this.handleTerrainDoubleClick);
    if (this.terrainDetailGroup) disposeObjectTree(this.terrainDetailGroup);
    if (this.subsurfaceGroup) disposeObjectTree(this.subsurfaceGroup);
    if (this.infrastructureGroup) disposeObjectTree(this.infrastructureGroup);
    if (this.wildlifeGroup) disposeObjectTree(this.wildlifeGroup);
    if (this.hazardGroup) disposeObjectTree(this.hazardGroup);
    if (this.windGroup) disposeObjectTree(this.windGroup);
    this.sceneVolume?.dispose();
    disposeTerrainTiles(this);
    if (this.rivers) {
      this.rivers.geometry.dispose();
      this.rivers.material.dispose();
    }
    if (this.vegetation) {
      disposeObjectTree(this.vegetation);
    }
    disposeSharedGeometryCache(this.sharedGeometryCache);
    this.controls.dispose();
    this.renderer.dispose();
  }

  animate() {
    this.frame = requestAnimationFrame(this.animate);
    if (!this.isDocumentVisible || this.renderContextState.status !== "ready") return;
    this.controls.update();
    const now = performance.now();
    const t = now * 0.001;
    this.sceneVolume?.update(this.camera, t);
    if (this.windGroup.visible) {
      this.windGroup.children.forEach((arrow, index) => {
        arrow.position.y = arrow.userData.baseY + Math.sin(t * 1.6 + index) * 0.018;
      });
    }
    if (
      this.wildlifeGroup.visible &&
      this.wildlifeRenderSets.length &&
      now - this.lastWildlifeAnimationAt >= WILDLIFE_ANIMATION_INTERVAL_MS
    ) {
      animateWildlifeRenderSets(this.wildlifeRenderSets, t);
      this.lastWildlifeAnimationAt = now;
    }
    this.renderer.render(this.scene, this.camera);
    if (this.sceneDiagnosticsDirty) {
      this.publishSceneComplexityStats();
      this.sceneDiagnosticsDirty = false;
    }
  }

  publishSceneComplexityStats() {
    const geometryMeshCounts = {};
    const geometryInstanceCounts = {};
    const proceduralGeometryInstances = {};
    const proceduralVariantInstances = {};
    const materialTypeCounts = {};
    const materials = new Set();
    const geometries = new Set();
    let objectCount = 0;
    let meshCount = 0;
    let instancedMeshCount = 0;
    let frustumCulledInstancedMeshCount = 0;
    let instanceCount = 0;
    let proceduralInstanceCount = 0;
    let templateVertexCount = 0;
    let templateTriangleCount = 0;
    this.scene.traverseVisible((object) => {
      objectCount += 1;
      if (!object.isMesh) return;
      meshCount += 1;
      const geometryType = object.geometry?.type || "UnknownGeometry";
      const instances = object.isInstancedMesh ? object.count : 1;
      if (object.isInstancedMesh) {
        instancedMeshCount += 1;
        if (object.frustumCulled !== false) frustumCulledInstancedMeshCount += 1;
      }
      instanceCount += instances;
      if (object.geometry?.uuid && !geometries.has(object.geometry.uuid)) {
        geometries.add(object.geometry.uuid);
        const vertexCount = object.geometry.getAttribute?.("position")?.count || 0;
        templateVertexCount += vertexCount;
        templateTriangleCount += object.geometry.index
          ? Math.floor(object.geometry.index.count / 3)
          : Math.floor(vertexCount / 3);
      }
      geometryMeshCounts[geometryType] = (geometryMeshCounts[geometryType] || 0) + 1;
      geometryInstanceCounts[geometryType] = (geometryInstanceCounts[geometryType] || 0) + instances;
      const proceduralKind = object.geometry?.userData?.proceduralKind;
      if (proceduralKind) {
        proceduralInstanceCount += instances;
        proceduralGeometryInstances[proceduralKind] = (proceduralGeometryInstances[proceduralKind] || 0) + instances;
        const variantKey = `${proceduralKind}:v${object.geometry?.userData?.variant || 0}`;
        proceduralVariantInstances[variantKey] = (proceduralVariantInstances[variantKey] || 0) + instances;
      }
      const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
      objectMaterials.filter(Boolean).forEach((material) => {
        if (materials.has(material.uuid)) return;
        materials.add(material.uuid);
        const materialType = material.type || "UnknownMaterial";
        materialTypeCounts[materialType] = (materialTypeCounts[materialType] || 0) + 1;
      });
    });
    const layerStats = [
      this.terrainTileGroup,
      this.subsurfaceGroup,
      this.terrainDetailGroup,
      this.vegetation,
      this.wildlifeGroup,
      this.infrastructureGroup,
      this.hazardGroup,
      this.windGroup
    ].filter(Boolean).map((group) => ({
      name: group.name || "unnamed",
      visible: group.visible !== false,
      childCount: group.children.length
    }));
    const renderInfo = this.renderer.info;
    const stats = {
      mode: "three-scene-foundation-diagnostics",
      objectCount,
      meshCount,
      instancedMeshCount,
      frustumCulledInstancedMeshCount,
      instanceCount,
      materialCount: materials.size,
      materialTypeCounts,
      templateGeometryCount: geometries.size,
      templateVertexCount,
      templateTriangleCount,
      sharedGeometryCache: {
        entryCount: this.sharedGeometryCache.size,
        keys: Array.from(this.sharedGeometryCache.keys()).sort()
      },
      geometryMeshCounts,
      geometryInstanceCounts,
      proceduralModeling: {
        profile: "typed-multi-variant-physical-assets-v3",
        instanceCount: proceduralInstanceCount,
        geometryInstances: proceduralGeometryInstances,
        variantInstances: proceduralVariantInstances,
        registry: proceduralAssetDiagnostics(),
        pipeline: assetPipelineDiagnostics()
      },
      camera: {
        position: this.camera.position.toArray().map(roundDiagnostic),
        target: this.controls.target.toArray().map(roundDiagnostic),
        distanceToTarget: roundDiagnostic(this.camera.position.distanceTo(this.controls.target)),
        minDistance: roundDiagnostic(this.controls.minDistance),
        maxDistance: roundDiagnostic(this.controls.maxDistance)
      },
      gpuMemory: { ...renderInfo.memory },
      draw: { ...renderInfo.render },
      layerStats
    };
    if (typeof globalThis !== "undefined") globalThis.__geoLabSceneComplexityStats = stats;
    return stats;
  }

  buildTerrainMesh(dirtyBounds = null) {
    const model = this.model;
    const params = this.params;
    const n = model.n;
    let shouldUpdateFull = false;
    const nextTileKey = terrainTileKey(model);

    if (!this.terrainTileGroup || this.terrainTileKey !== nextTileKey || !this.terrainTiles.length) {
      buildTerrainTiles(this, model);
      shouldUpdateFull = true;
    }

    const dirtyRange = shouldUpdateFull ? null : terrainDirtyVertexRange(model, dirtyBounds);
    const refreshStats = terrainRefreshStats(model, dirtyRange, TERRAIN_TILE_SEGMENTS);
    this.lastTerrainRefreshStats = refreshStats;
    const normalRange = dirtyRange && {
      x0: dirtyRange.x0 - 1, y0: dirtyRange.y0 - 1,
      x1: dirtyRange.x1 + 1, y1: dirtyRange.y1 + 1
    };
    const touchedTiles = selectTerrainTilesForRange(this.terrainTiles, normalRange);
    this.lastTerrainTileStats = terrainTileStats(this.terrainTiles, touchedTiles, model, dirtyRange);
    if (this.terrainTileGroup) {
      this.terrainTileGroup.userData.n = n;
      this.terrainTileGroup.userData.lastTerrainRefreshStats = refreshStats;
      this.terrainTileGroup.userData.lastTerrainTileStats = this.lastTerrainTileStats;
    }
    touchedTiles.forEach((tile) => {
      updateTerrainTileMesh(tile, model, params, this.viewMode, { updateHeights: true, updateColors: true });
    });
    this.sceneVolume?.rebuild(model, params, this.terrainTiles, this.viewMode);
    if (this.sceneVolume) this.applySceneVisibility();
  }

  buildSubsurface3D() {
    disposeObjectTree(this.subsurfaceGroup);
    if (!this.shouldShowSubsurface3D()) {
      this.subsurface3DStats = {
        enabled: false,
        voxelSectionCount: 0,
        aquiferVeinCount: 0,
        porePressurePlumeCount: 0,
        engineeringRiskMarkerCount: 0,
        layerNames: []
      };
      if (typeof globalThis !== "undefined") globalThis.__geoLabSubsurface3DStats = this.subsurface3DStats;
      return;
    }
    const model = this.model;
    const volume = model?.subsurface;
    if (!volume?.voxelCount) {
      this.subsurface3DStats = {
        voxelSectionCount: 0,
        aquiferVeinCount: 0,
        porePressurePlumeCount: 0,
        engineeringRiskMarkerCount: 0,
        layerNames: []
      };
      if (typeof globalThis !== "undefined") globalThis.__geoLabSubsurface3DStats = this.subsurface3DStats;
      return;
    }
    const transforms = [];
    const aquiferVeins = [];
    const porePressurePlumes = [];
    const engineeringRiskMarkers = [];
    const n = model.n;
    const sizeKm = modelSizeKm(model);
    const cell = model.cellSizeKm || sizeKm / Math.max(1, n - 1);
    const budgetPlan = this.activeDetailBudgetPlan || detailBudgetPlan(model);
    const step = budgetPlan.subsurfaceStep;
    const sliceY = Math.floor(n * 0.52);
    const sliceX = this.sceneVolume?.config?.mode === "section" ? this.sceneVolume.config.cutIndex : Math.floor(n * 0.48);
    const verticalScale = Number(this.params.verticalScale) || 1;
    const undergroundScale = verticalScale * (this.sceneVolume?.config?.depthScale || 1);
    const seen = new Set();
    const pushColumn = (x, y, thinAxis) => {
      const key = `${x}:${y}`;
      if (seen.has(key)) return;
      seen.add(key);
      const surfaceIndex = y * n + x;
      if (model.height[surfaceIndex] <= Number(this.params.seaLevel)) return;
      const columnIndex = subsurfaceColumnIndexForRenderer(model, surfaceIndex);
      if (columnIndex < 0) return;
      const wx = (x / (n - 1) - 0.5) * sizeKm;
      const wz = (y / (n - 1) - 0.5) * sizeKm;
      const surfaceY = (model.height[surfaceIndex] / 1000) * verticalScale;
      for (let layer = 0; layer < volume.layerCount; layer += 1) {
        const top = volume.depthEdgesM[layer];
        const bottom = volume.depthEdgesM[layer + 1];
        const centerDepthKm = ((top + bottom) / 2 / 1000) * undergroundScale;
        const thicknessKm = Math.max(0.006, ((bottom - top) / 1000) * undergroundScale);
        const voxelIndex = layer * volume.columnCellCount + columnIndex;
        const color = subsurfaceVoxelColor(volume, voxelIndex, columnIndex);
        const saturation = clamp01(volume.groundwaterSaturation?.[voxelIndex] ?? 0);
        const aquifer = clamp01(volume.columnAquiferPotential?.[columnIndex] ?? 0);
        const lithology = volume.lithologyCode?.[voxelIndex] ?? 0;
        const pressureSignal = subsurfacePorePressureSignal(
          volume.porePressureKpa?.[voxelIndex] ?? 0,
          volume.verticalStressKpa?.[voxelIndex] ?? 0
        );
        const engineeringRisk = clamp01(volume.engineeringRisk?.[voxelIndex] ?? 0);
        const layerY = surfaceY - centerDepthKm;
        const longWidth = cell * step * 0.74;
        const thinWidth = Math.max(cell * 0.19, 0.04);
        transforms.push({
          x: wx,
          y: layerY,
          z: wz,
          sx: thinAxis === "z" ? cell * step * 0.92 : Math.max(cell * 0.16, 0.035),
          sy: thicknessKm,
          sz: thinAxis === "x" ? cell * step * 0.92 : Math.max(cell * 0.16, 0.035),
          ry: 0,
          color
        });
        if ((lithology === 3 || aquifer > 0.42) && saturation > 0.34) {
          aquiferVeins.push({
            x: wx,
            y: layerY + thicknessKm * 0.18,
            z: wz,
            sx: thinAxis === "z" ? longWidth : thinWidth,
            sy: Math.max(0.004, thicknessKm * (0.14 + saturation * 0.2)),
            sz: thinAxis === "x" ? longWidth : thinWidth,
            ry: 0,
            color: subsurfaceAquiferDiagnosticColor(saturation, aquifer)
          });
        }
        if (pressureSignal > 0.42) {
          const radius = Math.max(0.025, cell * (0.16 + pressureSignal * 0.16));
          porePressurePlumes.push({
            x: wx,
            y: layerY,
            z: wz,
            sx: radius,
            sy: Math.max(0.012, thicknessKm * (0.56 + pressureSignal * 0.72)),
            sz: radius,
            ry: 0,
            color: subsurfacePressureDiagnosticColor(pressureSignal)
          });
        }
        if (engineeringRisk > 0.46) {
          const offset = thinAxis === "z" ? Math.max(0.035, cell * 0.24) : -Math.max(0.035, cell * 0.24);
          engineeringRiskMarkers.push({
            x: wx + (thinAxis === "z" ? offset : 0),
            y: layerY + thicknessKm * 0.34,
            z: wz + (thinAxis === "x" ? offset : 0),
            sx: Math.max(0.03, cell * (0.15 + engineeringRisk * 0.18)),
            sy: Math.max(0.01, thicknessKm * (0.2 + engineeringRisk * 0.24)),
            sz: Math.max(0.03, cell * (0.15 + engineeringRisk * 0.18)),
            ry: Math.PI * 0.25,
            color: subsurfaceRiskDiagnosticColor(engineeringRisk)
          });
        }
      }
    };

    for (let x = 0; x < n; x += step) pushColumn(x, sliceY, "z");
    for (let y = 0; y < n; y += step) pushColumn(sliceX, y, "x");
    addInstancedBox(this.subsurfaceGroup, "地下体素剖切", transforms, 0x8b806c, {
      roughness: 0.92,
      metalness: 0.01,
      transparent: true,
      opacity: 0.78,
      emissiveIntensity: 0.16
    });
    addInstancedBox(this.subsurfaceGroup, "含水层连续体", aquiferVeins, 0x4fb6d0, {
      roughness: 0.38,
      metalness: 0.02,
      transparent: true,
      opacity: 0.52,
      emissiveIntensity: 0.36
    });
    addInstancedCylinder(this.subsurfaceGroup, "孔隙水压力柱", porePressurePlumes, 0x58a9ff, {
      radiusSegments: 9,
      roughness: 0.42,
      metalness: 0.04,
      transparent: true,
      opacity: 0.66,
      emissiveIntensity: 0.44
    });
    addInstancedBox(this.subsurfaceGroup, "工程风险体素核心", engineeringRiskMarkers, 0xdf6f56, {
      roughness: 0.72,
      metalness: 0.02,
      transparent: true,
      opacity: 0.82,
      emissiveIntensity: 0.38
    });
    this.subsurface3DStats = {
      voxelSectionCount: transforms.length,
      aquiferVeinCount: aquiferVeins.length,
      porePressurePlumeCount: porePressurePlumes.length,
      engineeringRiskMarkerCount: engineeringRiskMarkers.length,
      samplingStep: step,
      budgetMode: budgetPlan.mode,
      layerNames: this.subsurfaceGroup.children.map((child) => child.name)
    };
    if (typeof globalThis !== "undefined") globalThis.__geoLabSubsurface3DStats = this.subsurface3DStats;
  }

  buildRivers() {
    if (this.rivers) {
      this.scene.remove(this.rivers);
      this.rivers.geometry.dispose();
      this.rivers.material.dispose();
    }
    const model = this.model;
    const params = this.params;
    const maxSegments = Math.min(model.riverSegments.length, 120000);
    const positions = new Float32Array(maxSegments * 6);
    let cursor = 0;
    for (let s = 0; s < maxSegments; s += 1) {
      const segment = model.riverSegments[s];
      const a = this.indexToWorld(segment.from, segment.order);
      const b = this.indexToWorld(segment.to, segment.order);
      positions[cursor++] = a.x;
      positions[cursor++] = a.y;
      positions[cursor++] = a.z;
      positions[cursor++] = b.x;
      positions[cursor++] = b.y;
      positions[cursor++] = b.z;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({
      color: 0x7ce8ff,
      transparent: true,
      opacity: params.riverThreshold > 4 ? 0.86 : 0.96,
      depthWrite: false
    });
    this.rivers = new THREE.LineSegments(geometry, material);
    this.rivers.renderOrder = 3;
    this.scene.add(this.rivers);
  }

  buildTerrainDetails() {
    disposeObjectTree(this.terrainDetailGroup);
    if (!this.shouldShowTerrainDetails3D()) {
      this.terrainDetail3DStats = {
        enabled: false,
        samplingStep: 0,
        budgetMode: "on-demand",
        maxInstanceBudget: 0,
        usedInstanceCount: 0
      };
      if (typeof globalThis !== "undefined") globalThis.__geoLabTerrainDetail3DStats = this.terrainDetail3DStats;
      return;
    }
    const model = this.model;
    if (!model?.height) return;

    const cell = model.cellSizeKm || modelSizeKm(model) / Math.max(1, model.n - 1);
    const seed = Number(this.params.seed) || 0;
    const budgetPlan = this.activeDetailBudgetPlan || detailBudgetPlan(model);
    this.terrainDetailGroup.userData.assetQuality = budgetPlan.quality;
    const step = budgetPlan.terrainDetailStep;
    const maxElevation = model.stats?.maxElevation ?? maxFiniteValue(model.height, 0);
    const buckets = {
      rocks: [],
      scree: [],
      snow: [],
      wetMargins: []
    };
    let budget = budgetPlan.maxTerrainDetailInstances;
    const initialBudget = budget;

    for (let y = 0; y < model.n && budget > 0; y += step) {
      for (let x = 0; x < model.n && budget > 0; x += step) {
        const i = y * model.n + x;
        const elevation = model.height[i];
        if (elevation <= Number(this.params.seaLevel)) continue;
        const slope = model.slope?.[i] ?? 0;
        const roughness = model.terrainDiagnostics?.roughness?.[i] ?? 0;
        const wetness = model.wetnessIndex?.[i] ?? 0;
        const temperature = model.temperature?.[i] ?? 8;
        const base = this.indexToWorld(i, 1.15);
        const angle = infrastructureAngle(model, i, x, y, "terrain", seed);
        const size = cell * step;
        const detailNoise = hash01(x, y, seed + 5011);

        if (slope > 28 && roughness > 4 && detailNoise < Math.min(0.38, slope / 92)) {
          buckets.rocks.push({
            x: base.x + (hash01(x, y, seed + 37) - 0.5) * size * 0.5,
            y: base.y + Math.max(0.012, size * 0.018),
            z: base.z + (hash01(y, x, seed + 43) - 0.5) * size * 0.5,
            sx: Math.max(0.018, size * (0.045 + roughness * 0.002)),
            sy: Math.max(0.018, size * (0.03 + slope * 0.0012)),
            sz: Math.max(0.018, size * (0.035 + detailNoise * 0.06)),
            ry: angle,
            color: terrainRockColor(elevation, maxElevation, detailNoise)
          });
          budget -= 1;
        }

        if (slope > 18 && roughness > 8 && hash01(x, y, seed + 801) < 0.18) {
          buckets.scree.push({
            x: base.x,
            y: base.y + 0.008,
            z: base.z,
            sx: Math.max(0.026, size * 0.18),
            sy: 0.008,
            sz: Math.max(0.014, size * 0.055),
            ry: angle,
            color: 0x857b68
          });
          budget -= 1;
        }

        if (elevation > maxElevation * 0.72 && temperature < 2.5 && hash01(x, y, seed + 1999) < 0.55) {
          buckets.snow.push({
            x: base.x,
            y: base.y + 0.012,
            z: base.z,
            sx: Math.max(0.035, size * (0.28 + detailNoise * 0.18)),
            sy: 0.01,
            sz: Math.max(0.035, size * (0.18 + hash01(y, x, seed + 2001) * 0.14)),
            ry: angle,
            color: 0xe3ebe8
          });
          budget -= 1;
        }

        if (wetness > 8.5 && slope < 8 && hash01(x, y, seed + 2711) < 0.2) {
          buckets.wetMargins.push({
            x: base.x,
            y: base.y + 0.01,
            z: base.z,
            sx: Math.max(0.035, size * 0.22),
            sy: 0.008,
            sz: Math.max(0.026, size * 0.13),
            ry: angle,
            color: 0x4f9d86
          });
          budget -= 1;
        }
      }
    }

    const riverStep = Math.max(1, Math.ceil((model.riverSegments?.length || 0) / 18000));
    for (let s = 0; s < (model.riverSegments?.length || 0) && budget > 0; s += riverStep) {
      const segment = model.riverSegments[s];
      const a = this.indexToWorld(segment.from, 0.75);
      const b = this.indexToWorld(segment.to, 0.75);
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const length = Math.max(0.02, Math.hypot(dx, dz));
      const angle = Math.atan2(-dz, dx);
      const width = Math.max(cell * (0.05 + segment.order * 0.01), 0.018);
      buckets.wetMargins.push({
        x: (a.x + b.x) / 2,
        y: Math.max(a.y, b.y) + 0.003,
        z: (a.z + b.z) / 2,
        sx: length,
        sy: 0.006,
        sz: width,
        ry: angle,
        color: segment.order > 2 ? 0x5ebbc4 : 0x4d9aad
      });
      budget -= 1;
    }

    addInstancedBox(this.terrainDetailGroup, "岩石露头", buckets.rocks, 0x7d786d, { roughness: 0.96, metalness: 0.01 });
    addInstancedBox(this.terrainDetailGroup, "坡麓碎屑", buckets.scree, 0x857b68, { roughness: 0.98 });
    addInstancedBox(this.terrainDetailGroup, "高山雪斑", buckets.snow, 0xe3ebe8, { roughness: 0.72, metalness: 0.01 });
    addInstancedBox(this.terrainDetailGroup, "河岸湿缘", buckets.wetMargins, 0x4d9aad, { roughness: 0.74, transparent: true, opacity: 0.88 });
    this.terrainDetail3DStats = {
      samplingStep: step,
      budgetMode: budgetPlan.mode,
      maxInstanceBudget: initialBudget,
      usedInstanceCount: initialBudget - budget,
      rockCount: buckets.rocks.length,
      screeCount: buckets.scree.length,
      snowCount: buckets.snow.length,
      wetMarginCount: buckets.wetMargins.length
    };
    if (typeof globalThis !== "undefined") globalThis.__geoLabTerrainDetail3DStats = this.terrainDetail3DStats;
  }

  buildVegetation() {
    if (this.vegetation) {
      this.scene.remove(this.vegetation);
      disposeObjectTree(this.vegetation);
      this.vegetation = null;
    }

    const model = this.model;
    if (!model.surface?.vegetation) {
      this.vegetation3DStats = {
        samplingStride: 0,
        budgetMode: "none",
        candidateCount: 0,
        selectedInstanceCount: 0,
        maxInstanceBudget: 0
      };
      if (typeof globalThis !== "undefined") globalThis.__geoLabVegetation3DStats = this.vegetation3DStats;
      return;
    }

    const group = new THREE.Group();
    group.name = "多层植被群落";
    bindSharedGeometryCache(group, this.sharedGeometryCache);
    const budgetPlan = this.activeDetailBudgetPlan || detailBudgetPlan(model);
    group.userData.assetQuality = budgetPlan.quality;
    const stride = budgetPlan.vegetationStride;
    const candidates = [];
    const seed = Number(this.params.seed) || 0;
    const sizeKm = modelSizeKm(model);
    const cell = model.cellSizeKm || sizeKm / Math.max(1, model.n - 1);
    const buckets = {
      trunks: [],
      broadleaf: [],
      conifers: [],
      shrubs: [],
      reeds: [],
      understory: [],
      cropRows: [],
      grassTufts: []
    };

    for (let y = 0; y < model.n; y += stride) {
      for (let x = 0; x < model.n; x += stride) {
        const i = y * model.n + x;
        const cover = model.surface.vegetation[i];
        if (cover < 0.42 || model.height[i] <= Number(this.params.seaLevel)) continue;
        if (cover * 0.3 > hash01(x, y, seed + 1771)) candidates.push(i);
      }
    }

    const maxVegetationInstances = budgetPlan.maxVegetationInstances;
    const count = Math.min(maxVegetationInstances, candidates.length);
    const step = Math.max(1, Math.floor(candidates.length / Math.max(1, count)));

    for (let c = 0; c < count; c += 1) {
      const i = candidates[c * step];
      const x = i % model.n;
      const y = Math.floor(i / model.n);
      const cover = model.surface.vegetation[i];
      const canopy = model.surface.canopyHeight?.[i] ?? 0;
      const landCover = model.surface?.landCover?.[i] ?? 0;
      const vegetationType = model.surface?.vegetationType?.[i] ?? 0;
      const biomass = model.surface?.biomassCarbonKgM2?.[i] ?? 0;
      const wetness = model.wetnessIndex?.[i] ?? 0;
      const wx = (x / (model.n - 1) - 0.5) * sizeKm + (hash01(x, y, seed + 19) - 0.5) * cell * 0.42;
      const wz = (y / (model.n - 1) - 0.5) * sizeKm + (hash01(y, x, seed + 23) - 0.5) * cell * 0.42;
      const wy = (model.height[i] / 1000) * Number(this.params.verticalScale) + 0.012;
      const angle = hash01(x + 7, y - 3, seed) * Math.PI;
      const height = visualCanopyHeight(canopy, cover, Number(this.params.verticalScale));
      const crown = vegetationCrownRadius(height, cover, cell);
      const typeColor = vegetationTypeColor(vegetationType, landCover, cover);

      if (isWetlandLandCover(landCover) || vegetationType === 7 || wetness > 10.5) {
        const reedHeight = Math.max(0.001, Math.min(0.0045, height * 0.18 + cover * 0.0008));
        const reedWidth = Math.max(0.00045, Math.min(0.0024, reedHeight * 0.45));
        buckets.reeds.push({
          x: wx,
          y: wy + reedHeight / 2,
          z: wz,
          sx: reedWidth,
          sy: reedHeight,
          sz: reedWidth,
          ry: angle,
          color: typeColor
        });
        if (biomass > 1.2 && hash01(x, y, seed + 199) < 0.55) {
          buckets.understory.push({
            x: wx + (hash01(x, y, seed + 211) - 0.5) * cell * 0.28,
            y: wy + reedHeight * 0.25,
            z: wz + (hash01(y, x, seed + 223) - 0.5) * cell * 0.28,
            sx: Math.max(0.0015, Math.min(0.008, reedHeight * 1.6)),
            sy: Math.max(0.0008, Math.min(0.003, reedHeight * 0.62)),
            sz: Math.max(0.0012, Math.min(0.006, reedHeight * 1.25)),
            ry: angle + Math.PI * 0.18,
            color: 0x6fae72
          });
        }
        continue;
      }

      if (vegetationType === 6 || landCover === 82) {
        const rowHeight = Math.max(0.0004, Math.min(0.0022, height * 0.06 + cover * 0.00025));
        buckets.cropRows.push({
          x: wx,
          y: wy + rowHeight / 2,
          z: wz,
          sx: Math.max(cell * 0.5, rowHeight * 7),
          sy: rowHeight,
          sz: Math.max(0.0012, Math.min(0.008, cell * 0.012), rowHeight * 1.8),
          ry: angle,
          color: typeColor
        });
        if (hash01(x, y, seed + 337) < cover) {
          buckets.grassTufts.push({
            x: wx + (hash01(x, y, seed + 349) - 0.5) * cell * 0.36,
            y: wy + rowHeight * 0.72,
            z: wz + (hash01(y, x, seed + 353) - 0.5) * cell * 0.36,
            sx: Math.max(0.0008, Math.min(0.0035, rowHeight * 1.5)),
            sy: rowHeight * 1.2,
            sz: Math.max(0.0007, Math.min(0.003, rowHeight * 1.2)),
            ry: angle + Math.PI * 0.5,
            color: 0xc4b45b
          });
        }
        continue;
      }

      if (canopy > 4.5 && !isShrubOrGrassLandCover(landCover) && vegetationType !== 5 && vegetationType !== 9) {
        const trunkHeight = Math.max(0.0025, height * 0.55);
        buckets.trunks.push({
          x: wx,
          y: wy + trunkHeight / 2,
          z: wz,
          sx: Math.max(0.00035, Math.min(0.0025, crown * 0.16)),
          sy: trunkHeight,
          sz: Math.max(0.00035, Math.min(0.0025, crown * 0.16)),
          ry: angle,
          color: 0x9b6a43
        });
        if (vegetationType === 2 || (vegetationType !== 1 && (isConiferLandCover(landCover) || hash01(x, y, seed + 509) < 0.42))) {
          buckets.conifers.push({
            x: wx,
            y: wy + trunkHeight + Math.max(0.0015, height * 0.27),
            z: wz,
            sx: crown * 1.34,
            sy: Math.max(0.003, height * 0.62),
            sz: crown * 1.34,
            ry: angle,
            color: typeColor
          });
        } else {
          buckets.broadleaf.push({
            x: wx,
            y: wy + trunkHeight + crown * 0.42,
            z: wz,
            sx: crown * (1.35 + cover * 0.4),
            sy: Math.max(0.0025, crown * 0.9),
            sz: crown * (1.15 + hash01(y, x, seed + 919) * 0.5),
            ry: angle,
            color: typeColor
          });
        }
        if (biomass > 2.4 && cover > 0.62 && hash01(x, y, seed + 607) < 0.62) {
          const underHeight = Math.max(0.001, Math.min(0.006, height * 0.12 + cover * 0.0008));
          buckets.understory.push({
            x: wx + (hash01(x, y, seed + 613) - 0.5) * crown,
            y: wy + underHeight / 2,
            z: wz + (hash01(y, x, seed + 617) - 0.5) * crown,
            sx: Math.max(0.0015, Math.min(0.012, underHeight * 1.9)),
            sy: underHeight,
            sz: Math.max(0.0012, Math.min(0.01, underHeight * 1.5)),
            ry: angle + hash01(x, y, seed + 619) * Math.PI,
            color: vegetationColor(landCover, cover * 0.8, 0x5e9a55)
          });
        }
      } else {
        const shrubHeight = Math.max(0.0008, Math.min(0.0055, height * 0.35 + cover * 0.0008));
        const bucket = vegetationType === 5 || landCover === 71 || landCover === 81 ? buckets.grassTufts : buckets.shrubs;
        bucket.push({
          x: wx,
          y: wy + shrubHeight / 2,
          z: wz,
          sx: Math.max(0.0012, Math.min(0.009, shrubHeight * 1.6)),
          sy: shrubHeight,
          sz: Math.max(0.001, Math.min(0.0075, shrubHeight * 1.3)),
          ry: angle,
          color: typeColor
        });
      }
    }

    addInstancedCylinder(group, "树干", buckets.trunks, 0x9b6a43, { radiusSegments: 7, roughness: 0.88, emissiveIntensity: 0.26 });
    addInstancedBox(group, "阔叶冠层", buckets.broadleaf, 0x54a866, { geometryFactory: (variant) => createAssetGeometry("broadleaf-canopy", budgetPlan.quality, variant), roughness: 0.96, side: THREE.DoubleSide });
    addInstancedBox(group, "针叶林冠", buckets.conifers, 0x3b8456, { geometryFactory: (variant) => createAssetGeometry("layered-conifer", budgetPlan.quality, variant), roughness: 0.95, side: THREE.DoubleSide });
    addInstancedBox(group, "灌草斑块", buckets.shrubs, 0x82b864, { geometryFactory: (variant) => createAssetGeometry("irregular-shrub", budgetPlan.quality, variant), roughness: 0.98, transparent: true, opacity: 0.86 });
    addInstancedCylinder(group, "湿地芦苇", buckets.reeds, 0x86b861, { radiusSegments: 5, roughness: 0.96, transparent: true, opacity: 0.88 });
    addInstancedBox(group, "林下植被", buckets.understory, 0x669f5b, { geometryFactory: (variant) => createAssetGeometry("understory-cluster", budgetPlan.quality, variant), roughness: 0.98, transparent: true, opacity: 0.84 });
    addInstancedBox(group, "农田作物行", buckets.cropRows, 0xb9aa55, { roughness: 0.96, transparent: true, opacity: 0.88 });
    addInstancedBox(group, "草簇", buckets.grassTufts, 0x9fba5d, { geometryFactory: (variant) => createAssetGeometry("crossed-grass", budgetPlan.quality, variant), roughness: 0.97, transparent: true, opacity: 0.86, side: THREE.DoubleSide });
    group.visible = this.vegetationVisible;
    this.vegetation = group;
    this.scene.add(group);
    this.vegetation3DStats = {
      samplingStride: stride,
      budgetMode: budgetPlan.mode,
      candidateCount: candidates.length,
      selectedInstanceCount: count,
      maxInstanceBudget: maxVegetationInstances,
      trunkCount: buckets.trunks.length,
      broadleafCount: buckets.broadleaf.length,
      coniferCount: buckets.conifers.length,
      shrubCount: buckets.shrubs.length,
      reedCount: buckets.reeds.length,
      understoryCount: buckets.understory.length,
      cropRowCount: buckets.cropRows.length,
      grassTuftCount: buckets.grassTufts.length,
      geometryProfile: "typed-multi-variant-vegetation-v3"
    };
    if (typeof globalThis !== "undefined") globalThis.__geoLabVegetation3DStats = this.vegetation3DStats;
  }

  buildWildlife3D() {
    disposeObjectTree(this.wildlifeGroup);
    this.wildlifeRenderSets = [];
    const model = this.model;
    const wildlife = model?.wildlife;
    const enabled = this.params?.wildlife3DEnabled !== false && wildlife?.enabled !== false;
    const visualScale = Math.min(3, Math.max(0.4, Number(this.params?.wildlife3DScale ?? 1) || 1));
    if (!enabled || !wildlife?.agents?.length) {
      this.wildlife3DStats = {
        enabled,
        speciesCount: wildlife?.species?.length || 0,
        activeSpeciesCount: 0,
        renderedAgentCount: 0,
        migrationCorridorCount: 0,
        instancedMeshCount: 0,
        geometryProfile: "typed-multi-variant-anatomy-v3",
        visualScale,
        layerNames: []
      };
      if (typeof globalThis !== "undefined") globalThis.__geoLabWildlife3DStats = this.wildlife3DStats;
      return;
    }

    const speciesById = new Map((wildlife.species || []).map((row) => [row.id, row]));
    const agentsBySpecies = new Map();
    for (const agent of wildlife.agents) {
      if (!agentsBySpecies.has(agent.speciesId)) agentsBySpecies.set(agent.speciesId, []);
      agentsBySpecies.get(agent.speciesId).push(agent);
    }
    const partBatches = new Map();
    let activeSpeciesCount = 0;
    for (const [speciesId, agents] of agentsBySpecies) {
      const species = speciesById.get(speciesId);
      if (!species || !agents.length) continue;
      activeSpeciesCount += 1;
      const states = agents.map((agent) => wildlifeAgentRenderState(model, this.params, agent, species, visualScale));
      for (const part of wildlifePartPlan(species)) {
        const kind = wildlifeProceduralKind(species, part);
        if (!partBatches.has(kind)) partBatches.set(kind, { kind, entries: [] });
        const batch = partBatches.get(kind);
        for (const state of states) {
          batch.entries.push({
            state,
            part,
            colorHex: part.colorHex ?? species.colorHex ?? 0x9a8d78,
            lighten: part.lighten || 0
          });
        }
      }
    }
    for (const batch of partBatches.values()) {
      const renderSets = addWildlifeInstancedBatch(
        this.wildlifeGroup,
        batch,
        this.activeDetailBudgetPlan?.quality
      );
      for (const renderSet of renderSets) this.wildlifeRenderSets.push(renderSet);
    }
    const migrationCorridorCount = addWildlifeMigrationCorridors(
      this.wildlifeGroup,
      model,
      this.params,
      wildlife.migrationLinks || []
    );
    this.wildlife3DStats = {
      enabled: true,
      speciesCount: wildlife.species?.length || 0,
      activeSpeciesCount,
      renderedAgentCount: wildlife.agents.length,
      migrationCorridorCount,
      instancedMeshCount: this.wildlifeRenderSets.length,
      geometryProfile: "typed-multi-variant-anatomy-v3",
      visualScale,
      populationEstimate: wildlife.summary?.totalPopulationEstimate || 0,
      meanHabitatConnectivity: wildlife.summary?.meanHabitatConnectivity || 0,
      layerNames: this.wildlifeGroup.children.map((child) => child.name)
    };
    if (typeof globalThis !== "undefined") globalThis.__geoLabWildlife3DStats = this.wildlife3DStats;
  }

  buildInfrastructure3D() {
    disposeObjectTree(this.infrastructureGroup);
    const model = this.model;
    const influence = model.infrastructureInfluence;
    const budgetPlan = this.activeDetailBudgetPlan || detailBudgetPlan(model);
    this.infrastructureGroup.userData.assetQuality = budgetPlan.quality;
    if (!influence?.mask) {
      const blockMicrozoneBuckets = createBlockMicrozoneBuckets();
      const blockMicrozoneDetailPlan = pushBlockMicrozoneDetailLayers(
        blockMicrozoneBuckets,
        model,
        this.params,
        Number(this.params.verticalScale),
        { quality: budgetPlan.quality, cache: this.blockDetailAtlasCache }
      );
      addBlockMicrozoneInstancedLayers(this.infrastructureGroup, blockMicrozoneBuckets);
      this.infrastructure3DStats = {
        buildingInstanceCount: 0,
        damageOverlayCount: 0,
        foundationRiskSkirtCount: 0,
        recoveryBeaconCount: 0,
        meanCurrentDamage: 0,
        meanRecoveryPressure: 0,
        meanFoundationRisk: 0,
        diagnosticLayerBudget: budgetPlan.maxBuildingDiagnosticInstances,
        skippedDiagnosticInstanceCount: 0,
        facadeDetailPlan: emptyFacadeDetailPlan(Math.max(8000, Math.round((budgetPlan.maxBuildingDiagnosticInstances || 6000) * 4))),
        buildingRealityDetailPlan: emptyBuildingRealityDetailPlan(Math.max(8000, Math.round((budgetPlan.maxBuildingDiagnosticInstances || 6000) * 4))),
        buildingMaterialColorPlan: emptyBuildingMaterialColorPlan(),
        facilityDetailPlan: emptyFacilityDetailPlan(),
        adaptationDetailPlan: emptyAdaptationDetailPlan(),
        ecosystemDiagnosticPlan: emptyInfrastructureEcosystem3DDiagnosticPlan(infrastructureEcosystem3DControls(this.params)),
        blockMicrozoneDetailPlan,
        layerNames: this.infrastructureGroup.children.map((child) => child.name)
      };
      if (typeof globalThis !== "undefined") globalThis.__geoLabInfrastructure3DStats = this.infrastructure3DStats;
      return;
    }

    const cell = model.cellSizeKm || modelSizeKm(model) / Math.max(1, model.n - 1);
    const seed = Number(this.params.seed) || 0;
    const buckets = {
      highrise: [],
      midrise: [],
      lowrise: [],
      roofs: [],
      industrial: [],
      civic: [],
      caps: [],
      facadeBands: [],
      facadeVerticals: [],
      windowGrids: [],
      balconies: [],
      entrances: [],
      roofEquipment: [],
      roofGardens: [],
      antennas: [],
      buildingStructuralCores: [],
      buildingPodiumBases: [],
      buildingPitchedRoofPlanes: [],
      buildingBalconyRails: [],
      buildingServiceYards: [],
      buildingServiceDropoffs: [],
      buildingCoolingPlants: [],
      buildingMechanicalScreens: [],
      buildingFacadeServiceSlots: [],
      landmarkTowers: [],
      landmarkSpires: [],
      slabs: [],
      roads: [],
      laneMarkings: [],
      streetLights: [],
      bridgePiers: [],
      rails: [],
      canals: [],
      canalEdges: [],
      levees: [],
      dams: [],
      spillways: [],
      reservoirs: [],
      runways: [],
      runwayMarks: [],
      railSleepers: [],
      bridgeGuardRails: [],
      damSpillwayGates: [],
      airportThresholdMarks: [],
      portQuayAprons: [],
      portCraneMasts: [],
      portCraneBooms: [],
      solarPanels: [],
      windMasts: [],
      windBlades: [],
      tanks: [],
      stadiums: [],
      solarSupports: [],
      coolingRacks: [],
      greenhouseRidges: [],
      marketAwnings: [],
      stadiumFields: [],
      farmRows: [],
      terraceWalls: [],
      quarryBenches: [],
      substationFrames: [],
      hospitalHelipads: [],
      schoolYards: [],
      emergencyBays: [],
      securityForecourts: [],
      hotelPodiums: [],
      officeMechanicalDecks: [],
      clinicAmbulanceBays: [],
      libraryCourtyards: [],
      communityPlazas: [],
      busBays: [],
      waterTowerTanks: [],
      waterTowerLegs: [],
      observatoryDomes: [],
      observatoryTelescopeMounts: [],
      cableCarTowers: [],
      cableCarCables: [],
      cableCarPlatforms: [],
      floodPumpIntakes: [],
      floodPumpOutfalls: [],
      desalinationTanks: [],
      desalinationIntakeGalleries: [],
      visitorCenterPlazas: [],
      scenicOverlookDecks: [],
      scenicOverlookRails: [],
      trailheadKiosks: [],
      trailheadTrailStrips: [],
      rangerWatchTowers: [],
      rangerYards: [],
      gaugingStaffPlates: [],
      gaugingSensorMasts: [],
      ecosystemRoleNodes: [],
      ecosystemRoleHalos: [],
      ecosystemNetworkLinks: [],
      serviceSignage: [],
      adaptiveFoundationPlinths: [],
      adaptiveSlopeRetainingWalls: [],
      adaptiveDrainageSwales: [],
      adaptiveWindbreakScreens: [],
      adaptiveFirebreakStrips: [],
      blockMicrozoneAnchors: [],
      blockMicrozoneShelves: [],
      blockMicrozoneBlueCorridors: [],
      blockMicrozoneRidges: [],
      blockMicrozoneHazardBuffers: [],
      blockRecommendationMarkers: [],
      blockRecommendationFootprints: [],
      adaptivePlanMarkers: [],
      adaptivePlanFootprints: [],
      adaptivePlanLinks: [],
      adaptivePlanSubsurfaceWarnings: [],
      buildingDamageOverlays: [],
      foundationRiskSkirts: [],
      recoveryBeacons: []
    };
    let buildingBudget = MAX_BUILDING_INSTANCES;
    let facilityBudget = MAX_FACILITY_INSTANCES;
    let buildingInstanceCount = 0;
    let damageSum = 0;
    let recoveryPressureSum = 0;
    let foundationRiskSum = 0;
    let diagnosticBudgetRemaining = budgetPlan.maxBuildingDiagnosticInstances;
    let skippedDiagnosticInstanceCount = 0;
    const maxFacadeDetailInstances = Math.max(8000, Math.round((budgetPlan.maxBuildingDiagnosticInstances || 6000) * 4));
    let facadeDetailBudgetRemaining = maxFacadeDetailInstances;
    let facadeDetailInstanceCount = 0;
    let skippedFacadeDetailInstanceCount = 0;
    let buildingRealityDetailBudgetRemaining = maxFacadeDetailInstances;
    let buildingRealityDetailInstanceCount = 0;
    let skippedBuildingRealityDetailInstanceCount = 0;
    const facadeTypeDetailCounts = {};
    const facadeMaterialFamilyCounts = {};
    const buildingRealityTypeComponentCounts = {};
    const buildingRealityFamilyCounts = {};
    const buildingMaterialFamilyCounts = {};
    const buildingMaterialTypeCounts = {};
    const buildingMaterialSamples = [];
    let buildingMaterialSampleCount = 0;
    let buildingMaterialLuminanceSum = 0;
    let darkBuildingMaterialViolationCount = 0;
    const ecosystemRoleCounts = {};
    const ecosystemTypeCounts = {};
    let ecosystemCellCount = 0;
    const ecosystemVisualCandidates = [];

    for (let y = 0; y < model.n; y += 1) {
      for (let x = 0; x < model.n; x += 1) {
        const i = y * model.n + x;
        if (!influence.mask[i]) continue;
        const type = INFRASTRUCTURE_CODE_TYPES[influence.typeCode?.[i] || 0] || "custom";
        const ecosystemRole = infrastructureEcosystemRoleFor3D(type);
        ecosystemCellCount += 1;
        incrementRendererCount(ecosystemTypeCounts, type, 1);
        incrementRendererCount(ecosystemRoleCounts, ecosystemRole, 1);
        const defaults = BUILDING_DEFAULTS[type] || BUILDING_DEFAULTS.custom;
        const base = this.indexToWorld(i, 3);
        const angle = infrastructureAngle(model, i, x, y, type, seed);
        const density = Math.max(influence.buildingDensity?.[i] ?? 0, defaults.density ?? 0);
        const heightM = Math.max(influence.buildingHeightM?.[i] ?? 0, defaults.heightM ?? 0);
        const landmarkHeightM = influence.landmarkHeightM?.[i] ?? 0;
        const environment = infrastructureAdaptationVisualState(model, i, influence, this.params);
        ecosystemVisualCandidates.push({
          index: i,
          gridX: x,
          gridY: y,
          type,
          role: ecosystemRole,
          base,
          angle,
          suitability: influence.suitabilityScore?.[i] ?? 0,
          adaptationNeed: influence.adaptationNeed?.[i] ?? 0,
          blockId: influence.blockId?.[i] ?? -1
        });

        if (facilityBudget > 0) {
          facilityBudget -= addFacilityCell(buckets, {
            type,
            base,
            cell,
            angle,
            seed,
            x,
            y,
            heightM,
            landmarkHeightM,
            verticalScale: Number(this.params.verticalScale),
            impervious: influence.imperviousFraction?.[i] ?? 0,
            storageMm: influence.storageMm?.[i] ?? 0,
            adaptationNeed: influence.adaptationNeed?.[i] ?? 0,
            suitability: influence.suitabilityScore?.[i] ?? 0,
            environment
          });
        }

        if (buildingBudget <= 0 || !isBuildingType(type, density, heightM, landmarkHeightM)) continue;
        const instanceCount = buildingInstancesFor(type, density, x, y, seed);
        for (let k = 0; k < instanceCount && buildingBudget > 0; k += 1) {
          const jitterScale = type === "highrise" || type === "commercial" ? 0.22 : 0.38;
          const ox = (hash01(x + k * 19, y - k * 13, seed + 701) - 0.5) * cell * jitterScale;
          const oz = (hash01(x - k * 11, y + k * 17, seed + 911) - 0.5) * cell * jitterScale;
          const localHeightM = heightM * (0.82 + hash01(x + k * 7, y + k * 5, seed + 37) * 0.48);
          const visualHeight = visualBuildingHeight(localHeightM, Number(this.params.verticalScale));
          let footprint = buildingFootprint(type, density, cell, k, x, y, seed);
          let depth = footprint * (0.74 + hash01(x - k * 3, y + 29, seed + 43) * 0.52);
          ({ width: footprint, depth } = balanceBuildingPrism(type, footprint, depth, visualHeight, cell));
          const localAngle = angle + (hash01(x + 31, y - 17, seed + k * 97) - 0.5) * 0.9;
          const disasterVisual = buildingDisasterVisual(model, i, this.params);
          const materialPlan = buildingMaterialColorPlan({
            type,
            fallback: defaults.color,
            heightM: localHeightM,
            widthKm: footprint,
            depthKm: depth,
            x,
            y,
            seed: seed + k,
            disasterVisual
          });
          const color = materialPlan.colorHexes.baseColor;
          buildingMaterialSampleCount += 1;
          buildingMaterialLuminanceSum += materialPlan.relativeLuminance;
          if (!materialPlan.isBlackBlockSafe) darkBuildingMaterialViolationCount += 1;
          incrementRendererCount(buildingMaterialFamilyCounts, materialPlan.materialFamily, 1);
          incrementRendererCount(buildingMaterialTypeCounts, type, 1);
          if (buildingMaterialSamples.length < 14) {
            buildingMaterialSamples.push({
              type,
              materialFamily: materialPlan.materialFamily,
              baseColor: materialPlan.colors.baseColor,
              roofColor: materialPlan.colors.roofColor,
              relativeLuminance: materialPlan.relativeLuminance,
              hazardTintClass: materialPlan.hazardTintClass
            });
          }
          const transform = {
            x: base.x + ox,
            y: base.y + visualHeight / 2,
            z: base.z + oz,
            sx: footprint,
            sy: visualHeight,
            sz: depth,
            ry: localAngle,
            color
          };

          if (type === "highrise" || (localHeightM >= 95 && density > 0.35)) {
            buckets.highrise.push(transform);
            buckets.caps.push({
              ...transform,
              y: base.y + visualHeight + Math.min(0.08, visualHeight * 0.08) / 2,
              sx: footprint * 0.72,
              sy: Math.min(0.08, visualHeight * 0.08),
              sz: depth * 0.72,
              color: materialPlan.colorHexes.roofColor
            });
            pushFacadeBands(buckets.facadeBands, transform, footprint, depth, localAngle, type);
          } else if (INDUSTRIAL_SILHOUETTE_TYPES.has(type)) {
            buckets.industrial.push({ ...transform, sx: footprint * 1.45, sz: depth * 1.25, color });
          } else if (CIVIC_SILHOUETTE_TYPES.has(type)) {
            buckets.civic.push(transform);
            pushFacadeBands(buckets.facadeBands, transform, footprint, depth, localAngle, type);
          } else if (MIDRISE_SILHOUETTE_TYPES.has(type) || localHeightM >= 22) {
            buckets.midrise.push(transform);
            pushFacadeBands(buckets.facadeBands, transform, footprint, depth, localAngle, type);
          } else {
            buckets.lowrise.push(transform);
            if (LOWRISE_ROOF_TYPES.has(type)) {
              buckets.roofs.push({
                x: transform.x,
                y: base.y + visualHeight + Math.max(0.018, visualHeight * 0.16) / 2,
                z: transform.z,
                sx: footprint * 0.95,
                sy: Math.max(0.018, visualHeight * 0.16),
                sz: depth * 0.95,
                ry: localAngle + Math.PI * 0.25,
                color: materialPlan.colorHexes.roofColor
              });
            }
          }
          const fineDetails = pushBuildingFineDetails(
            buckets,
            transform,
            type,
            footprint,
            depth,
            localAngle,
            localHeightM,
            base.y,
            seed + x * 31 + y * 17 + k * 101,
            facadeDetailBudgetRemaining
          );
          facadeDetailBudgetRemaining -= fineDetails.added;
          facadeDetailInstanceCount += fineDetails.added;
          skippedFacadeDetailInstanceCount += fineDetails.skipped;
          if (fineDetails.added > 0) {
            facadeTypeDetailCounts[type] = (facadeTypeDetailCounts[type] || 0) + fineDetails.added;
            facadeMaterialFamilyCounts[fineDetails.family] = (facadeMaterialFamilyCounts[fineDetails.family] || 0) + fineDetails.added;
          }
          const realityDetails = pushBuildingRealityDetails(
            buckets,
            transform,
            type,
            footprint,
            depth,
            localAngle,
            localHeightM,
            base.y,
            seed + x * 43 + y * 19 + k * 131,
            buildingRealityDetailBudgetRemaining
          );
          buildingRealityDetailBudgetRemaining -= realityDetails.added;
          buildingRealityDetailInstanceCount += realityDetails.added;
          skippedBuildingRealityDetailInstanceCount += realityDetails.skipped;
          if (realityDetails.added > 0) {
            buildingRealityTypeComponentCounts[type] = (buildingRealityTypeComponentCounts[type] || 0) + realityDetails.added;
            buildingRealityFamilyCounts[realityDetails.family] = (buildingRealityFamilyCounts[realityDetails.family] || 0) + realityDetails.added;
          }
          const diagnosticState = normalizeDisasterVisual(disasterVisual);
          const diagnosticResult = pushBuildingDiagnosticLayers(buckets, transform, diagnosticState, footprint, depth, localAngle, base.y, cell, diagnosticBudgetRemaining);
          diagnosticBudgetRemaining -= diagnosticResult.added;
          skippedDiagnosticInstanceCount += diagnosticResult.skipped;
          buildingInstanceCount += 1;
          damageSum += diagnosticState.damage;
          recoveryPressureSum += diagnosticState.recoveryPressure;
          foundationRiskSum += diagnosticState.foundationRisk;
          buildingBudget -= 1;
        }

        if (landmarkHeightM > 1 && facilityBudget > 0) {
          const towerHeight = visualBuildingHeight(landmarkHeightM, Number(this.params.verticalScale));
          const towerPlan = towerPlanWidth(towerHeight, cell, 0.07, 5.6);
          buckets.landmarkTowers.push({
            x: base.x,
            y: base.y + towerHeight / 2,
            z: base.z,
            sx: towerPlan,
            sy: towerHeight,
            sz: towerPlan,
            ry: angle,
            color: type === "wind_farm" ? 0xe2e6e2 : 0xcfd5d1
          });
          buckets.landmarkSpires.push({
            x: base.x,
            y: base.y + towerHeight + Math.min(0.18, towerHeight * 0.16) / 2,
            z: base.z,
            sx: Math.max(cell * 0.06, 0.026),
            sy: Math.min(0.18, towerHeight * 0.16),
            sz: Math.max(cell * 0.06, 0.026),
            ry: angle,
            color: 0xe4e9e6
          });
          facilityBudget -= 2;
        }
      }
    }

    const blockMicrozoneDetailPlan = pushBlockMicrozoneDetailLayers(
      buckets,
      model,
      this.params,
      Number(this.params.verticalScale),
      { quality: budgetPlan.quality, cache: this.blockDetailAtlasCache }
    );
    const ecosystemVisualControls = infrastructureEcosystem3DControls(this.params);
    const ecosystemVisualPlan = pushInfrastructureEcosystemVisualLayers(buckets, ecosystemVisualCandidates, cell, ecosystemVisualControls);

    addInstancedBox(this.infrastructureGroup, "退台高层塔楼", buckets.highrise, 0xb8c5c7, { geometryFactory: (variant) => createAssetGeometry("setback-tower", budgetPlan.quality, variant), roughness: 0.55, metalness: 0.08 });
    addInstancedBox(this.infrastructureGroup, "围合中高层组团", buckets.midrise, 0xb8aa96, { geometryFactory: (variant) => createAssetGeometry("courtyard-midrise", budgetPlan.quality, variant), roughness: 0.7, metalness: 0.02 });
    addInstancedBox(this.infrastructureGroup, "错落低层住宅", buckets.lowrise, 0xc2aa8a, { geometryFactory: (variant) => createAssetGeometry("l-plan-lowrise", budgetPlan.quality, variant), roughness: 0.82, metalness: 0.01 });
    addInstancedBox(this.infrastructureGroup, "锯齿顶工业厂房", buckets.industrial, 0x9c9a91, { geometryFactory: (variant) => createAssetGeometry("sawtooth-industrial", budgetPlan.quality, variant), roughness: 0.78, metalness: 0.04 });
    addInstancedBox(this.infrastructureGroup, "多翼公共设施", buckets.civic, 0xc8bc96, { geometryFactory: (variant) => createAssetGeometry("cross-plan-civic", budgetPlan.quality, variant), roughness: 0.72, metalness: 0.02 });
    addInstancedBox(this.infrastructureGroup, "四坡脊屋顶", buckets.roofs, 0x875d43, { geometryFactory: (variant) => createAssetGeometry("hipped-roof", budgetPlan.quality, variant), roughness: 0.88 });
    addInstancedBox(this.infrastructureGroup, "塔楼顶冠", buckets.caps, 0xd7dfdf, { roughness: 0.48, metalness: 0.08 });
    addInstancedBox(this.infrastructureGroup, "立面横带", buckets.facadeBands, 0x66808e, { roughness: 0.56, metalness: 0.14 });
    addInstancedBox(this.infrastructureGroup, "窗格幕墙", buckets.windowGrids, 0x93c7da, { roughness: 0.38, metalness: 0.12, transparent: true, opacity: 0.86 });
    addInstancedBox(this.infrastructureGroup, "阳台挑板", buckets.balconies, 0x8d877d, { roughness: 0.72, metalness: 0.02 });
    addInstancedBox(this.infrastructureGroup, "屋顶机电", buckets.roofEquipment, 0x7e8582, { roughness: 0.62, metalness: 0.08 });
    addInstancedCylinder(this.infrastructureGroup, "楼顶天线", buckets.antennas, 0xd8ddd7, { radiusSegments: 6, roughness: 0.48, metalness: 0.12 });
    addInstancedBox(this.infrastructureGroup, "设施底板", buckets.slabs, 0x72736b, { roughness: 0.85, metalness: 0.02 });
    addInstancedBox(this.infrastructureGroup, "道路桥面", buckets.roads, 0x59605c, { roughness: 0.9 });
    addInstancedBox(this.infrastructureGroup, "道路标线", buckets.laneMarkings, 0xd9d5bd, { roughness: 0.7 });
    addInstancedCylinder(this.infrastructureGroup, "路灯与支柱", buckets.streetLights, 0xb8b9ad, { radiusSegments: 5, roughness: 0.58, metalness: 0.08 });
    addInstancedCylinder(this.infrastructureGroup, "桥墩", buckets.bridgePiers, 0x838785, { radiusSegments: 8, roughness: 0.76, metalness: 0.03 });
    addInstancedBox(this.infrastructureGroup, "铁路", buckets.rails, 0x646762, { roughness: 0.75, metalness: 0.18 });
    addInstancedBox(this.infrastructureGroup, "渠道水面", buckets.canals, 0x4ea4bd, { roughness: 0.42, metalness: 0.02, transparent: true, opacity: 0.88 });
    addInstancedBox(this.infrastructureGroup, "渠道护岸", buckets.canalEdges, 0x777a68, { roughness: 0.82 });
    addInstancedBox(this.infrastructureGroup, "堤防", buckets.levees, 0x9a8d66, { roughness: 0.92 });
    addInstancedBox(this.infrastructureGroup, "大坝结构", buckets.dams, 0x8f9697, { roughness: 0.78, metalness: 0.03 });
    addInstancedBox(this.infrastructureGroup, "溢洪道", buckets.spillways, 0x5e7d86, { roughness: 0.5, metalness: 0.02, transparent: true, opacity: 0.82 });
    addInstancedBox(this.infrastructureGroup, "跑道", buckets.runways, 0x50575a, { roughness: 0.86 });
    addInstancedBox(this.infrastructureGroup, "跑道标线", buckets.runwayMarks, 0xdedbcc, { roughness: 0.68 });
    addInstancedBox(this.infrastructureGroup, "光伏板", buckets.solarPanels, 0x2e5d8a, { roughness: 0.36, metalness: 0.22 });
    addInstancedBox(this.infrastructureGroup, "风机叶片", buckets.windBlades, 0xdfe4df, { roughness: 0.5, metalness: 0.04 });
    addInstancedBox(this.infrastructureGroup, "水库水面", buckets.reservoirs, 0x3f9fc2, { roughness: 0.36, metalness: 0.02, transparent: true, opacity: 0.74 });
    addInstancedBox(this.infrastructureGroup, "曲面地标塔体", buckets.landmarkTowers, 0xd6ddd9, { geometryFactory: (variant) => createAssetGeometry("tapered-landmark", budgetPlan.quality, variant), roughness: 0.5, metalness: 0.08 });
    addInstancedCylinder(this.infrastructureGroup, "风机塔筒", buckets.windMasts, 0xdfe4df, { radiusSegments: 8, roughness: 0.5, metalness: 0.04 });
    addInstancedCylinder(this.infrastructureGroup, "蓄水/处理罐", buckets.tanks, 0x9fa8a5, { radiusSegments: 16, roughness: 0.65, metalness: 0.08 });
    addInstancedBox(this.infrastructureGroup, "地标尖顶", buckets.landmarkSpires, 0xe4e9e6, { geometryFactory: (variant) => createAssetGeometry("ribbed-spire", budgetPlan.quality, variant), roughness: 0.5, metalness: 0.08 });
    addInstancedTorus(this.infrastructureGroup, "体育场看台", buckets.stadiums, 0xaaa79b);
    addInstancedBox(this.infrastructureGroup, "建筑损伤包络", buckets.buildingDamageOverlays, 0xcc7a5d, {
      roughness: 0.68,
      metalness: 0.01,
      transparent: true,
      opacity: 0.42,
      emissiveIntensity: 0.34
    });
    addInstancedBox(this.infrastructureGroup, "基础风险裙边", buckets.foundationRiskSkirts, 0xdb9b5e, {
      roughness: 0.82,
      metalness: 0.01,
      transparent: true,
      opacity: 0.7,
      emissiveIntensity: 0.32
    });
    addInstancedCylinder(this.infrastructureGroup, "恢复压力信标", buckets.recoveryBeacons, 0xf1c45f, {
      radiusSegments: 7,
      roughness: 0.5,
      metalness: 0.04,
      transparent: true,
      opacity: 0.78,
      emissiveIntensity: 0.52
    });
    addInstancedBox(this.infrastructureGroup, "立面竖肋", buckets.facadeVerticals, 0x536b73, { roughness: 0.52, metalness: 0.16 });
    addInstancedBox(this.infrastructureGroup, "入口雨棚", buckets.entrances, 0x8a9188, { roughness: 0.62, metalness: 0.04 });
    addInstancedBox(this.infrastructureGroup, "屋顶绿化", buckets.roofGardens, 0x5f9d67, { roughness: 0.88, metalness: 0.01 });
    addInstancedBox(this.infrastructureGroup, "建筑核心筒", buckets.buildingStructuralCores, 0x6f858d, { roughness: 0.54, metalness: 0.12 });
    addInstancedBox(this.infrastructureGroup, "建筑裙房基座", buckets.buildingPodiumBases, 0xa7a49a, { roughness: 0.74, metalness: 0.04 });
    addInstancedBox(this.infrastructureGroup, "建筑坡屋顶片", buckets.buildingPitchedRoofPlanes, 0x9f6645, { roughness: 0.86, metalness: 0.02 });
    addInstancedBox(this.infrastructureGroup, "建筑阳台栏杆", buckets.buildingBalconyRails, 0xd8d1bd, { roughness: 0.58, metalness: 0.08 });
    addInstancedBox(this.infrastructureGroup, "建筑服务院落", buckets.buildingServiceYards, 0x6d706c, { roughness: 0.88, metalness: 0.02 });
    addInstancedBox(this.infrastructureGroup, "建筑到发门廊", buckets.buildingServiceDropoffs, 0xd7d0b7, { roughness: 0.7, metalness: 0.02 });
    addInstancedBox(this.infrastructureGroup, "建筑冷却机组", buckets.buildingCoolingPlants, 0x91a8ad, { roughness: 0.5, metalness: 0.14 });
    addInstancedBox(this.infrastructureGroup, "建筑机电屏障", buckets.buildingMechanicalScreens, 0x87949a, { roughness: 0.52, metalness: 0.12 });
    addInstancedBox(this.infrastructureGroup, "建筑服务竖井", buckets.buildingFacadeServiceSlots, 0x4f6268, { roughness: 0.48, metalness: 0.16 });
    addInstancedBox(this.infrastructureGroup, "设施光伏支架", buckets.solarSupports, 0x6f7b73, { roughness: 0.66, metalness: 0.12 });
    addInstancedBox(this.infrastructureGroup, "设施冷却排架", buckets.coolingRacks, 0x7f959d, { roughness: 0.54, metalness: 0.1 });
    addInstancedBox(this.infrastructureGroup, "设施温室屋脊", buckets.greenhouseRidges, 0xc7f1e4, { roughness: 0.28, metalness: 0.02, transparent: true, opacity: 0.76 });
    addInstancedBox(this.infrastructureGroup, "设施市集遮棚", buckets.marketAwnings, 0xd77b4f, { roughness: 0.58, metalness: 0.03 });
    addInstancedBox(this.infrastructureGroup, "体育场草坪核心", buckets.stadiumFields, 0x4f9b5a, { roughness: 0.88, metalness: 0.01 });
    addInstancedBox(this.infrastructureGroup, "农田作物行", buckets.farmRows, 0xa6a758, { roughness: 0.96, transparent: true, opacity: 0.88 });
    addInstancedBox(this.infrastructureGroup, "梯田挡墙", buckets.terraceWalls, 0x8b7a60, { roughness: 0.92, metalness: 0.01 });
    addInstancedBox(this.infrastructureGroup, "采石台阶", buckets.quarryBenches, 0x9a7c58, { roughness: 0.96 });
    addInstancedBox(this.infrastructureGroup, "变电站构架", buckets.substationFrames, 0xa6aaa7, { roughness: 0.48, metalness: 0.22 });
    addInstancedBox(this.infrastructureGroup, "医院停机坪", buckets.hospitalHelipads, 0xf1f3ee, { roughness: 0.5, metalness: 0.02 });
    addInstancedBox(this.infrastructureGroup, "学校场院", buckets.schoolYards, 0x5f9d67, { roughness: 0.86, metalness: 0.01 });
    addInstancedBox(this.infrastructureGroup, "应急车道铺面", buckets.emergencyBays, 0xc85f52, { roughness: 0.74, metalness: 0.02 });
    addInstancedBox(this.infrastructureGroup, "安保前场", buckets.securityForecourts, 0x6e8494, { roughness: 0.7, metalness: 0.04 });
    addInstancedBox(this.infrastructureGroup, "酒店裙房", buckets.hotelPodiums, 0xb99367, { roughness: 0.68, metalness: 0.03 });
    addInstancedBox(this.infrastructureGroup, "办公机电平台", buckets.officeMechanicalDecks, 0x83939a, { roughness: 0.56, metalness: 0.12 });
    addInstancedBox(this.infrastructureGroup, "诊所救护车位", buckets.clinicAmbulanceBays, 0x7fb4ac, { roughness: 0.68, metalness: 0.02 });
    addInstancedBox(this.infrastructureGroup, "图书馆阅览庭院", buckets.libraryCourtyards, 0x6f9c72, { roughness: 0.86, metalness: 0.01 });
    addInstancedBox(this.infrastructureGroup, "社区广场", buckets.communityPlazas, 0xb99667, { roughness: 0.78, metalness: 0.02 });
    addInstancedBox(this.infrastructureGroup, "公交港湾", buckets.busBays, 0xd7d1b5, { roughness: 0.7, metalness: 0.02 });
    addInstancedCylinder(this.infrastructureGroup, "高架水塔储罐", buckets.waterTowerTanks, 0xb8c8cc, { radiusSegments: 16, roughness: 0.56, metalness: 0.1 });
    addInstancedBox(this.infrastructureGroup, "水塔支腿", buckets.waterTowerLegs, 0x8c989c, { roughness: 0.58, metalness: 0.12 });
    addInstancedBox(this.infrastructureGroup, "天文台穹顶", buckets.observatoryDomes, 0xc8d3d2, { geometryFactory: (variant) => createAssetGeometry("observatory-dome", budgetPlan.quality, variant), roughness: 0.42, metalness: 0.08 });
    addInstancedBox(this.infrastructureGroup, "天文台望远镜座", buckets.observatoryTelescopeMounts, 0xe1e6e3, { roughness: 0.46, metalness: 0.18 });
    addInstancedBox(this.infrastructureGroup, "缆车塔架", buckets.cableCarTowers, 0x8f9284, { roughness: 0.56, metalness: 0.16 });
    addInstancedBox(this.infrastructureGroup, "缆车索道", buckets.cableCarCables, 0x2f3434, { roughness: 0.36, metalness: 0.42 });
    addInstancedBox(this.infrastructureGroup, "缆车站台", buckets.cableCarPlatforms, 0xb8b7a4, { roughness: 0.66, metalness: 0.06 });
    addInstancedBox(this.infrastructureGroup, "排涝泵站进水闸", buckets.floodPumpIntakes, 0x7897a0, { roughness: 0.52, metalness: 0.12 });
    addInstancedBox(this.infrastructureGroup, "排涝泵站出水渠", buckets.floodPumpOutfalls, 0x4f9bb2, { roughness: 0.44, metalness: 0.04, transparent: true, opacity: 0.84 });
    addInstancedCylinder(this.infrastructureGroup, "海水淡化处理罐", buckets.desalinationTanks, 0x9db8bd, { radiusSegments: 18, roughness: 0.56, metalness: 0.12 });
    addInstancedBox(this.infrastructureGroup, "海水淡化取水廊", buckets.desalinationIntakeGalleries, 0x5ba7bb, { roughness: 0.42, metalness: 0.04, transparent: true, opacity: 0.82 });
    addInstancedBox(this.infrastructureGroup, "游客中心广场", buckets.visitorCenterPlazas, 0xc4ad78, { roughness: 0.78, metalness: 0.02 });
    addInstancedBox(this.infrastructureGroup, "景观点平台", buckets.scenicOverlookDecks, 0xb8aa82, { roughness: 0.7, metalness: 0.04 });
    addInstancedBox(this.infrastructureGroup, "景观点栏杆", buckets.scenicOverlookRails, 0xd6d1b5, { roughness: 0.5, metalness: 0.12 });
    addInstancedBox(this.infrastructureGroup, "步道入口服务亭", buckets.trailheadKiosks, 0xa9976c, { roughness: 0.72, metalness: 0.02 });
    addInstancedBox(this.infrastructureGroup, "步道入口路径带", buckets.trailheadTrailStrips, 0x7a6b4d, { roughness: 0.96, metalness: 0.01 });
    addInstancedBox(this.infrastructureGroup, "护林站瞭望塔", buckets.rangerWatchTowers, 0x7d8f5f, { roughness: 0.64, metalness: 0.08 });
    addInstancedBox(this.infrastructureGroup, "护林站场院", buckets.rangerYards, 0x789a68, { roughness: 0.9, metalness: 0.01 });
    addInstancedBox(this.infrastructureGroup, "水文测尺板", buckets.gaugingStaffPlates, 0x5ba7bb, { roughness: 0.44, metalness: 0.04, transparent: true, opacity: 0.84 });
    addInstancedCylinder(this.infrastructureGroup, "水文传感器桅杆", buckets.gaugingSensorMasts, 0xcbd7d7, { radiusSegments: 6, roughness: 0.46, metalness: 0.16 });
    addInstancedBox(this.infrastructureGroup, "生态设施联动线", buckets.ecosystemNetworkLinks, 0x7bc6d8, {
      roughness: 0.42,
      metalness: 0.08,
      transparent: true,
      opacity: 0.76,
      emissiveIntensity: 0.48
    });
    addInstancedTorus(this.infrastructureGroup, "生态设施角色光环", buckets.ecosystemRoleHalos, 0x80d18a);
    addInstancedCylinder(this.infrastructureGroup, "生态设施角色节点", buckets.ecosystemRoleNodes, 0x80d18a, {
      radiusSegments: 10,
      roughness: 0.42,
      metalness: 0.08,
      emissiveIntensity: 0.62
    });
    addInstancedBox(this.infrastructureGroup, "设施服务标识", buckets.serviceSignage, 0xf0cf82, { roughness: 0.45, metalness: 0.06, emissiveIntensity: 0.34 });
    addInstancedBox(this.infrastructureGroup, "铁路枕木", buckets.railSleepers, 0x7a5f45, { roughness: 0.86, metalness: 0.02 });
    addInstancedBox(this.infrastructureGroup, "桥梁防护栏", buckets.bridgeGuardRails, 0x9aa2a0, { roughness: 0.62, metalness: 0.08 });
    addInstancedBox(this.infrastructureGroup, "溢洪道闸门", buckets.damSpillwayGates, 0xc7d0cf, { roughness: 0.5, metalness: 0.16 });
    addInstancedBox(this.infrastructureGroup, "跑道入口标志条", buckets.airportThresholdMarks, 0xefead6, { roughness: 0.62, metalness: 0.02 });
    addInstancedBox(this.infrastructureGroup, "港口码头作业面", buckets.portQuayAprons, 0x6e7470, { roughness: 0.78, metalness: 0.04 });
    addInstancedBox(this.infrastructureGroup, "港口起重机塔身", buckets.portCraneMasts, 0xd4a64e, { roughness: 0.5, metalness: 0.18 });
    addInstancedBox(this.infrastructureGroup, "港口起重机臂架", buckets.portCraneBooms, 0xd4a64e, { roughness: 0.46, metalness: 0.2 });
    addInstancedBox(this.infrastructureGroup, "适应性防洪台基", buckets.adaptiveFoundationPlinths, 0xa99d86, { roughness: 0.82, metalness: 0.02 });
    addInstancedBox(this.infrastructureGroup, "适应性边坡挡墙", buckets.adaptiveSlopeRetainingWalls, 0x8b7a65, { roughness: 0.9, metalness: 0.01 });
    addInstancedBox(this.infrastructureGroup, "适应性排水浅沟", buckets.adaptiveDrainageSwales, 0x5f9fb0, { roughness: 0.58, metalness: 0.02, transparent: true, opacity: 0.78 });
    addInstancedBox(this.infrastructureGroup, "适应性防风屏", buckets.adaptiveWindbreakScreens, 0x9eb2ae, { roughness: 0.54, metalness: 0.1, transparent: true, opacity: 0.82 });
    addInstancedBox(this.infrastructureGroup, "适应性防火隔离带", buckets.adaptiveFirebreakStrips, 0xb9a772, { roughness: 0.94, metalness: 0.01 });
    addBlockMicrozoneInstancedLayers(this.infrastructureGroup, buckets);
    const facilityDetailPlan = buildFacilityDetailPlan(buckets);
    const adaptationDetailPlan = buildAdaptationDetailPlan(buckets);
    const buildingDivisor = Math.max(1, buildingInstanceCount);
    this.infrastructure3DStats = {
      buildingInstanceCount,
      damageOverlayCount: buckets.buildingDamageOverlays.length,
      foundationRiskSkirtCount: buckets.foundationRiskSkirts.length,
      recoveryBeaconCount: buckets.recoveryBeacons.length,
      meanCurrentDamage: roundDiagnostic(damageSum / buildingDivisor),
      meanRecoveryPressure: roundDiagnostic(recoveryPressureSum / buildingDivisor),
      meanFoundationRisk: roundDiagnostic(foundationRiskSum / buildingDivisor),
      diagnosticLayerBudget: budgetPlan.maxBuildingDiagnosticInstances,
      skippedDiagnosticInstanceCount,
      facadeDetailPlan: {
        mode: "typed-instanced-building-facades",
        maxDetailInstances: maxFacadeDetailInstances,
        usedDetailInstances: facadeDetailInstanceCount,
        skippedDetailInstanceCount: skippedFacadeDetailInstanceCount,
        windowGridCount: buckets.windowGrids.length,
        facadeBandCount: buckets.facadeBands.length,
        facadeVerticalCount: buckets.facadeVerticals.length,
        balconyCount: buckets.balconies.length,
        entranceCanopyCount: buckets.entrances.length,
        roofEquipmentCount: buckets.roofEquipment.length,
        roofGardenCount: buckets.roofGardens.length,
        materialFamilyCounts: facadeMaterialFamilyCounts,
        typeDetailCounts: facadeTypeDetailCounts,
        instancedDetailDrawCalls: [
          buckets.facadeBands,
          buckets.facadeVerticals,
          buckets.windowGrids,
          buckets.balconies,
          buckets.entrances,
          buckets.roofEquipment,
          buckets.roofGardens,
          buckets.antennas
        ].filter((bucket) => bucket.length > 0).length
      },
      buildingRealityDetailPlan: buildBuildingRealityDetailPlan(buckets, {
        maxDetailInstances: maxFacadeDetailInstances,
        skippedDetailInstanceCount: skippedBuildingRealityDetailInstanceCount,
        componentFamilyCounts: buildingRealityFamilyCounts,
        typeComponentCounts: buildingRealityTypeComponentCounts
      }),
      buildingMaterialColorPlan: {
        mode: "typed-building-material-color-plan",
        usedMaterialSamples: buildingMaterialSampleCount,
        materialFamilyCounts: buildingMaterialFamilyCounts,
        typeMaterialCounts: buildingMaterialTypeCounts,
        darkColorViolationCount: darkBuildingMaterialViolationCount,
        meanRelativeLuminance: roundDiagnostic(buildingMaterialLuminanceSum / Math.max(1, buildingMaterialSampleCount)),
        sampleColors: buildingMaterialSamples,
        blackBlockSafetyRule: "minimum-channel>=62-and-mean-perceived-luminance>=0.22"
      },
      facilityDetailPlan,
      adaptationDetailPlan,
      ecosystemDiagnosticPlan: buildInfrastructureEcosystem3DDiagnosticPlan(ecosystemRoleCounts, ecosystemTypeCounts, ecosystemCellCount, ecosystemVisualPlan),
      blockMicrozoneDetailPlan,
      layerNames: this.infrastructureGroup.children.map((child) => child.name)
    };
    if (typeof globalThis !== "undefined") globalThis.__geoLabInfrastructure3DStats = this.infrastructure3DStats;
  }

  buildHazards3D() {
    disposeObjectTree(this.hazardGroup);
    if (!this.shouldShowHazards3D()) {
      this.hazard3DStats = {
        enabled: false,
        samplingStep: 0,
        budgetMode: "on-demand",
        maxInstanceBudget: 0,
        usedInstanceCount: 0,
        layerNames: []
      };
      if (typeof globalThis !== "undefined") globalThis.__geoLabHazard3DStats = this.hazard3DStats;
      return;
    }
    const model = this.model;
    const hazards = model?.hazards;
    if (!hazards?.currentHazardIndex) {
      this.hazard3DStats = {
        samplingStep: 0,
        budgetMode: "none",
        maxInstanceBudget: 0,
        usedInstanceCount: 0,
        layerNames: []
      };
      if (typeof globalThis !== "undefined") globalThis.__geoLabHazard3DStats = this.hazard3DStats;
      return;
    }
    const cell = model.cellSizeKm || modelSizeKm(model) / Math.max(1, model.n - 1);
    const budgetPlan = this.activeDetailBudgetPlan || detailBudgetPlan(model);
    const step = budgetPlan.hazardStep;
    const seed = Number(this.params.seed) || 0;
    const buckets = {
      floodSheets: [],
      droughtPatches: [],
      fireColumns: [],
      landslideScars: [],
      floodFlowArrows: [],
      wildfireWindFronts: [],
      landslideRunoutVectors: []
    };
    let budget = budgetPlan.maxHazardInstances;
    const initialBudget = budget;
    for (let y = 0; y < model.n && budget > 0; y += step) {
      for (let x = 0; x < model.n && budget > 0; x += step) {
        const i = y * model.n + x;
        if (model.height[i] <= Number(this.params.seaLevel)) continue;
        const base = this.indexToWorld(i, 2);
        const flood = hazards.currentFloodHazard?.[i] ?? 0;
        const drought = hazards.currentDroughtStress?.[i] ?? 0;
        const fire = hazards.currentWildfireRisk?.[i] ?? 0;
        const slide = hazards.currentLandslideRisk?.[i] ?? 0;
        const angle = infrastructureAngle(model, i, x, y, "hazard", seed);
        const size = cell * step * 0.92;
        if (flood > 0.45) {
          buckets.floodSheets.push({
            x: base.x,
            y: base.y + 0.018 + Math.min(0.18, (hazards.floodDepthM?.[i] ?? 0) * 0.015),
            z: base.z,
            sx: size,
            sy: 0.012,
            sz: size,
            ry: angle,
            color: hazardColor(0x4ba9d1, 0xd8f5ff, flood)
          });
          if (flood > 0.58) {
            pushHazardVectorGlyph(
              buckets.floodFlowArrows,
              base,
              hazardProcessAngle(model, i, x, y, "flood", seed),
              size,
              flood,
              hazardColor(0x8bd6ef, 0xe2fbff, flood),
              0.04
            );
          }
          budget -= 1;
        }
        if (drought > 0.62) {
          buckets.droughtPatches.push({
            x: base.x,
            y: base.y + 0.01,
            z: base.z,
            sx: size * 0.82,
            sy: 0.01,
            sz: size * 0.82,
            ry: angle,
            color: hazardColor(0xb78345, 0xe0b65f, drought)
          });
          budget -= 1;
        }
        if (fire > 0.58 && hash01(x, y, seed + 1729) < fire) {
          const height = 0.07 + fire * 0.34;
          buckets.fireColumns.push({
            x: base.x + (hash01(x, y, seed + 19) - 0.5) * size * 0.28,
            y: base.y + height / 2,
            z: base.z + (hash01(y, x, seed + 23) - 0.5) * size * 0.28,
            sx: Math.max(0.018, size * 0.035),
            sy: height,
            sz: Math.max(0.018, size * 0.035),
            ry: angle,
            color: hazardColor(0xd7633f, 0xffc15b, fire)
          });
          pushHazardVectorGlyph(
            buckets.wildfireWindFronts,
            base,
            hazardProcessAngle(model, i, x, y, "wildfire", seed),
            size,
            fire,
            hazardColor(0xe36a34, 0xffd15e, fire),
            0.05
          );
          budget -= 1;
        }
        if (slide > 0.55) {
          buckets.landslideScars.push({
            x: base.x,
            y: base.y + 0.016,
            z: base.z,
            sx: size * (0.42 + slide * 0.34),
            sy: 0.012,
            sz: Math.max(0.035, size * 0.13),
            ry: angle,
            color: hazardColor(0x7b6a4e, 0xc29a62, slide)
          });
          pushHazardVectorGlyph(
            buckets.landslideRunoutVectors,
            base,
            hazardProcessAngle(model, i, x, y, "landslide", seed),
            size,
            slide,
            hazardColor(0x8d7657, 0xd1a56a, slide),
            0.045
          );
          budget -= 1;
        }
      }
    }
    addInstancedBox(this.hazardGroup, "洪水淹没片", buckets.floodSheets, 0x4ba9d1, { roughness: 0.32, metalness: 0.02, transparent: true, opacity: 0.58 });
    addInstancedBox(this.hazardGroup, "干旱胁迫斑", buckets.droughtPatches, 0xb78345, { roughness: 0.94, transparent: true, opacity: 0.46 });
    addInstancedCylinder(this.hazardGroup, "野火风险柱", buckets.fireColumns, 0xd7633f, { radiusSegments: 7, roughness: 0.68, transparent: true, opacity: 0.72 });
    addInstancedBox(this.hazardGroup, "滑坡疤痕带", buckets.landslideScars, 0x7b6a4e, { roughness: 0.98, transparent: true, opacity: 0.62 });
    addInstancedBox(this.hazardGroup, "洪水流向箭头", buckets.floodFlowArrows, 0x8bd6ef, { roughness: 0.42, metalness: 0.02, transparent: true, opacity: 0.82, emissiveIntensity: 0.36 });
    addInstancedBox(this.hazardGroup, "野火风向锋线", buckets.wildfireWindFronts, 0xe36a34, { roughness: 0.62, transparent: true, opacity: 0.84, emissiveIntensity: 0.42 });
    addInstancedBox(this.hazardGroup, "滑坡滑移方向", buckets.landslideRunoutVectors, 0x8d7657, { roughness: 0.88, transparent: true, opacity: 0.78, emissiveIntensity: 0.3 });
    this.hazard3DStats = {
      samplingStep: step,
      budgetMode: budgetPlan.mode,
      maxInstanceBudget: initialBudget,
      usedInstanceCount: initialBudget - budget,
      floodSheetCount: buckets.floodSheets.length,
      droughtPatchCount: buckets.droughtPatches.length,
      fireColumnCount: buckets.fireColumns.length,
      landslideScarCount: buckets.landslideScars.length,
      floodFlowArrowCount: buckets.floodFlowArrows.length,
      wildfireWindFrontCount: buckets.wildfireWindFronts.length,
      landslideRunoutVectorCount: buckets.landslideRunoutVectors.length,
      eventDynamics: hazards.summary?.eventDynamics || null,
      layerNames: this.hazardGroup.children.map((child) => child.name)
    };
    if (typeof globalThis !== "undefined") globalThis.__geoLabHazard3DStats = this.hazard3DStats;
  }

  buildWindArrows() {
    disposeObjectTree(this.windGroup);
    if (!this.shouldShowWind3D()) return;
    const params = this.params;
    const model = this.model;
    const count = 7;
    const sizeKm = modelSizeKm(model);
    const spacing = sizeKm / count;

    for (let y = 0; y < count; y += 1) {
      for (let x = 0; x < count; x += 1) {
        const wx = -sizeKm / 2 + spacing * (x + 0.5);
        const wz = -sizeKm / 2 + spacing * (y + 0.5);
        const gx = Math.round(((wx / sizeKm + 0.5) * (model.n - 1)));
        const gy = Math.round(((wz / sizeKm + 0.5) * (model.n - 1)));
        const i = gy * model.n + gx;
        const elevation = (model.height[i] / 1000) * Number(params.verticalScale) + 0.22;
        const directionTo = (((model.windDirection?.[i] ?? Number(params.windDirection)) + 180) * Math.PI) / 180;
        const dir = new THREE.Vector3(Math.sin(directionTo), 0, -Math.cos(directionTo)).normalize();
        const length = 0.42 + Math.min(1.25, (model.windSpeed?.[i] ?? Number(params.windSpeed)) / 32) * 0.82;
        const arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(wx, elevation, wz), length, 0xdcebc6, 0.18, 0.1);
        arrow.userData.baseY = elevation;
        arrow.line.material.transparent = true;
        arrow.line.material.opacity = 0.48;
        arrow.cone.material.transparent = true;
        arrow.cone.material.opacity = 0.68;
        this.windGroup.add(arrow);
      }
    }
  }

  indexToWorld(index, order = 1) {
    const model = this.model;
    const x = index % model.n;
    const y = Math.floor(index / model.n);
    return {
      x: (x / (model.n - 1) - 0.5) * modelSizeKm(model),
      y: (model.height[index] / 1000) * Number(this.params.verticalScale) + 0.025 + order * 0.006,
      z: (y / (model.n - 1) - 0.5) * modelSizeKm(model)
    };
  }
}

function addFacilityCell(buckets, cellInfo) {
  const {
    type,
    base,
    cell,
    angle,
    seed,
    x,
    y,
    heightM,
    landmarkHeightM,
    verticalScale = 1,
    impervious,
    storageMm,
    adaptationNeed = 0,
    suitability = 0,
    environment = {}
  } = cellInfo;
  let used = 0;
  const thinY = 0.012;
  const localHash = hash01(x, y, seed + 2311);
  const scaledVertical = Number.isFinite(verticalScale) && verticalScale > 0 ? verticalScale : 1;
  const roofDetailY = (fallbackHeightM = 12) => base.y + visualBuildingHeight(Math.max(heightM || 0, fallbackHeightM), scaledVertical) + 0.018;
  const pushServiceSign = (forward, side, color = 0xf0cf82, scale = 1) => {
    const offset = rotatedOffset(angle, forward * cell, side * cell);
    buckets.serviceSignage.push({
      x: base.x + offset.x,
      y: base.y + Math.max(0.052, cell * 0.05),
      z: base.z + offset.z,
      sx: Math.max(cell * 0.13 * scale, 0.032),
      sy: Math.max(cell * 0.045 * scale, 0.032),
      sz: Math.max(cell * 0.024, 0.01),
      ry: angle,
      color
    });
    used += 1;
  };
  used += pushFacilityAdaptationDetails(buckets, {
    type,
    base,
    cell,
    angle,
    seed,
    x,
    y,
    adaptationNeed,
    suitability,
    environment
  });
  if (type === "reservoir") {
    buckets.reservoirs.push({
      x: base.x,
      y: base.y + 0.006,
      z: base.z,
      sx: cell * 0.96,
      sy: thinY,
      sz: cell * 0.96,
      ry: angle,
      color: 0x3f9fc2
    });
    buckets.canalEdges.push({
      x: base.x,
      y: base.y + 0.018,
      z: base.z,
      sx: cell * 1.02,
      sy: 0.012,
      sz: Math.max(cell * 0.035, 0.018),
      ry: angle,
      color: 0x6e7666
    });
    buckets.canalEdges.push({
      x: base.x,
      y: base.y + 0.018,
      z: base.z,
      sx: Math.max(cell * 0.035, 0.018),
      sy: 0.012,
      sz: cell * 1.02,
      ry: angle,
      color: 0x6e7666
    });
    return 3;
  }
  if (type === "canal") {
    buckets.canals.push({
      x: base.x,
      y: base.y + 0.014,
      z: base.z,
      sx: cell * 1.16,
      sy: 0.018,
      sz: Math.max(cell * 0.18, 0.035),
      ry: angle,
      color: 0x4ea4bd
    });
    for (const offset of [-cell * 0.12, cell * 0.12]) {
      const side = rotatedOffset(angle, 0, offset);
      buckets.canalEdges.push({
        x: base.x + side.x,
        y: base.y + 0.027,
        z: base.z + side.z,
        sx: cell * 1.14,
        sy: 0.014,
        sz: Math.max(cell * 0.026, 0.012),
        ry: angle,
        color: 0x767b68
      });
      used += 1;
    }
    return used + 1;
  }
  if (type === "dam") {
    buckets.dams.push({
      x: base.x,
      y: base.y + Math.max(0.035, cell * 0.06),
      z: base.z,
      sx: cell * 1.18,
      sy: Math.max(0.07, cell * 0.12 + storageMm / 8000),
      sz: Math.max(cell * 0.12, 0.045),
      ry: angle + Math.PI * 0.5,
      color: 0x8f9697
    });
    buckets.spillways.push({
      x: base.x + Math.cos(angle) * cell * 0.18,
      y: base.y + Math.max(0.045, cell * 0.075),
      z: base.z - Math.sin(angle) * cell * 0.18,
      sx: cell * 0.22,
      sy: Math.max(0.02, cell * 0.04),
      sz: Math.max(cell * 0.09, 0.035),
      ry: angle,
      color: 0x5e7d86
    });
    for (const offset of [-0.16, 0, 0.16]) {
      const gateOffset = rotatedOffset(angle + Math.PI * 0.5, offset * cell, 0);
      buckets.damSpillwayGates.push({
        x: base.x + gateOffset.x + Math.cos(angle) * cell * 0.18,
        y: base.y + Math.max(0.08, cell * 0.12),
        z: base.z + gateOffset.z - Math.sin(angle) * cell * 0.18,
        sx: Math.max(cell * 0.055, 0.018),
        sy: Math.max(cell * 0.11, 0.05),
        sz: Math.max(cell * 0.026, 0.012),
        ry: angle + Math.PI * 0.5,
        color: 0xc7d0cf
      });
      used += 1;
    }
    return used + 2;
  }
  if (type === "levee") {
    buckets.levees.push({
      x: base.x,
      y: base.y + Math.max(0.018, cell * 0.032),
      z: base.z,
      sx: cell * 1.12,
      sy: Math.max(0.035, cell * 0.065),
      sz: Math.max(cell * 0.16, 0.04),
      ry: angle,
      color: 0x9a8d66
    });
    return 1;
  }
  if (type === "transport" || type === "bridge") {
    buckets.roads.push({
      x: base.x,
      y: base.y + (type === "bridge" ? 0.055 : 0.012),
      z: base.z,
      sx: cell * 1.24,
      sy: type === "bridge" ? 0.034 : 0.014,
      sz: Math.max(cell * (type === "bridge" ? 0.16 : 0.12), 0.028),
      ry: angle,
      color: type === "bridge" ? 0x7a8180 : 0x59605c
    });
    buckets.laneMarkings.push({
      x: base.x,
      y: base.y + (type === "bridge" ? 0.074 : 0.022),
      z: base.z,
      sx: cell * 0.92,
      sy: 0.004,
      sz: Math.max(cell * 0.012, 0.006),
      ry: angle,
      color: 0xd9d5bd
    });
    for (const offset of [-cell * 0.11, cell * 0.11]) {
      const side = rotatedOffset(angle, 0, offset);
      buckets.streetLights.push({
        x: base.x + side.x,
        y: base.y + 0.07,
        z: base.z + side.z,
        sx: Math.max(cell * 0.009, 0.006),
        sy: 0.12,
        sz: Math.max(cell * 0.009, 0.006),
        ry: angle,
        color: 0xb8b9ad
      });
      used += 1;
    }
    if (type === "bridge") {
      for (const offset of [-cell * 0.22, cell * 0.22]) {
        const forward = rotatedOffset(angle, offset, 0);
        buckets.bridgePiers.push({
          x: base.x + forward.x,
          y: base.y + 0.028,
          z: base.z + forward.z,
          sx: Math.max(cell * 0.026, 0.012),
          sy: 0.07,
          sz: Math.max(cell * 0.026, 0.012),
          ry: angle,
          color: 0x838785
        });
        used += 1;
      }
      for (const offset of [-cell * 0.105, cell * 0.105]) {
        const side = rotatedOffset(angle, 0, offset);
        buckets.bridgeGuardRails.push({
          x: base.x + side.x,
          y: base.y + 0.092,
          z: base.z + side.z,
          sx: cell * 1.16,
          sy: Math.max(cell * 0.028, 0.014),
          sz: Math.max(cell * 0.018, 0.008),
          ry: angle,
          color: 0x9aa2a0
        });
        used += 1;
      }
    }
    return used + 2;
  }
  if (type === "rail") {
    const railWidth = Math.max(cell * 0.028, 0.012);
    for (const offset of [-cell * 0.035, cell * 0.035]) {
      const side = rotatedOffset(angle, 0, offset);
      buckets.rails.push({
        x: base.x + side.x,
        y: base.y + 0.018,
        z: base.z + side.z,
        sx: cell * 1.2,
        sy: 0.014,
        sz: railWidth,
        ry: angle,
        color: 0x646762
      });
      used += 1;
    }
    for (const offset of [-0.42, -0.21, 0, 0.21, 0.42]) {
      const along = rotatedOffset(angle, offset * cell, 0);
      buckets.railSleepers.push({
        x: base.x + along.x,
        y: base.y + 0.012,
        z: base.z + along.z,
        sx: Math.max(cell * 0.18, 0.045),
        sy: Math.max(cell * 0.012, 0.006),
        sz: Math.max(cell * 0.03, 0.01),
        ry: angle + Math.PI * 0.5,
        color: 0x7a5f45
      });
      used += 1;
    }
    buckets.laneMarkings.push({
      x: base.x,
      y: base.y + 0.026,
      z: base.z,
      sx: Math.max(cell * 0.035, 0.012),
      sy: 0.008,
      sz: cell * 0.34,
      ry: angle + Math.PI * 0.5,
      color: 0x5a5145
    });
    return used + 1;
  }
  if (type === "bus_terminal") {
    buckets.slabs.push({
      x: base.x,
      y: base.y + 0.012,
      z: base.z,
      sx: Math.max(cell * 0.62, 0.14),
      sy: 0.016,
      sz: Math.max(cell * 0.42, 0.1),
      ry: angle,
      color: 0x697377
    });
    for (const offset of [-0.18, 0, 0.18]) {
      const side = rotatedOffset(angle, 0, offset * cell);
      buckets.busBays.push({
        x: base.x + side.x,
        y: base.y + 0.026,
        z: base.z + side.z,
        sx: Math.max(cell * 0.5, 0.12),
        sy: 0.014,
        sz: Math.max(cell * 0.055, 0.018),
        ry: angle,
        color: 0xd7d1b5
      });
      used += 1;
    }
    buckets.laneMarkings.push({
      x: base.x,
      y: base.y + 0.034,
      z: base.z,
      sx: Math.max(cell * 0.5, 0.12),
      sy: 0.005,
      sz: Math.max(cell * 0.012, 0.006),
      ry: angle,
      color: 0xf0e8c8
    });
    pushServiceSign(0.34, -0.22, 0x9ec2cf, 0.94);
    return used + 2;
  }
  if (type === "airport") {
    buckets.runways.push({
      x: base.x,
      y: base.y + 0.014,
      z: base.z,
      sx: cell * 1.42,
      sy: 0.014,
      sz: Math.max(cell * 0.22, 0.06),
      ry: angle,
      color: 0x50575a
    });
    buckets.runwayMarks.push({
      x: base.x,
      y: base.y + 0.024,
      z: base.z,
      sx: cell * 0.58,
      sy: 0.005,
      sz: Math.max(cell * 0.018, 0.012),
      ry: angle,
      color: 0xdedbcc
    });
    buckets.slabs.push({
      x: base.x + Math.sin(angle) * cell * 0.28,
      y: base.y + 0.035,
      z: base.z + Math.cos(angle) * cell * 0.28,
      sx: cell * 0.34,
      sy: 0.05,
      sz: cell * 0.22,
      ry: angle,
      color: 0xaeb1ad
    });
    for (const end of [-0.44, 0.44]) {
      for (const side of [-0.075, -0.025, 0.025, 0.075]) {
        const mark = rotatedOffset(angle, end * cell, side * cell);
        buckets.airportThresholdMarks.push({
          x: base.x + mark.x,
          y: base.y + 0.027,
          z: base.z + mark.z,
          sx: Math.max(cell * 0.13, 0.035),
          sy: 0.005,
          sz: Math.max(cell * 0.012, 0.006),
          ry: angle + Math.PI * 0.5,
          color: 0xefead6
        });
        used += 1;
      }
    }
    return used + 3;
  }
  if (type === "port") {
    buckets.slabs.push({
      x: base.x,
      y: base.y + 0.012,
      z: base.z,
      sx: cell * 0.88,
      sy: 0.018,
      sz: Math.max(cell * 0.44, 0.12),
      ry: angle,
      color: 0x6e7470
    });
    const quay = rotatedOffset(angle, 0, -cell * 0.23);
    buckets.portQuayAprons.push({
      x: base.x + quay.x,
      y: base.y + 0.022,
      z: base.z + quay.z,
      sx: cell * 0.9,
      sy: 0.016,
      sz: Math.max(cell * 0.12, 0.04),
      ry: angle,
      color: 0x767b76
    });
    for (const offset of [-0.24, 0.18]) {
      const crane = rotatedOffset(angle, offset * cell, -cell * 0.17);
      buckets.portCraneMasts.push({
        x: base.x + crane.x,
        y: base.y + Math.max(cell * 0.11, 0.08),
        z: base.z + crane.z,
        sx: Math.max(cell * 0.035, 0.014),
        sy: Math.max(cell * 0.2, 0.12),
        sz: Math.max(cell * 0.035, 0.014),
        ry: angle,
        color: 0xd4a64e
      });
      buckets.portCraneBooms.push({
        x: base.x + crane.x + Math.cos(angle) * cell * 0.12,
        y: base.y + Math.max(cell * 0.205, 0.13),
        z: base.z + crane.z - Math.sin(angle) * cell * 0.12,
        sx: Math.max(cell * 0.28, 0.08),
        sy: Math.max(cell * 0.018, 0.008),
        sz: Math.max(cell * 0.026, 0.01),
        ry: angle,
        color: 0xd4a64e
      });
      used += 2;
    }
    pushServiceSign(0.34, 0.22, 0xd4a64e, 0.9);
    return used + 2;
  }
  if (type === "solar_farm") {
    const rows = localHash > 0.5 ? [-0.18, 0.18] : [0];
    for (const row of rows) {
      const side = rotatedOffset(angle, 0, row * cell);
      buckets.solarPanels.push({
        x: base.x + side.x,
        y: base.y + 0.028,
        z: base.z + side.z,
        sx: cell * 0.72,
        sy: 0.018,
        sz: cell * 0.18,
        ry: angle + 0.08,
        color: 0x2e5d8a
      });
      buckets.solarSupports.push({
        x: base.x + side.x,
        y: base.y + 0.014,
        z: base.z + side.z,
        sx: cell * 0.64,
        sy: 0.026,
        sz: Math.max(cell * 0.026, 0.012),
        ry: angle,
        color: 0x6f7b73
      });
      used += 1;
    }
    return used * 2;
  }
  if (type === "wind_farm") {
    const mastHeight = visualBuildingHeight(Math.max(landmarkHeightM, 95), 1);
    const mastPlan = towerPlanWidth(mastHeight, cell, 0.055, 6.6);
    buckets.windMasts.push({
      x: base.x,
      y: base.y + mastHeight / 2,
      z: base.z,
      sx: mastPlan,
      sy: mastHeight,
      sz: mastPlan,
      ry: angle,
      color: 0xdfe4df
    });
    buckets.windBlades.push({
      x: base.x,
      y: base.y + mastHeight * 0.92,
      z: base.z,
      sx: Math.max(cell * 0.42, 0.09),
      sy: 0.012,
      sz: 0.012,
      ry: angle,
      color: 0xdfe4df
    });
    buckets.windBlades.push({
      x: base.x,
      y: base.y + mastHeight * 0.92,
      z: base.z,
      sx: Math.max(cell * 0.32, 0.07),
      sy: 0.012,
      sz: 0.012,
      ry: angle + Math.PI * 0.5,
      color: 0xdfe4df
    });
    return 3;
  }
  if (type === "data_center") {
    buckets.slabs.push({
      x: base.x,
      y: base.y + 0.012,
      z: base.z,
      sx: cell * 0.78,
      sy: 0.018,
      sz: cell * 0.62,
      ry: angle,
      color: 0x6e7478
    });
    for (const offset of [-0.22, 0, 0.22]) {
      const side = rotatedOffset(angle, offset * cell, -cell * 0.23);
      buckets.coolingRacks.push({
        x: base.x + side.x,
        y: base.y + 0.054,
        z: base.z + side.z,
        sx: Math.max(cell * 0.13, 0.025),
        sy: 0.065,
        sz: Math.max(cell * 0.08, 0.018),
        ry: angle,
        color: 0x7f959d
      });
      used += 1;
    }
    return used + 1;
  }
  if (type === "substation") {
    for (const offset of [-0.18, 0.18]) {
      const side = rotatedOffset(angle, offset * cell, 0);
      buckets.substationFrames.push({
        x: base.x + side.x,
        y: base.y + 0.062,
        z: base.z + side.z,
        sx: Math.max(cell * 0.1, 0.026),
        sy: 0.095,
        sz: Math.max(cell * 0.035, 0.012),
        ry: angle + Math.PI * 0.5,
        color: 0xa6aaa7
      });
      used += 1;
    }
    return used;
  }
  if (type === "greenhouse") {
    for (const offset of [-0.2, 0, 0.2]) {
      const side = rotatedOffset(angle, offset * cell, 0);
      buckets.greenhouseRidges.push({
        x: base.x + side.x,
        y: base.y + 0.064,
        z: base.z + side.z,
        sx: Math.max(cell * 0.09, 0.024),
        sy: 0.026,
        sz: cell * 0.66,
        ry: angle + Math.PI * 0.5,
        color: 0xc7f1e4
      });
      used += 1;
    }
    return used;
  }
  if (type === "market") {
    for (const [offset, color] of [[-0.18, 0xd77b4f], [0.18, 0xe1b766]]) {
      const side = rotatedOffset(angle, offset * cell, cell * 0.22);
      buckets.marketAwnings.push({
        x: base.x + side.x,
        y: base.y + 0.07,
        z: base.z + side.z,
        sx: cell * 0.32,
        sy: 0.022,
        sz: Math.max(cell * 0.12, 0.026),
        ry: angle,
        color
      });
      used += 1;
    }
    return used;
  }
  if (type === "hospital") {
    const roofOffset = rotatedOffset(angle, -cell * 0.16, cell * 0.12);
    buckets.hospitalHelipads.push({
      x: base.x + roofOffset.x,
      y: roofDetailY(38),
      z: base.z + roofOffset.z,
      sx: Math.max(cell * 0.22, 0.075),
      sy: 0.014,
      sz: Math.max(cell * 0.22, 0.075),
      ry: angle,
      color: 0xf1f3ee
    });
    pushServiceSign(0.26, -0.22, 0x79b6b1, 1.08);
    return used + 1;
  }
  if (type === "clinic") {
    const apron = rotatedOffset(angle, cell * 0.25, 0);
    buckets.clinicAmbulanceBays.push({
      x: base.x + apron.x,
      y: base.y + 0.018,
      z: base.z + apron.z,
      sx: Math.max(cell * 0.34, 0.085),
      sy: 0.012,
      sz: Math.max(cell * 0.16, 0.044),
      ry: angle,
      color: 0x7fb4ac
    });
    buckets.emergencyBays.push({
      x: base.x + apron.x + Math.cos(angle) * cell * 0.09,
      y: base.y + 0.028,
      z: base.z - Math.sin(angle) * cell * 0.09,
      sx: Math.max(cell * 0.16, 0.052),
      sy: 0.012,
      sz: Math.max(cell * 0.055, 0.02),
      ry: angle,
      color: 0xd75f5a
    });
    pushServiceSign(0.32, -0.2, 0xf1f3ee, 0.94);
    return used + 2;
  }
  if (type === "school") {
    const yard = rotatedOffset(angle, -cell * 0.18, cell * 0.2);
    buckets.schoolYards.push({
      x: base.x + yard.x,
      y: base.y + 0.017,
      z: base.z + yard.z,
      sx: Math.max(cell * 0.42, 0.11),
      sy: 0.012,
      sz: Math.max(cell * 0.28, 0.075),
      ry: angle,
      color: 0x5f9d67
    });
    pushServiceSign(0.26, -0.22, 0xe2b96f, 0.96);
    return used + 1;
  }
  if (type === "library") {
    const court = rotatedOffset(angle, -cell * 0.18, cell * 0.18);
    buckets.libraryCourtyards.push({
      x: base.x + court.x,
      y: base.y + 0.017,
      z: base.z + court.z,
      sx: Math.max(cell * 0.34, 0.09),
      sy: 0.012,
      sz: Math.max(cell * 0.24, 0.07),
      ry: angle,
      color: 0x6f9c72
    });
    pushServiceSign(0.28, -0.22, 0xd3c08d, 0.92);
    return used + 1;
  }
  if (type === "community_center") {
    const plaza = rotatedOffset(angle, cell * 0.22, 0);
    buckets.communityPlazas.push({
      x: base.x + plaza.x,
      y: base.y + 0.017,
      z: base.z + plaza.z,
      sx: Math.max(cell * 0.38, 0.1),
      sy: 0.012,
      sz: Math.max(cell * 0.28, 0.08),
      ry: angle,
      color: 0xb99667
    });
    pushServiceSign(0.3, -0.18, 0xf0cf82, 0.94);
    return used + 1;
  }
  if (type === "fire_station") {
    for (const offset of [-0.12, 0.12]) {
      const bay = rotatedOffset(angle, cell * 0.25, offset * cell);
      buckets.emergencyBays.push({
        x: base.x + bay.x,
        y: base.y + 0.018,
        z: base.z + bay.z,
        sx: Math.max(cell * 0.26, 0.07),
        sy: 0.012,
        sz: Math.max(cell * 0.09, 0.028),
        ry: angle,
        color: 0xc85f52
      });
      used += 1;
    }
    pushServiceSign(0.33, 0, 0xf0cf82, 0.92);
    return used;
  }
  if (type === "police_station") {
    const forecourt = rotatedOffset(angle, cell * 0.24, 0);
    buckets.securityForecourts.push({
      x: base.x + forecourt.x,
      y: base.y + 0.017,
      z: base.z + forecourt.z,
      sx: Math.max(cell * 0.34, 0.085),
      sy: 0.012,
      sz: Math.max(cell * 0.22, 0.062),
      ry: angle,
      color: 0x6e8494
    });
    pushServiceSign(0.32, -0.14, 0xaec4d2, 0.92);
    return used + 1;
  }
  if (type === "hotel") {
    buckets.hotelPodiums.push({
      x: base.x,
      y: base.y + Math.max(cell * 0.036, 0.035),
      z: base.z,
      sx: Math.max(cell * 0.34, 0.095),
      sy: Math.max(cell * 0.07, 0.045),
      sz: Math.max(cell * 0.24, 0.075),
      ry: angle,
      color: 0xb99367
    });
    pushServiceSign(0.3, -0.2, 0xf1cb84, 1.04);
    return used + 1;
  }
  if (type === "office_tower") {
    for (const offset of [-0.12, 0.12]) {
      const deck = rotatedOffset(angle, offset * cell, -cell * 0.08);
      buckets.officeMechanicalDecks.push({
        x: base.x + deck.x,
        y: roofDetailY(138),
        z: base.z + deck.z,
        sx: Math.max(cell * 0.12, 0.04),
        sy: 0.026,
        sz: Math.max(cell * 0.08, 0.028),
        ry: angle + Math.PI * 0.5,
        color: 0x83939a
      });
      used += 1;
    }
    pushServiceSign(0.27, -0.22, 0x9ed0dc, 1);
    return used;
  }
  if (type === "water_tower") {
    const towerHeight = visualBuildingHeight(Math.max(landmarkHeightM || 0, 55), scaledVertical);
    const tankRadius = Math.max(cell * 0.16, 0.045);
    buckets.waterTowerTanks.push({
      x: base.x,
      y: base.y + towerHeight * 0.88,
      z: base.z,
      sx: tankRadius,
      sy: Math.max(cell * 0.12, 0.06),
      sz: tankRadius,
      ry: angle,
      color: 0xb8c8cc
    });
    for (const [ox, oz] of [[-0.08, -0.08], [0.08, -0.08], [-0.08, 0.08], [0.08, 0.08]]) {
      const leg = rotatedOffset(angle, ox * cell, oz * cell);
      buckets.waterTowerLegs.push({
        x: base.x + leg.x,
        y: base.y + towerHeight * 0.42,
        z: base.z + leg.z,
        sx: Math.max(cell * 0.014, 0.008),
        sy: towerHeight * 0.84,
        sz: Math.max(cell * 0.014, 0.008),
        ry: angle,
        color: 0x8c989c
      });
      used += 1;
    }
    buckets.slabs.push({
      x: base.x,
      y: base.y + 0.012,
      z: base.z,
      sx: Math.max(cell * 0.28, 0.075),
      sy: 0.014,
      sz: Math.max(cell * 0.28, 0.075),
      ry: angle,
      color: 0x7e8b8e
    });
    pushServiceSign(0.24, -0.2, 0xb8c8cc, 0.88);
    return used + 2;
  }
  if (type === "observatory") {
    const domeRadius = Math.max(cell * 0.17, 0.046);
    const domeHeight = Math.max(cell * 0.115, 0.05);
    const roofY = roofDetailY(16);
    buckets.slabs.push({
      x: base.x,
      y: base.y + 0.012,
      z: base.z,
      sx: Math.max(cell * 0.42, 0.105),
      sy: 0.016,
      sz: Math.max(cell * 0.36, 0.095),
      ry: angle,
      color: 0x8d9ba0
    });
    buckets.observatoryDomes.push({
      x: base.x,
      y: roofY + domeHeight * 0.42,
      z: base.z,
      sx: domeRadius,
      sy: domeHeight,
      sz: domeRadius,
      ry: angle,
      color: 0xc8d3d2
    });
    buckets.observatoryTelescopeMounts.push({
      x: base.x,
      y: roofY + domeHeight * 0.12,
      z: base.z,
      sx: Math.max(cell * 0.035, 0.014),
      sy: Math.max(cell * 0.07, 0.032),
      sz: Math.max(cell * 0.035, 0.014),
      ry: angle,
      color: 0xe1e6e3
    });
    const barrel = rotatedOffset(angle, cell * 0.11, 0);
    buckets.observatoryTelescopeMounts.push({
      x: base.x + barrel.x,
      y: roofY + domeHeight * 0.26,
      z: base.z + barrel.z,
      sx: Math.max(cell * 0.18, 0.052),
      sy: Math.max(cell * 0.022, 0.012),
      sz: Math.max(cell * 0.035, 0.014),
      ry: angle,
      color: 0xd9dfdd
    });
    pushServiceSign(0.26, -0.2, 0xc8d3d2, 0.9);
    return used + 4;
  }
  if (type === "cable_car_station") {
    buckets.cableCarPlatforms.push({
      x: base.x,
      y: base.y + 0.028,
      z: base.z,
      sx: Math.max(cell * 0.56, 0.13),
      sy: 0.026,
      sz: Math.max(cell * 0.24, 0.07),
      ry: angle,
      color: 0xb8b7a4
    });
    for (const offset of [-0.34, 0.34]) {
      const tower = rotatedOffset(angle, offset * cell, 0);
      const towerHeight = Math.max(cell * 0.23, 0.1);
      buckets.cableCarTowers.push({
        x: base.x + tower.x,
        y: base.y + towerHeight / 2,
        z: base.z + tower.z,
        sx: Math.max(cell * 0.035, 0.014),
        sy: towerHeight,
        sz: Math.max(cell * 0.035, 0.014),
        ry: angle,
        color: 0x8f9284
      });
      used += 1;
    }
    for (const sideOffset of [-0.035, 0.035]) {
      const side = rotatedOffset(angle, 0, sideOffset * cell);
      buckets.cableCarCables.push({
        x: base.x + side.x,
        y: base.y + Math.max(cell * 0.23, 0.11),
        z: base.z + side.z,
        sx: Math.max(cell * 0.82, 0.2),
        sy: Math.max(cell * 0.01, 0.006),
        sz: Math.max(cell * 0.01, 0.006),
        ry: angle,
        color: 0x2f3434
      });
      used += 1;
    }
    const car = rotatedOffset(angle, cell * 0.13, 0);
    buckets.cableCarPlatforms.push({
      x: base.x + car.x,
      y: base.y + Math.max(cell * 0.18, 0.085),
      z: base.z + car.z,
      sx: Math.max(cell * 0.11, 0.035),
      sy: Math.max(cell * 0.075, 0.03),
      sz: Math.max(cell * 0.08, 0.026),
      ry: angle,
      color: 0xd0c58b
    });
    pushServiceSign(0.28, -0.22, 0xd0c58b, 0.88);
    return used + 3;
  }
  if (type === "flood_pump_station") {
    buckets.slabs.push({
      x: base.x,
      y: base.y + 0.012,
      z: base.z,
      sx: Math.max(cell * 0.5, 0.13),
      sy: 0.018,
      sz: Math.max(cell * 0.38, 0.1),
      ry: angle,
      color: 0x69797d
    });
    for (const offset of [-0.18, 0, 0.18]) {
      const gate = rotatedOffset(angle, -cell * 0.3, offset * cell);
      buckets.floodPumpIntakes.push({
        x: base.x + gate.x,
        y: base.y + Math.max(cell * 0.055, 0.035),
        z: base.z + gate.z,
        sx: Math.max(cell * 0.065, 0.022),
        sy: Math.max(cell * 0.105, 0.052),
        sz: Math.max(cell * 0.055, 0.018),
        ry: angle + Math.PI * 0.5,
        color: 0x7897a0
      });
      used += 1;
    }
    buckets.floodPumpOutfalls.push({
      x: base.x + rotatedOffset(angle, cell * 0.22, 0).x,
      y: base.y + 0.025,
      z: base.z + rotatedOffset(angle, cell * 0.22, 0).z,
      sx: Math.max(cell * 0.42, 0.11),
      sy: 0.014,
      sz: Math.max(cell * 0.12, 0.038),
      ry: angle,
      color: 0x4f9bb2
    });
    pushServiceSign(0.3, -0.2, 0x91bdc3, 0.88);
    return used + 2;
  }
  if (type === "desalination_plant") {
    buckets.slabs.push({
      x: base.x,
      y: base.y + 0.012,
      z: base.z,
      sx: Math.max(cell * 0.72, 0.18),
      sy: 0.018,
      sz: Math.max(cell * 0.5, 0.13),
      ry: angle,
      color: 0x6d7c80
    });
    for (const offset of [-0.2, 0.08, 0.28]) {
      const tank = rotatedOffset(angle, offset * cell, -cell * 0.13);
      buckets.desalinationTanks.push({
        x: base.x + tank.x,
        y: base.y + Math.max(cell * 0.085, 0.045),
        z: base.z + tank.z,
        sx: Math.max(cell * 0.11, 0.034),
        sy: Math.max(cell * 0.17, 0.085),
        sz: Math.max(cell * 0.11, 0.034),
        ry: angle,
        color: 0x9db8bd
      });
      used += 1;
    }
    for (const sideOffset of [-0.18, 0.18]) {
      const gallery = rotatedOffset(angle, 0, sideOffset * cell);
      buckets.desalinationIntakeGalleries.push({
        x: base.x + gallery.x,
        y: base.y + 0.022,
        z: base.z + gallery.z,
        sx: Math.max(cell * 0.82, 0.2),
        sy: 0.014,
        sz: Math.max(cell * 0.055, 0.018),
        ry: angle,
        color: 0x5ba7bb
      });
      used += 1;
    }
    pushServiceSign(0.32, -0.22, 0x9db8bd, 0.92);
    return used + 2;
  }
  if (type === "visitor_center") {
    const plaza = rotatedOffset(angle, cell * 0.22, 0);
    buckets.visitorCenterPlazas.push({
      x: base.x + plaza.x,
      y: base.y + 0.017,
      z: base.z + plaza.z,
      sx: Math.max(cell * 0.46, 0.11),
      sy: 0.012,
      sz: Math.max(cell * 0.3, 0.08),
      ry: angle,
      color: 0xc4ad78
    });
    buckets.trailheadTrailStrips.push({
      x: base.x - Math.cos(angle) * cell * 0.22,
      y: base.y + 0.021,
      z: base.z + Math.sin(angle) * cell * 0.22,
      sx: Math.max(cell * 0.38, 0.095),
      sy: 0.01,
      sz: Math.max(cell * 0.075, 0.024),
      ry: angle,
      color: 0x7a6b4d
    });
    pushServiceSign(0.32, -0.22, 0xf0cf82, 1);
    return used + 2;
  }
  if (type === "scenic_overlook") {
    buckets.scenicOverlookDecks.push({
      x: base.x,
      y: base.y + Math.max(cell * 0.035, 0.024),
      z: base.z,
      sx: Math.max(cell * 0.36, 0.085),
      sy: Math.max(cell * 0.03, 0.018),
      sz: Math.max(cell * 0.28, 0.07),
      ry: angle,
      color: 0xb8aa82
    });
    for (const sideOffset of [-0.16, 0.16]) {
      const rail = rotatedOffset(angle, 0, sideOffset * cell);
      buckets.scenicOverlookRails.push({
        x: base.x + rail.x,
        y: base.y + Math.max(cell * 0.082, 0.045),
        z: base.z + rail.z,
        sx: Math.max(cell * 0.34, 0.08),
        sy: Math.max(cell * 0.045, 0.026),
        sz: Math.max(cell * 0.018, 0.008),
        ry: angle,
        color: 0xd6d1b5
      });
      used += 1;
    }
    pushServiceSign(0.2, -0.2, 0xd6d1b5, 0.78);
    return used + 1;
  }
  if (type === "trailhead") {
    const kiosk = rotatedOffset(angle, -cell * 0.14, -cell * 0.08);
    buckets.trailheadKiosks.push({
      x: base.x + kiosk.x,
      y: base.y + Math.max(cell * 0.07, 0.04),
      z: base.z + kiosk.z,
      sx: Math.max(cell * 0.13, 0.038),
      sy: Math.max(cell * 0.12, 0.065),
      sz: Math.max(cell * 0.08, 0.028),
      ry: angle,
      color: 0xa9976c
    });
    for (const offset of [-0.18, 0.18]) {
      const trail = rotatedOffset(angle, offset * cell, cell * 0.16);
      buckets.trailheadTrailStrips.push({
        x: base.x + trail.x,
        y: base.y + 0.018,
        z: base.z + trail.z,
        sx: Math.max(cell * 0.34, 0.085),
        sy: 0.01,
        sz: Math.max(cell * 0.055, 0.018),
        ry: angle + offset * 0.45,
        color: 0x7a6b4d
      });
      used += 1;
    }
    pushServiceSign(0.22, -0.22, 0xf0cf82, 0.82);
    return used + 1;
  }
  if (type === "ranger_station") {
    const yard = rotatedOffset(angle, cell * 0.2, 0);
    buckets.rangerYards.push({
      x: base.x + yard.x,
      y: base.y + 0.017,
      z: base.z + yard.z,
      sx: Math.max(cell * 0.32, 0.085),
      sy: 0.012,
      sz: Math.max(cell * 0.22, 0.06),
      ry: angle,
      color: 0x789a68
    });
    const tower = rotatedOffset(angle, -cell * 0.22, cell * 0.16);
    buckets.rangerWatchTowers.push({
      x: base.x + tower.x,
      y: base.y + Math.max(cell * 0.13, 0.08),
      z: base.z + tower.z,
      sx: Math.max(cell * 0.055, 0.02),
      sy: Math.max(cell * 0.22, 0.12),
      sz: Math.max(cell * 0.055, 0.02),
      ry: angle,
      color: 0x7d8f5f
    });
    buckets.rangerWatchTowers.push({
      x: base.x + tower.x,
      y: base.y + Math.max(cell * 0.25, 0.14),
      z: base.z + tower.z,
      sx: Math.max(cell * 0.14, 0.042),
      sy: Math.max(cell * 0.035, 0.02),
      sz: Math.max(cell * 0.14, 0.042),
      ry: angle + Math.PI * 0.25,
      color: 0x9dae8e
    });
    pushServiceSign(0.3, -0.2, 0xc7d5a6, 0.9);
    return used + 3;
  }
  if (type === "gauging_station") {
    const staff = rotatedOffset(angle, -cell * 0.12, 0);
    buckets.gaugingStaffPlates.push({
      x: base.x + staff.x,
      y: base.y + 0.02,
      z: base.z + staff.z,
      sx: Math.max(cell * 0.28, 0.075),
      sy: 0.012,
      sz: Math.max(cell * 0.08, 0.024),
      ry: angle + Math.PI * 0.5,
      color: 0x5ba7bb
    });
    for (const offset of [-0.08, 0.08]) {
      const mast = rotatedOffset(angle, cell * 0.12, offset * cell);
      buckets.gaugingSensorMasts.push({
        x: base.x + mast.x,
        y: base.y + Math.max(cell * 0.11, 0.07),
        z: base.z + mast.z,
        sx: Math.max(cell * 0.012, 0.007),
        sy: Math.max(cell * 0.2, 0.11),
        sz: Math.max(cell * 0.012, 0.007),
        ry: angle,
        color: 0xcbd7d7
      });
      used += 1;
    }
    pushServiceSign(0.2, -0.18, 0x9abdc4, 0.72);
    return used + 1;
  }
  if (type === "wastewater") {
    buckets.tanks.push({
      x: base.x,
      y: base.y + Math.max(cell * 0.08, 0.04),
      z: base.z,
      sx: Math.max(cell * 0.18, 0.04),
      sy: Math.max(cell * 0.16, 0.08),
      sz: Math.max(cell * 0.18, 0.04),
      ry: angle,
      color: 0x9fa8a5
    });
    return 1;
  }
  if (type === "stadium") {
    buckets.stadiums.push({
      x: base.x,
      y: base.y + Math.max(cell * 0.05, 0.03),
      z: base.z,
      sx: Math.max(cell * 0.34, 0.08),
      sy: Math.max(cell * 0.1, 0.04),
      sz: Math.max(cell * 0.24, 0.06),
      ry: angle,
      color: 0xaaa79b
    });
    buckets.stadiumFields.push({
      x: base.x,
      y: base.y + Math.max(cell * 0.052, 0.034),
      z: base.z,
      sx: Math.max(cell * 0.34, 0.08),
      sy: 0.012,
      sz: Math.max(cell * 0.2, 0.05),
      ry: angle,
      color: 0x4f9b5a
    });
    return 2;
  }
  if (type === "powerplant") {
    buckets.tanks.push({
      x: base.x - Math.cos(angle) * cell * 0.16,
      y: base.y + Math.max(cell * 0.1, 0.05),
      z: base.z + Math.sin(angle) * cell * 0.16,
      sx: Math.max(cell * 0.12, 0.04),
      sy: Math.max(cell * 0.2, 0.1),
      sz: Math.max(cell * 0.12, 0.04),
      ry: angle,
      color: 0xa0a19b
    });
    const stackHeight = visualBuildingHeight(Math.max(landmarkHeightM, heightM * 1.6, 70), 1);
    const stackPlan = towerPlanWidth(stackHeight, cell, 0.06, 5.8);
    buckets.landmarkTowers.push({
      x: base.x + Math.cos(angle) * cell * 0.18,
      y: base.y + stackHeight / 2,
      z: base.z - Math.sin(angle) * cell * 0.18,
      sx: stackPlan,
      sy: stackHeight,
      sz: stackPlan,
      ry: angle,
      color: 0xbbb9ae
    });
    return 2;
  }
  if (type === "park" && impervious < 0.2) {
    buckets.slabs.push({
      x: base.x,
      y: base.y + 0.008,
      z: base.z,
      sx: cell * 0.8,
      sy: 0.01,
      sz: cell * 0.8,
      ry: angle,
      color: 0x4f8f58
    });
    return 1;
  }
  if (type === "quarry") {
    buckets.slabs.push({
      x: base.x,
      y: base.y + 0.006,
      z: base.z,
      sx: cell * 0.8,
      sy: 0.012,
      sz: cell * 0.7,
      ry: angle,
      color: 0x8a7860
    });
    for (const offset of [-0.22, 0, 0.22]) {
      const side = rotatedOffset(angle, 0, offset * cell);
      buckets.quarryBenches.push({
        x: base.x + side.x,
        y: base.y + 0.032 + Math.abs(offset) * 0.03,
        z: base.z + side.z,
        sx: cell * 0.62,
        sy: 0.018,
        sz: Math.max(cell * 0.04, 0.014),
        ry: angle,
        color: 0x9a7c58
      });
      used += 1;
    }
    return used + 1;
  }
  if (type === "farmstead" || type === "terrace_farm") {
    const rowCount = type === "terrace_farm" ? 4 : 3;
    for (let row = 0; row < rowCount; row += 1) {
      const offset = ((row + 0.5) / rowCount - 0.5) * cell * 0.72;
      const side = rotatedOffset(angle, 0, offset);
      const target = type === "terrace_farm" ? buckets.terraceWalls : buckets.farmRows;
      target.push({
        x: base.x + side.x,
        y: base.y + 0.018 + row * 0.003,
        z: base.z + side.z,
        sx: cell * 0.72,
        sy: type === "terrace_farm" ? 0.02 : 0.012,
        sz: Math.max(cell * 0.035, 0.012),
        ry: angle,
        color: type === "terrace_farm" ? 0x8b7a60 : 0xa6a758
      });
      used += 1;
    }
    return used;
  }
  if (LINEAR_INFRA_TYPES.has(type)) return 0;
  return 0;
}

function infrastructureAdaptationVisualState(model, index, influence, params = {}) {
  const hazards = model?.hazards || {};
  const windFromDeg = Number(model?.windDirection?.[index] ?? params.windDirection);
  const aspectDeg = Number(model?.aspect?.[index]);
  return {
    flood: clamp01(hazards.currentFloodHazard?.[index] ?? hazards.floodHazard?.[index] ?? 0),
    drought: clamp01(hazards.currentDroughtStress?.[index] ?? hazards.droughtStress?.[index] ?? 0),
    wildfire: clamp01(hazards.currentWildfireRisk?.[index] ?? hazards.wildfireRisk?.[index] ?? 0),
    landslide: clamp01(hazards.currentLandslideRisk?.[index] ?? hazards.landslideRisk?.[index] ?? 0),
    composite: clamp01(hazards.currentHazardIndex?.[index] ?? hazards.hazardIndex?.[index] ?? 0),
    foundationRisk: buildingFoundationRisk(model, index),
    wetness: Number(model?.wetnessIndex?.[index]) || 0,
    slope: Number(model?.slope?.[index]) || 0,
    runoff: Number(model?.runoffCoefficient?.[index]) || 0,
    windSpeed: Number(model?.windSpeed?.[index] ?? params.windSpeed) || 0,
    windExposure: clamp01(model?.windExposure?.[index] ?? 0),
    adaptationNeed: clamp01(influence?.adaptationNeed?.[index] ?? 0),
    suitability: clamp01(influence?.suitabilityScore?.[index] ?? 0),
    windToAngle: Number.isFinite(windFromDeg) ? ((windFromDeg + 180) * Math.PI) / 180 : null,
    slopeAspectAngle: Number.isFinite(aspectDeg) ? (aspectDeg * Math.PI) / 180 : null
  };
}

function pushFacilityAdaptationDetails(buckets, input) {
  const { type, base, cell, angle, adaptationNeed = 0, suitability = 0, environment = {} } = input;
  let used = 0;
  const need = Math.max(clamp01(adaptationNeed), clamp01(environment.adaptationNeed));
  const fit = Math.max(clamp01(suitability), clamp01(environment.suitability));
  const inverseFit = 1 - fit;
  const flood = clamp01(environment.flood);
  const drought = clamp01(environment.drought);
  const wildfire = clamp01(environment.wildfire);
  const landslide = clamp01(environment.landslide);
  const foundationRisk = clamp01(environment.foundationRisk);
  const wetnessNorm = Math.min(1, Math.max(0, (Number(environment.wetness) || 0) / 14));
  const runoff = Math.min(1, Math.max(0, Number(environment.runoff) || 0));
  const slopeDeg = Math.max(0, Number(environment.slope) || 0);
  const slopeNorm = Math.min(1, slopeDeg / 28);
  const windSpeed = Math.max(0, Number(environment.windSpeed) || 0);
  const windExposure = clamp01(environment.windExposure);
  const stress = Math.max(need, inverseFit * 0.72, flood * 0.85, wetnessNorm * 0.64, foundationRisk, landslide * 0.86, wildfire * 0.72);
  const scale = 0.78 + stress * 0.48;
  const hydraulicFacility = type === "reservoir" || type === "canal" || type === "dam" || type === "levee";

  if (!hydraulicFacility && (flood > 0.14 || wetnessNorm > 0.48 || need > 0.22 || foundationRisk > 0.22)) {
    buckets.adaptiveFoundationPlinths.push({
      x: base.x,
      y: base.y + Math.max(0.009, cell * 0.015),
      z: base.z,
      sx: Math.max(cell * 0.34, cell * 0.44 * scale),
      sy: Math.max(0.014, cell * (0.022 + flood * 0.028 + need * 0.012)),
      sz: Math.max(cell * 0.28, cell * 0.36 * scale),
      ry: angle,
      color: flood > 0.24 || wetnessNorm > 0.66 ? 0x9eb2a4 : 0xa99d86
    });
    used += 1;
  }

  if (slopeDeg > 1.4 || landslide > 0.05 || foundationRisk > 0.12 || need > 0.18) {
    const wallAngle = Number.isFinite(environment.slopeAspectAngle) ? environment.slopeAspectAngle + Math.PI * 0.5 : angle + Math.PI * 0.5;
    const wallOffset = rotatedOffset(wallAngle, 0, -cell * (0.24 + foundationRisk * 0.08));
    buckets.adaptiveSlopeRetainingWalls.push({
      x: base.x + wallOffset.x,
      y: base.y + Math.max(0.028, cell * (0.05 + slopeNorm * 0.09 + foundationRisk * 0.05)),
      z: base.z + wallOffset.z,
      sx: Math.max(cell * 0.36, cell * (0.46 + slopeNorm * 0.16)),
      sy: Math.max(0.04, cell * (0.08 + slopeNorm * 0.11 + landslide * 0.06)),
      sz: Math.max(cell * 0.03, 0.012),
      ry: wallAngle,
      color: landslide > 0.22 || foundationRisk > 0.34 ? 0x92705a : 0x8b7a65
    });
    used += 1;
  }

  if (flood > 0.12 || wetnessNorm > 0.43 || runoff > 0.36) {
    const swaleOffset = rotatedOffset(angle, 0, cell * 0.31);
    buckets.adaptiveDrainageSwales.push({
      x: base.x + swaleOffset.x,
      y: base.y + 0.012,
      z: base.z + swaleOffset.z,
      sx: Math.max(cell * 0.42, cell * (0.54 + runoff * 0.18)),
      sy: 0.007,
      sz: Math.max(cell * 0.028, 0.012),
      ry: angle,
      color: flood > 0.22 ? 0x5f9fb0 : 0x6fa383
    });
    used += 1;
  }

  if (windSpeed > 8.5 || windExposure > 0.28) {
    const windAngle = Number.isFinite(environment.windToAngle) ? environment.windToAngle + Math.PI * 0.5 : angle + Math.PI * 0.5;
    const upwind = rotatedOffset(Number.isFinite(environment.windToAngle) ? environment.windToAngle : angle, -cell * 0.32, 0);
    buckets.adaptiveWindbreakScreens.push({
      x: base.x + upwind.x,
      y: base.y + Math.max(0.045, cell * (0.07 + Math.min(1, windSpeed / 28) * 0.1)),
      z: base.z + upwind.z,
      sx: Math.max(cell * 0.28, cell * (0.36 + windExposure * 0.24)),
      sy: Math.max(0.055, cell * (0.12 + Math.min(1, windSpeed / 32) * 0.12)),
      sz: Math.max(cell * 0.018, 0.008),
      ry: windAngle,
      color: windSpeed > 15 ? 0x8fa9aa : 0x9eb2ae
    });
    used += 1;
  }

  if (wildfire > 0.015 || drought > 0.08 || need > 0.34) {
    const fireOffset = rotatedOffset(angle, -cell * 0.3, 0);
    buckets.adaptiveFirebreakStrips.push({
      x: base.x + fireOffset.x,
      y: base.y + 0.011,
      z: base.z + fireOffset.z,
      sx: Math.max(cell * 0.42, cell * (0.52 + wildfire * 0.18)),
      sy: 0.007,
      sz: Math.max(cell * 0.038, 0.014),
      ry: angle,
      color: wildfire > 0.16 ? 0xc3a66a : 0xb9a772
    });
    used += 1;
  }

  return used;
}

function isBuildingType(type, density, heightM, landmarkHeightM) {
  if (landmarkHeightM > 1) return true;
  if (density > 0.04 && heightM > 1) return true;
  return Object.prototype.hasOwnProperty.call(BUILDING_DEFAULTS, type) && !LINEAR_INFRA_TYPES.has(type);
}

function buildingInstancesFor(type, density, x, y, seed) {
  const typeBoost = type === "highrise" ? 4 : type === "apartment" || type === "commercial" ? 3 : type === "villa" ? 2 : 2;
  const base = Math.max(1, Math.ceil(density * typeBoost));
  return Math.min(5, base + (hash01(x, y, seed + 41) > 0.74 ? 1 : 0));
}

function buildingFootprint(type, density, cell, k, x, y, seed) {
  const defaults = BUILDING_DEFAULTS[type] || BUILDING_DEFAULTS.custom;
  const proportions = VISUAL_BUILDING_PROPORTIONS[type] || VISUAL_BUILDING_PROPORTIONS.custom;
  const base = defaults.footprint || 0.16;
  const variation = 0.82 + hash01(x + k * 5, y - k * 3, seed + 73) * 0.48;
  const typeScale = type === "industrial" || type === "logistics" ? 1.5 : type === "villa" ? 0.78 : 1;
  const gridScaled = cell * (base + density * 0.12) * variation * typeScale;
  const minimum = proportions.minFootprintKm ?? cell * 0.035;
  const maximum = Math.max(cell * 0.42, minimum * 1.85);
  return Math.max(minimum, Math.min(maximum, gridScaled));
}

function balanceBuildingPrism(type, width, depth, visualHeight, cell) {
  const proportions = VISUAL_BUILDING_PROPORTIONS[type] || VISUAL_BUILDING_PROPORTIONS.custom;
  let nextWidth = Math.max(width, proportions.minFootprintKm ?? cell * 0.035);
  let nextDepth = Math.max(depth, proportions.minDepthKm ?? nextWidth * 0.78);
  const maxAspect = proportions.maxAspect ?? 4.5;
  const requiredPlan = visualHeight / Math.max(1.2, maxAspect);
  if (Math.min(nextWidth, nextDepth) < requiredPlan) {
    nextWidth = Math.max(nextWidth, requiredPlan);
    nextDepth = Math.max(nextDepth, requiredPlan);
  }
  return {
    width: nextWidth,
    depth: nextDepth,
    slenderness: visualHeight / Math.max(0.001, Math.min(nextWidth, nextDepth))
  };
}

function visualBuildingHeight(heightM, verticalScale) {
  const scaled = (Math.max(0, heightM) / 1000) * Math.max(0.1, verticalScale) * BUILDING_HEIGHT_VISUAL_SCALE;
  return Math.max(0.003, scaled);
}

function towerPlanWidth(visualHeight, cell, minPlan = 0.045, maxAspect = 7) {
  return Math.max(cell * 0.035, minPlan, visualHeight / Math.max(1.2, maxAspect));
}

function terrainTileKey(model) {
  return `${model.n}:${roundDiagnostic(modelSizeKm(model))}:${TERRAIN_TILE_SEGMENTS}`;
}

function buildTerrainTiles(renderer, model) {
  disposeTerrainTiles(renderer);
  if (!renderer.terrainTileGroup) {
    renderer.terrainTileGroup = new THREE.Group();
    renderer.terrainTileGroup.name = "terrain tile surface";
  }
  if (!renderer.terrainTileGroup.parent) renderer.scene.add(renderer.terrainTileGroup);

  const sizeKm = modelSizeKm(model);
  renderer.terrainTiles = createTerrainTileLayout(model, TERRAIN_TILE_SEGMENTS).map((tile) => {
    const widthKm = ((tile.x1 - tile.x0) / Math.max(1, model.n - 1)) * sizeKm;
    const depthKm = ((tile.y1 - tile.y0) / Math.max(1, model.n - 1)) * sizeKm;
    const geometry = new THREE.PlaneGeometry(widthKm, depthKm, tile.segX, tile.segY);
    geometry.rotateX(-Math.PI / 2);
    geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array((tile.segX + 1) * (tile.segY + 1) * 3), 3));
    geometry.setAttribute("terrainSurface", new THREE.BufferAttribute(new Uint8Array((tile.segX + 1) * (tile.segY + 1) * 4), 4, true));
    const material = createTerrainSurfaceMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    const centerX = (((tile.x0 + tile.x1) / 2) / Math.max(1, model.n - 1) - 0.5) * sizeKm;
    const centerZ = (((tile.y0 + tile.y1) / 2) / Math.max(1, model.n - 1) - 0.5) * sizeKm;
    mesh.position.set(centerX, 0, centerZ);
    mesh.name = `terrain tile ${tile.x0}:${tile.y0}`;
    mesh.userData.tileBounds = { x0: tile.x0, y0: tile.y0, x1: tile.x1, y1: tile.y1 };
    renderer.terrainTileGroup.add(mesh);
    return { ...tile, mesh };
  });
  renderer.terrain = renderer.terrainTileGroup;
  renderer.terrainTileKey = terrainTileKey(model);
}

function createTerrainTileLayout(model, tileSegments) {
  const n = Math.max(2, Math.round(Number(model?.n) || 2));
  const maxSegment = n - 1;
  const segmentSize = Math.max(1, Math.min(maxSegment, Math.round(Number(tileSegments) || maxSegment)));
  const tiles = [];
  for (let y0 = 0; y0 < maxSegment; y0 += segmentSize) {
    const y1 = Math.min(maxSegment, y0 + segmentSize);
    for (let x0 = 0; x0 < maxSegment; x0 += segmentSize) {
      const x1 = Math.min(maxSegment, x0 + segmentSize);
      tiles.push({
        x0,
        y0,
        x1,
        y1,
        segX: x1 - x0,
        segY: y1 - y0
      });
    }
  }
  return tiles;
}

function selectTerrainTilesForRange(tiles, range) {
  if (!Array.isArray(tiles) || !tiles.length) return [];
  if (!range) return tiles;
  return tiles.filter((tile) => tile.x0 <= range.x1 && tile.x1 >= range.x0 && tile.y0 <= range.y1 && tile.y1 >= range.y0);
}

function updateTerrainTileMesh(tile, model, params, viewMode, options = {}) {
  const updateHeights = options.updateHeights !== false;
  const updateColors = options.updateColors !== false;
  const geometry = tile.mesh.geometry;
  const positions = geometry.getAttribute("position");
  const colors = geometry.getAttribute("color");
  const normals = geometry.getAttribute("normal");
  const surfaces = geometry.getAttribute("terrainSurface");
  const n = model.n;
  const verticalScale = Number(params?.verticalScale) || 1;
  const natural = viewMode === "landscape";
  const linearColor = new THREE.Color();
  updateTerrainSurfaceMaterial(tile.mesh.material, params, viewMode);
  let vertex = 0;
  for (let ly = 0; ly <= tile.segY; ly += 1) {
    const gy = tile.y0 + ly;
    for (let lx = 0; lx <= tile.segX; lx += 1) {
      const gx = tile.x0 + lx;
      const modelIndex = gy * n + gx;
      if (updateHeights) {
        positions.setY(vertex, (model.height[modelIndex] / 1000) * verticalScale);
        const [nx, ny, nz] = terrainVertexNormal(model, gx, gy, verticalScale);
        normals.setXYZ(vertex, nx, ny, nz);
      }
      if (updateColors) {
        if (natural) {
          const weights = terrainSurfaceWeights(model, params, modelIndex);
          surfaces.setXYZW(vertex, ...weights);
          const [r, g, b] = naturalTerrainColor(model, params, modelIndex, weights);
          linearColor.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
          colors.setXYZ(vertex, linearColor.r, linearColor.g, linearColor.b);
        } else {
          const [r, g, b] = colorForValue(model, params, viewMode, modelIndex);
          colors.setXYZ(vertex, r / 255, g / 255, b / 255);
        }
      }
      vertex += 1;
    }
  }
  if (updateHeights) {
    positions.clearUpdateRanges?.();
    positions.addUpdateRange?.(0, positions.count * 3);
    positions.needsUpdate = true;
    normals.needsUpdate = true;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }
  if (updateColors) {
    colors.clearUpdateRanges?.();
    colors.addUpdateRange?.(0, colors.count * 3);
    colors.needsUpdate = true;
    if (natural) surfaces.needsUpdate = true;
  }
}

function terrainSurfaceYAtLocalKm(model, params, xKm, yKm) {
  const sizeKm = modelSizeKm(model);
  const n = Math.max(2, model?.n || 2);
  const gx = THREE.MathUtils.clamp(Math.round((xKm / Math.max(0.0001, sizeKm)) * (n - 1)), 0, n - 1);
  const gy = THREE.MathUtils.clamp(Math.round((yKm / Math.max(0.0001, sizeKm)) * (n - 1)), 0, n - 1);
  const heightM = Number(model?.height?.[gy * n + gx]) || 0;
  return (heightM / 1000) * Math.max(0.1, Number(params?.verticalScale) || 1);
}

function terrainTileStats(tiles, touchedTiles, model, dirtyRange) {
  const tileVertices = (tile) => (tile.segX + 1) * (tile.segY + 1);
  const totalTileVertices = tiles.reduce((sum, tile) => sum + tileVertices(tile), 0);
  const touchedTileVertices = touchedTiles.reduce((sum, tile) => sum + tileVertices(tile), 0);
  const dirtyCellCount = dirtyRange?.cellCount ?? model.n * model.n;
  return {
    mode: dirtyRange ? "dirty-tiles" : "full-tiles",
    n: model.n,
    tileSegments: TERRAIN_TILE_SEGMENTS,
    tileCount: tiles.length,
    touchedTileCount: touchedTiles.length,
    totalTileVertices,
    touchedTileVertices,
    dirtyCellCount,
    uploadAmplification: roundDiagnostic(touchedTileVertices / Math.max(1, dirtyCellCount))
  };
}

function disposeTerrainTiles(renderer) {
  if (!renderer?.terrainTileGroup) return;
  disposeObjectTree(renderer.terrainTileGroup);
  renderer.terrainTiles = [];
  renderer.terrain = renderer.terrainTileGroup;
  renderer.terrainTileKey = "";
}

function subsurfaceColumnIndexForRenderer(model, surfaceIndex) {
  const volume = model?.subsurface;
  if (!volume?.columnCellCount) return -1;
  if (volume.columnCellCount === model.n * model.n) return surfaceIndex;
  const x = surfaceIndex % model.n;
  const y = Math.floor(surfaceIndex / model.n);
  const gx = Math.min(volume.gridN - 1, Math.max(0, Math.round((x / Math.max(1, model.n - 1)) * (volume.gridN - 1))));
  const gy = Math.min(volume.gridN - 1, Math.max(0, Math.round((y / Math.max(1, model.n - 1)) * (volume.gridN - 1))));
  return gy * volume.gridN + gx;
}

function subsurfaceVoxelColor(volume, voxelIndex, columnIndex) {
  const lithology = volume.lithologyCode?.[voxelIndex] ?? 0;
  const saturation = volume.groundwaterSaturation?.[voxelIndex] ?? 0;
  const fracture = volume.fractureRisk?.[voxelIndex] ?? volume.columnFractureRisk?.[columnIndex] ?? 0;
  const aquifer = volume.columnAquiferPotential?.[columnIndex] ?? 0;
  const support = volume.voxelObservedSupport?.[voxelIndex] ?? 0;
  const engineeringRisk = volume.engineeringRisk?.[voxelIndex] ?? 0;
  const palette = {
    1: 0x9a7048,
    2: 0x897b5c,
    3: 0xb79b61,
    4: 0x777b79,
    5: 0x5f666b,
    6: 0x725f59
  };
  const base = new THREE.Color(palette[lithology] || 0x6f6760);
  if (saturation > 0.45 || aquifer > 0.45) base.lerp(new THREE.Color(0x4d9fbd), Math.min(0.52, saturation * 0.34 + aquifer * 0.24));
  if (fracture > 0.55) base.lerp(new THREE.Color(0xd49a64), Math.min(0.42, (fracture - 0.45) * 0.7));
  if (engineeringRisk > 0.58) base.lerp(new THREE.Color(0xdf6f56), Math.min(0.5, (engineeringRisk - 0.5) * 0.95));
  if (support > 0.55) base.lerp(new THREE.Color(0x8de3d6), Math.min(0.24, (support - 0.5) * 0.42));
  if (support < 0.12) base.lerp(new THREE.Color(0x48443f), 0.22);
  return base.getHex();
}

function subsurfacePorePressureSignal(porePressureKpa, verticalStressKpa) {
  const pressure = Math.max(0, Number(porePressureKpa) || 0);
  const stress = Math.max(1, Number(verticalStressKpa) || 1);
  return clamp01(pressure / Math.max(35, stress * 0.42));
}

function subsurfaceAquiferDiagnosticColor(saturation, aquifer) {
  const color = new THREE.Color(0x2f89a8);
  color.lerp(new THREE.Color(0x8ce7ef), Math.min(0.7, saturation * 0.42 + aquifer * 0.32));
  return color.getHex();
}

function subsurfacePressureDiagnosticColor(signal) {
  const color = new THREE.Color(0x456ec9);
  color.lerp(new THREE.Color(0x9be8ff), Math.min(0.82, clamp01(signal) * 0.78));
  return color.getHex();
}

function subsurfaceRiskDiagnosticColor(risk) {
  const color = new THREE.Color(0x9d5b48);
  color.lerp(new THREE.Color(0xffc46b), Math.min(0.68, clamp01(risk) * 0.58));
  color.lerp(new THREE.Color(0xdc4f57), Math.max(0, clamp01(risk) - 0.58) * 0.9);
  return color.getHex();
}

function terrainDirtyVertexRange(model, dirtyBounds) {
  if (!model || !dirtyBounds) return null;
  const n = model.n;
  const x0 = Math.max(0, Math.floor(Number(dirtyBounds.paddedX0 ?? dirtyBounds.x0 ?? 0)));
  const y0 = Math.max(0, Math.floor(Number(dirtyBounds.paddedY0 ?? dirtyBounds.y0 ?? 0)));
  const x1 = Math.min(n - 1, Math.ceil(Number(dirtyBounds.paddedX1 ?? dirtyBounds.x1 ?? n - 1)));
  const y1 = Math.min(n - 1, Math.ceil(Number(dirtyBounds.paddedY1 ?? dirtyBounds.y1 ?? n - 1)));
  if (x1 < x0 || y1 < y0) return null;
  return {
    x0,
    y0,
    x1,
    y1,
    cellCount: (x1 - x0 + 1) * (y1 - y0 + 1)
  };
}

function terrainRefreshStats(modelOrN, dirtyBounds = null, tileSize = 64) {
  const n = Math.max(1, Math.round(Number(modelOrN?.n ?? modelOrN) || 1));
  const range = terrainDirtyVertexRange({ n }, dirtyBounds);
  const fullCellCount = n * n;
  if (!range) {
    return {
      mode: "full",
      n,
      tileSize: Math.max(8, Math.round(Number(tileSize) || 64)),
      dirtyCellCount: fullCellCount,
      currentUploadCellCount: fullCellCount,
      currentUploadAmplification: 1,
      intersectingTileCount: Math.ceil(n / Math.max(8, Math.round(Number(tileSize) || 64))) ** 2,
      tiledUploadCellCount: fullCellCount,
      tiledUploadAmplification: 1,
      futureTiledSavingsPct: 0,
      recommendation: "full-refresh"
    };
  }
  const effectiveTileSize = Math.max(8, Math.round(Number(tileSize) || 64));
  const dirtyCellCount = range.cellCount;
  const contiguousStart = range.y0 * n + range.x0;
  const contiguousEnd = range.y1 * n + range.x1;
  const currentUploadCellCount = Math.max(dirtyCellCount, contiguousEnd - contiguousStart + 1);
  const tileX0 = Math.floor(range.x0 / effectiveTileSize);
  const tileX1 = Math.floor(range.x1 / effectiveTileSize);
  const tileY0 = Math.floor(range.y0 / effectiveTileSize);
  const tileY1 = Math.floor(range.y1 / effectiveTileSize);
  let intersectingTileCount = 0;
  let tiledUploadCellCount = 0;
  for (let ty = tileY0; ty <= tileY1; ty += 1) {
    const y0 = ty * effectiveTileSize;
    const y1 = Math.min(n - 1, y0 + effectiveTileSize - 1);
    for (let tx = tileX0; tx <= tileX1; tx += 1) {
      const x0 = tx * effectiveTileSize;
      const x1 = Math.min(n - 1, x0 + effectiveTileSize - 1);
      intersectingTileCount += 1;
      tiledUploadCellCount += (x1 - x0 + 1) * (y1 - y0 + 1);
    }
  }
  const currentUploadAmplification = currentUploadCellCount / Math.max(1, dirtyCellCount);
  const tiledUploadAmplification = tiledUploadCellCount / Math.max(1, dirtyCellCount);
  return {
    mode: "dirty-range",
    n,
    tileSize: effectiveTileSize,
    dirtyBounds: range,
    dirtyCellCount,
    currentUploadCellCount,
    currentUploadAmplification: roundDiagnostic(currentUploadAmplification),
    intersectingTileCount,
    tiledUploadCellCount,
    tiledUploadAmplification: roundDiagnostic(tiledUploadAmplification),
    futureTiledSavingsPct: roundDiagnostic(Math.max(0, 1 - tiledUploadCellCount / Math.max(1, currentUploadCellCount))),
    recommendation: currentUploadAmplification > tiledUploadAmplification * 1.8 ? "split-terrain-tiles" : "contiguous-range-ok"
  };
}

function buildingColor(type, fallback, x, y, seed, disasterVisual = 0) {
  const state = normalizeDisasterVisual(disasterVisual);
  const base = new THREE.Color(buildingPaletteColor(type, fallback, x, y, seed));
  const lift = (hash01(x, y, seed + 17) - 0.5) * 0.18;
  base.offsetHSL(0, 0.025 + lift * 0.035, 0.04 + lift * 0.05);
  if (type === "hospital") base.lerp(new THREE.Color(0xf0f0ea), 0.32);
  if (type === "greenhouse") base.lerp(new THREE.Color(0xd4fff0), 0.44);
  if (type === "commercial" || type === "highrise") base.lerp(new THREE.Color(0xd8e7ea), 0.24);
  if (state.flood > 0.35) base.lerp(new THREE.Color(0x6f9dab), clamp01((state.flood - 0.35) / 0.65) * (0.2 + state.timeRatio * 0.08));
  if (state.wildfire > 0.4) base.lerp(new THREE.Color(0x8c5d45), clamp01((state.wildfire - 0.4) / 0.6) * (0.24 + state.timeRatio * 0.12));
  if (state.drought > 0.55) base.lerp(new THREE.Color(0xb59c67), clamp01((state.drought - 0.55) / 0.45) * 0.18);
  if (state.landslide > 0.42) base.lerp(new THREE.Color(0x8a7462), clamp01((state.landslide - 0.42) / 0.58) * (0.26 + state.timeRatio * 0.1));
  if (state.damage > 0.28) base.lerp(new THREE.Color(0x6f6258), clamp01((state.damage - 0.28) / 0.72) * 0.3);
  if (state.foundationRisk > 0.38) base.lerp(new THREE.Color(0xa46f58), clamp01((state.foundationRisk - 0.38) / 0.62) * 0.22);
  if (state.recoveryPressure > 0.55) base.lerp(new THREE.Color(0xe1b45f), clamp01((state.recoveryPressure - 0.55) / 0.45) * 0.18);
  if (state.composite > 0.5) base.offsetHSL(0, -0.03 * state.composite, -0.08 * state.composite * (0.35 + state.timeRatio * 0.65));
  return base.getHex();
}

function roofColor(type, disasterVisual, x, y, seed) {
  const state = normalizeDisasterVisual(disasterVisual);
  const profile = buildingFacadeProfile(type);
  const defaults = {
    school: 0x8d7051,
    villa: 0x9f6645,
    residential: 0x8f5e43,
    village: 0x9b6a3f,
    hospital: 0xd8ddd7,
    commercial: 0x9fb1b6,
    highrise: 0xcbd6d7,
    greenhouse: 0xc9f3e5
  };
  const base = new THREE.Color(profile.roof || defaults[type] || 0x8f5e43);
  base.offsetHSL(0.01, 0.04, (hash01(x, y, seed + 211) - 0.5) * 0.08);
  if (state.flood > 0.45) base.lerp(new THREE.Color(0x5c8794), clamp01((state.flood - 0.45) / 0.55) * 0.22);
  if (state.wildfire > 0.45) base.lerp(new THREE.Color(0x6e5142), clamp01((state.wildfire - 0.45) / 0.55) * 0.34);
  if (state.landslide > 0.52) base.lerp(new THREE.Color(0x7a6551), clamp01((state.landslide - 0.52) / 0.48) * 0.24);
  if (state.damage > 0.35) base.lerp(new THREE.Color(0x5f554d), clamp01((state.damage - 0.35) / 0.65) * 0.26);
  return base.getHex();
}

function buildingMaterialColorPlan({ type = "custom", fallback = undefined, heightM = 10, widthKm = 0.12, depthKm = 0.1, x = 0, y = 0, seed = 0, disasterVisual = 0 } = {}) {
  const key = String(type || "custom");
  const profile = buildingFacadeProfile(key);
  const rawBaseColor = buildingColor(key, fallback, x, y, seed, disasterVisual);
  const rawRoofColor = roofColor(key, disasterVisual, x, y, seed + 19);
  const rawWindowColor = profile.window || 0x83aebe;
  const rawAccentColor = profile.band || profile.entrance || 0x82776a;
  const rawServiceColor = profile.mullion || profile.entrance || 0x62584d;
  const rawDetailColor = profile.litWindow || profile.entrance || 0xedc77d;
  const colorHexes = {
    baseColor: blackBlockSafeHex(rawBaseColor),
    roofColor: blackBlockSafeHex(rawRoofColor),
    windowColor: blackBlockSafeHex(rawWindowColor),
    accentColor: blackBlockSafeHex(rawAccentColor),
    serviceColor: blackBlockSafeHex(rawServiceColor),
    detailColor: blackBlockSafeHex(rawDetailColor)
  };
  const values = Object.values(colorHexes);
  const minimumChannel = Math.min(...values.map((value) => minimumHexChannel(value)));
  const relativeLuminance = values.reduce((sum, value) => sum + perceivedLuminance(value), 0) / Math.max(1, values.length);
  const materialFamily = buildingMaterialFamily(key, profile);
  return {
    mode: "typed-building-material-color-plan",
    materialFamily,
    facadeFamily: profile.family || "custom-mixed",
    heightClass:
      Number(heightM) >= 120 ? "supertall" :
      Number(heightM) >= 45 ? "tall" :
      Number(heightM) >= 18 ? "midrise" :
      "lowrise",
    footprintClass:
      Math.max(Number(widthKm) || 0, Number(depthKm) || 0) >= 0.22 ? "campus-or-large-plate" :
      Math.max(Number(widthKm) || 0, Number(depthKm) || 0) >= 0.1 ? "standard-block" :
      "small-footprint",
    colors: Object.fromEntries(Object.entries(colorHexes).map(([keyName, value]) => [keyName, cssHex(value)])),
    colorHexes,
    minimumChannel,
    relativeLuminance: roundDiagnostic(relativeLuminance),
    isBlackBlockSafe: minimumChannel >= 62 && relativeLuminance >= 0.22,
    hazardTintClass: buildingMaterialHazardTintClass(disasterVisual),
    materialNotes: buildingMaterialNotes(key, materialFamily)
  };
}

function buildingMaterialFamily(type, profile = {}) {
  const key = String(type || "custom");
  if (["highrise", "office_tower", "landmark"].includes(key)) return "cool-glass-curtain-wall";
  if (["data_center", "substation", "powerplant"].includes(key)) return "secure-utility-metal-panel";
  if (["hospital", "clinic"].includes(key)) return "clinical-light-composite";
  if (["villa", "residential", "village", "farmstead"].includes(key)) return "warm-domestic-masonry-roof";
  if (["scenic_overlook", "trailhead", "visitor_center", "ranger_station", "cable_car_station", "mountain_refuge"].includes(key)) return "scenic-timber-stone-deck";
  if (["industrial", "logistics", "airport", "port", "wastewater", "desalination_plant", "hydropower_plant", "geothermal_plant", "water_treatment_plant", "ferry_terminal", "flood_pump_station", "bus_terminal", "water_tower"].includes(key)) return "industrial-service-metal-panel";
  if (["school", "civic", "library", "community_center", "police_station", "fire_station"].includes(key)) return "civic-stone-composite";
  if (["apartment", "hotel", "commercial", "market", "urban"].includes(key)) return "warm-mixed-use-facade";
  if (key === "greenhouse") return "translucent-agri-glass";
  if (key === "observatory" || key === "research_station" || key === "gauging_station" || key === "fire_watch_tower") return "field-research-light-shell";
  if (key === "tunnel_portal") return "reinforced-concrete-portal";
  if (key === "terrace_farm") return "agricultural-service-masonry";
  return `${profile.family || "custom-mixed"}-material`;
}

function buildingMaterialNotes(type, family) {
  const notes = {
    "cool-glass-curtain-wall": "glass, metal mullion, pale roof crown, visible lit-window contrast",
    "secure-utility-metal-panel": "matte metal panel, service-yard gray, raised equipment roof, no black utility blocks",
    "clinical-light-composite": "light clinical facade, teal accent, roof equipment kept visible",
    "warm-domestic-masonry-roof": "warm wall, pitched roof, balcony and domestic trim contrast",
    "scenic-timber-stone-deck": "timber-stone low-impact palette with rails visible against terrain",
    "industrial-service-metal-panel": "industrial metal cladding with readable service doors and roof racks",
    "civic-stone-composite": "stone/composite civic envelope with muted institutional accents",
    "warm-mixed-use-facade": "warm podium and window rhythm for mixed-use frontage"
  };
  return notes[family] || `type=${type}; family=${family}; black-block-safe material palette`;
}

function buildingMaterialHazardTintClass(disasterVisual = 0) {
  const state = normalizeDisasterVisual(disasterVisual);
  const strongest = [
    ["flood-blue-weathering", state.flood],
    ["wildfire-smoke-weathering", state.wildfire],
    ["landslide-dust-weathering", state.landslide],
    ["damage-recovery-weathering", state.damage],
    ["foundation-risk-warm-tint", state.foundationRisk]
  ].sort((a, b) => b[1] - a[1])[0];
  if (!strongest || strongest[1] < 0.18) return "normal-material";
  return strongest[0];
}

function blackBlockSafeHex(hex, minChannel = 62, minLuminance = 0.22) {
  const rgb = hexToRgb(hex);
  let r = Math.max(minChannel, rgb.r);
  let g = Math.max(minChannel, rgb.g);
  let b = Math.max(minChannel, rgb.b);
  let guard = 0;
  while (perceivedLuminance(rgbToHex(r, g, b)) < minLuminance && guard < 8) {
    r = Math.min(255, Math.round(r + (255 - r) * 0.16 + 3));
    g = Math.min(255, Math.round(g + (255 - g) * 0.16 + 3));
    b = Math.min(255, Math.round(b + (255 - b) * 0.16 + 3));
    guard += 1;
  }
  return rgbToHex(r, g, b);
}

function cssHex(hex) {
  return `#${(Number(hex) >>> 0).toString(16).padStart(6, "0").slice(-6)}`;
}

function hexToRgb(hex) {
  const value = Number(hex) >>> 0;
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  };
}

function rgbToHex(r, g, b) {
  return (clampChannel(r) << 16) | (clampChannel(g) << 8) | clampChannel(b);
}

function minimumHexChannel(hex) {
  const { r, g, b } = hexToRgb(hex);
  return Math.min(r, g, b);
}

function perceivedLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function buildingPaletteColor(type, fallback, x, y, seed) {
  const palette = BUILDING_MATERIAL_PALETTES[type] || BUILDING_MATERIAL_PALETTES.custom;
  const index = Math.min(palette.length - 1, Math.floor(hash01(x, y, seed + 131) * palette.length));
  return palette[index] ?? fallback ?? 0xb4a18d;
}

function buildingDisasterVisual(model, index, params = {}) {
  const hazards = model?.hazards || {};
  const years = Math.max(0, Number(params.currentYear ?? hazards.currentYear ?? hazards.years ?? 0));
  const totalYears = Math.max(1, Number(params.simulationYears ?? hazards.years ?? years ?? 1));
  return {
    composite: hazards.currentHazardIndex?.[index] ?? hazards.hazardIndex?.[index] ?? 0,
    flood: hazards.currentFloodHazard?.[index] ?? hazards.floodHazard?.[index] ?? 0,
    drought: hazards.currentDroughtStress?.[index] ?? hazards.droughtStress?.[index] ?? 0,
    wildfire: hazards.currentWildfireRisk?.[index] ?? hazards.wildfireRisk?.[index] ?? 0,
    landslide: hazards.currentLandslideRisk?.[index] ?? hazards.landslideRisk?.[index] ?? 0,
    damage: model?.builtResilience?.currentDamageIndex?.[index] ?? model?.builtResilience?.combinedDamageIndex?.[index] ?? 0,
    recoveryPressure: model?.builtResilience?.recoveryPressure?.[index] ?? 0,
    structuralVulnerability: model?.builtResilience?.structuralVulnerability?.[index] ?? 0,
    foundationRisk: buildingFoundationRisk(model, index),
    timeRatio: clamp01(years / totalYears)
  };
}

function normalizeDisasterVisual(value) {
  if (typeof value === "number") {
    const composite = clamp01(value);
    return { composite, flood: 0, drought: 0, wildfire: 0, landslide: 0, damage: 0, recoveryPressure: 0, structuralVulnerability: 0, foundationRisk: 0, timeRatio: 1 };
  }
  return {
    composite: clamp01(value?.composite),
    flood: clamp01(value?.flood),
    drought: clamp01(value?.drought),
    wildfire: clamp01(value?.wildfire),
    landslide: clamp01(value?.landslide),
    damage: clamp01(value?.damage),
    recoveryPressure: clamp01(value?.recoveryPressure),
    structuralVulnerability: clamp01(value?.structuralVulnerability),
    foundationRisk: clamp01(value?.foundationRisk),
    timeRatio: clamp01(value?.timeRatio ?? 1)
  };
}

function hazardColor(low, high, value) {
  return new THREE.Color(low).lerp(new THREE.Color(high), clamp01(value)).getHex();
}

function terrainRockColor(elevation, maxElevation, noise) {
  const high = clamp01(elevation / Math.max(1, maxElevation));
  return new THREE.Color(0x756f65)
    .lerp(new THREE.Color(0xa9a59b), high * 0.45)
    .offsetHSL(0, 0, (noise - 0.5) * 0.08)
    .getHex();
}

function visualCanopyHeight(canopyM, cover, verticalScale) {
  const observedCanopyM = Math.max(0, Number(canopyM) || 0);
  const inferredCanopyM = observedCanopyM > 0 ? observedCanopyM : 1.5 + clamp01(cover) * 6;
  const scale = Math.max(0.1, Math.min(5, Number(verticalScale) || 1));
  return Math.max(0.001, Math.min(0.08, (inferredCanopyM / 1000) * scale));
}

function vegetationCrownRadius(height, cover, cell) {
  const ideal = height * (0.38 + clamp01(cover) * 0.22);
  const minimum = Math.max(0.0015, Math.min(0.006, cell * 0.008));
  const maximum = Math.max(minimum * 2, Math.min(0.035, cell * 0.09));
  return Math.max(minimum, Math.min(maximum, ideal));
}

function vegetationColor(landCover, cover, fallback) {
  const base = new THREE.Color(fallback);
  if (landCover === 41) base.lerp(new THREE.Color(0x69b966), 0.36);
  if (landCover === 42) base.lerp(new THREE.Color(0x3f8a5c), 0.46);
  if (landCover === 43) base.lerp(new THREE.Color(0x55a16a), 0.38);
  if (landCover === 52) base.lerp(new THREE.Color(0x8fb965), 0.42);
  if (landCover === 71) base.lerp(new THREE.Color(0x9fc46a), 0.48);
  if (landCover === 90 || landCover === 95) base.lerp(new THREE.Color(0x8eba74), 0.5);
  base.offsetHSL(0.015, 0.08, 0.12 + (cover - 0.5) * 0.05);
  return base.getHex();
}

function vegetationTypeColor(vegetationType, landCover, cover) {
  const record = VEGETATION_TYPES?.[Math.round(Number(vegetationType) || 0)];
  if (!record?.color) return vegetationColor(landCover, cover, 0x6ca45e);
  const [r, g, b] = record.color;
  const hex = (clampChannel(r) << 16) | (clampChannel(g) << 8) | clampChannel(b);
  return vegetationColor(landCover, cover, hex);
}

function clampChannel(value) {
  return Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
}

function buildingFacadeProfile(type) {
  return BUILDING_FACADE_PROFILES[type] || BUILDING_FACADE_PROFILES.custom;
}

function buildingFacadeDetailPlan(type, heightM, widthKm = 0.12, depthKm = 0.1) {
  const profile = buildingFacadeProfile(type);
  const floors = Math.max(1, Math.round(Math.max(1, Number(heightM) || 1) / Math.max(2.4, profile.floorHeightM || 3.2)));
  const width = Math.max(0.01, Number(widthKm) || 0.12);
  const depth = Math.max(0.01, Number(depthKm) || 0.1);
  const rowCount = Math.min(profile.maxRows || 4, Math.max(profile.minRows || 1, Math.ceil(floors / Math.max(1, profile.rowsPerBand || 4))));
  const colCount = Math.min(profile.maxCols || 4, Math.max(profile.minCols || 2, Math.ceil(width / Math.max(0.018, profile.windowSpacingKm || 0.044))));
  const faceCount = Math.min(profile.faceCount || 1, depth > 0.055 ? 2 : 1);
  const balconyRows = profile.balcony ? Math.min(5, Math.max(1, Math.floor(rowCount / (type === "villa" ? 2 : 1.6)))) : 0;
  const rooftopCount = Math.max(0, Math.round(profile.roofEquipment || 0));
  const verticalMullionCount = profile.verticalMullions ? Math.min(5, Math.max(1, colCount - 1)) : 0;
  const hasEntrance = !["greenhouse", "quarry"].includes(type) && width > 0.035;
  const hasAntenna = type === "highrise" || type === "landmark" || Math.max(0, Number(heightM) || 0) > 120;
  return {
    family: profile.family,
    rowCount,
    colCount,
    faceCount,
    verticalMullionCount,
    balconyRows,
    rooftopCount,
    hasEntrance,
    hasRoofGarden: Boolean(profile.roofGarden) && width > 0.045 && depth > 0.04,
    hasAntenna,
    windowSkipRate: type === "greenhouse" ? 0.08 : type === "industrial" || type === "logistics" ? 0.28 : 0.18,
    estimatedWindowInstances: rowCount * colCount * faceCount,
    palette: {
      window: profile.window,
      litWindow: profile.litWindow,
      band: profile.band,
      mullion: profile.mullion,
      entrance: profile.entrance,
      roof: profile.roof
    }
  };
}

function buildingRealityDetailPlan(type, heightM, widthKm = 0.12, depthKm = 0.1) {
  const key = String(type || "custom");
  const height = Math.max(1, Number(heightM) || 1);
  const width = Math.max(0.01, Number(widthKm) || 0.12);
  const depth = Math.max(0.01, Number(depthKm) || 0.1);
  const floors = Math.max(1, Math.round(height / Math.max(2.8, buildingFacadeProfile(key).floorHeightM || 3.2)));
  const isTower = ["highrise", "office_tower", "landmark"].includes(key) || height >= 120;
  const isUtilityCampus = ["data_center", "substation", "powerplant"].includes(key);
  const isCivicService = ["hospital", "clinic", "school", "civic", "library", "community_center"].includes(key);
  const isDomestic = ["villa", "residential", "village", "farmstead"].includes(key);
  const componentFamily =
    isTower ? "vertical-core-tower" :
    isUtilityCampus ? "utility-secure-campus" :
    isCivicService ? "civic-service-building" :
    isDomestic ? "lowrise-domestic-building" :
    "mixed-use-building-components";
  const structuralCoreCount = isTower ? 1 : (isCivicService && floors >= 4 ? 1 : 0);
  const podiumBaseCount = isTower || key === "commercial" || key === "hotel" || key === "hospital" ? 1 : 0;
  const pitchedRoofPlaneCount = isDomestic || ["visitor_center", "ranger_station", "trailhead"].includes(key) ? 2 : 0;
  const balconyRailCount =
    key === "villa" ? 2 :
    ["apartment", "hotel", "residential"].includes(key) ? Math.min(6, Math.max(2, Math.ceil(floors / 5))) :
    0;
  const serviceYardCount = isUtilityCampus || ["industrial", "logistics", "wastewater"].includes(key) ? 1 : 0;
  const serviceDropoffCount = ["hospital", "clinic", "school", "hotel", "visitor_center"].includes(key) ? 1 : 0;
  const coolingPlantCount =
    key === "data_center" ? Math.max(2, Math.min(6, Math.round(width / 0.055))) :
    key === "hospital" ? 1 :
    isTower && floors >= 30 ? 1 :
    0;
  const mechanicalScreenCount =
    key === "data_center" ? 4 :
    isTower ? Math.max(1, Math.min(3, Math.ceil(floors / 36))) :
    key === "hospital" ? 2 :
    0;
  const facadeServiceSlotCount = isTower ? Math.max(1, Math.ceil(floors / 32)) : (isUtilityCampus ? 2 : 0);
  const expectedLayers = [];
  if (structuralCoreCount) expectedLayers.push("建筑核心筒");
  if (podiumBaseCount) expectedLayers.push("建筑裙房基座");
  if (pitchedRoofPlaneCount) expectedLayers.push("建筑坡屋顶片");
  if (balconyRailCount) expectedLayers.push("建筑阳台栏杆");
  if (serviceYardCount) expectedLayers.push("建筑服务院落");
  if (serviceDropoffCount) expectedLayers.push("建筑到发门廊");
  if (coolingPlantCount) expectedLayers.push("建筑冷却机组");
  if (mechanicalScreenCount) expectedLayers.push("建筑机电屏障");
  if (facadeServiceSlotCount) expectedLayers.push("建筑服务竖井");
  const estimatedComponentInstances =
    structuralCoreCount +
    podiumBaseCount +
    pitchedRoofPlaneCount +
    balconyRailCount +
    serviceYardCount +
    serviceDropoffCount +
    coolingPlantCount +
    mechanicalScreenCount +
    facadeServiceSlotCount;
  return {
    mode: "typed-real-world-building-components",
    componentFamily,
    floorEstimate: floors,
    widthKm: roundDiagnostic(width),
    depthKm: roundDiagnostic(depth),
    structuralCoreCount,
    podiumBaseCount,
    pitchedRoofPlaneCount,
    balconyRailCount,
    serviceYardCount,
    serviceDropoffCount,
    coolingPlantCount,
    mechanicalScreenCount,
    facadeServiceSlotCount,
    estimatedComponentInstances,
    expectedLayers
  };
}

function emptyFacadeDetailPlan(maxDetailInstances = 0) {
  return {
    mode: "typed-instanced-building-facades",
    maxDetailInstances,
    usedDetailInstances: 0,
    skippedDetailInstanceCount: 0,
    windowGridCount: 0,
    facadeBandCount: 0,
    facadeVerticalCount: 0,
    balconyCount: 0,
    entranceCanopyCount: 0,
    roofEquipmentCount: 0,
    roofGardenCount: 0,
    materialFamilyCounts: {},
    typeDetailCounts: {},
    instancedDetailDrawCalls: 0
  };
}

function emptyBuildingRealityDetailPlan(maxDetailInstances = 0) {
  return {
    mode: "typed-real-world-building-components",
    maxDetailInstances,
    usedDetailInstances: 0,
    skippedDetailInstanceCount: 0,
    structuralCoreCount: 0,
    podiumBaseCount: 0,
    pitchedRoofPlaneCount: 0,
    balconyRailCount: 0,
    serviceYardCount: 0,
    serviceDropoffCount: 0,
    coolingPlantCount: 0,
    mechanicalScreenCount: 0,
    facadeServiceSlotCount: 0,
    componentFamilyCounts: {},
    typeComponentCounts: {},
    instancedDetailDrawCalls: 0
  };
}

function emptyBuildingMaterialColorPlan() {
  return {
    mode: "typed-building-material-color-plan",
    usedMaterialSamples: 0,
    materialFamilyCounts: {},
    typeMaterialCounts: {},
    darkColorViolationCount: 0,
    meanRelativeLuminance: 0,
    sampleColors: [],
    blackBlockSafetyRule: "minimum-channel>=62-and-mean-perceived-luminance>=0.22"
  };
}

function emptyFacilityDetailPlan() {
  return {
    mode: "typed-instanced-facility-microdetails",
    usedDetailInstances: 0,
    solarSupportCount: 0,
    coolingRackCount: 0,
    greenhouseRidgeCount: 0,
    marketAwningCount: 0,
    stadiumFieldCount: 0,
    farmRowCount: 0,
    terraceWallCount: 0,
    quarryBenchCount: 0,
    substationFrameCount: 0,
    hospitalHelipadCount: 0,
    schoolYardCount: 0,
    emergencyBayCount: 0,
    securityForecourtCount: 0,
    hotelPodiumCount: 0,
    officeMechanicalDeckCount: 0,
    clinicAmbulanceBayCount: 0,
    libraryCourtyardCount: 0,
    communityPlazaCount: 0,
    busBayCount: 0,
    waterTowerTankCount: 0,
    waterTowerLegCount: 0,
    observatoryDomeCount: 0,
    observatoryTelescopeMountCount: 0,
    cableCarTowerCount: 0,
    cableCarCableCount: 0,
    cableCarPlatformCount: 0,
    floodPumpIntakeCount: 0,
    floodPumpOutfallCount: 0,
    desalinationTankCount: 0,
    desalinationIntakeGalleryCount: 0,
    visitorCenterPlazaCount: 0,
    scenicOverlookDeckCount: 0,
    scenicOverlookRailCount: 0,
    trailheadKioskCount: 0,
    trailheadTrailStripCount: 0,
    rangerWatchTowerCount: 0,
    rangerYardCount: 0,
    gaugingStaffPlateCount: 0,
    gaugingSensorMastCount: 0,
    serviceSignageCount: 0,
    railTrackCount: 0,
    railSleeperCount: 0,
    bridgePierCount: 0,
    bridgeGuardRailCount: 0,
    damSpillwayCount: 0,
    damSpillwayGateCount: 0,
    airportRunwayMarkCount: 0,
    airportRunwayThresholdCount: 0,
    portQuayApronCount: 0,
    portCraneCount: 0,
    portCraneBoomCount: 0,
    instancedDetailDrawCalls: 0
  };
}

function infrastructureEcosystem3DControls(params = {}) {
  const allowedLinkModes = new Set(["all", "professional", "local", "off"]);
  const roleFocus = String(params.ecosystem3DRoleFocus || params.roleFocus || "all");
  const linkMode = String(params.ecosystem3DLinkMode || params.linkMode || "all");
  const rawScale = Number(params.ecosystem3DNodeScale ?? params.nodeScale ?? 1);
  return {
    enabled: params.ecosystem3DEnabled !== false && params.enabled !== false,
    roleFocus: roleFocus || "all",
    linkMode: allowedLinkModes.has(linkMode) ? linkMode : "all",
    nodeScale: Math.min(3, Math.max(0.5, Number.isFinite(rawScale) ? rawScale : 1))
  };
}

function emptyInfrastructureEcosystem3DDiagnosticPlan(controls = infrastructureEcosystem3DControls()) {
  return {
    mode: "facility-ecosystem-role-coverage-3d-diagnostic",
    activeFacilityCellCount: 0,
    roleCounts: {},
    facilityTypeCounts: {},
    representedRoleCount: 0,
    scenicFieldCompletenessScore: 0,
    visibleNodeCount: 0,
    visibleHaloCount: 0,
    visibleLinkCount: 0,
    linkTypeCounts: {},
    visibleRoleCounts: {},
    controls,
    rolePalette: infrastructureEcosystemRolePalette(),
    linkPalette: infrastructureEcosystemLinkPalette(),
    visualLayerStatus: "empty",
    sampledVisualNodeCount: 0,
    meanVisualLinkLengthKm: 0,
    missingScenicFieldRoles: [
      "visitor-access-hub",
      "scenic-viewpoint",
      "trail-access",
      "conservation-management",
      "hydrometric-monitoring"
    ],
    status: "empty"
  };
}

function buildInfrastructureEcosystem3DDiagnosticPlan(roleCounts, facilityTypeCounts, activeFacilityCellCount, visualPlan = emptyInfrastructureEcosystemVisualPlan()) {
  const requiredScenicRoles = [
    "visitor-access-hub",
    "scenic-viewpoint",
    "trail-access",
    "conservation-management",
    "hydrometric-monitoring"
  ];
  const missingScenicFieldRoles = requiredScenicRoles.filter((role) => !(roleCounts?.[role] > 0));
  const scenicFieldCompletenessScore = requiredScenicRoles.length
    ? (requiredScenicRoles.length - missingScenicFieldRoles.length) / requiredScenicRoles.length
    : 0;
  return {
    mode: "facility-ecosystem-role-coverage-3d-diagnostic",
    activeFacilityCellCount,
    roleCounts: { ...(roleCounts || {}) },
    facilityTypeCounts: { ...(facilityTypeCounts || {}) },
    representedRoleCount: Object.keys(roleCounts || {}).length,
    scenicFieldCompletenessScore: roundDiagnostic(scenicFieldCompletenessScore),
    visibleNodeCount: visualPlan.visibleNodeCount || 0,
    visibleHaloCount: visualPlan.visibleHaloCount || 0,
    visibleLinkCount: visualPlan.visibleLinkCount || 0,
    linkTypeCounts: { ...(visualPlan.linkTypeCounts || {}) },
    visibleRoleCounts: { ...(visualPlan.visibleRoleCounts || {}) },
    controls: visualPlan.controls || infrastructureEcosystem3DControls(),
    rolePalette: infrastructureEcosystemRolePalette(),
    linkPalette: infrastructureEcosystemLinkPalette(),
    visualLayerStatus: visualPlan.status || (!activeFacilityCellCount ? "empty" : "ready"),
    sampledVisualNodeCount: visualPlan.sampledVisualNodeCount || 0,
    meanVisualLinkLengthKm: visualPlan.meanVisualLinkLengthKm || 0,
    missingScenicFieldRoles,
    status: !activeFacilityCellCount ? "empty" : missingScenicFieldRoles.length ? "partial" : "ready"
  };
}

function emptyInfrastructureEcosystemVisualPlan(controls = infrastructureEcosystem3DControls(), status = "empty") {
  return {
    status,
    visibleNodeCount: 0,
    visibleHaloCount: 0,
    visibleLinkCount: 0,
    linkTypeCounts: {},
    visibleRoleCounts: {},
    controls,
    sampledVisualNodeCount: 0,
    meanVisualLinkLengthKm: 0
  };
}

function pushInfrastructureEcosystemVisualLayers(buckets, candidates, cell, controls = infrastructureEcosystem3DControls()) {
  const visualControls = infrastructureEcosystem3DControls(controls);
  if (!visualControls.enabled) return emptyInfrastructureEcosystemVisualPlan(visualControls, "disabled");
  if (!Array.isArray(candidates) || !candidates.length) return emptyInfrastructureEcosystemVisualPlan(visualControls);
  const selectedNodes = selectInfrastructureEcosystemVisualNodes(candidates);
  const visualNodes = visualControls.roleFocus === "all"
    ? selectedNodes
    : selectedNodes.filter((node) => node.role === visualControls.roleFocus);
  if (!visualNodes.length) {
    return {
      ...emptyInfrastructureEcosystemVisualPlan(visualControls, "filtered-empty"),
      sampledVisualNodeCount: 0
    };
  }
  const nodeScale = visualControls.nodeScale;
  const visibleRoleCounts = {};
  const linkTypeCounts = {};
  let linkLengthSum = 0;
  const linkKeys = new Set();
  for (const node of visualNodes) {
    incrementRendererCount(visibleRoleCounts, node.role, 1);
    const color = infrastructureEcosystemRoleColor(node.role);
    const strength = clamp01((Number(node.suitability) || 0) * 0.7 + (1 - clamp01(Number(node.adaptationNeed) || 0)) * 0.3);
    const radius = Math.max(cell * (0.075 + strength * 0.025) * nodeScale, 0.016);
    const height = Math.max(cell * (0.22 + strength * 0.18) * nodeScale, 0.06);
    const haloSize = Math.max(cell * 0.32 * nodeScale, 0.07);
    buckets.ecosystemRoleNodes.push({
      x: node.base.x,
      y: node.base.y + height / 2 + Math.max(cell * 0.18, 0.05),
      z: node.base.z,
      sx: radius,
      sy: height,
      sz: radius,
      ry: node.angle || 0,
      color
    });
    buckets.ecosystemRoleHalos.push({
      x: node.base.x,
      y: node.base.y + Math.max(cell * 0.075, 0.028),
      z: node.base.z,
      sx: haloSize,
      sy: haloSize,
      sz: haloSize,
      ry: node.angle || 0,
      color
    });
  }
  const addLink = (from, to, edgeType) => {
    if (!from || !to || from === to) return;
    const key = infrastructureEcosystemVisualLinkKey(from, to, edgeType);
    if (linkKeys.has(key)) return;
    const dx = to.base.x - from.base.x;
    const dz = to.base.z - from.base.z;
    const length = Math.hypot(dx, dz);
    if (!Number.isFinite(length) || length < Math.max(cell * 0.08, 0.02)) return;
    linkKeys.add(key);
    incrementRendererCount(linkTypeCounts, edgeType, 1);
    linkLengthSum += length;
    buckets.ecosystemNetworkLinks.push({
      x: (from.base.x + to.base.x) / 2,
      y: (from.base.y + to.base.y) / 2 + Math.max(cell * 0.24, 0.08),
      z: (from.base.z + to.base.z) / 2,
      sx: length,
      sy: Math.max(cell * 0.026, 0.01),
      sz: Math.max(cell * 0.026, 0.01),
      ry: Math.atan2(-dz, dx),
      color: infrastructureEcosystemLinkColor(edgeType)
    });
  };
  if (visualControls.linkMode === "all" || visualControls.linkMode === "professional") {
    addInfrastructureEcosystemNearestRoleLinks(visualNodes, addLink, ["visitor-access-hub"], ["trail-access", "scenic-viewpoint"], "access-service-link");
    addInfrastructureEcosystemNearestRoleLinks(visualNodes, addLink, ["trail-access"], ["scenic-viewpoint"], "trail-view-link");
    addInfrastructureEcosystemNearestRoleLinks(visualNodes, addLink, ["conservation-management"], ["trail-access", "scenic-viewpoint", "visitor-access-hub"], "conservation-patrol-link");
    addInfrastructureEcosystemNearestRoleLinks(visualNodes, addLink, ["hydrometric-monitoring"], ["conservation-management", "trail-access"], "hydrology-monitoring-link");
  }
  if (visualControls.linkMode === "all" || visualControls.linkMode === "local") {
    for (const node of visualNodes) {
      const nearest = infrastructureEcosystemNearestNode(node, visualNodes, []);
      if (nearest) addLink(node, nearest, "local-support-link");
    }
  }
  return {
    status: visualNodes.length ? "ready" : "empty",
    visibleNodeCount: buckets.ecosystemRoleNodes.length,
    visibleHaloCount: buckets.ecosystemRoleHalos.length,
    visibleLinkCount: buckets.ecosystemNetworkLinks.length,
    linkTypeCounts,
    visibleRoleCounts,
    controls: visualControls,
    sampledVisualNodeCount: visualNodes.length,
    meanVisualLinkLengthKm: roundDiagnostic(linkLengthSum / Math.max(1, buckets.ecosystemNetworkLinks.length))
  };
}

function selectInfrastructureEcosystemVisualNodes(candidates) {
  const grouped = {};
  for (const candidate of candidates || []) {
    const role = candidate.role || infrastructureEcosystemRoleFor3D(candidate.type);
    if (!grouped[role]) grouped[role] = [];
    grouped[role].push(candidate);
  }
  const selected = [];
  for (const [role, rows] of Object.entries(grouped)) {
    const limit = infrastructureEcosystemVisualNodeLimit(role, rows.length);
    rows
      .slice()
      .sort((a, b) =>
        (Number(b.suitability) || 0) - (Number(a.suitability) || 0) ||
        (Number(a.adaptationNeed) || 0) - (Number(b.adaptationNeed) || 0) ||
        (Number(a.index) || 0) - (Number(b.index) || 0)
      )
      .slice(0, limit)
      .forEach((row) => selected.push({ ...row, role }));
  }
  return selected;
}

function infrastructureEcosystemVisualNodeLimit(role, rowCount) {
  if (rowCount <= 12) return rowCount;
  if (["visitor-access-hub", "scenic-viewpoint", "trail-access", "conservation-management", "hydrometric-monitoring"].includes(role)) return Math.min(rowCount, 128);
  return Math.min(rowCount, 96);
}

function addInfrastructureEcosystemNearestRoleLinks(nodes, addLink, sourceRoles, targetRoles, edgeType) {
  const sourceSet = new Set(sourceRoles);
  for (const node of nodes) {
    if (!sourceSet.has(node.role)) continue;
    const nearest = infrastructureEcosystemNearestNode(node, nodes, targetRoles);
    if (nearest) addLink(node, nearest, edgeType);
  }
}

function infrastructureEcosystemNearestNode(source, nodes, targetRoles = []) {
  const targetRoleSet = new Set(targetRoles);
  let nearest = null;
  let nearestDistance = Infinity;
  for (const node of nodes) {
    if (node === source) continue;
    if (targetRoleSet.size && !targetRoleSet.has(node.role)) continue;
    const distance = Math.hypot(node.base.x - source.base.x, node.base.z - source.base.z);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = node;
    }
  }
  return nearest;
}

function infrastructureEcosystemVisualLinkKey(a, b, edgeType) {
  const left = Number(a.index) || 0;
  const right = Number(b.index) || 0;
  return `${edgeType}:${Math.min(left, right)}-${Math.max(left, right)}`;
}

function infrastructureEcosystemRolePalette() {
  return {
    "visitor-access-hub": 0xf2c766,
    "scenic-viewpoint": 0x79c7e3,
    "trail-access": 0xb9d36b,
    "conservation-management": 0x6fb47a,
    "hydrometric-monitoring": 0x4aa6c8,
    "access-corridor": 0xc8b17a,
    "hydraulic-control": 0x58a9c3,
    "monitoring-node": 0x9fb6d9,
    "emergency-response-node": 0xd87864,
    "civic-service-node": 0xd0b27d,
    "utility-node": 0x8ea2aa,
    "ecological-buffer": 0x72aa62,
    "production-support": 0xb6b85f,
    "resource-extraction": 0xa88462,
    "custom-adaptive-node": 0xc1b9a5
  };
}

function infrastructureEcosystemLinkPalette() {
  return {
    "access-service-link": 0xf0c86e,
    "trail-view-link": 0xa8cf66,
    "conservation-patrol-link": 0x6fb47a,
    "hydrology-monitoring-link": 0x4aa6c8,
    "local-support-link": 0x9aa6a2
  };
}

function infrastructureEcosystemRoleColor(role) {
  return infrastructureEcosystemRolePalette()[role] || 0xc1b9a5;
}

function infrastructureEcosystemLinkColor(edgeType) {
  return infrastructureEcosystemLinkPalette()[edgeType] || 0x9aa6a2;
}

function infrastructureEcosystemRoleFor3D(type) {
  if (type === "visitor_center") return "visitor-access-hub";
  if (type === "hydropower_plant") return "hydropower-head-control";
  if (type === "geothermal_plant") return "utility-node";
  if (type === "water_treatment_plant") return "water-treatment-intake-control";
  if (type === "mountain_refuge") return "emergency-response-node";
  if (type === "ferry_terminal") return "access-corridor";
  if (type === "fire_watch_tower") return "monitoring-node";
  if (type === "scenic_overlook") return "scenic-viewpoint";
  if (type === "trailhead") return "trail-access";
  if (type === "ranger_station") return "conservation-management";
  if (type === "gauging_station") return "hydrometric-monitoring";
  if (["transport", "rail", "bridge", "airport", "metro_station", "tunnel_portal", "bus_terminal", "cable_car_station"].includes(type)) return "access-corridor";
  if (["dam", "levee", "canal", "reservoir", "water_tower", "flood_pump_station", "desalination_plant", "hydropower_plant", "water_treatment_plant"].includes(type)) return "hydraulic-control";
  if (["observatory", "research_station"].includes(type)) return "monitoring-node";
  if (["fire_station", "police_station", "clinic"].includes(type)) return "emergency-response-node";
  if (["civic", "hospital", "school", "stadium", "library", "community_center"].includes(type)) return "civic-service-node";
  if (["data_center", "substation", "solar_farm", "wind_farm"].includes(type)) return "utility-node";
  if (["park"].includes(type)) return "ecological-buffer";
  if (["greenhouse", "terrace_farm"].includes(type)) return "production-support";
  if (["quarry"].includes(type)) return "resource-extraction";
  return "custom-adaptive-node";
}

function buildBuildingRealityDetailPlan(buckets, options = {}) {
  const plan = {
    ...emptyBuildingRealityDetailPlan(options.maxDetailInstances || 0),
    skippedDetailInstanceCount: options.skippedDetailInstanceCount || 0,
    structuralCoreCount: buckets.buildingStructuralCores?.length || 0,
    podiumBaseCount: buckets.buildingPodiumBases?.length || 0,
    pitchedRoofPlaneCount: buckets.buildingPitchedRoofPlanes?.length || 0,
    balconyRailCount: buckets.buildingBalconyRails?.length || 0,
    serviceYardCount: buckets.buildingServiceYards?.length || 0,
    serviceDropoffCount: buckets.buildingServiceDropoffs?.length || 0,
    coolingPlantCount: buckets.buildingCoolingPlants?.length || 0,
    mechanicalScreenCount: buckets.buildingMechanicalScreens?.length || 0,
    facadeServiceSlotCount: buckets.buildingFacadeServiceSlots?.length || 0,
    componentFamilyCounts: { ...(options.componentFamilyCounts || {}) },
    typeComponentCounts: { ...(options.typeComponentCounts || {}) }
  };
  const detailBuckets = [
    buckets.buildingStructuralCores,
    buckets.buildingPodiumBases,
    buckets.buildingPitchedRoofPlanes,
    buckets.buildingBalconyRails,
    buckets.buildingServiceYards,
    buckets.buildingServiceDropoffs,
    buckets.buildingCoolingPlants,
    buckets.buildingMechanicalScreens,
    buckets.buildingFacadeServiceSlots
  ];
  plan.usedDetailInstances =
    plan.structuralCoreCount +
    plan.podiumBaseCount +
    plan.pitchedRoofPlaneCount +
    plan.balconyRailCount +
    plan.serviceYardCount +
    plan.serviceDropoffCount +
    plan.coolingPlantCount +
    plan.mechanicalScreenCount +
    plan.facadeServiceSlotCount;
  plan.instancedDetailDrawCalls = detailBuckets.filter((bucket) => bucket?.length > 0).length;
  return plan;
}

function buildFacilityDetailPlan(buckets) {
  const plan = {
    ...emptyFacilityDetailPlan(),
    solarSupportCount: buckets.solarSupports?.length || 0,
    coolingRackCount: buckets.coolingRacks?.length || 0,
    greenhouseRidgeCount: buckets.greenhouseRidges?.length || 0,
    marketAwningCount: buckets.marketAwnings?.length || 0,
    stadiumFieldCount: buckets.stadiumFields?.length || 0,
    farmRowCount: buckets.farmRows?.length || 0,
    terraceWallCount: buckets.terraceWalls?.length || 0,
    quarryBenchCount: buckets.quarryBenches?.length || 0,
    substationFrameCount: buckets.substationFrames?.length || 0,
    hospitalHelipadCount: buckets.hospitalHelipads?.length || 0,
    schoolYardCount: buckets.schoolYards?.length || 0,
    emergencyBayCount: buckets.emergencyBays?.length || 0,
    securityForecourtCount: buckets.securityForecourts?.length || 0,
    hotelPodiumCount: buckets.hotelPodiums?.length || 0,
    officeMechanicalDeckCount: buckets.officeMechanicalDecks?.length || 0,
    clinicAmbulanceBayCount: buckets.clinicAmbulanceBays?.length || 0,
    libraryCourtyardCount: buckets.libraryCourtyards?.length || 0,
    communityPlazaCount: buckets.communityPlazas?.length || 0,
    busBayCount: buckets.busBays?.length || 0,
    waterTowerTankCount: buckets.waterTowerTanks?.length || 0,
    waterTowerLegCount: buckets.waterTowerLegs?.length || 0,
    observatoryDomeCount: buckets.observatoryDomes?.length || 0,
    observatoryTelescopeMountCount: buckets.observatoryTelescopeMounts?.length || 0,
    cableCarTowerCount: buckets.cableCarTowers?.length || 0,
    cableCarCableCount: buckets.cableCarCables?.length || 0,
    cableCarPlatformCount: buckets.cableCarPlatforms?.length || 0,
    floodPumpIntakeCount: buckets.floodPumpIntakes?.length || 0,
    floodPumpOutfallCount: buckets.floodPumpOutfalls?.length || 0,
    desalinationTankCount: buckets.desalinationTanks?.length || 0,
    desalinationIntakeGalleryCount: buckets.desalinationIntakeGalleries?.length || 0,
    visitorCenterPlazaCount: buckets.visitorCenterPlazas?.length || 0,
    scenicOverlookDeckCount: buckets.scenicOverlookDecks?.length || 0,
    scenicOverlookRailCount: buckets.scenicOverlookRails?.length || 0,
    trailheadKioskCount: buckets.trailheadKiosks?.length || 0,
    trailheadTrailStripCount: buckets.trailheadTrailStrips?.length || 0,
    rangerWatchTowerCount: buckets.rangerWatchTowers?.length || 0,
    rangerYardCount: buckets.rangerYards?.length || 0,
    gaugingStaffPlateCount: buckets.gaugingStaffPlates?.length || 0,
    gaugingSensorMastCount: buckets.gaugingSensorMasts?.length || 0,
    serviceSignageCount: buckets.serviceSignage?.length || 0,
    railTrackCount: buckets.rails?.length || 0,
    railSleeperCount: buckets.railSleepers?.length || 0,
    bridgePierCount: buckets.bridgePiers?.length || 0,
    bridgeGuardRailCount: buckets.bridgeGuardRails?.length || 0,
    damSpillwayCount: buckets.spillways?.length || 0,
    damSpillwayGateCount: buckets.damSpillwayGates?.length || 0,
    airportRunwayMarkCount: buckets.runwayMarks?.length || 0,
    airportRunwayThresholdCount: buckets.airportThresholdMarks?.length || 0,
    portQuayApronCount: buckets.portQuayAprons?.length || 0,
    portCraneCount: buckets.portCraneMasts?.length || 0,
    portCraneBoomCount: buckets.portCraneBooms?.length || 0
  };
  plan.usedDetailInstances =
    plan.solarSupportCount +
    plan.coolingRackCount +
    plan.greenhouseRidgeCount +
    plan.marketAwningCount +
    plan.stadiumFieldCount +
    plan.farmRowCount +
    plan.terraceWallCount +
    plan.quarryBenchCount +
    plan.substationFrameCount +
    plan.hospitalHelipadCount +
    plan.schoolYardCount +
    plan.emergencyBayCount +
    plan.securityForecourtCount +
    plan.hotelPodiumCount +
    plan.officeMechanicalDeckCount +
    plan.clinicAmbulanceBayCount +
    plan.libraryCourtyardCount +
    plan.communityPlazaCount +
    plan.busBayCount +
    plan.waterTowerTankCount +
    plan.waterTowerLegCount +
    plan.observatoryDomeCount +
    plan.observatoryTelescopeMountCount +
    plan.cableCarTowerCount +
    plan.cableCarCableCount +
    plan.cableCarPlatformCount +
    plan.floodPumpIntakeCount +
    plan.floodPumpOutfallCount +
    plan.desalinationTankCount +
    plan.desalinationIntakeGalleryCount +
    plan.visitorCenterPlazaCount +
    plan.scenicOverlookDeckCount +
    plan.scenicOverlookRailCount +
    plan.trailheadKioskCount +
    plan.trailheadTrailStripCount +
    plan.rangerWatchTowerCount +
    plan.rangerYardCount +
    plan.gaugingStaffPlateCount +
    plan.gaugingSensorMastCount +
    plan.serviceSignageCount +
    plan.railTrackCount +
    plan.railSleeperCount +
    plan.bridgePierCount +
    plan.bridgeGuardRailCount +
    plan.damSpillwayCount +
    plan.damSpillwayGateCount +
    plan.airportRunwayMarkCount +
    plan.airportRunwayThresholdCount +
    plan.portQuayApronCount +
    plan.portCraneCount +
    plan.portCraneBoomCount;
  plan.instancedDetailDrawCalls = [
    buckets.solarSupports,
    buckets.coolingRacks,
    buckets.greenhouseRidges,
    buckets.marketAwnings,
    buckets.stadiumFields,
    buckets.farmRows,
    buckets.terraceWalls,
    buckets.quarryBenches,
    buckets.substationFrames,
    buckets.hospitalHelipads,
    buckets.schoolYards,
    buckets.emergencyBays,
    buckets.securityForecourts,
    buckets.hotelPodiums,
    buckets.officeMechanicalDecks,
    buckets.clinicAmbulanceBays,
    buckets.libraryCourtyards,
    buckets.communityPlazas,
    buckets.busBays,
    buckets.waterTowerTanks,
    buckets.waterTowerLegs,
    buckets.observatoryDomes,
    buckets.observatoryTelescopeMounts,
    buckets.cableCarTowers,
    buckets.cableCarCables,
    buckets.cableCarPlatforms,
    buckets.floodPumpIntakes,
    buckets.floodPumpOutfalls,
    buckets.desalinationTanks,
    buckets.desalinationIntakeGalleries,
    buckets.visitorCenterPlazas,
    buckets.scenicOverlookDecks,
    buckets.scenicOverlookRails,
    buckets.trailheadKiosks,
    buckets.trailheadTrailStrips,
    buckets.rangerWatchTowers,
    buckets.rangerYards,
    buckets.gaugingStaffPlates,
    buckets.gaugingSensorMasts,
    buckets.serviceSignage,
    buckets.rails,
    buckets.railSleepers,
    buckets.bridgePiers,
    buckets.bridgeGuardRails,
    buckets.spillways,
    buckets.damSpillwayGates,
    buckets.runwayMarks,
    buckets.airportThresholdMarks,
    buckets.portQuayAprons,
    buckets.portCraneMasts,
    buckets.portCraneBooms
  ].filter((bucket) => bucket?.length > 0).length;
  return plan;
}

function emptyAdaptationDetailPlan() {
  return {
    mode: "environment-adaptive-infrastructure-details",
    driverModel: "slope-wetness-flood-wind-wildfire-landslide-foundation-risk",
    usedDetailInstances: 0,
    foundationPlinthCount: 0,
    slopeRetainingWallCount: 0,
    drainageSwaleCount: 0,
    windbreakScreenCount: 0,
    firebreakStripCount: 0,
    instancedDetailDrawCalls: 0
  };
}

function buildAdaptationDetailPlan(buckets) {
  const plan = {
    ...emptyAdaptationDetailPlan(),
    foundationPlinthCount: buckets.adaptiveFoundationPlinths?.length || 0,
    slopeRetainingWallCount: buckets.adaptiveSlopeRetainingWalls?.length || 0,
    drainageSwaleCount: buckets.adaptiveDrainageSwales?.length || 0,
    windbreakScreenCount: buckets.adaptiveWindbreakScreens?.length || 0,
    firebreakStripCount: buckets.adaptiveFirebreakStrips?.length || 0
  };
  plan.usedDetailInstances =
    plan.foundationPlinthCount +
    plan.slopeRetainingWallCount +
    plan.drainageSwaleCount +
    plan.windbreakScreenCount +
    plan.firebreakStripCount;
  plan.instancedDetailDrawCalls = [
    buckets.adaptiveFoundationPlinths,
    buckets.adaptiveSlopeRetainingWalls,
    buckets.adaptiveDrainageSwales,
    buckets.adaptiveWindbreakScreens,
    buckets.adaptiveFirebreakStrips
  ].filter((bucket) => bucket?.length > 0).length;
  return plan;
}

function isConiferLandCover(landCover) {
  return landCover === 42 || landCover === 43;
}

function isShrubOrGrassLandCover(landCover) {
  return landCover === 52 || landCover === 71 || landCover === 81 || landCover === 82;
}

function isWetlandLandCover(landCover) {
  return landCover === 90 || landCover === 95 || landCover === 11;
}

function maxFiniteValue(values, fallback = 0) {
  let max = -Infinity;
  for (let i = 0; i < (values?.length || 0); i += 1) {
    const value = values[i];
    if (Number.isFinite(value) && value > max) max = value;
  }
  return max === -Infinity ? fallback : max;
}

function pushBuildingFineDetails(buckets, transform, type, width, depth, angle, heightM, groundY, seed, remainingBudget = Infinity) {
  const profile = buildingFacadeProfile(type);
  const plan = buildingFacadeDetailPlan(type, heightM, width, depth);
  const result = {
    family: plan.family,
    added: 0,
    skipped: 0,
    bucketCounts: {
      windowGrids: 0,
      facadeVerticals: 0,
      balconies: 0,
      entrances: 0,
      roofEquipment: 0,
      roofGardens: 0,
      antennas: 0
    }
  };
  const add = (bucketName, item) => {
    if (result.added >= remainingBudget) {
      result.skipped += 1;
      return false;
    }
    buckets[bucketName].push(item);
    result.added += 1;
    result.bucketCounts[bucketName] = (result.bucketCounts[bucketName] || 0) + 1;
    return true;
  };
  const topY = groundY + transform.sy;
  const faceSpecs = [{ angle, width, depth, front: depth / 2 + 0.005 }];
  if (plan.faceCount > 1) faceSpecs.push({ angle: angle + Math.PI / 2, width: depth, depth: width, front: width / 2 + 0.005 });

  if (!["quarry"].includes(type)) {
    faceSpecs.forEach((face, faceIndex) => {
      for (let row = 0; row < plan.rowCount; row += 1) {
        const tY = (row + 1) / (plan.rowCount + 1);
        for (let col = 0; col < plan.colCount; col += 1) {
          if (hash01(seed + row * 13 + faceIndex * 37, col * 17, seed + 61) < plan.windowSkipRate) continue;
          const lateral = face.width * ((col + 0.5) / plan.colCount - 0.5) * 0.76;
          const offset = rotatedOffset(face.angle, lateral, face.front);
          const lit = hash01(seed + row * 29, col + faceIndex * 23, seed + 173) > 0.78;
          add("windowGrids", {
            x: transform.x + offset.x,
            y: transform.y - transform.sy / 2 + transform.sy * tY,
            z: transform.z + offset.z,
            sx: Math.max(0.01, face.width / (plan.colCount * 3.25)),
            sy: Math.max(0.008, transform.sy / (plan.rowCount * 12.5)),
            sz: 0.005,
            ry: face.angle,
            color: lit ? profile.litWindow : profile.window
          });
        }
      }
    });
  }

  if (plan.verticalMullionCount > 0) {
    const face = faceSpecs[0];
    for (let col = 1; col <= plan.verticalMullionCount; col += 1) {
      const lateral = face.width * (col / (plan.verticalMullionCount + 1) - 0.5) * 0.8;
      const offset = rotatedOffset(face.angle, lateral, face.front + 0.002);
      add("facadeVerticals", {
        x: transform.x + offset.x,
        y: transform.y,
        z: transform.z + offset.z,
        sx: Math.max(0.004, width * 0.018),
        sy: Math.max(0.025, transform.sy * 0.92),
        sz: 0.005,
        ry: face.angle,
        color: profile.mullion
      });
    }
  }

  if (plan.balconyRows > 0) {
    for (let row = 0; row < plan.balconyRows; row += 1) {
      const offset = rotatedOffset(angle, 0, depth / 2 + 0.018);
      add("balconies", {
        x: transform.x + offset.x,
        y: transform.y - transform.sy / 2 + transform.sy * ((row + 1) / (plan.balconyRows + 1)),
        z: transform.z + offset.z,
        sx: width * (type === "villa" ? 0.44 : 0.58),
        sy: 0.008,
        sz: 0.022,
        ry: angle,
        color: 0x8d877d
      });
    }
  }

  if (plan.hasEntrance) {
    const offset = rotatedOffset(angle, 0, depth / 2 + 0.026);
    add("entrances", {
      x: transform.x + offset.x,
      y: groundY + Math.max(0.012, transform.sy * 0.08),
      z: transform.z + offset.z,
      sx: Math.max(width * 0.28, 0.018),
      sy: Math.max(0.01, transform.sy * 0.035),
      sz: 0.03,
      ry: angle,
      color: profile.entrance
    });
  }

  for (let r = 0; r < plan.rooftopCount; r += 1) {
    const offset = rotatedOffset(
      angle,
      (hash01(seed, r, seed + 79) - 0.5) * width * 0.42,
      (hash01(r, seed, seed + 83) - 0.5) * depth * 0.42
    );
    add("roofEquipment", {
      x: transform.x + offset.x,
      y: topY + 0.018,
      z: transform.z + offset.z,
      sx: Math.max(0.015, width * (0.12 + hash01(seed, r, seed + 89) * 0.08)),
      sy: 0.036,
      sz: Math.max(0.012, depth * 0.12),
      ry: angle + (hash01(seed, r, seed + 91) - 0.5) * 0.7,
      color: 0x7e8582
    });
  }

  if (plan.hasRoofGarden) {
    add("roofGardens", {
      x: transform.x,
      y: topY + 0.006,
      z: transform.z,
      sx: Math.max(0.018, width * 0.42),
      sy: 0.01,
      sz: Math.max(0.016, depth * 0.34),
      ry: angle,
      color: 0x5f9d67
    });
  }

  if (plan.hasAntenna) {
    add("antennas", {
      x: transform.x,
      y: topY + 0.09,
      z: transform.z,
      sx: Math.max(0.005, width * 0.025),
      sy: 0.18,
      sz: Math.max(0.005, width * 0.025),
      ry: angle,
      color: 0xd8ddd7
    });
  }
  return result;
}

function pushBuildingRealityDetails(buckets, transform, type, width, depth, angle, heightM, groundY, seed, remainingBudget = Infinity) {
  const plan = buildingRealityDetailPlan(type, heightM, width, depth);
  const result = {
    family: plan.componentFamily,
    added: 0,
    skipped: 0
  };
  const add = (bucketName, item) => {
    if (result.added >= remainingBudget) {
      result.skipped += 1;
      return false;
    }
    buckets[bucketName].push(item);
    result.added += 1;
    return true;
  };
  const topY = groundY + transform.sy;
  const front = rotatedOffset(angle, 0, depth / 2 + 0.032);
  const back = rotatedOffset(angle, 0, -depth / 2 - 0.038);
  const left = rotatedOffset(angle, -width / 2 - 0.012, 0);
  const right = rotatedOffset(angle, width / 2 + 0.012, 0);

  for (let i = 0; i < plan.structuralCoreCount; i += 1) {
    const lateral = (i - (plan.structuralCoreCount - 1) / 2) * width * 0.18;
    const offset = rotatedOffset(angle, lateral, -depth * 0.08);
    add("buildingStructuralCores", {
      x: transform.x + offset.x,
      y: transform.y,
      z: transform.z + offset.z,
      sx: Math.max(0.018, width * 0.2),
      sy: Math.max(0.05, transform.sy * 1.02),
      sz: Math.max(0.016, depth * 0.22),
      ry: angle,
      color: 0x6f858d
    });
  }

  for (let i = 0; i < plan.podiumBaseCount; i += 1) {
    const height = Math.max(0.028, Math.min(0.11, transform.sy * 0.2));
    add("buildingPodiumBases", {
      x: transform.x,
      y: groundY + height / 2,
      z: transform.z,
      sx: Math.max(width * 1.24, width + 0.028),
      sy: height,
      sz: Math.max(depth * 1.22, depth + 0.026),
      ry: angle,
      color: 0xa7a49a
    });
  }

  for (let i = 0; i < plan.pitchedRoofPlaneCount; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const offset = rotatedOffset(angle, side * width * 0.18, 0);
    add("buildingPitchedRoofPlanes", {
      x: transform.x + offset.x,
      y: topY + 0.018 + i * 0.001,
      z: transform.z + offset.z,
      sx: Math.max(0.018, width * 0.58),
      sy: 0.032,
      sz: Math.max(0.018, depth * 1.02),
      ry: angle + side * 0.08,
      color: roofColor(type, { damage: 0, foundationRisk: 0 }, seed + i, seed - i, seed + 17)
    });
  }

  for (let i = 0; i < plan.balconyRailCount; i += 1) {
    const t = (i + 1) / (plan.balconyRailCount + 1);
    add("buildingBalconyRails", {
      x: transform.x + front.x,
      y: groundY + transform.sy * Math.max(0.24, Math.min(0.9, t)),
      z: transform.z + front.z,
      sx: Math.max(0.024, width * 0.62),
      sy: 0.008,
      sz: 0.008,
      ry: angle,
      color: 0xd8d1bd
    });
  }

  for (let i = 0; i < plan.serviceYardCount; i += 1) {
    add("buildingServiceYards", {
      x: transform.x + back.x,
      y: groundY + 0.006,
      z: transform.z + back.z,
      sx: Math.max(0.045, width * 0.86),
      sy: 0.012,
      sz: Math.max(0.036, depth * 0.42),
      ry: angle,
      color: 0x6d706c
    });
  }

  for (let i = 0; i < plan.serviceDropoffCount; i += 1) {
    add("buildingServiceDropoffs", {
      x: transform.x + front.x,
      y: groundY + 0.008,
      z: transform.z + front.z,
      sx: Math.max(0.05, width * 0.52),
      sy: 0.014,
      sz: 0.04,
      ry: angle,
      color: 0xd7d0b7
    });
  }

  for (let i = 0; i < plan.coolingPlantCount; i += 1) {
    const lateral = (i - (plan.coolingPlantCount - 1) / 2) * Math.max(0.018, width * 0.12);
    const offset = rotatedOffset(angle, lateral, -depth * 0.22);
    add("buildingCoolingPlants", {
      x: transform.x + offset.x,
      y: topY + 0.025,
      z: transform.z + offset.z,
      sx: Math.max(0.014, width * 0.1),
      sy: 0.05,
      sz: Math.max(0.012, depth * 0.16),
      ry: angle + (hash01(seed, i, seed + 47) - 0.5) * 0.24,
      color: 0x91a8ad
    });
  }

  for (let i = 0; i < plan.mechanicalScreenCount; i += 1) {
    const side = i % 2 === 0 ? left : right;
    add("buildingMechanicalScreens", {
      x: transform.x + side.x,
      y: topY + 0.022,
      z: transform.z + side.z,
      sx: 0.01,
      sy: 0.045,
      sz: Math.max(0.022, depth * 0.66),
      ry: angle,
      color: 0x87949a
    });
  }

  for (let i = 0; i < plan.facadeServiceSlotCount; i += 1) {
    const side = i % 2 === 0 ? left : right;
    add("buildingFacadeServiceSlots", {
      x: transform.x + side.x,
      y: transform.y,
      z: transform.z + side.z,
      sx: 0.008,
      sy: Math.max(0.04, transform.sy * 0.72),
      sz: Math.max(0.012, depth * 0.18),
      ry: angle,
      color: 0x4f6268
    });
  }

  return result;
}

function pushFacadeBands(bucket, transform, width, depth, angle, type = "custom") {
  const profile = buildingFacadeProfile(type);
  const bandCount = transform.sy > 0.22 ? 5 : transform.sy > 0.1 ? 3 : 2;
  const front = rotatedOffset(angle, 0, depth / 2 + 0.004);
  for (let b = 1; b <= bandCount; b += 1) {
    const t = b / (bandCount + 1);
    bucket.push({
      x: transform.x + front.x,
      y: transform.y - transform.sy / 2 + transform.sy * t,
      z: transform.z + front.z,
      sx: width * 0.82,
      sy: Math.max(0.006, transform.sy * 0.015),
      sz: 0.006,
      ry: angle,
      color: profile.band || 0x607b8a
    });
  }
}

function pushBuildingDiagnosticLayers(buckets, transform, state, width, depth, angle, groundY, cell, remainingBudget = Infinity) {
  const damage = clamp01(state.damage);
  const foundationRisk = clamp01(state.foundationRisk);
  const recoveryPressure = clamp01(state.recoveryPressure);
  let added = 0;
  let skipped = 0;
  if (damage > 0.015) {
    if (added < remainingBudget) {
      buckets.buildingDamageOverlays.push({
        x: transform.x,
        y: transform.y + transform.sy * 0.015,
        z: transform.z,
        sx: width * (1.03 + damage * 0.18),
        sy: transform.sy * (0.88 + damage * 0.12),
        sz: depth * (1.03 + damage * 0.18),
        ry: angle,
        color: buildingDamageDiagnosticColor(damage, state)
      });
      added += 1;
    } else {
      skipped += 1;
    }
  }
  if (foundationRisk > 0.025) {
    if (added < remainingBudget) {
      buckets.foundationRiskSkirts.push({
        x: transform.x,
        y: groundY + Math.max(0.006, cell * 0.012),
        z: transform.z,
        sx: width * (1.12 + foundationRisk * 0.42),
        sy: Math.max(0.008, cell * (0.018 + foundationRisk * 0.018)),
        sz: depth * (1.12 + foundationRisk * 0.42),
        ry: angle,
        color: buildingFoundationRiskColor(foundationRisk)
      });
      added += 1;
    } else {
      skipped += 1;
    }
  }
  if (recoveryPressure > 0.08) {
    if (added < remainingBudget) {
      const beaconHeight = Math.max(0.035, transform.sy * (0.18 + recoveryPressure * 0.32));
      const radius = Math.max(0.012, Math.min(width, depth) * (0.08 + recoveryPressure * 0.06));
      buckets.recoveryBeacons.push({
        x: transform.x,
        y: transform.y + transform.sy / 2 + beaconHeight / 2 + Math.max(0.018, cell * 0.025),
        z: transform.z,
        sx: radius,
        sy: beaconHeight,
        sz: radius,
        ry: angle,
        color: buildingRecoveryPressureColor(recoveryPressure)
      });
      added += 1;
    } else {
      skipped += 1;
    }
  }
  return { added, skipped };
}

function buildingFoundationRisk(model, index) {
  const volume = model?.subsurface;
  const columnIndex = subsurfaceColumnIndexForRenderer(model, index);
  if (!volume || columnIndex < 0) return 0;
  return clamp01(
    (volume.columnEngineeringRisk?.[columnIndex] ?? 0) * 0.72 +
      (volume.columnLiquefactionRisk?.[columnIndex] ?? 0) * 0.22 +
      (volume.columnFractureRisk?.[columnIndex] ?? 0) * 0.16
  );
}

function buildingDamageDiagnosticColor(damage, state) {
  const color = new THREE.Color(0x9f7660);
  color.lerp(new THREE.Color(0xdf725f), Math.min(0.72, damage * 0.78));
  if (state.flood > 0.42) color.lerp(new THREE.Color(0x6aa9ba), Math.min(0.24, state.flood * 0.18));
  if (state.wildfire > 0.42) color.lerp(new THREE.Color(0x7a4c3f), Math.min(0.32, state.wildfire * 0.24));
  if (state.landslide > 0.42) color.lerp(new THREE.Color(0x8b7058), Math.min(0.28, state.landslide * 0.22));
  return color.getHex();
}

function buildingFoundationRiskColor(risk) {
  const color = new THREE.Color(0xb88652);
  color.lerp(new THREE.Color(0xf0c96d), Math.min(0.6, risk * 0.48));
  color.lerp(new THREE.Color(0xc95e55), Math.max(0, risk - 0.5) * 0.85);
  return color.getHex();
}

function buildingRecoveryPressureColor(pressure) {
  const color = new THREE.Color(0xd3a84f);
  color.lerp(new THREE.Color(0xffdf76), Math.min(0.7, pressure * 0.62));
  color.lerp(new THREE.Color(0xf08d5b), Math.max(0, pressure - 0.58) * 0.72);
  return color.getHex();
}

function block3DControls(params = {}) {
  const allowedModes = new Set(["microzones", "service", "environment", "linkage", "recommendation", "adaptive-plan"]);
  const mode = String(params.block3DMode || params.mode || "microzones");
  const focus = String(params.block3DFocus || params.focus || "all");
  const rawScale = Number(params.block3DScale ?? params.scale ?? 1);
  const rawRecommendationRanks = Number(params.block3DRecommendationRanks ?? params.recommendationRanks ?? 1);
  const rawRecommendationMinScore = Number(params.block3DRecommendationMinScore ?? params.recommendationMinScore ?? 0.5);
  const rawAdaptivePlanLimit = Number(params.block3DAdaptivePlanLimit ?? params.adaptivePlanLimit ?? 48);
  const adaptivePlanPhaseStep = String(params.block3DAdaptivePlanPhaseStep ?? params.adaptivePlanPhaseStep ?? "all");
  const rawAdaptivePlanPhaseMode = String(params.block3DAdaptivePlanPhaseMode ?? params.adaptivePlanPhaseMode ?? "current");
  const adaptivePlanPhaseMode = rawAdaptivePlanPhaseMode === "cumulative" ? "cumulative" : "current";
  return {
    enabled: params.block3DEnabled !== false && params.enabled !== false,
    mode: allowedModes.has(mode) ? mode : "microzones",
    focus: focus || "all",
    scale: Math.min(3, Math.max(0.5, Number.isFinite(rawScale) ? rawScale : 1)),
    recommendationRanks: Math.min(3, Math.max(1, Number.isFinite(rawRecommendationRanks) ? Math.round(rawRecommendationRanks) : 1)),
    recommendationMinScore: Math.min(1, Math.max(0, Number.isFinite(rawRecommendationMinScore) ? rawRecommendationMinScore : 0.5)),
    adaptivePlanLimit: Math.min(128, Math.max(1, Number.isFinite(rawAdaptivePlanLimit) ? Math.round(rawAdaptivePlanLimit) : 48)),
    adaptivePlanPhaseStep: adaptivePlanPhaseStep || "all",
    adaptivePlanPhaseMode
  };
}

function emptyBlockMicrozoneDetailPlan(error = "", controls = block3DControls()) {
  return {
    mode: "block-microzone-anchor-diagnostics",
    usedDetailInstances: 0,
    anchorMarkerCount: 0,
    shelfMarkerCount: 0,
    blueCorridorMarkerCount: 0,
    ridgeMarkerCount: 0,
    hazardBufferMarkerCount: 0,
    recommendationMarkerCount: 0,
    recommendationFootprintCount: 0,
    adaptivePlanMarkerCount: 0,
    adaptivePlanFootprintCount: 0,
    adaptivePlanLinkCount: 0,
    adaptivePlanSubsurfaceWarningCount: 0,
    meanAnchorConfidence: 0,
    roleMarkerCounts: {
      "buildable-shelf-microzone": 0,
      "blue-corridor-microzone": 0,
      "ridge-crest-microzone": 0,
      "hazard-buffer-microzone": 0,
      "facility-tissue-microzone": 0
    },
    linkedStateCounts: {},
    serviceOverloadClassCounts: {},
    environmentalZoneCounts: {},
    visibleMarkerCount: 0,
    visibleRoleMarkerCounts: {},
    visibleLinkedStateCounts: {},
    visibleServiceOverloadClassCounts: {},
    visibleEnvironmentalZoneCounts: {},
    visibleServiceGapBlockCount: 0,
    visibleRecommendationMarkerCount: 0,
    visibleRecommendationFootprintCount: 0,
    visibleRecommendationTypeCounts: {},
    visibleRecommendationServiceClassCounts: {},
    visibleRecommendationSuitabilityClassCounts: {},
    visibleRecommendationRankCounts: {},
    meanVisibleRecommendationSuitability: 0,
    minVisibleRecommendationSuitability: 0,
    maxVisibleRecommendationSuitability: 0,
    maxVisibleRecommendationRank: 0,
    candidateRecommendationCount: 0,
    filteredRecommendationCandidateCount: 0,
    visibleAdaptivePlanMarkerCount: 0,
    visibleAdaptivePlanFootprintCount: 0,
    visibleAdaptivePlanLinkCount: 0,
    visibleAdaptivePlanSubsurfaceWarningCount: 0,
    visibleAdaptivePlanTypeCounts: {},
    visibleAdaptivePlanServiceClassCounts: {},
    visibleAdaptivePlanEcosystemRoleCounts: {},
    visibleAdaptivePlanGeometryCounts: {},
    visibleAdaptivePlanLinkTypeCounts: {},
    visibleAdaptivePlanPhaseCounts: {},
    visibleAdaptivePlanDependencyClassCounts: {},
    visibleAdaptivePlanScheduleBandCounts: {},
    visibleAdaptivePlanSubsurfaceConstraintClassCounts: {},
    visibleAdaptivePlanSubsurfaceConstraintReasons: [],
    visibleAdaptivePlanCumulativeFeatureCount: 0,
    adaptivePlanFeatureCount: 0,
    adaptivePlanCandidateRowCount: 0,
    adaptivePlanEcosystemLinkCount: 0,
    adaptivePlanEcosystemConnectivityIndex: 0,
    meanAdaptivePlanSuitabilityScore: 0,
    meanAdaptivePlanPlacementFitScore: 0,
    meanAdaptivePlanAdaptationNeed: 0,
    meanAdaptivePlanImplementationPriority: 0,
    meanAdaptivePlanScheduleStartMonth: 0,
    meanAdaptivePlanScheduleEndMonth: 0,
    meanAdaptivePlanLinkDistanceKm: 0,
    meanAdaptivePlanSubsurfaceConstraintScore: 0,
    visualLayerStatus: controls.enabled ? "empty" : "disabled",
    controls,
    atlasBlockCount: 0,
    sampledBlockCount: 0,
    atlasBuildMs: 0,
    atlasCacheHit: false,
    facilityTypeSampleCount: 0,
    facilityTypeSamplingMode: "none",
    error
  };
}

function createBlockMicrozoneBuckets() {
  return {
    blockMicrozoneAnchors: [],
    blockMicrozoneShelves: [],
    blockMicrozoneBlueCorridors: [],
    blockMicrozoneRidges: [],
    blockMicrozoneHazardBuffers: [],
    blockRecommendationMarkers: [],
    blockRecommendationFootprints: [],
    adaptivePlanMarkers: [],
    adaptivePlanFootprints: [],
    adaptivePlanLinks: [],
    adaptivePlanSubsurfaceWarnings: []
  };
}

function addBlockMicrozoneInstancedLayers(group, buckets) {
  addInstancedBox(group, "设施方案落位占地", buckets.adaptivePlanFootprints || [], 0x8fcf98, { roughness: 0.64, metalness: 0.04, transparent: true, opacity: 0.52, emissiveIntensity: 0.2 });
  addInstancedTorus(group, "设施方案地下约束警戒", buckets.adaptivePlanSubsurfaceWarnings || [], 0xf08a5d);
  addInstancedCylinder(group, "设施方案落位节点", buckets.adaptivePlanMarkers || [], 0x8fcf98, { radiusSegments: 8, roughness: 0.42, metalness: 0.08, transparent: true, opacity: 0.92, emissiveIntensity: 0.5 });
  addInstancedBox(group, "设施方案生态联动边", buckets.adaptivePlanLinks || [], 0x7bc6d8, { roughness: 0.42, metalness: 0.08, transparent: true, opacity: 0.78, emissiveIntensity: 0.48 });
  addInstancedCylinder(group, "区块微分区设施锚点", buckets.blockMicrozoneAnchors || [], 0xf0d783, { radiusSegments: 8, roughness: 0.48, metalness: 0.08, transparent: true, opacity: 0.86, emissiveIntensity: 0.32 });
  addInstancedBox(group, "区块稳定台地微分区", buckets.blockMicrozoneShelves || [], 0xd6c78e, { roughness: 0.82, metalness: 0.01, transparent: true, opacity: 0.52 });
  addInstancedBox(group, "区块蓝廊微分区", buckets.blockMicrozoneBlueCorridors || [], 0x4faec7, { roughness: 0.42, metalness: 0.02, transparent: true, opacity: 0.56, emissiveIntensity: 0.22 });
  addInstancedBox(group, "区块山脊微分区", buckets.blockMicrozoneRidges || [], 0xb7b0a0, { roughness: 0.9, metalness: 0.01, transparent: true, opacity: 0.5 });
  addInstancedBox(group, "区块风险缓冲微分区", buckets.blockMicrozoneHazardBuffers || [], 0xd98767, { roughness: 0.78, metalness: 0.02, transparent: true, opacity: 0.48, emissiveIntensity: 0.18 });
  addInstancedBox(group, "区块推荐设施占地预览", buckets.blockRecommendationFootprints || [], 0x75c7a1, { roughness: 0.7, metalness: 0.02, transparent: true, opacity: 0.44, emissiveIntensity: 0.18 });
  addInstancedCylinder(group, "区块推荐设施预览标记", buckets.blockRecommendationMarkers || [], 0x75c7a1, { radiusSegments: 6, roughness: 0.46, metalness: 0.06, transparent: true, opacity: 0.88, emissiveIntensity: 0.44 });
}

function pushBlockMicrozoneDetailLayers(buckets, model, params = {}, verticalScale = 1, runtime = {}) {
  const controls = block3DControls(params);
  const plan = emptyBlockMicrozoneDetailPlan("", controls);
  if (!controls.enabled) return plan;
  if (!model?.height?.length || !buckets) return plan;
  if (controls.mode === "adaptive-plan") {
    return pushAdaptiveInfrastructurePlan3DLayers(buckets, model, params, verticalScale, controls, plan);
  }
  let atlas = null;
  const quality = runtime.quality || params.renderDetailQuality || "ultra";
  const facilityTypes = block3DRendererFacilityTypes(quality);
  const typeSignature = facilityTypes?.join("|") || "all";
  const cacheKey = [
    controls.mode,
    controls.recommendationRanks,
    quality,
    typeSignature,
    model.hazards?.currentYear ?? params.currentYear ?? 0,
    model.infrastructureInfluence?.appliedFeatureCount ?? 0,
    roundDiagnostic(model.stats?.maxElevation ?? 0)
  ].join(":");
  const modelCache = runtime.cache?.get(model) || new Map();
  const atlasStart = performance.now();
  try {
    atlas = modelCache.get(cacheKey) || null;
    plan.atlasCacheHit = Boolean(atlas);
    if (!atlas) {
      const topFacilityCount = Math.max(4, controls.recommendationRanks + 1);
      atlas = buildBlockDetailAtlas(model, params, {
        topFacilityCount,
        includeNeighborIds: false,
        includeAggregations: false,
        compactMatrixRows: true,
        maxMatrixRowsPerBlock: topFacilityCount,
        types: facilityTypes || undefined
      });
      modelCache.set(cacheKey, atlas);
      runtime.cache?.set(model, modelCache);
    }
  } catch (error) {
    return emptyBlockMicrozoneDetailPlan(error?.message || String(error), controls);
  }
  plan.atlasBuildMs = roundDiagnostic(performance.now() - atlasStart);
  plan.facilityTypeSampleCount = facilityTypes?.length || Object.keys(INFRASTRUCTURE_CODE_TYPES).length - 1;
  plan.facilityTypeSamplingMode = facilityTypes ? `representative-${quality}` : "all-facility-types";
  const rows = atlas?.rows || [];
  const maxRows = Math.max(96, Math.min(2200, rows.length));
  const stride = Math.max(1, Math.ceil(rows.length / maxRows));
  let confidenceSum = 0;
  let anchorCount = 0;
  let recommendationSuitabilitySum = 0;
  let recommendationCount = 0;
  let recommendationSuitabilityMin = Infinity;
  let recommendationSuitabilityMax = 0;
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += stride) {
    const row = rows[rowIndex];
    const anchor = row?.subcell?.facilityAnchor;
    if (!anchor) continue;
    plan.sampledBlockCount += 1;
    const blockInfo = block3DRowInfo(row);
    incrementRendererCount(plan.linkedStateCounts, blockInfo.linkedState, 1);
    incrementRendererCount(plan.serviceOverloadClassCounts, blockInfo.serviceOverloadClass, 1);
    incrementRendererCount(plan.environmentalZoneCounts, blockInfo.environmentalZoneClass, 1);
    if (controls.mode === "recommendation") {
      const pool = block3DRecommendationCandidatePool(row, controls);
      plan.candidateRecommendationCount += pool.candidateCount;
      plan.filteredRecommendationCandidateCount += pool.filteredCount;
      if (!pool.visibleCandidates.length) continue;
      let hasVisibleRecommendationInBlock = false;
      const cell = model.cellSizeKm || modelSizeKm(model) / Math.max(1, (model.n || 1) - 1);
      for (const entry of pool.visibleCandidates) {
        const candidate = entry.candidate;
        const rank = entry.rank;
        const score = clamp01(candidate.suitabilityScore);
        const markerColor = block3DRecommendationColor(candidate);
        const rankScale = Math.max(0.68, 1 - (rank - 1) * 0.11);
        const markerScale = controls.scale * rankScale;
        const offset = block3DRecommendationRankOffset(rank, row.block_x, row.block_y, cell);
        const sizeKm = modelSizeKm(model);
        const xKm = Math.min(sizeKm, Math.max(0, Number(anchor.xKm) + offset.xKm));
        const yKm = Math.min(sizeKm, Math.max(0, Number(anchor.yKm) + offset.yKm));
        const marker = blockMicrozoneTransformFromKm(model, xKm, yKm, verticalScale, {
          sx: (0.045 + score * 0.045) * markerScale,
          sy: (0.16 + score * 0.24) * markerScale,
          sz: (0.045 + score * 0.045) * markerScale,
          lift: 0.12 + score * 0.04 + (rank - 1) * 0.016,
          ry: blockMicrozoneRoleAngle(candidate.serviceClass || candidate.facilityType, row.block_x + rank * 11, row.block_y + rank * 17),
          color: markerColor
        });
        const footprint = blockMicrozoneTransformFromKm(model, xKm, yKm, verticalScale, {
          sx: (0.16 + score * 0.14) * markerScale,
          sy: 0.012 * markerScale,
          sz: (0.13 + score * 0.12) * markerScale,
          lift: 0.032 + (rank - 1) * 0.004,
          ry: blockMicrozoneRoleAngle(candidate.serviceClass || candidate.facilityType, row.block_x + rank * 11, row.block_y + rank * 17),
          color: markerColor
        });
        if (marker) buckets.blockRecommendationMarkers.push(marker);
        if (footprint) buckets.blockRecommendationFootprints.push(footprint);
        if (marker) {
          hasVisibleRecommendationInBlock = true;
          recommendationSuitabilitySum += score;
          recommendationSuitabilityMin = Math.min(recommendationSuitabilityMin, score);
          recommendationSuitabilityMax = Math.max(recommendationSuitabilityMax, score);
          recommendationCount += 1;
          plan.maxVisibleRecommendationRank = Math.max(plan.maxVisibleRecommendationRank, rank);
          incrementRendererCount(plan.visibleRecommendationRankCounts, `rank-${rank}`, 1);
          incrementRendererCount(plan.visibleRecommendationTypeCounts, candidate.facilityType || "custom", 1);
          incrementRendererCount(plan.visibleRecommendationServiceClassCounts, candidate.serviceClass || "custom-service", 1);
          incrementRendererCount(plan.visibleRecommendationSuitabilityClassCounts, candidate.suitabilityClass || "unclassified", 1);
          incrementRendererCount(plan.visibleLinkedStateCounts, blockInfo.linkedState, 1);
          incrementRendererCount(plan.visibleServiceOverloadClassCounts, blockInfo.serviceOverloadClass, 1);
          incrementRendererCount(plan.visibleEnvironmentalZoneCounts, blockInfo.environmentalZoneClass, 1);
        }
      }
      if (hasVisibleRecommendationInBlock && blockInfo.hasServiceGap) plan.visibleServiceGapBlockCount += 1;
      continue;
    }
    if (!block3DRowVisible(blockInfo, controls)) continue;
    const markerScale = controls.scale;
    const anchorTransform = blockMicrozoneTransformFromKm(model, anchor.xKm, anchor.yKm, verticalScale, {
      sx: (0.05 + clamp01(anchor.confidence) * 0.05) * markerScale,
      sy: (0.08 + clamp01(anchor.confidence) * 0.16) * markerScale,
      sz: (0.05 + clamp01(anchor.confidence) * 0.05) * markerScale,
      lift: 0.075,
      color: block3DMarkerColor(blockInfo, anchor.anchorRole, controls)
    });
    const showAnchor = controls.mode !== "microzones" || block3DMicrozoneRoleVisible(anchor.anchorRole, controls);
    if (anchorTransform && showAnchor) {
      buckets.blockMicrozoneAnchors.push(anchorTransform);
      confidenceSum += clamp01(anchor.confidence);
      anchorCount += 1;
      incrementRendererCount(plan.roleMarkerCounts, anchor.anchorRole || "anchor-microzone", 1);
      incrementRendererCount(plan.visibleRoleMarkerCounts, anchor.anchorRole || "anchor-microzone", 1);
      incrementRendererCount(plan.visibleLinkedStateCounts, blockInfo.linkedState, 1);
      incrementRendererCount(plan.visibleServiceOverloadClassCounts, blockInfo.serviceOverloadClass, 1);
      incrementRendererCount(plan.visibleEnvironmentalZoneCounts, blockInfo.environmentalZoneClass, 1);
      if (blockInfo.hasServiceGap) plan.visibleServiceGapBlockCount += 1;
    }
    if (controls.mode !== "microzones") continue;
    for (const role of ["buildable-shelf-microzone", "blue-corridor-microzone", "ridge-crest-microzone", "hazard-buffer-microzone"]) {
      if (!block3DMicrozoneRoleVisible(role, controls)) continue;
      const zone = blockMicrozoneBestRoleZone(row.subcell?.subzones, role);
      if (!zone) continue;
      const transform = blockMicrozoneTransformFromKm(model, zone.centerXKm, zone.centerYKm, verticalScale, {
        sx: Math.max(0.08, Math.sqrt(Math.max(0.001, Number(zone.areaKm2) || 0.001)) * 0.16) * markerScale,
        sy: (0.012 + clamp01(zone.facilitySuitabilityScore) * 0.016) * markerScale,
        sz: Math.max(0.08, Math.sqrt(Math.max(0.001, Number(zone.areaKm2) || 0.001)) * 0.12) * markerScale,
        lift: 0.028,
        color: blockMicrozoneRoleColor(role),
        ry: blockMicrozoneRoleAngle(role, row.block_x, row.block_y)
      });
      if (!transform) continue;
      incrementRendererCount(plan.roleMarkerCounts, role, 1);
      incrementRendererCount(plan.visibleRoleMarkerCounts, role, 1);
      if (role === "buildable-shelf-microzone") buckets.blockMicrozoneShelves.push(transform);
      if (role === "blue-corridor-microzone") buckets.blockMicrozoneBlueCorridors.push(transform);
      if (role === "ridge-crest-microzone") buckets.blockMicrozoneRidges.push(transform);
      if (role === "hazard-buffer-microzone") buckets.blockMicrozoneHazardBuffers.push(transform);
    }
  }
  plan.anchorMarkerCount = buckets.blockMicrozoneAnchors?.length || 0;
  plan.shelfMarkerCount = buckets.blockMicrozoneShelves?.length || 0;
  plan.blueCorridorMarkerCount = buckets.blockMicrozoneBlueCorridors?.length || 0;
  plan.ridgeMarkerCount = buckets.blockMicrozoneRidges?.length || 0;
  plan.hazardBufferMarkerCount = buckets.blockMicrozoneHazardBuffers?.length || 0;
  plan.recommendationMarkerCount = buckets.blockRecommendationMarkers?.length || 0;
  plan.recommendationFootprintCount = buckets.blockRecommendationFootprints?.length || 0;
  plan.usedDetailInstances =
    plan.anchorMarkerCount +
    plan.shelfMarkerCount +
    plan.blueCorridorMarkerCount +
    plan.ridgeMarkerCount +
    plan.hazardBufferMarkerCount +
    plan.recommendationMarkerCount +
    plan.recommendationFootprintCount;
  plan.visibleMarkerCount = plan.usedDetailInstances;
  plan.visibleRecommendationMarkerCount = plan.recommendationMarkerCount;
  plan.visibleRecommendationFootprintCount = plan.recommendationFootprintCount;
  plan.meanVisibleRecommendationSuitability = roundDiagnostic(recommendationSuitabilitySum / Math.max(1, recommendationCount));
  plan.minVisibleRecommendationSuitability = recommendationCount > 0 ? roundDiagnostic(recommendationSuitabilityMin) : 0;
  plan.maxVisibleRecommendationSuitability = recommendationCount > 0 ? roundDiagnostic(recommendationSuitabilityMax) : 0;
  plan.meanAnchorConfidence = roundDiagnostic(confidenceSum / Math.max(1, anchorCount));
  plan.atlasBlockCount = atlas?.summary?.blockCount || rows.length;
  plan.visualLayerStatus = plan.usedDetailInstances > 0 ? "ready" : "filtered-empty";
  return plan;
}

function pushAdaptiveInfrastructurePlan3DLayers(buckets, model, params, verticalScale, controls, plan) {
  let report = null;
  try {
    const planOptions = {
      maxFeatures: controls.adaptivePlanLimit,
      minScore: controls.recommendationMinScore,
      rankDepth: Math.max(3, controls.recommendationRanks + 1),
      minBlockSpacing: 1
    };
    if (!block3DAdaptivePlanUsesScenicDefaults(params)) {
      planOptions.ecosystemMode = "adaptive-block";
    }
    report = buildAdaptiveInfrastructurePlacementPlan(model, params, planOptions);
  } catch (error) {
    return emptyBlockMicrozoneDetailPlan(error?.message || String(error), controls);
  }

  const rows = report?.planRows || [];
  const visibleRows = rows.filter((row) => block3DAdaptivePlanRowVisible(row, controls));
  const visiblePlanIds = new Set(visibleRows.map((row) => String(row.plan_id || "")));
  let suitabilitySum = 0;
  let placementFitSum = 0;
  let adaptationNeedSum = 0;
  let implementationPrioritySum = 0;
  let subsurfaceConstraintSum = 0;
  let scheduleStartSum = 0;
  let scheduleEndSum = 0;
  let visibleCumulativeFeatureCount = 0;
  const subsurfaceReasonSet = new Set();
  const markerBaseScale = controls.scale;

  plan.adaptivePlanFeatureCount = report?.summary?.featureCount || rows.length;
  plan.adaptivePlanCandidateRowCount = report?.summary?.candidateRowCount || 0;
  plan.adaptivePlanEcosystemConnectivityIndex = report?.summary?.ecosystemConnectivityIndex || 0;

  for (const row of visibleRows) {
    const score = clamp01(row.placement_fit_score ?? row.suitability_score);
    const suitability = clamp01(row.suitability_score);
    const adaptationNeed = clamp01(row.adaptation_need);
    const subsurfaceConstraintScore = clamp01(row.subsurface_constraint_score ?? 1);
    const xKm = firstFiniteNumber(row.subzone_center_x_km, row.center_x_km);
    const yKm = firstFiniteNumber(row.subzone_center_y_km, row.center_y_km);
    if (!Number.isFinite(xKm) || !Number.isFinite(yKm)) continue;
    const markerColor = block3DAdaptivePlanColor(row);
    const footprintColor = block3DAdaptivePlanPhaseColor(row.implementation_phase, markerColor);
    const dimensions = block3DAdaptivePlanFootprintDimensions(row, markerBaseScale);
    const angle = blockMicrozoneRoleAngle(row.ecosystem_role || row.service_class || row.facility_type, row.block_x, row.block_y);
    const marker = blockMicrozoneTransformFromKm(model, xKm, yKm, verticalScale, {
      sx: (0.055 + score * 0.055) * markerBaseScale,
      sy: (0.18 + score * 0.3) * markerBaseScale,
      sz: (0.055 + score * 0.055) * markerBaseScale,
      lift: 0.16 + score * 0.05,
      ry: angle,
      color: markerColor
    });
    const footprint = blockMicrozoneTransformFromKm(model, xKm, yKm, verticalScale, {
      sx: dimensions.sx,
      sy: 0.018 * markerBaseScale,
      sz: dimensions.sz,
      lift: 0.04,
      ry: angle,
      color: footprintColor
    });
    const warning = block3DAdaptivePlanSubsurfaceWarningTransform(model, xKm, yKm, row, dimensions, verticalScale, markerBaseScale, angle);
    if (marker) buckets.adaptivePlanMarkers.push(marker);
    if (footprint) buckets.adaptivePlanFootprints.push(footprint);
    if (warning) buckets.adaptivePlanSubsurfaceWarnings.push(warning);
    if (!marker) continue;
    suitabilitySum += suitability;
    placementFitSum += score;
    adaptationNeedSum += adaptationNeed;
    implementationPrioritySum += clamp01(row.implementation_priority_score);
    subsurfaceConstraintSum += subsurfaceConstraintScore;
    scheduleStartSum += Math.max(0, Number(row.implementation_start_month) || 0);
    scheduleEndSum += Math.max(0, Number(row.implementation_end_month) || 0);
    visibleCumulativeFeatureCount = Math.max(visibleCumulativeFeatureCount, Math.round(Number(row.implementation_cumulative_feature_count) || 0));
    incrementRendererCount(plan.visibleAdaptivePlanTypeCounts, row.facility_type || "custom", 1);
    incrementRendererCount(plan.visibleAdaptivePlanServiceClassCounts, row.service_class || "custom-service", 1);
    incrementRendererCount(plan.visibleAdaptivePlanEcosystemRoleCounts, row.ecosystem_role || row.service_class || "unclassified-role", 1);
    incrementRendererCount(plan.visibleAdaptivePlanGeometryCounts, row.geometry_type || "Unknown", 1);
    incrementRendererCount(plan.visibleAdaptivePlanPhaseCounts, row.implementation_phase || "unphased", 1);
    incrementRendererCount(plan.visibleAdaptivePlanDependencyClassCounts, row.implementation_dependency_class || "unclassified-dependency", 1);
    incrementRendererCount(plan.visibleAdaptivePlanScheduleBandCounts, row.implementation_schedule_band || "unscheduled", 1);
    incrementRendererCount(plan.visibleAdaptivePlanSubsurfaceConstraintClassCounts, row.subsurface_constraint_class || "subsurface-unclassified", 1);
    for (const reason of String(row.subsurface_constraint_reasons || "").split("|")) {
      if (reason) subsurfaceReasonSet.add(reason);
    }
  }

  const nodeById = new Map((report?.ecosystemNetwork?.nodes || []).map((node) => [String(node.node_id || ""), node]));
  let linkDistanceSum = 0;
  for (const edge of report?.ecosystemNetwork?.edges || []) {
    const from = nodeById.get(String(edge.from_node_id || ""));
    const to = nodeById.get(String(edge.to_node_id || ""));
    if (!from || !to) continue;
    if (visiblePlanIds.size && (!visiblePlanIds.has(String(from.plan_id || "")) || !visiblePlanIds.has(String(to.plan_id || "")))) continue;
    const transform = block3DAdaptivePlanLinkTransform(model, from, to, edge, verticalScale, controls.scale);
    if (!transform) continue;
    buckets.adaptivePlanLinks.push(transform);
    linkDistanceSum += Number(edge.distance_km) || 0;
    incrementRendererCount(plan.visibleAdaptivePlanLinkTypeCounts, edge.edge_type || "local-support-link", 1);
  }

  plan.adaptivePlanMarkerCount = buckets.adaptivePlanMarkers?.length || 0;
  plan.adaptivePlanFootprintCount = buckets.adaptivePlanFootprints?.length || 0;
  plan.adaptivePlanLinkCount = buckets.adaptivePlanLinks?.length || 0;
  plan.adaptivePlanSubsurfaceWarningCount = buckets.adaptivePlanSubsurfaceWarnings?.length || 0;
  plan.visibleAdaptivePlanMarkerCount = plan.adaptivePlanMarkerCount;
  plan.visibleAdaptivePlanFootprintCount = plan.adaptivePlanFootprintCount;
  plan.visibleAdaptivePlanLinkCount = plan.adaptivePlanLinkCount;
  plan.visibleAdaptivePlanSubsurfaceWarningCount = plan.adaptivePlanSubsurfaceWarningCount;
  plan.adaptivePlanEcosystemLinkCount = report?.ecosystemNetwork?.edgeCount || report?.ecosystemNetwork?.edges?.length || 0;
  plan.meanAdaptivePlanSuitabilityScore = roundDiagnostic(suitabilitySum / Math.max(1, plan.visibleAdaptivePlanMarkerCount));
  plan.meanAdaptivePlanPlacementFitScore = roundDiagnostic(placementFitSum / Math.max(1, plan.visibleAdaptivePlanMarkerCount));
  plan.meanAdaptivePlanAdaptationNeed = roundDiagnostic(adaptationNeedSum / Math.max(1, plan.visibleAdaptivePlanMarkerCount));
  plan.meanAdaptivePlanImplementationPriority = roundDiagnostic(implementationPrioritySum / Math.max(1, plan.visibleAdaptivePlanMarkerCount));
  plan.meanAdaptivePlanScheduleStartMonth = roundDiagnostic(scheduleStartSum / Math.max(1, plan.visibleAdaptivePlanMarkerCount));
  plan.meanAdaptivePlanScheduleEndMonth = roundDiagnostic(scheduleEndSum / Math.max(1, plan.visibleAdaptivePlanMarkerCount));
  plan.meanAdaptivePlanSubsurfaceConstraintScore = roundDiagnostic(subsurfaceConstraintSum / Math.max(1, plan.visibleAdaptivePlanMarkerCount));
  plan.visibleAdaptivePlanSubsurfaceConstraintReasons = Array.from(subsurfaceReasonSet).sort();
  plan.visibleAdaptivePlanCumulativeFeatureCount = visibleCumulativeFeatureCount;
  plan.meanAdaptivePlanLinkDistanceKm = roundDiagnostic(linkDistanceSum / Math.max(1, plan.visibleAdaptivePlanLinkCount));
  plan.usedDetailInstances = plan.adaptivePlanMarkerCount + plan.adaptivePlanFootprintCount + plan.adaptivePlanLinkCount + plan.adaptivePlanSubsurfaceWarningCount;
  plan.visibleMarkerCount = plan.usedDetailInstances;
  plan.atlasBlockCount = report?.summary?.selectedBlockCount || 0;
  plan.sampledBlockCount = visibleRows.length;
  plan.visualLayerStatus = plan.usedDetailInstances > 0 ? "ready" : "filtered-empty";
  return plan;
}

function block3DAdaptivePlanSubsurfaceWarningTransform(model, xKm, yKm, row, dimensions, verticalScale = 1, scale = 1, angle = 0) {
  const score = clamp01(row.subsurface_constraint_score ?? 1);
  const className = String(row.subsurface_constraint_class || "");
  const reasons = String(row.subsurface_constraint_reasons || "");
  const constrained =
    score < 0.58 ||
    className.includes("avoid") ||
    className.includes("critical") ||
    /aquifer|liquefaction|fracture|engineering-risk|groundwater/.test(reasons);
  if (!constrained) return null;
  const warningStrength = clamp01(1 - score);
  const transform = blockMicrozoneTransformFromKm(model, xKm, yKm, verticalScale, {
    sx: Math.max(dimensions.sx, dimensions.sz) * (1.45 + warningStrength * 0.55),
    sy: Math.max(0.018, 0.028 * scale),
    sz: Math.max(dimensions.sx, dimensions.sz) * (1.45 + warningStrength * 0.55),
    lift: 0.075 + warningStrength * 0.035,
    ry: angle,
    color: block3DAdaptivePlanSubsurfaceWarningColor(score, reasons)
  });
  return transform;
}

function block3DAdaptivePlanSubsurfaceWarningColor(score, reasons = "") {
  if (/liquefaction|critical/.test(reasons) || score < 0.36) return 0xe85d5d;
  if (/aquifer|groundwater/.test(reasons)) return 0xf08a5d;
  if (/fracture|engineering-risk/.test(reasons)) return 0xd99a55;
  return 0xf2b75b;
}

function block3DAdaptivePlanRowVisible(row, controls) {
  if (!block3DAdaptivePlanTimelineVisible(row, controls)) return false;
  const focus = controls?.focus || "all";
  if (focus === "all") return true;
  if (focus === "service-gap") return Boolean(row.matched_service_gap_classes || row.block_service_gap_classes);
  return (
    row.service_class === focus ||
    row.facility_type === focus ||
    row.suitability_class === focus ||
    row.requirement_class === focus ||
    row.build_strategy === focus ||
    row.ecosystem_role === focus ||
    row.implementation_phase === focus ||
    row.implementation_dependency_class === focus ||
    row.linked_subzone_state === focus ||
    row.environmental_zone_class === focus
  );
}

function block3DAdaptivePlanUsesScenicDefaults(params = {}) {
  const scenic = String(params.scenicPreset || "none");
  return scenic && scenic !== "none";
}

function block3DAdaptivePlanTimelineVisible(row, controls) {
  const step = controls?.adaptivePlanPhaseStep || "all";
  if (step === "all") return true;
  const targetOrder = block3DAdaptivePlanPhaseOrder(step);
  const rowOrder = block3DAdaptivePlanPhaseOrder(row.implementation_phase);
  if (!Number.isFinite(targetOrder) || !Number.isFinite(rowOrder)) return true;
  if (controls?.adaptivePlanPhaseMode === "cumulative") return rowOrder <= targetOrder;
  return row.implementation_phase === step;
}

function block3DAdaptivePlanPhaseOrder(phase) {
  if (phase === "phase-1-critical-network") return 1;
  if (phase === "phase-2-service-completion") return 2;
  if (phase === "phase-3-adaptation-buffer") return 3;
  if (phase === "phase-4-monitoring-fill") return 4;
  return Infinity;
}

function block3DAdaptivePlanFootprintDimensions(row, scale = 1) {
  const radius = Math.max(0.08, Math.min(0.48, Number(row.radius_km) || 0.28));
  const lineRadius = Math.max(0.06, Math.min(0.36, Number(row.line_radius_km) || radius * 0.72));
  if (row.geometry_type === "LineString") {
    return {
      sx: radius * 0.62 * scale,
      sz: lineRadius * 0.22 * scale
    };
  }
  if (row.geometry_type === "Polygon") {
    return {
      sx: radius * 0.52 * scale,
      sz: radius * 0.44 * scale
    };
  }
  return {
    sx: radius * 0.34 * scale,
    sz: radius * 0.34 * scale
  };
}

function block3DAdaptivePlanLinkTransform(model, from, to, edge, verticalScale = 1, scale = 1) {
  const a = blockMicrozoneTransformFromKm(model, from.x_km, from.y_km, verticalScale, { lift: 0.22 });
  const b = blockMicrozoneTransformFromKm(model, to.x_km, to.y_km, verticalScale, { lift: 0.22 });
  if (!a || !b) return null;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz);
  if (!Number.isFinite(length) || length < 0.02) return null;
  const strength = clamp01(edge.link_strength ?? 0.55);
  return {
    x: (a.x + b.x) / 2,
    y: Math.max(a.y, b.y) + 0.08 + strength * 0.04,
    z: (a.z + b.z) / 2,
    sx: length,
    sy: Math.max(0.012, 0.018 * scale),
    sz: Math.max(0.012, 0.018 * scale),
    ry: Math.atan2(-dz, dx),
    color: infrastructureEcosystemLinkColor(edge.edge_type || "local-support-link")
  };
}

function block3DAdaptivePlanColor(row) {
  return block3DRecommendationColor({
    serviceClass: row.service_class,
    facilityType: row.facility_type
  });
}

function block3DAdaptivePlanPhaseColor(phase, fallback) {
  if (phase === "phase-1-critical-network") return 0xf0c96d;
  if (phase === "phase-2-service-completion") return 0x77c7a8;
  if (phase === "phase-3-adaptation-buffer") return 0x7fa8d8;
  if (phase === "phase-4-monitoring-fill") return 0xb8b0a0;
  return fallback;
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return NaN;
}

function block3DRowInfo(row) {
  const serviceGapClasses = row?.serviceCoverage?.gapClasses || [];
  const coverageIndex = Number(row?.serviceCoverage?.coverageIndex ?? 1);
  return {
    linkedState: row?.subcell?.microzoneLinkedState || row?.linkage?.stateClass || "unclassified-microzone-state",
    serviceOverloadClass: row?.serviceCoverage?.overloadClass || "unclassified-service",
    environmentalZoneClass: row?.surface?.environmentalZoneClass || "unclassified-zone",
    hasServiceGap: serviceGapClasses.length > 0 || coverageIndex < 0.66,
    serviceGapClasses
  };
}

function block3DRowVisible(info, controls) {
  if (!controls?.enabled) return false;
  const focus = controls.focus || "all";
  if (focus === "all") return true;
  if (controls.mode === "service") {
    if (focus === "service-gap") return info.hasServiceGap;
    return info.serviceOverloadClass === focus || info.serviceGapClasses.includes(focus);
  }
  if (controls.mode === "environment") return info.environmentalZoneClass === focus;
  if (controls.mode === "linkage") return info.linkedState === focus;
  return true;
}

function block3DRecommendationCandidatePool(row, controls) {
  const candidates = row?.facilitySuitability?.topCandidates || [];
  if (!candidates.length) {
    return {
      candidateCount: 0,
      filteredCount: 0,
      visibleCandidates: []
    };
  }
  const focusMatched = candidates
    .filter((candidate) => block3DRecommendationMatchesFocus(candidate, controls))
    .sort((a, b) =>
      block3DRecommendationRank(a, 999) - block3DRecommendationRank(b, 999) ||
      clamp01(b.suitabilityScore) - clamp01(a.suitabilityScore)
    );
  const minScore = Math.min(1, Math.max(0, Number(controls?.recommendationMinScore ?? 0.5)));
  const scoreMatched = focusMatched.filter((candidate) => clamp01(candidate.suitabilityScore) >= minScore);
  return {
    candidateCount: focusMatched.length,
    filteredCount: Math.max(0, focusMatched.length - scoreMatched.length),
    visibleCandidates: scoreMatched
      .slice(0, Math.max(1, Math.min(3, Math.round(Number(controls?.recommendationRanks) || 1))))
      .map((candidate, index) => ({
        candidate,
        rank: block3DRecommendationRank(candidate, index + 1)
      }))
  };
}

function block3DRecommendationMatchesFocus(candidate, controls) {
  const focus = controls?.focus || "all";
  if (focus === "all" || focus === "service-gap") return true;
  return (
    candidate.serviceClass === focus ||
    candidate.facilityType === focus ||
    candidate.suitabilityClass === focus ||
    candidate.requirementClass === focus ||
    candidate.buildStrategy === focus
  );
}

function block3DRecommendationRank(candidate, fallback = 1) {
  const rank = Math.round(Number(candidate?.recommendedRank));
  return Math.max(1, Number.isFinite(rank) ? rank : fallback);
}

function block3DRecommendationRankOffset(rank, blockX = 0, blockY = 0, cellSizeKm = 0.5) {
  if (rank <= 1) return { xKm: 0, yKm: 0 };
  const radius = Math.max(0.035, Math.min(0.28, Number(cellSizeKm) * 0.32 || 0.08));
  const angle = blockMicrozoneRoleAngle(`recommendation-rank-${rank}`, Number(blockX) || 0, Number(blockY) || 0) + (rank - 1) * Math.PI * 0.72;
  return {
    xKm: Math.cos(angle) * radius,
    yKm: Math.sin(angle) * radius
  };
}

function block3DRecommendationColor(candidate) {
  const serviceClass = candidate?.serviceClass || "";
  if (serviceClass === "transport-access") return 0xc8b17a;
  if (serviceClass === "green-blue-service") return 0x6fae72;
  if (serviceClass === "hydraulic-control") return 0x4faec7;
  if (serviceClass === "civic-institution") return 0xd0b27d;
  if (serviceClass === "emergency-service") return 0xd87864;
  if (serviceClass === "research-monitoring") return 0x8fb2df;
  if (serviceClass === "renewable-energy") return 0xd4d96e;
  if (serviceClass === "housing") return 0xc2aa8a;
  if (serviceClass === "commercial-service") return 0xc8986c;
  if (serviceClass === "utility-critical") return 0xa6aaa7;
  return 0x75c7a1;
}

function block3DMicrozoneRoleVisible(role, controls) {
  const focus = controls?.focus || "all";
  if (focus === "all" || focus === "service-gap") return true;
  return role === focus;
}

function block3DMarkerColor(info, anchorRole, controls) {
  if (controls.mode === "service") return block3DServiceColor(info.serviceOverloadClass, info.hasServiceGap);
  if (controls.mode === "environment") return block3DEnvironmentColor(info.environmentalZoneClass);
  if (controls.mode === "linkage") return block3DLinkedStateColor(info.linkedState);
  return blockMicrozoneRoleColor(anchorRole);
}

function block3DServiceColor(overloadClass, hasServiceGap) {
  if (overloadClass === "environmental-service-conflict") return 0xd98767;
  if (overloadClass === "service-gap-review") return 0xf0d783;
  if (overloadClass === "underserved-watch") return 0xe0b05c;
  return hasServiceGap ? 0xd9bc68 : 0x87b681;
}

function block3DEnvironmentColor(zoneClass) {
  if (zoneClass === "blue-corridor-zone") return 0x4faec7;
  if (zoneClass === "ecological-buffer-zone") return 0x6fae72;
  if (zoneClass === "general-development-zone") return 0xd6c78e;
  return 0xc8c0a4;
}

function block3DLinkedStateColor(linkedState) {
  if (linkedState === "candidate-rejected") return 0x8d8f88;
  if (linkedState === "high-adaptation-required") return 0xd98767;
  if (linkedState === "access-corridor-linked") return 0xc8b17a;
  if (linkedState === "hydraulic-control-linked" || linkedState === "water-production-control-linked") return 0x4faec7;
  if (linkedState === "green-blue-buffer-linked") return 0x6fae72;
  if (linkedState === "research-monitoring-linked") return 0x8fb2df;
  if (linkedState === "renewable-field-linked") return 0xd4d96e;
  if (linkedState === "unoccupied") return 0x68746f;
  return 0xf0d783;
}

function blockMicrozoneBestRoleZone(subzones, role) {
  return (subzones || [])
    .filter((zone) => zone?.microzoneRole === role && (zone.cellCount || 0) > 0 && Number.isFinite(Number(zone.centerXKm)) && Number.isFinite(Number(zone.centerYKm)))
    .sort((a, b) =>
      Number(b.facilitySuitabilityScore || 0) - Number(a.facilitySuitabilityScore || 0) ||
      Number(b.meanFoundationScore || 0) - Number(a.meanFoundationScore || 0) ||
      Number(b.localReliefM || 0) - Number(a.localReliefM || 0)
    )[0] || null;
}

function blockMicrozoneTransformFromKm(model, xKm, yKm, verticalScale = 1, options = {}) {
  const sizeKm = modelSizeKm(model);
  const n = Math.max(1, model.n || 1);
  const cell = model.cellSizeKm || sizeKm / Math.max(1, n - 1);
  const xValue = Number(xKm);
  const yValue = Number(yKm);
  if (!Number.isFinite(xValue) || !Number.isFinite(yValue)) return null;
  const gx = Math.max(0, Math.min(n - 1, Math.floor(xValue / Math.max(0.0001, cell))));
  const gy = Math.max(0, Math.min(n - 1, Math.floor(yValue / Math.max(0.0001, cell))));
  const index = gy * n + gx;
  const surfaceY = ((model.height?.[index] ?? 0) / 1000) * (Number(verticalScale) || 1);
  return {
    x: (xValue / Math.max(0.0001, sizeKm) - 0.5) * sizeKm,
    y: surfaceY + (Number(options.lift) || 0.03),
    z: (yValue / Math.max(0.0001, sizeKm) - 0.5) * sizeKm,
    sx: Number(options.sx) || 0.08,
    sy: Number(options.sy) || 0.02,
    sz: Number(options.sz) || 0.08,
    ry: Number(options.ry) || 0,
    color: options.color ?? 0xf0d783
  };
}

function blockMicrozoneRoleColor(role) {
  if (role === "blue-corridor-microzone") return 0x4faec7;
  if (role === "ridge-crest-microzone") return 0xb7b0a0;
  if (role === "buildable-shelf-microzone") return 0xd6c78e;
  if (role === "hazard-buffer-microzone") return 0xd98767;
  if (role === "facility-tissue-microzone") return 0xf0d783;
  if (role === "ecological-buffer-microzone") return 0x6fae72;
  return 0xc8c0a4;
}

function blockMicrozoneRoleAngle(role, blockX = 0, blockY = 0) {
  const jitter = (hash01(Number(blockX) || 0, Number(blockY) || 0, 517) - 0.5) * 0.32;
  if (role === "blue-corridor-microzone") return Math.PI * 0.5 + jitter;
  if (role === "ridge-crest-microzone") return Math.PI * 0.25 + jitter;
  if (role === "hazard-buffer-microzone") return Math.PI * 0.75 + jitter;
  return jitter;
}

function incrementRendererCount(map, key, delta = 1) {
  if (!map || !key) return;
  map[key] = (map[key] || 0) + delta;
}

function infrastructureAngle(model, index, x, y, type, seed) {
  const direction = model.flowDirection?.[index];
  if (Number.isInteger(direction) && direction >= 0 && direction < D8_WORLD_DIRECTIONS.length) {
    const d = D8_WORLD_DIRECTIONS[direction];
    const flowAngle = Math.atan2(-d.z, d.x);
    if (["canal", "levee", "dam", "bridge"].includes(type)) return flowAngle + Math.PI * 0.5;
    if (LINEAR_INFRA_TYPES.has(type)) return flowAngle;
  }
  return (hash01(x, y, seed + 1231) - 0.5) * Math.PI;
}

function hazardProcessAngle(model, index, x, y, type, seed) {
  if (type === "flood") {
    const direction = model.flowDirection?.[index];
    if (Number.isInteger(direction) && direction >= 0 && direction < D8_WORLD_DIRECTIONS.length) {
      const d = D8_WORLD_DIRECTIONS[direction];
      return Math.atan2(-d.z, d.x);
    }
  }
  if (type === "wildfire") {
    const windFromDeg = model.windDirection?.[index];
    if (Number.isFinite(windFromDeg)) {
      const toRad = ((windFromDeg + 180) * Math.PI) / 180;
      const dir = { x: Math.sin(toRad), z: -Math.cos(toRad) };
      return Math.atan2(-dir.z, dir.x);
    }
  }
  if (type === "landslide") {
    const aspectDeg = model.aspect?.[index];
    if (Number.isFinite(aspectDeg)) {
      const rad = (aspectDeg * Math.PI) / 180;
      const dir = { x: Math.sin(rad), z: -Math.cos(rad) };
      return Math.atan2(-dir.z, dir.x);
    }
  }
  return infrastructureAngle(model, index, x, y, type, seed);
}

function rotatedOffset(angle, forward, side) {
  return {
    x: Math.cos(angle) * forward + Math.sin(angle) * side,
    z: -Math.sin(angle) * forward + Math.cos(angle) * side
  };
}

function pushHazardVectorGlyph(bucket, base, angle, size, severity, color, widthScale = 0.045) {
  const strength = clamp01(severity);
  const length = Math.max(0.035, size * (0.36 + strength * 0.5));
  const width = Math.max(0.012, size * widthScale);
  const lift = 0.04 + strength * 0.06;
  const shaft = rotatedOffset(angle, length * 0.12, 0);
  const head = rotatedOffset(angle, length * 0.48, 0);
  bucket.push({
    x: base.x + shaft.x,
    y: base.y + lift,
    z: base.z + shaft.z,
    sx: length,
    sy: Math.max(0.01, width * 0.45),
    sz: width,
    ry: angle,
    color
  });
  bucket.push({
    x: base.x + head.x,
    y: base.y + lift + 0.006,
    z: base.z + head.z,
    sx: width * 2.4,
    sy: Math.max(0.012, width * 0.55),
    sz: width * 2.4,
    ry: angle + Math.PI * 0.25,
    color
  });
}

function wildlifeAgentRenderState(model, params, agent, species, visualScale) {
  const sizeKm = modelSizeKm(model);
  const n = Math.max(2, model.n || 2);
  const cell = model.cellSizeKm || sizeKm / (n - 1);
  const gx = Math.max(0, Math.min(n - 1, Math.round((Number(agent.xKm) / Math.max(0.0001, sizeKm)) * (n - 1))));
  const gy = Math.max(0, Math.min(n - 1, Math.round((Number(agent.yKm) / Math.max(0.0001, sizeKm)) * (n - 1))));
  const index = gy * n + gx;
  const verticalScale = Math.max(0.1, Number(params?.verticalScale) || 1);
  const waterSurface = Number(params?.seaLevel) || 0;
  const surfaceHeightM = Math.max(Number(model.height?.[index]) || 0, species.aquaticAffinity >= 0.5 ? waterSurface : 0);
  const bodySize = Math.max(0.0007, Math.min(0.006, 0.0024 * Math.max(0.35, Number(agent.scale) || 1))) * visualScale;
  const flying = (species.geometryClass === "bird" || species.geometryClass === "raptor") && species.id !== "cassowary";
  return {
    baseX: Number(agent.xKm) - sizeKm / 2,
    baseY: (surfaceHeightM / 1000) * verticalScale + bodySize * (flying ? 2.8 : 0.32),
    baseZ: Number(agent.yKm) - sizeKm / 2,
    heading: Number(agent.headingRad) || 0,
    phase: Number(agent.animationPhase) || 0,
    bodySize,
    flying,
    motionRate: 0.45 + Math.min(2.1, Math.max(0, Number(agent.speedKmPerDay) || 0) / 12),
    travelRadius: Math.max(0.008, Math.min(0.16, cell * (flying ? 0.12 : 0.055))),
    habitatSuitability: clamp01(agent.habitatSuitability)
  };
}

function wildlifePartPlan(species) {
  const p = (id, labelZh, geometry, offset, scale, options = {}) => ({ id, labelZh, geometry, offset, scale, ...options });
  const body = species.geometryClass;
  if (body === "ungulate") {
    const crownDetails = species.id === "red_deer"
      ? [
          p("left-antler", "左主角", "cone", [0.63, 1.72, 0.2], [0.085, 0.72, 0.085], { rz: -0.12, colorHex: 0xb7a080 }),
          p("right-antler", "右主角", "cone", [0.63, 1.72, -0.2], [0.085, 0.72, 0.085], { rz: -0.12, colorHex: 0xb7a080 }),
          p("antler-tines", "角枝", "cone", [0.75, 1.88, 0], [0.11, 0.42, 0.34], { rz: -0.7, colorHex: 0xc4ad89 })
        ]
      : [
          p("left-horn", "左弯角", "cone", [0.6, 1.58, 0.2], [0.13, 0.58, 0.13], { rz: 0.46, colorHex: 0x887e6d }),
          p("right-horn", "右弯角", "cone", [0.6, 1.58, -0.2], [0.13, 0.58, 0.13], { rz: 0.46, colorHex: 0x887e6d })
        ];
    return [
      p("body", "躯干", "box", [0, 0.78, 0], [1.45, 0.68, 0.58], { lighten: 0.04 }),
      p("neck", "颈部", "box", [0.5, 1.08, 0], [0.28, 0.64, 0.28], { rz: -0.25 }),
      p("head", "头部", "box", [0.76, 1.24, 0], [0.48, 0.34, 0.34], { lighten: 0.08 }),
      p("muzzle", "吻部", "sphere", [1.02, 1.18, 0], [0.34, 0.2, 0.24], { lighten: 0.14 }),
      p("left-eye", "左眼", "sphere", [0.92, 1.32, 0.17], [0.07, 0.07, 0.045], { colorHex: 0x151819 }),
      p("right-eye", "右眼", "sphere", [0.92, 1.32, -0.17], [0.07, 0.07, 0.045], { colorHex: 0x151819 }),
      p("left-ear", "左耳", "cone", [0.75, 1.5, 0.2], [0.12, 0.34, 0.12], { rz: -0.12, lighten: 0.12 }),
      p("right-ear", "右耳", "cone", [0.75, 1.5, -0.2], [0.12, 0.34, 0.12], { rz: -0.12, lighten: 0.12 }),
      p("front-legs", "前腿", "box", [0.42, 0.32, 0], [0.18, 0.72, 0.46], { gait: 1 }),
      p("rear-legs", "后腿", "box", [-0.42, 0.32, 0], [0.18, 0.72, 0.46], { gait: -1 }),
      p("tail", "尾部", "cone", [-0.78, 0.86, 0], [0.18, 0.5, 0.18], { rz: Math.PI * 0.55 }),
      ...crownDetails
    ];
  }
  if (body === "bovine") {
    return [
      p("body", "厚重躯干", "sphere", [-0.08, 0.78, 0], [1.55, 0.86, 0.76]),
      p("shoulder", "肩峰", "sphere", [0.34, 1.02, 0], [0.68, 0.58, 0.62], { lighten: 0.04 }),
      p("neck", "粗颈", "cylinder", [0.52, 1.04, 0], [0.42, 0.66, 0.4], { rz: -0.28 }),
      p("head", "头部", "sphere", [0.78, 1.2, 0], [0.56, 0.46, 0.46], { lighten: 0.08 }),
      p("muzzle", "宽吻", "sphere", [1.08, 1.08, 0], [0.38, 0.24, 0.32], { lighten: 0.16 }),
      p("left-horn", "左角", "cone", [0.72, 1.52, 0.24], [0.15, 0.56, 0.15], { rz: 0.58, colorHex: 0xd3c6a6 }),
      p("right-horn", "右角", "cone", [0.72, 1.52, -0.24], [0.15, 0.56, 0.15], { rz: 0.58, colorHex: 0xd3c6a6 }),
      p("left-ear", "左耳", "cone", [0.7, 1.42, 0.3], [0.13, 0.3, 0.13], { rz: -0.18, lighten: 0.12 }),
      p("right-ear", "右耳", "cone", [0.7, 1.42, -0.3], [0.13, 0.3, 0.13], { rz: -0.18, lighten: 0.12 }),
      p("left-eye", "左眼", "sphere", [0.92, 1.28, 0.2], [0.07, 0.07, 0.045], { colorHex: 0x141817 }),
      p("right-eye", "右眼", "sphere", [0.92, 1.28, -0.2], [0.07, 0.07, 0.045], { colorHex: 0x141817 }),
      p("front-legs", "前肢", "box", [0.42, 0.32, 0], [0.24, 0.74, 0.52], { gait: 1 }),
      p("rear-legs", "后肢", "box", [-0.46, 0.32, 0], [0.26, 0.74, 0.54], { gait: -1 }),
      p("tail", "尾部", "cone", [-0.86, 0.84, 0], [0.2, 0.62, 0.2], { rz: Math.PI * 0.58 })
    ];
  }
  if (body === "feline") {
    const mane = species.id === "african_lion"
      ? [p("mane", "鬃毛", "sphere", [0.52, 1.02, 0], [0.74, 0.72, 0.64], { colorHex: 0x8b6036 })]
      : [];
    return [
      p("body", "流线躯干", "sphere", [-0.12, 0.66, 0], [1.5, 0.62, 0.54]),
      p("chest", "胸肩", "sphere", [0.4, 0.78, 0], [0.58, 0.66, 0.52], { lighten: 0.04 }),
      ...mane,
      p("neck", "颈部", "cylinder", [0.5, 0.92, 0], [0.3, 0.5, 0.3], { rz: -0.24 }),
      p("head", "头部", "sphere", [0.76, 1.04, 0], [0.5, 0.42, 0.4], { lighten: 0.08 }),
      p("muzzle", "吻垫", "sphere", [1.02, 0.96, 0], [0.3, 0.2, 0.26], { lighten: 0.18 }),
      p("left-ear", "左耳", "cone", [0.7, 1.36, 0.18], [0.15, 0.38, 0.15], { lighten: 0.12 }),
      p("right-ear", "右耳", "cone", [0.7, 1.36, -0.18], [0.15, 0.38, 0.15], { lighten: 0.12 }),
      p("left-eye", "左眼", "sphere", [0.91, 1.09, 0.16], [0.075, 0.065, 0.045], { colorHex: 0x171b17 }),
      p("right-eye", "右眼", "sphere", [0.91, 1.09, -0.16], [0.075, 0.065, 0.045], { colorHex: 0x171b17 }),
      p("front-legs", "前肢", "box", [0.38, 0.25, 0], [0.2, 0.68, 0.42], { gait: 1 }),
      p("rear-legs", "后肢", "box", [-0.42, 0.25, 0], [0.26, 0.68, 0.46], { gait: -1 }),
      p("tail", "长尾", "cone", [-0.86, 0.66, 0], [0.24, 1.05, 0.22], { rz: Math.PI * 0.56 })
    ];
  }
  if (body === "elephant") {
    return [
      p("body", "巨型躯干", "sphere", [-0.12, 0.9, 0], [1.62, 1.02, 0.92]),
      p("shoulder", "肩背", "sphere", [0.32, 1.08, 0], [0.8, 0.78, 0.76], { lighten: 0.03 }),
      p("head", "头部", "sphere", [0.78, 1.04, 0], [0.72, 0.68, 0.7], { lighten: 0.06 }),
      p("left-ear", "左扇耳", "cone", [0.58, 1.1, 0.5], [0.48, 0.72, 0.18], { rz: -0.1, lighten: 0.08 }),
      p("right-ear", "右扇耳", "cone", [0.58, 1.1, -0.5], [0.48, 0.72, 0.18], { rz: -0.1, lighten: 0.08 }),
      p("trunk", "象鼻", "cylinder", [1.12, 0.66, 0], [0.28, 1.15, 0.28], { rz: -0.18, lighten: 0.05 }),
      p("left-tusk", "左象牙", "cone", [1.18, 0.72, 0.27], [0.12, 0.72, 0.12], { rz: -Math.PI / 2.7, colorHex: 0xe6dfc9 }),
      p("right-tusk", "右象牙", "cone", [1.18, 0.72, -0.27], [0.12, 0.72, 0.12], { rz: -Math.PI / 2.7, colorHex: 0xe6dfc9 }),
      p("left-eye", "左眼", "sphere", [0.98, 1.15, 0.3], [0.07, 0.07, 0.045], { colorHex: 0x17191a }),
      p("right-eye", "右眼", "sphere", [0.98, 1.15, -0.3], [0.07, 0.07, 0.045], { colorHex: 0x17191a }),
      p("front-legs", "前柱足", "box", [0.42, 0.32, 0], [0.34, 0.84, 0.62], { gait: 1 }),
      p("rear-legs", "后柱足", "box", [-0.48, 0.32, 0], [0.36, 0.84, 0.64], { gait: -1 }),
      p("tail", "细尾", "cone", [-0.94, 0.86, 0], [0.14, 0.72, 0.14], { rz: Math.PI * 0.58 })
    ];
  }
  if (body === "giraffe") {
    return [
      p("body", "高肩躯干", "sphere", [-0.18, 0.86, 0], [1.42, 0.7, 0.62]),
      p("neck", "长颈", "cylinder", [0.46, 1.58, 0], [0.3, 1.75, 0.3], { rz: -0.13 }),
      p("head", "头部", "sphere", [0.68, 2.34, 0], [0.56, 0.36, 0.34], { lighten: 0.08 }),
      p("muzzle", "吻部", "sphere", [1.0, 2.28, 0], [0.34, 0.2, 0.26], { lighten: 0.16 }),
      p("left-horn", "左角突", "cone", [0.58, 2.68, 0.17], [0.1, 0.34, 0.1], { colorHex: 0x6c4f34 }),
      p("right-horn", "右角突", "cone", [0.58, 2.68, -0.17], [0.1, 0.34, 0.1], { colorHex: 0x6c4f34 }),
      p("left-ear", "左耳", "cone", [0.58, 2.58, 0.28], [0.14, 0.34, 0.14], { rz: -0.2, lighten: 0.1 }),
      p("right-ear", "右耳", "cone", [0.58, 2.58, -0.28], [0.14, 0.34, 0.14], { rz: -0.2, lighten: 0.1 }),
      p("left-eye", "左眼", "sphere", [0.84, 2.39, 0.16], [0.07, 0.07, 0.045], { colorHex: 0x151716 }),
      p("right-eye", "右眼", "sphere", [0.84, 2.39, -0.16], [0.07, 0.07, 0.045], { colorHex: 0x151716 }),
      p("front-legs", "前肢", "box", [0.38, 0.28, 0], [0.18, 0.94, 0.44], { gait: 1 }),
      p("rear-legs", "后肢", "box", [-0.46, 0.28, 0], [0.2, 0.94, 0.46], { gait: -1 }),
      p("tail", "尾部", "cone", [-0.84, 0.86, 0], [0.18, 0.72, 0.18], { rz: Math.PI * 0.58 })
    ];
  }
  if (body === "marsupial") {
    return [
      p("body", "直立躯干", "sphere", [-0.18, 0.78, 0], [0.88, 1.18, 0.72]),
      p("chest", "胸腹", "sphere", [0.08, 1.02, 0], [0.62, 0.78, 0.56], { lighten: 0.1 }),
      p("head", "头部", "sphere", [0.36, 1.55, 0], [0.48, 0.46, 0.42], { lighten: 0.08 }),
      p("muzzle", "吻部", "sphere", [0.68, 1.5, 0], [0.32, 0.2, 0.24], { lighten: 0.16 }),
      p("left-ear", "左长耳", "cone", [0.32, 1.98, 0.18], [0.14, 0.64, 0.14], { lighten: 0.12 }),
      p("right-ear", "右长耳", "cone", [0.32, 1.98, -0.18], [0.14, 0.64, 0.14], { lighten: 0.12 }),
      p("left-eye", "左眼", "sphere", [0.52, 1.64, 0.15], [0.07, 0.07, 0.045], { colorHex: 0x141716 }),
      p("right-eye", "右眼", "sphere", [0.52, 1.64, -0.15], [0.07, 0.07, 0.045], { colorHex: 0x141716 }),
      p("forearms", "短前肢", "box", [0.22, 0.92, 0], [0.2, 0.44, 0.38], { gait: -0.4 }),
      p("rear-legs", "强壮后肢", "box", [-0.2, 0.28, 0], [0.46, 0.76, 0.62], { gait: 1 }),
      p("tail", "平衡长尾", "cone", [-0.82, 0.54, 0], [0.26, 1.28, 0.24], { rz: Math.PI * 0.58 })
    ];
  }
  if (body === "penguin") {
    return [
      p("body", "纺锤躯干", "sphere", [0, 0.7, 0], [0.78, 1.18, 0.72]),
      p("belly", "腹部", "sphere", [0.22, 0.68, 0], [0.58, 0.9, 0.54], { colorHex: 0xe6e3da }),
      p("head", "头部", "sphere", [0.12, 1.3, 0], [0.52, 0.5, 0.48], { colorHex: 0x252a2a }),
      p("beak", "喙", "cone", [0.48, 1.26, 0], [0.13, 0.38, 0.13], { rz: -Math.PI / 2, colorHex: 0xd6a14f }),
      p("left-eye", "左眼", "sphere", [0.3, 1.4, 0.17], [0.065, 0.065, 0.04], { colorHex: 0x101313 }),
      p("right-eye", "右眼", "sphere", [0.3, 1.4, -0.17], [0.065, 0.065, 0.04], { colorHex: 0x101313 }),
      p("left-wing", "左鳍翼", "box", [-0.04, 0.76, 0.48], [0.62, 0.09, 0.8], { flap: 0.35, colorHex: 0x303637 }),
      p("right-wing", "右鳍翼", "box", [-0.04, 0.76, -0.48], [0.62, 0.09, 0.8], { flap: -0.35, colorHex: 0x303637 }),
      p("feet", "蹼足", "box", [0.08, 0.04, 0], [0.52, 0.18, 0.58], { colorHex: 0xc79a52 })
    ];
  }
  if (body === "boar") {
    return [
      p("body", "躯干", "sphere", [-0.08, 0.68, 0], [1.48, 0.82, 0.72]),
      p("head", "头部", "sphere", [0.67, 0.72, 0], [0.62, 0.58, 0.56], { lighten: 0.05 }),
      p("snout", "吻部", "cone", [1.02, 0.66, 0], [0.28, 0.46, 0.28], { rz: -Math.PI / 2, lighten: 0.1 }),
      p("left-eye", "左眼", "sphere", [0.9, 0.82, 0.21], [0.07, 0.07, 0.045], { colorHex: 0x141616 }),
      p("right-eye", "右眼", "sphere", [0.9, 0.82, -0.21], [0.07, 0.07, 0.045], { colorHex: 0x141616 }),
      p("left-ear", "左耳", "cone", [0.62, 1.1, 0.22], [0.13, 0.34, 0.13], { rz: -0.18, lighten: 0.12 }),
      p("right-ear", "右耳", "cone", [0.62, 1.1, -0.22], [0.13, 0.34, 0.13], { rz: -0.18, lighten: 0.12 }),
      p("left-tusk", "左獠牙", "cone", [1.16, 0.58, 0.2], [0.07, 0.27, 0.07], { rz: -Math.PI / 2, colorHex: 0xe5d9ba }),
      p("right-tusk", "右獠牙", "cone", [1.16, 0.58, -0.2], [0.07, 0.27, 0.07], { rz: -Math.PI / 2, colorHex: 0xe5d9ba }),
      p("legs", "短腿", "box", [-0.02, 0.24, 0], [0.62, 0.48, 0.52], { gait: 1 }),
      p("tail", "短尾", "cone", [-0.9, 0.78, 0], [0.09, 0.3, 0.09], { rz: Math.PI * 0.58 })
    ];
  }
  if (body === "canid") {
    return [
      p("body", "躯干", "box", [-0.08, 0.66, 0], [1.35, 0.58, 0.5]),
      p("chest", "胸颈", "box", [0.45, 0.84, 0], [0.34, 0.7, 0.34], { rz: -0.18, lighten: 0.05 }),
      p("head", "头部", "box", [0.74, 1.02, 0], [0.48, 0.38, 0.36], { lighten: 0.08 }),
      p("muzzle", "吻部", "cone", [1.02, 0.93, 0], [0.2, 0.42, 0.2], { rz: -Math.PI / 2, lighten: 0.14 }),
      p("left-eye", "左眼", "sphere", [0.9, 1.08, 0.16], [0.065, 0.065, 0.04], { colorHex: 0x151817 }),
      p("right-eye", "右眼", "sphere", [0.9, 1.08, -0.16], [0.065, 0.065, 0.04], { colorHex: 0x151817 }),
      p("left-ear", "左耳", "cone", [0.7, 1.34, 0.18], [0.13, 0.42, 0.13], { lighten: 0.1 }),
      p("right-ear", "右耳", "cone", [0.7, 1.34, -0.18], [0.13, 0.42, 0.13], { lighten: 0.1 }),
      p("legs", "四肢", "box", [0, 0.27, 0], [0.72, 0.62, 0.4], { gait: 1 }),
      p("tail", "尾部", "cone", [-0.8, 0.72, 0], [0.24, 0.78, 0.24], { rz: Math.PI * 0.62 })
    ];
  }
  if (body === "bear") {
    return [
      p("body", "躯干", "sphere", [-0.12, 0.76, 0], [1.5, 0.96, 0.82]),
      p("shoulder", "肩峰", "sphere", [0.38, 0.96, 0], [0.72, 0.72, 0.66], { lighten: 0.04 }),
      p("head", "头部", "sphere", [0.78, 0.92, 0], [0.58, 0.54, 0.52], { lighten: 0.08 }),
      p("muzzle", "吻部", "sphere", [1.05, 0.82, 0], [0.36, 0.28, 0.32], { lighten: 0.16 }),
      p("left-eye", "左眼", "sphere", [0.96, 1.0, 0.2], [0.07, 0.07, 0.045], { colorHex: 0x151616 }),
      p("right-eye", "右眼", "sphere", [0.96, 1.0, -0.2], [0.07, 0.07, 0.045], { colorHex: 0x151616 }),
      p("left-ear", "左圆耳", "sphere", [0.7, 1.25, 0.24], [0.2, 0.2, 0.14], { lighten: 0.12 }),
      p("right-ear", "右圆耳", "sphere", [0.7, 1.25, -0.24], [0.2, 0.2, 0.14], { lighten: 0.12 }),
      p("legs", "四肢", "box", [-0.02, 0.27, 0], [0.82, 0.6, 0.62], { gait: 1 })
    ];
  }
  if (body === "semi-aquatic") {
    return [
      p("body", "流线躯干", "sphere", [-0.08, 0.48, 0], [1.65, 0.56, 0.5]),
      p("head", "头部", "sphere", [0.78, 0.58, 0], [0.48, 0.42, 0.4], { lighten: 0.08 }),
      p("muzzle", "吻部", "sphere", [1.04, 0.52, 0], [0.28, 0.19, 0.24], { lighten: 0.15 }),
      p("left-eye", "左眼", "sphere", [0.94, 0.66, 0.16], [0.06, 0.06, 0.04], { colorHex: 0x141717 }),
      p("right-eye", "右眼", "sphere", [0.94, 0.66, -0.16], [0.06, 0.06, 0.04], { colorHex: 0x141717 }),
      p("left-ear", "左耳", "sphere", [0.72, 0.84, 0.2], [0.13, 0.13, 0.09], { lighten: 0.1 }),
      p("right-ear", "右耳", "sphere", [0.72, 0.84, -0.2], [0.13, 0.13, 0.09], { lighten: 0.1 }),
      p("tail", "扁尾", "cone", [-1.0, 0.42, 0], [0.24, 0.92, 0.28], { rz: Math.PI * 0.58 }),
      p("feet", "蹼足", "box", [0.02, 0.2, 0], [0.72, 0.18, 0.58], { gait: 1 })
    ];
  }
  if (body === "bird") {
    return [
      p("body", "躯干", "sphere", [0, 0.62, 0], [0.78, 0.62, 0.56]),
      p("left-wing", "左翼", "box", [0, 0.66, 0.58], [0.84, 0.08, 0.92], { flap: 1, lighten: 0.05 }),
      p("right-wing", "右翼", "box", [0, 0.66, -0.58], [0.84, 0.08, 0.92], { flap: -1, lighten: 0.05 }),
      p("neck", "长颈", "cylinder", [0.46, 1.0, 0], [0.17, 0.92, 0.17], { rz: -0.18, lighten: 0.12 }),
      p("head", "头部", "sphere", [0.58, 1.42, 0], [0.3, 0.28, 0.28], { lighten: 0.18 }),
      p("beak", "长喙", "cone", [0.83, 1.4, 0], [0.1, 0.48, 0.1], { rz: -Math.PI / 2, colorHex: 0xd8a54c }),
      p("left-eye", "左眼", "sphere", [0.7, 1.5, 0.11], [0.055, 0.055, 0.035], { colorHex: 0x111414 }),
      p("right-eye", "右眼", "sphere", [0.7, 1.5, -0.11], [0.055, 0.055, 0.035], { colorHex: 0x111414 }),
      p("tail", "尾羽", "cone", [-0.52, 0.63, 0], [0.22, 0.56, 0.26], { rz: Math.PI / 2, lighten: 0.08 }),
      p("legs", "长腿", "box", [-0.02, 0.02, 0], [0.18, 0.82, 0.38], { gait: 1, lighten: 0.12 })
    ];
  }
  if (body === "raptor") {
    return [
      p("body", "躯干", "sphere", [0, 0.64, 0], [0.78, 0.7, 0.58]),
      p("left-wing", "左翼", "box", [-0.08, 0.7, 0.74], [1.15, 0.07, 1.18], { flap: 1, lighten: 0.03 }),
      p("right-wing", "右翼", "box", [-0.08, 0.7, -0.74], [1.15, 0.07, 1.18], { flap: -1, lighten: 0.03 }),
      p("head", "头部", "sphere", [0.52, 0.94, 0], [0.36, 0.34, 0.32], { lighten: 0.16 }),
      p("beak", "钩喙", "cone", [0.76, 0.91, 0], [0.12, 0.34, 0.12], { rz: -Math.PI / 2, colorHex: 0xd4aa58 }),
      p("left-eye", "左眼", "sphere", [0.66, 1.03, 0.12], [0.06, 0.06, 0.038], { colorHex: 0x111313 }),
      p("right-eye", "右眼", "sphere", [0.66, 1.03, -0.12], [0.06, 0.06, 0.038], { colorHex: 0x111313 }),
      p("left-talon", "左爪", "cone", [0.08, 0.24, 0.2], [0.09, 0.25, 0.09], { colorHex: 0x53483b }),
      p("right-talon", "右爪", "cone", [0.08, 0.24, -0.2], [0.09, 0.25, 0.09], { colorHex: 0x53483b }),
      p("tail", "尾羽", "cone", [-0.74, 0.64, 0], [0.28, 0.7, 0.34], { rz: Math.PI / 2, lighten: 0.06 })
    ];
  }
  return [
    p("body", "躯干", "sphere", [-0.06, 0.48, 0], [1.2, 0.72, 0.62]),
    p("head", "头部", "sphere", [0.52, 0.64, 0], [0.5, 0.48, 0.46], { lighten: 0.1 }),
    p("left-eye", "左眼", "sphere", [0.68, 0.74, 0.16], [0.065, 0.065, 0.04], { colorHex: 0x151717 }),
    p("right-eye", "右眼", "sphere", [0.68, 0.74, -0.16], [0.065, 0.065, 0.04], { colorHex: 0x151717 }),
    p("left-ear", "左耳", "cone", [0.56, 1.0, 0.16], [0.17, 0.62, 0.17], { lighten: 0.14 }),
    p("right-ear", "右耳", "cone", [0.56, 1.0, -0.16], [0.17, 0.62, 0.17], { lighten: 0.14 }),
    p("muzzle", "吻部", "sphere", [0.78, 0.58, 0], [0.28, 0.2, 0.22], { lighten: 0.16 }),
    p("tail", "短尾", "sphere", [-0.72, 0.55, 0], [0.3, 0.3, 0.3], { lighten: 0.2 }),
    p("legs", "四肢", "box", [0, 0.17, 0], [0.7, 0.32, 0.46], { gait: 1 })
  ];
}

function addWildlifeInstancedBatch(group, batch, renderDetailQuality = "ultra") {
  if (!batch?.entries?.length) return [];
  const variantCount = proceduralAssetVariantCount(batch.kind, renderDetailQuality);
  const partitions = Array.from({ length: variantCount }, () => []);
  for (const entry of batch.entries) {
    const state = entry.state || {};
    const part = entry.part || {};
    const variant = proceduralAssetVariantIndex(batch.kind, {
      x: Number(state.baseX) + Number(part.offset?.[0] || 0),
      y: Number(state.baseY) + Number(part.offset?.[1] || 0),
      z: Number(state.baseZ) + Number(part.offset?.[2] || 0),
      sx: Number(state.bodySize),
      color: entry.colorHex
    }, variantCount);
    partitions[variant].push(entry);
  }
  const material = createProceduralAssetMaterial(batch.kind, 0x9a8d78, {
    roughness: 0.82,
    metalness: 0.01,
    emissive: 0x1b211e,
    emissiveIntensity: 0.08
  });
  const renderSets = [];
  partitions.forEach((entries, variant) => {
    if (!entries.length) return;
    const geometry = sharedGeometry(
      group,
      `wildlife:${renderDetailQuality}:${batch.kind}:v${variant}`,
      () => createAssetGeometry(batch.kind, renderDetailQuality, variant)
    );
    const mesh = new THREE.InstancedMesh(geometry, material, entries.length);
    mesh.name = `动物程序化部件 · ${batch.kind} · V${variant + 1}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.userData.assetVariant = variant;
    const color = new THREE.Color();
    const white = new THREE.Color(0xffffff);
    entries.forEach((entry, index) => {
      color.setHex(entry.colorHex);
      if (entry.lighten) color.lerp(white, Math.min(0.32, entry.lighten));
      mesh.setColorAt(index, color);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    writeWildlifeBatchMatrices(mesh, entries, 0, true);
    group.add(mesh);
    renderSets.push({ mesh, entries, kind: batch.kind, variant });
  });
  return renderSets;
}

function writeWildlifeBatchMatrices(mesh, entries, timeSeconds, refreshBounds = false) {
  for (let i = 0; i < entries.length; i += 1) {
    const { state, part } = entries[i];
    const stride = Math.sin(timeSeconds * state.motionRate + state.phase);
    const heading = state.heading + Math.sin(timeSeconds * 0.18 + state.phase) * 0.22;
    const travel = stride * state.travelRadius;
    const cos = Math.cos(heading);
    const sin = Math.sin(heading);
    const offsetX = part.offset[0] * state.bodySize;
    const offsetZ = part.offset[2] * state.bodySize;
    const rotatedX = cos * offsetX + sin * offsetZ;
    const rotatedZ = -sin * offsetX + cos * offsetZ;
    const bob = state.flying
      ? Math.sin(timeSeconds * 1.45 + state.phase) * state.bodySize * 0.42
      : Math.abs(stride) * state.bodySize * 0.055;
    WILDLIFE_MATRIX_DUMMY.position.set(
      state.baseX + Math.cos(heading) * travel + rotatedX,
      state.baseY + part.offset[1] * state.bodySize + bob,
      state.baseZ - Math.sin(heading) * travel + rotatedZ
    );
    WILDLIFE_MATRIX_DUMMY.rotation.set(
      part.gait ? stride * 0.12 * part.gait : 0,
      heading + (part.ry || 0),
      (part.rz || 0) + (part.flap ? Math.sin(timeSeconds * 3.2 + state.phase) * 0.58 * part.flap : 0)
    );
    WILDLIFE_MATRIX_DUMMY.scale.set(
      part.scale[0] * state.bodySize,
      part.scale[1] * state.bodySize,
      part.scale[2] * state.bodySize
    );
    WILDLIFE_MATRIX_DUMMY.updateMatrix();
    mesh.setMatrixAt(i, WILDLIFE_MATRIX_DUMMY.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (refreshBounds) {
    const padding = entries.reduce((max, entry) => Math.max(
      max,
      Number(entry.state?.travelRadius) || 0,
      (Number(entry.state?.bodySize) || 0) * 0.8
    ), 0);
    updateInstancedMeshBounds(mesh, padding);
  }
}

function animateWildlifeRenderSets(renderSets, timeSeconds) {
  for (const renderSet of renderSets || []) {
    writeWildlifeBatchMatrices(renderSet.mesh, renderSet.entries, timeSeconds);
  }
}

function addWildlifeMigrationCorridors(group, model, params, migrationLinks) {
  if (!migrationLinks?.length || !model?.landscapeNetwork?.blocks?.length) return 0;
  const strongestByPair = new Map();
  for (const link of migrationLinks) {
    const from = Math.min(link.fromBlockId, link.toBlockId);
    const to = Math.max(link.fromBlockId, link.toBlockId);
    const key = `${from}:${to}`;
    if (!strongestByPair.has(key) || strongestByPair.get(key).strength < link.strength) strongestByPair.set(key, link);
  }
  const selected = Array.from(strongestByPair.values())
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 420);
  const blocks = model.landscapeNetwork.blocks;
  const verticalScale = Number(params?.verticalScale) || 1;
  const positions = [];
  for (const link of selected) {
    const from = blocks[link.fromBlockId];
    const to = blocks[link.toBlockId];
    if (!from || !to) continue;
    const a = blockMicrozoneTransformFromKm(model, from.centerXKm, from.centerYKm, verticalScale, { lift: 0.1 + link.strength * 0.06 });
    const b = blockMicrozoneTransformFromKm(model, to.centerXKm, to.centerYKm, verticalScale, { lift: 0.1 + link.strength * 0.06 });
    if (!a || !b) continue;
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  if (!positions.length) return 0;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: 0x75d2a1,
    transparent: true,
    opacity: 0.36,
    depthWrite: false
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.name = "动物迁徙廊道";
  group.add(lines);
  return positions.length / 6;
}

function addInstancedBox(group, name, transforms, fallbackColor, options = {}) {
  return addInstancedAsset(group, name, transforms, fallbackColor, options, "box");
}

function addInstancedCylinder(group, name, transforms, fallbackColor, options = {}) {
  return addInstancedAsset(group, name, transforms, fallbackColor, options, "cylinder");
}

function addInstancedTorus(group, name, transforms, fallbackColor, options = {}) {
  return addInstancedAsset(group, name, transforms, fallbackColor, options, "torus");
}

function addInstancedAsset(group, name, transforms, fallbackColor, options, primitiveType) {
  if (!transforms.length) return [];
  const assetQuality = options.quality || group?.userData?.assetQuality || "high";
  const semanticKind = semanticAssetKind(name);
  const pipelineKind = semanticKind || name;
  const variantCount = semanticKind && !options.geometry && options.variants !== false
    ? proceduralAssetVariantCount(semanticKind, assetQuality)
    : 1;
  const partitions = partitionAssetTransforms(pipelineKind, transforms, variantCount);
  const material = createProceduralAssetMaterial(pipelineKind, fallbackColor, options, primitiveType);
  const meshes = [];
  partitions.forEach((variantTransforms, variant) => {
    if (!variantTransforms.length) return;
    const cacheKey = options.geometryKey
      ? `${options.geometryKey}:v${variant}`
      : `${primitiveType}:${assetQuality}:${semanticKind || name}:v${variant}:${options.radiusSegments || 0}`;
    const geometry = options.geometry || sharedGeometry(
      group,
      cacheKey,
      () => options.geometryFactory?.(variant)
        || createSemanticAssetGeometry(name, assetQuality, variant)
        || createFallbackAssetGeometry(primitiveType, options)
    );
    if (semanticKind === "broadleaf-canopy" || semanticKind === "layered-conifer") {
      const distant = sharedGeometry(group, `${cacheKey}:distant`, () => createFoliageGeometry(semanticKind === "layered-conifer", "distant", variant));
      const lod = new FoliageInstances(geometry, distant, material, variantTransforms, fallbackColor);
      lod.name = `${name} V${variant + 1}`;
      for (const mesh of [lod.far, lod.near]) {
        mesh.name = `${lod.name} ${mesh === lod.near ? "detail" : "distant"}`;
        mesh.userData.assetKind = semanticKind;
        mesh.userData.assetVariant = variant;
      }
      group.add(lod);
      meshes.push(lod.far, lod.near);
      return;
    }
    const mesh = new THREE.InstancedMesh(geometry, material, variantTransforms.length);
    mesh.name = variantCount > 1 ? `${name} · V${variant + 1}` : name;
    mesh.userData.assetVariant = variant;
    mesh.userData.assetKind = semanticKind;
    writeInstanceTransforms(mesh, variantTransforms, fallbackColor);
    group.add(mesh);
    meshes.push(mesh);
  });
  return meshes;
}

function partitionAssetTransforms(kind, transforms, variantCount) {
  const partitions = Array.from({ length: variantCount }, () => []);
  for (const transform of transforms) {
    const variant = proceduralAssetVariantIndex(kind, transform, variantCount);
    partitions[variant].push(transform);
  }
  return partitions;
}

function createFallbackAssetGeometry(primitiveType, options) {
  if (primitiveType === "cylinder") {
    return new THREE.CylinderGeometry(0.5, 0.5, 1, options.radiusSegments || 12);
  }
  if (primitiveType === "torus") {
    const torus = new THREE.TorusGeometry(0.5, 0.12, 12, 28);
    torus.rotateX(Math.PI / 2);
    return torus;
  }
  return new THREE.BoxGeometry(1, 1, 1, 2, 2, 2);
}

function createProceduralAssetMaterial(kind, fallbackColor, options = {}, primitiveType = "box") {
  const profile = proceduralMaterialProfile(kind);
  const transparent = options.transparent ?? false;
  const opacity = options.opacity ?? 1;
  const layeredTransparentSurface = ["water", "glass", "organic"].includes(profile.materialClass);
  const authoredRoughness = options.roughness ?? (primitiveType === "torus" ? 0.78 : primitiveType === "cylinder" ? 0.62 : 0.76);
  const authoredMetalness = options.metalness ?? (primitiveType === "torus" ? 0.03 : primitiveType === "cylinder" ? 0.04 : 0.02);
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: profile.roughness * 0.68 + authoredRoughness * 0.32,
    metalness: profile.metalness * 0.68 + authoredMetalness * 0.32,
    clearcoat: profile.clearcoat,
    clearcoatRoughness: profile.clearcoatRoughness,
    sheen: profile.sheen,
    sheenRoughness: profile.sheenRoughness,
    envMapIntensity: profile.envMapIntensity,
    specularIntensity: profile.specularIntensity,
    transparent,
    opacity,
    depthWrite: options.depthWrite ?? !(transparent && (layeredTransparentSurface || opacity < 0.8)),
    emissive: options.emissive ?? subduedEmissive(fallbackColor),
    emissiveIntensity: options.emissiveIntensity ?? (profile.materialClass === "technical" ? 0.2 : 0.08),
    side: options.side ?? THREE.FrontSide,
    vertexColors: true,
    dithering: true
  });
  material.userData.assetPipelineVersion = 3;
  material.userData.materialClass = profile.materialClass;
  return material;
}

function writeInstanceTransforms(mesh, transforms, fallbackColor = 0xffffff) {
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  transforms.forEach((transform, index) => {
    dummy.position.set(transform.x, transform.y, transform.z);
    dummy.rotation.set(0, transform.ry || 0, 0);
    dummy.scale.set(transform.sx, transform.sy, transform.sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    color.setHex(transform.color ?? fallbackColor ?? 0xffffff);
    mesh.setColorAt(index, color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  updateInstancedMeshBounds(mesh);
}

function disposeObjectTree(root) {
  root.traverse((child) => {
    if (child.geometry && !child.geometry.userData?.sharedGeometryCacheOwned) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material.dispose?.());
    }
  });
  root.clear();
}

function bindSharedGeometryCache(group, cache) {
  if (group) group.userData.sharedGeometryCache = cache;
  return group;
}

function sharedGeometry(group, key, factory) {
  const cache = group?.userData?.sharedGeometryCache;
  if (!cache) return factory();
  if (cache.has(key)) return cache.get(key);
  const geometry = factory();
  if (!geometry) return geometry;
  geometry.userData.sharedGeometryCacheOwned = true;
  geometry.userData.sharedGeometryCacheKey = key;
  cache.set(key, geometry);
  return geometry;
}

function disposeSharedGeometryCache(cache) {
  if (!cache) return;
  for (const geometry of cache.values()) geometry?.dispose?.();
  cache.clear();
}

function updateInstancedMeshBounds(mesh, padding = 0) {
  mesh.computeBoundingBox?.();
  mesh.computeBoundingSphere?.();
  if (mesh.boundingSphere && padding > 0) mesh.boundingSphere.radius += padding;
}

function subduedEmissive(colorHex) {
  return new THREE.Color(colorHex ?? 0xffffff).multiplyScalar(0.24);
}

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

function roundDiagnostic(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function hash01(x, y, seed) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(Number(seed), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
