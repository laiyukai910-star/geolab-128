export const WILDLIFE_SPECIES = Object.freeze([
  species("red_deer", "马鹿", "ungulate", 0x9b704c, 1.05, {
    guild: "large-herbivore", density: 0.72, growth: 0.2, elevation: [900, 2400], slope: [0.28, 0.42],
    vegetation: [0.68, 0.46], wetness: [0.42, 0.42], roughness: [0.34, 0.52], temperature: [9, 18],
    humanTolerance: 0.22, aquaticAffinity: 0.08, movementKmPerDay: 5.2
  }),
  species("wild_boar", "野猪", "boar", 0x765844, 0.82, {
    guild: "omnivore", density: 1.15, growth: 0.34, elevation: [620, 2300], slope: [0.2, 0.48],
    vegetation: [0.58, 0.52], wetness: [0.58, 0.42], roughness: [0.26, 0.56], temperature: [14, 20],
    humanTolerance: 0.46, aquaticAffinity: 0.16, movementKmPerDay: 3.4
  }),
  species("blue_sheep", "岩羊", "ungulate", 0x9a927f, 0.82, {
    guild: "mountain-herbivore", density: 0.34, growth: 0.16, elevation: [2850, 3000], slope: [0.7, 0.34],
    vegetation: [0.26, 0.48], wetness: [0.18, 0.38], roughness: [0.72, 0.36], temperature: [3, 17],
    humanTolerance: 0.16, aquaticAffinity: 0.02, movementKmPerDay: 4.1
  }),
  species("gray_wolf", "灰狼", "canid", 0x727678, 0.92, {
    guild: "apex-predator", density: 0.075, growth: 0.1, elevation: [1250, 3200], slope: [0.42, 0.52],
    vegetation: [0.52, 0.56], wetness: [0.34, 0.48], roughness: [0.46, 0.52], temperature: [5, 20],
    humanTolerance: 0.08, aquaticAffinity: 0.05, movementKmPerDay: 12.5, preyDependent: true
  }),
  species("brown_bear", "棕熊", "bear", 0x6b5140, 1.25, {
    guild: "large-omnivore", density: 0.042, growth: 0.07, elevation: [1050, 2800], slope: [0.38, 0.5],
    vegetation: [0.74, 0.42], wetness: [0.48, 0.44], roughness: [0.42, 0.5], temperature: [7, 18],
    humanTolerance: 0.07, aquaticAffinity: 0.12, movementKmPerDay: 8.5
  }),
  species("red_fox", "赤狐", "canid", 0xb36d42, 0.55, {
    guild: "mesopredator", density: 0.24, growth: 0.26, elevation: [850, 3300], slope: [0.34, 0.62],
    vegetation: [0.46, 0.62], wetness: [0.3, 0.54], roughness: [0.34, 0.62], temperature: [10, 23],
    humanTolerance: 0.48, aquaticAffinity: 0.04, movementKmPerDay: 6.4
  }),
  species("river_otter", "水獭", "semi-aquatic", 0x574f47, 0.62, {
    guild: "riparian-predator", density: 0.12, growth: 0.15, elevation: [420, 2300], slope: [0.16, 0.42],
    vegetation: [0.5, 0.58], wetness: [0.84, 0.3], roughness: [0.2, 0.5], temperature: [12, 22],
    humanTolerance: 0.12, aquaticAffinity: 0.92, flowAffinity: 0.88, movementKmPerDay: 7.2
  }),
  species("wetland_crane", "湿地鹤", "bird", 0xe3ddd0, 0.9, {
    guild: "wetland-bird", density: 0.16, growth: 0.14, elevation: [280, 1800], slope: [0.08, 0.32],
    vegetation: [0.48, 0.56], wetness: [0.82, 0.34], roughness: [0.12, 0.42], temperature: [13, 20],
    humanTolerance: 0.1, aquaticAffinity: 0.72, flowAffinity: 0.56, movementKmPerDay: 18
  }),
  species("golden_eagle", "金雕", "raptor", 0x8f7142, 0.78, {
    guild: "aerial-predator", density: 0.026, growth: 0.08, elevation: [2450, 3500], slope: [0.72, 0.34],
    vegetation: [0.26, 0.54], wetness: [0.14, 0.42], roughness: [0.76, 0.34], temperature: [4, 19],
    humanTolerance: 0.08, aquaticAffinity: 0.01, movementKmPerDay: 38, preyDependent: true
  }),
  species("mountain_hare", "山兔", "small-mammal", 0xb9aa94, 0.48, {
    guild: "small-herbivore", density: 1.65, growth: 0.42, elevation: [1550, 3200], slope: [0.38, 0.58],
    vegetation: [0.52, 0.58], wetness: [0.26, 0.5], roughness: [0.38, 0.58], temperature: [4, 21],
    humanTolerance: 0.32, aquaticAffinity: 0.01, movementKmPerDay: 2.1
  }),
  species("siberian_tiger", "东北虎", "feline", 0xb56c35, 1.16, {
    guild: "apex-predator", density: 0.018, growth: 0.055, elevation: [760, 1800], slope: [0.32, 0.5],
    vegetation: [0.76, 0.34], wetness: [0.45, 0.4], roughness: [0.36, 0.46], temperature: [5, 16],
    humanTolerance: 0.025, aquaticAffinity: 0.04, movementKmPerDay: 18, preyDependent: true,
    preyIds: ["red_deer", "wild_boar"], regions: ["east_asia_monsoon"]
  }),
  species("giant_panda", "大熊猫", "bear", 0xd9d7ce, 0.86, {
    guild: "specialist-herbivore", density: 0.055, growth: 0.085, elevation: [1850, 1200], slope: [0.44, 0.42],
    vegetation: [0.88, 0.22], wetness: [0.64, 0.3], roughness: [0.42, 0.4], temperature: [10, 11],
    humanTolerance: 0.08, aquaticAffinity: 0.02, movementKmPerDay: 1.8, regions: ["east_asia_monsoon"]
  }),
  species("snow_leopard", "雪豹", "feline", 0xa9a293, 0.82, {
    guild: "apex-predator", density: 0.012, growth: 0.05, elevation: [3900, 1600], slope: [0.8, 0.24],
    vegetation: [0.18, 0.36], wetness: [0.18, 0.3], roughness: [0.84, 0.24], temperature: [-1, 13],
    humanTolerance: 0.02, aquaticAffinity: 0.01, movementKmPerDay: 14, preyDependent: true,
    preyIds: ["blue_sheep", "yak", "mountain_hare"], regions: ["central_asia_steppe", "south_asia_foreland"]
  }),
  species("yak", "野牦牛", "bovine", 0x65584a, 1.18, {
    guild: "large-herbivore", density: 0.24, growth: 0.13, elevation: [3800, 1600], slope: [0.55, 0.36],
    vegetation: [0.34, 0.42], wetness: [0.24, 0.4], roughness: [0.58, 0.38], temperature: [1, 12],
    humanTolerance: 0.12, aquaticAffinity: 0.02, movementKmPerDay: 4.8, regions: ["central_asia_steppe", "south_asia_foreland"]
  }),
  species("saiga", "赛加羚羊", "ungulate", 0xc5aa7a, 0.68, {
    guild: "grazer", density: 0.62, growth: 0.28, elevation: [720, 1200], slope: [0.12, 0.3],
    vegetation: [0.38, 0.34], wetness: [0.16, 0.28], roughness: [0.18, 0.3], temperature: [10, 22],
    humanTolerance: 0.2, aquaticAffinity: 0.01, movementKmPerDay: 18, regions: ["central_asia_steppe"]
  }),
  species("asian_elephant", "亚洲象", "elephant", 0x85857f, 1.48, {
    guild: "megaherbivore", density: 0.035, growth: 0.045, elevation: [520, 900], slope: [0.14, 0.28],
    vegetation: [0.84, 0.28], wetness: [0.72, 0.32], roughness: [0.2, 0.34], temperature: [25, 8],
    humanTolerance: 0.06, aquaticAffinity: 0.18, movementKmPerDay: 7.5,
    regions: ["south_asia_foreland", "southeast_asia_archipelago"]
  }),
  species("great_hornbill", "大犀鸟", "bird", 0xd1a742, 0.7, {
    guild: "frugivore", density: 0.11, growth: 0.12, elevation: [820, 950], slope: [0.28, 0.4],
    vegetation: [0.92, 0.2], wetness: [0.72, 0.28], roughness: [0.32, 0.4], temperature: [26, 6],
    humanTolerance: 0.08, aquaticAffinity: 0.02, movementKmPerDay: 24, regions: ["southeast_asia_archipelago"]
  }),
  species("european_bison", "欧洲野牛", "bovine", 0x766554, 1.26, {
    guild: "large-herbivore", density: 0.16, growth: 0.12, elevation: [780, 1100], slope: [0.24, 0.4],
    vegetation: [0.7, 0.38], wetness: [0.42, 0.38], roughness: [0.3, 0.42], temperature: [10, 15],
    humanTolerance: 0.14, aquaticAffinity: 0.04, movementKmPerDay: 5.8, regions: ["europe_alpine"]
  }),
  species("eurasian_lynx", "欧亚猞猁", "feline", 0xa18c6f, 0.7, {
    guild: "mesopredator", density: 0.045, growth: 0.1, elevation: [1300, 1500], slope: [0.42, 0.44],
    vegetation: [0.76, 0.34], wetness: [0.38, 0.4], roughness: [0.46, 0.44], temperature: [7, 17],
    humanTolerance: 0.08, aquaticAffinity: 0.02, movementKmPerDay: 9, preyDependent: true,
    preyIds: ["mountain_hare", "red_deer"], regions: ["europe_alpine", "central_asia_steppe", "east_asia_monsoon"]
  }),
  species("beaver", "河狸", "semi-aquatic", 0x765c45, 0.72, {
    guild: "ecosystem-engineer", density: 0.18, growth: 0.17, elevation: [620, 1300], slope: [0.12, 0.28],
    vegetation: [0.7, 0.38], wetness: [0.9, 0.18], roughness: [0.2, 0.38], temperature: [9, 16],
    humanTolerance: 0.14, aquaticAffinity: 0.88, flowAffinity: 0.64, movementKmPerDay: 3.2,
    regions: ["europe_alpine", "north_america_cordillera", "arctic_tundra"]
  }),
  species("moose", "驼鹿", "ungulate", 0x6e5c49, 1.32, {
    guild: "large-herbivore", density: 0.12, growth: 0.11, elevation: [850, 1300], slope: [0.24, 0.4],
    vegetation: [0.72, 0.38], wetness: [0.62, 0.34], roughness: [0.3, 0.42], temperature: [4, 16],
    humanTolerance: 0.1, aquaticAffinity: 0.12, movementKmPerDay: 6.6,
    regions: ["north_america_cordillera", "europe_alpine", "arctic_tundra"]
  }),
  species("american_bison", "美洲野牛", "bovine", 0x6d5540, 1.3, {
    guild: "grazer", density: 0.24, growth: 0.16, elevation: [1100, 1450], slope: [0.18, 0.36],
    vegetation: [0.48, 0.38], wetness: [0.28, 0.34], roughness: [0.24, 0.36], temperature: [10, 19],
    humanTolerance: 0.16, aquaticAffinity: 0.02, movementKmPerDay: 8.2, regions: ["north_america_cordillera"]
  }),
  species("capybara", "水豚", "semi-aquatic", 0x8d6f4e, 0.78, {
    guild: "riparian-herbivore", density: 0.52, growth: 0.3, elevation: [340, 700], slope: [0.08, 0.24],
    vegetation: [0.7, 0.36], wetness: [0.88, 0.2], roughness: [0.14, 0.28], temperature: [26, 7],
    humanTolerance: 0.24, aquaticAffinity: 0.78, flowAffinity: 0.5, movementKmPerDay: 2.8,
    regions: ["south_america_andes_amazon"]
  }),
  species("jaguar", "美洲豹", "feline", 0xc58b3d, 0.94, {
    guild: "apex-predator", density: 0.022, growth: 0.06, elevation: [780, 1000], slope: [0.3, 0.42],
    vegetation: [0.9, 0.22], wetness: [0.72, 0.3], roughness: [0.34, 0.42], temperature: [25, 7],
    humanTolerance: 0.03, aquaticAffinity: 0.12, movementKmPerDay: 12, preyDependent: true,
    preyIds: ["capybara", "wild_boar"], regions: ["south_america_andes_amazon"]
  }),
  species("andean_condor", "安第斯神鹫", "raptor", 0x494844, 1.02, {
    guild: "aerial-scavenger", density: 0.018, growth: 0.055, elevation: [3300, 1700], slope: [0.76, 0.28],
    vegetation: [0.22, 0.42], wetness: [0.18, 0.34], roughness: [0.78, 0.26], temperature: [5, 16],
    humanTolerance: 0.09, aquaticAffinity: 0.01, movementKmPerDay: 58, regions: ["south_america_andes_amazon", "south_america_patagonia"]
  }),
  species("african_lion", "非洲狮", "feline", 0xc49a58, 1.08, {
    guild: "apex-predator", density: 0.028, growth: 0.075, elevation: [820, 1200], slope: [0.16, 0.34],
    vegetation: [0.44, 0.38], wetness: [0.24, 0.34], roughness: [0.22, 0.36], temperature: [25, 8],
    humanTolerance: 0.04, aquaticAffinity: 0.02, movementKmPerDay: 14, preyDependent: true,
    preyIds: ["zebra", "giraffe"], regions: ["africa_rift_savanna"]
  }),
  species("african_elephant", "非洲象", "elephant", 0x8b8980, 1.58, {
    guild: "megaherbivore", density: 0.045, growth: 0.04, elevation: [720, 1300], slope: [0.14, 0.3],
    vegetation: [0.56, 0.42], wetness: [0.46, 0.4], roughness: [0.2, 0.34], temperature: [26, 9],
    humanTolerance: 0.04, aquaticAffinity: 0.12, movementKmPerDay: 9, regions: ["africa_rift_savanna"]
  }),
  species("zebra", "平原斑马", "ungulate", 0xd9d4c7, 0.92, {
    guild: "grazer", density: 0.7, growth: 0.24, elevation: [880, 1250], slope: [0.16, 0.32],
    vegetation: [0.46, 0.36], wetness: [0.28, 0.34], roughness: [0.2, 0.32], temperature: [25, 8],
    humanTolerance: 0.16, aquaticAffinity: 0.02, movementKmPerDay: 12, regions: ["africa_rift_savanna"]
  }),
  species("giraffe", "长颈鹿", "giraffe", 0xc99a58, 1.42, {
    guild: "browser", density: 0.18, growth: 0.13, elevation: [920, 1200], slope: [0.14, 0.3],
    vegetation: [0.58, 0.38], wetness: [0.24, 0.34], roughness: [0.2, 0.34], temperature: [26, 8],
    humanTolerance: 0.12, aquaticAffinity: 0.01, movementKmPerDay: 8.5, regions: ["africa_rift_savanna"]
  }),
  species("red_kangaroo", "红大袋鼠", "marsupial", 0xaa6545, 0.9, {
    guild: "grazer", density: 0.48, growth: 0.27, elevation: [680, 1300], slope: [0.22, 0.4],
    vegetation: [0.36, 0.38], wetness: [0.18, 0.3], roughness: [0.28, 0.4], temperature: [23, 11],
    humanTolerance: 0.34, aquaticAffinity: 0.01, movementKmPerDay: 7.8, regions: ["australia_interior_coast"]
  }),
  species("cassowary", "食火鸡", "bird", 0x343d3d, 0.98, {
    guild: "frugivore", density: 0.07, growth: 0.09, elevation: [520, 750], slope: [0.24, 0.4],
    vegetation: [0.9, 0.2], wetness: [0.7, 0.28], roughness: [0.3, 0.42], temperature: [25, 7],
    humanTolerance: 0.08, aquaticAffinity: 0.02, movementKmPerDay: 3.6, regions: ["australia_interior_coast", "oceania_volcanic_arc"]
  }),
  species("emperor_penguin", "帝企鹅", "penguin", 0xd9ddd8, 0.84, {
    guild: "marine-predator", density: 0.34, growth: 0.12, elevation: [80, 240], slope: [0.05, 0.2],
    vegetation: [0.02, 0.08], wetness: [0.8, 0.3], roughness: [0.12, 0.28], temperature: [-9, 8],
    humanTolerance: 0.04, aquaticAffinity: 0.86, flowAffinity: 0.34, movementKmPerDay: 10, regions: ["antarctica_plateau"]
  }),
  species("arctic_seal", "环斑海豹", "semi-aquatic", 0x9b9a91, 0.88, {
    guild: "marine-predator", density: 0.14, growth: 0.1, elevation: [90, 220], slope: [0.05, 0.18],
    vegetation: [0.03, 0.1], wetness: [0.9, 0.16], roughness: [0.1, 0.22], temperature: [-5, 9],
    humanTolerance: 0.035, aquaticAffinity: 0.94, flowAffinity: 0.28, movementKmPerDay: 16, regions: ["arctic_tundra"]
  }),
  species("reindeer", "驯鹿", "ungulate", 0x8a755d, 0.98, {
    guild: "large-herbivore", density: 0.38, growth: 0.2, elevation: [720, 1200], slope: [0.22, 0.38],
    vegetation: [0.26, 0.36], wetness: [0.34, 0.38], roughness: [0.28, 0.4], temperature: [-2, 13],
    humanTolerance: 0.18, aquaticAffinity: 0.02, movementKmPerDay: 16, regions: ["arctic_tundra"]
  }),
  species("polar_bear", "北极熊", "bear", 0xe5e2d5, 1.38, {
    guild: "apex-predator", density: 0.008, growth: 0.035, elevation: [140, 320], slope: [0.08, 0.24],
    vegetation: [0.04, 0.12], wetness: [0.78, 0.3], roughness: [0.14, 0.28], temperature: [-7, 9],
    humanTolerance: 0.015, aquaticAffinity: 0.72, flowAffinity: 0.24, movementKmPerDay: 22,
    preyDependent: true, preyIds: ["arctic_seal"], regions: ["arctic_tundra"]
  }),
  species("albatross", "信天翁", "bird", 0xe6e4dc, 0.82, {
    guild: "marine-bird", density: 0.08, growth: 0.07, elevation: [120, 260], slope: [0.08, 0.24],
    vegetation: [0.16, 0.24], wetness: [0.78, 0.3], roughness: [0.16, 0.3], temperature: [14, 13],
    humanTolerance: 0.06, aquaticAffinity: 0.76, flowAffinity: 0.3, movementKmPerDay: 82,
    regions: ["oceania_volcanic_arc", "south_america_patagonia", "antarctica_plateau"]
  })
]);

