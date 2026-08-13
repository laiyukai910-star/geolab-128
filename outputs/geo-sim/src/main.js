import {
  CLIMATES,
  applyBrush,
  buildAdaptiveInfrastructurePlacementPlan,
  buildBlockDetailAtlas,
  buildEcologicalIntegrityReport,
  buildBuiltEnvironmentRecoverySeries,
  buildBuiltEnvironmentResilienceAtlas,
  buildHazardEventScenario,
  buildInfrastructureBlockStateReport,
  buildInfrastructureCellPlacementLedger,
  buildInfrastructureImpactAtlas,
  buildInfrastructureSuitabilityMatrix,
  buildLocalRefinementTile,
  buildPhysicalTimeProgressionSeries,
  buildPhysicalCouplingReport,
  buildResearchDataAudit,
  buildResearchValidationGateReport,
  buildSpatialAlignmentAudit,
  buildTerrainProcessAudit,
  buildSubsurfaceColumnReasoningAtlas,
  buildSubsurfaceCubeLedger,
  buildSubsurfaceTransect,
  buildWatershedDelineation,
  buildTimeProgressionSeries,
  buildModel,
  colorForValue,
  createDefaultParams,
  erodeModel,
  GEOMORPHOLOGY_PRESETS,
  getCell,
  applyTerrainPresetParams,
  makeLocalRefinementCSV,
  makeBuiltEnvironmentRecoveryCSV,
  makeBuiltEnvironmentResilienceAtlasCSV,
  makePhysicalTimeProgressionCSV,
  makePhysicalCouplingCSV,
  makeTimeProgressionCSV,
  makeGridCSV,
  makeEcologicalIntegrityCSV,
  makeSubsurfaceColumnReasoningCSV,
  makeSubsurfaceCubeLedgerCSV,
  makeSubsurfaceTransectCSV,
  makeSubsurfaceVoxelCSV,
  makeAdaptiveInfrastructurePlacementPlanCSV,
  makeBlockDetailAtlasCSV,
  makeInfrastructureImpactAtlasCSV,
  makeInfrastructureBlockStateCSV,
  makeInfrastructureCellPlacementLedgerCSV,
  makeInfrastructureSuitabilityMatrixCSV,
  MAX_TERRAIN_ELEVATION_M,
  MAP_SIZE_KM,
  SCENIC_REPRODUCTION_PRESETS,
  SUPPORTED_MAP_SIZES_KM,
  SUPPORTED_MODEL_RESOLUTIONS,
  terrainPresetProcessProfile,
  terrainPresetDisplayInfo,
  WILDLIFE_SPECIES,
  makeRiverGeoJSON,
  makeResearchDataAuditCSV,
  makeResearchValidationGateCSV,
  makeSpatialAlignmentAuditCSV,
  makeTerrainProcessAuditCSV,
  makeWatershedCSV,
  runModel,
  runUncertaintyEnsemble,
  updateTemporalModel
} from "./geoEngine.js";
import { buildEngineScenePackage } from "./engineInterop.js";
import {
  configuredBackendUrl,
  inspectBackend,
  runBackendVerification
} from "./backendClient.js";
import { mergeLayerBundle, readLayerFile, readLayerObject, summarizeLayerBundle } from "./dataAdapters.js";
import {
  buildAcquisitionPlan,
  checkAcquisitionPlan,
  createDefaultAoi,
  summarizeManifest,
  summarizePlan
} from "./sourcePlanner.js";
import { TerrainRenderer } from "./terrainRenderer.js";
import {
  applyContinentTemplateParams,
  CONTINENT_TEMPLATES,
  getContinentTemplate
} from "./continentTemplates.js";
import { setupLocalization } from "./localization.js";
import { buildScenarioSynthesis, makeScenarioSynthesisMarkdown } from "./scenarioSynthesis.js";

setupLocalization();

const APP_BOOT_STARTED_AT = performance.now();
let lastWorkerTransferDiagnostics = null;
if (typeof globalThis !== "undefined") {
  globalThis.__geoLabStartupStats = {
    mode: "startup-foundation-diagnostics",
    bootStartedAtMs: APP_BOOT_STARTED_AT,
    completed: false
  };
}

const ids = [
  "seed",
  "mapSizeKm",
  "resolution",
  "renderDetailQuality",
  "terrainDetail3DEnabled",
  "subsurface3DEnabled",
  "wind3DEnabled",
  "grid3DEnabled",
  "continentTemplate",
  "geomorphologyPreset",
  "scenicPreset",
  "relief",
  "ridgeWeight",
  "tectonics",
  "seaLevel",
  "windDirection",
  "windSpeed",
  "baseTemperature",
  "humidity",
  "latitude",
  "lapseRate",
  "permeability",
  "flowRouting",
  "riverThreshold",
  "erosionStrength",
  "verticalScale",
  "microRelief",
  "terrainComplexity",
  "terrainDiversity",
  "landscapeBlockGrid",
  "externalDataWeight",
  "vegetationFeedback",
  "calibrationStrength",
  "simulationYears",
  "currentYear",
  "dayOfYear",
  "disasterMode",
  "disasterIntensity",
  "subsurfaceLayers",
  "subsurfaceDepthM",
  "geologyComplexity",
  "aquiferRechargeScale",
  "ecosystem3DEnabled",
  "ecosystem3DRoleFocus",
  "ecosystem3DLinkMode",
  "ecosystem3DNodeScale",
  "wildlifeEnabled",
  "wildlifeAbundance",
  "wildlifeMigrationStrength",
  "wildlifeHabitatSensitivity",
  "wildlifeMaxAgents",
  "wildlife3DEnabled",
  "wildlife3DScale",
  "block3DEnabled",
  "block3DMode",
  "block3DFocus",
  "block3DScale",
  "block3DRecommendationRanks",
  "block3DRecommendationMinScore",
  "block3DAdaptivePlanLimit",
  "block3DAdaptivePlanPhaseStep",
  "block3DAdaptivePlanPhaseMode"
];

const ui = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
const sceneNode = document.getElementById("scene");
const statusNode = document.getElementById("status");
const metricStrip = document.getElementById("metricStrip");
const subtitle = document.getElementById("modelSubtitle");
const windLabel = document.getElementById("windLabel");
const riverLabel = document.getElementById("riverLabel");
const hazardLabel = document.getElementById("hazardLabel");
const runtimeLabel = document.getElementById("runtimeLabel");
const scenarioTitle = document.getElementById("scenarioTitle");
const scenarioPurpose = document.getElementById("scenarioPurpose");
const scenarioNotes = document.getElementById("scenarioNotes");
const scenarioCoverageScore = document.getElementById("scenarioCoverageScore");
const scenarioEvidenceScore = document.getElementById("scenarioEvidenceScore");
const scenarioCoverageBar = document.getElementById("scenarioCoverageBar");
const scenarioEvidenceBar = document.getElementById("scenarioEvidenceBar");
const scenarioSynthesisReadout = document.getElementById("scenarioSynthesisReadout");
const scenarioCouplingReadout = document.getElementById("scenarioCouplingReadout");
const scenarioCouplingCount = document.getElementById("scenarioCouplingCount");
const scenarioPriorityReadout = document.getElementById("scenarioPriorityReadout");
const scenarioPriorityCount = document.getElementById("scenarioPriorityCount");
const terrainPresetStatus = document.getElementById("terrainPresetStatus");
const continentTemplateStatus = document.getElementById("continentTemplateStatus");
const wildlifeReleaseSpecies = document.getElementById("wildlifeReleaseSpecies");
const wildlifeReleaseCount = document.getElementById("wildlifeReleaseCount");
const wildlifeReleaseHabitat = document.getElementById("wildlifeReleaseHabitat");
const wildlifeReleaseBlockId = document.getElementById("wildlifeReleaseBlockId");
const wildlifeReleaseQueue = document.getElementById("wildlifeReleaseQueue");
const ecosystemFunctionReadout = document.getElementById("ecosystemFunctionReadout");
const ecologicalRigorReadout = document.getElementById("ecologicalRigorReadout");
const physicalCouplingReadout = document.getElementById("physicalCouplingReadout");
const rustBackendReadout = document.getElementById("rustBackendReadout");
const runRustBackendAuditButton = document.getElementById("runRustBackendAudit");
const exportRustBackendAuditButton = document.getElementById("exportRustBackendAudit");
const dataStatus = document.getElementById("dataStatus");
const cellReadout = document.getElementById("cellReadout");
const viewMode = document.getElementById("viewMode");
if (viewMode?.value === "builtDamage") viewMode.value = "elevation";
const canvas = document.getElementById("analysisCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: false });
const infrastructureSelectionOverlay = document.getElementById("infrastructureSelectionOverlay");
const infrastructureSelectionReadout = document.getElementById("infrastructureSelectionReadout");
const infrastructureAddButton = document.getElementById("addInfrastructureFeature");
const magnifierCanvas = document.getElementById("magnifierCanvas");
const magnifierCtx = magnifierCanvas?.getContext("2d", { willReadFrequently: false });
const magnifierLabel = document.getElementById("magnifierLabel");
const brushMode = document.getElementById("brushMode");
const brushRadius = document.getElementById("brushRadius");
const brushPower = document.getElementById("brushPower");
const planStatus = document.getElementById("planStatus");
const calibrationAdvisorStatus = document.getElementById("calibrationAdvisorStatus");

const LOCALIZED_SURFACE_TYPES = {
  forest: "森林",
  wetland: "湿地",
  grassland: "草地",
  cropland: "耕地",
  shrubland: "灌丛",
  bare: "裸地",
  burned: "火烧迹地",
  drought: "干旱区",
  heatwave: "热浪区",
  urban_green: "城市绿地",
  open_water: "开放水面",
  custom: "自定义"
};

const LOCALIZED_INFRASTRUCTURE_TYPES = {
  urban: "城镇基底",
  village: "乡村",
  transport: "道路/交通",
  industrial: "工业",
  reservoir: "水库",
  dam: "大坝/闸",
  canal: "渠道/灌溉",
  levee: "堤防",
  highrise: "高层/塔楼",
  apartment: "居民楼/公寓",
  residential: "住宅片区",
  villa: "小洋房/联排",
  commercial: "商业/办公",
  civic: "公共建筑",
  landmark: "地标",
  hospital: "医院",
  school: "学校/园区",
  stadium: "体育场",
  airport: "机场",
  rail: "铁路",
  bridge: "桥梁",
  port: "港口",
  powerplant: "电厂",
  wastewater: "污水处理厂",
  solar_farm: "光伏场",
  wind_farm: "风电场",
  park: "公园/绿地",
  logistics: "物流园",
  greenhouse: "温室",
  quarry: "采石场/矿区",
  office_tower: "办公塔楼",
  hotel: "酒店/旅馆",
  market: "市场/商贸",
  fire_station: "消防站",
  police_station: "警署",
  data_center: "数据中心",
  substation: "变电站",
  metro_station: "地铁站",
  tunnel_portal: "隧道口",
  research_station: "科研站",
  farmstead: "农庄",
  terrace_farm: "梯田农业",
  custom: "自定义"
};

Object.assign(LOCALIZED_INFRASTRUCTURE_TYPES, {
  clinic: "\u8bca\u6240/\u6025\u8bca\u70b9",
  library: "\u56fe\u4e66\u9986",
  community_center: "\u793e\u533a\u4e2d\u5fc3",
  bus_terminal: "\u516c\u4ea4\u67a2\u7ebd",
  water_tower: "\u6c34\u5854/\u9ad8\u4f4d\u6c34\u6c60",
  observatory: "\u5929\u6587\u53f0/\u89c2\u6d4b\u7ad9",
  cable_car_station: "\u7d22\u9053\u7ad9/\u7f06\u8f66\u7ad9",
  flood_pump_station: "\u6392\u6d9d\u6cf5\u7ad9",
  desalination_plant: "\u6d77\u6c34\u6de1\u5316\u5382",
  visitor_center: "\u6e38\u5ba2\u4e2d\u5fc3",
  scenic_overlook: "\u89c2\u666f\u53f0/\u77ad\u671b\u70b9",
  trailhead: "\u767b\u5c71\u53e3/\u6b65\u9053\u5165\u53e3",
  ranger_station: "\u62a4\u6797/\u666f\u533a\u7ba1\u7406\u7ad9",
  gauging_station: "\u6c34\u6587\u6d4b\u7ad9"
});

const LOCALIZED_GEOMETRY_TYPES = {
  Point: "点",
  MultiPoint: "多点",
  LineString: "线",
  MultiLineString: "多线",
  Polygon: "面",
  MultiPolygon: "多面",
  Unknown: "未知"
};

const LOCALIZED_DISASTER_MODES = {
  none: "无",
  storm_flood: "暴雨洪水",
  drought: "干旱",
  wildfire: "野火",
  earthquake_landslide: "地震/滑坡",
  compound: "复合灾害"
};

const LOCALIZED_QUALITY_CLASSES = {
  "not-calibrated": "未校准",
  "usable-with-caution": "谨慎可用",
  "screening-only": "仅筛查",
  "diagnostic-only": "仅诊断",
  "invalid-comparison": "不可比较",
  "physically-suspect": "物理可疑",
  "demonstration-only": "演示级",
  "research-ready": "研究可用",
  "screening-ready": "筛查可用",
  ready: "就绪",
  warning: "警告",
  incomplete: "不完整"
};

const LOCALIZED_COMPARISON_SOURCES = {
  "model-outlet": "模型出口",
  "nearest-modeled-channel": "最近模型河道",
  "gage-nearest-channel": "站点最近河道"
};

let params = createDefaultParams();
let aoi = createDefaultAoi();
let model = null;
let renderer = null;
let runTimer = null;
let timePlayTimer = null;
let pendingModelRefreshMode = null;
let painting = false;
let lastPointerGrid = null;
let infrastructureRegionSelection = {
  active: false,
  dragging: false,
  start: null,
  current: null,
  bounds: null
};
let lastLocalRefinementSummary = null;
let lastSubsurfaceTransectSummary = null;
let riversVisible = true;
let vegetationVisible = true;
let uploadedLayers = null;
let externalLayers = null;
let manualInfrastructureFeatures = [];
let manualSurfaceFeatures = [];
let wildlifeReleaseBatches = [];
let wildlifeReleaseSerial = 0;
let acquisitionPlan = null;
let sourceManifest = null;
let demProductCandidates = null;
let gageCandidates = null;
let osmInfrastructure = null;
let modelWorker = null;
let workerRequestId = 0;
let modelJobSerial = 0;
const workerRequests = new Map();
const rustBackendEndpoint = configuredBackendUrl();
let rustBackendState = {
  status: "connecting",
  endpoint: rustBackendEndpoint,
  transport: rustBackendEndpoint ? "native-sidecar" : "browser-wasm",
  health: null,
  capabilities: null,
  error: null
};
let rustBackendAudit = null;
let rustBackendAuditSerial = 0;
let rustBackendAuditTimer = null;
let rustBackendModelRevision = 0;

function markModelRefreshNeeded(mode = "run") {
  pendingModelRefreshMode = mode === "build" || pendingModelRefreshMode === "build" ? "build" : "run";
}

function clearModelRefreshNeeded() {
  pendingModelRefreshMode = null;
}

async function runPendingModelRefresh(label = "参数") {
  if (pendingModelRefreshMode === "build" || !model) {
    await rebuildTerrain();
    return;
  }
  await runExistingModel(label);
}

const INFRASTRUCTURE_UI_PRESETS = {
  urban: { radius: 3.5, impervious: 0.48, runoff: 0.12, roughness: 0.08, temp: 1.6, storage: 0, retention: 0, irrigation: 0, vegetation: -0.18, demand: 80, density: 0.42, height: 28, floors: 8, landmark: 0 },
  village: { radius: 1.4, impervious: 0.16, runoff: 0.04, roughness: 0.04, temp: 0.45, storage: 0, retention: 0, irrigation: 40, vegetation: -0.06, demand: 35, density: 0.18, height: 8, floors: 2, landmark: 0 },
  transport: { radius: 0.25, impervious: 0.62, runoff: 0.09, roughness: 0.02, temp: 0.3, storage: 0, retention: 0, irrigation: 0, vegetation: -0.22, demand: 0, density: 0, height: 0, floors: 0, landmark: 0 },
  industrial: { radius: 1.8, impervious: 0.58, runoff: 0.13, roughness: 0.06, temp: 1.1, storage: 0, retention: 0, irrigation: 0, vegetation: -0.2, demand: 130, density: 0.36, height: 18, floors: 3, landmark: 0 },
  highrise: { radius: 1.2, impervious: 0.76, runoff: 0.19, roughness: 0.16, temp: 2.5, storage: 0, retention: 0, irrigation: 0, vegetation: -0.32, demand: 190, density: 0.72, height: 170, floors: 48, landmark: 0 },
  apartment: { radius: 1.6, impervious: 0.58, runoff: 0.13, roughness: 0.12, temp: 1.7, storage: 0, retention: 0, irrigation: 0, vegetation: -0.22, demand: 125, density: 0.55, height: 58, floors: 18, landmark: 0 },
  residential: { radius: 2, impervious: 0.38, runoff: 0.08, roughness: 0.08, temp: 0.9, storage: 0, retention: 0, irrigation: 20, vegetation: -0.12, demand: 75, density: 0.32, height: 16, floors: 5, landmark: 0 },
  villa: { radius: 1.1, impervious: 0.22, runoff: 0.04, roughness: 0.07, temp: 0.25, storage: 0, retention: 0, irrigation: 45, vegetation: 0.04, demand: 55, density: 0.18, height: 8, floors: 2, landmark: 0 },
  commercial: { radius: 1.1, impervious: 0.68, runoff: 0.16, roughness: 0.1, temp: 2.1, storage: 0, retention: 0, irrigation: 0, vegetation: -0.28, demand: 155, density: 0.58, height: 92, floors: 25, landmark: 0 },
  civic: { radius: 0.75, impervious: 0.42, runoff: 0.08, roughness: 0.07, temp: 0.8, storage: 0, retention: 0, irrigation: 0, vegetation: -0.1, demand: 80, density: 0.28, height: 24, floors: 6, landmark: 0 },
  landmark: { radius: 0.55, impervious: 0.5, runoff: 0.09, roughness: 0.14, temp: 0.7, storage: 0, retention: 0, irrigation: 0, vegetation: -0.08, demand: 60, density: 0.35, height: 120, floors: 32, landmark: 260 },
  hospital: { radius: 0.75, impervious: 0.52, runoff: 0.1, roughness: 0.08, temp: 1, storage: 0, retention: 0, irrigation: 0, vegetation: -0.12, demand: 180, density: 0.34, height: 38, floors: 10, landmark: 0 },
  school: { radius: 0.65, impervious: 0.38, runoff: 0.07, roughness: 0.06, temp: 0.55, storage: 0, retention: 0, irrigation: 20, vegetation: -0.02, demand: 70, density: 0.24, height: 16, floors: 4, landmark: 0 },
  stadium: { radius: 0.7, impervious: 0.56, runoff: 0.12, roughness: 0.09, temp: 0.9, storage: 0, retention: 0, irrigation: 15, vegetation: -0.18, demand: 90, density: 0.32, height: 26, floors: 5, landmark: 0 },
  airport: { radius: 2.6, impervious: 0.66, runoff: 0.15, roughness: -0.02, temp: 1.2, storage: 0, retention: 0, irrigation: 0, vegetation: -0.36, demand: 110, density: 0.12, height: 18, floors: 3, landmark: 0 },
  rail: { radius: 0.18, impervious: 0.38, runoff: 0.06, roughness: 0.01, temp: 0.15, storage: 0, retention: 0, irrigation: 0, vegetation: -0.18, demand: 0, density: 0, height: 0, floors: 0, landmark: 0 },
  bridge: { radius: 0.22, impervious: 0.56, runoff: 0.07, roughness: 0.02, temp: 0.1, storage: 0, retention: 0, irrigation: 0, vegetation: -0.12, demand: 0, density: 0, height: 9, floors: 0, landmark: 0 },
  port: { radius: 1.2, impervious: 0.64, runoff: 0.14, roughness: 0.08, temp: 1, storage: 0, retention: 0, irrigation: 0, vegetation: -0.25, demand: 95, density: 0.26, height: 22, floors: 4, landmark: 0 },
  powerplant: { radius: 1, impervious: 0.62, runoff: 0.13, roughness: 0.08, temp: 1.8, storage: 0, retention: 0, irrigation: 0, vegetation: -0.28, demand: 260, density: 0.3, height: 32, floors: 5, landmark: 85 },
  wastewater: { radius: 0.85, impervious: 0.44, runoff: 0.04, roughness: 0.04, temp: 0.25, storage: 90, retention: 0.18, irrigation: 0, vegetation: -0.08, demand: 40, density: 0.18, height: 12, floors: 2, landmark: 0 },
  solar_farm: { radius: 1.4, impervious: 0.24, runoff: 0.05, roughness: 0.03, temp: 0.45, storage: 0, retention: 0, irrigation: 0, vegetation: -0.12, demand: 0, density: 0.04, height: 3, floors: 0, landmark: 0 },
  wind_farm: { radius: 1.6, impervious: 0.08, runoff: 0.01, roughness: 0.04, temp: 0.05, storage: 0, retention: 0, irrigation: 0, vegetation: -0.04, demand: 0, density: 0.03, height: 0, floors: 0, landmark: 115 },
  park: { radius: 1.1, impervious: 0.08, runoff: -0.03, roughness: 0.05, temp: -0.35, storage: 0, retention: 0, irrigation: 70, vegetation: 0.24, demand: 0, density: 0.03, height: 5, floors: 1, landmark: 0 },
  logistics: { radius: 1.1, impervious: 0.7, runoff: 0.16, roughness: 0.04, temp: 1.1, storage: 0, retention: 0, irrigation: 0, vegetation: -0.24, demand: 95, density: 0.34, height: 16, floors: 2, landmark: 0 },
  greenhouse: { radius: 0.9, impervious: 0.34, runoff: 0.06, roughness: 0.03, temp: 0.6, storage: 0, retention: 0, irrigation: 220, vegetation: 0.06, demand: 210, density: 0.46, height: 7, floors: 1, landmark: 0 },
  quarry: { radius: 1.2, impervious: 0.18, runoff: 0.11, roughness: -0.02, temp: 0.35, storage: 0, retention: 0, irrigation: 0, vegetation: -0.5, demand: 0, density: 0.08, height: 8, floors: 1, landmark: 0 },
  office_tower: { radius: 0.85, impervious: 0.72, runoff: 0.18, roughness: 0.14, temp: 2.2, storage: 0, retention: 0, irrigation: 0, vegetation: -0.28, demand: 165, density: 0.66, height: 138, floors: 38, landmark: 0 },
  hotel: { radius: 0.8, impervious: 0.54, runoff: 0.11, roughness: 0.1, temp: 1.15, storage: 0, retention: 0, irrigation: 35, vegetation: -0.1, demand: 175, density: 0.42, height: 72, floors: 20, landmark: 0 },
  market: { radius: 0.7, impervious: 0.62, runoff: 0.14, roughness: 0.08, temp: 1.35, storage: 0, retention: 0, irrigation: 0, vegetation: -0.18, demand: 105, density: 0.42, height: 18, floors: 4, landmark: 0 },
  fire_station: { radius: 0.38, impervious: 0.46, runoff: 0.08, roughness: 0.05, temp: 0.45, storage: 0, retention: 0, irrigation: 0, vegetation: -0.06, demand: 55, density: 0.22, height: 12, floors: 2, landmark: 0 },
  police_station: { radius: 0.36, impervious: 0.44, runoff: 0.07, roughness: 0.05, temp: 0.42, storage: 0, retention: 0, irrigation: 0, vegetation: -0.05, demand: 45, density: 0.2, height: 12, floors: 3, landmark: 0 },
  data_center: { radius: 0.95, impervious: 0.64, runoff: 0.15, roughness: 0.05, temp: 1.55, storage: 20, retention: 0, irrigation: 0, vegetation: -0.22, demand: 240, density: 0.28, height: 18, floors: 2, landmark: 0 },
  substation: { radius: 0.42, impervious: 0.42, runoff: 0.07, roughness: 0.03, temp: 0.25, storage: 0, retention: 0, irrigation: 0, vegetation: -0.16, demand: 0, density: 0.12, height: 7, floors: 1, landmark: 28 },
  metro_station: { radius: 0.45, impervious: 0.58, runoff: 0.1, roughness: 0.06, temp: 0.85, storage: 0, retention: 0, irrigation: 0, vegetation: -0.12, demand: 70, density: 0.24, height: 12, floors: 2, landmark: 0 },
  tunnel_portal: { radius: 0.32, impervious: 0.3, runoff: 0.06, roughness: 0.06, temp: 0.15, storage: 0, retention: 0, irrigation: 0, vegetation: -0.1, demand: 0, density: 0.1, height: 8, floors: 1, landmark: 0 },
  research_station: { radius: 0.62, impervious: 0.28, runoff: 0.05, roughness: 0.04, temp: 0.35, storage: 30, retention: 0, irrigation: 0, vegetation: -0.04, demand: 65, density: 0.18, height: 12, floors: 2, landmark: 0 },
  farmstead: { radius: 0.8, impervious: 0.14, runoff: 0.02, roughness: 0.04, temp: 0.12, storage: 0, retention: 0, irrigation: 60, vegetation: 0.08, demand: 45, density: 0.12, height: 7, floors: 1, landmark: 0 },
  terrace_farm: { radius: 1.45, impervious: 0.06, runoff: -0.02, roughness: 0.07, temp: -0.05, storage: 0, retention: 0.08, irrigation: 110, vegetation: 0.18, demand: 0, density: 0.04, height: 4, floors: 1, landmark: 0 },
  clinic: { radius: 0.42, impervious: 0.44, runoff: 0.08, roughness: 0.05, temp: 0.55, storage: 0, retention: 0, irrigation: 0, vegetation: -0.05, demand: 95, density: 0.22, height: 14, floors: 3, landmark: 0 },
  library: { radius: 0.48, impervious: 0.34, runoff: 0.06, roughness: 0.05, temp: 0.35, storage: 0, retention: 0, irrigation: 0, vegetation: 0.02, demand: 45, density: 0.2, height: 16, floors: 4, landmark: 0 },
  community_center: { radius: 0.52, impervious: 0.36, runoff: 0.06, roughness: 0.05, temp: 0.38, storage: 0, retention: 0, irrigation: 10, vegetation: 0.02, demand: 55, density: 0.22, height: 14, floors: 3, landmark: 0 },
  bus_terminal: { radius: 0.62, impervious: 0.58, runoff: 0.11, roughness: 0.04, temp: 0.75, storage: 0, retention: 0, irrigation: 0, vegetation: -0.16, demand: 55, density: 0.2, height: 10, floors: 2, landmark: 0 },
  water_tower: { radius: 0.36, impervious: 0.18, runoff: 0.02, roughness: 0.04, temp: 0.05, storage: 180, retention: 0.08, irrigation: 0, vegetation: -0.03, demand: 10, density: 0.08, height: 8, floors: 1, landmark: 55 },
  observatory: { radius: 0.62, impervious: 0.22, runoff: 0.04, roughness: 0.04, temp: 0.2, storage: 20, retention: 0, irrigation: 0, vegetation: -0.08, demand: 35, density: 0.18, height: 16, floors: 3, landmark: 42 },
  cable_car_station: { radius: 0.42, impervious: 0.28, runoff: 0.05, roughness: 0.06, temp: 0.18, storage: 0, retention: 0, irrigation: 0, vegetation: -0.06, demand: 30, density: 0.16, height: 10, floors: 2, landmark: 24 },
  flood_pump_station: { radius: 0.55, impervious: 0.34, runoff: 0.03, roughness: 0.04, temp: 0.18, storage: 120, retention: 0.32, irrigation: 0, vegetation: -0.06, demand: 22, density: 0.18, height: 9, floors: 1, landmark: 0 },
  desalination_plant: { radius: 0.92, impervious: 0.48, runoff: 0.08, roughness: 0.05, temp: 0.55, storage: 160, retention: 0.18, irrigation: 80, vegetation: -0.16, demand: 55, density: 0.24, height: 14, floors: 2, landmark: 0 },
  visitor_center: { radius: 0.72, impervious: 0.38, runoff: 0.07, roughness: 0.05, temp: 0.45, storage: 20, retention: 0.02, irrigation: 20, vegetation: -0.04, demand: 70, density: 0.26, height: 14, floors: 2, landmark: 0 },
  scenic_overlook: { radius: 0.32, impervious: 0.14, runoff: 0.02, roughness: 0.03, temp: 0.05, storage: 0, retention: 0, irrigation: 0, vegetation: -0.015, demand: 8, density: 0.05, height: 4, floors: 1, landmark: 18 },
  trailhead: { radius: 0.38, impervious: 0.18, runoff: 0.025, roughness: 0.035, temp: 0.08, storage: 0, retention: 0.01, irrigation: 0, vegetation: -0.02, demand: 12, density: 0.07, height: 5, floors: 1, landmark: 0 },
  ranger_station: { radius: 0.48, impervious: 0.24, runoff: 0.04, roughness: 0.045, temp: 0.18, storage: 35, retention: 0.03, irrigation: 10, vegetation: -0.03, demand: 32, density: 0.16, height: 9, floors: 2, landmark: 24 },
  gauging_station: { radius: 0.28, impervious: 0.08, runoff: 0.005, roughness: 0.01, temp: 0.02, storage: 0, retention: 0.04, irrigation: 0, vegetation: -0.005, demand: 4, density: 0.03, height: 3, floors: 1, landmark: 16 },
  reservoir: { radius: 1.6, impervious: 0, runoff: -0.06, roughness: -0.03, temp: -0.25, storage: 220, retention: 0.28, irrigation: 0, vegetation: 0.04, demand: 0, density: 0, height: 0, floors: 0, landmark: 0 },
  dam: { radius: 0.75, impervious: 0.18, runoff: -0.04, roughness: 0.05, temp: 0, storage: 360, retention: 0.55, irrigation: 0, vegetation: 0, demand: 0, density: 0, height: 0, floors: 0, landmark: 0 },
  canal: { radius: 0.55, impervious: 0.04, runoff: -0.04, roughness: -0.02, temp: 0, storage: 0, retention: 0.12, irrigation: 160, vegetation: 0.12, demand: 0, density: 0, height: 0, floors: 0, landmark: 0 },
  levee: { radius: 0.35, impervious: 0.08, runoff: 0.03, roughness: 0.04, temp: 0, storage: 0, retention: 0.08, irrigation: 0, vegetation: 0, demand: 0, density: 0, height: 0, floors: 0, landmark: 0 },
  custom: { radius: 1, impervious: 0.12, runoff: 0.02, roughness: 0.02, temp: 0, storage: 0, retention: 0, irrigation: 0, vegetation: 0, demand: 0, density: 0.1, height: 10, floors: 2, landmark: 0 }
};

const CONTROL_DRAWER_TITLES = Object.freeze({
  terrain: "地形",
  data: "真实数据",
  weather: "气象",
  hydrology: "水文与地下",
  hazards: "时间与灾害",
  analysis: "图层与编辑",
  export: "导出"
});

function setupControlDrawers() {
  const shell = document.getElementById("appShell");
  const drawer = document.getElementById("controlDrawer");
  const drawerTitle = document.getElementById("drawerTitle");
  const closeButton = document.getElementById("closeControlDrawer");
  const scrim = document.getElementById("drawerScrim");
  const tabs = Array.from(document.querySelectorAll("[data-drawer-target]"));
  const panels = Array.from(document.querySelectorAll("[data-drawer]"));
  if (!shell || !drawer || !tabs.length || !panels.length) return;

  let activeDrawer = shell.dataset.activeDrawer || "terrain";
  const publishState = () => {
    if (typeof globalThis === "undefined") return;
    globalThis.__geoLabDrawerStats = {
      mode: "single-workspace-drawer",
      open: shell.classList.contains("drawer-open"),
      activeDrawer,
      visiblePanelCount: panels.filter((panel) => panel.classList.contains("is-active")).length,
      tabCount: tabs.length
    };
  };
  const selectDrawer = (nextDrawer) => {
    activeDrawer = CONTROL_DRAWER_TITLES[nextDrawer] ? nextDrawer : "terrain";
    shell.dataset.activeDrawer = activeDrawer;
    panels.forEach((panel) => panel.classList.toggle("is-active", panel.dataset.drawer === activeDrawer));
    tabs.forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.drawerTarget === activeDrawer)));
    if (drawerTitle) drawerTitle.textContent = CONTROL_DRAWER_TITLES[activeDrawer];
  };
  const openDrawer = (nextDrawer = activeDrawer) => {
    selectDrawer(nextDrawer);
    drawer.inert = false;
    shell.classList.add("drawer-open");
    drawer.setAttribute("aria-hidden", "false");
    if (scrim) scrim.hidden = false;
    publishState();
  };
  const closeDrawer = () => {
    const selectedTab = tabs.find((tab) => tab.dataset.drawerTarget === activeDrawer);
    if (drawer.contains(document.activeElement)) selectedTab?.focus();
    shell.classList.remove("drawer-open");
    drawer.inert = true;
    drawer.setAttribute("aria-hidden", "true");
    tabs.forEach((tab) => tab.setAttribute("aria-selected", "false"));
    if (scrim) scrim.hidden = true;
    publishState();
  };

  selectDrawer(activeDrawer);
  closeDrawer();
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => {
      const nextDrawer = tab.dataset.drawerTarget;
      if (shell.classList.contains("drawer-open") && nextDrawer === activeDrawer) closeDrawer();
      else openDrawer(nextDrawer);
    });
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const direction = ["ArrowUp", "ArrowLeft"].includes(event.key) ? -1 : 1;
      const nextTab = tabs[(index + direction + tabs.length) % tabs.length];
      nextTab.focus();
      openDrawer(nextTab.dataset.drawerTarget);
    });
  });
  closeButton?.addEventListener("click", closeDrawer);
  scrim?.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && shell.classList.contains("drawer-open")) closeDrawer();
  });
}
const SURFACE_PATCH_UI_PRESETS = {
  forest: { radius: 3, landCover: 43, soil: 2, vegetation: 0.86, vegetationDelta: 0, lai: 5.1, canopy: 22, rootDepth: 2.2, ksat: 36, awc: 180, impervious: 0.01, imperviousDelta: 0, precipDelta: 0, precipScale: 1.04, tempDelta: -0.35, windDelta: -0.8, windDirection: "", roughness: 0.06 },
  wetland: { radius: 2.4, landCover: 90, soil: 4, vegetation: 0.78, vegetationDelta: 0, lai: 3.4, canopy: 8, rootDepth: 1.25, ksat: 4.5, awc: 245, impervious: 0, imperviousDelta: 0, precipDelta: 70, precipScale: 1, tempDelta: -0.25, windDelta: -0.3, windDirection: "", roughness: 0.08 },
  grassland: { radius: 2.2, landCover: 71, soil: 2, vegetation: 0.52, vegetationDelta: 0, lai: 1.6, canopy: 1.2, rootDepth: 1.15, ksat: 22, awc: 130, impervious: 0.02, imperviousDelta: 0, precipDelta: 0, precipScale: 1, tempDelta: 0, windDelta: 0.2, windDirection: "", roughness: 0.01 },
  cropland: { radius: 2.8, landCover: 82, soil: 3, vegetation: 0.42, vegetationDelta: 0, lai: 1.8, canopy: 0.9, rootDepth: 0.85, ksat: 14, awc: 140, impervious: 0.04, imperviousDelta: 0, precipDelta: 0, precipScale: 1, tempDelta: 0.15, windDelta: 0.1, windDirection: "", roughness: 0 },
  shrubland: { radius: 2.4, landCover: 52, soil: 2, vegetation: 0.58, vegetationDelta: 0, lai: 2.2, canopy: 3.4, rootDepth: 1.2, ksat: 18, awc: 125, impervious: 0.02, imperviousDelta: 0, precipDelta: 0, precipScale: 1, tempDelta: 0, windDelta: -0.2, windDirection: "", roughness: 0.03 },
  bare: { radius: 1.8, landCover: 31, soil: 3, vegetation: 0.06, vegetationDelta: 0, lai: 0.12, canopy: 0, rootDepth: 0.24, ksat: 6, awc: 55, impervious: 0.02, imperviousDelta: 0, precipDelta: 0, precipScale: 1, tempDelta: 0.55, windDelta: 0.8, windDirection: "", roughness: -0.02 },
  burned: { radius: 2, landCover: 31, soil: 3, vegetation: 0.18, vegetationDelta: -0.24, lai: 0.25, canopy: 0.4, rootDepth: 0.45, ksat: 5, awc: 70, impervious: 0, imperviousDelta: 0, precipDelta: 0, precipScale: 1, tempDelta: 0.65, windDelta: 0.4, windDirection: "", roughness: -0.04 },
  drought: { radius: 3.5, landCover: "", soil: "", vegetation: "", vegetationDelta: -0.18, lai: "", canopy: "", rootDepth: "", ksat: "", awc: 80, impervious: "", imperviousDelta: 0, precipDelta: -180, precipScale: 0.78, tempDelta: 1.2, windDelta: 0.5, windDirection: "", roughness: -0.01 },
  heatwave: { radius: 3.5, landCover: "", soil: "", vegetation: "", vegetationDelta: -0.08, lai: "", canopy: "", rootDepth: "", ksat: "", awc: "", impervious: "", imperviousDelta: 0, precipDelta: 0, precipScale: 0.92, tempDelta: 2.3, windDelta: 0.4, windDirection: "", roughness: 0 },
  urban_green: { radius: 1.4, landCover: 21, soil: 2, vegetation: 0.68, vegetationDelta: 0, lai: 3.1, canopy: 9, rootDepth: 1.35, ksat: 26, awc: 155, impervious: 0.16, imperviousDelta: 0, precipDelta: 0, precipScale: 1, tempDelta: -0.55, windDelta: -0.5, windDirection: "", roughness: 0.04 },
  open_water: { radius: 1.6, landCover: 11, soil: 0, vegetation: 0, vegetationDelta: 0, lai: 0, canopy: 0, rootDepth: 0, ksat: 0, awc: 0, impervious: 0, imperviousDelta: 0, precipDelta: 20, precipScale: 1, tempDelta: -0.45, windDelta: 0.2, windDirection: "", roughness: -0.04 },
  custom: { radius: 1.5, landCover: "", soil: "", vegetation: "", vegetationDelta: 0, lai: "", canopy: "", rootDepth: "", ksat: "", awc: "", impervious: "", imperviousDelta: 0, precipDelta: 0, precipScale: 1, tempDelta: 0, windDelta: 0, windDirection: "", roughness: 0 }
};

