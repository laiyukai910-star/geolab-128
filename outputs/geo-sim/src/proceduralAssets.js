import * as THREE from "three";
import { createFoliageGeometry } from "./foliageGeometry.js";
import {
  assetPipelineDiagnostics,
  normalizeRenderDetailQuality,
  proceduralDetailProfile,
  proceduralMaterialClass
} from "./assetPipeline.js";

const SEMANTIC_ASSET_KIND = new Map([
  ["岩石露头", "fractured-rock"], ["坡麓碎屑", "talus-cluster"], ["高山雪斑", "snow-drift"],
  ["河岸湿缘", "wetland-ribbon"], ["树干", "fluted-trunk"], ["阔叶冠层", "broadleaf-canopy"],
  ["针叶林冠", "layered-conifer"], ["灌草斑块", "irregular-shrub"], ["林下植被", "understory-cluster"],
  ["湿地芦苇", "reed-cluster"], ["农田作物行", "crop-row"], ["草簇", "crossed-grass"],
  ["退台高层塔楼", "setback-tower"], ["围合中高层组团", "courtyard-midrise"],
  ["错落低层住宅", "l-plan-lowrise"], ["锯齿顶工业厂房", "sawtooth-industrial"],
  ["多翼公共设施", "cross-plan-civic"], ["四坡脊屋顶", "hipped-roof"],
  ["曲面地标塔体", "tapered-landmark"], ["塔楼顶冠", "architectural-crown"],
  ["立面横带", "facade-band"], ["立面竖肋", "facade-fin"], ["窗格幕墙", "curtain-wall"],
  ["阳台挑板", "balcony-railed"], ["建筑阳台栏杆", "balcony-railed"], ["入口雨棚", "entrance-canopy"],
  ["屋顶机电", "rooftop-plant"], ["建筑冷却机组", "rooftop-plant"], ["办公机电平台", "rooftop-plant"],
  ["楼顶天线", "antenna-array"], ["水文传感器桅杆", "sensor-mast"],
  ["设施底板", "chamfered-slab"], ["建筑裙房基座", "podium-base"], ["酒店裙房", "podium-base"],
  ["道路桥面", "crowned-road"], ["道路标线", "beveled-marking"], ["跑道标线", "beveled-marking"],
  ["跑道入口标志条", "beveled-marking"], ["路灯与支柱", "streetlight"], ["桥墩", "bridge-pier"],
  ["桥梁防护栏", "railing"], ["铁路", "rail-profile"], ["铁路枕木", "rail-sleeper"],
  ["渠道水面", "rippled-water"], ["水库水面", "rippled-water"], ["渠道护岸", "canal-bank"],
  ["堤防", "levee"], ["大坝结构", "buttress-dam"], ["溢洪道", "stepped-spillway"],
  ["溢洪道闸门", "sluice-gate"], ["跑道", "grooved-runway"], ["光伏板", "solar-panel-frame"],
  ["设施光伏支架", "solar-rack"], ["风机叶片", "turbine-blade"], ["风机塔筒", "tapered-mast"],
  ["蓄水/处理罐", "process-tank"], ["高架水塔储罐", "water-tower-tank"],
  ["海水淡化处理罐", "process-tank"], ["地标尖顶", "ribbed-spire"], ["体育场看台", "stadium-bowl"],
  ["体育场草坪核心", "stadium-field"], ["屋顶绿化", "roof-garden"], ["建筑核心筒", "service-core"],
  ["建筑坡屋顶片", "hipped-roof"], ["建筑服务院落", "service-yard"], ["建筑到发门廊", "portico"],
  ["建筑机电屏障", "louver-screen"], ["建筑服务竖井", "louver-screen"],
  ["设施冷却排架", "cooling-rack"], ["设施温室屋脊", "greenhouse-bay"], ["设施市集遮棚", "market-awning"],
  ["梯田挡墙", "stone-retaining-wall"], ["采石台阶", "quarry-bench"], ["变电站构架", "electrical-gantry"],
  ["医院停机坪", "helipad"], ["学校场院", "sports-court"], ["应急车道铺面", "curbed-bay"],
  ["安保前场", "security-forecourt"], ["诊所救护车位", "curbed-bay"], ["公交港湾", "curbed-bay"],
  ["图书馆阅览庭院", "garden-court"], ["社区广场", "patterned-plaza"], ["游客中心广场", "patterned-plaza"],
  ["水塔支腿", "truss-tower"], ["天文台穹顶", "observatory-dome"], ["天文台望远镜座", "telescope-mount"],
  ["缆车塔架", "truss-tower"], ["缆车索道", "braided-cable"], ["缆车站台", "station-platform"],
  ["排涝泵站进水闸", "intake-gate"], ["排涝泵站出水渠", "stepped-spillway"],
  ["海水淡化取水廊", "intake-gallery"], ["景观点平台", "observation-deck"], ["景观点栏杆", "railing"],
  ["步道入口服务亭", "trailhead-kiosk"], ["步道入口路径带", "trail-strip"],
  ["护林站瞭望塔", "truss-tower"], ["护林站场院", "service-yard"], ["水文测尺板", "gauge-board"],
  ["设施服务标识", "service-sign"], ["港口码头作业面", "port-apron"],
  ["港口起重机塔身", "crane-tower"], ["港口起重机臂架", "crane-boom"],
  ["适应性边坡挡墙", "stone-retaining-wall"], ["适应性防风屏", "windbreak-screen"],
  ["适应性防洪台基", "flood-resilient-base"], ["适应性防火隔离带", "firebreak-strip"],
  ["适应性排水浅沟", "bioswale"], ["设施方案落位节点", "placement-beacon"],
  ["区块推荐设施预览标记", "placement-beacon"], ["区块微分区设施锚点", "placement-beacon"]
]);

const EXPLICIT_KINDS = [
  "wildlife-torso", "wildlife-head", "wildlife-muzzle", "wildlife-ear", "wildlife-eye",
  "wildlife-leg-cluster", "wildlife-leg-pair", "wildlife-wing", "wildlife-neck", "wildlife-beak", "wildlife-talon",
  "wildlife-tail", "wildlife-flat-tail", "wildlife-feather-tail", "wildlife-antler", "wildlife-horn",
  "wildlife-tusk", "wildlife-trunk", "wildlife-mane"
];

export const PROCEDURAL_ASSET_KINDS = Object.freeze(Array.from(new Set([
  ...SEMANTIC_ASSET_KIND.values(),
  ...EXPLICIT_KINDS
])).sort());

export function semanticAssetKind(label) {
  return SEMANTIC_ASSET_KIND.get(label) || null;
}

export function createSemanticAssetGeometry(label, quality = "ultra", variant = 0) {
  const kind = semanticAssetKind(label);
  return kind ? createProceduralGeometry(kind, quality, variant) : null;
}

export function wildlifeProceduralKind(species, part) {
  const id = String(part?.id || "").toLowerCase();
  if (id.includes("eye")) return "wildlife-eye";
  if (id.includes("antler")) return "wildlife-antler";
  if (id.includes("horn")) return "wildlife-horn";
  if (id.includes("tusk")) return "wildlife-tusk";
  if (id.includes("trunk")) return "wildlife-trunk";
  if (id.includes("mane")) return "wildlife-mane";
  if (id.includes("wing")) return "wildlife-wing";
  if (id.includes("talon")) return "wildlife-talon";
  if (id.includes("front-leg") || id.includes("rear-leg") || id.includes("forearm")) return "wildlife-leg-pair";
  if (id.includes("leg") || id.includes("feet") || id.includes("hoof")) return "wildlife-leg-cluster";
  if (id.includes("neck")) return "wildlife-neck";
  if (id.includes("beak")) return "wildlife-beak";
  if (id.includes("ear")) return "wildlife-ear";
  if (id.includes("muzzle") || id.includes("snout")) return "wildlife-muzzle";
  if (id.includes("tail")) {
    if (species?.geometryClass === "semi-aquatic") return "wildlife-flat-tail";
    if (["bird", "raptor"].includes(species?.geometryClass)) return "wildlife-feather-tail";
    return "wildlife-tail";
  }
  if (id.includes("head")) return "wildlife-head";
  return "wildlife-torso";
}