export const ECOSYSTEM_GUILDS = Object.freeze([
  Object.freeze({ id: "primary-producers", labelZh: "初级生产者", process: "植被生产与碳固定" }),
  Object.freeze({ id: "pollinators-dispersers", labelZh: "传粉与种子扩散者", process: "植物更新与斑块连通" }),
  Object.freeze({ id: "decomposers", labelZh: "分解者", process: "枯落物分解与养分循环" }),
  Object.freeze({ id: "herbivores", labelZh: "草食动物", process: "植被摄食与种群传递" }),
  Object.freeze({ id: "predators", labelZh: "捕食者", process: "营养级调控" }),
  Object.freeze({ id: "ecosystem-engineers", labelZh: "生态系统工程师", process: "水文与栖息地结构改造" }),
  Object.freeze({ id: "aquatic-riparian", labelZh: "水生与滨岸群落", process: "河岸交换与水域食物链" })
]);

export function buildLandscapeBlockNetwork(model, params = {}, options = {}) {
  if (!model?.height?.length || !model.n) throw new Error("A computed terrain model is required for landscape blocks");
  const n = model.n;
  const requestedGrid = integer(options.gridSize ?? params.landscapeBlockGrid ?? 24, 4, Math.min(48, n), 24);
  const blockCellSize = Math.max(1, Math.ceil(n / requestedGrid));
  const gridSize = Math.ceil(n / blockCellSize);
  const blockCount = gridSize * gridSize;
  const cellAreaKm2 = model.cellSizeKm * model.cellSizeKm;
  const seaLevel = finite(params.seaLevel, 0);
  const accumulators = Array.from({ length: blockCount }, (_, blockId) => createBlockAccumulator(blockId, gridSize));
  const flowAccumulation = model.flowAccumulation || [];
  let maxFlow = 1;
  for (let i = 0; i < flowAccumulation.length; i += 1) maxFlow = Math.max(maxFlow, finite(flowAccumulation[i], 0));
  const flowDenominator = Math.log1p(maxFlow);
  const hazards = model.hazards || {};
  const currentFlood = hazards.currentFloodHazard || hazards.floodHazard || [];
  const currentDrought = hazards.currentDroughtStress || hazards.droughtStress || [];
  const currentWildfire = hazards.currentWildfireRisk || hazards.wildfireRisk || [];
  const currentLandslide = hazards.currentLandslideRisk || hazards.landslideRisk || [];
  const currentHazard = hazards.currentHazardIndex || hazards.hazardIndex || [];

  for (let y = 0; y < n; y += 1) {
    const by = Math.min(gridSize - 1, Math.floor(y / blockCellSize));
    for (let x = 0; x < n; x += 1) {
      const bx = Math.min(gridSize - 1, Math.floor(x / blockCellSize));
      const i = y * n + x;
      const block = accumulators[by * gridSize + bx];
      const elevation = finite(model.height[i], 0);
      const land = elevation > seaLevel ? 1 : 0;
      const vegetation = clamp01(model.surface?.vegetation?.[i]);
      const wetness = clamp01(finite(model.wetnessIndex?.[i], 0) / 16);
      const flow = clamp01(Math.log1p(Math.max(0, finite(flowAccumulation[i], 0))) / flowDenominator);
      const roughness = Math.max(0, finite(model.terrainDiagnostics?.roughness?.[i], 0));
      block.cellCount += 1;
      block.landCellCount += land;
      block.elevationSum += elevation;
      block.minElevationM = Math.min(block.minElevationM, elevation);
      block.maxElevationM = Math.max(block.maxElevationM, elevation);
      block.slopeSum += finite(model.slope?.[i], 0);
      block.roughnessSum += roughness;
      block.wetnessSum += wetness;
      block.flowSum += flow;
      block.vegetationSum += vegetation;
      block.canopySum += Math.max(0, finite(model.surface?.canopyHeight?.[i], 0));
      block.temperatureSum += finite(model.temperature?.[i], 12);
      block.precipitationSum += Math.max(0, finite(model.precipitation?.[i], 0));
      block.windSum += Math.max(0, finite(model.windSpeed?.[i], 0));
      block.imperviousSum += clamp01(model.surface?.imperviousFraction?.[i]);
      block.floodSum += clamp01(currentFlood[i]);
      block.droughtSum += clamp01(currentDrought[i]);
      block.wildfireSum += clamp01(currentWildfire[i]);
      block.landslideSum += clamp01(currentLandslide[i]);
      block.hazardSum += clamp01(currentHazard[i]);
    }
  }

  const blocks = accumulators.map((row) => finalizeLandscapeBlock(row, {
    gridSize,
    blockCellSize,
    n,
    sizeKm: model.sizeKm,
    cellAreaKm2
  }));
  const links = [];
  const directions = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1]
  ];
  for (const block of blocks) {
    for (const [dx, dy] of directions) {
      const nx = block.blockX + dx;
      const ny = block.blockY + dy;
      if (nx < 0 || ny < 0 || nx >= gridSize || ny >= gridSize) continue;
      const neighborId = ny * gridSize + nx;
      block.neighborIds.push(neighborId);
      if (neighborId <= block.blockId) continue;
      const neighbor = blocks[neighborId];
      const diagonal = dx !== 0 && dy !== 0;
      const link = landscapeLink(block, neighbor, diagonal, links.length);
      links.push(link);
      block.linkIds.push(link.linkId);
      neighbor.linkIds.push(link.linkId);
    }
  }
  const connectivitySums = new Float64Array(blockCount);
  const linkCounts = new Uint16Array(blockCount);
  for (const link of links) {
    connectivitySums[link.fromBlockId] += link.connectivity;
    connectivitySums[link.toBlockId] += link.connectivity;
    linkCounts[link.fromBlockId] += 1;
    linkCounts[link.toBlockId] += 1;
  }
  for (const block of blocks) {
    block.meanNeighborConnectivity = connectivitySums[block.blockId] / Math.max(1, linkCounts[block.blockId]);
    block.corridorCapacity = clamp01(block.habitatQuality * 0.46 + block.meanNeighborConnectivity * 0.4 + (1 - block.disturbancePressure) * 0.14);
  }
  const meanConnectivity = mean(links, (row) => row.connectivity);
  const meanHabitatQuality = mean(blocks, (row) => row.habitatQuality);
  const meanCrossBlockFlux = mean(links, (row) => row.crossBlockFlux);
  return {
    type: "geolab-landscape-block-network",
    schemaVersion: 1,
    method: "eight-neighbor-terrain-hydrology-climate-habitat-coupling",
    mapSizeKm: model.sizeKm,
    mapAreaKm2: model.areaKm2,
    gridSize,
    blockCellSize,
    blocks,
    links,
    summary: {
      blockCount,
      linkCount: links.length,
      meanConnectivity: round(meanConnectivity, 5),
      meanHabitatQuality: round(meanHabitatQuality, 5),
      meanCrossBlockFlux: round(meanCrossBlockFlux, 5),
      highConnectivityLinkCount: links.filter((row) => row.connectivity >= 0.68).length,
      hydrologicCorridorCount: links.filter((row) => row.corridorClass === "riparian-corridor").length,
      ruggedPassCount: links.filter((row) => row.corridorClass === "rugged-pass").length
    }
  };
}