function populateTerrainPresetOptions() {
  populateContinentTemplateOptions();
  fillPresetSelect(ui.geomorphologyPreset, GEOMORPHOLOGY_PRESETS, "geomorphology");
  fillPresetSelect(ui.scenicPreset, SCENIC_REPRODUCTION_PRESETS, "scenic");
  if (!document.getElementById("applyTerrainPreset")) {
    const buildButton = document.getElementById("buildTerrain");
    const button = document.createElement("button");
    button.id = "applyTerrainPreset";
    button.textContent = "\u5e94\u7528\u5730\u8c8c\u9884\u8bbe";
    buildButton?.parentElement?.insertBefore(button, buildButton);
  }
  populateWildlifeReleaseSpeciesOptions();
  updateContinentTemplateStatus();
  updateWildlifeReleaseReadout();
  updateEcosystemFunctionReadout();
  updateTerrainPresetStatus();
}

function populateContinentTemplateOptions() {
  if (!ui.continentTemplate) return;
  ui.continentTemplate.innerHTML = "";
  for (const template of CONTINENT_TEMPLATES) {
    const option = document.createElement("option");
    option.value = template.id;
    option.textContent = `${template.labelZh} · ${template.scopeZh}`;
    ui.continentTemplate.appendChild(option);
  }
}

function populateWildlifeReleaseSpeciesOptions() {
  if (!wildlifeReleaseSpecies) return;
  wildlifeReleaseSpecies.innerHTML = "";
  const grouped = new Map();
  for (const species of WILDLIFE_SPECIES) {
    const key = species.guild || "other";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(species);
  }
  for (const [guild, speciesRows] of grouped) {
    const group = document.createElement("optgroup");
    group.label = localizedWildlifeGuild(guild);
    for (const species of speciesRows) {
      const option = document.createElement("option");
      option.value = species.id;
      option.textContent = `${species.labelZh} · 营养级 ${format(species.trophicLevel, 1)}`;
      group.appendChild(option);
    }
    wildlifeReleaseSpecies.appendChild(group);
  }
}

function localizedWildlifeGuild(guild) {
  const labels = {
    "large-herbivore": "大型草食动物",
    "mountain-herbivore": "山地草食动物",
    "small-herbivore": "小型草食动物",
    "specialist-herbivore": "专食性草食动物",
    "riparian-herbivore": "滨岸草食动物",
    grazer: "食草动物",
    browser: "食叶动物",
    megaherbivore: "巨型草食动物",
    omnivore: "杂食动物",
    "large-omnivore": "大型杂食动物",
    "apex-predator": "顶级捕食者",
    mesopredator: "中型捕食者",
    "riparian-predator": "滨岸捕食者",
    "aerial-predator": "猛禽",
    "aerial-scavenger": "空中食腐动物",
    "marine-predator": "海洋捕食者",
    "wetland-bird": "湿地鸟类",
    "marine-bird": "海鸟",
    frugivore: "果食与种子扩散者",
    "ecosystem-engineer": "生态系统工程师"
  };
  return labels[guild] || guild;
}

function fillPresetSelect(select, presets, kind = "geomorphology") {
  if (!select) return;
  select.innerHTML = "";
  for (const preset of presets) {
    const display = terrainPresetDisplayInfo(preset, kind) || preset;
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = display.labelZh || preset.id;
    select.appendChild(option);
  }
}

populateTerrainPresetOptions();
writeParams(params);
writeAoi(aoi);
setupControlDrawers();
setupFilePickers();
boot().catch(handleBootFailure);
window.addEventListener("pagehide", disposeApplication, { capture: true });

async function boot() {
  modelWorker = createModelWorker();
  renderer = new TerrainRenderer(sceneNode);
  bindUi();
  const backendConnection = refreshRustBackendConnection();
  await rebuildTerrain();
  await backendConnection;
  scheduleRustBackendAudit();
}

function handleBootFailure(error) {
  const message = error instanceof Error ? error.message : String(error || "Unknown error");
  console.error("GeoLab startup failed", error);
  setStatus(`启动失败：${message}`);
  if (typeof globalThis !== "undefined") {
    globalThis.__geoLabStartupStats = {
      ...(globalThis.__geoLabStartupStats || {}),
      completed: false,
      failed: true,
      error: message
    };
  }
}

function setupFilePickers() {
  for (const button of document.querySelectorAll("[data-file-picker-for]")) {
    const inputId = button.dataset.filePickerFor;
    const input = document.getElementById(inputId);
    const status = document.querySelector(`[data-file-status-for="${inputId}"]`);
    if (!input || !status) continue;
    const update = () => {
      const files = Array.from(input.files || []);
      status.textContent = files.length === 0
        ? "未选择文件"
        : files.length === 1
          ? `已选择：${files[0].name}`
          : `已选择 ${files.length} 个文件`;
      status.title = files.map((file) => file.name).join(", ");
    };
    button.addEventListener("click", () => input.click());
    input.addEventListener("change", update);
    update();
  }
}

function disposeApplication(event) {
  if (event?.persisted) return;
  clearTimeout(runTimer);
  if (timePlayTimer) clearInterval(timePlayTimer);
  timePlayTimer = null;
  modelJobSerial += 1;
  workerRequests.clear();
  modelWorker?.terminate?.();
  modelWorker = null;
  renderer?.dispose?.();
  renderer = null;
}

function createModelWorker() {
  if (!window.Worker) return null;
  try {
    const worker = new Worker(new URL("./modelWorker.js", import.meta.url), { type: "module" });
    worker.addEventListener("message", (event) => {
      const { id, ok, model: nextModel, transferDiagnostics, error } = event.data || {};
      const request = workerRequests.get(id);
      if (!request) return;
      workerRequests.delete(id);
      if (ok) {
        lastWorkerTransferDiagnostics = transferDiagnostics || null;
        if (typeof globalThis !== "undefined") globalThis.__geoLabWorkerTransferStats = lastWorkerTransferDiagnostics;
        request.resolve(nextModel);
      }
      else request.reject(new Error(error || "Worker failed"));
    });
    worker.addEventListener("error", (event) => {
      for (const request of workerRequests.values()) {
        request.reject(new Error(event.message || "Worker error"));
      }
      workerRequests.clear();
    });
    return worker;
  } catch {
    return null;
  }
}

function bindUi() {
  document.getElementById("buildTerrain").addEventListener("click", rebuildTerrain);
  document.getElementById("applyContinentTemplate")?.addEventListener("click", applyContinentTemplateSelection);
  document.getElementById("applyTerrainPreset")?.addEventListener("click", applyTerrainPresetSelection);
  ui.continentTemplate?.addEventListener("change", updateContinentTemplateStatus);
  ui.geomorphologyPreset?.addEventListener("change", updateTerrainPresetStatus);
  ui.scenicPreset?.addEventListener("change", updateTerrainPresetStatus);
  document.getElementById("runModel").addEventListener("click", () => runExistingModel("重新演算"));
  document.getElementById("applyErosion").addEventListener("click", applyErosion);
  document.getElementById("resetCamera").addEventListener("click", () => renderer.resetCamera());
  document.getElementById("loadDataLayers").addEventListener("click", loadExternalDataLayers);
  document.getElementById("buildAcquisitionPlan").addEventListener("click", buildCurrentAcquisitionPlan);
  document.getElementById("exportAcquisitionPlan").addEventListener("click", exportAcquisitionPlan);
  document.getElementById("checkAcquisitionSources").addEventListener("click", checkAcquisitionSources);
  document.getElementById("exportSourceManifest").addEventListener("click", exportSourceManifest);
  document.getElementById("findDemProducts").addEventListener("click", findDemProductCandidates);
  document.getElementById("fetchDaymetMeteorology").addEventListener("click", fetchDaymetMeteorology);
  document.getElementById("fetchOsmInfrastructure").addEventListener("click", fetchOsmInfrastructure);
  document.getElementById("findProxyGages").addEventListener("click", findProxyGageCandidates);
  document.getElementById("fetchProxyCalibration").addEventListener("click", fetchProxyCalibration);
  document.getElementById("applyCalibrationDischarge").addEventListener("click", () => applyCalibrationAdvisorSuggestion("dischargeScaleOnly"));
  document.getElementById("applyCalibrationSplit").addEventListener("click", () => applyCalibrationAdvisorSuggestion("splitRunoffAndRouting"));
  document.getElementById("clearDataLayers").addEventListener("click", () => {
    uploadedLayers = null;
    externalLayers = null;
    manualInfrastructureFeatures = [];
    manualSurfaceFeatures = [];
    osmInfrastructure = null;
    updateManualInfrastructureReadout();
    updateInfrastructureSelectionReadout();
    updateManualSurfaceReadout();
    dataStatus.textContent = summarizeLayerBundle(externalLayers);
    rebuildTerrain();
  });
  document.getElementById("addSurfacePatchFeature").addEventListener("click", addManualSurfaceFeature);
  document.getElementById("clearSurfacePatchFeatures").addEventListener("click", clearManualSurfaceFeatures);
  document.getElementById("exportSurfacePatchFeatures").addEventListener("click", exportManualSurfaceFeatures);
  document.getElementById("surfacePatchType").addEventListener("change", applySurfacePatchPreset);
  document.getElementById("surfacePatchGeometry").addEventListener("change", () => updateSurfacePatchGeometryTemplate(true));
  document.getElementById("surfacePatchCoordinates").addEventListener("input", (event) => {
    event.currentTarget.dataset.manual = "true";
  });
  ["surfacePatchX", "surfacePatchY", "surfacePatchRadius"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => updateSurfacePatchGeometryTemplate(false));
  });
  infrastructureAddButton?.addEventListener("click", addManualInfrastructureFeature);
  document.getElementById("applyAdaptiveInfrastructurePlan").addEventListener("click", applyAdaptiveInfrastructurePlan);
  document.getElementById("clearInfrastructureFeatures").addEventListener("click", clearManualInfrastructureFeatures);
  document.getElementById("exportInfrastructureFeatures").addEventListener("click", exportManualInfrastructureFeatures);
  document.getElementById("exportAdaptiveInfrastructurePlan").addEventListener("click", exportAdaptiveInfrastructurePlan);
  document.getElementById("exportAdaptiveInfrastructurePlanCSV").addEventListener("click", exportAdaptiveInfrastructurePlanCSV);
  document.getElementById("selectInfrastructureRegion").addEventListener("click", toggleInfrastructureRegionSelection);
  document.getElementById("infraType").addEventListener("change", () => {
    applyInfrastructurePreset();
    updateInfrastructureSelectionReadout();
  });
  document.getElementById("infraGeometry").addEventListener("change", () => {
    clearInfrastructureRegionSelection();
    updateManualGeometryTemplate(true);
  });
  document.getElementById("infraCoordinates").addEventListener("input", (event) => {
    event.currentTarget.dataset.manual = "true";
    clearInfrastructureRegionSelection();
  });
  ["infraX", "infraY", "infraRadius"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => {
      clearInfrastructureRegionSelection();
      updateManualGeometryTemplate(false);
    });
  });
  applyInfrastructurePreset();
  updateManualGeometryTemplate(true);
  updateManualInfrastructureReadout();
  updateInfrastructureSelectionReadout();
  applySurfacePatchPreset();
  updateSurfacePatchGeometryTemplate(true);
  updateManualSurfaceReadout();
  document.getElementById("randomSeedButton").addEventListener("click", () => {
    ui.seed.value = Math.floor(10000 + Math.random() * 900000);
    rebuildTerrain();
  });

  [
    "seaLevel",
    "windDirection",
    "windSpeed",
    "baseTemperature",
    "humidity",
    "latitude",
    "lapseRate",
    "permeability",
    "riverThreshold",
    "erosionStrength",
    "verticalScale",
    "microRelief",
    "externalDataWeight",
    "vegetationFeedback",
    "calibrationStrength"
  ].forEach((id) => {
    ui[id].addEventListener("input", () => {
      params = readParams();
      updateLabels();
      scheduleRun();
    });
  });

  ["simulationYears", "currentYear", "dayOfYear", "disasterIntensity"].forEach((id) => {
    ui[id].addEventListener("input", () => {
      if (id === "simulationYears") syncCurrentYearRange();
      params = readParams();
      updateLabels();
      scheduleTemporalRun();
    });
  });

  ui.flowRouting.addEventListener("change", () => {
    params = readParams();
    updateLabels();
    scheduleRun();
  });

  ui.disasterMode.addEventListener("change", () => {
    params = readParams();
    updateLabels();
    scheduleTemporalRun();
  });
  document.getElementById("playTime").addEventListener("click", toggleTimePlayback);
  document.getElementById("queueWildlifeRelease")?.addEventListener("click", queueWildlifeReleaseBatch);
  document.getElementById("executeWildlifeReleases")?.addEventListener("click", executeWildlifeReleaseBatches);
  document.getElementById("clearWildlifeReleases")?.addEventListener("click", clearWildlifeReleaseBatches);
  document.getElementById("exportEcologicalIntegrity")?.addEventListener("click", exportEcologicalIntegrity);
  document.getElementById("exportEcologicalIntegrityCSV")?.addEventListener("click", exportEcologicalIntegrityCSV);

  ["seed", "mapSizeKm", "resolution", "relief", "ridgeWeight", "tectonics"].forEach((id) => {
    ui[id].addEventListener("change", () => {
      if (id === "mapSizeKm") {
        document.getElementById("aoiSizeKm").value = ui.mapSizeKm.value;
        clearInfrastructureRegionSelection();
        updateManualGeometryTemplate(true);
        updateSurfacePatchGeometryTemplate(true);
      }
      params = readParams();
      updateLabels();
      scheduleTerrainRebuild();
    });
  });

  ["terrainComplexity", "terrainDiversity"].forEach((id) => {
    ui[id]?.addEventListener("input", () => {
      params = readParams();
      updateLabels();
      scheduleTerrainRebuild();
    });
  });

  ui.renderDetailQuality?.addEventListener("change", refreshRenderDetailControls);

  ["landscapeBlockGrid", "wildlifeEnabled", "wildlifeMaxAgents"].forEach((id) => {
    ui[id]?.addEventListener("change", () => {
      params = readParams();
      scheduleRun();
    });
  });
  ["wildlifeAbundance", "wildlifeMigrationStrength", "wildlifeHabitatSensitivity"].forEach((id) => {
    ui[id]?.addEventListener("input", () => {
      params = readParams();
      scheduleRun();
    });
  });

  ["localWindowCells", "localRefinementFactor"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", () => {
      lastLocalRefinementSummary = null;
      if (lastPointerGrid) drawMagnifier(lastPointerGrid.gx, lastPointerGrid.gy);
    });
  });
  ["subsurfaceTransectMode", "subsurfaceTransectSamples"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", () => {
      lastSubsurfaceTransectSummary = null;
    });
  });

  ["ecosystem3DEnabled", "ecosystem3DRoleFocus", "ecosystem3DLinkMode"].forEach((id) => {
    ui[id]?.addEventListener("change", refreshInfrastructure3DControls);
  });
  ui.ecosystem3DNodeScale?.addEventListener("input", refreshInfrastructure3DControls);
  ui.wildlife3DEnabled?.addEventListener("change", refreshWildlife3DControls);
  ui.wildlife3DScale?.addEventListener("input", refreshWildlife3DControls);
  ["block3DEnabled", "block3DMode", "block3DFocus", "block3DRecommendationRanks", "block3DAdaptivePlanLimit", "block3DAdaptivePlanPhaseStep", "block3DAdaptivePlanPhaseMode"].forEach((id) => {
    ui[id]?.addEventListener("change", refreshInfrastructure3DControls);
  });
  ui.block3DScale?.addEventListener("input", refreshInfrastructure3DControls);
  ui.block3DRecommendationMinScore?.addEventListener("input", refreshInfrastructure3DControls);
  ["terrainDetail3DEnabled", "subsurface3DEnabled", "wind3DEnabled", "grid3DEnabled"].forEach((id) => {
    ui[id]?.addEventListener("change", refreshSceneVisibilityControls);
  });

  viewMode.addEventListener("change", () => {
    if (!model) return;
    renderer.updateView(viewMode.value);
    renderer.updateSceneVisibility?.(readParams(), viewMode.value);
    drawAnalysis();
  });

  document.getElementById("toggleRivers").addEventListener("click", (event) => {
    riversVisible = !riversVisible;
    event.currentTarget.setAttribute("aria-pressed", String(riversVisible));
    event.currentTarget.textContent = riversVisible ? "河流显示" : "河流隐藏";
    renderer.setRiversVisible(riversVisible);
  });

  document.getElementById("toggleVegetation").addEventListener("click", (event) => {
    vegetationVisible = !vegetationVisible;
    event.currentTarget.setAttribute("aria-pressed", String(vegetationVisible));
    event.currentTarget.textContent = vegetationVisible ? "植被显示" : "植被隐藏";
    renderer.setVegetationVisible(vegetationVisible);
  });

  document.getElementById("exportGeoJSON").addEventListener("click", () => {
    download("geolab-128-rivers.geojson", "application/geo+json", JSON.stringify(makeRiverGeoJSON(model, params), null, 2));
  });
  document.getElementById("exportCSV").addEventListener("click", () => {
    download("geolab-128-grid.csv", "text/csv;charset=utf-8", makeGridCSV(model));
  });
  document.getElementById("exportSubsurfaceVoxels").addEventListener("click", () => {
    download("geolab-128-subsurface-voxels.csv", "text/csv;charset=utf-8", makeSubsurfaceVoxelCSV(model));
  });
  document.getElementById("exportSubsurfaceCubeLedger").addEventListener("click", exportSubsurfaceCubeLedger);
  document.getElementById("exportSubsurfaceColumnReasoning").addEventListener("click", exportSubsurfaceColumnReasoning);
  document.getElementById("exportSubsurfaceTransect").addEventListener("click", exportSubsurfaceTransect);
  document.getElementById("exportLocalRefinement").addEventListener("click", exportLocalRefinement);
  document.getElementById("exportWatershed").addEventListener("click", exportWatershed);
  document.getElementById("exportWatershedCSV").addEventListener("click", exportWatershedCSV);
  document.getElementById("exportResearchAudit").addEventListener("click", exportResearchAudit);
  document.getElementById("exportResearchAuditCSV").addEventListener("click", exportResearchAuditCSV);
  document.getElementById("exportSpatialAlignment").addEventListener("click", exportSpatialAlignment);
  document.getElementById("exportTerrainProcessAudit").addEventListener("click", exportTerrainProcessAudit);
  document.getElementById("exportTerrainProcessAuditCSV").addEventListener("click", exportTerrainProcessAuditCSV);
  document.getElementById("exportResearchValidation").addEventListener("click", exportResearchValidation);
  document.getElementById("exportResearchValidationCSV").addEventListener("click", exportResearchValidationCSV);
  document.getElementById("exportInfrastructureAtlas").addEventListener("click", exportInfrastructureAtlas);
  document.getElementById("exportInfrastructureAtlasCSV").addEventListener("click", exportInfrastructureAtlasCSV);
  document.getElementById("exportInfrastructureBlockState").addEventListener("click", exportInfrastructureBlockState);
  document.getElementById("exportInfrastructureBlockStateCSV").addEventListener("click", exportInfrastructureBlockStateCSV);
  document.getElementById("exportInfrastructureCellPlacement").addEventListener("click", exportInfrastructureCellPlacement);
  document.getElementById("exportInfrastructureCellPlacementCSV").addEventListener("click", exportInfrastructureCellPlacementCSV);
  document.getElementById("exportBlockDetailAtlas").addEventListener("click", exportBlockDetailAtlas);
  document.getElementById("exportBlockDetailAtlasCSV").addEventListener("click", exportBlockDetailAtlasCSV);
  document.getElementById("exportInfrastructureSuitabilityMatrix").addEventListener("click", exportInfrastructureSuitabilityMatrix);
  document.getElementById("exportInfrastructureSuitabilityMatrixCSV").addEventListener("click", exportInfrastructureSuitabilityMatrixCSV);
  document.getElementById("exportBuiltResilience").addEventListener("click", exportBuiltResilience);
  document.getElementById("exportBuiltResilienceCSV").addEventListener("click", exportBuiltResilienceCSV);
  document.getElementById("exportBuiltRecovery").addEventListener("click", exportBuiltRecovery);
  document.getElementById("exportBuiltRecoveryCSV").addEventListener("click", exportBuiltRecoveryCSV);
  document.getElementById("exportScenarioSynthesis")?.addEventListener("click", exportScenarioSynthesis);
  document.getElementById("exportScenarioBrief")?.addEventListener("click", exportScenarioBrief);
  document.getElementById("exportPhysicalCoupling")?.addEventListener("click", exportPhysicalCoupling);
  document.getElementById("exportPhysicalCouplingCSV")?.addEventListener("click", exportPhysicalCouplingCSV);
  runRustBackendAuditButton?.addEventListener("click", () => runRustBackendAudit({ manual: true }));
  exportRustBackendAuditButton?.addEventListener("click", exportRustBackendAudit);
  document.getElementById("exportUnityScene")?.addEventListener("click", () => exportEngineScene("unity"));
  document.getElementById("exportUnrealScene")?.addEventListener("click", () => exportEngineScene("unreal"));
  [scenarioTitle, scenarioPurpose, scenarioNotes].forEach((control) => control?.addEventListener("input", updateScenarioSynthesis));
  window.addEventListener("geolab:localechange", updateScenarioSynthesis);
  window.addEventListener("geolab:localechange", updateEcosystemFunctionReadout);
  window.addEventListener("geolab:localechange", updateRustBackendReadout);
  document.getElementById("exportSettings").addEventListener("click", () => {
    download(
      "geolab-128-settings.json",
      "application/json",
      JSON.stringify(
        {
          params: exportableParams(),
          stats: model.stats,
          externalSources: externalLayers?.sources || [],
          meteorologySummaries: externalLayers?.metSummary || [],
          osmInfrastructure,
          manualSurfacePatches: manualSurfaceCollection(),
          scenarioSynthesis: currentScenarioSynthesis(),
          generatedAt: new Date().toISOString()
        },
        null,
        2
      )
    );
  });
  document.getElementById("exportDataSchema").addEventListener("click", exportDataSchema);
  document.getElementById("exportQualityReport").addEventListener("click", exportQualityReport);
  document.getElementById("exportUncertaintyReport").addEventListener("click", exportUncertaintyReport);
  document.getElementById("exportTimeSeries").addEventListener("click", exportTimeSeries);
  document.getElementById("exportPhysicalTimeSeries").addEventListener("click", exportPhysicalTimeSeries);
  document.getElementById("exportPhysicalTimeSeriesCSV").addEventListener("click", exportPhysicalTimeSeriesCSV);
  document.getElementById("exportHazardEvent").addEventListener("click", exportHazardEvent);

  canvas.addEventListener("pointerdown", (event) => {
    if (infrastructureRegionSelection.active) {
      canvas.setPointerCapture(event.pointerId);
      beginInfrastructureRegionSelection(event);
      return;
    }
    painting = true;
    canvas.setPointerCapture(event.pointerId);
    paintAt(event);
  });
  canvas.addEventListener("pointermove", (event) => {
    updateReadout(event);
    if (infrastructureRegionSelection.active) {
      if (infrastructureRegionSelection.dragging) updateInfrastructureRegionSelection(event);
      return;
    }
    if (painting) paintAt(event);
  });
  canvas.addEventListener("pointerup", (event) => {
    if (infrastructureRegionSelection.active) {
      finishInfrastructureRegionSelection(event);
      canvas.releasePointerCapture(event.pointerId);
      return;
    }
    painting = false;
    canvas.releasePointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointerleave", () => {
    if (infrastructureRegionSelection.active) return;
    painting = false;
  });
}

function refreshInfrastructure3DControls() {
  params = readParams();
  renderer?.updateInfrastructure3DOptions?.(params);
}

function refreshWildlife3DControls() {
  params = readParams();
  renderer?.updateWildlife3DOptions?.(params);
}

function refreshSceneVisibilityControls() {
  params = readParams();
  renderer?.updateSceneVisibility?.(params, viewMode?.value || "elevation");
}

function refreshRenderDetailControls() {
  params = readParams();
  renderer?.updateDetailQualityOptions?.(params, viewMode?.value || "elevation");
}

async function loadExternalDataLayers() {
  const specs = [
    ["demFile", "dem"],
    ["soilFile", "soil"],
    ["subsurfaceFile", "subsurface"],
    ["landCoverFile", "landCover"],
    ["surfacePatchFile", "surfaceScenario"],
    ["metFile", "met"],
    ["flowlineFile", "hydrology"],
    ["infrastructureFile", "infrastructure"],
    ["calibrationFile", "calibration"]
  ];
  try {
    setStatus("读取真实数据层");
    let loaded = 0;
    for (const [id, role] of specs) {
      const files = Array.from(document.getElementById(id).files || []);
      for (const file of files) {
        const parsed = await readLayerFile(file, role);
        uploadedLayers = mergeLayerBundle(uploadedLayers, parsed);
        loaded += 1;
      }
    }
    if (loaded === 0) {
      setStatus("未选择数据文件");
      return;
    }
    rebuildExternalLayerBundle();
    dataStatus.textContent = summarizeLayerBundle(externalLayers);
    await rebuildTerrain();
  } catch (error) {
    console.error(error);
    setStatus(`数据读取失败: ${error.message}`);
  }
}

async function fetchProxyCalibration() {
  const nextAoi = readAoi();
  if (!String(nextAoi.gageSite || "").trim()) {
    setStatus("请先填写 USGS 水文站号，再获取校准。");
    return;
  }
  if (!String(nextAoi.proxyBaseUrl || "").trim()) {
    setStatus("请先填写已部署的 Cloudflare Worker URL，再获取校准。");
    return;
  }
  aoi = nextAoi;
  acquisitionPlan = buildAcquisitionPlan(aoi);
  sourceManifest = null;
  const source = acquisitionPlan.sources.find((item) => item.id === "usgs_water_services_legacy");
  const url = source?.normalizedProxyUrl;
  if (!url) {
    setStatus("没有可用的 Cloudflare 标准化校准 URL。");
    return;
  }
  try {
    setStatus("正在通过 Cloudflare 获取 USGS 校准数据。");
    planStatus.textContent = `正在获取 ${nextAoi.gageSite} 日流量...`;
    const response = await fetch(url, { headers: { accept: "application/json" } });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
    const parsed = readLayerObject(payload?.calibration ? { calibration: payload.calibration } : payload, "calibration", `cloudflare-usgs-${nextAoi.gageSite}.json`);
    uploadedLayers = mergeLayerBundle(uploadedLayers, parsed);
    rebuildExternalLayerBundle();
    dataStatus.textContent = summarizeLayerBundle(externalLayers);
    const count = externalLayers?.calibration?.observedSeries?.recordCount || payload?.calibration?.observedSeries?.recordCount || 0;
    planStatus.textContent = `已从 Cloudflare 加载 USGS 校准数据（${count} 条日值）。`;
    await rebuildTerrain();
  } catch (error) {
    console.error(error);
    planStatus.textContent = `Cloudflare 校准获取失败: ${error.message}`;
    setStatus("Cloudflare 校准获取失败。");
  }
}

async function findDemProductCandidates() {
  const nextAoi = readAoi();
  if (!String(nextAoi.proxyBaseUrl || "").trim()) {
    setStatus("请先填写已部署的 Cloudflare Worker URL，再查找 DEM 产品。");
    return;
  }
  try {
    aoi = nextAoi;
    const url = proxyEndpointUrl(nextAoi.proxyBaseUrl, "/tnm/dem-products");
    url.searchParams.set("lat", String(nextAoi.lat));
    url.searchParams.set("lon", String(nextAoi.lon));
    url.searchParams.set("sizeKm", String(nextAoi.sizeKm));
    url.searchParams.set("limit", "16");
    setStatus("正在通过 Cloudflare 查找 USGS 3DEP DEM 产品。");
    planStatus.textContent = "正在排序 USGS 3DEP DEM 候选产品...";
    const response = await fetch(url, { headers: { accept: "application/json" } });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
    demProductCandidates = payload;
    acquisitionPlan = buildAcquisitionPlan(aoi);
    sourceManifest = null;
    const best = payload?.candidates?.[0] || null;
    const summary = best
      ? `找到 ${payload.count || payload.candidates.length} 个 DEM 产品；最佳候选 ${best.estimatedNativeCellSizeM || "未知"} m ${best.format || "产品"}（评分 ${format(best.score, 2)}）。`
      : "当前 AOI 未找到 TNM DEM 产品。";
    planStatus.textContent = summary;
    setStatus("DEM 产品查找完成。");
  } catch (error) {
    console.error(error);
    planStatus.textContent = `DEM 产品查找失败: ${error.message}`;
    setStatus("DEM 产品查找失败。");
  }
}