export function createProceduralGeometry(kind, quality = "ultra", variant = 0) {
  quality = normalizeRenderDetailQuality(quality);
  variant = Math.max(0, Math.floor(Number(variant) || 0));
  let geometry;
  switch (kind) {
    case "setback-tower": geometry = createSetbackTowerGeometry(quality); break;
    case "courtyard-midrise": geometry = createCourtyardMidriseGeometry(quality); break;
    case "l-plan-lowrise": geometry = createLowriseGeometry(quality); break;
    case "sawtooth-industrial": geometry = createIndustrialGeometry(quality); break;
    case "cross-plan-civic": geometry = createCivicGeometry(quality); break;
    case "hipped-roof": geometry = createHippedRoofGeometry(quality); break;
    case "tapered-landmark": geometry = createLandmarkGeometry(quality); break;
    case "fractured-rock": geometry = createFracturedRockGeometry(quality); break;
    case "talus-cluster": geometry = createTalusGeometry(quality); break;
    case "snow-drift": geometry = createSnowDriftGeometry(quality); break;
    case "wetland-ribbon": geometry = createRippledSurfaceGeometry(quality, 0.055); break;
    case "fluted-trunk": geometry = createFlutedTrunkGeometry(quality); break;
    case "broadleaf-canopy": geometry = createFoliageGeometry(false, quality, variant); break;
    case "layered-conifer": geometry = createFoliageGeometry(true, quality, variant); break;
    case "irregular-shrub": geometry = createShrubGeometry(quality, false); break;
    case "understory-cluster": geometry = createShrubGeometry(quality, true); break;
    case "reed-cluster": geometry = createReedGeometry(quality); break;
    case "crop-row": geometry = createCropRowGeometry(quality); break;
    case "crossed-grass": geometry = createGrassGeometry(quality); break;
    case "architectural-crown": geometry = createArchitecturalCrown(quality); break;
    case "facade-band": geometry = createFacadeBand(quality, false); break;
    case "facade-fin": geometry = createFacadeBand(quality, true); break;
    case "curtain-wall": geometry = createCurtainWall(quality); break;
    case "balcony-railed": geometry = createBalconyGeometry(quality); break;
    case "entrance-canopy": geometry = createEntranceCanopy(quality); break;
    case "rooftop-plant": geometry = createRooftopPlant(quality); break;
    case "antenna-array": geometry = createAntennaArray(quality); break;
    case "sensor-mast": geometry = createSensorMast(quality); break;
    case "chamfered-slab": geometry = createChamferedSlab(quality, 0.08); break;
    case "podium-base": geometry = createPodiumBase(quality); break;
    case "crowned-road": geometry = createCrownedRoad(quality); break;
    case "beveled-marking": geometry = createChamferedSlab(quality, 0.04); break;
    case "streetlight": geometry = createStreetlight(quality); break;
    case "bridge-pier": geometry = createBridgePier(quality); break;
    case "railing": geometry = createRailing(quality); break;
    case "rail-profile": geometry = createRailProfile(quality); break;
    case "rail-sleeper": geometry = createRailSleeper(quality); break;
    case "rippled-water": geometry = createRippledSurfaceGeometry(quality, 0.035); break;
    case "canal-bank": geometry = createCanalBank(quality); break;
    case "levee": geometry = createLevee(quality); break;
    case "buttress-dam": geometry = createButtressDam(quality); break;
    case "stepped-spillway": geometry = createSpillway(quality); break;
    case "sluice-gate": geometry = createSluiceGate(quality); break;
    case "grooved-runway": geometry = createGroovedRunway(quality); break;
    case "solar-panel-frame": geometry = createSolarPanel(quality); break;
    case "solar-rack": geometry = createSolarRack(quality); break;
    case "turbine-blade": geometry = createTurbineBlade(quality); break;
    case "tapered-mast": geometry = createTaperedMast(quality); break;
    case "process-tank": geometry = createProcessTank(quality, false); break;
    case "water-tower-tank": geometry = createProcessTank(quality, true); break;
    case "ribbed-spire": geometry = createRibbedSpire(quality); break;
    case "stadium-bowl": geometry = createStadiumBowl(quality); break;
    case "stadium-field": geometry = createStadiumField(quality); break;
    case "roof-garden": geometry = createRoofGarden(quality); break;
    case "service-core": geometry = createServiceCore(quality); break;
    case "service-yard": geometry = createPatternedSurface(quality, "yard"); break;
    case "portico": geometry = createPortico(quality); break;
    case "louver-screen": geometry = createLouverScreen(quality); break;
    case "cooling-rack": geometry = createCoolingRack(quality); break;
    case "greenhouse-bay": geometry = createGreenhouseBay(quality); break;
    case "market-awning": geometry = createMarketAwning(quality); break;
    case "stone-retaining-wall": geometry = createRetainingWall(quality); break;
    case "quarry-bench": geometry = createQuarryBench(quality); break;
    case "electrical-gantry": geometry = createElectricalGantry(quality); break;
    case "helipad": geometry = createHelipad(quality); break;
    case "sports-court": geometry = createPatternedSurface(quality, "court"); break;
    case "curbed-bay": geometry = createCurbedBay(quality); break;
    case "security-forecourt": geometry = createPatternedSurface(quality, "security"); break;
    case "garden-court": geometry = createGardenCourt(quality); break;
    case "patterned-plaza": geometry = createPatternedSurface(quality, "plaza"); break;
    case "truss-tower": geometry = createTrussTower(quality); break;
    case "observatory-dome": geometry = createObservatoryDome(quality); break;
    case "telescope-mount": geometry = createTelescopeMount(quality); break;
    case "braided-cable": geometry = createBraidedCable(quality); break;
    case "station-platform": geometry = createStationPlatform(quality); break;
    case "intake-gate": geometry = createIntakeGate(quality); break;
    case "intake-gallery": geometry = createIntakeGallery(quality); break;
    case "observation-deck": geometry = createObservationDeck(quality); break;
    case "trailhead-kiosk": geometry = createTrailheadKiosk(quality); break;
    case "trail-strip": geometry = createTrailStrip(quality); break;
    case "gauge-board": geometry = createGaugeBoard(quality); break;
    case "service-sign": geometry = createServiceSign(quality); break;
    case "port-apron": geometry = createPortApron(quality); break;
    case "crane-tower": geometry = createCraneTower(quality); break;
    case "crane-boom": geometry = createCraneBoom(quality); break;
    case "windbreak-screen": geometry = createWindbreak(quality); break;
    case "flood-resilient-base": geometry = createFloodBase(quality); break;
    case "firebreak-strip": geometry = createFirebreak(quality); break;
    case "bioswale": geometry = createBioswale(quality); break;
    case "placement-beacon": geometry = createPlacementBeacon(quality); break;
    case "wildlife-torso": geometry = createWildlifeTorso(quality); break;
    case "wildlife-head": geometry = createWildlifeHead(quality); break;
    case "wildlife-muzzle": geometry = createWildlifeMuzzle(quality); break;
    case "wildlife-ear": geometry = createWildlifeEar(quality); break;
    case "wildlife-eye": geometry = createWildlifeEye(quality); break;
    case "wildlife-leg-cluster": geometry = createWildlifeLegCluster(quality); break;
    case "wildlife-leg-pair": geometry = createWildlifeLegPair(quality); break;
    case "wildlife-wing": geometry = createWildlifeWing(quality); break;
    case "wildlife-neck": geometry = createWildlifeNeck(quality); break;
    case "wildlife-beak": geometry = createWildlifeBeak(quality); break;
    case "wildlife-talon": geometry = createWildlifeTalon(quality); break;
    case "wildlife-tail": geometry = createWildlifeTail(quality, false); break;
    case "wildlife-flat-tail": geometry = createWildlifeTail(quality, true); break;
    case "wildlife-feather-tail": geometry = createWildlifeFeatherTail(quality); break;
    case "wildlife-antler": geometry = createWildlifeAntler(quality); break;
    case "wildlife-horn": geometry = createWildlifeHorn(quality); break;
    case "wildlife-tusk": geometry = createWildlifeTusk(quality); break;
    case "wildlife-trunk": geometry = createWildlifeTrunk(quality); break;
    case "wildlife-mane": geometry = createWildlifeMane(quality); break;
    default: geometry = createChamferedSlab(quality, 0.05); break;
  }
  return tagProceduralGeometry(applyProceduralVariant(geometry, kind, quality, variant), kind, quality, variant);
}

export function proceduralAssetDiagnostics() {
  return {
    schemaVersion: 3,
    assetKindCount: PROCEDURAL_ASSET_KINDS.length,
    semanticBindingCount: SEMANTIC_ASSET_KIND.size,
    allKinds: PROCEDURAL_ASSET_KINDS,
    pipeline: assetPipelineDiagnostics()
  };
}

function detail(quality) {
  return proceduralDetailProfile(quality);
}

function qualityCount(quality, high, ultra, exhaustive) {
  return quality === "exhaustive" ? exhaustive : quality === "ultra" ? ultra : high;
}

function createSetbackTowerGeometry(quality) {
  const d = detail(quality);
  const profile = [
    [-0.5, 1], [-0.2, 1], [-0.2, 0.86], [0.08, 0.86], [0.08, 0.69],
    [0.32, 0.69], [0.32, 0.52], [0.47, 0.52], [0.5, 0.34]
  ];
  const body = ringLoft(profile, d.radial, 0.08);
  const parts = [{ geometry: body }];
  for (let i = 0; i < Math.min(7, d.bars); i += 1) {
    const a = i / Math.min(7, d.bars) * Math.PI * 2;
    parts.push(part(new THREE.BoxGeometry(1, 1, 1), [Math.cos(a) * 0.32, 0.04, Math.sin(a) * 0.32], [0.025, 0.88, 0.025], [0, -a, 0]));
  }
  parts.push(part(new THREE.CylinderGeometry(0.08, 0.13, 1, d.radial), [0, 0.42, 0], [1, 0.16, 1]));
  return mergeAssembly(parts);
}

function createCourtyardMidriseGeometry(quality) {
  const parts = [
    part(chamferedBox(quality), [0, -0.04, -0.39], [1, 0.84, 0.22]),
    part(chamferedBox(quality), [0, -0.08, 0.39], [1, 0.76, 0.22]),
    part(chamferedBox(quality), [-0.39, -0.02, 0], [0.22, 0.88, 0.64]),
    part(chamferedBox(quality), [0.39, -0.1, 0], [0.22, 0.72, 0.64]),
    part(new THREE.CylinderGeometry(0.48, 0.48, 0.04, detail(quality).radial), [0, -0.48, 0], [0.45, 1, 0.45]),
    part(new THREE.BoxGeometry(1, 1, 1), [-0.27, 0.42, -0.39], [0.12, 0.08, 0.13]),
    part(new THREE.BoxGeometry(1, 1, 1), [0.27, 0.35, 0.39], [0.12, 0.08, 0.13])
  ];
  return mergeAssembly(parts);
}

function createLowriseGeometry(quality) {
  return mergeAssembly([
    part(chamferedBox(quality), [-0.16, -0.08, 0.08], [0.68, 0.74, 0.7]),
    part(chamferedBox(quality), [0.3, -0.2, -0.25], [0.34, 0.5, 0.42]),
    part(createHippedRoofGeometry(quality), [-0.16, 0.36, 0.08], [0.75, 0.28, 0.78]),
    part(createHippedRoofGeometry(quality), [0.3, 0.08, -0.25], [0.4, 0.2, 0.48]),
    part(new THREE.BoxGeometry(1, 1, 1), [0.48, -0.31, -0.25], [0.18, 0.08, 0.26])
  ]);
}

function createIndustrialGeometry(quality) {
  const parts = [part(chamferedBox(quality), [0, -0.14, 0], [1, 0.72, 1])];
  const teeth = qualityCount(quality, 4, 7, 11);
  for (let i = 0; i < teeth; i += 1) {
    const x = -0.42 + i * (0.84 / Math.max(1, teeth - 1));
    parts.push(part(wedgeGeometry(), [x, 0.32, 0], [0.18, 0.25, 1], [0, 0, Math.PI / 2]));
  }
  parts.push(part(new THREE.CylinderGeometry(0.18, 0.22, 1, detail(quality).radial), [0.35, 0.25, 0.28], [0.22, 0.46, 0.22]));
  return mergeAssembly(parts);
}

function createCivicGeometry(quality) {
  const d = detail(quality);
  return mergeAssembly([
    part(chamferedBox(quality), [0, -0.14, 0], [0.42, 0.72, 1]),
    part(chamferedBox(quality), [0, -0.14, 0], [1, 0.72, 0.42]),
    part(new THREE.CylinderGeometry(0.28, 0.34, 0.22, d.radial), [0, 0.3, 0]),
    part(new THREE.SphereGeometry(0.22, d.radial, Math.ceil(d.radial / 2), 0, Math.PI * 2, 0, Math.PI / 2), [0, 0.4, 0], [1, 0.6, 1]),
    part(new THREE.BoxGeometry(1, 1, 1), [0, -0.23, -0.52], [0.28, 0.18, 0.12])
  ]);
}

function createHippedRoofGeometry(quality) {
  const roof = wedgeRoofGeometry();
  const d = detail(quality);
  const parts = [{ geometry: roof }];
  for (let i = 0; i < Math.min(5, d.bars); i += 1) {
    const x = -0.38 + i * 0.19;
    parts.push(part(new THREE.BoxGeometry(1, 1, 1), [x, -0.02, 0], [0.018, 0.04, 0.92]));
  }
  parts.push(part(new THREE.CylinderGeometry(0.04, 0.04, 1, 6), [0, 0.5, 0], [1, 0.86, 1], [0, 0, Math.PI / 2]));
  return mergeAssembly(parts);
}

function createLandmarkGeometry(quality) {
  const d = detail(quality);
  const profile = [
    new THREE.Vector2(0.36, -0.5), new THREE.Vector2(0.48, -0.4), new THREE.Vector2(0.39, -0.17),
    new THREE.Vector2(0.3, 0.12), new THREE.Vector2(0.24, 0.32), new THREE.Vector2(0.12, 0.47), new THREE.Vector2(0.03, 0.5)
  ];
  const parts = [{ geometry: new THREE.LatheGeometry(profile, d.radial) }];
  for (let i = 0; i < 6; i += 1) {
    const a = i / 6 * Math.PI * 2;
    parts.push(part(new THREE.BoxGeometry(1, 1, 1), [Math.cos(a) * 0.28, 0, Math.sin(a) * 0.28], [0.025, 0.82, 0.04], [0, -a, 0]));
  }
  return mergeAssembly(parts);
}