export function buildWildlifeState(model, params = {}, network = model?.landscapeNetwork, options = {}) {
  if (!network?.blocks?.length) throw new Error("A landscape block network is required for wildlife simulation");
  const enabled = params.wildlifeEnabled !== false;
  const abundance = clamp(finite(params.wildlifeAbundance, 1), 0, 3);
  const migrationStrength = clamp01(finite(params.wildlifeMigrationStrength, 0.68));
  const habitatSensitivity = clamp01(finite(params.wildlifeHabitatSensitivity, 0.72));
  const maxAgents = integer(params.wildlifeMaxAgents, 0, 5000, 480);
  const continentTemplate = String(params.continentTemplate || "global_custom");
  const previousPopulation = new Map((options.previousState?.populations || []).map((row) => [row.speciesId, finite(row.populationEstimate, 0)]));
  const previouslyAppliedReleaseIds = new Set(options.previousState?.appliedReleaseBatchIds || []);
  const pendingReleases = sanitizeWildlifeReleases(params.wildlifeReleases).filter((row) => !previouslyAppliedReleaseIds.has(row.batchId));
  const years = clamp(finite(options.elapsedYears, 1), 0, 50);
  const suitabilityBySpecies = {};
  const capacityBySpecies = {};

  for (const speciesRecord of WILDLIFE_SPECIES) {
    const suitability = new Float32Array(network.blocks.length);
    const capacity = new Float32Array(network.blocks.length);
    const regionalAffinity = continentAffinity(speciesRecord, continentTemplate);
    for (const block of network.blocks) {
      const regionalScale = regionalAffinity <= 0 ? 0 : 0.35 + regionalAffinity * 0.65;
      suitability[block.blockId] = habitatSuitability(speciesRecord, block, habitatSensitivity) * regionalScale;
    }
    suitabilityBySpecies[speciesRecord.id] = suitability;
    capacityBySpecies[speciesRecord.id] = capacity;
  }

  for (const speciesRecord of WILDLIFE_SPECIES) {
    if (!speciesRecord.preyDependent) continue;
    const target = suitabilityBySpecies[speciesRecord.id];
    const preyIds = speciesRecord.preyIds?.length
      ? speciesRecord.preyIds
      : ["red_deer", "wild_boar", "blue_sheep", "mountain_hare", "saiga", "reindeer"];
    for (let blockId = 0; blockId < network.blocks.length; blockId += 1) {
      const prey = mean(preyIds, (id) => suitabilityBySpecies[id]?.[blockId] || 0);
      target[blockId] *= 0.34 + prey * 0.66;
    }
  }

  const populations = [];
  const releaseOutcomes = [...(options.previousState?.releaseOutcomes || [])];
  for (const speciesRecord of WILDLIFE_SPECIES) {
    const suitability = suitabilityBySpecies[speciesRecord.id];
    const capacity = capacityBySpecies[speciesRecord.id];
    const regionalAffinity = continentAffinity(speciesRecord, continentTemplate);
    let carryingCapacity = 0;
    let occupiedBlocks = 0;
    let suitabilitySum = 0;
    let connectivitySum = 0;
    for (const block of network.blocks) {
      const value = clamp01(suitability[block.blockId]);
      const localCapacity = block.areaKm2 * speciesRecord.density * Math.pow(value, 1.28) * abundance;
      capacity[block.blockId] = localCapacity;
      carryingCapacity += localCapacity;
      suitabilitySum += value;
      connectivitySum += block.meanNeighborConnectivity * value;
      if (value >= 0.36 && localCapacity >= 0.03) occupiedBlocks += 1;
    }
    const previous = previousPopulation.get(speciesRecord.id);
    let estimate = carryingCapacity * (0.72 + deterministic01(speciesRecord.id.length, network.blocks.length, 91) * 0.2);
    if (Number.isFinite(previous)) {
      const safeCapacity = Math.max(0.001, carryingCapacity);
      const growth = speciesRecord.growth * years * previous * (1 - previous / safeCapacity);
      const colonization = previous <= 0.01 ? safeCapacity * migrationStrength * 0.025 * years : 0;
      estimate = clamp(previous + growth + colonization, 0, safeCapacity * 1.08);
    }
    const speciesReleases = pendingReleases.filter((row) => row.speciesId === speciesRecord.id);
    let releasedSurvivors = 0;
    for (const release of speciesReleases) {
      const outcome = buildWildlifeReleaseOutcome(release, speciesRecord, network, suitability, carryingCapacity, estimate, enabled);
      releaseOutcomes.push(outcome);
      releasedSurvivors += outcome.survivingCount;
      estimate = clamp(estimate + outcome.survivingCount, 0, Math.max(outcome.survivingCount, carryingCapacity * 1.35));
    }
    if (!enabled) estimate = 0;
    populations.push({
      speciesId: speciesRecord.id,
      labelZh: speciesRecord.labelZh,
      guild: speciesRecord.guild,
      trophicLevel: speciesRecord.trophicLevel,
      regionalAffinity: round(regionalAffinity, 4),
      populationEstimate: round(estimate, 2),
      carryingCapacity: round(carryingCapacity, 2),
      releasedSurvivors: round(releasedSurvivors, 2),
      occupiedBlockCount: occupiedBlocks,
      meanSuitability: round(suitabilitySum / Math.max(1, network.blocks.length), 5),
      meanHabitatConnectivity: round(connectivitySum / Math.max(0.001, suitabilitySum), 5)
    });
  }

  const migrationLinks = enabled ? buildMigrationLinks(network, suitabilityBySpecies, migrationStrength) : [];
  const blockStates = network.blocks.map((block) => wildlifeBlockState(block, WILDLIFE_SPECIES, suitabilityBySpecies, capacityBySpecies));
  const agents = enabled && maxAgents > 0
    ? buildWildlifeAgents(model, network, populations, suitabilityBySpecies, capacityBySpecies, maxAgents)
    : [];
  const active = populations.filter((row) => row.populationEstimate >= 0.5);
  const totalPopulationEstimate = populations.reduce((sum, row) => sum + row.populationEstimate, 0);
  const foodWeb = buildFoodWebState(populations);
  const ecosystemFunctions = buildEcosystemFunctionState(network, populations, foodWeb);
  const meanHabitatConnectivity = active.length
    ? mean(active, (row) => row.meanHabitatConnectivity)
    : network.summary.meanConnectivity;
  return {
    type: "geolab-wildlife-state",
    schemaVersion: 2,
    method: "regional-niche-carrying-capacity-food-web-release-and-migration-network",
    enabled,
    continentTemplate,
    species: WILDLIFE_SPECIES,
    populations,
    blockStates,
    suitabilityBySpecies,
    migrationLinks,
    agents,
    releaseOutcomes,
    appliedReleaseBatchIds: Array.from(new Set([
      ...previouslyAppliedReleaseIds,
      ...pendingReleases.map((row) => row.batchId)
    ])),
    foodWeb,
    ecosystemFunctions,
    summary: {
      speciesCount: WILDLIFE_SPECIES.length,
      activeSpeciesCount: active.length,
      totalPopulationEstimate: round(totalPopulationEstimate, 2),
      occupiedBlockCount: blockStates.filter((row) => row.richness > 0).length,
      highRichnessBlockCount: blockStates.filter((row) => row.richness >= 4).length,
      migrationLinkCount: migrationLinks.length,
      meanHabitatConnectivity: round(meanHabitatConnectivity, 5),
      renderedAgentCount: agents.length,
      releaseBatchCount: releaseOutcomes.length,
      releasedIndividualCount: round(releaseOutcomes.reduce((sum, row) => sum + row.requestedCount, 0), 2),
      survivingReleasedCount: round(releaseOutcomes.reduce((sum, row) => sum + row.survivingCount, 0), 2),
      foodWebLinkCount: foodWeb.links.length,
      trophicBalance: foodWeb.summary.trophicBalance,
      ecosystemFunctionIndex: ecosystemFunctions.summary.compositeFunctionIndex,
      continentTemplate,
      abundanceScale: abundance,
      migrationStrength,
      habitatSensitivity
    }
  };
}