async function fetchDaymetMeteorology() {
  const nextAoi = readAoi();
  if (!String(nextAoi.proxyBaseUrl || "").trim()) {
    setStatus("请先填写已部署的 Cloudflare Worker URL，再获取 Daymet 气象。");
    return;
  }
  try {
    aoi = nextAoi;
    acquisitionPlan = buildAcquisitionPlan(aoi);
    sourceManifest = null;
    const url = proxyEndpointUrl(nextAoi.proxyBaseUrl, "/daymet/grid-sample");
    url.searchParams.set("lat", String(nextAoi.lat));
    url.searchParams.set("lon", String(nextAoi.lon));
    url.searchParams.set("sizeKm", String(nextAoi.sizeKm));
    url.searchParams.set("startYear", String(nextAoi.startYear));
    url.searchParams.set("endYear", String(nextAoi.endYear));
    url.searchParams.set("grid", "3");
    setStatus("正在通过 Cloudflare 获取 Daymet 气象。");
    planStatus.textContent = "正在获取 Daymet 采样气象网格...";
    const response = await fetch(url, { headers: { accept: "application/json" } });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
    const sourceName = payload?.sourceName || `cloudflare-daymet-${nextAoi.startYear}-${nextAoi.endYear}.json`;
    const parsed = readLayerObject(payload?.meteorology || payload, "met", sourceName);
    uploadedLayers = mergeLayerBundle(uploadedLayers, parsed);
    rebuildExternalLayerBundle();
    dataStatus.textContent = summarizeLayerBundle(externalLayers);
    const summary = payload?.meteorology?.metSummary || parsed.metSummary || {};
    const dailyCount = summary.dailySeries?.length || 0;
    planStatus.textContent = `已加载 Daymet 气象（${summary.width || 3}x${summary.height || 3}，${dailyCount} 条日尺度强迫）。`;
    await rebuildTerrain();
  } catch (error) {
    console.error(error);
    planStatus.textContent = `Daymet 气象获取失败: ${error.message}`;
    setStatus("Daymet 气象获取失败。");
  }
}

async function fetchOsmInfrastructure() {
  const nextAoi = readAoi();
  if (!String(nextAoi.proxyBaseUrl || "").trim()) {
    setStatus("请先填写已部署的 Cloudflare Worker URL，再获取 OSM 设施。");
    return;
  }
  try {
    aoi = nextAoi;
    acquisitionPlan = buildAcquisitionPlan(aoi);
    sourceManifest = null;
    const url = proxyEndpointUrl(nextAoi.proxyBaseUrl, "/osm/infrastructure");
    url.searchParams.set("lat", String(nextAoi.lat));
    url.searchParams.set("lon", String(nextAoi.lon));
    url.searchParams.set("sizeKm", String(nextAoi.sizeKm));
    url.searchParams.set("limit", "900");
    setStatus("正在通过 Cloudflare 获取 OSM 人造设施。");
    planStatus.textContent = "正在获取 OSM 建筑、交通和水利设施...";
    const response = await fetch(url, { headers: { accept: "application/json" } });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
    const sourceName = payload?.sourceName || `cloudflare-osm-infrastructure-${Math.round(nextAoi.sizeKm)}km.geojson`;
    const parsed = readLayerObject(payload?.infrastructure || payload, "infrastructure", sourceName);
    uploadedLayers = mergeLayerBundle(uploadedLayers, parsed);
    osmInfrastructure = payload;
    rebuildExternalLayerBundle();
    dataStatus.textContent = summarizeLayerBundle(externalLayers);
    const summary = payload?.summary || payload?.infrastructure?.properties?.summary || {};
    const classes = Object.entries(summary.classCounts || {})
      .slice(0, 4)
      .map(([key, value]) => `${localizedLabel(LOCALIZED_INFRASTRUCTURE_TYPES, key)}:${value}`)
      .join(", ");
    planStatus.textContent = `已加载 OSM 设施（${summary.featureCount || parsed.infrastructure?.infrastructureCount || 0} 个要素${classes ? `，${classes}` : ""}）。`;
    await rebuildTerrain();
  } catch (error) {
    console.error(error);
    planStatus.textContent = `OSM 设施获取失败: ${error.message}`;
    setStatus("OSM 设施获取失败。");
  }
}

async function findProxyGageCandidates() {
  const nextAoi = readAoi();
  if (!String(nextAoi.proxyBaseUrl || "").trim()) {
    setStatus("请先填写已部署的 Cloudflare Worker URL，再查找 USGS 水文站。");
    return;
  }
  try {
    aoi = nextAoi;
    const url = proxyEndpointUrl(nextAoi.proxyBaseUrl, "/usgs/gages");
    url.searchParams.set("lat", String(nextAoi.lat));
    url.searchParams.set("lon", String(nextAoi.lon));
    url.searchParams.set("sizeKm", String(nextAoi.sizeKm));
    url.searchParams.set("start", `${nextAoi.startYear}-01-01`);
    url.searchParams.set("end", `${nextAoi.endYear}-12-31`);
    setStatus("正在通过 Cloudflare 查找 USGS 水文站。");
    planStatus.textContent = "正在查找 USGS 日流量水文站候选...";
    const response = await fetch(url, { headers: { accept: "application/json" } });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
    gageCandidates = payload;
    const best = payload?.candidates?.[0] || null;
    if (best?.siteCode) {
      document.getElementById("aoiGageSite").value = best.siteCode;
      aoi = readAoi();
      acquisitionPlan = buildAcquisitionPlan(aoi);
      sourceManifest = null;
    }
    const summary = best
      ? `找到 ${payload.count || payload.candidates.length} 个 USGS 水文站；已选择 ${best.siteCode}（${format(best.distanceKm, 1)} km，评分 ${format(best.score, 2)}）。`
      : "当前 AOI 未找到 USGS 日流量水文站。";
    planStatus.textContent = summary;
    setStatus("USGS 水文站查找完成。");
  } catch (error) {
    console.error(error);
    planStatus.textContent = `USGS 水文站查找失败: ${error.message}`;
    setStatus("USGS 水文站查找失败。");
  }
}

async function applyCalibrationAdvisorSuggestion(mode) {
  const advisor = model?.stats?.calibration?.advisor;
  const suggestion = advisor?.parameterSuggestion?.[mode];
  if (!suggestion) {
    setStatus("当前没有可用的校准顾问建议。");
    return;
  }
  const previousCalibration = externalLayers?.calibration || uploadedLayers?.calibration || {};
  const sourceName = `calibration-advisor-${mode}`;
  uploadedLayers = {
    ...(uploadedLayers || {}),
    stamp: (uploadedLayers?.stamp || 0) + 1,
    sources: [...(uploadedLayers?.sources || []), sourceName],
    calibration: {
      ...previousCalibration,
      runoffMultiplier: Number(suggestion.runoffMultiplier),
      dischargeScale: Number(suggestion.dischargeScale),
      appliedCalibrationAdvisor: {
        mode,
        qualityClass: advisor.qualityClass,
        overallScore: advisor.overallScore,
        comparisonSource: model?.stats?.calibration?.comparison?.comparisonSource || null,
        previousRunoffMultiplier: advisor.parameterSuggestion.current.runoffMultiplier,
        previousDischargeScale: advisor.parameterSuggestion.current.dischargeScale,
        appliedRunoffMultiplier: Number(suggestion.runoffMultiplier),
        appliedDischargeScale: Number(suggestion.dischargeScale),
        correctionFactor: advisor.parameterSuggestion.correctionFactor,
        appliedAt: new Date().toISOString()
      }
    }
  };
  rebuildExternalLayerBundle();
  dataStatus.textContent = summarizeLayerBundle(externalLayers);
  setStatus(`已应用校准顾问建议: ${mode}。`);
  await rebuildTerrain();
}

function rebuildExternalLayerBundle() {
  let next = uploadedLayers;
  if (manualSurfaceFeatures.length) {
    const parsed = readLayerObject(manualSurfaceCollection(), "surfaceScenario", "manual-surface-patches.geojson");
    next = mergeLayerBundle(next, parsed);
  }
  if (manualInfrastructureFeatures.length) {
    const parsed = readLayerObject(manualInfrastructureCollection(), "infrastructure", "manual-infrastructure.geojson");
    next = mergeLayerBundle(next, parsed);
  }
  externalLayers = next;
  markModelRefreshNeeded("build");
}

async function addManualSurfaceFeature() {
  const feature = readManualSurfaceFeature();
  manualSurfaceFeatures.push(feature);
  rebuildExternalLayerBundle();
  updateManualSurfaceReadout();
  dataStatus.textContent = summarizeLayerBundle(externalLayers);
  setStatus("已应用手工地表/气候情景。");
  await rebuildTerrain();
}

async function clearManualSurfaceFeatures() {
  manualSurfaceFeatures = [];
  rebuildExternalLayerBundle();
  updateManualSurfaceReadout();
  dataStatus.textContent = summarizeLayerBundle(externalLayers);
  setStatus("已清除手工地表情景。");
  await rebuildTerrain();
}

function exportManualSurfaceFeatures() {
  download(
    "geolab-128-manual-surface-patches.geojson",
    "application/geo+json",
    JSON.stringify(manualSurfaceCollection(), null, 2)
  );
}

function readManualSurfaceFeature() {
  const type = String(document.getElementById("surfacePatchType").value || "custom");
  const geometryType = String(document.getElementById("surfacePatchGeometry")?.value || "Polygon");
  const mapSizeKm = currentMapSizeKm();
  const x = clamp(Number(document.getElementById("surfacePatchX").value), 0, mapSizeKm);
  const y = clamp(Number(document.getElementById("surfacePatchY").value), 0, mapSizeKm);
  const properties = {
    patch_type: type,
    surface_type: type,
    radius_km: optionalNumber("surfacePatchRadius", 0.05, 48),
    land_cover: optionalNumber("surfacePatchLandCover", 0, 100),
    soil_group: optionalNumber("surfacePatchSoilGroup", 0, 4),
    vegetation_fraction: optionalNumber("surfacePatchVegetation", 0, 1),
    vegetation_delta: optionalNumber("surfacePatchVegetationDelta", -1, 1),
    lai: optionalNumber("surfacePatchLai", 0, 8.5),
    canopy_height_m: optionalNumber("surfacePatchCanopy", 0, 80),
    root_depth_m: optionalNumber("surfacePatchRootDepth", 0, 5),
    ksat_mm_hr: optionalNumber("surfacePatchKsat", 0, 260),
    awc_mm: optionalNumber("surfacePatchAwc", 0, 560),
    impervious_fraction: optionalNumber("surfacePatchImpervious", 0, 0.98),
    impervious_delta: optionalNumber("surfacePatchImperviousDelta", -0.98, 0.98),
    precipitation_delta_mm: optionalNumber("surfacePatchPrecipDelta", -2200, 2200),
    precipitation_scale: optionalNumber("surfacePatchPrecipScale", 0.2, 3),
    temperature_delta_c: optionalNumber("surfacePatchTempDelta", -8, 8),
    wind_speed_delta_ms: optionalNumber("surfacePatchWindDelta", -18, 24),
    wind_direction: optionalNumber("surfacePatchWindDirection", 0, 359),
    roughness_delta: optionalNumber("surfacePatchRoughnessDelta", -0.25, 0.45),
    scenario: "manual",
    manual_geometry: geometryType
  };
  for (const [key, value] of Object.entries({ ...properties })) {
    if (value == null || value === "") delete properties[key];
  }
  return {
    type: "Feature",
    properties,
    geometry: manualSurfaceGeometry(geometryType, x, y, properties.radius_km || 1)
  };
}

function optionalNumber(id, min, max) {
  const value = document.getElementById(id)?.value;
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? clamp(number, min, max) : null;
}

function manualSurfaceGeometry(geometryType, x, y, radiusKm) {
  if (geometryType === "Point") {
    return {
      type: "Point",
      coordinates: [round(x, 4), round(y, 4)]
    };
  }
  if (geometryType === "LineString") {
    const line = parseSurfaceCoordinateList();
    return {
      type: "LineString",
      coordinates: (line.length >= 2 ? line : manualCoordinateTemplatePoints("LineString", x, y, radiusKm)).map(roundPoint)
    };
  }
  const polygon = parseSurfaceCoordinateList();
  const ring = closePolygonRing(polygon.length >= 3 ? polygon : manualCoordinateTemplatePoints("Polygon", x, y, radiusKm));
  return {
    type: "Polygon",
    coordinates: [ring.map(roundPoint)]
  };
}