function createFracturedRockGeometry(quality) {
  const count = qualityCount(quality, 5, 8, 13);
  const parts = [];
  for (let i = 0; i < count; i += 1) {
    const geometry = deformedPolyhedron(quality, 0.14 + i * 0.37);
    const a = i * 2.399;
    parts.push(part(geometry, [Math.cos(a) * (0.16 + i * 0.025), -0.12 + (i % 3) * 0.08, Math.sin(a) * (0.18 + i * 0.02)], [0.48 - i * 0.035, 0.56 - i * 0.04, 0.44 - i * 0.025], [i * 0.31, a, i * 0.19]));
  }
  return mergeAssembly(parts);
}

function createTalusGeometry(quality) {
  const count = qualityCount(quality, 7, 12, 20);
  const parts = [];
  for (let i = 0; i < count; i += 1) {
    const a = i * 2.17;
    const r = 0.1 + (i % 4) * 0.1;
    parts.push(part(deformedPolyhedron("high", i + 0.7), [Math.cos(a) * r, -0.34 + (i % 3) * 0.07, Math.sin(a) * r], [0.18, 0.18 + (i % 2) * 0.08, 0.22], [a * 0.3, a, i * 0.4]));
  }
  return mergeAssembly(parts);
}

function createSnowDriftGeometry(quality) {
  const d = detail(quality);
  const parts = [part(deformedHemisphere(d.radial), [0, -0.18, 0], [1, 0.42, 1])];
  for (let i = 0; i < 4; i += 1) parts.push(part(curvedRibbon(quality, 0.05), [-0.15 + i * 0.1, 0.03 + i * 0.015, 0], [0.72, 0.2, 0.8], [0, i * 0.28, 0]));
  return mergeAssembly(parts);
}

function createFlutedTrunkGeometry(quality) {
  const d = detail(quality);
  const profile = [
    new THREE.Vector2(0.34, -0.5), new THREE.Vector2(0.22, -0.42), new THREE.Vector2(0.16, 0.22),
    new THREE.Vector2(0.13, 0.46), new THREE.Vector2(0.08, 0.5)
  ];
  const parts = [{ geometry: new THREE.LatheGeometry(profile, d.radial) }];
  for (let i = 0; i < 5; i += 1) {
    const a = i / 5 * Math.PI * 2;
    parts.push(part(new THREE.ConeGeometry(0.22, 0.42, 6), [Math.cos(a) * 0.23, -0.39, Math.sin(a) * 0.23], [1, 1, 0.42], [0, -a, Math.PI / 2]));
  }
  parts.push(part(curvedTube([[0, 0.12, 0], [0.12, 0.28, 0.03], [0.3, 0.4, 0.08]], 0.045, d.curve), [0, 0, 0]));
  return mergeAssembly(parts);
}

function createShrubGeometry(quality, understory) {
  const count = understory ? 7 : detail(quality).lobes;
  const parts = [];
  for (let i = 0; i < count; i += 1) {
    const a = i * 2.13;
    parts.push(part(deformedPolyhedron("high", i * 1.7), [Math.cos(a) * 0.25, -0.14 + (i % 3) * 0.08, Math.sin(a) * 0.25], [0.42, understory ? 0.27 : 0.38, 0.44]));
  }
  return mergeAssembly(parts);
}

function createReedGeometry(quality) {
  const d = detail(quality);
  const count = qualityCount(quality, 10, 16, 26);
  const parts = [];
  for (let i = 0; i < count; i += 1) {
    const a = i * 2.399;
    const r = 0.08 + (i % 4) * 0.07;
    const h = 0.65 + (i % 5) * 0.08;
    parts.push(part(new THREE.CylinderGeometry(0.018, 0.025, 1, 5), [Math.cos(a) * r, -0.5 + h / 2, Math.sin(a) * r], [1, h, 1], [0.04 * Math.sin(a), 0, 0.05 * Math.cos(a)]));
    parts.push(part(new THREE.SphereGeometry(0.5, 6, 4), [Math.cos(a) * r, -0.5 + h + 0.08, Math.sin(a) * r], [0.055, 0.16, 0.055], [0, a, 0.12]));
  }
  return mergeAssembly(parts);
}

function createCropRowGeometry(quality) {
  const rows = qualityCount(quality, 5, 8, 14);
  const parts = [];
  for (let i = 0; i < rows; i += 1) {
    const z = -0.42 + i * (0.84 / Math.max(1, rows - 1));
    parts.push(part(ridgedStrip(quality), [0, -0.35, z], [1, 0.28, 0.11]));
    for (let j = 0; j < 4; j += 1) {
      const x = -0.36 + j * 0.24;
      parts.push(part(curvedBlade(quality), [x, -0.08, z], [0.12, 0.58, 0.12], [0, j * 0.7, 0]));
    }
  }
  return mergeAssembly(parts);
}

function createGrassGeometry(quality) {
  const blades = qualityCount(quality, 8, 14, 24);
  const parts = [];
  for (let i = 0; i < blades; i += 1) {
    const a = i * 2.399;
    const r = (i % 4) * 0.07;
    parts.push(part(curvedBlade(quality), [Math.cos(a) * r, 0, Math.sin(a) * r], [0.16, 1 - (i % 3) * 0.12, 0.16], [0, a, (i % 2 ? -1 : 1) * 0.18]));
  }
  return mergeAssembly(parts);
}

function createArchitecturalCrown(quality) {
  const d = detail(quality);
  const parts = [part(new THREE.CylinderGeometry(0.42, 0.5, 0.45, d.radial), [0, -0.17, 0])];
  for (let i = 0; i < 8; i += 1) {
    const a = i / 8 * Math.PI * 2;
    parts.push(part(wedgeGeometry(), [Math.cos(a) * 0.35, 0.15, Math.sin(a) * 0.35], [0.12, 0.55, 0.08], [0, -a, 0]));
  }
  parts.push(part(new THREE.ConeGeometry(0.12, 0.7, d.radial), [0, 0.28, 0], [1, 0.65, 1]));
  return mergeAssembly(parts);
}

function createFacadeBand(quality, vertical) {
  const count = qualityCount(quality, 6, 10, 16);
  const parts = [part(chamferedBox(quality), [0, 0, 0], [1, 0.08, 0.16])];
  for (let i = 0; i < count; i += 1) {
    const t = -0.44 + i * 0.88 / Math.max(1, count - 1);
    parts.push(vertical
      ? part(new THREE.BoxGeometry(1, 1, 1), [t, 0, 0.08], [0.035, 1, 0.05])
      : part(new THREE.BoxGeometry(1, 1, 1), [0, t, 0.08], [1, 0.035, 0.05]));
  }
  return mergeAssembly(parts);
}

function createCurtainWall(quality) {
  const count = qualityCount(quality, 5, 9, 15);
  const parts = [part(new THREE.BoxGeometry(1, 1, 1), [0, 0, -0.02], [1, 1, 0.05])];
  for (let i = 0; i <= count; i += 1) {
    const p = -0.5 + i / count;
    parts.push(part(new THREE.BoxGeometry(1, 1, 1), [p, 0, 0.04], [0.025, 1, 0.06]));
    parts.push(part(new THREE.BoxGeometry(1, 1, 1), [0, p, 0.04], [1, 0.025, 0.06]));
  }
  return mergeAssembly(parts);
}

function createBalconyGeometry(quality) {
  const bars = detail(quality).bars;
  const parts = [part(chamferedBox(quality), [0, -0.4, 0], [1, 0.14, 0.82])];
  parts.push(part(new THREE.BoxGeometry(1, 1, 1), [0, 0.05, 0.4], [1, 0.07, 0.05]));
  for (let i = 0; i < bars; i += 1) {
    const x = -0.44 + i * 0.88 / Math.max(1, bars - 1);
    parts.push(part(new THREE.CylinderGeometry(0.025, 0.025, 1, 5), [x, -0.17, 0.4], [1, 0.45, 1]));
  }
  return mergeAssembly(parts);
}

function createEntranceCanopy(quality) {
  return mergeAssembly([
    part(curvedRibbon(quality, 0.12), [0, 0.18, 0], [1, 0.32, 1]),
    part(new THREE.CylinderGeometry(0.035, 0.045, 1, 6), [-0.36, -0.2, -0.28], [1, 0.78, 1]),
    part(new THREE.CylinderGeometry(0.035, 0.045, 1, 6), [0.36, -0.2, -0.28], [1, 0.78, 1]),
    part(new THREE.BoxGeometry(1, 1, 1), [0, 0.23, 0.42], [0.84, 0.09, 0.12])
  ]);
}

function createRooftopPlant(quality) {
  const d = detail(quality);
  const parts = [part(chamferedBox(quality), [0, -0.25, 0], [0.86, 0.46, 0.72])];
  for (let i = 0; i < 3; i += 1) {
    parts.push(part(new THREE.CylinderGeometry(0.13, 0.13, 0.08, d.radial), [-0.25 + i * 0.25, 0.02, 0], [1, 1, 1], [Math.PI / 2, 0, 0]));
  }
  parts.push(part(curvedTube([[-0.35, 0.02, -0.24], [-0.35, 0.28, -0.24], [0.1, 0.28, -0.24]], 0.055, d.curve)));
  return mergeAssembly(parts);
}

function createAntennaArray(quality) {
  const d = detail(quality);
  const parts = [part(new THREE.CylinderGeometry(0.04, 0.07, 1, 7), [0, 0, 0])];
  for (let i = 0; i < 5; i += 1) {
    const y = -0.25 + i * 0.16;
    parts.push(part(new THREE.CylinderGeometry(0.018, 0.018, 0.55, 5), [0, y, 0], [1, 1, 1], [0, 0, Math.PI / 2]));
  }
  parts.push(part(new THREE.SphereGeometry(0.26, d.radial, Math.ceil(d.radial / 2), 0, Math.PI * 2, 0, Math.PI / 2), [0, 0.18, 0.05], [1, 0.38, 0.34], [Math.PI / 2, 0, 0]));
  return mergeAssembly(parts);
}

function createSensorMast(quality) {
  return mergeAssembly([
    part(new THREE.CylinderGeometry(0.035, 0.06, 1, 7), [0, 0, 0]),
    part(new THREE.BoxGeometry(1, 1, 1), [0.14, 0.18, 0], [0.26, 0.18, 0.18]),
    part(new THREE.CylinderGeometry(0.16, 0.16, 0.08, detail(quality).radial), [0, 0.42, 0], [1, 1, 1], [Math.PI / 2, 0, 0]),
    part(new THREE.ConeGeometry(0.08, 0.2, 6), [0, 0.48, 0])
  ]);
}

function createChamferedSlab(quality, bevel) {
  const geometry = chamferedBox(quality, bevel);
  geometry.scale(1, 0.22, 1);
  return geometry;
}

function createPodiumBase(quality) {
  return mergeAssembly([
    part(chamferedBox(quality, 0.08), [0, -0.18, 0], [1, 0.64, 1]),
    part(chamferedBox(quality, 0.06), [0, 0.18, 0], [0.84, 0.22, 0.86]),
    part(new THREE.BoxGeometry(1, 1, 1), [0, -0.1, 0.51], [0.58, 0.2, 0.08])
  ]);
}

function createCrownedRoad(quality) {
  const parts = [{ geometry: crownedPrism() }];
  const drains = qualityCount(quality, 4, 7, 11);
  for (let i = 0; i < drains; i += 1) {
    const x = -0.42 + i * 0.84 / Math.max(1, drains - 1);
    parts.push(part(new THREE.BoxGeometry(1, 1, 1), [x, -0.38, 0.43], [0.08, 0.05, 0.08]));
  }
  return mergeAssembly(parts);
}