function sanitizeWildlifeReleases(releases) {
  if (!Array.isArray(releases)) return [];
  const speciesIds = new Set(WILDLIFE_SPECIES.map((row) => row.id));
  return releases
    .map((row, index) => ({
      batchId: String(row?.batchId || `release-${index + 1}`),
      speciesId: String(row?.speciesId || ""),
      requestedCount: integer(row?.count ?? row?.requestedCount, 1, 100000, 1),
      targetHabitat: String(row?.targetHabitat || "best"),
      targetBlockId: Number.isFinite(Number(row?.targetBlockId)) ? Math.round(Number(row.targetBlockId)) : null
    }))
    .filter((row) => speciesIds.has(row.speciesId));
}

function continentAffinity(speciesRecord, continentTemplate) {
  if (!continentTemplate || continentTemplate === "global_custom") return 1;
  if (!speciesRecord.regions?.length || speciesRecord.regions.includes("global")) return 0.82;
  if (speciesRecord.regions.includes(continentTemplate)) return 1;
  return 0;
}

function buildWildlifeReleaseOutcome(release, speciesRecord, network, suitability, carryingCapacity, existingPopulation, enabled) {
  const candidates = network.blocks.filter((block) => {
    if (release.targetBlockId !== null) return block.blockId === release.targetBlockId;
    return releaseHabitatMatches(block, release.targetHabitat);
  });
  const considered = candidates.length ? candidates : network.blocks;
  const ranked = considered
    .map((block) => ({ blockId: block.blockId, suitability: clamp01(suitability[block.blockId]) }))
    .sort((a, b) => b.suitability - a.suitability)
    .slice(0, Math.max(1, Math.min(12, Math.ceil(considered.length * 0.08))));
  const habitatFit = mean(ranked, (row) => row.suitability);
  const capacityPressure = carryingCapacity > 0 ? clamp01(existingPopulation / carryingCapacity) : 1;
  const survivalRate = enabled ? clamp(0.08 + habitatFit * 0.82 - capacityPressure * 0.24, 0.03, 0.92) : 0;
  const survivingCount = release.requestedCount * survivalRate;
  return {
    batchId: release.batchId,
    speciesId: speciesRecord.id,
    labelZh: speciesRecord.labelZh,
    requestedCount: release.requestedCount,
    survivingCount: round(survivingCount, 2),
    rejectedCount: round(release.requestedCount - survivingCount, 2),
    survivalRate: round(survivalRate, 5),
    habitatFit: round(habitatFit, 5),
    capacityPressure: round(capacityPressure, 5),
    targetHabitat: release.targetHabitat,
    targetBlockId: release.targetBlockId,
    releaseBlockIds: ranked.slice(0, 4).map((row) => row.blockId),
    status: !enabled ? "ecosystem-disabled" : survivalRate >= 0.62 ? "high-fit" : survivalRate >= 0.34 ? "conditional" : "low-fit"
  };
}