function parseSurfaceCoordinateList() {
  const mapSizeKm = currentMapSizeKm();
  const text = document.getElementById("surfacePatchCoordinates")?.value || "";
  return text
    .split(/[;\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.split(/[,\s]+/).map(Number).filter(Number.isFinite))
    .filter((parts) => parts.length >= 2)
    .map(([x, y]) => [clamp(x, 0, mapSizeKm), clamp(y, 0, mapSizeKm)]);
}

function updateSurfacePatchGeometryTemplate(force) {
  const input = document.getElementById("surfacePatchCoordinates");
  if (!input) return;
  if (!force && input.dataset.manual === "true") return;
  const mapSizeKm = currentMapSizeKm();
  const geometryType = document.getElementById("surfacePatchGeometry")?.value || "Polygon";
  const x = clamp(Number(document.getElementById("surfacePatchX").value), 0, mapSizeKm);
  const y = clamp(Number(document.getElementById("surfacePatchY").value), 0, mapSizeKm);
  const radiusKm = clamp(Number(document.getElementById("surfacePatchRadius").value), 0.05, 48);
  input.value = manualCoordinateTemplatePoints(geometryType, x, y, radiusKm).map((point) => `${round(point[0], 3)},${round(point[1], 3)}`).join("; ");
  input.dataset.manual = "false";
}

function manualSurfaceCollection() {
  const mapSizeKm = currentMapSizeKm();
  return {
    type: "FeatureCollection",
    name: "manual-surface-climate-scenario",
    crs: { type: "name", properties: { name: "local-grid" } },
    bbox: [0, 0, mapSizeKm, mapSizeKm],
    features: manualSurfaceFeatures
  };
}

function updateManualSurfaceReadout() {
  const node = document.getElementById("manualSurfaceReadout");
  if (!node) return;
  if (!manualSurfaceFeatures.length) {
    node.textContent = "未添加手工地表情景";
    return;
  }
  const counts = manualSurfaceFeatures.reduce((acc, feature) => {
    const key = feature.properties?.patch_type || "custom";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const geometryCounts = manualSurfaceFeatures.reduce((acc, feature) => {
    const key = feature.geometry?.type || "Unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  node.textContent = `${manualSurfaceFeatures.length} 个地表情景 · ${Object.entries(counts)
    .map(([key, value]) => `${localizedLabel(LOCALIZED_SURFACE_TYPES, key)}:${value}`)
    .join(" / ")} · ${Object.entries(geometryCounts)
    .map(([key, value]) => `${localizedLabel(LOCALIZED_GEOMETRY_TYPES, key)}:${value}`)
    .join(" / ")}`;
}

function applySurfacePatchPreset() {
  const type = document.getElementById("surfacePatchType")?.value || "custom";
  const preset = SURFACE_PATCH_UI_PRESETS[type] || SURFACE_PATCH_UI_PRESETS.custom;
  const values = {
    surfacePatchRadius: preset.radius,
    surfacePatchLandCover: preset.landCover,
    surfacePatchSoilGroup: preset.soil,
    surfacePatchVegetation: preset.vegetation,
    surfacePatchVegetationDelta: preset.vegetationDelta,
    surfacePatchLai: preset.lai,
    surfacePatchCanopy: preset.canopy,
    surfacePatchRootDepth: preset.rootDepth,
    surfacePatchKsat: preset.ksat,
    surfacePatchAwc: preset.awc,
    surfacePatchImpervious: preset.impervious,
    surfacePatchImperviousDelta: preset.imperviousDelta,
    surfacePatchPrecipDelta: preset.precipDelta,
    surfacePatchPrecipScale: preset.precipScale,
    surfacePatchTempDelta: preset.tempDelta,
    surfacePatchWindDelta: preset.windDelta,
    surfacePatchWindDirection: preset.windDirection,
    surfacePatchRoughnessDelta: preset.roughness
  };
  for (const [id, value] of Object.entries(values)) {
    const input = document.getElementById(id);
    if (input) input.value = value == null ? "" : String(value);
  }
}

function toggleInfrastructureRegionSelection(event) {
  setInfrastructureRegionSelectionMode(!infrastructureRegionSelection.active, { keepBounds: true, event });
}

function setInfrastructureRegionSelectionMode(active, options = {}) {
  infrastructureRegionSelection.active = Boolean(active);
  infrastructureRegionSelection.dragging = false;
  const button = options.event?.currentTarget || document.getElementById("selectInfrastructureRegion");
  if (button) {
    button.setAttribute("aria-pressed", String(infrastructureRegionSelection.active));
    button.textContent = infrastructureRegionSelection.active ? "选区中" : "设施选区";
  }
  canvas.classList.toggle("selecting-infrastructure", infrastructureRegionSelection.active);
  if (!infrastructureRegionSelection.active && !options.keepBounds) hideInfrastructureSelectionOverlay();
  updateInfrastructureSelectionReadout();
  if (options.silent) return;
  setStatus(infrastructureRegionSelection.active ? "设施选区已启用：在分析图拖拽锁定范围" : "设施选区已关闭");
}

function beginInfrastructureRegionSelection(event) {
  if (!model) return;
  const point = pointerToLocalKm(event);
  infrastructureRegionSelection.dragging = true;
  infrastructureRegionSelection.start = point;
  infrastructureRegionSelection.current = point;
  applyInfrastructureSelectionToForm(selectionBoundsFromPoints(point, point), false);
}

function updateInfrastructureRegionSelection(event) {
  if (!model || !infrastructureRegionSelection.start) return;
  const point = pointerToLocalKm(event);
  infrastructureRegionSelection.current = point;
  applyInfrastructureSelectionToForm(selectionBoundsFromPoints(infrastructureRegionSelection.start, point), false);
}

function finishInfrastructureRegionSelection(event) {
  if (!model || !infrastructureRegionSelection.start) return;
  const point = pointerToLocalKm(event);
  infrastructureRegionSelection.current = point;
  infrastructureRegionSelection.dragging = false;
  const bounds = selectionBoundsFromPoints(infrastructureRegionSelection.start, point);
  applyInfrastructureSelectionToForm(bounds, true);
  renderer?.focusRegion?.(bounds, { mode: "infrastructure-selection" });
  setInfrastructureRegionSelectionMode(false, { keepBounds: true, silent: true });
}

function pointerToLocalKm(event) {
  const { gx, gy } = pointerToGrid(event);
  const mapSizeKm = currentMapSizeKm();
  return {
    xKm: clamp(gx * (model?.cellSizeKm || mapSizeKm / Math.max(1, (model?.n || 2) - 1)), 0, mapSizeKm),
    yKm: clamp(gy * (model?.cellSizeKm || mapSizeKm / Math.max(1, (model?.n || 2) - 1)), 0, mapSizeKm)
  };
}

function selectionBoundsFromPoints(a, b) {
  const mapSizeKm = currentMapSizeKm();
  const x0 = clamp(Math.min(a.xKm, b.xKm), 0, mapSizeKm);
  const y0 = clamp(Math.min(a.yKm, b.yKm), 0, mapSizeKm);
  const x1 = clamp(Math.max(a.xKm, b.xKm), 0, mapSizeKm);
  const y1 = clamp(Math.max(a.yKm, b.yKm), 0, mapSizeKm);
  return {
    x0,
    y0,
    x1,
    y1,
    widthKm: Math.max(0, x1 - x0),
    heightKm: Math.max(0, y1 - y0),
    centerXKm: (x0 + x1) / 2,
    centerYKm: (y0 + y1) / 2
  };
}

function applyInfrastructureSelectionToForm(bounds, final) {
  if (!bounds) return;
  const mapSizeKm = currentMapSizeKm();
  const pointThresholdKm = Math.max(model?.cellSizeKm ? model.cellSizeKm * 2 : 0.35, mapSizeKm / 512);
  const isRegion = Math.max(bounds.widthKm, bounds.heightKm) > pointThresholdKm;
  const geometryType = isRegion ? "Polygon" : "Point";
  const radiusKm = clamp(Math.max(bounds.widthKm, bounds.heightKm) / 2, 0.1, 32);
  const xInput = document.getElementById("infraX");
  const yInput = document.getElementById("infraY");
  const radiusInput = document.getElementById("infraRadius");
  const geometryInput = document.getElementById("infraGeometry");
  const coordinateInput = document.getElementById("infraCoordinates");
  if (xInput) xInput.value = String(round(bounds.centerXKm, 3));
  if (yInput) yInput.value = String(round(bounds.centerYKm, 3));
  if (radiusInput && isRegion) radiusInput.value = String(round(radiusKm, 3));
  if (geometryInput) geometryInput.value = geometryType;
  if (coordinateInput) {
    const points = isRegion
      ? [
          [bounds.x0, bounds.y0],
          [bounds.x1, bounds.y0],
          [bounds.x1, bounds.y1],
          [bounds.x0, bounds.y1]
        ]
      : [[bounds.centerXKm, bounds.centerYKm]];
    coordinateInput.value = points.map((point) => `${round(point[0], 3)},${round(point[1], 3)}`).join("; ");
    coordinateInput.dataset.manual = "selected";
  }
  infrastructureRegionSelection.bounds = bounds;
  updateInfrastructureSelectionOverlay(bounds, isRegion);
  updateInfrastructureSelectionReadout();
  const sizeText = isRegion
    ? `${format(bounds.widthKm, 2)} × ${format(bounds.heightKm, 2)} km`
    : `${format(bounds.centerXKm, 2)}, ${format(bounds.centerYKm, 2)} km`;
  setStatus(final ? `设施选区已锁定：${sizeText}` : `设施选区：${sizeText}`);
}

function updateInfrastructureSelectionOverlay(bounds, isRegion) {
  if (!infrastructureSelectionOverlay || !bounds) return;
  const mapSizeKm = currentMapSizeKm();
  const pointSizePct = 2.4;
  const leftPct = isRegion ? (bounds.x0 / mapSizeKm) * 100 : (bounds.centerXKm / mapSizeKm) * 100 - pointSizePct / 2;
  const topPct = isRegion ? (bounds.y0 / mapSizeKm) * 100 : (bounds.centerYKm / mapSizeKm) * 100 - pointSizePct / 2;
  const widthPct = isRegion ? Math.max(1.4, (bounds.widthKm / mapSizeKm) * 100) : pointSizePct;
  const heightPct = isRegion ? Math.max(1.4, (bounds.heightKm / mapSizeKm) * 100) : pointSizePct;
  infrastructureSelectionOverlay.hidden = false;
  infrastructureSelectionOverlay.style.left = `${clamp(leftPct, 0, 100)}%`;
  infrastructureSelectionOverlay.style.top = `${clamp(topPct, 0, 100)}%`;
  infrastructureSelectionOverlay.style.width = `${clamp(widthPct, 0.8, 100)}%`;
  infrastructureSelectionOverlay.style.height = `${clamp(heightPct, 0.8, 100)}%`;
}

function hideInfrastructureSelectionOverlay() {
  if (infrastructureSelectionOverlay) infrastructureSelectionOverlay.hidden = true;
}

function clearInfrastructureRegionSelection() {
  infrastructureRegionSelection.bounds = null;
  infrastructureRegionSelection.start = null;
  infrastructureRegionSelection.current = null;
  hideInfrastructureSelectionOverlay();
  updateInfrastructureSelectionReadout();
}

function updateInfrastructureSelectionReadout() {
  return updateInfrastructureSelectionReadoutSafe();
}

function updateInfrastructureSelectionReadoutSafe() {
  const type = document.getElementById("infraType")?.value || "custom";
  const typeLabel = localizedLabel(LOCALIZED_INFRASTRUCTURE_TYPES, type, "\u8bbe\u65bd");
  const geometry = document.getElementById("infraGeometry")?.value || "Point";
  const bounds = infrastructureRegionSelection.bounds;
  const readout = infrastructureSelectionReadout;
  const addButton = infrastructureAddButton || document.getElementById("addInfrastructureFeature");
  if (bounds) {
    const isRegion = Math.max(bounds.widthKm || 0, bounds.heightKm || 0) > Math.max(0.1, currentMapSizeKm() / 512);
    const areaKm2 = Math.max(0, (bounds.widthKm || 0) * (bounds.heightKm || 0));
    const text = isRegion
      ? `\u5df2\u9009\u533a\u57df · ${typeLabel} · ${format(bounds.widthKm, 2)} x ${format(bounds.heightKm, 2)} km · ${format(areaKm2, 2)} km2`
      : `\u5df2\u9009\u70b9\u4f4d · ${typeLabel} · ${format(bounds.centerXKm, 2)}, ${format(bounds.centerYKm, 2)} km`;
    if (readout) {
      readout.textContent = text;
      readout.dataset.state = "selected";
      readout.closest(".infrastructure-placement-strip")?.setAttribute("data-state", "selected");
    }
    if (addButton) {
      addButton.textContent = "\u6dfb\u52a0\u5230\u9009\u533a";
      addButton.title = `\u628a${typeLabel}\u6295\u653e\u5230\u5f53\u524d\u9009\u533a`;
    }
    return;
  }
  const coords = parseManualCoordinateList();
  const x = Number(document.getElementById("infraX")?.value);
  const y = Number(document.getElementById("infraY")?.value);
  const coordinateMode = document.getElementById("infraCoordinates")?.dataset.manual === "true" ? "\u624b\u52a8\u5750\u6807" : "\u8868\u5355\u5750\u6807";
  const locationText =
    coords.length > 1
      ? `${coordinateMode} · ${localizedLabel(LOCALIZED_GEOMETRY_TYPES, geometry, geometry)} · ${coords.length} \u70b9`
      : `${coordinateMode} · ${format(Number.isFinite(x) ? x : 0, 2)}, ${format(Number.isFinite(y) ? y : 0, 2)} km`;
  if (readout) {
    readout.textContent = `\u8bbe\u65bd\u4f4d\u7f6e\uff1a${locationText} · ${typeLabel}`;
    readout.dataset.state = "manual";
    readout.closest(".infrastructure-placement-strip")?.setAttribute("data-state", "manual");
  }
  if (addButton) {
    addButton.textContent = "\u6309\u5750\u6807\u6dfb\u52a0";
    addButton.title = `\u6309\u5f53\u524d\u5750\u6807\u6dfb\u52a0${typeLabel}`;
  }
}

async function addManualInfrastructureFeature() {
  const feature = readManualInfrastructureFeature();
  manualInfrastructureFeatures.push(feature);
  rebuildExternalLayerBundle();
  updateManualInfrastructureReadout();
  updateInfrastructureSelectionReadout();
  dataStatus.textContent = summarizeLayerBundle(externalLayers);
  setStatus("已加入人造设施情景");
  scheduleTerrainRebuild();
}

async function clearManualInfrastructureFeatures() {
  manualInfrastructureFeatures = [];
  rebuildExternalLayerBundle();
  updateManualInfrastructureReadout();
  updateInfrastructureSelectionReadout();
  dataStatus.textContent = summarizeLayerBundle(externalLayers);
  setStatus("已清除手工人造设施");
  await rebuildTerrain();
}

function exportManualInfrastructureFeatures() {
  download(
    "geolab-128-manual-infrastructure.geojson",
    "application/geo+json",
    JSON.stringify(manualInfrastructureCollection(), null, 2)
  );
}

function adaptiveInfrastructurePlanOptions() {
  return {
    maxFeatures: 48,
    minScore: 0.48,
    rankDepth: 4,
    minBlockSpacing: 1,
    ecosystemMode: "adaptive-block"
  };
}

function currentAdaptiveInfrastructurePlan() {
  if (!model) return null;
  return buildAdaptiveInfrastructurePlacementPlan(model, params, adaptiveInfrastructurePlanOptions());
}

async function applyAdaptiveInfrastructurePlan() {
  const plan = currentAdaptiveInfrastructurePlan();
  if (!plan) return;
  const generatedFeatures = plan.featureCollection?.features || [];
  const preservedManual = manualInfrastructureFeatures.filter((feature) => feature.properties?.scenario !== "adaptive_matrix_plan");
  manualInfrastructureFeatures = [...preservedManual, ...generatedFeatures];
  rebuildExternalLayerBundle();
  updateManualInfrastructureReadout();
  updateInfrastructureSelectionReadout();
  dataStatus.textContent = summarizeLayerBundle(externalLayers);
  setStatus(`\u5df2\u5e94\u7528 ${generatedFeatures.length} \u4e2a\u9002\u914d\u751f\u6210\u8bbe\u65bd`);
  await rebuildTerrain();
}

function exportAdaptiveInfrastructurePlan() {
  const plan = currentAdaptiveInfrastructurePlan();
  if (!plan) return;
  download("geolab-128-adaptive-infrastructure-placement-plan.json", "application/json", JSON.stringify(plan, null, 2));
  setStatus("\u9002\u914d\u8bbe\u65bd\u751f\u6210\u89c4\u5212 JSON \u5df2\u5bfc\u51fa");
}

function exportAdaptiveInfrastructurePlanCSV() {
  const plan = currentAdaptiveInfrastructurePlan();
  if (!plan) return;
  download("geolab-128-adaptive-infrastructure-placement-plan.csv", "text/csv;charset=utf-8", makeAdaptiveInfrastructurePlacementPlanCSV(plan));
  setStatus("\u9002\u914d\u8bbe\u65bd\u751f\u6210\u89c4\u5212 CSV \u5df2\u5bfc\u51fa");
}

function readManualInfrastructureFeature() {
  const type = String(document.getElementById("infraType").value || "urban");
  const geometryType = String(document.getElementById("infraGeometry")?.value || "Point");
  const mapSizeKm = currentMapSizeKm();
  const x = clamp(Number(document.getElementById("infraX").value), 0, mapSizeKm);
  const y = clamp(Number(document.getElementById("infraY").value), 0, mapSizeKm);
  const selectedBounds = infrastructureRegionSelection.bounds;
  const coordinateInput = document.getElementById("infraCoordinates");
  const placementMode = selectedBounds
    ? "selected-region"
    : coordinateInput?.dataset.manual === "true"
      ? "manual-coordinates"
      : "form-coordinates";
  const properties = {
    infrastructure_type: type,
    radius_km: clamp(Number(document.getElementById("infraRadius").value), 0.1, 32),
    impervious_fraction: clamp(Number(document.getElementById("infraImpervious").value), 0, 0.98),
    runoff_delta: clamp(Number(document.getElementById("infraRunoffDelta").value), -0.45, 0.45),
    roughness_delta: clamp(Number(document.getElementById("infraRoughnessDelta").value), -0.2, 0.55),
    temperature_delta_c: clamp(Number(document.getElementById("infraTempDelta").value), -4, 7),
    storage_mm: clamp(Number(document.getElementById("infraStorage").value), 0, 800),
    flow_retention: clamp(Number(document.getElementById("infraRetention").value), 0, 0.95),
    irrigation_mm: clamp(Number(document.getElementById("infraIrrigation").value), 0, 900),
    vegetation_delta: clamp(Number(document.getElementById("infraVegetationDelta").value), -0.8, 0.8),
    water_demand_mm: clamp(Number(document.getElementById("infraDemand").value), 0, 1000),
    building_density: clamp(Number(document.getElementById("infraBuildingDensity").value), 0, 1),
    building_height_m: clamp(Number(document.getElementById("infraBuildingHeight").value), 0, 700),
    floor_count: clamp(Number(document.getElementById("infraFloors").value), 0, 180),
    landmark_height_m: clamp(Number(document.getElementById("infraLandmarkHeight").value), 0, 900),
    scenario: "manual",
    manual_geometry: geometryType,
    placement_mode: placementMode,
    placement_strategy: "environment_adaptive_block",
    adaptive_block_placement: true,
    reduced_manual_freedom: true
  };
  if (selectedBounds) {
    properties.selection_bounds_km = [
      round(selectedBounds.x0, 4),
      round(selectedBounds.y0, 4),
      round(selectedBounds.x1, 4),
      round(selectedBounds.y1, 4)
    ];
    properties.selection_center_km = [round(selectedBounds.centerXKm, 4), round(selectedBounds.centerYKm, 4)];
    properties.selection_area_km2 = round(Math.max(0, selectedBounds.widthKm * selectedBounds.heightKm), 4);
  }
  return {
    type: "Feature",
    properties,
    geometry: manualInfrastructureGeometry(geometryType, x, y, properties.radius_km)
  };
}

function manualInfrastructureGeometry(geometryType, x, y, radiusKm) {
  if (geometryType === "LineString") {
    const line = parseManualCoordinateList();
    return {
      type: "LineString",
      coordinates: (line.length >= 2 ? line : manualCoordinateTemplatePoints("LineString", x, y, radiusKm)).map(roundPoint)
    };
  }
  if (geometryType === "Polygon") {
    const polygon = parseManualCoordinateList();
    const ring = closePolygonRing(polygon.length >= 3 ? polygon : manualCoordinateTemplatePoints("Polygon", x, y, radiusKm));
    return {
      type: "Polygon",
      coordinates: [ring.map(roundPoint)]
    };
  }
  return {
    type: "Point",
    coordinates: [round(x, 4), round(y, 4)]
  };
}

function parseManualCoordinateList() {
  const mapSizeKm = currentMapSizeKm();
  const text = document.getElementById("infraCoordinates")?.value || "";
  return text
    .split(/[;\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.split(/[,\s]+/).map(Number).filter(Number.isFinite))
    .filter((parts) => parts.length >= 2)
    .map(([x, y]) => [clamp(x, 0, mapSizeKm), clamp(y, 0, mapSizeKm)]);
}

function updateManualGeometryTemplate(force) {
  const input = document.getElementById("infraCoordinates");
  if (!input) return;
  if (!force && input.dataset.manual === "true") return;
  const mapSizeKm = currentMapSizeKm();
  const geometryType = document.getElementById("infraGeometry")?.value || "Point";
  const x = clamp(Number(document.getElementById("infraX").value), 0, mapSizeKm);
  const y = clamp(Number(document.getElementById("infraY").value), 0, mapSizeKm);
  const radiusKm = clamp(Number(document.getElementById("infraRadius").value), 0.1, 32);
  input.value = manualCoordinateTemplatePoints(geometryType, x, y, radiusKm).map((point) => `${round(point[0], 3)},${round(point[1], 3)}`).join("; ");
  input.dataset.manual = "false";
  updateInfrastructureSelectionReadout();
}

function manualCoordinateTemplatePoints(geometryType, x, y, radiusKm) {
  const r = Math.max(0.2, Number(radiusKm) || 1);
  const mapSizeKm = currentMapSizeKm();
  if (geometryType === "Point") {
    return [[clamp(x, 0, mapSizeKm), clamp(y, 0, mapSizeKm)]];
  }
  if (geometryType === "Polygon") {
    return [
      [clamp(x - r, 0, mapSizeKm), clamp(y - r, 0, mapSizeKm)],
      [clamp(x + r, 0, mapSizeKm), clamp(y - r, 0, mapSizeKm)],
      [clamp(x + r, 0, mapSizeKm), clamp(y + r, 0, mapSizeKm)],
      [clamp(x - r, 0, mapSizeKm), clamp(y + r, 0, mapSizeKm)]
    ];
  }
  return [
    [clamp(x - r * 2, 0, mapSizeKm), y],
    [clamp(x + r * 2, 0, mapSizeKm), y]
  ];
}

function closePolygonRing(points) {
  const ring = [...points];
  if (!ring.length) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
  return ring;
}

function roundPoint(point) {
  return [round(point[0], 4), round(point[1], 4)];
}

function manualInfrastructureCollection() {
  const mapSizeKm = currentMapSizeKm();
  return {
    type: "FeatureCollection",
    name: "manual-infrastructure-scenario",
    crs: { type: "name", properties: { name: "local-grid" } },
    bbox: [0, 0, mapSizeKm, mapSizeKm],
    features: manualInfrastructureFeatures
  };
}

function updateManualInfrastructureReadout() {
  const node = document.getElementById("manualInfrastructureReadout");
  if (!node) return;
  if (!manualInfrastructureFeatures.length) {
    node.textContent = "未添加手工设施";
    return;
  }
  const counts = manualInfrastructureFeatures.reduce((acc, feature) => {
    const key = feature.properties?.infrastructure_type || "custom";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const geometryCounts = manualInfrastructureFeatures.reduce((acc, feature) => {
    const key = feature.geometry?.type || "Unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  node.textContent = `${manualInfrastructureFeatures.length} 个设施 · ${Object.entries(counts)
    .map(([key, value]) => `${localizedLabel(LOCALIZED_INFRASTRUCTURE_TYPES, key)}:${value}`)
    .join(" / ")}`;
  node.textContent += ` · ${Object.entries(geometryCounts)
    .map(([key, value]) => `${localizedLabel(LOCALIZED_GEOMETRY_TYPES, key)}:${value}`)
    .join(" / ")}`;
}

function applyInfrastructurePreset() {
  const type = document.getElementById("infraType")?.value || "urban";
  const preset = INFRASTRUCTURE_UI_PRESETS[type] || INFRASTRUCTURE_UI_PRESETS.custom;
  const values = {
    infraRadius: preset.radius,
    infraImpervious: preset.impervious,
    infraRunoffDelta: preset.runoff,
    infraRoughnessDelta: preset.roughness,
    infraTempDelta: preset.temp,
    infraStorage: preset.storage,
    infraRetention: preset.retention,
    infraIrrigation: preset.irrigation,
    infraVegetationDelta: preset.vegetation,
    infraDemand: preset.demand,
    infraBuildingDensity: preset.density,
    infraBuildingHeight: preset.height,
    infraFloors: preset.floors,
    infraLandmarkHeight: preset.landmark
  };
  for (const [id, value] of Object.entries(values)) {
    if (id === "infraRadius" && infrastructureRegionSelection.bounds) continue;
    const input = document.getElementById(id);
    if (input) input.value = String(value);
  }
}

function buildCurrentAcquisitionPlan() {
  aoi = readAoi();
  acquisitionPlan = buildAcquisitionPlan(aoi);
  sourceManifest = null;
  planStatus.textContent = summarizePlan(acquisitionPlan);
  setStatus("采集计划已生成");
}

function exportAcquisitionPlan() {
  if (!acquisitionPlan) buildCurrentAcquisitionPlan();
  download("geolab-128-acquisition-plan.json", "application/json", JSON.stringify(acquisitionPlan, null, 2));
}

async function checkAcquisitionSources() {
  if (!acquisitionPlan) buildCurrentAcquisitionPlan();
  setStatus("在线检查数据源");
  planStatus.textContent = "正在检查 TNM / Daymet / USGS 等源...";
  try {
    sourceManifest = await checkAcquisitionPlan(acquisitionPlan);
    planStatus.textContent = summarizeManifest(sourceManifest);
    setStatus("源检查完成");
  } catch (error) {
    console.error(error);
    planStatus.textContent = `源检查失败: ${error.message}`;
    setStatus("源检查失败");
  }
}

async function exportSourceManifest() {
  if (!sourceManifest) {
    await checkAcquisitionSources();
  }
  if (!sourceManifest) return;
  download("geolab-128-source-manifest.json", "application/json", JSON.stringify(sourceManifest, null, 2));
}

async function applyContinentTemplateSelection() {
  const templateId = ui.continentTemplate?.value || "global_custom";
  params = applyContinentTemplateParams(readParams(), templateId);
  writeParams(params);
  updateContinentTemplateStatus();
  updateTerrainPresetStatus();
  const template = getContinentTemplate(templateId);
  setStatus(`已应用区域模板：${template.labelZh}`);
  await rebuildTerrain();
}

function updateContinentTemplateStatus() {
  if (!continentTemplateStatus) return;
  const template = getContinentTemplate(ui.continentTemplate?.value || params.continentTemplate || "global_custom");
  continentTemplateStatus.textContent = template.id === "global_custom"
    ? "全球自定义 · 保留当前自然条件与物种区系"
    : `${template.scopeZh} · ${template.labelZh} · 物种区系与自然条件联动`;
}

function queueWildlifeReleaseBatch() {
  const species = WILDLIFE_SPECIES.find((row) => row.id === wildlifeReleaseSpecies?.value) || WILDLIFE_SPECIES[0];
  const count = clamp(Math.round(Number(wildlifeReleaseCount?.value) || 1), 1, 100000);
  const habitat = wildlifeReleaseHabitat?.value || "best";
  const blockValue = String(wildlifeReleaseBlockId?.value || "").trim();
  const maxBlockId = Math.max(0, (model?.landscapeNetwork?.blocks?.length || 1) - 1);
  const targetBlockId = blockValue === "" ? null : clamp(Math.round(Number(blockValue) || 0), 0, maxBlockId);
  wildlifeReleaseSerial += 1;
  wildlifeReleaseBatches.push({
    batchId: `release-${Date.now().toString(36)}-${wildlifeReleaseSerial}`,
    speciesId: species.id,
    count,
    targetHabitat: habitat,
    targetBlockId
  });
  updateWildlifeReleaseReadout();
  setStatus(`已加入投放批次：${species.labelZh} ${count} 个体`);
}

async function executeWildlifeReleaseBatches() {
  if (!wildlifeReleaseBatches.length) {
    setStatus("请先加入至少一个生物投放批次");
    return;
  }
  if (ui.wildlifeEnabled) ui.wildlifeEnabled.checked = true;
  params = readParams();
  setStatus(`执行 ${wildlifeReleaseBatches.length} 个生物投放批次`);
  await runExistingModel("生物批量投放");
  updateWildlifeReleaseReadout();
  updateEcosystemFunctionReadout();
}

function clearWildlifeReleaseBatches() {
  wildlifeReleaseBatches = [];
  updateWildlifeReleaseReadout();
  setStatus("已清空待执行投放批次，现有种群状态保留");
}

function updateWildlifeReleaseReadout() {
  if (!wildlifeReleaseQueue) return;
  wildlifeReleaseQueue.replaceChildren();
  if (!wildlifeReleaseBatches.length) {
    wildlifeReleaseQueue.textContent = "尚未加入投放批次";
    return;
  }
  const title = document.createElement("strong");
  title.textContent = `投放队列 ${wildlifeReleaseBatches.length} 批`;
  wildlifeReleaseQueue.appendChild(title);
  const applied = new Set(model?.wildlife?.appliedReleaseBatchIds || []);
  const outcomes = new Map((model?.wildlife?.releaseOutcomes || []).map((row) => [row.batchId, row]));
  const locale = globalThis.__geoLabLocale?.locale === "zh-CN" ? "zh" : "en";
  for (const batch of wildlifeReleaseBatches.slice(-12)) {
    const species = WILDLIFE_SPECIES.find((row) => row.id === batch.speciesId);
    const outcome = outcomes.get(batch.batchId);
    const row = document.createElement("div");
    const destination = batch.targetBlockId === null ? localizedReleaseHabitat(batch.targetHabitat) : `区块 ${batch.targetBlockId}`;
    const outcomeStatus = outcome ? localizedReleaseOutcomeStatus(outcome.status, locale) : "";
    row.textContent = outcome
      ? locale === "zh"
        ? `${species?.labelZh || batch.speciesId} × ${batch.count} · ${destination} · 存活 ${Math.round(outcome.survivingCount)} (${Math.round(outcome.survivalRate * 100)}%) · ${outcomeStatus}`
        : `${species?.id || batch.speciesId} × ${batch.count} · ${batch.targetBlockId === null ? batch.targetHabitat : `block ${batch.targetBlockId}`} · survivors ${Math.round(outcome.survivingCount)} (${Math.round(outcome.survivalRate * 100)}%) · ${outcomeStatus}`
      : `${species?.labelZh || batch.speciesId} × ${batch.count} · ${destination} · ${applied.has(batch.batchId) ? "已执行" : "待执行"}`;
    wildlifeReleaseQueue.appendChild(row);
  }
}

function localizedReleaseHabitat(value) {
  return ({
    best: "自动最适区",
    forest: "森林",
    wetland: "湿地与滨岸",
    mountain: "山地",
    grassland: "草原",
    coast: "海岸",
    "urban-edge": "城镇边缘"
  })[value] || value;
}

function updateEcosystemFunctionReadout() {
  if (!ecosystemFunctionReadout) return;
  ecosystemFunctionReadout.replaceChildren();
  const state = model?.wildlife;
  if (!state?.ecosystemFunctions) {
    ecosystemFunctionReadout.textContent = "生态功能将在演算后汇总";
    if (ecologicalRigorReadout) ecologicalRigorReadout.textContent = "生态与地理一致性将在演算后诊断";
    return;
  }
  const locale = globalThis.__geoLabLocale?.locale === "zh-CN" ? "zh" : "en";
  const title = document.createElement("strong");
  title.textContent = locale === "zh"
    ? `生态功能 ${Math.round(state.ecosystemFunctions.summary.compositeFunctionIndex * 100)}% · 食物网 ${state.foodWeb?.links?.length || 0} 条`
    : `Ecosystem functions ${Math.round(state.ecosystemFunctions.summary.compositeFunctionIndex * 100)}% · ${state.foodWeb?.links?.length || 0} food-web links`;
  ecosystemFunctionReadout.appendChild(title);
  const limiting = state.ecosystemFunctions.guilds.find((row) => row.guildId === state.ecosystemFunctions.summary.limitingGuildId);
  const detailRow = document.createElement("div");
  detailRow.textContent = locale === "zh"
    ? `活跃物种 ${state.summary.activeSpeciesCount}/${state.summary.speciesCount} · 营养资源支持 ${Math.round((state.foodWeb?.summary?.trophicResourceSupport || 0) * 100)}% · 限制环节 ${limiting?.labelZh || "未识别"}`
    : `Active species ${state.summary.activeSpeciesCount}/${state.summary.speciesCount} · Trophic resource support ${Math.round((state.foodWeb?.summary?.trophicResourceSupport || 0) * 100)}% · Limiting guild ${limiting?.guildId || "unresolved"}`;
  ecosystemFunctionReadout.appendChild(detailRow);
  updateEcologicalRigorReadout(locale);
}

function localizedReleaseOutcomeStatus(status, locale) {
  const labels = {
    "ecosystem-disabled": { zh: "生态层关闭", en: "ecosystem disabled" },
    "outside-regional-template": { zh: "区域不匹配，已拦截", en: "regional mismatch, blocked" },
    "no-viable-habitat": { zh: "无可用生境，已拦截", en: "no viable habitat, blocked" },
    "high-fit-screening": { zh: "高适配筛查", en: "higher-fit screening" },
    "conditional-screening": { zh: "条件性筛查", en: "conditional screening" },
    "low-fit-screening": { zh: "低适配筛查", en: "low-fit screening" }
  };
  return labels[status]?.[locale] || status;
}

function updateEcologicalRigorReadout(locale = globalThis.__geoLabLocale?.locale === "zh-CN" ? "zh" : "en") {
  if (!ecologicalRigorReadout) return;
  ecologicalRigorReadout.replaceChildren();
  const integrity = model?.wildlife?.ecologicalIntegrity;
  const geography = model?.landscapeNetwork?.geographicConsistency;
  if (!integrity || !geography) {
    ecologicalRigorReadout.textContent = locale === "zh" ? "生态与地理一致性将在演算后诊断" : "Ecological and geographic consistency will be diagnosed after simulation.";
    return;
  }
  const heading = document.createElement("strong");
  heading.textContent = locale === "zh"
    ? `生态完整性筛查 ${Math.round(integrity.summary.integrityIndex * 100)}% · 地图面积闭合 ${format(geography.mapAreaClosurePct, 1)}%`
    : `Ecological integrity screening ${Math.round(integrity.summary.integrityIndex * 100)}% · Map-area closure ${format(geography.mapAreaClosurePct, 1)}%`;
  const diversity = document.createElement("div");
  diversity.textContent = locale === "zh"
    ? `Shannon ${format(integrity.biodiversity.shannonDiversity, 2)} · 有效物种数 q1 ${format(integrity.biodiversity.hillNumberQ1, 1)} · 核心生境 ${format(geography.coreHabitatAreaKm2, 1)} km²`
    : `Shannon ${format(integrity.biodiversity.shannonDiversity, 2)} · Effective species q1 ${format(integrity.biodiversity.hillNumberQ1, 1)} · Core-habitat proxy ${format(geography.coreHabitatAreaKm2, 1)} km²`;
  const consistency = document.createElement("div");
  consistency.textContent = locale === "zh"
    ? `气候—植被一致性 ${Math.round(geography.meanClimateVegetationConsistency * 100)}% · 边缘压力 ${Math.round(geography.meanEdgePressure * 100)}% · 拦截投放 ${integrity.translocation.blockedReleaseCount}`
    : `Climate-vegetation consistency ${Math.round(geography.meanClimateVegetationConsistency * 100)}% · Edge pressure ${Math.round(geography.meanEdgePressure * 100)}% · Blocked releases ${integrity.translocation.blockedReleaseCount}`;
  const boundary = document.createElement("small");
  boundary.textContent = locale === "zh" ? "筛查指数不等于现场生物多样性调查、种群生存力分析或投放许可。" : "Screening indices are not field biodiversity surveys, population viability analyses, or release authorizations.";
  ecologicalRigorReadout.append(heading, diversity, consistency, boundary);
  if (typeof globalThis !== "undefined") {
    globalThis.__geoLabEcologicalRigor = {
      geographicConsistency: geography,
      ecologicalIntegrity: integrity,
      foodWebSummary: model.wildlife.foodWeb?.summary || null,
      wildlifeSummary: model.wildlife.summary || null
    };
  }
}

function exportEcologicalIntegrity() {
  if (!model?.wildlife?.ecologicalIntegrity) return;
  const report = buildEcologicalIntegrityReport(model, params);
  download("geolab-128-ecological-integrity.json", "application/json", JSON.stringify(report, null, 2));
  setStatus("生态完整性报告已导出");
}

function exportEcologicalIntegrityCSV() {
  if (!model?.wildlife?.ecologicalIntegrity) return;
  const report = buildEcologicalIntegrityReport(model, params);
  download("geolab-128-species-diagnostics.csv", "text/csv;charset=utf-8", makeEcologicalIntegrityCSV(report));
  setStatus("物种诊断 CSV 已导出");
}

async function applyTerrainPresetSelection() {
  const next = applyTerrainPresetParams(readParams(), {
    geomorphologyPreset: ui.geomorphologyPreset?.value || "custom",
    scenicPreset: ui.scenicPreset?.value || "none"
  });
  params = next;
  writeParams(params);
  updateTerrainPresetStatus();
  const scenic = SCENIC_REPRODUCTION_PRESETS.find((preset) => preset.id === params.scenicPreset);
  const geomorphology = GEOMORPHOLOGY_PRESETS.find((preset) => preset.id === params.geomorphologyPreset);
  const scenicDisplay = terrainPresetDisplayInfo(scenic, "scenic");
  const geomorphologyDisplay = terrainPresetDisplayInfo(geomorphology, "geomorphology");
  const label = scenic?.id && scenic.id !== "none" ? scenicDisplay?.labelZh : geomorphologyDisplay?.labelZh || "\u81ea\u5b9a\u4e49\u5730\u5f62";
  setStatus(`\u5df2\u5e94\u7528\u5730\u8c8c\u9884\u8bbe\uff1a${label}`);
  await rebuildTerrain();
}

function updateTerrainPresetStatus() {
  if (!terrainPresetStatus) return;
  const scenic = SCENIC_REPRODUCTION_PRESETS.find((preset) => preset.id === (ui.scenicPreset?.value || params.scenicPreset || "none"));
  const geomorphology = GEOMORPHOLOGY_PRESETS.find((preset) => preset.id === (ui.geomorphologyPreset?.value || params.geomorphologyPreset || "custom"));
  const scenicDisplay = terrainPresetDisplayInfo(scenic, "scenic");
  const geomorphologyDisplay = terrainPresetDisplayInfo(geomorphology, "geomorphology");
  const activeScenic = scenic && scenic.id !== "none";
  const label = activeScenic ? scenicDisplay?.labelZh : geomorphologyDisplay?.labelZh || "\u81ea\u5b9a\u4e49\u5730\u5f62";
  const reference = activeScenic ? scenicDisplay?.referenceLandformZh : geomorphologyDisplay?.referenceLandformZh || "\u624b\u52a8\u53c2\u6570";
  terrainPresetStatus.textContent = `\u5730\u8c8c\uff1a${label} · \u53c2\u7167\uff1a${reference}`;
}

async function rebuildTerrain() {
  markModelRefreshNeeded("build");
  const job = ++modelJobSerial;
  const requestStartedAt = performance.now();
  params = readParams();
  updateLabels();
  setStatus("生成 DEM 与地貌细节");
  await nextFrame();
  const nextModel = await executeModelTask("build", { params }, () => buildModel(params));
  if (job !== modelJobSerial) return;
  const modelReceivedAt = performance.now();
  model = nextModel;
  clearModelRefreshNeeded();
  lastSubsurfaceTransectSummary = null;
  renderer.setModel(model, params, viewMode.value);
  renderer.setRiversVisible(riversVisible);
  renderer.setVegetationVisible(vegetationVisible);
  drawAnalysis();
  updateMetrics();
  if (typeof globalThis !== "undefined") {
    globalThis.__geoLabStartupStats = {
      mode: "startup-foundation-diagnostics",
      bootStartedAtMs: APP_BOOT_STARTED_AT,
      requestStartedAtMs: requestStartedAt,
      modelReceivedAtMs: modelReceivedAt,
      workerRoundTripMs: round(modelReceivedAt - requestStartedAt, 3),
      engineRuntimeMs: round(Number(model.runtimeMs) || 0, 3),
      mainThreadPreparationMs: round(performance.now() - modelReceivedAt, 3),
      transferDiagnostics: lastWorkerTransferDiagnostics,
      renderCompletedAtMs: null,
      totalReadyMs: null,
      completed: false
    };
  }
  setStatus("模型就绪");
}

async function runExistingModel(label = "演算") {
  if (!model) return;
  if (pendingModelRefreshMode === "build") {
    await rebuildTerrain();
    return;
  }
  markModelRefreshNeeded("run");
  const job = ++modelJobSerial;
  params = readParams();
  updateLabels();
  setStatus(`${label}中`);
  await nextFrame();
  const nextModel = await executeModelTask("run", { model, params }, () => runModel(model, params));
  if (job !== modelJobSerial) return;
  model = nextModel;
  clearModelRefreshNeeded();
  lastSubsurfaceTransectSummary = null;
  renderer.setModel(model, params, viewMode.value);
  renderer.setRiversVisible(riversVisible);
  renderer.setVegetationVisible(vegetationVisible);
  drawAnalysis();
  updateMetrics();
  setStatus("模型就绪");
}

async function runTemporalModel(label = "时间") {
  if (!model) return;
  if (pendingModelRefreshMode) {
    await runPendingModelRefresh(label);
    return;
  }
  const job = ++modelJobSerial;
  params = readParams();
  updateLabels();
  const staticRefs = {
    height: model.height,
    hydraulics: model.hydraulics,
    subsurface: model.subsurface,
    flowAccumulation: model.flowAccumulation
  };
  setStatus(`${label}快算中`);
  await nextFrame();
  const nextModel = updateTemporalModel(model, params);
  if (job !== modelJobSerial) return;
  model = nextModel;
  const renderStats = renderer.updateTemporalState(model, params, viewMode.value);
  renderer.setRiversVisible(riversVisible);
  renderer.setVegetationVisible(vegetationVisible);
  drawAnalysis();
  updateMetrics();
  const stats = {
    mode: "temporal-fast-path",
    currentYear: model.hazards?.currentYear ?? params.currentYear,
    targetYears: model.hazards?.years ?? params.simulationYears,
    dayOfYear: model.hazards?.summary?.seasonalState?.dayOfYear ?? params.dayOfYear,
    seasonalState: model.hazards?.summary?.seasonalState || null,
    engineMs: round(model.temporalRuntimeMs ?? model.runtimeMs ?? 0, 3),
    renderMs: round(renderStats?.totalMs ?? 0, 3),
    reusedStaticModel:
      model.height === staticRefs.height &&
      model.hydraulics === staticRefs.hydraulics &&
      model.subsurface === staticRefs.subsurface &&
      model.flowAccumulation === staticRefs.flowAccumulation,
    renderStats,
    eventDynamics: model.hazards?.summary?.eventDynamics || null
  };
  if (typeof globalThis !== "undefined") globalThis.__geoLabTemporalUpdateStats = stats;
  setStatus("时间快算就绪");
}

async function applyErosion() {
  if (!model) return;
  const job = ++modelJobSerial;
  params = readParams();
  setStatus("执行水蚀与坡面调整");
  await nextFrame();
  const nextModel = await executeModelTask("erode", { model, params, passes: 4 }, () => erodeModel(model, params, 4));
  if (job !== modelJobSerial) return;
  model = nextModel;
  lastSubsurfaceTransectSummary = null;
  renderer.setModel(model, params, viewMode.value);
  renderer.setRiversVisible(riversVisible);
  renderer.setVegetationVisible(vegetationVisible);
  drawAnalysis();
  updateMetrics();
  setStatus("侵蚀完成");
}

async function executeModelTask(op, payload, fallback) {
  if (!modelWorker) return fallback();
  const id = ++workerRequestId;
  try {
    const promise = new Promise((resolve, reject) => {
      workerRequests.set(id, { resolve, reject });
    });
    modelWorker.postMessage({ id, op, ...payload });
    return await promise;
  } catch (error) {
    console.warn("后台线程不可用，回退到主线程执行", error);
    workerRequests.delete(id);
    return fallback();
  }
}

function syncCurrentYearRange() {
  const maxYears = Math.max(0, Number(ui.simulationYears.value) || 0);
  ui.currentYear.max = String(maxYears);
  if (Number(ui.currentYear.value) > maxYears) ui.currentYear.value = String(maxYears);
}

function toggleTimePlayback() {
  const button = document.getElementById("playTime");
  if (timePlayTimer) {
    clearInterval(timePlayTimer);
    timePlayTimer = null;
    button.textContent = "播放";
    return;
  }
  button.textContent = "暂停";
  timePlayTimer = setInterval(() => {
    const maxYears = Math.max(0, Number(ui.simulationYears.value) || 0);
    const next = Number(ui.currentYear.value) + Math.max(1, Math.ceil(maxYears / 80));
    ui.currentYear.value = String(next > maxYears ? 0 : next);
    params = readParams();
    updateLabels();
    scheduleTemporalRun();
  }, 260);
}

function scheduleRun() {
  markModelRefreshNeeded("run");
  clearTimeout(runTimer);
  runTimer = setTimeout(() => runPendingModelRefresh("参数"), 220);
}

function scheduleTemporalRun() {
  clearTimeout(runTimer);
  runTimer = setTimeout(() => (pendingModelRefreshMode ? runPendingModelRefresh("时间") : runTemporalModel("时间")), 80);
}

function scheduleTerrainRebuild() {
  markModelRefreshNeeded("build");
  clearTimeout(runTimer);
  runTimer = setTimeout(() => rebuildTerrain(), 120);
}

function paintAt(event) {
  if (!model) return;
  const { gx, gy } = pointerToGrid(event);
  const dirtyBounds = applyBrush(model, params, gx, gy, {
    mode: brushMode.value,
    radius: Number(brushRadius.value),
    power: Number(brushPower.value)
  });
  renderer.updateTerrainSurface(model, params, viewMode.value, dirtyBounds);
  drawAnalysis(dirtyBounds);
  setStatus("地形已编辑");
  scheduleRun();
}

function updateReadout(event) {
  if (!model) return;
  const { gx, gy } = pointerToGrid(event);
  lastPointerGrid = { gx, gy };
  const cell = getCell(model, gx, gy);
  const sample = sampleModel(gx, gy);
  const geo = localKmToWgs84(sample.xKm, sample.yKm);
  const ecology = landscapeCellContext(gx, gy);
  cellReadout.innerHTML = [
    `x ${format(sample.xKm, 3)} km · y ${format(sample.yKm, 3)} km · ${format(geo.lat, 5)}, ${format(geo.lon, 5)}`,
    `${Math.round(sample.elevation)} m · 坡度 ${format(sample.slope, 1)}° · 坡向 ${format(sample.aspect, 0)}° · ${cell.climate.code} ${cell.climate.name}`,
    `${Math.round(sample.precipitation)} mm/yr · ${format(sample.temperature, 1)} °C · 风 ${format(sample.windSpeed, 1)} m/s @ ${format(sample.windDirection, 0)}°`,
    `数据可信 ${format(cell.dataConfidence?.observedSupport || 0, 2)} · 来源 ${cell.dataConfidence?.sourceCount || 0} · ${cell.dataConfidence?.sources?.join("/") || "推断"} · 自定义 ${format(cell.dataConfidence?.customizedSupport || 0, 2)}`,
    `${cell.landCover.code} · 土壤 ${cell.soilGroup.code} · 植被 ${format(sample.vegetation * 100, 0)}% · LAI ${format(sample.leafAreaIndex, 1)} · 冠层 ${format(sample.canopyHeight, 1)} m`,
    `${cell.vegetationType?.name || "植被"} · 韧性 ${format(cell.vegetationResilience || 0, 2)} · 碳储量 ${format(cell.biomassCarbonKgM2 || 0, 1)} kg/m2 · 冠层粗糙 ${format(cell.canopyRoughnessLengthM || 0, 2)} m`,
    ecology
      ? `生态区块 ${ecology.block.blockId} · 栖息地 ${format(ecology.block.habitatQuality, 2)} · 连通 ${format(ecology.block.meanNeighborConnectivity, 2)} · 边缘压力 ${format(ecology.block.edgePressure, 2)} · 干湿区 ${ecology.block.aridityZone} · 气植一致 ${format(ecology.block.climateVegetationConsistency, 2)} · 物种 ${ecology.state?.richness || 0} · 优势种 ${ecology.dominantSpeciesLabel}`
      : "",
    `实际蒸散 ${Math.round(sample.actualEvapotranspiration)} mm/yr · 水量 ${Math.round(sample.waterBalance)} mm/yr · 径流 ${format(cell.runoffCoefficient, 2)} · 湿润指数 ${format(sample.wetnessIndex, 1)}`,
    `饱和导水率 ${format(sample.hydraulicConductivityMmHr, 1)} mm/hr | 可用水 ${Math.round(sample.availableWaterCapacityMm)} mm | 根深 ${format(sample.rootDepthM, 2)} m | 不透水 ${format(sample.imperviousFraction * 100, 0)}% | 入渗 ${format(sample.infiltrationCapacity, 2)}`,
    cell.subsurface
      ? `地下 ${cell.subsurface.lithology.code}${cell.subsurface.externalObserved ? " · 观测校准" : ""} · 水位埋深 ${format(cell.subsurface.waterTableDepthM, 1)} m · 基岩 ${format(cell.subsurface.bedrockDepthM, 1)} m · 含水 ${format(cell.subsurface.aquiferPotential, 2)} · 地下可信 ${format(cell.subsurface.voxelObservedSupport, 2)}/${format(cell.subsurface.inferenceReliability, 2)} · 地下风险 ${format(cell.subsurface.engineeringRisk, 2)} · ${cell.subsurface.materialClass?.code || "UNKNOWN"} · ${cell.subsurface.riskClass?.code || "LOW"}`
      : "",
    `流速 ${format(sample.flowVelocity, 2)} m/s | 剪切 ${format(sample.shearStressPa, 1)} Pa | 功率 ${format(sample.streamPowerWm2, 1)} W/m2 | 侵蚀 ${format(sample.erosionRisk, 2)} | 淤积 ${format(sample.depositionRisk, 2)}`,
    `曲率 ${format(sample.curvature, 4)} | 地形位置 ${format(sample.tpi, 1)} m | 粗糙 ${format(sample.roughness, 1)} m`
  ].join("<br />");
  drawMagnifier(gx, gy);
}

function drawAnalysis(dirtyBounds = null) {
  if (!model) return;
  const n = model.n;
  let forceFull = false;
  if (canvas.width !== n) {
    canvas.width = n;
    forceFull = true;
  }
  if (canvas.height !== n) {
    canvas.height = n;
    forceFull = true;
  }
  const bounds = forceFull ? null : analysisDirtyBounds(dirtyBounds, n);
  const width = bounds ? bounds.x1 - bounds.x0 + 1 : n;
  const height = bounds ? bounds.y1 - bounds.y0 + 1 : n;
  const image = ctx.createImageData(width, height);
  const data = image.data;
  const mode = viewMode.value;

  for (let yy = 0; yy < height; yy += 1) {
    const y = (bounds?.y0 ?? 0) + yy;
    for (let xx = 0; xx < width; xx += 1) {
      const x = (bounds?.x0 ?? 0) + xx;
      const i = y * n + x;
      const [r, g, b] = colorForValue(model, params, mode, i);
      const p = (yy * width + xx) * 4;
      data[p] = r;
      data[p + 1] = g;
      data[p + 2] = b;
      data[p + 3] = 255;
    }
  }

  ctx.putImageData(image, bounds?.x0 ?? 0, bounds?.y0 ?? 0);
  drawRiverOverlay(bounds);
  if (mode === "landscapeConnectivity" || mode === "wildlife") drawLandscapeEcologyOverlay(mode, bounds);
  if (mode === "climate") drawClimateLegend(bounds);
  if (lastPointerGrid) drawMagnifier(lastPointerGrid.gx, lastPointerGrid.gy);
}

function landscapeCellContext(gx, gy) {
  const network = model?.landscapeNetwork;
  if (!network?.blocks?.length || !model?.n) return null;
  const x = clamp(Math.floor(gx), 0, model.n - 1);
  const y = clamp(Math.floor(gy), 0, model.n - 1);
  const bx = Math.min(network.gridSize - 1, Math.floor(x / Math.max(1, network.blockCellSize)));
  const by = Math.min(network.gridSize - 1, Math.floor(y / Math.max(1, network.blockCellSize)));
  const block = network.blocks[by * network.gridSize + bx];
  if (!block) return null;
  const state = model.wildlife?.blockStates?.[block.blockId] || null;
  const species = model.wildlife?.species?.find((row) => row.id === state?.dominantSpeciesId);
  return { block, state, dominantSpeciesLabel: species?.labelZh || "无" };
}

function drawLandscapeEcologyOverlay(mode, bounds = null) {
  const network = model?.landscapeNetwork;
  if (!network?.blocks?.length) return;
  const toCanvas = (block) => ({
    x: block.centerXKm / Math.max(0.001, model.sizeKm) * (model.n - 1),
    y: block.centerYKm / Math.max(0.001, model.sizeKm) * (model.n - 1)
  });
  ctx.save();
  if (bounds) {
    ctx.beginPath();
    ctx.rect(bounds.x0, bounds.y0, bounds.x1 - bounds.x0 + 1, bounds.y1 - bounds.y0 + 1);
    ctx.clip();
  }
  ctx.lineCap = "round";
  if (mode === "landscapeConnectivity") {
    for (const link of network.links || []) {
      if (link.connectivity < 0.32) continue;
      const from = toCanvas(network.blocks[link.fromBlockId]);
      const to = toCanvas(network.blocks[link.toBlockId]);
      ctx.globalAlpha = 0.22 + link.connectivity * 0.46;
      ctx.strokeStyle = link.corridorClass === "riparian-corridor" ? "#9fdded" : link.corridorClass === "rugged-pass" ? "#edc779" : "#d8e59b";
      ctx.lineWidth = 0.45 + link.connectivity * 1.5;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
  } else {
    const speciesById = new Map((model.wildlife?.species || []).map((row) => [row.id, row]));
    const links = (model.wildlife?.migrationLinks || []).slice().sort((a, b) => b.strength - a.strength).slice(0, 900);
    for (const link of links) {
      const fromBlock = network.blocks[link.fromBlockId];
      const toBlock = network.blocks[link.toBlockId];
      if (!fromBlock || !toBlock) continue;
      const from = toCanvas(fromBlock);
      const to = toCanvas(toBlock);
      const color = Number(speciesById.get(link.speciesId)?.colorHex ?? 0x9fd8b0);
      ctx.globalAlpha = 0.18 + link.strength * 0.48;
      ctx.strokeStyle = `#${color.toString(16).padStart(6, "0")}`;
      ctx.lineWidth = 0.4 + link.strength * 1.3;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function analysisDirtyBounds(dirtyBounds, n) {
  if (!dirtyBounds) return null;
  const x0 = clamp(Math.floor(Number(dirtyBounds.x0 ?? 0)), 0, n - 1);
  const y0 = clamp(Math.floor(Number(dirtyBounds.y0 ?? 0)), 0, n - 1);
  const x1 = clamp(Math.ceil(Number(dirtyBounds.x1 ?? n - 1)), 0, n - 1);
  const y1 = clamp(Math.ceil(Number(dirtyBounds.y1 ?? n - 1)), 0, n - 1);
  if (x1 < x0 || y1 < y0) return null;
  return { x0, y0, x1, y1 };
}

function drawRiverOverlay(bounds = null) {
  ctx.save();
  if (bounds) {
    ctx.beginPath();
    ctx.rect(bounds.x0, bounds.y0, bounds.x1 - bounds.x0 + 1, bounds.y1 - bounds.y0 + 1);
    ctx.clip();
  }
  ctx.globalAlpha = 0.72;
  ctx.strokeStyle = "#98e2ff";
  ctx.lineCap = "round";
  for (const segment of model.riverSegments) {
    const fromX = segment.from % model.n;
    const fromY = Math.floor(segment.from / model.n);
    const toX = segment.to % model.n;
    const toY = Math.floor(segment.to / model.n);
    ctx.lineWidth = Math.max(1, segment.order * 0.42);
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();
  }
  ctx.restore();
}

function drawClimateLegend(bounds = null) {
  const used = new Set(model.climate);
  const entries = CLIMATES.filter((item) => used.has(item.id) && item.id !== 0).slice(0, 8);
  const pad = Math.max(6, model.n * 0.018);
  let y = pad;
  ctx.save();
  if (bounds) {
    ctx.beginPath();
    ctx.rect(bounds.x0, bounds.y0, bounds.x1 - bounds.x0 + 1, bounds.y1 - bounds.y0 + 1);
    ctx.clip();
  }
  ctx.globalAlpha = 0.92;
  ctx.font = `${Math.max(9, model.n * 0.032)}px system-ui, sans-serif`;
  for (const item of entries) {
    const [r, g, b] = item.color;
    ctx.fillStyle = "rgba(12, 18, 16, 0.7)";
    ctx.fillRect(pad - 3, y - 3, Math.max(96, model.n * 0.34), 16);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(pad, y, 10, 10);
    ctx.fillStyle = "#eef5ed";
    ctx.fillText(`${item.code} ${item.name}`, pad + 15, y + 9.5);
    y += 15;
  }
  ctx.restore();
}

function drawMagnifier(gx, gy) {
  if (!model || !magnifierCtx || !magnifierCanvas) return;
  const refinementOptions = readLocalRefinementOptions();
  const windowCells = Math.min(refinementOptions.windowCells, model.n);
  const displayFactor = Math.min(refinementOptions.refinementFactor, 8);
  const size = clamp(windowCells * displayFactor + 1, 129, 513);
  const pixelsPerCell = size / windowCells;
  const image = magnifierCtx.createImageData(size, size);
  const data = image.data;
  const half = (size - 1) / 2;
  for (let yy = 0; yy < size; yy += 1) {
    for (let xx = 0; xx < size; xx += 1) {
      const sx = clamp(gx + (xx - half) / pixelsPerCell, 0, model.n - 1);
      const sy = clamp(gy + (yy - half) / pixelsPerCell, 0, model.n - 1);
      const ix = clamp(Math.round(sx), 0, model.n - 1);
      const iy = clamp(Math.round(sy), 0, model.n - 1);
      const [r, g, b] = colorForValue(model, params, viewMode.value, iy * model.n + ix);
      const p = (yy * size + xx) * 4;
      data[p] = r;
      data[p + 1] = g;
      data[p + 2] = b;
      data[p + 3] = 255;
    }
  }
  magnifierCanvas.width = size;
  magnifierCanvas.height = size;
  magnifierCtx.putImageData(image, 0, 0);
  magnifierCtx.save();
  magnifierCtx.strokeStyle = "rgba(238, 245, 237, 0.18)";
  magnifierCtx.lineWidth = 1;
  const gridStartX = Math.ceil(gx - windowCells / 2);
  const gridEndX = Math.floor(gx + windowCells / 2);
  const gridStartY = Math.ceil(gy - windowCells / 2);
  const gridEndY = Math.floor(gy + windowCells / 2);
  for (let x = gridStartX; x <= gridEndX; x += 1) {
    const px = half + (x - gx) * pixelsPerCell;
    if (px < 0 || px > size) continue;
    magnifierCtx.beginPath();
    magnifierCtx.moveTo(px + 0.5, 0);
    magnifierCtx.lineTo(px + 0.5, size);
    magnifierCtx.stroke();
  }
  for (let y = gridStartY; y <= gridEndY; y += 1) {
    const py = half + (y - gy) * pixelsPerCell;
    if (py < 0 || py > size) continue;
    magnifierCtx.beginPath();
    magnifierCtx.moveTo(0, py + 0.5);
    magnifierCtx.lineTo(size, py + 0.5);
    magnifierCtx.stroke();
  }
  magnifierCtx.strokeStyle = "rgba(238, 245, 237, 0.94)";
  magnifierCtx.beginPath();
  magnifierCtx.moveTo(half + 0.5, 0);
  magnifierCtx.lineTo(half + 0.5, size);
  magnifierCtx.moveTo(0, half + 0.5);
  magnifierCtx.lineTo(size, half + 0.5);
  magnifierCtx.stroke();
  magnifierCtx.restore();
  if (magnifierLabel) {
    const subX = gx - Math.floor(gx);
    const subY = gy - Math.floor(gy);
    const refinedCellM = (model.cellSizeKm * 1000) / refinementOptions.refinementFactor;
    const preciseLabel = `${format(model.cellSizeKm * 1000, 1)} m/单元 | 精细 ${format(refinedCellM, 1)} m | ${windowCells}源格 x ${refinementOptions.refinementFactor}倍 | ${format(windowCells * model.cellSizeKm, 2)} km | 亚格 ${format(subX, 2)}, ${format(subY, 2)}`;
    magnifierLabel.textContent = preciseLabel;
  }
}

function sampleModel(gx, gy) {
  const xKm = gx * model.cellSizeKm;
  const yKm = gy * model.cellSizeKm;
  return {
    xKm,
    yKm,
    elevation: sampleArray(model.height, gx, gy),
    slope: sampleArray(model.slope, gx, gy),
    aspect: sampleAngle(model.aspect, gx, gy),
    curvature: sampleArray(model.terrainDiagnostics?.curvature, gx, gy),
    tpi: sampleArray(model.terrainDiagnostics?.tpi, gx, gy),
    roughness: sampleArray(model.terrainDiagnostics?.roughness, gx, gy),
    precipitation: sampleArray(model.precipitation, gx, gy),
    temperature: sampleArray(model.temperature, gx, gy),
    windSpeed: sampleArray(model.windSpeed, gx, gy),
    windDirection: sampleAngle(model.windDirection, gx, gy),
    wetnessIndex: sampleArray(model.wetnessIndex, gx, gy),
    flowVelocity: sampleArray(model.hydraulics?.flowVelocity, gx, gy),
    channelDepthM: sampleArray(model.hydraulics?.channelDepthM, gx, gy),
    channelWidthM: sampleArray(model.hydraulics?.channelWidthM, gx, gy),
    shearStressPa: sampleArray(model.hydraulics?.shearStressPa, gx, gy),
    streamPowerWm2: sampleArray(model.hydraulics?.streamPowerWm2, gx, gy),
    sedimentTransportIndex: sampleArray(model.hydraulics?.sedimentTransportIndex, gx, gy),
    erosionRisk: sampleArray(model.hydraulics?.erosionRisk, gx, gy),
    depositionRisk: sampleArray(model.hydraulics?.depositionRisk, gx, gy),
    vegetation: sampleArray(model.surface?.vegetation, gx, gy),
    canopyHeight: sampleArray(model.surface?.canopyHeight, gx, gy),
    leafAreaIndex: sampleArray(model.surface?.leafAreaIndex, gx, gy),
    hydraulicConductivityMmHr: sampleArray(model.surface?.hydraulicConductivityMmHr, gx, gy),
    availableWaterCapacityMm: sampleArray(model.surface?.availableWaterCapacityMm, gx, gy),
    rootDepthM: sampleArray(model.surface?.rootDepthM, gx, gy),
    imperviousFraction: sampleArray(model.surface?.imperviousFraction, gx, gy),
    infiltrationCapacity: sampleArray(model.surface?.infiltrationCapacity, gx, gy),
    actualEvapotranspiration: sampleArray(model.surface?.actualEvapotranspiration, gx, gy),
    waterBalance: sampleArray(model.surface?.waterBalance, gx, gy)
  };
}

function sampleArray(array, gx, gy, fallback = 0) {
  if (!array || !model) return fallback;
  const x0 = clamp(Math.floor(gx), 0, model.n - 1);
  const y0 = clamp(Math.floor(gy), 0, model.n - 1);
  const x1 = clamp(x0 + 1, 0, model.n - 1);
  const y1 = clamp(y0 + 1, 0, model.n - 1);
  const tx = gx - x0;
  const ty = gy - y0;
  const a = array[y0 * model.n + x0];
  const b = array[y0 * model.n + x1];
  const c = array[y1 * model.n + x0];
  const d = array[y1 * model.n + x1];
  if (![a, b, c, d].every(Number.isFinite)) return fallback;
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}

function sampleAngle(array, gx, gy) {
  if (!array || !model) return 0;
  const x0 = clamp(Math.floor(gx), 0, model.n - 1);
  const y0 = clamp(Math.floor(gy), 0, model.n - 1);
  const x1 = clamp(x0 + 1, 0, model.n - 1);
  const y1 = clamp(y0 + 1, 0, model.n - 1);
  const tx = gx - x0;
  const ty = gy - y0;
  const indices = [y0 * model.n + x0, y0 * model.n + x1, y1 * model.n + x0, y1 * model.n + x1];
  const weights = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < indices.length; i += 1) {
    const value = array[indices[i]];
    if (!Number.isFinite(value)) continue;
    const rad = (value * Math.PI) / 180;
    sx += Math.cos(rad) * weights[i];
    sy += Math.sin(rad) * weights[i];
  }
  return ((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360;
}

function localKmToWgs84(xKm, yKm) {
  aoi = readAoi();
  const half = Number(aoi.sizeKm || model.sizeKm) / 2;
  const northKm = half - yKm;
  const eastKm = xKm - half;
  const lat = Number(aoi.lat) + northKm / 110.574;
  const lon = Number(aoi.lon) + eastKm / (111.32 * Math.max(0.2, Math.cos((Number(aoi.lat) * Math.PI) / 180)));
  return { lat, lon };
}

function pointerToGrid(event) {
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  return {
    gx: clamp(x, 0, 1) * (model.n - 1),
    gy: clamp(y, 0, 1) * (model.n - 1)
  };
}

function updateMetrics() {
  if (!model) return;
  rustBackendModelRevision += 1;
  const stats = model.stats;
  if (typeof globalThis !== "undefined") globalThis.__geoLabModelStats = stats;
  updateWildlifeReleaseReadout();
  updateEcosystemFunctionReadout();
  updatePhysicalCouplingReadout();
  scheduleRustBackendAudit();
  const climate = CLIMATES[stats.dominantClimate];
  const eventDynamics = stats.hazards?.eventDynamics || null;
  const eventPulses = eventDynamics?.currentYearPulses || null;
  const seasonalState = stats.hazards?.seasonalState || eventDynamics?.seasonalState || null;
  const terrainPresetMetricChips = [
    stats.terrainPreset?.active ? `<span>\u5730\u8c8c/鍦拌矊 ${stats.terrainPreset.labelZh}</span>` : "",
    stats.terrainPreset?.scenicPreset && stats.terrainPreset.scenicPreset !== "none" ? `<span>\u666f\u533a/鏅尯 ${stats.terrainPreset.scenicLabelZh}</span>` : ""
  ].filter(Boolean);
  const cleanTerrainPresetMetricChips = [
    stats.terrainPreset?.active ? `<span>地貌 ${stats.terrainPreset.labelZh}</span>` : "",
    stats.terrainPreset?.scenicPreset && stats.terrainPreset.scenicPreset !== "none" ? `<span>景区 ${stats.terrainPreset.scenicLabelZh}</span>` : ""
  ].filter(Boolean);
  metricStrip.innerHTML = [
    ...cleanTerrainPresetMetricChips,
    `<span>最高点 ${Math.round(stats.maxElevation)} m</span>`,
    `<span>主河道 ${format(stats.mainChannelLengthKm, 1)} km</span>`,
    `<span>汇流 ${stats.flowRouting === "dinf" ? "D∞" : String(stats.flowRouting || "d8").toUpperCase()}</span>`,
    `<span>平均降水 ${Math.round(stats.meanPrecipitation)} mm/yr</span>`,
    `<span>粗糙 ${format(stats.meanRoughness || 0, 1)} m</span>`,
    `<span>LAI ${format(stats.meanLeafAreaIndex, 1)}</span>`,
    Number.isFinite(stats.meanVegetationResilience) ? `<span>植被韧性 ${format(stats.meanVegetationResilience, 2)}</span>` : "",
    stats.landscapeNetwork ? `<span>生态区块 ${stats.landscapeNetwork.blockCount}</span>` : "",
    Number.isFinite(stats.landscapeNetwork?.meanConnectivity) ? `<span>区块连通 ${format(stats.landscapeNetwork.meanConnectivity, 2)}</span>` : "",
    stats.wildlife ? `<span>动物 ${stats.wildlife.activeSpeciesCount}/${stats.wildlife.speciesCount} 种</span>` : "",
    Number.isFinite(stats.wildlife?.totalPopulationEstimate) ? `<span>种群估算 ${Math.round(stats.wildlife.totalPopulationEstimate)}</span>` : "",
    stats.wildlife?.migrationLinkCount ? `<span>迁徙廊道 ${stats.wildlife.migrationLinkCount}</span>` : "",
    Number.isFinite(stats.wildlife?.ecologicalIntegrityIndex) ? `<span>生态完整性 ${Math.round(stats.wildlife.ecologicalIntegrityIndex * 100)}%</span>` : "",
    Number.isFinite(stats.wildlife?.hillNumberQ1) ? `<span>有效物种 q1 ${format(stats.wildlife.hillNumberQ1, 1)}</span>` : "",
    Number.isFinite(stats.landscapeNetwork?.mapAreaClosurePct) ? `<span>面积闭合 ${format(stats.landscapeNetwork.mapAreaClosurePct, 1)}%</span>` : "",
    Number.isFinite(stats.physicalCoupling?.processIntegrityIndex) ? `<span>物理门控 ${Math.round(stats.physicalCoupling.processIntegrityIndex * 100)}%</span>` : "",
    Number.isFinite(stats.physicalCoupling?.couplingIntegrityIndex) ? `<span>过程联动 ${Math.round(stats.physicalCoupling.couplingIntegrityIndex * 100)}%</span>` : "",
    globalThis.__geoLabGpuStats
      ? `<span>GPU ${globalThis.__geoLabGpuStats.hardwareAccelerated === false ? "兼容" : "硬件"} · ${globalThis.__geoLabGpuStats.webglVersion}</span>`
      : "",
    Number.isFinite(stats.meanBiomassCarbonKgM2) ? `<span>碳储量 ${format(stats.meanBiomassCarbonKgM2, 1)} kg/m2</span>` : "",
    Number.isFinite(stats.dataConfidence?.meanObservedSupport) ? `<span>数据可信 ${format(stats.dataConfidence.meanObservedSupport, 2)}</span>` : "",
    `<span>入渗 ${format(stats.meanInfiltrationCapacity || 0, 2)}</span>`,
    `<span>蒸散 ${Math.round(stats.meanActualEvapotranspiration || 0)} mm/yr</span>`,
    Number.isFinite(stats.hydraulicDiagnostics?.meanChannelVelocityMs) ? `<span>河道流速 ${format(stats.hydraulicDiagnostics.meanChannelVelocityMs, 2)} m/s</span>` : "",
    Number.isFinite(stats.hydraulicDiagnostics?.highErosionAreaKm2) ? `<span>强侵蚀 ${format(stats.hydraulicDiagnostics.highErosionAreaKm2, 0)} km2</span>` : "",
    `<span>风 ${format(stats.meanWindSpeed || 0, 1)} m/s</span>`,
    stats.calibration?.biasPct !== null ? `<span>校准偏差 ${format(stats.calibration.biasPct, 0)}%</span>` : `<span>径流 ${format(stats.meanRunoffCoefficient, 2)}</span>`,
    Number.isFinite(stats.calibration?.advisor?.overallScore) ? `<span>校准评分 ${format(stats.calibration.advisor.overallScore, 2)}</span>` : "",
    Number.isFinite(stats.calibration?.hydrograph?.metrics?.kge) ? `<span>KGE ${format(stats.calibration.hydrograph.metrics.kge, 2)}</span>` : "",
    stats.meteorologyBoundary?.selectedYear ? `<span>边界年 ${stats.meteorologyBoundary.selectedYear}</span>` : "",
    Number.isFinite(stats.meteorologyBoundary?.hazardMultipliers?.flood) ? `<span>边界暴雨 ${format(stats.meteorologyBoundary.hazardMultipliers.flood, 2)}</span>` : "",
    stats.calibration?.comparison?.comparisonSource ? `<span>${localizedComparisonSource(stats.calibration.comparison.comparisonSource)}</span>` : "",
    Number.isFinite(stats.waterBudget?.outletRunoffCoefficientByVolume) ? `<span>Q/P ${format(stats.waterBudget.outletRunoffCoefficientByVolume, 2)}</span>` : "",
    Number.isFinite(stats.waterBudget?.residualPctOfInput) ? `<span>水量余项 ${format(stats.waterBudget.residualPctOfInput, 0)}%</span>` : "",
    Number.isFinite(stats.calibration?.drainageArea?.areaBiasPct) ? `<span>面积差 ${format(stats.calibration.drainageArea.areaBiasPct, 0)}%</span>` : "",
    Number.isFinite(stats.calibration?.gageLocation?.nearestRiverDistanceKm) ? `<span>站河距 ${format(stats.calibration.gageLocation.nearestRiverDistanceKm, 1)} km</span>` : "",
    stats.externalFlowlines ? `<span>河网约束 ${stats.externalFlowlines.constrainedCellCount}</span>` : "",
    stats.externalSurfacePatches ? `<span>地表情景 ${stats.externalSurfacePatches.affectedCellCount}</span>` : "",
    stats.externalInfrastructure ? `<span>人造影响 ${stats.externalInfrastructure.affectedCellCount}</span>` : "",
    stats.subsurface ? `<span>地下 ${stats.subsurface.layerCount} 层 · ${format(stats.subsurface.depthM, 0)} m</span>` : "",
    stats.subsurface?.externalControl?.matchedObservationCount ? `<span>钻孔校准 ${stats.subsurface.externalControl.matchedObservationCount}</span>` : "",
    Number.isFinite(stats.subsurface?.meanWaterTableDepthM) ? `<span>水位埋深 ${format(stats.subsurface.meanWaterTableDepthM, 1)} m</span>` : "",
    Number.isFinite(stats.subsurface?.meanAquiferPotential) ? `<span>含水潜势 ${format(stats.subsurface.meanAquiferPotential, 2)}</span>` : "",
    Number.isFinite(stats.subsurface?.meanFractureRisk) ? `<span>裂隙风险 ${format(stats.subsurface.meanFractureRisk, 2)}</span>` : "",
    Number.isFinite(stats.subsurface?.meanVoxelObservedSupport) ? `<span>地下可信 ${format(stats.subsurface.meanVoxelObservedSupport, 2)}</span>` : "",
    Number.isFinite(stats.subsurface?.meanEngineeringRisk) ? `<span>地下风险 ${format(stats.subsurface.meanEngineeringRisk, 2)}</span>` : "",
    `<span>主气候 ${climate.code} ${climate.name}</span>`,
    stats.hazards ? `<span>灾害 ${format(stats.hazards.meanCurrentCompositeHazard ?? stats.hazards.meanCompositeHazard, 2)}</span>` : "",
    eventDynamics ? `<span>当年事件 ${format(eventDynamics.meanCurrentEventComposite, 2)}</span>` : "",
    eventPulses
      ? `<span>脉冲 洪${format(eventPulses.flood, 2)} 干${format(eventPulses.drought, 2)} 火${format(eventPulses.wildfire, 2)} 坡${format(eventPulses.landslide, 2)}</span>`
      : "",
    seasonalState ? `<span>日序 ${seasonalState.dayOfYear} · ${seasonalState.season || "season"}</span>` : "",
    seasonalState ? `<span>积雪 ${format(seasonalState.meanSnowpackMm || 0, 1)} mm · ET30 ${format(seasonalState.meanPotentialEtMm || 0, 1)} mm</span>` : "",
    stats.timeProgression ? `<span>时间 ${format(stats.timeProgression.currentYear ?? stats.timeProgression.years, 0)}/${format(stats.timeProgression.years, 0)} 年</span>` : ""
  ].filter(Boolean).join("");
  if (hazardLabel && stats.hazards) {
    const mode = LOCALIZED_DISASTER_MODES[stats.hazards.mode] || stats.hazards.mode || "未知";
    const eventText = eventDynamics ? ` · 当年事件 ${format(eventDynamics.meanCurrentEventComposite, 2)} · ${dominantPulseLabel(eventPulses)}` : "";
    const seasonalText = seasonalState ? ` · 日序 ${seasonalState.dayOfYear} · 积雪 ${format(seasonalState.meanSnowpackMm || 0, 1)} mm` : "";
    hazardLabel.textContent = `${Math.round(stats.hazards.currentYear ?? params.currentYear ?? 0)}/${Math.round(stats.hazards.years ?? params.simulationYears ?? 0)} 年 · ${mode} · x${format(stats.hazards.intensity ?? params.disasterIntensity ?? 0, 2)}${seasonalText}${eventText}`;
  }
  const sourceText = stats.externalSourceCount ? ` · 真实数据 ${stats.externalSourceCount}` : "";
  subtitle.textContent = `${model.sizeKm} km × ${model.sizeKm} km · ${model.areaKm2} km² · ${model.n}² DEM · 单元 ${format(model.cellSizeKm * 1000, 1)} m${sourceText}`;
  runtimeLabel.textContent =
    model.lastUpdateMode === "temporal"
      ? `时间快算 ${format(model.temporalRuntimeMs ?? model.runtimeMs, 1)} ms · 静态层复用`
      : `${Math.round(model.runtimeMs)} ms${modelWorker ? " · 后台线程" : ""}`;
  updateTerrainPresetStatus();
  updateDataStatus();
  updateScenarioSynthesis();
}

function currentScenarioSynthesis() {
  if (!model?.stats) return null;
  return buildScenarioSynthesis(model, params, {
    title: scenarioTitle?.value,
    purpose: scenarioPurpose?.value,
    notes: scenarioNotes?.value
  });
}

function updateScenarioSynthesis() {
  const report = currentScenarioSynthesis();
  if (!report) return;
  const locale = globalThis.__geoLabLocale?.locale === "zh-CN" ? "zh" : "en";
  scenarioCoverageScore.textContent = scenarioScoreLabel(report.overview.coverageScorePct);
  scenarioEvidenceScore.textContent = scenarioScoreLabel(report.overview.evidenceScorePct);
  scenarioCoverageBar.style.width = `${report.overview.coverageScorePct}%`;
  scenarioEvidenceBar.style.width = `${report.overview.evidenceScorePct}%`;
  scenarioSynthesisReadout.replaceChildren(...report.domains.map((item) => {
    const row = document.createElement("article");
    row.className = "scenario-domain-row";
    row.dataset.status = item.statusCode;
    const heading = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = item.label[locale];
    const status = document.createElement("span");
    status.textContent = item.status[locale];
    heading.append(title, status);
    const metrics = document.createElement("div");
    metrics.className = "scenario-domain-metrics";
    metrics.innerHTML = `<span>${locale === "zh" ? "覆盖" : "Coverage"} ${format(item.coveragePct, 0)}%</span><span>${locale === "zh" ? "证据" : "Evidence"} ${format(item.evidencePct, 0)}%</span>`;
    const summary = document.createElement("p");
    summary.textContent = item.summary[locale];
    row.append(heading, metrics, summary);
    return row;
  }));
  scenarioCouplingCount.textContent = `${report.couplings.length}`;
  scenarioCouplingReadout.replaceChildren(...report.couplings.map((item) => {
    const row = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = item.label[locale];
    const summary = document.createElement("span");
    summary.textContent = item.summary[locale];
    row.append(title, summary);
    return row;
  }));
  scenarioPriorityCount.textContent = `${report.priorities.length}`;
  scenarioPriorityReadout.replaceChildren(...report.priorities.map((priority) => {
    const row = document.createElement("div");
    row.className = "scenario-priority-row";
    row.dataset.priority = priority.priorityCode;
    const heading = document.createElement("strong");
    heading.textContent = `${priority.priority[locale]} · ${priority.domainLabel[locale]}`;
    const action = document.createElement("span");
    action.textContent = priority.action[locale];
    row.append(heading, action);
    return row;
  }));
  if (typeof globalThis !== "undefined") globalThis.__geoLabScenarioSynthesis = report;
}

function scenarioScoreLabel(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return "--%";
  if (score > 0 && score < 0.1) return "<0.1%";
  return `${format(score, score < 10 ? 1 : 0)}%`;
}

function exportScenarioSynthesis() {
  const report = currentScenarioSynthesis();
  if (!report) return;
  download("geolab-128-scenario-synthesis.json", "application/json", JSON.stringify(report, null, 2));
  setStatus("情景综合已导出");
}

function exportScenarioBrief() {
  const report = currentScenarioSynthesis();
  if (!report) return;
  download("geolab-128-scenario-brief.md", "text/markdown;charset=utf-8", makeScenarioSynthesisMarkdown(report));
  setStatus("情景简报已导出");
}

function updatePhysicalCouplingReadout() {
  if (!physicalCouplingReadout) return;
  physicalCouplingReadout.replaceChildren();
  const state = model?.physicalCoupling;
  const locale = globalThis.__geoLabLocale?.locale === "zh-CN" ? "zh" : "en";
  if (!state?.summary) {
    physicalCouplingReadout.textContent = locale === "zh" ? "物理联动将在演算后进行门控。" : "Physical coupling gates will be evaluated after simulation.";
    return;
  }
  const summary = state.summary;
  const limiting = state.couplings.find((item) => item.id === summary.limitingCouplingId);
  const heading = document.createElement("strong");
  heading.textContent = locale === "zh"
    ? `物理门控 ${Math.round(summary.processIntegrityIndex * 100)}% · 跨系统联动 ${Math.round(summary.couplingIntegrityIndex * 100)}%`
    : `Physical gates ${Math.round(summary.processIntegrityIndex * 100)}% · Cross-system coupling ${Math.round(summary.couplingIntegrityIndex * 100)}%`;
  const gateLine = document.createElement("div");
  gateLine.textContent = locale === "zh"
    ? `通过 ${summary.passedGateCount} · 复核 ${summary.reviewGateCount} · 失败 ${summary.failedGateCount} · 限制链路 ${localizedCouplingLabel(limiting?.id, locale)}`
    : `Pass ${summary.passedGateCount} · Review ${summary.reviewGateCount} · Fail ${summary.failedGateCount} · Limiting pathway ${localizedCouplingLabel(limiting?.id, locale)}`;
  const water = document.createElement("div");
  water.textContent = locale === "zh"
    ? `水量未闭合余项 ${format(state.waterPartition?.residualPctOfInput || 0, 3)}% · 地下补给 ${format((state.waterPartition?.groundwaterRechargeVolumeM3 || 0) / 1e6, 1)} 百万 m³/yr`
    : `Unresolved water residual ${format(state.waterPartition?.residualPctOfInput || 0, 3)}% · Recharge ${format((state.waterPartition?.groundwaterRechargeVolumeM3 || 0) / 1e6, 1)} million m³/yr`;
  const boundary = document.createElement("small");
  boundary.textContent = locale === "zh"
    ? "门控衡量内部约束与联动方向，不代表完成现场校准或专业认证。"
    : "Gates assess internal constraints and coupling direction; they do not imply field calibration or professional certification.";
  physicalCouplingReadout.append(heading, gateLine, water, boundary);
  if (typeof globalThis !== "undefined") globalThis.__geoLabPhysicalCoupling = state;
}

function localizedCouplingLabel(id, locale) {
  const labels = {
    "atmosphere-water": { zh: "大气—水量", en: "atmosphere-water" },
    "terrain-atmosphere": { zh: "地形—大气", en: "terrain-atmosphere" },
    "soil-water": { zh: "土壤—产流", en: "soil-water" },
    "water-subsurface": { zh: "地表水—地下", en: "water-subsurface" },
    "water-geomorphology": { zh: "水动力—地貌", en: "water-geomorphology" },
    "ecology-stability": { zh: "生态—稳定性", en: "ecology-stability" },
    "human-water": { zh: "设施—水量", en: "human-water" },
    "water-ecology": { zh: "水量—生态", en: "water-ecology" }
  };
  return labels[id]?.[locale] || id || (locale === "zh" ? "未识别" : "unresolved");
}

function exportPhysicalCoupling() {
  if (!model?.physicalCoupling) return;
  const report = buildPhysicalCouplingReport(model, params);
  download("geolab-128-physical-coupling.json", "application/json", JSON.stringify(report, null, 2));
  setStatus("物理联动报告已导出");
}

function exportPhysicalCouplingCSV() {
  if (!model?.physicalCoupling) return;
  const report = buildPhysicalCouplingReport(model, params);
  download("geolab-128-physical-coupling.csv", "text/csv;charset=utf-8", makePhysicalCouplingCSV(report));
  setStatus("物理联动 CSV 已导出");
}

async function refreshRustBackendConnection() {
  rustBackendState = { ...rustBackendState, status: "connecting", error: null };
  updateRustBackendReadout();
  try {
    rustBackendState = await inspectBackend(rustBackendEndpoint);
    scheduleRustBackendAudit();
  } catch (error) {
    rustBackendState = {
      ...rustBackendState,
      status: "failed",
      error: error?.message || String(error)
    };
  }
  updateRustBackendReadout();
}

function scheduleRustBackendAudit() {
  clearTimeout(rustBackendAuditTimer);
  if (!model || rustBackendState.status !== "ready") return;
  rustBackendAuditTimer = setTimeout(() => runRustBackendAudit({ manual: false }), 450);
}

async function runRustBackendAudit(options = {}) {
  if (!model) return;
  if (rustBackendState.status === "failed" || rustBackendState.status === "unavailable") {
    await refreshRustBackendConnection();
  }
  if (rustBackendState.status !== "ready") return;
  const serial = ++rustBackendAuditSerial;
  const modelRevision = rustBackendModelRevision;
  rustBackendState = { ...rustBackendState, status: "running", error: null };
  updateRustBackendReadout();
  if (options.manual) setStatus("Rust 后端复核中");
  try {
    const audit = await runBackendVerification(model, params, rustBackendEndpoint, { resolution: 96 });
    if (serial !== rustBackendAuditSerial) return;
    if (modelRevision !== rustBackendModelRevision) {
      rustBackendState = { ...rustBackendState, status: "ready", error: null };
      updateRustBackendReadout();
      scheduleRustBackendAudit();
      return;
    }
    rustBackendAudit = audit;
    rustBackendState = { ...rustBackendState, status: "ready", error: null };
    if (typeof globalThis !== "undefined") globalThis.__geoLabRustBackend = audit;
    updateRustBackendReadout();
    if (options.manual) setStatus("Rust 后端复核完成");
  } catch (error) {
    if (serial !== rustBackendAuditSerial) return;
    rustBackendState = {
      ...rustBackendState,
      status: "failed",
      error: error?.message || String(error)
    };
    updateRustBackendReadout();
    if (options.manual) setStatus("Rust 后端复核失败");
  }
}

function updateRustBackendReadout() {
  if (!rustBackendReadout) return;
  const locale = globalThis.__geoLabLocale?.locale === "zh-CN" ? "zh" : "en";
  rustBackendReadout.replaceChildren();
  const state = rustBackendState.status;
  rustBackendReadout.dataset.state = rustBackendAudit && state === "ready" ? "verified" : state;
  runRustBackendAuditButton.disabled = state === "connecting" || state === "running";
  exportRustBackendAuditButton.disabled = !rustBackendAudit;
  if (state === "connecting" || state === "running") {
    rustBackendReadout.textContent = locale === "zh"
      ? state === "running" ? "Rust 正在独立复算当前情景。" : "正在连接 Rust 演算核心。"
      : state === "running" ? "Rust is independently recomputing the current scenario." : "Connecting to the Rust computation core.";
    return;
  }
  if (state === "failed") {
    rustBackendReadout.textContent = locale === "zh"
      ? `Rust 演算核心不可用：${rustBackendState.error || "未知错误"}`
      : `Rust computation core unavailable: ${rustBackendState.error || "unknown error"}`;
    return;
  }
  if (!rustBackendAudit) {
    const wasm = rustBackendState.transport === "browser-wasm";
    rustBackendReadout.textContent = locale === "zh"
      ? `${wasm ? "Rust WASM 核心已加载" : "Rust 原生核心已连接"} · API ${rustBackendState.health?.apiVersion || "1.0"}`
      : `${wasm ? "Rust WASM core loaded" : "Rust native core connected"} · API ${rustBackendState.health?.apiVersion || "1.0"}`;
    return;
  }
  const report = rustBackendAudit.report;
  const summary = report.summary;
  const heading = document.createElement("strong");
  heading.textContent = locale === "zh"
    ? `Rust 独立门控 ${Math.round(summary.processIntegrityIndex * 100)}% · ${rustBackendAudit.sample.auditResolution}² 复核格网`
    : `Rust independent gates ${Math.round(summary.processIntegrityIndex * 100)}% · ${rustBackendAudit.sample.auditResolution}² audit grid`;
  const gates = document.createElement("div");
  gates.textContent = locale === "zh"
    ? `通过 ${summary.passedGateCount} · 复核 ${summary.reviewGateCount} · 失败 ${summary.failedGateCount}`
    : `Pass ${summary.passedGateCount} · Review ${summary.reviewGateCount} · Fail ${summary.failedGateCount}`;
  const water = document.createElement("div");
  water.textContent = locale === "zh"
    ? `水量残差 ${format(report.waterBudget.residualPercentOfInput, 6)}% · 最大格点余项 ${format(summary.maximumAbsoluteCellResidualMm, 6)} mm`
    : `Water residual ${format(report.waterBudget.residualPercentOfInput, 6)}% · maximum cell residual ${format(summary.maximumAbsoluteCellResidualMm, 6)} mm`;
  const processes = document.createElement("div");
  processes.textContent = locale === "zh"
    ? `${report.terrain.routingMethod === "multiple-flow-direction" ? "MFD 多流向" : "D8"} · 地下水余项 ${format(report.subsurfaceBudget.residualPercentOfInput, 6)}% · 泥沙余项 ${format(report.sedimentBudget.residualPercentOfDetachment, 6)}% · 生境连通 ${format(report.ecology.meanResistanceConnectivity * 100, 1)}%`
    : `${report.terrain.routingMethod === "multiple-flow-direction" ? "MFD routing" : "D8 routing"} · groundwater residual ${format(report.subsurfaceBudget.residualPercentOfInput, 6)}% · sediment residual ${format(report.sedimentBudget.residualPercentOfDetachment, 6)}% · habitat connectivity ${format(report.ecology.meanResistanceConnectivity * 100, 1)}%`;
  const boundary = document.createElement("small");
  boundary.textContent = locale === "zh"
    ? "Rust 使用独立水文、地下水、泥沙和生境内核复核约束；数值吻合不能替代现场校准。"
    : "Rust independently audits hydrology, groundwater, sediment, and habitat constraints; numerical agreement does not replace field calibration.";
  rustBackendReadout.append(heading, gates, water, processes, boundary);
}

function exportRustBackendAudit() {
  if (!rustBackendAudit) return;
  download("geolab-128-rust-backend-verification.json", "application/json", JSON.stringify(rustBackendAudit, null, 2));
  setStatus("Rust 后端报告已导出");
}

async function exportEngineScene(engine) {
  if (!model) return;
  const engineLabel = engine === "unity" ? "Unity" : "Unreal";
  setStatus(`${engineLabel} 场景交换包生成中`);
  await nextFrame();
  try {
    const packageResult = buildEngineScenePackage(model, params, { engine });
    downloadBlob(packageResult.fileName, packageResult.blob);
    if (typeof globalThis !== "undefined") {
      globalThis.__geoLabLastEngineExport = {
        engine,
        fileName: packageResult.fileName,
        manifest: packageResult.manifest,
        files: packageResult.files
      };
    }
    setStatus(`${engineLabel} 场景交换包已导出`);
  } catch (error) {
    console.error(error);
    setStatus(`${engineLabel} 场景交换包生成失败`);
  }
}

function updateDataStatus() {
  if (!dataStatus) return;
  updateCalibrationAdvisorStatus();
  const base = summarizeLayerBundle(externalLayers);
  const quality = model?.stats?.externalQuality || [];
  const readiness = model?.stats?.dataReadiness;
  if (!quality.length) {
    dataStatus.textContent = readiness ? `${base} · ${localizedQualityClass(readiness.class)} ${format(readiness.scorePct, 0)}%` : base;
    return;
  }
  const arealQuality = quality.filter((item) => !["flowlines", "infrastructure", "surfacePatches"].includes(item.key));
  if (!arealQuality.length) {
    const constrainedCells = quality.reduce((sum, item) => sum + (item.constrainedCellCount || item.affectedCellCount || 0), 0);
    const readinessText = readiness ? ` · ${localizedQualityClass(readiness.class)} ${format(readiness.scorePct, 0)}%` : "";
    dataStatus.textContent = `${base} · 矢量约束 ${constrainedCells}`;
    if (readinessText) dataStatus.textContent += readinessText;
    return;
  }
  const minCoverage = Math.min(...(arealQuality.length ? arealQuality : quality).map((item) => item.coverage));
  const spatialQuality = arealQuality.filter((item) => !item.resampling?.uniformField);
  const cellQuality = spatialQuality.length ? spatialQuality : arealQuality.length ? arealQuality : quality;
  const maxSourceCell = Math.max(...cellQuality.map((item) => item.sourceCellSizeM?.mean || 0));
  const cellText = maxSourceCell > 0 ? ` · 最粗源 ${format(maxSourceCell, 0)} m` : "";
  dataStatus.textContent = `${base} · 覆盖 ${format(minCoverage * 100, 0)}%${cellText}`;
  if (readiness) dataStatus.textContent += ` · ${localizedQualityClass(readiness.class)} ${format(readiness.scorePct, 0)}%`;
}

function updateCalibrationAdvisorStatus() {
  if (!calibrationAdvisorStatus) return;
  const advisor = model?.stats?.calibration?.advisor;
  const comparison = model?.stats?.calibration?.comparison;
  if (!advisor || advisor.status === "not-calibrated") {
    calibrationAdvisorStatus.textContent = "校准顾问等待观测流量、流域面积和站点经纬度。";
    return;
  }
  const parts = [
    `等级 ${localizedQualityClass(advisor.qualityClass)}`,
    Number.isFinite(advisor.overallScore) ? `评分 ${format(advisor.overallScore, 2)}` : null,
    comparison?.comparisonSource ? `对比源 ${localizedComparisonSource(comparison.comparisonSource)}` : null,
    Number.isFinite(comparison?.biasPct) ? `偏差 ${format(comparison.biasPct, 1)}%` : null,
    Number.isFinite(model?.stats?.calibration?.hydrograph?.metrics?.kge) ? `KGE ${format(model.stats.calibration.hydrograph.metrics.kge, 2)}` : null,
    advisor.parameterSuggestion?.correctionFactor ? `修正因子 ${format(advisor.parameterSuggestion.correctionFactor, 3)}` : null,
    model?.stats?.calibration?.appliedCalibrationAdvisor?.mode ? `已应用 ${model.stats.calibration.appliedCalibrationAdvisor.mode}` : null
  ].filter(Boolean);
  const warning = advisor.warnings?.[0] ? ` · ${advisor.warnings[0]}` : "";
  calibrationAdvisorStatus.textContent = `校准顾问: ${parts.join(" · ")}${warning}`;
}

function updateLabels() {
  updateResolutionOptionLabels();
  windLabel.textContent = `风来自 ${Math.round(Number(ui.windDirection.value))}° · ${format(Number(ui.windSpeed.value), 1)} m/s`;
  const routingMode = ui.flowRouting?.value || "d8";
  const routing = routingMode === "dinf" ? "D∞" : routingMode === "mfd" ? "MFD" : "D8";
  riverLabel.textContent = `成河阈值 ${format(Number(ui.riverThreshold.value), 1)} km² · ${routing}`;
}

function updateResolutionOptionLabels() {
  const sizeKm = currentMapSizeKm();
  for (const option of ui.resolution?.options || []) {
    const resolution = Number(option.value);
    if (!Number.isFinite(resolution) || resolution <= 1) continue;
    option.textContent = `${resolution}² · ${formatCellSize((sizeKm * 1000) / (resolution - 1))}`;
  }
}

function dominantPulseLabel(pulses) {
  if (!pulses) return "脉冲 --";
  const ranked = [
    { label: "洪水", value: Number(pulses.flood) },
    { label: "干旱", value: Number(pulses.drought) },
    { label: "野火", value: Number(pulses.wildfire) },
    { label: "滑坡", value: Number(pulses.landslide) }
  ]
    .filter((item) => Number.isFinite(item.value))
    .sort((a, b) => b.value - a.value);
  const top = ranked[0];
  return top ? `${top.label}脉冲 ${format(top.value, 2)}` : "脉冲 --";
}

function formatCellSize(cellM) {
  return cellM >= 1000 ? `${format(cellM / 1000, 2)} km` : `${format(cellM, cellM < 100 ? 1 : 0)} m`;
}

function setStatus(text) {
  statusNode.textContent = text;
}

function localizedLabel(map, key, fallback = "未知") {
  return map[key] || key || fallback;
}

function localizedQualityClass(value) {
  return LOCALIZED_QUALITY_CLASSES[value] || value || "未知";
}

function localizedComparisonSource(value) {
  return LOCALIZED_COMPARISON_SOURCES[value] || value || "未知对比源";
}

function readParams() {
  if (hazardLabel) {
    const modeValue = ui.disasterMode?.value || "none";
    const mode = LOCALIZED_DISASTER_MODES[modeValue] || ui.disasterMode?.selectedOptions?.[0]?.textContent || modeValue;
    hazardLabel.textContent = `${Math.round(Number(ui.currentYear.value))}/${Math.round(Number(ui.simulationYears.value))} 年 · ${mode} · x${format(Number(ui.disasterIntensity.value), 2)}`;
  }
  return {
    seed: Number(ui.seed.value),
    mapSizeKm: Number(ui.mapSizeKm.value),
    resolution: Number(ui.resolution.value),
    renderDetailQuality: ui.renderDetailQuality?.value || "ultra",
    continentTemplate: ui.continentTemplate?.value || "global_custom",
    geomorphologyPreset: ui.geomorphologyPreset?.value || "custom",
    scenicPreset: ui.scenicPreset?.value || "none",
    relief: Number(ui.relief.value),
    ridgeWeight: Number(ui.ridgeWeight.value),
    tectonics: Number(ui.tectonics.value),
    seaLevel: Number(ui.seaLevel.value),
    windDirection: Number(ui.windDirection.value),
    windSpeed: Number(ui.windSpeed.value),
    baseTemperature: Number(ui.baseTemperature.value),
    humidity: Number(ui.humidity.value),
    latitude: Number(ui.latitude.value),
    lapseRate: Number(ui.lapseRate.value),
    permeability: Number(ui.permeability.value),
    flowRouting: ui.flowRouting.value,
    riverThreshold: Number(ui.riverThreshold.value),
    erosionStrength: Number(ui.erosionStrength.value),
    verticalScale: Number(ui.verticalScale.value),
    microRelief: Number(ui.microRelief.value),
    terrainComplexity: clamp(Number(ui.terrainComplexity?.value ?? 0.58), 0, 1),
    terrainDiversity: clamp(Number(ui.terrainDiversity?.value ?? 0.64), 0, 1),
    landscapeBlockGrid: clamp(Math.round(Number(ui.landscapeBlockGrid?.value ?? 24)), 4, 48),
    externalDataWeight: Number(ui.externalDataWeight.value),
    vegetationFeedback: Number(ui.vegetationFeedback.value),
    calibrationStrength: Number(ui.calibrationStrength.value),
    simulationYears: Number(ui.simulationYears.value),
    currentYear: Number(ui.currentYear.value),
    dayOfYear: Number(ui.dayOfYear.value),
    disasterMode: ui.disasterMode.value,
    disasterIntensity: Number(ui.disasterIntensity.value),
    subsurfaceLayers: Number(ui.subsurfaceLayers.value),
    subsurfaceDepthM: Number(ui.subsurfaceDepthM.value),
    geologyComplexity: Number(ui.geologyComplexity.value),
    aquiferRechargeScale: Number(ui.aquiferRechargeScale.value),
    terrainDetail3DEnabled: ui.terrainDetail3DEnabled?.checked === true,
    subsurface3DEnabled: ui.subsurface3DEnabled?.checked === true,
    wind3DEnabled: ui.wind3DEnabled?.checked === true,
    grid3DEnabled: ui.grid3DEnabled?.checked === true,
    ecosystem3DEnabled: ui.ecosystem3DEnabled?.checked !== false,
    ecosystem3DRoleFocus: ui.ecosystem3DRoleFocus?.value || "all",
    ecosystem3DLinkMode: ui.ecosystem3DLinkMode?.value || "all",
    ecosystem3DNodeScale: clamp(Number(ui.ecosystem3DNodeScale?.value ?? 1) || 1, 0.5, 3),
    wildlifeEnabled: ui.wildlifeEnabled?.checked !== false,
    wildlifeAbundance: clamp(Number(ui.wildlifeAbundance?.value ?? 1), 0, 3),
    wildlifeMigrationStrength: clamp(Number(ui.wildlifeMigrationStrength?.value ?? 0.68), 0, 1),
    wildlifeHabitatSensitivity: clamp(Number(ui.wildlifeHabitatSensitivity?.value ?? 0.72), 0, 1),
    wildlifeMaxAgents: clamp(Math.round(Number(ui.wildlifeMaxAgents?.value ?? 480)), 0, 5000),
    wildlifeReleases: wildlifeReleaseBatches.map((row) => ({ ...row })),
    wildlife3DEnabled: ui.wildlife3DEnabled?.checked !== false,
    wildlife3DScale: clamp(Number(ui.wildlife3DScale?.value ?? 1) || 1, 0.4, 3),
    block3DEnabled: ui.block3DEnabled?.checked !== false,
    block3DMode: ui.block3DMode?.value || "microzones",
    block3DFocus: ui.block3DFocus?.value || "all",
    block3DScale: clamp(Number(ui.block3DScale?.value ?? 1) || 1, 0.5, 3),
    block3DRecommendationRanks: clamp(
      Math.round(Number.isFinite(Number(ui.block3DRecommendationRanks?.value)) ? Number(ui.block3DRecommendationRanks?.value) : 1),
      1,
      3
    ),
    block3DRecommendationMinScore: clamp(
      Number.isFinite(Number(ui.block3DRecommendationMinScore?.value)) ? Number(ui.block3DRecommendationMinScore?.value) : 0.5,
      0,
      1
    ),
    block3DAdaptivePlanLimit: clamp(
      Math.round(Number.isFinite(Number(ui.block3DAdaptivePlanLimit?.value)) ? Number(ui.block3DAdaptivePlanLimit?.value) : 48),
      1,
      128
    ),
    block3DAdaptivePlanPhaseStep: ui.block3DAdaptivePlanPhaseStep?.value || "all",
    block3DAdaptivePlanPhaseMode: ui.block3DAdaptivePlanPhaseMode?.value || "current",
    aoi: readAoi(),
    externalLayers
  };
}

function readAoi() {
  return {
    lat: Number(document.getElementById("aoiLat").value),
    lon: Number(document.getElementById("aoiLon").value),
    sizeKm: currentMapSizeKm(),
    startYear: Number(document.getElementById("aoiStartYear").value),
    endYear: Number(document.getElementById("aoiEndYear").value),
    gageSite: document.getElementById("aoiGageSite").value,
    proxyBaseUrl: document.getElementById("dataProxyBase").value
  };
}

function proxyEndpointUrl(proxyBaseUrl, path) {
  const base = String(proxyBaseUrl || "").trim().replace(/\/+$/, "");
  if (!base) throw new Error("缺少 Cloudflare Worker URL");
  return new URL(`${base}${path}`);
}

function writeAoi(nextAoi) {
  document.getElementById("aoiLat").value = nextAoi.lat;
  document.getElementById("aoiLon").value = nextAoi.lon;
  document.getElementById("aoiSizeKm").value = nextAoi.sizeKm;
  if (ui.mapSizeKm) ui.mapSizeKm.value = String(nextAoi.sizeKm || MAP_SIZE_KM);
  document.getElementById("aoiStartYear").value = nextAoi.startYear;
  document.getElementById("aoiEndYear").value = nextAoi.endYear;
  document.getElementById("aoiGageSite").value = nextAoi.gageSite;
  document.getElementById("dataProxyBase").value = nextAoi.proxyBaseUrl || "";
}

function exportableParams() {
  const next = { ...params };
  delete next.externalLayers;
  return next;
}

function exportDataSchema() {
  const mapSizeKm = currentMapSizeKm();
  const schema = {
    type: "geolab-grid",
    width: 4,
    height: 4,
    boundsKm: [0, 0, mapSizeKm, mapSizeKm],
    areaKm2: mapSizeKm * mapSizeKm,
    wgs84BoundsExample: [-120.266545, 37.286302, -118.810055, 38.443898],
    crs: "EPSG:4326 or projected CRS note",
    nativeCellSizeM: { x: 500, y: 500, unit: "metre" },
    verticalUnit: "metre",
    valueUnit: "mixed by layer",
    modelOptions: {
      mapSizeKm: Array.from(SUPPORTED_MAP_SIZES_KM),
      resolution: Array.from(SUPPORTED_MODEL_RESOLUTIONS),
      geomorphologyPresets: GEOMORPHOLOGY_PRESETS.map((preset) => {
        const display = terrainPresetDisplayInfo(preset, "geomorphology") || preset;
        return {
          id: preset.id,
          labelZh: display.labelZh,
          referenceLandformZh: display.referenceLandformZh,
          processSignature: terrainPresetProcessProfile({ geomorphologyPreset: preset.id, scenicPreset: "none" })
        };
      }),
      scenicReproductionPresets: SCENIC_REPRODUCTION_PRESETS.map((preset) => {
        const display = terrainPresetDisplayInfo(preset, "scenic") || preset;
        return {
          id: preset.id,
          labelZh: display.labelZh,
          geomorphologyPreset: preset.geomorphologyPreset,
          referenceLandformZh: display.referenceLandformZh,
          processSignature: terrainPresetProcessProfile({ geomorphologyPreset: preset.geomorphologyPreset, scenicPreset: preset.id })
        };
      }),
      reliefM: { min: 300, max: MAX_TERRAIN_ELEVATION_M, step: 25 },
      dayOfYear: { min: 1, max: 365, step: 1 },
      flowRouting: ["dinf", "d8", "mfd"]
    },
    soilHydraulicConductivity: [34, 18, 5, 1.2, 30, 12, 4.5, 1.1, 26, 10, 3.8, 0.9, 20, 8, 4, 1],
    availableWaterCapacity: [115, 140, 165, 120, 125, 155, 150, 112, 130, 160, 145, 105, 150, 170, 138, 110],
    rootDepth: [1.6, 1.4, 1.1, 0.8, 1.8, 1.5, 1.0, 0.7, 1.2, 0.9, 0.8, 0.55, 1.4, 1.1, 0.9, 0.5],
    imperviousFraction: [0.02, 0.02, 0.05, 0.12, 0.01, 0.02, 0.04, 0.1, 0.03, 0.04, 0.06, 0.18, 0.02, 0.03, 0.05, 0.22],
    dem: [124, 130, 142, 151, 132, 146, 160, 174, 118, 126, 139, 152, 96, 108, 121, 133],
    landCover: [41, 41, 71, 82, 41, 43, 71, 82, 52, 71, 81, 82, 90, 95, 71, 21],
    soilGroup: ["B", "B", "C", "D", "B", "C", "C", "D", "A", "B", "C", "D", "C", "D", "B", "C"],
    vegetation: [0.82, 0.78, 0.46, 0.32, 0.86, 0.81, 0.52, 0.35, 0.58, 0.44, 0.4, 0.26, 0.74, 0.68, 0.48, 0.18],
    leafAreaIndex: [4.8, 4.2, 1.2, 0.8, 5.1, 4.5, 1.5, 0.9, 2.4, 1.2, 1.1, 0.6, 3.2, 2.1, 1.3, 0.4],
    canopyHeight: [18, 16, 1.2, 0.6, 20, 17, 1.4, 0.7, 3.2, 1.1, 0.9, 0.3, 8, 2.2, 1.2, 0.1],
    precipitation: [980, 1010, 760, 690, 1030, 1090, 820, 710, 920, 880, 740, 660, 1120, 1050, 790, 700],
    temperature: [12.4, 12.2, 13.1, 13.4, 12, 11.8, 12.7, 13, 13.2, 13.1, 13.5, 13.8, 12.6, 12.9, 13.3, 13.7],
    windSpeed: [8.2, 8.1, 7.9, 8, 8.4, 8.2, 8, 8.1, 7.8, 7.9, 7.7, 7.8, 7.5, 7.6, 7.7, 7.8],
    windDirection: [270, 270, 268, 269, 271, 270, 269, 268, 272, 271, 270, 269, 273, 272, 271, 270],
    metTimeSeriesCsvColumns: ["date", "prcp_mm", "tmax", "tmin", "wind_speed", "wind_direction"],
    griddedMetTimeSeriesCsvColumns: ["x_km", "y_km", "date", "prcp_mm", "tmax", "tmin", "wind_speed", "wind_direction"],
    metVectorCsvColumns: ["x_km", "y_km", "date", "prcp_mm", "tmean", "u10", "v10"],
    subsurfaceObservations: {
      csvColumns: [
        "borehole_id",
        "x_km",
        "y_km",
        "water_table_depth_m",
        "bedrock_depth_m",
        "top_depth_m",
        "bottom_depth_m",
        "lithology",
        "porosity",
        "permeability_mm_hr",
        "aquifer_potential",
        "fracture_risk",
        "liquefaction_risk"
      ],
      geojsonPointProperties: [
        "borehole_id",
        "water_table_depth_m",
        "bedrock_depth_m",
        "top_depth_m",
        "bottom_depth_m",
        "lithology"
      ],
      lithologyCodes: ["soil", "regolith", "alluvium", "fractured_bedrock", "bedrock", "aquitard"]
    },
    daymetGridSampleJson: {
      type: "geolab-grid",
      width: 3,
      height: 3,
      boundsKm: [0, 0, mapSizeKm, mapSizeKm],
      precipitation: "annual precipitation mm array",
      temperature: "mean temperature C array",
      metSummary: {
        type: "daymet-grid-sample",
        annualPrecipitationSeries: ["year", "precipitationMm", "meanTemperatureC"],
        boundaryStatistics: ["p95DailyPrecipitationMm", "maxDrySpellDays", "hotDayFraction", "p95DailyWindSpeedMs"],
        dailySeries: ["date", "precipitationMm", "temperatureC", "windSpeedMs", "windFromDeg"]
      }
    },
    rasterResamplingPolicy: {
      categorical: "target-cell majority for landCover and soilGroup when source cells are finer than the model grid",
      continuous: "target-cell window average for continuous rasters when source cells are finer than the model grid",
      windDirection: "circular mean in degrees, preserving wraparound at 0/360"
    },
    rasterNormalizationPolicy: {
      scaleOffset: "scaleFactor/addOffset metadata is applied to continuous rasters before modeling",
      demUnits: "DEM, canopy height, and root depth are normalized to meters when units are declared",
      waterUnits: "precipitation and available water capacity are normalized to millimeters; Ksat is normalized to mm/hr",
      metUnits: "temperature is normalized to Celsius and wind speed to m/s when units are declared",
      fractionUnits: "vegetation and impervious layers can be supplied as fraction or percent"
    },
    rasterGapPolicy: {
      fillMethod: "limited nearest valid cell fill after resampling",
      maxDistanceCells: 8,
      reporting: "quality report preserves raw coverage, effective coverage, filled/unfilled counts, filled fraction, and maximum fill distance",
      confidence: "gap-filled cells are lower-confidence modeled support, not direct observed source coverage"
    },
    hydrographForcingRequirement: "Daily met CSV dates should overlap calibration discharge dates for KGE/NSE hydrograph diagnostics.",
    meteorologyBoundaryForcing: "Daily and gridded met time series now produce selected-year precipitation multipliers, temperature offsets, wind multipliers, dry-spell and storm statistics used by climate and hazard layers.",
    gridOutputHydraulicColumns: ["flow_velocity_ms", "channel_width_m", "channel_depth_m", "shear_stress_pa", "stream_power_w_m2", "sediment_transport_index", "erosion_risk", "deposition_risk"],
    gridOutputHazardColumns: ["flood_hazard", "flood_depth_m", "drought_stress", "wildfire_risk", "landslide_risk", "hazard_index", "cumulative_erosion_m", "projected_vegetation_fraction"],
    gridOutputDataConfidenceColumns: ["data_confidence", "observed_source_count", "data_source_mask", "customized_support"],
    spatialAlignmentAuditColumns: [
      "reference_key",
      "key",
      "source_name",
      "crs",
      "crs_interpretation",
      "source_bounds_km",
      "target_bounds_km",
      "center_offset_km",
      "edge_mismatch_km",
      "overlap_area_km2",
      "overlap_fraction_of_target",
      "cell_size_ratio_to_target",
      "alignment_score",
      "warnings"
    ],
    subsurfaceTransectCsvColumns: [
      "profile_id",
      "mode",
      "sample",
      "distance_km",
      "x_km",
      "y_km",
      "layer",
      "top_depth_m",
      "bottom_depth_m",
      "lithology",
      "material_class",
      "risk_class",
      "observed_support",
      "inference_reliability",
      "engineering_risk",
      "evidence_mask",
      "voxel_storage_m3"
    ],
    subsurfaceCubeLedgerCsvColumns: [
      "rank",
      "group_key",
      "layer",
      "top_depth_m",
      "bottom_depth_m",
      "thickness_m",
      "lithology",
      "material_class",
      "risk_class",
      "voxel_count",
      "gross_volume_m3",
      "solid_volume_m3",
      "pore_volume_m3",
      "water_volume_m3",
      "air_void_volume_m3",
      "solid_mass_tonnes",
      "groundwater_mass_tonnes",
      "high_risk_volume_m3",
      "aquifer_body_volume_m3",
      "mean_porosity",
      "mean_saturation",
      "mean_permeability_mm_hr",
      "mean_pore_pressure_kpa",
      "mean_vertical_stress_kpa",
      "mean_temperature_c",
      "mean_fracture_risk",
      "mean_observed_support",
      "mean_inference_reliability",
      "mean_engineering_risk",
      "dominant_process",
      "evidence_mask",
      "inference_basis"
    ],
    subsurfaceColumnReasoningCsvColumns: [
      "rank",
      "x_km",
      "y_km",
      "column_index",
      "water_table_depth_m",
      "bedrock_depth_m",
      "gross_volume_m3",
      "solid_volume_m3",
      "pore_volume_m3",
      "groundwater_volume_m3",
      "air_void_volume_m3",
      "aquifer_volume_m3",
      "high_risk_volume_m3",
      "foundation_suitability_index",
      "excavation_difficulty_index",
      "groundwater_interference_index",
      "collapse_subsidence_risk",
      "tunnel_support_demand_index",
      "dominant_material_class",
      "dominant_risk_class",
      "dominant_process",
      "recommended_action_zh",
      "inference_basis"
    ],
    hazardScenario: {
      simulationYears: 25,
      currentYear: "0..simulationYears controls the displayed current cumulative exposure and time-progressed vegetation state",
      disasterMode: ["none", "storm_flood", "drought", "wildfire", "earthquake_landslide", "compound"],
      disasterIntensity: "0..2 dimensionless multiplier; summary reports high-hazard areas and cumulative time effects"
    },
    timeProgressionSeries: {
      exportFile: "geolab-128-time-progression.csv",
      method: "annualized-cumulative-exposure-vegetation-erosion-water-budget",
      columns: [
        "year",
        "mean_composite_exposure",
        "high_composite_hazard_area_km2",
        "mean_cumulative_erosion_m",
        "cumulative_erosion_volume_m3",
        "mean_projected_vegetation_fraction",
        "generated_runoff_volume_m3",
        "outlet_runoff_volume_m3"
      ]
    },
    physicalTimeProgressionSeries: {
      exportFile: "geolab-128-physical-time-progression.json",
      csvExportFile: "geolab-128-physical-time-progression.csv",
      method: "annual-soil-water-vegetation-erosion-built-feedback-state-model",
      methodZh: "逐年土壤水库-蒸散-产流-设施滞留-植被-侵蚀反馈状态模型",
      stateVariables: [
        "soilWaterMm",
        "vegetationFraction",
        "leafAreaIndex",
        "cumulativeErosionM"
      ],
      fluxes: [
        "precipitation",
        "actualEvapotranspiration",
        "generatedRunoff",
        "retainedFlow",
        "recharge",
        "infrastructureDemand",
        "waterBalanceResidual"
      ],
      hazards: ["flood", "drought", "wildfire", "landslide"]
    },
    hazardEventScenario: {
      exportFile: "geolab-128-hazard-event-scenario.json",
      method: "event-scale-screening-from-hazard-susceptibility-hydraulics-surface-and-built-exposure",
      eventTypes: ["flood", "drought", "wildfire", "landslide"],
      outputs: [
        "affectedAreaKm2",
        "highSeverityAreaKm2",
        "builtExposureAreaKm2",
        "exposureByInfrastructureType",
        "hotspots"
      ]
    },
    watershedDelineation: {
      exportFile: "geolab-128-watershed-delineation.json",
      csvExportFile: "geolab-128-watershed-cells.csv",
      method: "reverse-d8-steepest-receiver-catchment-delineation",
      methodZh: "沿每个格网的D8最陡接收格反向追踪上游贡献区",
      outletSelectionPriority: ["用户指定格网", "校准水文站最近模型河道", "校准水文站所在格网", "最大汇流累积格网"],
      outputs: [
        "outlet",
        "summary",
        "waterBudget",
        "hazards",
        "infrastructure",
        "calibrationComparison",
        "sampledBoundaryCells",
        "cellRows"
      ]
    },
    researchDataAudit: {
      exportFile: "geolab-128-research-data-audit.json",
      csvExportFile: "geolab-128-research-data-audit.csv",
      method: "layer-by-layer-source-fidelity-readiness-and-resolution-audit",
      methodZh: "逐层审计真实数据覆盖率、源像元、重采样、缺口填补、校准证据和推荐模型分辨率",
      rows: [
        "DEM",
        "soil HSG",
        "Ksat",
        "AWC",
        "land cover",
        "vegetation",
        "meteorology",
        "flowlines",
        "calibration",
        "infrastructure"
      ],
      outputs: [
        "readinessClass",
        "sourceLimitedResolution",
        "recommendedUiResolution",
        "limitingLayer",
        "layerRows",
        "blockers",
        "nextActions"
      ]
    },
    researchValidationGates: {
      exportFile: "geolab-128-research-validation-gates.json",
      csvExportFile: "geolab-128-research-validation-gates.csv",
      method: "evidence-gated-research-readiness-validation",
      methodZh: "用真实数据就绪度、校准、河网、水量闭合、设施反馈、灾害时间状态和不确定性要求逐项门控科研可信度",
      requiredGateExamples: [
        "data_readiness_overall",
        "input_dem",
        "input_soilHydraulicConductivity",
        "input_precipitation",
        "input_flowlines",
        "input_calibration",
        "water_budget_closure",
        "infrastructure_feedback_atlas"
      ],
      outputs: [
        "overallClass",
        "isResearchDefensible",
        "scorePct",
        "blockers",
        "warnings",
        "nextActions",
        "gateRows"
      ]
    },
    infrastructureImpactAtlas: {
      exportFile: "geolab-128-infrastructure-impact-atlas.json",
      csvExportFile: "geolab-128-infrastructure-impact-atlas.csv",
      method: "type-grouped-built-environment-feedback-atlas",
      methodZh: "按人造设施类型汇总不透水面、热环境、径流、蓄滞、用水、建筑体量和灾害暴露反馈",
      rows: ["urban", "village", "highrise", "residential", "reservoir", "dam", "canal", "transport", "industrial", "park"],
      outputs: [
        "feedback_class",
        "area_km2",
        "impervious_area_km2",
        "storage_volume_m3",
        "demand_to_supply_ratio",
        "retained_flow_annual_m3",
        "mean_composite_hazard",
        "built_exposure_index",
        "next_action_zh"
      ]
    },
    blockDetailAtlas: {
      exportFile: "geolab-128-block-detail-atlas.json",
      csvExportFile: "geolab-128-block-detail-atlas.csv",
      method: "per-block-surface-subsurface-neighborhood-facility-coupling-atlas",
      methodZh: "\u6bcf\u4e2a\u5206\u6790\u533a\u5757\u8054\u5408\u5730\u8868\u3001\u6c34\u6587\u3001\u6c14\u5019\u3001\u5730\u4e0b\u67f1\u4f53\u3001\u90bb\u57df\u8054\u52a8\u548c\u8bbe\u65bd Top \u5019\u9009\u7684\u5b8c\u6574\u6863\u6848",
      rows: "one row per analysis block",
      outputs: [
        "block_id",
        "bounds_km",
        "subcell.cellCount",
        "surface.terrainFormClass",
        "hydrology.roleClass",
        "climate.stressClass",
        "subsurface.meanEngineeringRisk",
        "linkage.stateClass",
        "facilitySuitability.topCandidates",
        "recommendedActionZh"
      ]
    },
    infrastructureCellPlacementLedger: {
      exportFile: "geolab-128-infrastructure-cell-placement-ledger.json",
      csvExportFile: "geolab-128-infrastructure-cell-placement-ledger.csv",
      method: "cell-level-facility-candidate-selection-rejection-ledger",
      methodZh: "\u9010\u683c\u8bb0\u5f55\u8bbe\u65bd\u5019\u9009\u5355\u5143\u7684\u9009\u4e2d\u3001\u62d2\u7edd\u3001\u533a\u5757\u7ed3\u6784\u3001\u73af\u5883\u95e8\u69db\u548c\u90bb\u57df\u8054\u52a8\u72b6\u6001",
      rows: "candidate or selected infrastructure cell",
      outputs: [
        "placement_state",
        "facility_type",
        "suitability_score",
        "reject_reason",
        "block_structure_score",
        "block_linkage_score",
        "requirement_summary",
        "component_scores",
        "environmental_zone_class"
      ]
    },
    infrastructureSuitabilityMatrix: {
      exportFile: "geolab-128-infrastructure-suitability-matrix.json",
      csvExportFile: "geolab-128-infrastructure-suitability-matrix.csv",
      method: "per-block-facility-suitability-hard-gate-matrix",
      methodZh: "\u9010\u533a\u5757\u8bc4\u4f30\u8bbe\u65bd\u7c7b\u578b\u4e0e\u5730\u5f62\u3001\u6c34\u6587\u3001\u6c14\u5019\u3001\u707e\u5bb3\u3001\u5730\u57fa\u548c\u90bb\u57df\u538b\u529b\u7684\u9002\u914d\u5ea6\uff0c\u5e76\u7ed9\u51fa\u63a8\u8350\u6392\u5e8f\u4e0e\u7ea6\u675f\u539f\u56e0",
      rows: "infrastructure block x facility type",
      outputs: [
        "facility_type",
        "recommended_rank",
        "suitability_score",
        "suitability_class",
        "adaptation_need",
        "primary_constraint",
        "constraint_reasons",
        "matched_recommendations",
        "build_strategy",
        "next_action",
        "component_scores"
      ]
    },
    adaptiveInfrastructurePlacementPlan: {
      exportFile: "geolab-128-adaptive-infrastructure-placement-plan.json",
      csvExportFile: "geolab-128-adaptive-infrastructure-placement-plan.csv",
      method: "suitability-matrix-driven-block-facility-placement-plan",
      methodZh: "\u6839\u636e\u8bbe\u65bd-\u533a\u5757\u9002\u914d\u77e9\u9635\u81ea\u52a8\u9009\u53d6\u5408\u7406\u533a\u5757\uff0c\u6309\u670d\u52a1\u7c7b\u522b\u548c\u7a7a\u95f4\u5206\u6563\u7ea6\u675f\u8f93\u51fa\u53ef\u76f4\u63a5\u5e94\u7528\u7684 GeoJSON \u8bbe\u65bd\u5019\u9009",
      rows: "selected adaptive facility candidate",
      outputs: [
        "facility_type",
        "service_class",
        "geometry_type",
        "source_block_id",
        "suitability_score",
        "suitability_class",
        "primary_constraint",
        "requirement_summary",
        "block_environment_class"
      ]
    },
    builtEnvironmentResilienceAtlas: {
      exportFile: "geolab-128-built-resilience-atlas.json",
      csvExportFile: "geolab-128-built-resilience-atlas.csv",
      method: "type-grouped-built-damage-resilience-from-hazard-time-physics-and-subsurface-risk",
      methodZh: "按建筑/设施类型聚合洪水、火灾、滑坡、热旱和地下风险耦合的时间累积损伤与恢复压力",
      outputs: [
        "structural_vulnerability",
        "flood_damage_index",
        "wildfire_damage_index",
        "landslide_damage_index",
        "heat_drought_damage_index",
        "combined_damage_index",
        "current_damage_index",
        "expected_service_loss_years",
        "recovery_pressure",
        "dominant_hazard",
        "recovery_priority",
        "priority_action_zh"
      ]
    },
    builtEnvironmentRecoverySeries: {
      exportFile: "geolab-128-built-recovery-series.json",
      csvExportFile: "geolab-128-built-recovery-series.csv",
      method: "annual-built-damage-repair-service-loss-state-model",
      methodZh: "逐年建筑灾害损伤、修复、服务中断和恢复积压状态模型",
      outputs: [
        "annual_event_damage_index",
        "annual_repair_index",
        "mean_unrepaired_damage_index",
        "cumulative_event_damage_index",
        "cumulative_service_loss_years",
        "expected_annual_service_loss_years",
        "high_priority_built_area_km2",
        "recovery_backlog_index",
        "dominant_hazard"
      ]
    },
    localRefinementExport: {
      type: "geolab-local-refinement-tile",
      defaultWindowCells: 17,
      defaultRefinementFactor: 16,
      supportedWindowCells: [17, 33, 65],
      supportedRefinementFactors: [8, 16, 32, 64],
      method: "bilinear-model-field-downscaling-with-deterministic-subcell-microrelief",
      csvColumns: [
        "x_km",
        "y_km",
        "source_grid_x",
        "source_grid_y",
        "elevation_m",
        "local_slope_deg",
        "micro_relief_m",
        "vegetation_fraction",
        "flow_velocity_ms",
        "flood_hazard",
        "hazard_index"
      ]
    },
    geoJsonPolygonProperties: ["NLCD", "HYDGRP", "vegetation_fraction", "lai", "canopy_height_m", "ksat_mm_hr", "awc_mm", "root_depth_m"],
    surfacePatchGeoJsonGeometry: ["Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon"],
    manualSurfacePatchGeometry: ["Point", "LineString", "Polygon"],
    surfacePatchTypes: Object.keys(SURFACE_PATCH_UI_PRESETS),
    surfacePatchGeoJsonProperties: [
      "patch_type",
      "radius_km",
      "land_cover",
      "soil_group",
      "vegetation_fraction",
      "vegetation_delta",
      "lai",
      "canopy_height_m",
      "root_depth_m",
      "ksat_mm_hr",
      "awc_mm",
      "impervious_fraction",
      "impervious_delta",
      "precipitation_delta_mm",
      "precipitation_scale",
      "temperature_delta_c",
      "wind_speed_delta_ms",
      "wind_direction",
      "roughness_delta"
    ],
    flowlineGeoJsonGeometry: ["LineString", "MultiLineString"],
    flowlineGeoJsonProperties: ["COMID", "GNIS_NAME", "stream_order", "length_km"],
    infrastructureGeoJsonGeometry: ["Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon"],
    manualInfrastructureGeometry: ["Point", "LineString", "Polygon"],
    infrastructureTypes: Object.keys(INFRASTRUCTURE_UI_PRESETS),
    infrastructureGeoJsonProperties: [
      "infrastructure_type",
      "radius_km",
      "impervious_fraction",
      "runoff_delta",
      "roughness_delta",
      "temperature_delta_c",
      "storage_mm",
      "flow_retention",
      "irrigation_mm",
      "vegetation_delta",
      "water_demand_mm",
      "building_density",
      "building_height_m",
      "floor_count",
      "landmark_height_m"
    ],
    calibrationTimeSeriesCsvColumns: ["date", "discharge_cfs"],
    cloudflareProxyEndpoints: {
      plan: "/plan?lat=37.8651&lon=-119.5383&sizeKm=128&startYear=2020&endYear=2024&gageSite=11266500",
      streamProxy: "/proxy?url=<encoded authoritative source URL>",
      demProducts: "/tnm/dem-products?lat=37.8651&lon=-119.5383&sizeKm=128",
      daymetGridSample: "/daymet/grid-sample?lat=37.8651&lon=-119.5383&sizeKm=128&startYear=2020&endYear=2024&grid=3",
      osmInfrastructure: "/osm/infrastructure?lat=37.8651&lon=-119.5383&sizeKm=128&limit=900",
      usgsGageCandidates: "/usgs/gages?lat=37.8651&lon=-119.5383&sizeKm=128&start=2020-01-01&end=2024-12-31",
      normalizedUsgsCalibration: "/usgs/daily-values?site=11266500&start=2020-01-01&end=2024-12-31"
    },
    calibration: {
      precipBias: 0.04,
      tempBias: -0.3,
      runoffMultiplier: 1.08,
      dischargeScale: 0.96,
      drainageAreaKm2: 6600,
      contributingDrainageAreaKm2: 6400,
      siteCode: "11266500",
      siteName: "Example River near Test",
      siteLatitude: 37.84,
      siteLongitude: -119.55,
      observedDischargeM3s: 2.4,
      appliedCalibrationAdvisor: {
        mode: "dischargeScaleOnly",
        qualityClass: "usable-with-caution",
        comparisonSource: "nearest-modeled-channel",
        appliedRunoffMultiplier: 1.08,
        appliedDischargeScale: 0.96
      },
      observedSeries: {
        recordCount: 365,
        unit: "m3/s",
        meanDischargeM3s: 2.4,
        p10DischargeM3s: 0.8,
        p90DischargeM3s: 7.1,
        samples: [
          { date: "2020-01-01", dischargeM3s: 1.8 },
          { date: "2020-01-02", dischargeM3s: 2.6 }
        ]
      }
    },
    calibrationAdvisorOutputs: [
      "comparison.comparisonSource",
      "comparison.spatialComparability",
      "hydrograph.metrics.kge",
      "hydrograph.metrics.nse",
      "advisor.qualityClass",
      "advisor.overallScore",
      "advisor.componentScores",
      "advisor.parameterSuggestion.dischargeScaleOnly",
      "advisor.parameterSuggestion.splitRunoffAndRouting"
    ],
    dataReadinessOutputs: [
      "class",
      "scorePct",
      "groupScores",
      "items[].status",
      "items[].evidence.coverage",
      "items[].evidence.sourceCellSizeM",
      "blockers[].nextAction"
    ]
  };
  download("geolab-128-data-schema.json", "application/json", JSON.stringify(schema, null, 2));
}

function exportLocalRefinement() {
  if (!model) return;
  const pointer = lastPointerGrid || { gx: (model.n - 1) / 2, gy: (model.n - 1) / 2 };
  const refinementOptions = readLocalRefinementOptions();
  const tile = buildLocalRefinementTile(model, params, pointer.gx, pointer.gy, {
    windowCells: refinementOptions.windowCells,
    refinementFactor: refinementOptions.refinementFactor
  });
  lastLocalRefinementSummary = {
    type: tile.type,
    ...tile.summary,
    centerGrid: tile.centerGrid,
    centerKm: tile.centerKm,
    boundsKm: tile.boundsKm,
    sourceCellSizeM: tile.sourceCellSizeM,
    refinedCellSizeM: tile.refinedCellSizeM,
    sourceResolution: tile.sourceResolution,
    targetResolution: tile.targetResolution,
    windowCells: tile.windowCells,
    refinementFactor: tile.refinementFactor,
    precision: tile.precision,
    method: tile.method
  };
  download("geolab-128-local-refinement.csv", "text/csv;charset=utf-8", makeLocalRefinementCSV(tile));
  setStatus("局部精细化 CSV 已导出");
}

function exportSubsurfaceTransect() {
  if (!model) return;
  const options = readSubsurfaceTransectOptions();
  const transect = buildSubsurfaceTransect(model, params, options);
  lastSubsurfaceTransectSummary = {
    type: transect.type,
    profileId: transect.profileId,
    mode: transect.mode,
    sampleCount: transect.sampleCount,
    layerCount: transect.layerCount,
    rowCount: transect.rowCount,
    lengthKm: transect.lengthKm,
    ...transect.summary
  };
  download("geolab-128-subsurface-transect.csv", "text/csv;charset=utf-8", makeSubsurfaceTransectCSV(transect));
  setStatus("地下剖面 CSV 已导出");
}

function exportSubsurfaceCubeLedger() {
  if (!model) return;
  const ledger = buildSubsurfaceCubeLedger(model, params);
  download("geolab-128-subsurface-cube-ledger.csv", "text/csv;charset=utf-8", makeSubsurfaceCubeLedgerCSV(ledger));
  setStatus("地下立方账本 CSV 已导出");
}

function exportSubsurfaceColumnReasoning() {
  if (!model) return;
  const atlas = buildSubsurfaceColumnReasoningAtlas(model, params);
  download("geolab-128-subsurface-column-reasoning.csv", "text/csv;charset=utf-8", makeSubsurfaceColumnReasoningCSV(atlas));
  setStatus("地下柱体推理 CSV 已导出");
}

function currentSubsurfaceCubeLedgerForAudit() {
  if (!model?.subsurface) return null;
  try {
    return buildSubsurfaceCubeLedger(model, params);
  } catch (error) {
    console.warn("地下立方账本审计摘要不可用", error);
    return null;
  }
}

function currentSubsurfaceTransectForAudit() {
  if (!model?.subsurface) return null;
  try {
    return buildSubsurfaceTransect(model, params, readSubsurfaceTransectOptions());
  } catch (error) {
    console.warn("地下剖面审计摘要不可用", error);
    return null;
  }
}

function currentSpatialAlignmentAudit() {
  if (!model?.stats?.externalQuality?.length) return null;
  try {
    return buildSpatialAlignmentAudit(model, params, { referenceKey: "dem" });
  } catch (error) {
    console.warn("空间对齐审计不可用", error);
    return null;
  }
}

function exportWatershed() {
  if (!model) return;
  const watershed = buildWatershedDelineation(model, params, { boundaryLimit: 2500 });
  download("geolab-128-watershed-delineation.json", "application/json", JSON.stringify(watershed, null, 2));
  setStatus("流域圈定 JSON 已导出");
}

function exportWatershedCSV() {
  if (!model) return;
  const watershed = buildWatershedDelineation(model, params, { boundaryLimit: 512 });
  download("geolab-128-watershed-cells.csv", "text/csv;charset=utf-8", makeWatershedCSV(watershed));
  setStatus("流域格网 CSV 已导出");
}

function exportResearchAudit() {
  if (!model) return;
  const audit = buildResearchDataAudit(model, params, {
    pipelineWarnings: buildPipelineAudit().warnings,
    spatialAlignmentAudit: currentSpatialAlignmentAudit(),
    subsurfaceCubeLedger: currentSubsurfaceCubeLedgerForAudit(),
    subsurfaceTransect: currentSubsurfaceTransectForAudit()
  });
  download("geolab-128-research-data-audit.json", "application/json", JSON.stringify(audit, null, 2));
  setStatus("科研数据适配审计 JSON 已导出");
}

function exportResearchAuditCSV() {
  if (!model) return;
  const audit = buildResearchDataAudit(model, params, {
    pipelineWarnings: buildPipelineAudit().warnings,
    spatialAlignmentAudit: currentSpatialAlignmentAudit(),
    subsurfaceCubeLedger: currentSubsurfaceCubeLedgerForAudit(),
    subsurfaceTransect: currentSubsurfaceTransectForAudit()
  });
  download("geolab-128-research-data-audit.csv", "text/csv;charset=utf-8", makeResearchDataAuditCSV(audit));
  setStatus("科研数据适配审计 CSV 已导出");
}

function exportSpatialAlignment() {
  if (!model) return;
  const audit = buildSpatialAlignmentAudit(model, params, { referenceKey: "dem" });
  download("geolab-128-spatial-alignment.csv", "text/csv;charset=utf-8", makeSpatialAlignmentAuditCSV(audit));
  setStatus("空间对齐审计 CSV 已导出");
}

function exportTerrainProcessAudit() {
  if (!model) return;
  const audit = buildTerrainProcessAudit(model, params);
  download("geolab-128-terrain-process-audit.json", "application/json", JSON.stringify(audit, null, 2));
  setStatus("地貌过程审计 JSON 已导出");
}

function exportTerrainProcessAuditCSV() {
  if (!model) return;
  const audit = buildTerrainProcessAudit(model, params);
  download("geolab-128-terrain-process-audit.csv", "text/csv;charset=utf-8", makeTerrainProcessAuditCSV(audit));
  setStatus("地貌过程审计 CSV 已导出");
}

function exportResearchValidation() {
  if (!model) return;
  const report = buildResearchValidationGateReport(model, params, { pipelineWarnings: buildPipelineAudit().warnings });
  download("geolab-128-research-validation-gates.json", "application/json", JSON.stringify(report, null, 2));
  setStatus("科研验证门控 JSON 已导出");
}

function exportResearchValidationCSV() {
  if (!model) return;
  const report = buildResearchValidationGateReport(model, params, { pipelineWarnings: buildPipelineAudit().warnings });
  download("geolab-128-research-validation-gates.csv", "text/csv;charset=utf-8", makeResearchValidationGateCSV(report));
  setStatus("科研验证门控 CSV 已导出");
}

function exportInfrastructureAtlas() {
  if (!model) return;
  const atlas = buildInfrastructureImpactAtlas(model, params);
  download("geolab-128-infrastructure-impact-atlas.json", "application/json", JSON.stringify(atlas, null, 2));
  setStatus("人造设施影响图谱 JSON 已导出");
}

function exportInfrastructureAtlasCSV() {
  if (!model) return;
  const atlas = buildInfrastructureImpactAtlas(model, params);
  download("geolab-128-infrastructure-impact-atlas.csv", "text/csv;charset=utf-8", makeInfrastructureImpactAtlasCSV(atlas));
  setStatus("人造设施影响图谱 CSV 已导出");
}

function exportInfrastructureBlockState() {
  if (!model) return;
  const report = buildInfrastructureBlockStateReport(model, params);
  download("geolab-128-infrastructure-block-state.json", "application/json", JSON.stringify(report, null, 2));
  setStatus("设施区块联动状态 JSON 已导出");
}

function exportInfrastructureBlockStateCSV() {
  if (!model) return;
  const report = buildInfrastructureBlockStateReport(model, params);
  download("geolab-128-infrastructure-block-state.csv", "text/csv;charset=utf-8", makeInfrastructureBlockStateCSV(report));
  setStatus("设施区块联动状态 CSV 已导出");
}

function exportInfrastructureCellPlacement() {
  if (!model) return;
  const report = buildInfrastructureCellPlacementLedger(model, params);
  download("geolab-128-infrastructure-cell-placement-ledger.json", "application/json", JSON.stringify(report, null, 2));
  setStatus("\u8bbe\u65bd\u5019\u9009\u5355\u5143\u5e03\u7f6e\u8d26\u672c JSON \u5df2\u5bfc\u51fa");
}

function exportInfrastructureCellPlacementCSV() {
  if (!model) return;
  const report = buildInfrastructureCellPlacementLedger(model, params);
  download("geolab-128-infrastructure-cell-placement-ledger.csv", "text/csv;charset=utf-8", makeInfrastructureCellPlacementLedgerCSV(report));
  setStatus("\u8bbe\u65bd\u5019\u9009\u5355\u5143\u5e03\u7f6e\u8d26\u672c CSV \u5df2\u5bfc\u51fa");
}

function exportBlockDetailAtlas() {
  if (!model) return;
  const atlas = buildBlockDetailAtlas(model, params);
  download("geolab-128-block-detail-atlas.json", "application/json", JSON.stringify(atlas, null, 2));
  setStatus("\u533a\u5757\u7ec6\u8282\u4e0e\u8054\u52a8\u56fe\u8c31 JSON \u5df2\u5bfc\u51fa");
}

function exportBlockDetailAtlasCSV() {
  if (!model) return;
  const atlas = buildBlockDetailAtlas(model, params);
  download("geolab-128-block-detail-atlas.csv", "text/csv;charset=utf-8", makeBlockDetailAtlasCSV(atlas));
  setStatus("\u533a\u5757\u7ec6\u8282\u4e0e\u8054\u52a8\u56fe\u8c31 CSV \u5df2\u5bfc\u51fa");
}

function exportInfrastructureSuitabilityMatrix() {
  if (!model) return;
  const report = buildInfrastructureSuitabilityMatrix(model, params);
  download("geolab-128-infrastructure-suitability-matrix.json", "application/json", JSON.stringify(report, null, 2));
  setStatus("\u8bbe\u65bd\u533a\u5757\u9002\u914d\u77e9\u9635 JSON \u5df2\u5bfc\u51fa");
}

function exportInfrastructureSuitabilityMatrixCSV() {
  if (!model) return;
  const report = buildInfrastructureSuitabilityMatrix(model, params);
  download("geolab-128-infrastructure-suitability-matrix.csv", "text/csv;charset=utf-8", makeInfrastructureSuitabilityMatrixCSV(report));
  setStatus("\u8bbe\u65bd\u533a\u5757\u9002\u914d\u77e9\u9635 CSV \u5df2\u5bfc\u51fa");
}

function exportBuiltResilience() {
  if (!model) return;
  const atlas = buildBuiltEnvironmentResilienceAtlas(model, params);
  download("geolab-128-built-resilience-atlas.json", "application/json", JSON.stringify(atlas, null, 2));
  setStatus("建筑灾害韧性 JSON 已导出");
}

function exportBuiltResilienceCSV() {
  if (!model) return;
  const atlas = buildBuiltEnvironmentResilienceAtlas(model, params);
  download("geolab-128-built-resilience-atlas.csv", "text/csv;charset=utf-8", makeBuiltEnvironmentResilienceAtlasCSV(atlas));
  setStatus("建筑灾害韧性 CSV 已导出");
}

function exportBuiltRecovery() {
  if (!model) return;
  const series = buildBuiltEnvironmentRecoverySeries(model, params, { stepYears: 1 });
  download("geolab-128-built-recovery-series.json", "application/json", JSON.stringify(series, null, 2));
  setStatus("建筑恢复时间线 JSON 已导出");
}

function exportBuiltRecoveryCSV() {
  if (!model) return;
  const series = buildBuiltEnvironmentRecoverySeries(model, params, { stepYears: 1 });
  download("geolab-128-built-recovery-series.csv", "text/csv;charset=utf-8", makeBuiltEnvironmentRecoveryCSV(series));
  setStatus("建筑恢复时间线 CSV 已导出");
}

function exportTimeSeries() {
  if (!model) return;
  const series = buildTimeProgressionSeries(model, params, { stepYears: 1 });
  download("geolab-128-time-progression.csv", "text/csv;charset=utf-8", makeTimeProgressionCSV(series));
  setStatus("时间进程 CSV 已导出");
}

function exportPhysicalTimeSeries() {
  if (!model) return;
  const series = buildPhysicalTimeProgressionSeries(model, params, { stepYears: 1 });
  download("geolab-128-physical-time-progression.json", "application/json", JSON.stringify(series, null, 2));
  setStatus("物理时间进程 JSON 已导出");
}

function exportPhysicalTimeSeriesCSV() {
  if (!model) return;
  const series = buildPhysicalTimeProgressionSeries(model, params, { stepYears: 1 });
  download("geolab-128-physical-time-progression.csv", "text/csv;charset=utf-8", makePhysicalTimeProgressionCSV(series));
  setStatus("物理时间进程 CSV 已导出");
}

function exportHazardEvent() {
  if (!model) return;
  const scenario = buildHazardEventScenario(model, params, { hotspotLimit: 48 });
  download("geolab-128-hazard-event-scenario.json", "application/json", JSON.stringify(scenario, null, 2));
  setStatus("灾害事件情景 JSON 已导出");
}

function localRefinementReportSummary() {
  if (!model) return null;
  if (lastLocalRefinementSummary) return lastLocalRefinementSummary;
  const pointer = lastPointerGrid || { gx: (model.n - 1) / 2, gy: (model.n - 1) / 2 };
  const refinementOptions = readLocalRefinementOptions();
  const tile = buildLocalRefinementTile(model, params, pointer.gx, pointer.gy, {
    windowCells: refinementOptions.windowCells,
    refinementFactor: refinementOptions.refinementFactor,
    includeRows: false
  });
  return {
    type: tile.type,
    ...tile.summary,
    centerGrid: tile.centerGrid,
    centerKm: tile.centerKm,
    boundsKm: tile.boundsKm,
    sourceCellSizeM: tile.sourceCellSizeM,
    refinedCellSizeM: tile.refinedCellSizeM,
    sourceResolution: tile.sourceResolution,
    targetResolution: tile.targetResolution,
    windowCells: tile.windowCells,
    refinementFactor: tile.refinementFactor,
    precision: tile.precision,
    method: tile.method
  };
}

function watershedDelineationReportSummary() {
  if (!model) return null;
  const watershed = buildWatershedDelineation(model, params, {
    includeCells: false,
    boundaryLimit: 256
  });
  return {
    type: watershed.type,
    displayName: watershed.displayName,
    method: watershed.method,
    methodZh: watershed.methodZh,
    flowRouting: watershed.flowRouting,
    assumptions: watershed.assumptions,
    map: watershed.map,
    outletSelection: watershed.outletSelection,
    outlet: watershed.outlet,
    summary: watershed.summary,
    waterBudget: watershed.waterBudget,
    hazards: watershed.hazards,
    infrastructure: watershed.infrastructure,
    calibrationComparison: watershed.calibrationComparison,
    bboxKm: watershed.bboxKm,
    boundary: {
      type: watershed.boundary.type,
      pointCount: watershed.boundary.pointCount,
      sampledPointCount: watershed.boundary.sampledPointCount,
      points: watershed.boundary.points.slice(0, 32),
      noteZh: watershed.boundary.noteZh
    },
    csvColumns: watershed.csvColumns
  };
}

function researchDataAuditReportSummary() {
  if (!model) return null;
  const audit = buildResearchDataAudit(model, params, {
    pipelineWarnings: buildPipelineAudit().warnings,
    spatialAlignmentAudit: currentSpatialAlignmentAudit(),
    subsurfaceCubeLedger: currentSubsurfaceCubeLedgerForAudit(),
    subsurfaceTransect: currentSubsurfaceTransectForAudit()
  });
  return {
    type: audit.type,
    displayName: audit.displayName,
    method: audit.method,
    methodZh: audit.methodZh,
    map: audit.map,
    summary: audit.summary,
    groupScores: audit.groupScores,
    blockers: audit.blockers,
    nextActions: audit.nextActions.slice(0, 16),
    limitingRows: audit.layerRows
      .filter((row) => row.required && row.limitingFactor !== "ready")
      .slice(0, 12),
    csvColumns: audit.csvColumns,
    notes: audit.notes
  };
}

function terrainProcessAuditReportSummary() {
  if (!model) return null;
  const audit = buildTerrainProcessAudit(model, params);
  return {
    type: audit.type,
    displayName: audit.displayName,
    method: audit.method,
    methodZh: audit.methodZh,
    map: audit.map,
    preset: audit.preset,
    processSignature: audit.processSignature,
    summary: audit.summary,
    columns: audit.columns,
    strongestRows: audit.rows.slice(0, 8),
    weakRows: audit.rows
      .slice()
      .sort((a, b) => a.agreement_score - b.agreement_score || b.expected_weight - a.expected_weight)
      .slice(0, 8),
    notes: audit.notes
  };
}

function subsurfaceCubeLedgerReportSummary() {
  if (!model?.subsurface) return null;
  const ledger = buildSubsurfaceCubeLedger(model, params);
  return {
    type: ledger.type,
    method: ledger.method,
    methodZh: ledger.methodZh,
    cubeGeometry: ledger.cubeGeometry,
    summary: ledger.summary,
    topRiskGroups: ledger.rows.slice(0, 12),
    columns: [
      "rank",
      "layer",
      "lithology",
      "material_class",
      "risk_class",
      "gross_volume_m3",
      "solid_volume_m3",
      "pore_volume_m3",
      "water_volume_m3",
      "mean_engineering_risk",
      "dominant_process",
      "inference_basis"
    ]
  };
}

function subsurfaceColumnReasoningReportSummary() {
  if (!model?.subsurface) return null;
  const atlas = buildSubsurfaceColumnReasoningAtlas(model, params);
  return {
    type: atlas.type,
    displayName: atlas.displayName,
    method: atlas.method,
    methodZh: atlas.methodZh,
    cubeGeometry: atlas.cubeGeometry,
    summary: atlas.summary,
    columns: atlas.columns,
    topRiskColumns: atlas.rows.slice(0, 12).map((row) => ({
      rank: row.rank,
      xKm: row.xKm,
      yKm: row.yKm,
      grossVolumeM3: row.grossVolumeM3,
      solidVolumeM3: row.solidVolumeM3,
      groundwaterVolumeM3: row.groundwaterVolumeM3,
      foundationSuitabilityIndex: row.foundationSuitabilityIndex,
      excavationDifficultyIndex: row.excavationDifficultyIndex,
      groundwaterInterferenceIndex: row.groundwaterInterferenceIndex,
      collapseSubsidenceRisk: row.collapseSubsidenceRisk,
      dominantMaterialClass: row.dominantMaterialClass?.code || null,
      dominantRiskClass: row.dominantRiskClass?.code || null,
      dominantProcess: row.dominantProcess,
      recommendedActionZh: row.recommendedActionZh
    }))
  };
}

function researchValidationGateReportSummary() {
  if (!model) return null;
  const report = buildResearchValidationGateReport(model, params, { pipelineWarnings: buildPipelineAudit().warnings });
  return {
    type: report.type,
    displayName: report.displayName,
    method: report.method,
    methodZh: report.methodZh,
    map: report.map,
    summary: report.summary,
    columns: report.columns,
    blockingGates: report.gateRows.filter((row) => row.status === "block" && row.required).slice(0, 12),
    warningGates: report.gateRows.filter((row) => row.status === "warning").slice(0, 12),
    notes: report.notes
  };
}

function infrastructureImpactAtlasReportSummary() {
  if (!model) return null;
  const atlas = buildInfrastructureImpactAtlas(model, params);
  return {
    type: atlas.type,
    displayName: atlas.displayName,
    method: atlas.method,
    methodZh: atlas.methodZh,
    map: atlas.map,
    assumptions: atlas.assumptions,
    summary: atlas.summary,
    columns: atlas.columns,
    topRows: atlas.rows.slice(0, 12)
  };
}

function infrastructureSuitabilityMatrixReportSummary() {
  if (!model) return null;
  const matrix = buildInfrastructureSuitabilityMatrix(model, params, { previewLimit: 12 });
  return {
    type: matrix.type,
    displayName: matrix.displayName,
    method: matrix.method,
    methodZh: matrix.methodZh,
    map: matrix.map,
    assumptions: matrix.assumptions,
    facilityTypes: matrix.facilityTypes,
    summary: matrix.summary,
    columns: matrix.columns,
    rowsOmittedFromQualityReport: true,
    fullRowsExport: "exportInfrastructureSuitabilityMatrix / exportInfrastructureSuitabilityMatrixCSV",
    topRecommendations: matrix.summary?.topRecommendationPreview || []
  };
}

function blockDetailAtlasReportSummary() {
  if (!model) return null;
  const atlas = buildBlockDetailAtlas(model, params, { topFacilityCount: 5, includeNeighborIds: false });
  return {
    type: atlas.type,
    displayName: atlas.displayName,
    method: atlas.method,
    methodZh: atlas.methodZh,
    map: atlas.map,
    assumptions: atlas.assumptions,
    summary: atlas.summary,
    columns: atlas.columns,
    rowsOmittedFromQualityReport: true,
    fullRowsExport: "exportBlockDetailAtlas / exportBlockDetailAtlasCSV",
    highCouplingPreview: atlas.summary?.highCouplingPreview || [],
    previewRows: atlas.rows.slice(0, 8).map((row) => ({
      block_id: row.block_id,
      boundsKm: row.boundsKm,
      terrainFormClass: row.surface.terrainFormClass,
      hydrologyRoleClass: row.hydrology.roleClass,
      climateStressClass: row.climate.stressClass,
      subsurfaceRiskClass: row.subsurface.dominantRiskClass,
      linkageStateClass: row.linkage.stateClass,
      serviceCoverage: {
        coverageIndex: row.serviceCoverage?.coverageIndex,
        gapClasses: row.serviceCoverage?.gapClasses || [],
        overloadClass: row.serviceCoverage?.overloadClass || ""
      },
      topFacility: row.facilitySuitability.topCandidates[0]?.facilityType || "",
      recommendedActionZh: row.recommendedActionZh
    }))
  };
}

function infrastructureCellPlacementLedgerReportSummary() {
  if (!model) return null;
  const ledger = buildInfrastructureCellPlacementLedger(model, params, { maxRows: 2000 });
  return {
    type: ledger.type,
    displayName: ledger.displayName,
    method: ledger.method,
    methodZh: ledger.methodZh,
    map: ledger.map,
    assumptions: ledger.assumptions,
    summary: ledger.summary,
    columns: ledger.columns,
    rowsOmittedFromQualityReport: true,
    fullRowsExport: "exportInfrastructureCellPlacement / exportInfrastructureCellPlacementCSV",
    selectedPreview: ledger.rows.filter((row) => row.placement_state === "selected").slice(0, 10),
    rejectedPreview: ledger.rows.filter((row) => row.placement_state === "rejected").slice(0, 10)
  };
}

function adaptiveInfrastructurePlacementPlanReportSummary() {
  const plan = currentAdaptiveInfrastructurePlan();
  if (!plan) return null;
  return {
    type: plan.type,
    displayName: plan.displayName,
    method: plan.method,
    methodZh: plan.methodZh,
    map: plan.map,
    selectionRules: plan.selectionRules,
    summary: plan.summary,
    ecosystemNetwork: plan.ecosystemNetwork
      ? {
          mode: plan.ecosystemNetwork.mode,
          ecosystemMode: plan.ecosystemNetwork.ecosystemMode,
          nodeCount: plan.ecosystemNetwork.nodeCount,
          edgeCount: plan.ecosystemNetwork.edgeCount,
          roleCoverage: plan.ecosystemNetwork.roleCoverage,
          edgeTypeCounts: plan.ecosystemNetwork.edgeTypeCounts,
          meanEdgeDistanceKm: plan.ecosystemNetwork.meanEdgeDistanceKm,
          meanNodeAnchorConfidence: plan.ecosystemNetwork.meanNodeAnchorConfidence,
          connectivityIndex: plan.ecosystemNetwork.connectivityIndex,
          summary: plan.ecosystemNetwork.summary,
          previewNodes: plan.ecosystemNetwork.nodes.slice(0, 12),
          previewEdges: plan.ecosystemNetwork.edges.slice(0, 16)
        }
      : null,
    columns: plan.columns,
    rowsOmittedFromQualityReport: true,
    featureCollectionOmittedFromQualityReport: true,
    fullRowsExport: "exportAdaptiveInfrastructurePlan / exportAdaptiveInfrastructurePlanCSV",
    previewRows: plan.planRows.slice(0, 12)
  };
}

function builtEnvironmentResilienceReportSummary() {
  if (!model) return null;
  const atlas = buildBuiltEnvironmentResilienceAtlas(model, params);
  return {
    type: atlas.type,
    displayName: atlas.displayName,
    method: atlas.method,
    methodZh: atlas.methodZh,
    map: atlas.map,
    assumptions: atlas.assumptions,
    summary: atlas.summary,
    columns: atlas.columns,
    topRows: atlas.rows.slice(0, 12)
  };
}

function builtEnvironmentRecoveryReportSummary() {
  if (!model) return null;
  const series = buildBuiltEnvironmentRecoverySeries(model, params, {
    stepYears: Math.max(1, Math.ceil((params.simulationYears || 0) / 24))
  });
  return {
    type: series.type,
    method: series.method,
    methodZh: series.methodZh,
    targetYears: series.targetYears,
    stepYears: series.stepYears,
    builtCellCount: series.builtCellCount,
    rowCount: series.rowCount,
    columns: series.columns,
    assumptions: series.assumptions,
    firstYear: series.firstYear,
    currentYear: series.currentYear,
    finalYear: series.finalYear
  };
}

function timeProgressionReportSummary() {
  if (!model) return null;
  const series = buildTimeProgressionSeries(model, params, { stepYears: Math.max(1, Math.ceil((params.simulationYears || 0) / 24)) });
  return {
    type: series.type,
    method: series.method,
    targetYears: series.targetYears,
    stepYears: series.stepYears,
    rowCount: series.rowCount,
    columns: series.columns,
    assumptions: series.assumptions,
    firstYear: series.firstYear,
    currentYear: series.currentYear,
    finalYear: series.finalYear
  };
}

function physicalTimeProgressionReportSummary() {
  if (!model) return null;
  const series = buildPhysicalTimeProgressionSeries(model, params, {
    stepYears: Math.max(1, Math.ceil((params.simulationYears || 0) / 24))
  });
  return {
    type: series.type,
    method: series.method,
    methodZh: series.methodZh,
    targetYears: series.targetYears,
    stepYears: series.stepYears,
    rowCount: series.rowCount,
    landCellCount: series.landCellCount,
    columns: series.columns,
    assumptions: series.assumptions,
    seasonalState: series.seasonalState || null,
    firstYear: series.firstYear,
    currentYear: series.currentYear,
    finalYear: series.finalYear
  };
}

function hazardEventReportSummary() {
  if (!model) return null;
  const scenario = buildHazardEventScenario(model, params, { hotspotLimit: 12 });
  return {
    type: scenario.type,
    method: scenario.method,
    mode: scenario.mode,
    intensity: scenario.intensity,
    returnPeriodYears: scenario.returnPeriodYears,
    eventTypes: scenario.eventTypes,
    assumptions: scenario.assumptions,
    combined: scenario.combined,
    events: scenario.events.map((event) => ({
      eventType: event.eventType,
      metricName: event.metricName,
      affectedAreaKm2: event.affectedAreaKm2,
      highSeverityAreaKm2: event.highSeverityAreaKm2,
      extremeSeverityAreaKm2: event.extremeSeverityAreaKm2,
      builtExposureAreaKm2: event.builtExposureAreaKm2,
      meanSeverity: event.meanSeverity,
      maxSeverity: event.maxSeverity,
      meanPrimaryMetric: event.meanPrimaryMetric,
      maxPrimaryMetric: event.maxPrimaryMetric,
      exposureByInfrastructureType: event.exposureByInfrastructureType,
      hotspots: event.hotspots.slice(0, 6)
    }))
  };
}

function exportQualityReport() {
  const report = {
    targetBounds: model?.targetBounds || null,
    targetResolution: model ? `${model.n}x${model.n}` : null,
    externalSources: externalLayers?.sources || [],
    meteorologySummaries: externalLayers?.metSummary || [],
    meteorologyBoundary: model?.stats?.meteorologyBoundary || null,
    demProductCandidates,
    gageCandidates,
    acquisitionPlan: acquisitionPlan
      ? {
          aoi: acquisitionPlan.aoi,
          proxy: acquisitionPlan.proxy,
          dataRequirements: acquisitionPlan.dataRequirements || null,
          sourceCount: acquisitionPlan.sources.length,
          generatedAt: acquisitionPlan.generatedAt
        }
      : null,
    sourceManifest: sourceManifest
      ? {
          summary: sourceManifest.summary,
          generatedAt: sourceManifest.generatedAt
        }
      : null,
    quality: model?.stats?.externalQuality || [],
    spatialAlignment: currentSpatialAlignmentAudit(),
    dataReadiness: model?.stats?.dataReadiness || null,
    subsurfaceCubeLedger: subsurfaceCubeLedgerReportSummary(),
    subsurfaceColumnReasoning: subsurfaceColumnReasoningReportSummary(),
    subsurfaceTransect: lastSubsurfaceTransectSummary,
    researchDataAudit: researchDataAuditReportSummary(),
    terrainProcessAudit: terrainProcessAuditReportSummary(),
    researchValidationGates: researchValidationGateReportSummary(),
    calibration: model?.stats?.calibration || null,
    osmInfrastructure,
    hydrologyConstraints: model?.stats?.externalFlowlines || null,
    surfacePatchImpacts: model?.stats?.externalSurfacePatches || null,
    infrastructureImpacts: model?.stats?.externalInfrastructure || null,
    waterBudget: model?.stats?.waterBudget || null,
    infrastructureBudget: model?.stats?.infrastructureBudget || null,
    infrastructureImpactAtlas: infrastructureImpactAtlasReportSummary(),
    infrastructureSuitabilityMatrix: infrastructureSuitabilityMatrixReportSummary(),
    blockDetailAtlas: blockDetailAtlasReportSummary(),
    infrastructureCellPlacementLedger: infrastructureCellPlacementLedgerReportSummary(),
    adaptiveInfrastructurePlacementPlan: adaptiveInfrastructurePlacementPlanReportSummary(),
    builtEnvironmentResilience: builtEnvironmentResilienceReportSummary(),
    builtEnvironmentRecovery: builtEnvironmentRecoveryReportSummary(),
    hazards: model?.stats?.hazards || null,
    hazardEvents: hazardEventReportSummary(),
    timeProgression: model?.stats?.timeProgression || null,
    timeProgressionSeries: timeProgressionReportSummary(),
    physicalTimeProgression: physicalTimeProgressionReportSummary(),
    watershedDelineation: watershedDelineationReportSummary(),
    localRefinement: localRefinementReportSummary(),
    manualSurfacePatches: manualSurfaceCollection(),
    manualInfrastructure: manualInfrastructureCollection(),
    scenarioSynthesis: currentScenarioSynthesis(),
    ecologicalIntegrity: model?.wildlife?.ecologicalIntegrity ? buildEcologicalIntegrityReport(model, params) : null,
    physicalCoupling: model?.physicalCoupling ? buildPhysicalCouplingReport(model, params) : null,
    derivedLayers: model?.stats
      ? {
          meanWindSpeed: model.stats.meanWindSpeed,
          meanCurvature: model.stats.meanCurvature,
          meanAbsCurvature: model.stats.meanAbsCurvature,
          meanTpi: model.stats.meanTpi,
          meanRoughness: model.stats.meanRoughness,
          maxRoughness: model.stats.maxRoughness,
          meanLeafAreaIndex: model.stats.meanLeafAreaIndex,
          meanCanopyHeight: model.stats.meanCanopyHeight,
          meanHydraulicConductivityMmHr: model.stats.meanHydraulicConductivityMmHr,
          meanAvailableWaterCapacityMm: model.stats.meanAvailableWaterCapacityMm,
          meanRootDepthM: model.stats.meanRootDepthM,
          meanImperviousFraction: model.stats.meanImperviousFraction,
          meanInfiltrationCapacity: model.stats.meanInfiltrationCapacity,
          meanActualEvapotranspiration: model.stats.meanActualEvapotranspiration,
          meanWaterBalance: model.stats.meanWaterBalance,
          waterBudget: model.stats.waterBudget,
          infrastructureBudget: model.stats.infrastructureBudget,
          hazards: model.stats.hazards,
          timeProgression: model.stats.timeProgression,
          flowRouting: model.stats.flowRouting,
          meanFlowDivergence: model.stats.meanFlowDivergence,
          hydraulicDiagnostics: model.stats.hydraulicDiagnostics,
          externalFlowlines: model.stats.externalFlowlines,
          externalSurfacePatches: model.stats.externalSurfacePatches,
          externalInfrastructure: model.stats.externalInfrastructure,
          landscapeNetwork: model.stats.landscapeNetwork,
          wildlife: model.stats.wildlife,
          physicalCoupling: model.stats.physicalCoupling
        }
      : null,
    pipeline: buildPipelineAudit(),
    generatedAt: new Date().toISOString()
  };
  download("geolab-128-quality-report.json", "application/json", JSON.stringify(report, null, 2));
}

async function exportUncertaintyReport() {
  if (!model) return;
  setStatus("不确定性集合演算中");
  await nextFrame();
  const baseParams = readParams();
  const ensemble = runUncertaintyEnsemble(baseParams, { maxResolution: 256 });
  const report = {
    targetBounds: model?.targetBounds || null,
    currentModel: {
      resolution: model.n,
      cellSizeM: model.cellSizeKm * 1000,
      runtimeMs: model.runtimeMs,
      stats: model.stats
    },
    ensemble,
    hazards: model?.stats?.hazards || null,
    timeProgression: model?.stats?.timeProgression || null,
    externalSources: externalLayers?.sources || [],
    manualSurfacePatches: manualSurfaceCollection(),
    manualInfrastructure: manualInfrastructureCollection(),
    pipeline: buildPipelineAudit(),
    generatedAt: new Date().toISOString()
  };
  download("geolab-128-uncertainty-report.json", "application/json", JSON.stringify(report, null, 2));
  setStatus("不确定性报告已导出");
}

function buildPipelineAudit() {
  const quality = model?.stats?.externalQuality || [];
  const dataReadiness = model?.stats?.dataReadiness || null;
  const warnings = [];
  if (Number.isFinite(model?.stats?.dataConfidence?.meanObservedSupport) && model.stats.dataConfidence.meanObservedSupport < 0.45) {
    warnings.push(`数据可信空间支撑均值只有 ${format(model.stats.dataConfidence.meanObservedSupport, 2)}；当前多数格点仍由模型推断。`);
  }
  if (dataReadiness) {
    warnings.push(`数据就绪度为 ${localizedQualityClass(dataReadiness.class)}（${format(dataReadiness.scorePct, 1)}%）。`);
    for (const blocker of dataReadiness.blockers || []) {
      warnings.push(`数据就绪度阻塞项 - ${blocker.label}: ${blocker.nextAction}`);
    }
  }
  const spatialAlignment = currentSpatialAlignmentAudit();
  if (spatialAlignment?.summary?.minAlignmentScore < 0.85) {
    warnings.push(`空间对齐最低评分为 ${format(spatialAlignment.summary.minAlignmentScore, 2)}；最大中心偏移 ${format(spatialAlignment.summary.maxCenterOffsetKm, 2)} km。`);
  }
  if (spatialAlignment?.summary?.stackIntersectionFractionOfTarget < 0.9) {
    warnings.push(`多源栅格共同覆盖仅 ${format(spatialAlignment.summary.stackIntersectionFractionOfTarget * 100, 1)}%，需要统一裁剪或重投影后再做科研结论。`);
  }
  if (!externalLayers?.soilHydraulicConductivity) warnings.push("缺少 Ksat 图层：饱和导水率由 HSG 和地形推断。");
  if (!externalLayers?.availableWaterCapacity) warnings.push("缺少 AWC 图层：根区蓄水和蒸散胁迫由模型推断。");
  if (!externalLayers?.rootDepth) warnings.push("缺少根深图层：根系固土和蓄水深度使用土地覆盖推断。");
  if (!externalLayers?.imperviousFraction) warnings.push("缺少不透水面图层：硬化地表由土地覆盖类别推断。");
  if (!externalLayers?.dem) warnings.push("未导入真实 DEM，当前地形仍依赖程序生成。");
  if (!externalLayers?.soilGroup) warnings.push("未导入土壤 HSG，径流入渗使用推断土壤。");
  if (!externalLayers?.landCover) warnings.push("未导入土地覆盖，植被与径流曲线数使用气候/坡度推断。");
  if (!externalLayers?.surfacePatches) warnings.push("未启用地表/气候情景斑块；植被、土壤和局地气象自定义只来自导入栅格与全局滑块。");
  if (!externalLayers?.precipitation && !externalLayers?.temperature) warnings.push("未导入气象边界场，降水/温度由参数化地形气候模型估算。");
  if (!externalLayers?.flowlines) warnings.push("未导入真实河网 flowline，河流骨架完全依赖 DEM 汇流阈值。");
  if (!externalLayers?.infrastructure) warnings.push("未导入城镇/乡村/水利设施，人造下垫面与调蓄反馈未参与模型。");
  if (!externalLayers?.calibration) warnings.push("未导入校准数据，偏差诊断不可用。");
  if (externalLayers?.calibration?.observedSeries?.recordCount && externalLayers.calibration.observedSeries.recordCount < 30) {
    warnings.push(`校准流量序列只有 ${externalLayers.calibration.observedSeries.recordCount} 条记录，统计代表性较弱。`);
  }
  const drainageArea = model?.stats?.calibration?.drainageArea;
  if (externalLayers?.calibration && drainageArea?.comparability === "missing-gage-area") {
    warnings.push("校准站缺少流域面积；流量偏差无法与模型出口汇水区做面积筛查。");
  }
  if (drainageArea?.comparability === "poor-match") {
    warnings.push(`校准站流域面积与模型出口汇水区相差 ${format(drainageArea.areaBiasPct, 1)}%；在信任偏差校准前应使用更接近的水文站或裁剪流域。`);
  }
  const gageLocation = model?.stats?.calibration?.gageLocation;
  if (externalLayers?.calibration && gageLocation?.status === "missing-site-location") {
    warnings.push("校准站缺少经纬度；无法执行站点到河道的空间校验。");
  }
  if (gageLocation?.status === "missing-aoi-context") {
    warnings.push("AOI WGS84 边界缺失；校准站无法投影到模型网格。");
  }
  if (gageLocation?.status === "outside-aoi") {
    warnings.push("校准站位于当前 AOI 外；该流量偏差不应直接用于这个 128 km 模型。");
  }
  if (gageLocation?.status === "no-modeled-river") {
    warnings.push("没有模型河段超过成河阈值，校准站无法匹配到河道。");
  }
  if (gageLocation?.status === "far-from-modeled-channel") {
    warnings.push(`校准站距最近模型河道 ${format(gageLocation.nearestRiverDistanceKm, 2)} km；请检查 DEM 对齐和成河阈值。`);
  }
  if (Number.isFinite(gageLocation?.nearestRiverAreaBiasPct) && Math.abs(gageLocation.nearestRiverAreaBiasPct) > 35) {
    warnings.push(`最近模型河道汇水区与校准参考面积相差 ${format(gageLocation.nearestRiverAreaBiasPct, 1)}%。`);
  }
  const calibrationAdvisor = model?.stats?.calibration?.advisor;
  if (calibrationAdvisor?.qualityClass && ["invalid-comparison", "diagnostic-only", "screening-only"].includes(calibrationAdvisor.qualityClass)) {
    warnings.push(`校准顾问等级为 ${localizedQualityClass(calibrationAdvisor.qualityClass)}；不要把本次运行视为最终参数校准。`);
  }
  for (const warning of calibrationAdvisor?.warnings || []) warnings.push(`校准顾问: ${warning}`);
  const hydrograph = model?.stats?.calibration?.hydrograph;
  if (hydrograph?.status && hydrograph.status !== "ready") {
    warnings.push(`日尺度水文过程诊断为 ${localizedQualityClass(hydrograph.status)}；导入日期重叠的气象和流量序列后才能计算 KGE/NSE。`);
  }
  if (Number.isFinite(hydrograph?.metrics?.kge) && hydrograph.metrics.kge < 0.3) {
    warnings.push(`日尺度水文过程 KGE 为 ${format(hydrograph.metrics.kge, 2)}；请复核强迫时间、土壤蓄水和退水/汇流假设。`);
  }
  const waterBudget = model?.stats?.waterBudget;
  if (waterBudget?.closureClass === "physically-suspect") {
    warnings.push(`水量平衡余项占年输入水量 ${format(waterBudget.residualPctOfInput, 1)}%；请检查降水、蒸散、径流、取水、滞留和出口选择。`);
  }
  if (Number.isFinite(waterBudget?.outletRunoffCoefficientByVolume) && waterBudget.outletRunoffCoefficientByVolume > 0.95) {
    warnings.push(`出口径流体积为年输入水量的 ${format(waterBudget.outletRunoffCoefficientByVolume, 2)}；当前土壤、土地覆盖和人造设施情景可能产流过高。`);
  }
  const geographicConsistency = model?.landscapeNetwork?.geographicConsistency;
  if (Number.isFinite(geographicConsistency?.mapAreaClosurePct) && Math.abs(geographicConsistency.mapAreaClosurePct - 100) > 0.01) {
    warnings.push(`生态区块面积闭合为 ${format(geographicConsistency.mapAreaClosurePct, 2)}%；请检查地图范围与栅格支撑面积。`);
  }
  if (Number.isFinite(geographicConsistency?.meanClimateVegetationConsistency) && geographicConsistency.meanClimateVegetationConsistency < 0.55) {
    warnings.push(`气候—植被一致性只有 ${format(geographicConsistency.meanClimateVegetationConsistency, 2)}；请检查 P/PET、植被覆盖和生物量输入。`);
  }
  const ecologicalIntegrity = model?.wildlife?.ecologicalIntegrity;
  if (Number.isFinite(ecologicalIntegrity?.summary?.integrityIndex) && ecologicalIntegrity.summary.integrityIndex < 0.4) {
    warnings.push(`生态完整性筛查为 ${format(ecologicalIntegrity.summary.integrityIndex, 2)}；应检查各分项，不可将综合值视为现场生态评价。`);
  }
  if ((ecologicalIntegrity?.translocation?.blockedReleaseCount || 0) > 0) {
    warnings.push(`${ecologicalIntegrity.translocation.blockedReleaseCount} 个生物投放批次因区域不匹配、缺少可用生境或生态层关闭而被拦截。`);
  }
  const physicalCoupling = model?.physicalCoupling;
  if ((physicalCoupling?.summary?.failedGateCount || 0) > 0) {
    warnings.push(`${physicalCoupling.summary.failedGateCount} 个物理约束门控失败；请先处理失败项，再解释跨系统结果。`);
  }
  if ((physicalCoupling?.summary?.reviewGateCount || 0) > 0) {
    warnings.push(`${physicalCoupling.summary.reviewGateCount} 个物理约束门控需要复核；限制链路为 ${localizedCouplingLabel(physicalCoupling.summary.limitingCouplingId, "zh")}。`);
  }
  if (Number.isFinite(physicalCoupling?.summary?.couplingIntegrityIndex) && physicalCoupling.summary.couplingIntegrityIndex < 0.6) {
    warnings.push(`跨系统联动完整性只有 ${format(physicalCoupling.summary.couplingIntegrityIndex, 2)}；当前情景存在明显断链。`);
  }
  const hydraulics = model?.stats?.hydraulicDiagnostics;
  if (Number.isFinite(hydraulics?.maxFlowVelocityMs) && hydraulics.maxFlowVelocityMs > 5.5) {
    warnings.push(`最大模型流速为 ${format(hydraulics.maxFlowVelocityMs, 2)} m/s；请检查河道坡降、流量尺度、DEM 伪影和水力粗糙度。`);
  }
  if (Number.isFinite(hydraulics?.highErosionFractionOfLand) && hydraulics.highErosionFractionOfLand > 0.08) {
    warnings.push(`高侵蚀风险区覆盖 ${format(hydraulics.highErosionFractionOfLand * 100, 1)}% 陆地单元；请复核植被、土体强度、成河阈值和人造设施径流假设。`);
  }
  const infrastructureBudget = model?.stats?.infrastructureBudget;
  if (Number.isFinite(infrastructureBudget?.demandToSupplyRatio) && infrastructureBudget.demandToSupplyRatio > 3) {
    warnings.push(`人造设施用水需求为模型设施供水的 ${format(infrastructureBudget.demandToSupplyRatio, 1)} 倍；在把情景视为闭合前应增加外部输入或降低需求。`);
  }
  if (!acquisitionPlan) warnings.push("未生成真实样区采集计划，数据源可追溯性不完整。");
  if (!sourceManifest) warnings.push("未在线检查真实数据源，产品候选和源状态尚未验证。");
  for (const item of quality) {
    if (item.coverage < 0.95 && !["flowlines", "infrastructure"].includes(item.key)) {
      warnings.push(`${item.key} 覆盖率 ${format(item.coverage * 100, 1)}%，目标范围内存在 NoData 或范围外区域。`);
    }
    if (item.resampling?.interpretation === "upsampled-coarse" || item.resampling?.interpretation === "upsampled-very-coarse") {
      warnings.push(`${item.key} 源像元约 ${format(item.sourceCellSizeM?.mean || 0, 1)} m，比模型网格粗 ${format(item.resampling.sourceToTargetRatio, 1)} 倍，细节正在被上采样。`);
    }
    if (item.resampling?.interpretation === "downsampled-fine") {
      warnings.push(`${item.key} 原生像元比模型网格细 ${format(item.resampling.targetToSourceRatio, 1)} 倍；提高 DEM 网格可保留更多真实细节。`);
    }
    for (const warning of item.warnings || []) warnings.push(`${item.key}: ${warning}`);
  }
  return {
    execution: modelWorker ? "web-worker" : "main-thread",
    flowRouting: model?.stats?.flowRouting || params.flowRouting || "d8",
    dataReadiness,
    acquisitionPlan: acquisitionPlan
      ? {
          aoi: acquisitionPlan.aoi,
          dataRequirements: acquisitionPlan.dataRequirements || null,
          sources: acquisitionPlan.sources.map((source) => ({
            id: source.id,
            role: source.role,
            priority: source.priority,
            url: source.url,
            proxyUrl: source.proxyUrl || null,
            normalizedProxyUrl: source.normalizedProxyUrl || null
          }))
        }
      : null,
    sourceManifest: sourceManifest
      ? {
          summary: sourceManifest.summary,
          sources: sourceManifest.sources.map((source) => ({
            id: source.id,
            status: source.status,
            productCount: source.productCount || 0,
            message: source.message
          }))
        }
      : null,
    steps: [
      "读取外部 DEM / 土壤 / 土地覆盖 / 植被 / 气象 / 校准文件",
      "对无坐标的气象时间序列和流量时间序列执行年度聚合与单位换算",
      "按 DEM 或模型目标范围执行范围感知重采样",
      "将真实河网 flowline 投影到 128 km 本地网格并作为河道约束",
      "应用用户绘制的地表/气候情景，调整土地覆盖、植被、土壤水参数、局地降水、温度和风场",
      "将城镇、乡村、道路、水库、大坝、渠道等人造设施栅格化为下垫面反馈场",
      "生成或融合 DEM，并计算坡度、坡向、地形湿润指数",
      "按地形暴露、冠层粗糙度和外部气象边界场推导逐栅格局地风场",
      "按 FAO-56 Penman-Monteith 结构估算参考蒸散，并显式记录辐射、湿度、风速和高程约束",
      "以 NRCS 曲线数事件响应约束产流倾向，再将年可分配水量拆分为径流、地下补给和土壤储量",
      "Priority-Flood 洼地处理、D8/MFD/D∞ 流向与分流、汇流面积与河网提取",
      "估算河道/坡面流速、剪切应力、水流功率、输沙能力、侵蚀风险和淤积风险",
      "运行洪水、干旱、野火、滑坡/地震触发、累积侵蚀和植被投影的时间与自然灾害情景层",
      "按地形、水文、植被、气候、灾害和人造扰动聚合八邻域生态区块，并计算跨区通量、阻力与廊道等级",
      "以地图面积除以栅格点数定义体积与面积统计的支撑面积，同时保留点间距用于坡度、流向和空间距离",
      "按限制因子生态位、物种有效栖息面积、功能连通性、干扰死亡、猎物生物量支持和迁徙阻力演算种群分布",
      "计算 P/PET 干湿度分区、气候—植被一致性、核心生境代理、Shannon/Hill 多样性与透明生态完整性筛查",
      "运行水量闭合、蒸散上限、能量项、降坡汇流、贡献面积、地形降水、面积和种群容量物理门控",
      "应用校准偏差、径流倍率和观测流量偏差诊断",
      "运行可导出的参数扰动集合，量化降水、温度、土壤、水文阈值、植被和人造设施反馈敏感性",
      "综合地形、气候、水文、生态、地下、设施、灾害与证据八个系统，分离计算系统覆盖和证据覆盖，并生成联动链路与验证优先事项",
      "输出 GeoJSON、CSV、参数、质量报告，以及 Unity Terrain / Unreal Landscape 场景交换包"
    ],
    algorithms: {
      hydrology: "Priority-Flood + 可选 D8/MFD/D∞ 汇流；D8 最陡降河道骨架、MFD 与 D∞ 分流贡献面积成河提取，以及可选外部 flowline 提升/叠加",
      sediment: "Manning 风格河道与坡面流诊断，用流速、水深/水宽、边界剪切、单位水流功率、输沙能力和植被根系调节的侵蚀/淤积风险进行筛查",
      vectorImport: "GeoJSON Polygon/MultiPolygon 结合 bbox/CRS 元数据栅格化；LineString/MultiLineString 河网投影到本地网格并标记来源河段",
      surfacePatches: "自定义点/线/面地表情景叠加土地覆盖、HSG、植被、LAI、冠层、根深、Ksat、AWC、不透水率、粗糙度、降水、温度和风场，不替换已导入栅格",
      runoff: "NRCS 曲线数事件响应约束 + 土壤 HSG/Ksat/AWC/根深入渗 + 不透水率 + 坡度 + 前期湿润度；曲线数不被误作连续入渗方程",
      infrastructure: "自定义 GeoJSON 城镇、乡村、交通、大坝、水库、渠道、堤防改变不透水率、粗糙度、径流、滞留、灌溉水、用水需求、植被和局地热岛温度",
      waterBudget: "按 P + 灌溉 = 取水 + 实际蒸散 + 产流 + 地下补给 + 土壤储量 + 未闭合余项执行逐格与全域年体积审计；设施滞留仅扣减本地产流",
      climate: "FAO-56 Penman-Monteith 参考蒸散结构 + 地形辐射修正 + 地形抬升/雨影近似，并可由标量、栅格或栅格时间序列气象边界场覆盖",
      calibration: "观测流量标量或时间序列聚合，包含 cfs 到 m3/s 换算、年均值、流量历时分位数、站点元数据、流域面积可比性和站点到河道空间匹配",
      hazards: "情景灾害层把径流、湿润度、汇流、入渗、蓄水/滞留、温度、水量平衡、风、坡度、剪切应力、根系固结和植被合成为洪水、干旱、野火与滑坡风险场",
      time: "时间进程报告选定年限内演替、干旱、野火、洪水和滑坡扰动后的累积侵蚀与植被投影",
      uncertainty: "确定性本地集合扰动降水、温度、土壤蓄水、成河阈值、植被反馈和人造设施滞留/径流，输出 P10/P50/P90 离散度和敏感度评分",
      wind: "地形暴露 + 背风遮蔽 + 冠层/粗糙度阻力 + 可选栅格风场覆盖；u/v 分量会转换为气象学风来向",
      vegetation: "土地覆盖/NDVI 冠层融合，包含 LAI、根系固结、截留、蒸散和水量平衡诊断",
      terrainDiagnostics: "可调多尺度域扭曲、分形噪声、山脊与微地形生成，并计算坡度、坡向、曲率、地形位置指数、局地粗糙度、地形湿润指数和亚格双线性检查器",
      landscapeConnectivity: "面积闭合的八邻域生态区块图，将地形、水文、P/PET 干湿度、植被、人造干扰与灾害合成为边缘压力、核心生境代理、连通度、阻力和跨区通量",
      wildlife: "36 类区域物种的限制因子生态位 + 有效栖息面积承载力 + 代表性成年体重生物量 + 猎物资源支持 + 干扰死亡 + 功能连通网络 + 受约束投放筛查；不替代种群生存力分析",
      ecologicalIntegrity: "以可展开的生境、连通性、核心生境、气候—植被一致性、Shannon/Hill 多样性、功能群和营养资源分项构成筛查指数，并保留专业解释边界",
      proceduralAssets: "109 类语义程序化资产工厂，以曲线、挤压、旋转体、桁架、肋板、非规则多面体和多部件装配构造自然物件、人造设施与动物解剖",
      continentTemplates: "15 套全球与区域模板联动地貌、气候、风、水文、植被、生态区系和随机种子",
      scenarioSynthesis: "八系统情景综合分离系统覆盖与证据覆盖，汇总跨域联动链路、目的相关验证优先事项，并输出结构化 JSON 与可读 Markdown 简报",
      physicalCoupling: "八项独立物理门控 + 八条跨系统联动账本；以几何平均暴露限制环节，并保留方法来源、采样尺度和解释边界",
      engineInterop: "Unity 2^n+1 高度场与 Unreal 推荐 Landscape 尺寸的 16 位原生高度导出，附 8 位地表权重图、ENU 米制矢量、轴向/尺度/高程编码清单和物理诊断"
    },
    warnings
  };
}

function writeParams(nextParams) {
  for (const [key, value] of Object.entries(nextParams)) {
    if (!ui[key]) continue;
    if (ui[key].type === "checkbox") ui[key].checked = Boolean(value);
    else ui[key].value = value;
  }
  updateContinentTemplateStatus();
  updateLabels();
}

function download(filename, type, content) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function format(value, decimals = 1) {
  return Number(value).toFixed(decimals);
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(Number(value) * factor) / factor;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function currentMapSizeKm() {
  const value = Number(ui.mapSizeKm?.value ?? params?.mapSizeKm ?? model?.sizeKm ?? MAP_SIZE_KM);
  return Number.isFinite(value) && value > 0 ? value : MAP_SIZE_KM;
}

function readLocalRefinementOptions() {
  const windowCells = clamp(Math.round(Number(document.getElementById("localWindowCells")?.value) || 17), 3, 65);
  const refinementFactor = clamp(Math.round(Number(document.getElementById("localRefinementFactor")?.value) || 16), 2, 64);
  return { windowCells, refinementFactor };
}

function readSubsurfaceTransectOptions() {
  const mode = document.getElementById("subsurfaceTransectMode")?.value || "west-east";
  const samples = clamp(Math.round(Number(document.getElementById("subsurfaceTransectSamples")?.value) || 33), 2, 129);
  return {
    mode,
    samples,
    profileId: `地下剖面-${mode}-${samples}`
  };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