function createStreetlight(quality) {
  const d = detail(quality);
  return mergeAssembly([
    part(new THREE.CylinderGeometry(0.035, 0.07, 1, 7), [0, -0.06, 0], [1, 0.88, 1]),
    part(curvedTube([[0, 0.34, 0], [0.04, 0.47, 0], [0.25, 0.47, 0]], 0.035, d.curve)),
    part(chamferedBox(quality), [0.32, 0.43, 0], [0.24, 0.09, 0.18]),
    part(new THREE.CylinderGeometry(0.12, 0.16, 0.08, d.radial), [0, -0.49, 0])
  ]);
}

function createBridgePier(quality) {
  const d = detail(quality);
  return mergeAssembly([
    part(new THREE.CylinderGeometry(0.22, 0.3, 1, d.radial), [0, -0.04, 0], [1, 0.82, 1]),
    part(chamferedBox(quality), [0, 0.39, 0], [1, 0.2, 0.42]),
    part(new THREE.CylinderGeometry(0.3, 0.36, 0.12, d.radial), [0, -0.46, 0], [1, 1, 1]),
    part(new THREE.BoxGeometry(1, 1, 1), [-0.32, 0.48, 0], [0.18, 0.08, 0.28]),
    part(new THREE.BoxGeometry(1, 1, 1), [0.32, 0.48, 0], [0.18, 0.08, 0.28])
  ]);
}

function createRailing(quality) {
  const bars = detail(quality).bars;
  const parts = [part(new THREE.CylinderGeometry(0.025, 0.025, 1, 5), [0, 0.42, 0], [1, 1, 1], [0, 0, Math.PI / 2])];
  for (let i = 0; i < bars; i += 1) {
    const x = -0.46 + i * 0.92 / Math.max(1, bars - 1);
    parts.push(part(new THREE.CylinderGeometry(0.022, 0.027, 1, 5), [x, -0.02, 0], [1, 0.88, 1]));
  }
  parts.push(part(new THREE.BoxGeometry(1, 1, 1), [0, -0.47, 0], [1, 0.08, 0.16]));
  return mergeAssembly(parts);
}

function createRailProfile(quality) {
  const parts = [];
  for (const x of [-0.3, 0.3]) {
    parts.push(part(new THREE.BoxGeometry(1, 1, 1), [x, 0.24, 0], [0.13, 0.12, 1]));
    parts.push(part(new THREE.BoxGeometry(1, 1, 1), [x, 0, 0], [0.055, 0.36, 1]));
    parts.push(part(new THREE.BoxGeometry(1, 1, 1), [x, -0.24, 0], [0.18, 0.12, 1]));
  }
  if (quality !== "high") parts.push(part(new THREE.BoxGeometry(1, 1, 1), [0, -0.38, 0], [1, 0.08, 1]));
  return mergeAssembly(parts);
}

function createRailSleeper(quality) {
  return mergeAssembly([
    part(chamferedBox(quality), [0, 0, 0], [1, 0.28, 0.36]),
    part(new THREE.BoxGeometry(1, 1, 1), [-0.3, 0.2, 0], [0.16, 0.12, 0.4]),
    part(new THREE.BoxGeometry(1, 1, 1), [0.3, 0.2, 0], [0.16, 0.12, 0.4])
  ]);
}

function createCanalBank(quality) {
  return mergeAssembly([
    part(wedgeGeometry(), [-0.34, 0, 0], [0.34, 1, 1], [0, 0, Math.PI]),
    part(wedgeGeometry(), [0.34, 0, 0], [0.34, 1, 1]),
    part(new THREE.BoxGeometry(1, 1, 1), [0, -0.42, 0], [0.42, 0.12, 1])
  ]);
}

function createLevee(quality) {
  const parts = [part(trapezoidPrism(), [0, 0, 0])];
  const stones = qualityCount(quality, 5, 9, 15);
  for (let i = 0; i < stones; i += 1) {
    parts.push(part(deformedPolyhedron("high", i), [-0.36 + i * 0.72 / Math.max(1, stones - 1), -0.2 + (i % 2) * 0.12, 0.42], [0.12, 0.1, 0.08]));
  }
  return mergeAssembly(parts);
}

function createButtressDam(quality) {
  const count = qualityCount(quality, 5, 8, 12);
  const parts = [part(wedgeGeometry(), [0, 0, 0], [1, 1, 0.42], [0, Math.PI / 2, 0])];
  for (let i = 0; i < count; i += 1) {
    const x = -0.42 + i * 0.84 / Math.max(1, count - 1);
    parts.push(part(wedgeGeometry(), [x, -0.12, 0.24], [0.12, 0.78, 0.46], [0, 0, Math.PI / 2]));
  }
  parts.push(part(new THREE.BoxGeometry(1, 1, 1), [0, 0.44, 0], [1, 0.12, 0.5]));
  return mergeAssembly(parts);
}

function createSpillway(quality) {
  const steps = qualityCount(quality, 6, 9, 14);
  const parts = [];
  for (let i = 0; i < steps; i += 1) {
    const t = i / steps;
    parts.push(part(new THREE.BoxGeometry(1, 1, 1), [0, 0.42 - t * 0.84, -0.4 + t * 0.8], [0.72, 0.11, 0.18]));
  }
  parts.push(part(new THREE.BoxGeometry(1, 1, 1), [-0.44, 0, 0], [0.12, 1, 1]));
  parts.push(part(new THREE.BoxGeometry(1, 1, 1), [0.44, 0, 0], [0.12, 1, 1]));
  return mergeAssembly(parts);
}

function createSluiceGate(quality) {
  const parts = [part(chamferedBox(quality), [0, -0.06, 0], [0.72, 0.72, 0.18])];
  for (const x of [-0.42, 0.42]) parts.push(part(new THREE.BoxGeometry(1, 1, 1), [x, 0, 0], [0.12, 1, 0.28]));
  parts.push(part(new THREE.CylinderGeometry(0.04, 0.04, 1, 6), [0, 0.36, 0], [1, 0.85, 1], [0, 0, Math.PI / 2]));
  parts.push(part(new THREE.CylinderGeometry(0.16, 0.16, 0.08, detail(quality).radial), [0, 0.36, 0]));
  return mergeAssembly(parts);
}

function createGroovedRunway(quality) {
  const grooves = qualityCount(quality, 7, 12, 20);
  const parts = [part(chamferedBox(quality), [0, 0, 0], [1, 0.16, 1])];
  for (let i = 0; i < grooves; i += 1) {
    const x = -0.44 + i * 0.88 / Math.max(1, grooves - 1);
    parts.push(part(new THREE.BoxGeometry(1, 1, 1), [x, 0.1, 0], [0.025, 0.025, 1]));
  }
  return mergeAssembly(parts);
}

function createSolarPanel(quality) {
  const parts = [part(chamferedBox(quality), [0, 0.08, 0], [1, 0.08, 0.68], [-0.18, 0, 0])];
  for (const x of [-0.46, 0.46]) parts.push(part(new THREE.BoxGeometry(1, 1, 1), [x, 0.08, 0], [0.035, 0.12, 0.72], [-0.18, 0, 0]));
  for (let i = 0; i < 4; i += 1) parts.push(part(new THREE.BoxGeometry(1, 1, 1), [-0.3 + i * 0.2, 0.115, 0], [0.018, 0.03, 0.65], [-0.18, 0, 0]));
  parts.push(part(new THREE.BoxGeometry(1, 1, 1), [0, -0.22, -0.18], [0.7, 0.05, 0.05], [0, 0, 0.48]));
  return mergeAssembly(parts);
}

function createSolarRack(quality) {
  const parts = [];
  for (const x of [-0.38, 0, 0.38]) {
    parts.push(part(new THREE.BoxGeometry(1, 1, 1), [x, -0.08, -0.18], [0.05, 0.78, 0.05], [0, 0, 0.25]));
    parts.push(part(new THREE.BoxGeometry(1, 1, 1), [x, -0.15, 0.18], [0.05, 0.58, 0.05], [0, 0, -0.32]));
  }
  parts.push(part(new THREE.BoxGeometry(1, 1, 1), [0, 0.28, 0], [1, 0.06, 0.08]));
  return mergeAssembly(parts);
}

function createTurbineBlade(quality) {
  const parts = [part(airfoilBlade(quality), [0.25, 0, 0], [0.5, 1, 0.42])];
  for (let i = 1; i < 3; i += 1) parts.push(part(airfoilBlade(quality), [Math.cos(i * 2.094) * 0.25, Math.sin(i * 2.094) * 0.25, 0], [0.5, 1, 0.42], [0, 0, i * 2.094]));
  parts.push(part(new THREE.SphereGeometry(0.15, detail(quality).radial, 8)));
  return mergeAssembly(parts);
}

function createTaperedMast(quality) {
  const d = detail(quality);
  const profile = [new THREE.Vector2(0.22, -0.5), new THREE.Vector2(0.17, -0.25), new THREE.Vector2(0.1, 0.43), new THREE.Vector2(0.08, 0.5)];
  return mergeAssembly([
    { geometry: new THREE.LatheGeometry(profile, d.radial) },
    part(new THREE.CylinderGeometry(0.18, 0.18, 0.18, d.radial), [0, 0.43, 0], [1, 1, 1], [Math.PI / 2, 0, 0]),
    part(new THREE.CylinderGeometry(0.29, 0.34, 0.08, d.radial), [0, -0.48, 0])
  ]);
}

function createProcessTank(quality, elevated) {
  const d = detail(quality);
  const parts = [
    part(new THREE.CylinderGeometry(0.39, 0.39, elevated ? 0.5 : 0.72, d.radial), [0, elevated ? 0.16 : -0.05, 0]),
    part(new THREE.SphereGeometry(0.39, d.radial, Math.ceil(d.radial / 2), 0, Math.PI * 2, 0, Math.PI / 2), [0, elevated ? 0.41 : 0.31, 0], [1, 0.55, 1])
  ];
  for (let i = 0; i < 3; i += 1) parts.push(part(new THREE.TorusGeometry(0.4, 0.02, 5, d.radial), [0, -0.25 + i * 0.25, 0], [1, 1, 1], [Math.PI / 2, 0, 0]));
  if (elevated) {
    for (const [x, z] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) {
      parts.push(part(new THREE.CylinderGeometry(0.035, 0.045, 1, 6), [x, -0.25, z], [1, 0.5, 1]));
    }
  }
  return mergeAssembly(parts);
}

function createRibbedSpire(quality) {
  const d = detail(quality);
  const profile = [new THREE.Vector2(0.4, -0.5), new THREE.Vector2(0.31, -0.15), new THREE.Vector2(0.2, 0.2), new THREE.Vector2(0.04, 0.5)];
  const parts = [{ geometry: new THREE.LatheGeometry(profile, d.radial) }];
  for (let i = 0; i < 6; i += 1) {
    const a = i / 6 * Math.PI * 2;
    parts.push(part(wedgeGeometry(), [Math.cos(a) * 0.23, 0, Math.sin(a) * 0.23], [0.05, 0.86, 0.32], [0, -a, 0]));
  }
  return mergeAssembly(parts);
}

function createStadiumBowl(quality) {
  const d = detail(quality);
  const parts = [part(new THREE.TorusGeometry(0.34, 0.16, Math.ceil(d.radial / 2), d.radial * 2), [0, 0, 0], [1.28, 0.62, 0.9], [Math.PI / 2, 0, 0])];
  const tiers = qualityCount(quality, 4, 7, 10);
  for (let i = 0; i < tiers; i += 1) parts.push(part(new THREE.TorusGeometry(0.18 + i * 0.045, 0.018, 4, d.radial * 2), [0, -0.16 + i * 0.075, 0], [1.35, 1, 0.82], [Math.PI / 2, 0, 0]));
  for (let i = 0; i < 6; i += 1) {
    const a = i / 6 * Math.PI * 2;
    parts.push(part(new THREE.BoxGeometry(1, 1, 1), [Math.cos(a) * 0.45, 0.22, Math.sin(a) * 0.34], [0.035, 0.46, 0.035], [0, -a, 0.26 * Math.cos(a)]));
  }
  return mergeAssembly(parts);
}