function releaseHabitatMatches(block, targetHabitat) {
  if (targetHabitat === "forest") return block.meanVegetation >= 0.58 && block.landFraction >= 0.62;
  if (targetHabitat === "wetland") return block.hydrologicConnectivity >= 0.52 || block.meanWetness >= 0.62;
  if (targetHabitat === "mountain") return block.meanElevationM >= 1200 || block.terrainComplexity >= 0.58;
  if (targetHabitat === "grassland") return block.meanVegetation >= 0.24 && block.meanVegetation <= 0.68 && block.meanWetness <= 0.58;
  if (targetHabitat === "coast") return block.waterFraction >= 0.16 && block.landFraction >= 0.12;
  if (targetHabitat === "urban-edge") return block.meanImpervious >= 0.08 && block.meanImpervious <= 0.42;
  return true;
}

function buildFoodWebState(populations) {
  const populationById = new Map(populations.map((row) => [row.speciesId, row]));
  const nodes = WILDLIFE_SPECIES.map((speciesRecord) => ({
    speciesId: speciesRecord.id,
    labelZh: speciesRecord.labelZh,
    guild: speciesRecord.guild,
    trophicLevel: speciesRecord.trophicLevel,
    populationEstimate: populationById.get(speciesRecord.id)?.populationEstimate || 0
  }));
  const links = [];
  for (const predator of WILDLIFE_SPECIES) {
    for (const preyId of predator.preyIds || []) {
      const predatorPopulation = populationById.get(predator.id)?.populationEstimate || 0;
      const preyPopulation = populationById.get(preyId)?.populationEstimate || 0;
      if (predatorPopulation < 0.05 || preyPopulation < 0.05) continue;
      links.push({
        fromSpeciesId: preyId,
        toSpeciesId: predator.id,
        interaction: "predation",
        strength: round(clamp01(Math.sqrt(predatorPopulation * preyPopulation) / Math.max(1, predatorPopulation + preyPopulation) * 2.4), 5)
      });
    }
  }
  const herbivoreBiomass = nodes.filter((row) => row.trophicLevel <= 2.2).reduce((sum, row) => sum + row.populationEstimate, 0);
  const predatorBiomass = nodes.filter((row) => row.trophicLevel >= 3).reduce((sum, row) => sum + row.populationEstimate, 0);
  const trophicBalance = clamp01(1 - Math.abs(predatorBiomass / Math.max(1, herbivoreBiomass) - 0.08) / 0.2);
  return {
    type: "geolab-food-web",
    schemaVersion: 1,
    nodes,
    links,
    summary: {
      nodeCount: nodes.length,
      activeNodeCount: nodes.filter((row) => row.populationEstimate >= 0.5).length,
      linkCount: links.length,
      trophicBalance: round(trophicBalance, 5)
    }
  };
}

