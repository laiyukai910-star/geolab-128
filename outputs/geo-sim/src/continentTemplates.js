export const CONTINENT_TEMPLATES = Object.freeze([
  template("global_custom", "全球自定义", "全球", "global", "custom", "none", 0, {}, "global"),
  template("east_asia_monsoon", "东亚季风山地与盆地", "亚洲 · 东亚", "asia", "quartz_sandstone_pillars", "huangshan", 1103, {
    relief: 2380, ridgeWeight: 0.78, tectonics: 0.7, microRelief: 34, terrainComplexity: 0.76,
    terrainDiversity: 0.82, humidity: 1.16, baseTemperature: 15.4, latitude: 31, lapseRate: 6.4,
    windDirection: 122, windSpeed: 9.5, permeability: 0.42, riverThreshold: 52, vegetationFeedback: 0.78
  }, "east-asia"),
  template("central_asia_steppe", "中亚高原草原与山间盆地", "亚洲 · 中亚", "asia", "loess_plateau", "none", 2207, {
    relief: 1960, ridgeWeight: 0.62, tectonics: 0.7, microRelief: 29, terrainComplexity: 0.7,
    terrainDiversity: 0.68, humidity: 0.48, baseTemperature: 10.8, latitude: 43, lapseRate: 6.8,
    windDirection: 286, windSpeed: 14, permeability: 0.34, riverThreshold: 78, vegetationFeedback: 0.42
  }, "central-asia"),
  template("south_asia_foreland", "南亚季风前陆与高山弧", "亚洲 · 南亚", "asia", "alpine_glacier", "none", 3301, {
    relief: 4200, ridgeWeight: 0.88, tectonics: 0.94, microRelief: 38, terrainComplexity: 0.9,
    terrainDiversity: 0.84, humidity: 1.32, baseTemperature: 22, latitude: 27, lapseRate: 6.7,
    windDirection: 202, windSpeed: 12, permeability: 0.4, riverThreshold: 38, vegetationFeedback: 0.8
  }, "south-asia"),
  template("southeast_asia_archipelago", "东南亚热带群岛与喀斯特", "亚洲 · 东南亚", "asia", "volcanic_island", "ha_long_bay", 4409, {
    relief: 2050, ridgeWeight: 0.72, tectonics: 0.9, seaLevel: 220, microRelief: 30,
    terrainComplexity: 0.82, terrainDiversity: 0.92, humidity: 1.56, baseTemperature: 27, latitude: 8,
    lapseRate: 5.6, windDirection: 225, windSpeed: 10, permeability: 0.55, riverThreshold: 34,
    vegetationFeedback: 0.92
  }, "southeast-asia"),
  template("europe_alpine", "欧洲温带平原与阿尔卑斯山系", "欧洲", "europe", "alpine_glacier", "geirangerfjord", 5519, {
    relief: 2850, ridgeWeight: 0.76, tectonics: 0.72, seaLevel: 130, microRelief: 24,
    terrainComplexity: 0.72, terrainDiversity: 0.74, humidity: 1.02, baseTemperature: 11.5, latitude: 47,
    lapseRate: 6.5, windDirection: 258, windSpeed: 11, permeability: 0.4, riverThreshold: 48,
    vegetationFeedback: 0.72
  }, "europe"),
  template("north_america_cordillera", "北美科迪勒拉与大平原", "北美洲", "north-america", "canyon_plateau", "yosemite_valley", 6607, {
    relief: 3250, ridgeWeight: 0.76, tectonics: 0.82, microRelief: 30, terrainComplexity: 0.82,
    terrainDiversity: 0.78, humidity: 0.82, baseTemperature: 13.2, latitude: 39, lapseRate: 6.6,
    windDirection: 268, windSpeed: 12.5, permeability: 0.38, riverThreshold: 54, vegetationFeedback: 0.62
  }, "north-america"),
  template("south_america_andes_amazon", "南美安第斯与亚马孙前缘", "南美洲", "south-america", "andes_ridge_terrace", "machu_picchu_andenes", 7703, {
    relief: 3900, ridgeWeight: 0.86, tectonics: 0.92, microRelief: 32, terrainComplexity: 0.88,
    terrainDiversity: 0.94, humidity: 1.5, baseTemperature: 23.2, latitude: -12, lapseRate: 6.3,
    windDirection: 92, windSpeed: 9, permeability: 0.46, riverThreshold: 32, vegetationFeedback: 0.94
  }, "south-america"),
  template("africa_rift_savanna", "非洲裂谷、台地与稀树草原", "非洲", "africa", "resurgent_caldera", "none", 8819, {
    relief: 2450, ridgeWeight: 0.62, tectonics: 0.9, microRelief: 27, terrainComplexity: 0.7,
    terrainDiversity: 0.8, humidity: 0.72, baseTemperature: 25.5, latitude: -2, lapseRate: 6,
    windDirection: 118, windSpeed: 11.5, permeability: 0.37, riverThreshold: 62, vegetationFeedback: 0.66
  }, "africa"),
  template("australia_interior_coast", "澳洲内陆高原与湿润东岸", "大洋洲 · 澳大利亚", "oceania", "badlands_coulee", "twelve_apostles_limestone", 9901, {
    relief: 1420, ridgeWeight: 0.48, tectonics: 0.44, seaLevel: 150, microRelief: 30,
    terrainComplexity: 0.58, terrainDiversity: 0.76, humidity: 0.58, baseTemperature: 22.5, latitude: -27,
    lapseRate: 6.1, windDirection: 132, windSpeed: 13, permeability: 0.3, riverThreshold: 92,
    vegetationFeedback: 0.52
  }, "australia"),
  template("antarctica_plateau", "南极冰盖高原与冰蚀海岸", "南极洲", "antarctica", "alpine_glacier", "none", 10111, {
    relief: 3100, ridgeWeight: 0.58, tectonics: 0.42, seaLevel: 190, microRelief: 12,
    terrainComplexity: 0.64, terrainDiversity: 0.42, humidity: 0.26, baseTemperature: -12, latitude: -78,
    lapseRate: 8.2, windDirection: 148, windSpeed: 24, permeability: 0.08, riverThreshold: 220,
    vegetationFeedback: 0.02
  }, "antarctica"),
  template("arctic_tundra", "北极冻原、冰缘河流与群岛", "北极环域", "arctic", "braided_outwash", "iceland_fjord", 11213, {
    relief: 1280, ridgeWeight: 0.42, tectonics: 0.5, seaLevel: 210, microRelief: 18,
    terrainComplexity: 0.54, terrainDiversity: 0.62, humidity: 0.7, baseTemperature: -4.5, latitude: 69,
    lapseRate: 7.4, windDirection: 34, windSpeed: 18, permeability: 0.18, riverThreshold: 44,
    vegetationFeedback: 0.22
  }, "arctic"),
  template("oceania_volcanic_arc", "大洋洲火山岛弧与珊瑚海岸", "大洋洲 · 岛弧", "oceania", "volcanic_island", "mount_fuji", 12301, {
    relief: 2680, ridgeWeight: 0.66, tectonics: 0.96, seaLevel: 245, microRelief: 28,
    terrainComplexity: 0.8, terrainDiversity: 0.9, humidity: 1.38, baseTemperature: 24.8, latitude: -17,
    lapseRate: 5.8, windDirection: 116, windSpeed: 12, permeability: 0.62, riverThreshold: 42,
    vegetationFeedback: 0.88
  }, "pacific-islands"),
  template("middle_east_arid_plateau", "西亚干旱高原与裂谷绿洲", "亚洲 · 西亚", "asia", "canyon_plateau", "antelope_canyon", 13417, {
    relief: 1880, ridgeWeight: 0.56, tectonics: 0.74, microRelief: 34, terrainComplexity: 0.68,
    terrainDiversity: 0.64, humidity: 0.28, baseTemperature: 24.5, latitude: 30, lapseRate: 6.7,
    windDirection: 302, windSpeed: 16, permeability: 0.24, riverThreshold: 128, vegetationFeedback: 0.2
  }, "west-asia"),
  template("south_america_patagonia", "巴塔哥尼亚山地、冰原与草原", "南美洲 · 南部", "south-america", "fjord_coast", "geirangerfjord", 14503, {
    relief: 2820, ridgeWeight: 0.74, tectonics: 0.76, seaLevel: 205, microRelief: 26,
    terrainComplexity: 0.78, terrainDiversity: 0.68, humidity: 0.82, baseTemperature: 7.5, latitude: -49,
    lapseRate: 6.9, windDirection: 274, windSpeed: 22, permeability: 0.34, riverThreshold: 50,
    vegetationFeedback: 0.42
  }, "patagonia")
]);

export function getContinentTemplate(id) {
  return CONTINENT_TEMPLATES.find((entry) => entry.id === id) || CONTINENT_TEMPLATES[0];
}

export function applyContinentTemplateParams(params, templateId) {
  const selected = getContinentTemplate(templateId);
  if (selected.id === "global_custom") return { ...params, continentTemplate: selected.id };
  return {
    ...params,
    ...selected.params,
    continentTemplate: selected.id,
    geomorphologyPreset: selected.geomorphologyPreset,
    scenicPreset: selected.scenicPreset,
    seed: Math.max(1, Math.round(Number(params?.seed) || 17031) + selected.seedOffset)
  };
}

function template(id, labelZh, scopeZh, continentGroup, geomorphologyPreset, scenicPreset, seedOffset, params, ecologyProfile) {
  return Object.freeze({
    id,
    labelZh,
    scopeZh,
    continentGroup,
    geomorphologyPreset,
    scenicPreset,
    seedOffset,
    ecologyProfile,
    params: Object.freeze({ ...params })
  });
}