function createStadiumField(quality) {
  const parts = [part(chamferedBox(quality), [0, -0.42, 0], [0.92, 0.1, 0.72])];
  for (let i = 0; i < 6; i += 1) parts.push(part(new THREE.BoxGeometry(1, 1, 1), [0, -0.35, -0.3 + i * 0.12], [0.82, 0.02, 0.012]));
  return mergeAssembly(parts);
}

function createRoofGarden(quality) {
  const parts = [part(chamferedBox(quality), [0, -0.42, 0], [1, 0.1, 1])];
  for (let i = 0; i < 7; i += 1) {
    const a = i * 2.399;
    parts.push(part(deformedPolyhedron("high", i), [Math.cos(a) * 0.3, -0.2 + (i % 2) * 0.06, Math.sin(a) * 0.3], [0.18, 0.16, 0.18]));
  }
  parts.push(part(curvedRibbon(quality, 0.06), [0, -0.28, 0], [0.75, 0.2, 0.75]));
  return mergeAssembly(parts);
}

function createServiceCore(quality) {
  return mergeAssembly([
    part(chamferedBox(quality), [0, 0, 0], [0.72, 1, 0.72]),
    part(new THREE.BoxGeometry(1, 1, 1), [0, 0, 0.39], [0.28, 0.72, 0.05]),
    part(new THREE.BoxGeometry(1, 1, 1), [-0.38, 0, 0], [0.05, 0.82, 0.28]),
    part(new THREE.CylinderGeometry(0.08, 0.08, 0.2, detail(quality).radial), [0.2, 0.47, 0])
  ]);
}

function createPortico(quality) {
  const parts = [part(chamferedBox(quality), [0, 0.38, 0], [1, 0.18, 0.82])];
  for (const x of [-0.4, -0.13, 0.13, 0.4]) parts.push(part(new THREE.CylinderGeometry(0.045, 0.06, 1, 8), [x, -0.08, 0], [1, 0.82, 1]));
  parts.push(part(new THREE.BoxGeometry(1, 1, 1), [0, -0.48, 0], [1, 0.08, 0.9]));
  return mergeAssembly(parts);
}

function createLouverScreen(quality) {
  const bars = qualityCount(quality, 8, 14, 22);
  const parts = [];
  for (let i = 0; i < bars; i += 1) {
    const y = -0.45 + i * 0.9 / Math.max(1, bars - 1);
    parts.push(part(new THREE.BoxGeometry(1, 1, 1), [0, y, 0], [1, 0.045, 0.14], [0.28, 0, 0]));
  }
  for (const x of [-0.48, 0.48]) parts.push(part(new THREE.BoxGeometry(1, 1, 1), [x, 0, 0], [0.05, 1, 0.12]));
  return mergeAssembly(parts);
}

function createCoolingRack(quality) {
  const d = detail(quality);
  const parts = [part(chamferedBox(quality), [0, -0.35, 0], [1, 0.22, 0.9])];
  for (let i = 0; i < 4; i += 1) {
    const x = -0.36 + i * 0.24;
    parts.push(part(new THREE.CylinderGeometry(0.12, 0.12, 0.08, d.radial), [x, -0.17, 0], [1, 1, 1], [Math.PI / 2, 0, 0]));
    parts.push(part(new THREE.BoxGeometry(1, 1, 1), [x, 0.08, 0], [0.18, 0.46, 0.7]));
  }
  return mergeAssembly(parts);
}

function createGreenhouseBay(quality) {
  const d = detail(quality);
  const parts = [];
  for (let i = 0; i < d.bars; i += 1) {
    const z = -0.46 + i * 0.92 / Math.max(1, d.bars - 1);
    parts.push(part(curvedTube([[-0.48, -0.4, z], [-0.36, 0.2, z], [0, 0.48, z], [0.36, 0.2, z], [0.48, -0.4, z]], 0.025, d.curve)));
  }
  for (const x of [-0.48, 0, 0.48]) parts.push(part(new THREE.BoxGeometry(1, 1, 1), [x, -0.04, 0], [0.035, 0.08, 1]));
  return mergeAssembly(parts);
}

function createMarketAwning(quality) {
  const ribs = qualityCount(quality, 6, 10, 16);
  const parts = [part(curvedRibbon(quality, 0.1), [0, 0.16, 0], [1, 0.4, 1], [0.12, 0, 0])];
  for (let i = 0; i < ribs; i += 1) {
    const x = -0.46 + i * 0.92 / Math.max(1, ribs - 1);
    parts.push(part(new THREE.BoxGeometry(1, 1, 1), [x, 0.17, 0], [0.025, 0.08, 1], [0.12, 0, 0]));
  }
  for (const x of [-0.42, 0.42]) parts.push(part(new THREE.CylinderGeometry(0.03, 0.04, 1, 6), [x, -0.2, -0.36], [1, 0.62, 1]));
  return mergeAssembly(parts);
}

function createRetainingWall(quality) {
  const courses = qualityCount(quality, 5, 10, 16);
  const parts = [part(wedgeGeometry(), [0, 0, 0], [1, 1, 0.7], [0, Math.PI / 2, 0])];
  for (let y = 0; y < courses; y += 1) {
    const count = 5 + (y % 2);
    for (let x = 0; x < count; x += 1) {
      parts.push(part(chamferedBox("high"), [-0.45 + x * 0.9 / Math.max(1, count - 1), -0.42 + y * 0.14, 0.38], [0.16, 0.1, 0.08]));
    }
  }
  return mergeAssembly(parts);
}

function createQuarryBench(quality) {
  const steps = qualityCount(quality, 5, 8, 12);
  const parts = [];
  for (let i = 0; i < steps; i += 1) {
    const t = i / steps;
    parts.push(part(chamferedBox("high"), [-0.3 + t * 0.35, -0.42 + t * 0.72, 0], [1 - t * 0.45, 0.16, 1 - t * 0.25]));
  }
  for (let i = 0; i < 5; i += 1) parts.push(part(deformedPolyhedron("high", i), [-0.38 + i * 0.18, -0.38 + (i % 2) * 0.08, 0.38], [0.12, 0.12, 0.12]));
  return mergeAssembly(parts);
}

function createElectricalGantry(quality) {
  const parts = [];
  for (const x of [-0.42, 0.42]) {
    parts.push(part(new THREE.BoxGeometry(1, 1, 1), [x, 0, 0], [0.055, 1, 0.055]));
    parts.push(part(new THREE.BoxGeometry(1, 1, 1), [x, 0, 0], [0.035, 1.12, 0.035], [0, 0, 0.65]));
  }
  for (const y of [-0.34, 0.1, 0.42]) parts.push(part(new THREE.BoxGeometry(1, 1, 1), [0, y, 0], [0.9, 0.05, 0.05]));
  for (const x of [-0.3, 0, 0.3]) parts.push(part(new THREE.CylinderGeometry(0.04, 0.04, 0.26, 8), [x, 0.25, 0], [1, 1, 1], [Math.PI / 2, 0, 0]));
  return mergeAssembly(parts);
}

function createHelipad(quality) {
  const d = detail(quality);
  return mergeAssembly([
    part(new THREE.CylinderGeometry(0.5, 0.5, 0.14, d.radial * 2), [0, -0.34, 0]),
    part(new THREE.TorusGeometry(0.34, 0.035, 6, d.radial * 2), [0, -0.25, 0], [1, 1, 1], [Math.PI / 2, 0, 0]),
    part(new THREE.BoxGeometry(1, 1, 1), [-0.13, -0.23, 0], [0.07, 0.03, 0.5]),
    part(new THREE.BoxGeometry(1, 1, 1), [0.13, -0.23, 0], [0.07, 0.03, 0.5]),
    part(new THREE.BoxGeometry(1, 1, 1), [0, -0.23, 0], [0.28, 0.03, 0.07])
  ]);
}

function createPatternedSurface(quality, mode) {
  const parts = [part(chamferedBox(quality), [0, -0.44, 0], [1, 0.12, 1])];
  const count = qualityCount(quality, 5, 8, 13);
  for (let i = 0; i < count; i += 1) {
    const p = -0.4 + i * 0.8 / Math.max(1, count - 1);
    parts.push(part(new THREE.BoxGeometry(1, 1, 1), [p, -0.36, 0], [0.025, 0.025, 0.88]));
    if (mode !== "yard") parts.push(part(new THREE.BoxGeometry(1, 1, 1), [0, -0.36, p], [0.88, 0.025, 0.025]));
  }
  if (mode === "security") for (const x of [-0.36, 0, 0.36]) parts.push(part(new THREE.CylinderGeometry(0.035, 0.045, 0.34, 6), [x, -0.22, -0.36]));
  return mergeAssembly(parts);
}

function createCurbedBay(quality) {
  return mergeAssembly([
    part(chamferedBox(quality), [0, -0.42, 0], [1, 0.12, 1]),
    part(new THREE.BoxGeometry(1, 1, 1), [-0.46, -0.28, 0], [0.08, 0.2, 1]),
    part(new THREE.BoxGeometry(1, 1, 1), [0.46, -0.28, 0], [0.08, 0.2, 1]),
    part(new THREE.BoxGeometry(1, 1, 1), [0, -0.34, -0.22], [0.64, 0.025, 0.04]),
    part(new THREE.BoxGeometry(1, 1, 1), [0, -0.34, 0.22], [0.64, 0.025, 0.04])
  ]);
}

function createGardenCourt(quality) {
  const parts = [part(chamferedBox(quality), [0, -0.44, 0], [1, 0.12, 1])];
  for (const [x, z] of [[-0.34, -0.34], [0.34, -0.34], [-0.34, 0.34], [0.34, 0.34]]) {
    parts.push(part(new THREE.CylinderGeometry(0.13, 0.15, 0.15, detail(quality).radial), [x, -0.29, z]));
    parts.push(part(deformedPolyhedron("high", x + z), [x, -0.08, z], [0.2, 0.2, 0.2]));
  }
  parts.push(part(new THREE.TorusGeometry(0.18, 0.04, 6, detail(quality).radial), [0, -0.33, 0], [1, 1, 1], [Math.PI / 2, 0, 0]));
  return mergeAssembly(parts);
}

function createTrussTower(quality) {
  const levels = qualityCount(quality, 5, 8, 12);
  const parts = [];
  for (const [x, z] of [[-0.32, -0.28], [0.32, -0.28], [-0.32, 0.28], [0.32, 0.28]]) {
    parts.push(part(new THREE.BoxGeometry(1, 1, 1), [x, 0, z], [0.055, 1.1, 0.055], [z * 0.3, 0, -x * 0.3]));
  }
  for (let i = 0; i < levels; i += 1) {
    const y = -0.45 + i * 0.9 / Math.max(1, levels - 1);
    parts.push(part(new THREE.BoxGeometry(1, 1, 1), [0, y, -0.28], [0.68, 0.035, 0.035]));
    parts.push(part(new THREE.BoxGeometry(1, 1, 1), [0, y, 0.28], [0.68, 0.035, 0.035]));
    parts.push(part(new THREE.BoxGeometry(1, 1, 1), [0, y, 0], [0.04, 0.36, 0.04], [0, 0, Math.PI / 4]));
  }
  parts.push(part(new THREE.BoxGeometry(1, 1, 1), [0, 0.46, 0], [1, 0.08, 0.7]));
  return mergeAssembly(parts);
}