function buildEcosystemFunctionState(network, populations, foodWeb) {
  const producerIndex = mean(network.blocks, (block) => block.meanVegetation * (1 - block.disturbancePressure * 0.42));
  const pollinationIndex = mean(network.blocks, (block) => block.meanVegetation * block.meanNeighborConnectivity * (1 - block.meanImpervious));
  const decompositionIndex = mean(network.blocks, (block) => clamp01(block.meanWetness * 0.48 + (block.meanTemperatureC + 10) / 42 * 0.32 + block.meanVegetation * 0.2));
  const aquaticIndex = mean(network.blocks, (block) => block.hydrologicConnectivity * (1 - block.meanHazard * 0.28));
  const engineerPopulation = populations
    .filter((row) => ["ecosystem-engineer", "megaherbivore"].includes(row.guild))
    .reduce((sum, row) => sum + row.populationEstimate, 0);
  const engineerIndex = clamp01(Math.log1p(engineerPopulation) / 8);
  const predatorIndex = foodWeb.summary.trophicBalance;
  const guilds = [
    guildState("primary-producers", producerIndex),
    guildState("pollinators-dispersers", pollinationIndex),
    guildState("decomposers", decompositionIndex),
    guildState("herbivores", clamp01(Math.log1p(populations.filter((row) => row.trophicLevel <= 2.2).reduce((sum, row) => sum + row.populationEstimate, 0)) / 10)),
    guildState("predators", predatorIndex),
    guildState("ecosystem-engineers", engineerIndex),
    guildState("aquatic-riparian", aquaticIndex)
  ];
  return {
    type: "geolab-ecosystem-functions",
    schemaVersion: 1,
    guilds,
    summary: {
      compositeFunctionIndex: round(mean(guilds, (row) => row.functionIndex), 5),
      limitingGuildId: [...guilds].sort((a, b) => a.functionIndex - b.functionIndex)[0]?.guildId || "",
      highFunctionGuildCount: guilds.filter((row) => row.functionIndex >= 0.68).length
    }
  };
}

function guildState(guildId, value) {
  const descriptor = ECOSYSTEM_GUILDS.find((row) => row.id === guildId);
  return {
    guildId,
    labelZh: descriptor?.labelZh || guildId,
    process: descriptor?.process || "",
    functionIndex: round(clamp01(value), 5)
  };
}

function createBlockAccumulator(blockId, gridSize) {
  return {
    blockId,
    blockX: blockId % gridSize,
    blockY: Math.floor(blockId / gridSize),
    cellCount: 0,
    landCellCount: 0,
    elevationSum: 0,
    minElevationM: Infinity,
    maxElevationM: -Infinity,
    slopeSum: 0,
    roughnessSum: 0,
    wetnessSum: 0,
    flowSum: 0,
    vegetationSum: 0,
    canopySum: 0,
    temperatureSum: 0,
    precipitationSum: 0,
    windSum: 0,
    imperviousSum: 0,
    floodSum: 0,
    droughtSum: 0,
    wildfireSum: 0,
    landslideSum: 0,
    hazardSum: 0
  };
}

function finalizeLandscapeBlock(row, context) {
  const count = Math.max(1, row.cellCount);
  const x0Cell = row.blockX * context.blockCellSize;
  const y0Cell = row.blockY * context.blockCellSize;
  const x1Cell = Math.min(context.n, x0Cell + context.blockCellSize);
  const y1Cell = Math.min(context.n, y0Cell + context.blockCellSize);
  const localReliefM = Math.max(0, row.maxElevationM - row.minElevationM);
  const meanSlopeDeg = row.slopeSum / count;
  const meanRoughnessM = row.roughnessSum / count;
  const meanVegetation = row.vegetationSum / count;
  const meanWetness = row.wetnessSum / count;
  const meanFlow = row.flowSum / count;
  const meanImpervious = row.imperviousSum / count;
  const meanHazard = row.hazardSum / count;
  const landFraction = row.landCellCount / count;
  const waterFraction = 1 - landFraction;
  const disturbancePressure = clamp01(meanImpervious * 0.48 + meanHazard * 0.24 + (row.wildfireSum / count) * 0.14 + (row.landslideSum / count) * 0.14);
  const terrainComplexity = clamp01(meanSlopeDeg / 42 * 0.34 + meanRoughnessM / 620 * 0.34 + localReliefM / 1500 * 0.32);
  const hydrologicConnectivity = clamp01(meanFlow * 0.44 + meanWetness * 0.34 + waterFraction * 0.22);
  const habitatQuality = clamp01(
    Math.max(landFraction * (meanVegetation * 0.42 + clamp01(row.canopySum / count / 28) * 0.16), waterFraction * hydrologicConnectivity * 0.52) +
      (1 - meanImpervious) * 0.18 +
      (1 - disturbancePressure) * 0.2
  );
  const x0Km = x0Cell / Math.max(1, context.n - 1) * context.sizeKm;
  const y0Km = y0Cell / Math.max(1, context.n - 1) * context.sizeKm;
  const x1Km = Math.min(context.sizeKm, (Math.max(x0Cell + 1, x1Cell - 1) / Math.max(1, context.n - 1)) * context.sizeKm);
  const y1Km = Math.min(context.sizeKm, (Math.max(y0Cell + 1, y1Cell - 1) / Math.max(1, context.n - 1)) * context.sizeKm);
  return {
    blockId: row.blockId,
    blockX: row.blockX,
    blockY: row.blockY,
    x0Km,
    y0Km,
    x1Km,
    y1Km,
    centerXKm: (x0Km + x1Km) / 2,
    centerYKm: (y0Km + y1Km) / 2,
    cellCount: row.cellCount,
    areaKm2: row.cellCount * context.cellAreaKm2,
    landFraction,
    waterFraction,
    meanElevationM: row.elevationSum / count,
    localReliefM,
    meanSlopeDeg,
    meanRoughnessM,
    meanWetness,
    meanFlow,
    meanVegetation,
    meanCanopyHeightM: row.canopySum / count,
    meanTemperatureC: row.temperatureSum / count,
    meanPrecipitationMm: row.precipitationSum / count,
    meanWindSpeedMs: row.windSum / count,
    meanImpervious,
    meanFloodHazard: row.floodSum / count,
    meanDroughtStress: row.droughtSum / count,
    meanWildfireRisk: row.wildfireSum / count,
    meanLandslideRisk: row.landslideSum / count,
    meanHazard,
    disturbancePressure,
    terrainComplexity,
    hydrologicConnectivity,
    habitatQuality,
    neighborIds: [],
    linkIds: [],
    meanNeighborConnectivity: 0,
    corridorCapacity: 0
  };
}

function landscapeLink(a, b, diagonal, linkId) {
  const vegetationContinuity = 1 - Math.abs(a.meanVegetation - b.meanVegetation);
  const hydrologicContinuity = 1 - Math.abs(a.hydrologicConnectivity - b.hydrologicConnectivity);
  const terrainContinuity = 1 - clamp01(Math.abs(a.meanElevationM - b.meanElevationM) / 1800 + Math.abs(a.meanSlopeDeg - b.meanSlopeDeg) / 70);
  const habitatContinuity = Math.sqrt(Math.max(0, a.habitatQuality * b.habitatQuality));
  const landWaterMismatch = Math.abs(a.waterFraction - b.waterFraction);
  const topographicBarrier = clamp01(
    Math.max(a.meanSlopeDeg, b.meanSlopeDeg) / 58 * 0.48 +
      Math.max(a.terrainComplexity, b.terrainComplexity) * 0.28 +
      Math.abs(a.localReliefM - b.localReliefM) / 2200 * 0.24
  );
  const barrier = clamp01(
    Math.max(a.disturbancePressure, b.disturbancePressure) * 0.38 +
      topographicBarrier * 0.28 +
      landWaterMismatch * 0.22 +
      (diagonal ? 0.08 : 0)
  );
  const continuity =
    habitatContinuity * 0.3 +
    vegetationContinuity * 0.2 +
    hydrologicContinuity * 0.16 +
    terrainContinuity * 0.16 +
    (1 - landWaterMismatch) * 0.18;
  const connectivity = clamp01((continuity * (1 - barrier * 0.82) - 0.08) * 1.2);
  const crossBlockFlux = clamp01(connectivity * (0.42 + Math.max(a.meanFlow, b.meanFlow) * 0.28 + Math.max(a.meanWindSpeedMs, b.meanWindSpeedMs) / 32 * 0.12 + vegetationContinuity * 0.18));
  const corridorClass = a.hydrologicConnectivity >= 0.52 && b.hydrologicConnectivity >= 0.52
    ? "riparian-corridor"
    : a.terrainComplexity >= 0.55 && b.terrainComplexity >= 0.55
      ? "rugged-pass"
      : habitatContinuity >= 0.58
        ? "habitat-corridor"
        : "transition-link";
  return {
    linkId,
    fromBlockId: a.blockId,
    toBlockId: b.blockId,
    diagonal,
    distanceKm: Math.hypot(a.centerXKm - b.centerXKm, a.centerYKm - b.centerYKm),
    connectivity,
    resistance: 1 - connectivity,
    crossBlockFlux,
    corridorClass
  };
}

function habitatSuitability(speciesRecord, block, sensitivity) {
  const elevation = closeness(block.meanElevationM, speciesRecord.elevation[0], speciesRecord.elevation[1]);
  const slope = closeness(clamp01(block.meanSlopeDeg / 45), speciesRecord.slope[0], speciesRecord.slope[1]);
  const vegetation = closeness(block.meanVegetation, speciesRecord.vegetation[0], speciesRecord.vegetation[1]);
  const wetness = closeness(block.meanWetness, speciesRecord.wetness[0], speciesRecord.wetness[1]);
  const roughness = closeness(block.terrainComplexity, speciesRecord.roughness[0], speciesRecord.roughness[1]);
  const temperature = closeness(block.meanTemperatureC, speciesRecord.temperature[0], speciesRecord.temperature[1]);
  const aquatic = speciesRecord.aquaticAffinity;
  const landWater = aquatic >= 0.5
    ? clamp01(block.waterFraction * aquatic * 1.35 + block.hydrologicConnectivity * 0.5 + block.landFraction * 0.18)
    : clamp01(block.landFraction * (1.08 - aquatic * 0.24) + block.hydrologicConnectivity * aquatic * 0.2);
  const flow = speciesRecord.flowAffinity
    ? closeness(block.meanFlow, speciesRecord.flowAffinity, 0.46)
    : 0.64 + block.hydrologicConnectivity * 0.18;
  const humanScore = clamp01(1 - block.meanImpervious * (1.15 - speciesRecord.humanTolerance) - block.disturbancePressure * (0.7 - speciesRecord.humanTolerance * 0.38));
  const corridor = clamp01(block.meanNeighborConnectivity * 0.62 + block.corridorCapacity * 0.38);
  const physical = elevation * 0.13 + slope * 0.13 + roughness * 0.11 + temperature * 0.1;
  const habitat = vegetation * 0.18 + wetness * 0.13 + flow * 0.08 + landWater * 0.12;
  const pressure = humanScore * 0.07 + corridor * 0.05;
  const weighted = physical + habitat + pressure;
  const limitingFactor = Math.min(
    landWater,
    humanScore,
    Math.max(0.18, elevation),
    Math.max(0.2, speciesRecord.aquaticAffinity >= 0.5 ? wetness : vegetation)
  );
  const nicheFit = weighted * (0.56 + limitingFactor * 0.44);
  const sharpened = smoothstep(0.28 + sensitivity * 0.08, 0.84 - sensitivity * 0.05, nicheFit);
  return clamp01(Math.pow(sharpened, 0.82 + sensitivity * 0.72));
}