function createObservatoryDome(quality) {
  const d = detail(quality);
  const parts = [
    part(new THREE.CylinderGeometry(0.5, 0.5, 0.28, d.radial * 2), [0, -0.36, 0]),
    part(new THREE.SphereGeometry(0.5, d.radial * 2, d.radial, 0, Math.PI * 2, 0, Math.PI / 2), [0, -0.22, 0])
  ];
  for (let i = -2; i <= 2; i += 1) parts.push(part(new THREE.TorusGeometry(0.505, 0.012, 4, d.radial * 2, Math.PI), [0, -0.22, 0], [1, 1, 1], [Math.PI / 2, i * 0.25, 0]));
  parts.push(part(new THREE.BoxGeometry(1, 1, 1), [0.12, 0.05, 0.42], [0.18, 0.72, 0.08], [0.18, 0, 0]));
  return mergeAssembly(parts);
}

function createTelescopeMount(quality) {
  const d = detail(quality);
  return mergeAssembly([
    part(new THREE.CylinderGeometry(0.24, 0.32, 0.48, d.radial), [0, -0.25, 0]),
    part(new THREE.CylinderGeometry(0.18, 0.18, 0.86, d.radial), [0.12, 0.18, 0], [1, 1, 1], [0, 0, Math.PI / 2.6]),
    part(new THREE.TorusGeometry(0.23, 0.035, 6, d.radial), [-0.06, 0.12, 0], [1, 1, 1], [Math.PI / 2, 0, 0]),
    part(new THREE.CylinderGeometry(0.23, 0.16, 0.14, d.radial), [0.46, 0.38, 0], [1, 1, 1], [0, 0, Math.PI / 2.6])
  ]);
}

function createBraidedCable(quality) {
  const d = detail(quality);
  const parts = [];
  for (let i = 0; i < 3; i += 1) {
    const a = i / 3 * Math.PI * 2;
    parts.push(part(curvedTube([
      [Math.cos(a) * 0.09, -0.5, Math.sin(a) * 0.09],
      [Math.cos(a + 1.1) * 0.09, 0, Math.sin(a + 1.1) * 0.09],
      [Math.cos(a + 2.2) * 0.09, 0.5, Math.sin(a + 2.2) * 0.09]
    ], 0.035, d.curve)));
  }
  return mergeAssembly(parts);
}

function createStationPlatform(quality) {
  return mergeAssembly([
    part(chamferedBox(quality), [0, -0.38, 0], [1, 0.18, 1]),
    part(curvedRibbon(quality, 0.1), [0, 0.32, 0], [0.9, 0.25, 0.8]),
    part(new THREE.CylinderGeometry(0.035, 0.045, 1, 6), [-0.38, -0.04, -0.28], [1, 0.72, 1]),
    part(new THREE.CylinderGeometry(0.035, 0.045, 1, 6), [0.38, -0.04, -0.28], [1, 0.72, 1])
  ]);
}

function createIntakeGate(quality) {
  const bars = detail(quality).bars;
  const parts = [part(chamferedBox(quality), [0, 0, 0], [1, 1, 0.18])];
  for (let i = 0; i < bars; i += 1) {
    const x = -0.42 + i * 0.84 / Math.max(1, bars - 1);
    parts.push(part(new THREE.CylinderGeometry(0.026, 0.026, 0.8, 5), [x, 0, 0.12]));
  }
  parts.push(part(new THREE.BoxGeometry(1, 1, 1), [0, 0.42, 0.12], [1, 0.08, 0.2]));
  return mergeAssembly(parts);
}

function createIntakeGallery(quality) {
  const d = detail(quality);
  return mergeAssembly([
    part(new THREE.TorusGeometry(0.35, 0.12, Math.ceil(d.radial / 2), d.radial, Math.PI), [0, 0, 0], [1, 1, 1], [0, 0, Math.PI / 2]),
    part(new THREE.BoxGeometry(1, 1, 1), [0, -0.32, 0], [1, 0.18, 1]),
    part(createIntakeGate(quality), [0, 0, 0.38], [0.72, 0.72, 0.2])
  ]);
}

function createObservationDeck(quality) {
  const d = detail(quality);
  const parts = [part(new THREE.CylinderGeometry(0.5, 0.5, 0.16, d.radial * 2), [0, -0.36, 0])];
  for (let i = 0; i < d.bars; i += 1) {
    const a = i / d.bars * Math.PI * 2;
    parts.push(part(new THREE.CylinderGeometry(0.02, 0.025, 0.48, 5), [Math.cos(a) * 0.46, -0.06, Math.sin(a) * 0.46]));
  }
  parts.push(part(new THREE.TorusGeometry(0.46, 0.025, 5, d.radial * 2), [0, 0.18, 0], [1, 1, 1], [Math.PI / 2, 0, 0]));
  return mergeAssembly(parts);
}

function createTrailheadKiosk(quality) {
  return mergeAssembly([
    part(chamferedBox(quality), [0, -0.16, 0], [0.72, 0.64, 0.58]),
    part(createHippedRoofGeometry(quality), [0, 0.24, 0], [0.92, 0.28, 0.82]),
    part(new THREE.BoxGeometry(1, 1, 1), [0, -0.12, 0.31], [0.46, 0.34, 0.05]),
    part(new THREE.BoxGeometry(1, 1, 1), [-0.38, 0.02, 0], [0.06, 0.68, 0.66]),
    part(new THREE.BoxGeometry(1, 1, 1), [0.38, 0.02, 0], [0.06, 0.68, 0.66])
  ]);
}

function createTrailStrip(quality) {
  const parts = [part(curvedRibbon(quality, 0.08), [0, -0.42, 0], [1, 0.25, 1])];
  for (let i = 0; i < 7; i += 1) parts.push(part(deformedPolyhedron("high", i), [-0.42 + i * 0.14, -0.32, Math.sin(i * 1.7) * 0.24], [0.1, 0.06, 0.1]));
  return mergeAssembly(parts);
}

function createGaugeBoard(quality) {
  const parts = [part(chamferedBox(quality), [0, 0, 0], [0.34, 1, 0.12])];
  for (let i = 0; i < 9; i += 1) {
    const y = -0.42 + i * 0.105;
    parts.push(part(new THREE.BoxGeometry(1, 1, 1), [i % 2 ? 0.06 : 0, y, 0.08], [i % 2 ? 0.2 : 0.32, 0.018, 0.04]));
  }
  return mergeAssembly(parts);
}

function createServiceSign(quality) {
  return mergeAssembly([
    part(chamferedBox(quality), [0, 0.18, 0], [1, 0.56, 0.14]),
    part(new THREE.CylinderGeometry(0.035, 0.05, 0.62, 6), [-0.34, -0.3, 0]),
    part(new THREE.CylinderGeometry(0.035, 0.05, 0.62, 6), [0.34, -0.3, 0]),
    part(new THREE.BoxGeometry(1, 1, 1), [0, 0.18, 0.08], [0.62, 0.05, 0.04])
  ]);
}

function createPortApron(quality) {
  const parts = [part(chamferedBox(quality), [0, -0.4, 0], [1, 0.16, 1])];
  for (let i = 0; i < 5; i += 1) parts.push(part(new THREE.BoxGeometry(1, 1, 1), [-0.4 + i * 0.2, -0.3, 0], [0.025, 0.025, 0.92]));
  for (const x of [-0.36, 0, 0.36]) parts.push(part(new THREE.CylinderGeometry(0.05, 0.06, 0.2, 8), [x, -0.24, -0.36]));
  return mergeAssembly(parts);
}

function createCraneTower(quality) {
  const tower = createTrussTower(quality);
  tower.scale(0.68, 1, 0.68);
  return mergeAssembly([
    { geometry: tower },
    part(new THREE.CylinderGeometry(0.16, 0.16, 0.16, detail(quality).radial), [0, 0.45, 0]),
    part(new THREE.BoxGeometry(1, 1, 1), [0.3, 0.4, 0], [0.46, 0.18, 0.34])
  ]);
}

function createCraneBoom(quality) {
  const bays = qualityCount(quality, 6, 11, 18);
  const parts = [];
  for (const y of [-0.28, 0.28]) parts.push(part(new THREE.BoxGeometry(1, 1, 1), [0, y, 0], [1, 0.05, 0.05]));
  for (let i = 0; i <= bays; i += 1) {
    const x = -0.5 + i / bays;
    parts.push(part(new THREE.BoxGeometry(1, 1, 1), [x, 0, 0], [0.035, 0.62, 0.035], [0, 0, i % 2 ? 0.55 : -0.55]));
  }
  parts.push(part(new THREE.CylinderGeometry(0.025, 0.025, 0.72, 5), [0.4, -0.15, 0]));
  parts.push(part(new THREE.TorusGeometry(0.08, 0.025, 5, 10, Math.PI * 1.55), [0.4, -0.48, 0], [1, 1, 1], [0, 0, Math.PI / 2]));
  return mergeAssembly(parts);
}

function createWindbreak(quality) {
  const bars = qualityCount(quality, 9, 15, 24);
  const parts = [];
  for (let i = 0; i < bars; i += 1) {
    const x = -0.46 + i * 0.92 / Math.max(1, bars - 1);
    parts.push(part(curvedBlade(quality), [x, 0, 0], [0.07, 1, 0.22], [0, 0, i % 2 ? 0.08 : -0.08]));
  }
  parts.push(part(new THREE.BoxGeometry(1, 1, 1), [0, -0.48, 0], [1, 0.08, 0.28]));
  return mergeAssembly(parts);
}

function createFloodBase(quality) {
  const parts = [part(trapezoidPrism(), [0, -0.12, 0], [1, 0.72, 1])];
  for (const [x, z] of [[-0.34, -0.34], [0.34, -0.34], [-0.34, 0.34], [0.34, 0.34]]) parts.push(part(new THREE.CylinderGeometry(0.06, 0.09, 0.42, 8), [x, 0.3, z]));
  parts.push(part(chamferedBox(quality), [0, 0.42, 0], [0.86, 0.14, 0.86]));
  return mergeAssembly(parts);
}

function createFirebreak(quality) {
  const parts = [part(chamferedBox(quality), [0, -0.44, 0], [1, 0.12, 1])];
  const count = qualityCount(quality, 8, 14, 22);
  for (let i = 0; i < count; i += 1) parts.push(part(deformedPolyhedron("high", i), [-0.44 + i * 0.88 / Math.max(1, count - 1), -0.32, Math.sin(i * 2.2) * 0.28], [0.07, 0.05, 0.07]));
  return mergeAssembly(parts);
}

function createBioswale(quality) {
  const parts = [part(channelPrism(), [0, -0.16, 0])];
  for (let i = 0; i < 8; i += 1) {
    const x = -0.42 + i * 0.12;
    parts.push(part(curvedBlade(quality), [x, 0.03, (i % 2 ? 1 : -1) * 0.32], [0.08, 0.4, 0.08], [0, i, 0]));
  }
  return mergeAssembly(parts);
}

function createPlacementBeacon(quality) {
  const d = detail(quality);
  return mergeAssembly([
    part(new THREE.TorusGeometry(0.36, 0.05, 6, d.radial * 2), [0, -0.36, 0], [1, 1, 1], [Math.PI / 2, 0, 0]),
    part(new THREE.CylinderGeometry(0.04, 0.07, 0.72, 7), [0, 0, 0]),
    part(new THREE.OctahedronGeometry(0.22, quality === "exhaustive" ? 1 : 0), [0, 0.38, 0])
  ]);
}

function createWildlifeTorso(quality) {
  const body = organicEllipsoid(quality, 0.18);
  return mergeAssembly([
    part(body, [0, 0, 0], [1, 0.78, 0.74]),
    part(deformedPolyhedron("high", 1.8), [-0.36, 0.04, 0], [0.38, 0.48, 0.5]),
    part(deformedPolyhedron("high", 2.4), [0.32, 0.08, 0], [0.32, 0.42, 0.44])
  ]);
}

function createWildlifeHead(quality) {
  return mergeAssembly([
    part(organicEllipsoid(quality, 0.42), [0, 0, 0], [0.86, 1, 0.88]),
    part(deformedPolyhedron("high", 4.2), [0.28, -0.12, 0], [0.44, 0.42, 0.52]),
    part(new THREE.TorusGeometry(0.26, 0.025, 5, detail(quality).radial, Math.PI), [-0.05, 0.12, 0], [1, 1, 1], [Math.PI / 2, 0, Math.PI / 2])
  ]);
}

function createWildlifeMuzzle(quality) {
  const d = detail(quality);
  return mergeAssembly([
    part(organicEllipsoid(quality, 1.1), [0.08, 0, 0], [1, 0.66, 0.72]),
    part(new THREE.SphereGeometry(0.2, d.radial, Math.ceil(d.radial / 2)), [0.42, 0.02, 0], [0.72, 0.62, 0.76]),
    part(new THREE.TorusGeometry(0.16, 0.018, 4, d.radial, Math.PI), [0.2, -0.14, 0], [1, 0.5, 1], [Math.PI / 2, 0, Math.PI / 2])
  ]);
}

function createWildlifeEar(quality) {
  return mergeAssembly([
    part(leafGeometry(quality), [0, 0, 0], [0.72, 1, 0.48]),
    part(leafGeometry(quality), [0.02, -0.02, 0.035], [0.48, 0.72, 0.22])
  ]);
}

function createWildlifeEye(quality) {
  const d = detail(quality);
  return mergeAssembly([
    part(new THREE.SphereGeometry(0.42, d.radial, Math.ceil(d.radial / 2)), [0, 0, 0], [1, 1, 0.62]),
    part(new THREE.SphereGeometry(0.12, 8, 5), [0.16, 0.16, 0.23])
  ]);
}

function createWildlifeLegCluster(quality) {
  const parts = [];
  for (const [x, z, tilt] of [[-0.28, -0.28, -0.08], [0.28, -0.28, 0.08], [-0.28, 0.28, 0.08], [0.28, 0.28, -0.08]]) {
    parts.push(part(new THREE.CylinderGeometry(0.075, 0.1, 0.72, 7), [x, 0.08, z], [1, 1, 1], [tilt, 0, tilt]));
    parts.push(part(new THREE.CylinderGeometry(0.055, 0.07, 0.44, 7), [x + tilt, -0.3, z], [1, 1, 1], [-tilt * 2, 0, 0]));
    parts.push(part(clovenHoofGeometry(), [x + tilt * 1.3, -0.5, z], [0.22, 0.12, 0.28]));
  }
  return mergeAssembly(parts);
}

function createWildlifeLegPair(quality) {
  const parts = [];
  for (const [z, tilt] of [[-0.28, -0.07], [0.28, 0.07]]) {
    parts.push(part(new THREE.CylinderGeometry(0.09, 0.12, 0.72, 7), [0, 0.08, z], [1, 1, 1], [tilt, 0, tilt]));
    parts.push(part(new THREE.CylinderGeometry(0.06, 0.08, 0.44, 7), [tilt, -0.3, z], [1, 1, 1], [-tilt * 2, 0, 0]));
    parts.push(part(clovenHoofGeometry(), [tilt * 1.3, -0.5, z], [0.24, 0.12, 0.26]));
  }
  return mergeAssembly(parts);
}

function createWildlifeWing(quality) {
  const feathers = qualityCount(quality, 6, 10, 16);
  const parts = [part(wingMembraneGeometry(quality), [0, 0, 0])];
  for (let i = 0; i < feathers; i += 1) {
    const t = i / Math.max(1, feathers - 1);
    parts.push(part(featherGeometry(quality), [-0.1 + t * 0.5, -0.18 - t * 0.12, 0], [0.72 - t * 0.22, 0.72 + t * 0.24, 0.36], [0, 0, -0.45 + t * 0.5]));
  }
  return mergeAssembly(parts);
}

function createWildlifeNeck(quality) {
  return mergeAssembly([
    part(curvedTube([[0, -0.5, 0], [0.04, -0.12, 0], [0.16, 0.23, 0], [0.26, 0.5, 0]], 0.2, detail(quality).curve)),
    part(new THREE.TorusGeometry(0.22, 0.035, 5, detail(quality).radial), [0.1, 0.12, 0], [1, 1, 1], [Math.PI / 2, 0, 0])
  ]);
}

function createWildlifeBeak(quality) {
  return mergeAssembly([
    part(curvedWedgeGeometry(), [0, 0.08, 0], [1, 0.8, 0.8]),
    part(curvedWedgeGeometry(), [0, -0.13, 0], [0.88, 0.42, 0.7], [0, 0, Math.PI])
  ]);
}

function createWildlifeTalon(quality) {
  const parts = [];
  for (let i = 0; i < 4; i += 1) {
    const a = -0.6 + i * 0.4;
    parts.push(part(curvedTube([[0, 0.2, 0], [0.16, 0.02, Math.sin(a) * 0.12], [0.2, -0.28, Math.sin(a) * 0.18]], 0.05, detail(quality).curve), [0, 0, 0], [1, 1, 1], [0, a, 0]));
  }
  return mergeAssembly(parts);
}

function createWildlifeTail(quality, flat) {
  if (flat) return mergeAssembly([
    part(leafGeometry(quality), [0.08, 0, 0], [1, 0.78, 0.34], [0, 0, -Math.PI / 2]),
    part(curvedTube([[-0.5, 0, 0], [-0.3, 0.08, 0], [-0.12, 0.02, 0]], 0.1, detail(quality).curve))
  ]);
  return mergeAssembly([
    part(curvedTube([[-0.5, 0, 0], [-0.2, 0.16, 0], [0.18, 0.08, 0], [0.5, -0.06, 0]], 0.16, detail(quality).curve)),
    part(deformedPolyhedron("high", 5.4), [0.4, -0.03, 0], [0.28, 0.22, 0.22])
  ]);
}

function createWildlifeFeatherTail(quality) {
  const count = qualityCount(quality, 6, 10, 15);
  const parts = [];
  for (let i = 0; i < count; i += 1) {
    const a = -0.42 + i * 0.84 / Math.max(1, count - 1);
    parts.push(part(featherGeometry(quality), [0, 0, Math.sin(a) * 0.2], [1, 0.72, 0.42], [0, a, Math.PI / 2]));
  }
  return mergeAssembly(parts);
}

function createWildlifeAntler(quality) {
  const d = detail(quality);
  const parts = [part(curvedTube([[0, -0.5, 0], [0.05, -0.08, 0], [-0.08, 0.28, 0], [0, 0.5, 0]], 0.075, d.curve))];
  for (let i = 0; i < 4; i += 1) {
    const y = -0.18 + i * 0.2;
    parts.push(part(curvedTube([[0, y, 0], [0.18 + i * 0.035, y + 0.08, 0], [0.3 + i * 0.03, y + 0.24, 0]], 0.045, d.curve)));
  }
  return mergeAssembly(parts);
}

function createWildlifeHorn(quality) {
  const d = detail(quality);
  const profile = [new THREE.Vector2(0.22, -0.5), new THREE.Vector2(0.16, -0.1), new THREE.Vector2(0.08, 0.3), new THREE.Vector2(0, 0.5)];
  return mergeAssembly([
    { geometry: new THREE.LatheGeometry(profile, d.radial) },
    part(new THREE.TorusGeometry(0.17, 0.02, 4, d.radial), [0, -0.24, 0], [1, 1, 1], [Math.PI / 2, 0, 0]),
    part(new THREE.TorusGeometry(0.12, 0.018, 4, d.radial), [0, 0.04, 0], [1, 1, 1], [Math.PI / 2, 0, 0])
  ]);
}

function createWildlifeTusk(quality) {
  return mergeAssembly([
    part(curvedTube([[-0.45, 0.15, 0], [-0.12, -0.06, 0], [0.22, -0.05, 0], [0.48, 0.28, 0]], 0.11, detail(quality).curve)),
    part(new THREE.ConeGeometry(0.07, 0.22, detail(quality).radial), [0.5, 0.31, 0], [1, 1, 1], [0, 0, -0.75])
  ]);
}

function createWildlifeTrunk(quality) {
  return mergeAssembly([
    part(curvedTube([[-0.18, 0.5, 0], [0.04, 0.18, 0], [0.08, -0.2, 0], [0.28, -0.48, 0]], 0.16, detail(quality).curve)),
    part(new THREE.TorusGeometry(0.16, 0.035, 5, detail(quality).radial), [0.27, -0.47, 0], [1, 1, 1], [Math.PI / 2, 0, 0])
  ]);
}

function createWildlifeMane(quality) {
  const parts = [part(new THREE.TorusGeometry(0.34, 0.18, 8, detail(quality).radial * 2), [0, 0, 0], [1, 1, 0.72])];
  for (let i = 0; i < 10; i += 1) {
    const a = i / 10 * Math.PI * 2;
    parts.push(part(leafGeometry("high"), [Math.cos(a) * 0.4, Math.sin(a) * 0.4, 0], [0.18, 0.34, 0.12], [0, 0, -a]));
  }
  return mergeAssembly(parts);
}

function createRippledSurfaceGeometry(quality, amplitude) {
  const segments = detail(quality).surfaceSegments;
  const geometry = new THREE.PlaneGeometry(1, 1, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.getAttribute("position");
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    position.setY(i, Math.sin(x * 13 + z * 7) * amplitude + Math.sin(z * 19 - x * 5) * amplitude * 0.45);
  }
  return geometry;
}

function createChamferedBoxGeometry(quality, bevel = 0.06) {
  return chamferedBox(quality, bevel);
}

function chamferedBox(quality, bevel = 0.055) {
  const d = detail(quality);
  const b = Math.min(0.18, Math.max(0.01, bevel));
  const shape = new THREE.Shape();
  shape.moveTo(-0.5 + b, -0.5);
  shape.lineTo(0.5 - b, -0.5); shape.lineTo(0.5, -0.5 + b); shape.lineTo(0.5, 0.5 - b);
  shape.lineTo(0.5 - b, 0.5); shape.lineTo(-0.5 + b, 0.5); shape.lineTo(-0.5, 0.5 - b);
  shape.lineTo(-0.5, -0.5 + b); shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 1,
    steps: 1,
    curveSegments: Math.max(1, Math.ceil(d.bevelSegments / 2)),
    bevelEnabled: quality !== "high",
    bevelSegments: d.bevelSegments,
    bevelSize: quality === "high" ? 0 : b * 0.22,
    bevelThickness: quality === "high" ? 0 : b * 0.22
  });
  geometry.translate(0, 0, -0.5);
  return geometry;
}