function buildMigrationLinks(network, suitabilityBySpecies, migrationStrength) {
  const result = [];
  const perSpeciesLimit = Math.min(48, Math.max(12, Math.ceil(network.blocks.length / 8)));
  for (const speciesRecord of WILDLIFE_SPECIES) {
    const suitability = suitabilityBySpecies[speciesRecord.id];
    const candidates = [];
    for (const link of network.links) {
      const habitat = Math.min(suitability[link.fromBlockId], suitability[link.toBlockId]);
      const strength = clamp01(habitat * link.connectivity * migrationStrength * (0.72 + speciesRecord.movementKmPerDay / 50));
      if (strength < 0.16) continue;
      candidates.push({
        speciesId: speciesRecord.id,
        fromBlockId: link.fromBlockId,
        toBlockId: link.toBlockId,
        strength,
        corridorClass: link.corridorClass,
        distanceKm: link.distanceKm
      });
    }
    candidates.sort((a, b) => b.strength - a.strength || a.fromBlockId - b.fromBlockId);
    result.push(...candidates.slice(0, perSpeciesLimit));
  }
  return result;
}

function wildlifeBlockState(block, speciesRecords, suitabilityBySpecies, capacityBySpecies) {
  const rows = speciesRecords.map((speciesRecord) => ({
    speciesId: speciesRecord.id,
    suitability: suitabilityBySpecies[speciesRecord.id][block.blockId],
    carryingCapacity: capacityBySpecies[speciesRecord.id][block.blockId]
  })).sort((a, b) => b.suitability - a.suitability);
  return {
    blockId: block.blockId,
    richness: rows.filter((row) => row.suitability >= 0.46 && row.carryingCapacity >= 0.025).length,
    dominantSpeciesId: rows[0]?.speciesId || "",
    dominantSuitability: rows[0]?.suitability || 0,
    topSpecies: rows.slice(0, 4),
    habitatQuality: block.habitatQuality,
    connectivity: block.meanNeighborConnectivity,
    disturbancePressure: block.disturbancePressure
  };
}

function buildWildlifeAgents(model, network, populations, suitabilityBySpecies, capacityBySpecies, maxAgents) {
  const active = populations.filter((row) => row.populationEstimate >= 0.5);
  if (!active.length || maxAgents <= 0) return [];
  const total = active.reduce((sum, row) => sum + row.populationEstimate, 0);
  const allocations = new Map(active.map((row) => [row.speciesId, 1]));
  let remaining = Math.max(0, maxAgents - active.length);
  for (const row of active) {
    const extra = Math.floor(remaining * row.populationEstimate / Math.max(0.001, total));
    allocations.set(row.speciesId, allocations.get(row.speciesId) + extra);
  }
  let allocated = Array.from(allocations.values()).reduce((sum, value) => sum + value, 0);
  const ranked = [...active].sort((a, b) => b.populationEstimate - a.populationEstimate);
  for (let i = 0; allocated < maxAgents; i += 1, allocated += 1) {
    const row = ranked[i % ranked.length];
    allocations.set(row.speciesId, allocations.get(row.speciesId) + 1);
  }
  const agents = [];
  for (const population of active) {
    const speciesRecord = WILDLIFE_SPECIES.find((row) => row.id === population.speciesId);
    const count = allocations.get(population.speciesId) || 0;
    const suitability = suitabilityBySpecies[population.speciesId];
    const capacity = capacityBySpecies[population.speciesId];
    const weightedBlocks = network.blocks
      .map((block) => ({ block, weight: capacity[block.blockId] * (0.35 + suitability[block.blockId] * 0.65) }))
      .filter((row) => row.weight > 0.001);
    const weightTotal = weightedBlocks.reduce((sum, row) => sum + row.weight, 0);
    for (let ordinal = 0; ordinal < count && agents.length < maxAgents; ordinal += 1) {
      const sample = deterministic01(ordinal, speciesRecord.id.length * 31, model.n + 17) * weightTotal;
      let cursor = 0;
      let selected = weightedBlocks[weightedBlocks.length - 1];
      for (const row of weightedBlocks) {
        cursor += row.weight;
        if (sample <= cursor) { selected = row; break; }
      }
      if (!selected) continue;
      const block = selected.block;
      const rx = deterministic01(ordinal, block.blockId, speciesRecord.id.length * 101 + 7);
      const ry = deterministic01(block.blockId, ordinal, speciesRecord.id.length * 137 + 13);
      agents.push({
        agentId: `${speciesRecord.id}-${ordinal}`,
        speciesId: speciesRecord.id,
        geometryClass: speciesRecord.geometryClass,
        blockId: block.blockId,
        xKm: lerp(block.x0Km, block.x1Km, 0.08 + rx * 0.84),
        yKm: lerp(block.y0Km, block.y1Km, 0.08 + ry * 0.84),
        elevationM: block.meanElevationM,
        headingRad: deterministic01(ordinal, block.blockId, 509) * Math.PI * 2,
        speedKmPerDay: speciesRecord.movementKmPerDay * (0.72 + deterministic01(block.blockId, ordinal, 613) * 0.56),
        animationPhase: deterministic01(ordinal, speciesRecord.id.length, 719) * Math.PI * 2,
        scale: speciesRecord.bodyScale * (0.86 + deterministic01(ordinal, block.blockId, 827) * 0.28),
        colorHex: speciesRecord.colorHex,
        habitatSuitability: suitability[block.blockId]
      });
    }
  }
  return agents;
}

function species(id, labelZh, geometryClass, colorHex, bodyScale, profile) {
  const trophicLevel = Number.isFinite(Number(profile.trophicLevel))
    ? Number(profile.trophicLevel)
    : inferTrophicLevel(profile.guild, profile.preyDependent);
  return Object.freeze({
    id,
    labelZh,
    geometryClass,
    colorHex,
    bodyScale,
    ...profile,
    trophicLevel,
    preyIds: Object.freeze([...(profile.preyIds || [])]),
    regions: Object.freeze([...(profile.regions || ["global"])])
  });
}

function inferTrophicLevel(guild, preyDependent) {
  if (preyDependent || ["apex-predator", "aerial-predator"].includes(guild)) return 4;
  if (["mesopredator", "riparian-predator", "marine-predator", "aerial-scavenger"].includes(guild)) return 3.2;
  if (["omnivore", "large-omnivore", "wetland-bird", "marine-bird"].includes(guild)) return 2.6;
  return 2;
}

function closeness(value, target, tolerance) {
  return 1 - clamp01(Math.abs(finite(value, 0) - finite(target, 0)) / Math.max(0.0001, finite(tolerance, 1)));
}

function deterministic01(a, b, seed) {
  let value = Math.imul((a | 0) + 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + seed, 0xc2b2ae35);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  return (value >>> 0) / 4294967295;
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, min, max, fallback) {
  return Math.round(clamp(finite(value, fallback), min, max));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value) {
  return clamp(finite(value, 0), 0, 1);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / Math.max(0.0001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function round(value, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round(finite(value, 0) * factor) / factor;
}

function mean(rows, selector) {
  if (!rows?.length) return 0;
  let sum = 0;
  for (const row of rows) sum += finite(selector(row), 0);
  return sum / rows.length;
}