function ringLoft(profile, radialSegments, twist) {
  const positions = [];
  const indices = [];
  for (let level = 0; level < profile.length; level += 1) {
    const [y, scale] = profile[level];
    for (let side = 0; side < radialSegments; side += 1) {
      const angle = side / radialSegments * Math.PI * 2 + level * twist;
      const facet = 1 + Math.sin(side * 2.13 + level * 0.7) * 0.035;
      positions.push(Math.cos(angle) * 0.5 * scale * facet, y, Math.sin(angle) * 0.5 * scale * facet);
    }
  }
  for (let level = 0; level < profile.length - 1; level += 1) {
    for (let side = 0; side < radialSegments; side += 1) {
      const next = (side + 1) % radialSegments;
      const a = level * radialSegments + side;
      const b = level * radialSegments + next;
      const c = (level + 1) * radialSegments + side;
      const e = (level + 1) * radialSegments + next;
      indices.push(a, c, b, b, c, e);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

function deformedPolyhedron(quality, phase = 0) {
  const geometry = new THREE.IcosahedronGeometry(0.5, detail(quality).organicSubdivision);
  const position = geometry.getAttribute("position");
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const ripple = 1 + Math.sin(x * 17 + y * 23 - z * 19 + phase) * 0.12;
    position.setXYZ(i, x * ripple * (1 + y * 0.08), y * ripple * 0.92, z * ripple * (1 - x * 0.06));
  }
  return geometry;
}

function deformedHemisphere(radial) {
  const geometry = new THREE.SphereGeometry(0.5, radial, Math.ceil(radial / 2), 0, Math.PI * 2, 0, Math.PI / 2);
  const position = geometry.getAttribute("position");
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    position.setXYZ(i, x * (1 + Math.sin(z * 13) * 0.08), y * (0.82 + Math.cos(x * 11) * 0.08), z);
  }
  return geometry;
}

function organicEllipsoid(quality, phase) {
  const geometry = new THREE.IcosahedronGeometry(0.5, detail(quality).organicSubdivision);
  const position = geometry.getAttribute("position");
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const muscle = 1 + Math.sin(x * 7 + phase) * 0.035 + Math.cos(y * 11 - z * 5) * 0.025;
    position.setXYZ(i, x * muscle, y * (muscle + x * 0.035), z * (muscle - y * 0.025));
  }
  return geometry;
}

function curvedTube(points, radius, tubularSegments) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, "centripetal");
  return new THREE.TubeGeometry(curve, Math.max(4, tubularSegments), radius, 7, false);
}

function curvedRibbon(quality, depth) {
  const points = [[-0.5, -0.36], [-0.34, -0.44], [-0.12, -0.36], [0.12, -0.44], [0.34, -0.34], [0.5, -0.4], [0.46, 0.35], [0.18, 0.43], [-0.1, 0.36], [-0.38, 0.44], [-0.5, 0.34]];
  return extrudedShape(points, depth, quality);
}

function curvedBlade(quality) {
  return extrudedShape([[-0.08, -0.5], [0.08, -0.5], [0.1, -0.18], [0.05, 0.18], [0.18, 0.5], [-0.02, 0.36], [-0.08, 0.05]], 0.035, quality);
}

function leafGeometry(quality) {
  return extrudedShape([[0, -0.5], [0.22, -0.2], [0.34, 0.1], [0.12, 0.42], [0, 0.5], [-0.14, 0.38], [-0.3, 0.08], [-0.2, -0.24]], 0.08, quality);
}

function featherGeometry(quality) {
  return extrudedShape([[-0.5, 0], [-0.24, -0.12], [0.28, -0.08], [0.5, 0], [0.24, 0.1], [-0.24, 0.13]], 0.05, quality);
}

function wingMembraneGeometry(quality) {
  return extrudedShape([[-0.5, 0], [-0.22, -0.18], [0.12, -0.32], [0.48, -0.2], [0.36, 0.08], [0.08, 0.36], [-0.34, 0.44]], 0.06, quality);
}

function airfoilBlade(quality) {
  return extrudedShape([[-0.5, -0.05], [-0.22, -0.1], [0.18, -0.07], [0.5, 0.02], [0.22, 0.12], [-0.34, 0.08]], 0.08, quality);
}

function curvedWedgeGeometry() {
  return extrudedShape([[-0.5, -0.18], [0.12, -0.12], [0.5, 0.02], [0.18, 0.18], [-0.42, 0.14]], 0.42, "ultra");
}

function ridgedStrip(quality) {
  return extrudedShape([[-0.5, -0.36], [-0.42, 0.12], [-0.22, 0.42], [0, 0.5], [0.22, 0.42], [0.42, 0.12], [0.5, -0.36]], 1, quality);
}

function extrudedShape(points, depth, quality) {
  const d = detail(quality);
  const shape = new THREE.Shape();
  points.forEach(([x, y], index) => index ? shape.lineTo(x, y) : shape.moveTo(x, y));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    curveSegments: Math.max(1, d.bevelSegments),
    bevelEnabled: quality !== "high",
    bevelSegments: d.bevelSegments,
    bevelSize: quality === "high" ? 0 : Math.min(0.025, depth * 0.18),
    bevelThickness: quality === "high" ? 0 : Math.min(0.025, depth * 0.18)
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

function wedgeRoofGeometry() {
  const vertices = new Float32Array([
    -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5,
    -0.22, 0.5, 0, 0.22, 0.5, 0
  ]);
  const indices = [0, 1, 2, 0, 2, 3, 0, 4, 5, 0, 5, 1, 3, 2, 5, 3, 5, 4, 0, 3, 4, 1, 5, 2];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  return geometry;
}

function wedgeGeometry() {
  const p = [
    -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5,
    -0.28, 0.5, -0.5, 0.28, 0.5, -0.5, 0.28, 0.5, 0.5, -0.28, 0.5, 0.5
  ];
  const f = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 3, 2, 6, 3, 6, 7, 0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  geometry.setIndex(f);
  return geometry;
}

function trapezoidPrism() {
  const geometry = wedgeGeometry();
  geometry.scale(1, 1, 0.72);
  return geometry;
}

function channelPrism() {
  return extrudedShape([[-0.5, 0.4], [-0.34, -0.36], [-0.18, -0.5], [0.18, -0.5], [0.34, -0.36], [0.5, 0.4], [0.34, 0.46], [0.16, -0.3], [-0.16, -0.3], [-0.34, 0.46]], 1, "ultra");
}

function crownedPrism() {
  return extrudedShape([[-0.5, -0.18], [-0.46, 0.12], [0, 0.24], [0.46, 0.12], [0.5, -0.18]], 1, "ultra");
}

function clovenHoofGeometry() {
  return mergeAssembly([
    part(wedgeGeometry(), [0, 0, -0.18], [1, 1, 0.42]),
    part(wedgeGeometry(), [0, 0, 0.18], [1, 1, 0.42])
  ]);
}

function part(geometry, position = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0]) {
  return { geometry, position, scale, rotation };
}

function mergeAssembly(parts) {
  const chunks = [];
  let vertexCount = 0;
  let indexCount = 0;
  for (const entry of parts) {
    if (!entry?.geometry?.getAttribute("position")) continue;
    const source = entry.geometry.clone();
    const object = new THREE.Object3D();
    object.position.fromArray(entry.position || [0, 0, 0]);
    object.scale.fromArray(entry.scale || [1, 1, 1]);
    object.rotation.fromArray(entry.rotation || [0, 0, 0]);
    object.updateMatrix();
    source.applyMatrix4(object.matrix);
    chunks.push(source);
    vertexCount += source.getAttribute("position").count;
    indexCount += source.index?.count ?? source.getAttribute("position").count;
    entry.geometry.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  const attributes = { position: 3 };
  if (chunks.some(source => source.hasAttribute("uv"))) attributes.uv = 2;
  if (chunks.some(source => source.hasAttribute("color"))) attributes.color = 3;
  for (const [name, size] of Object.entries(attributes)) {
    const values = new Float32Array(vertexCount * size);
    if (name === "color") values.fill(1);
    let offset = 0;
    for (const source of chunks) {
      const attribute = source.getAttribute(name);
      if (attribute) values.set(attribute.array, offset * size);
      offset += source.getAttribute("position").count;
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(values, size));
  }
  // Keep source vertex sharing and hard-edge splits instead of expanding triangles.
  const indices = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  let vertexOffset = 0, indexOffset = 0;
  for (const source of chunks) {
    const count = source.getAttribute("position").count;
    for (let i = 0; i < (source.index?.count ?? count); i++) {
      indices[indexOffset++] = vertexOffset + (source.index ? source.index.getX(i) : i);
    }
    vertexOffset += count;
    source.dispose();
  }
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
}

function applyProceduralVariant(geometry, kind, quality, variant) {
  if (!geometry?.getAttribute("position")) return geometry;
  const count = Math.max(0, Math.floor(Number(variant) || 0));
  if (count === 0) return geometry;
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  const height = Math.max(1e-6, (bounds?.max.y ?? 0.5) - (bounds?.min.y ?? -0.5));
  const minY = bounds?.min.y ?? -0.5;
  const position = geometry.getAttribute("position");
  const materialClass = proceduralMaterialClass(kind);
  const phase = count * 1.61803398875 + String(kind).length * 0.173;
  const qualityGain = quality === "exhaustive" ? 1 : quality === "ultra" ? 0.72 : 0.45;
  for (let i = 0; i < position.count; i += 1) {
    let x = position.getX(i);
    let y = position.getY(i);
    let z = position.getZ(i);
    const normalizedY = Math.max(0, Math.min(1, (y - minY) / height));
    const field = Math.sin(x * 11.7 + z * 7.9 + y * 5.3 + phase) * 0.6
      + Math.cos(z * 13.1 - x * 4.7 + phase * 0.7) * 0.4;
    if (materialClass === "organic" || materialClass === "wildlife" || materialClass === "mineral") {
      const amplitude = (materialClass === "mineral" ? 0.045 : 0.032) * qualityGain;
      const radial = 1 + field * amplitude + Math.sin(normalizedY * Math.PI + phase) * amplitude * 0.55;
      x *= radial * (1 + count * 0.006);
      z *= radial * (1 - count * 0.004);
      y = minY + (y - minY) * (1 + Math.sin(phase) * 0.018) + field * amplitude * 0.12;
    } else if (materialClass === "water") {
      y += field * 0.009 * qualityGain;
    } else if (materialClass === "masonry") {
      const taper = 1 + (normalizedY - 0.5) * Math.sin(phase) * 0.025;
      const twist = (normalizedY - 0.5) * Math.cos(phase) * 0.022;
      const cos = Math.cos(twist);
      const sin = Math.sin(twist);
      const rotatedX = (x * cos - z * sin) * taper;
      z = (x * sin + z * cos) * (2 - taper);
      x = rotatedX;
    } else {
      x *= 1 + Math.sin(phase) * 0.012;
      z *= 1 + Math.cos(phase) * 0.012;
    }
    position.setXYZ(i, x, y, z);
  }
  position.needsUpdate = true;
  geometry.deleteAttribute("normal");
  return geometry;
}

function tagProceduralGeometry(geometry, kind, quality, variant) {
  geometry.type = `GeoLab${kind.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("")}Geometry`;
  geometry.userData.proceduralKind = kind;
  geometry.userData.assetPipelineVersion = 3;
  geometry.userData.quality = quality;
  geometry.userData.variant = variant;
  geometry.userData.vertexCount = geometry.getAttribute("position")?.count || 0;
  geometry.userData.triangleCount = geometry.index
    ? Math.floor(geometry.index.count / 3)
    : Math.floor((geometry.getAttribute("position")?.count || 0) / 3);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
