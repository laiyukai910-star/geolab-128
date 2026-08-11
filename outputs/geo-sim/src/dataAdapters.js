const NUMERIC_FIELDS = new Set([
  "dem",
  "elevation",
  "elevation_m",
  "value",
  "data",
  "precipitation",
  "precip_mm_yr",
  "temperature",
  "temp_c",
  "vegetation",
  "vegetation_fraction",
  "ndvi",
  "lai",
  "leaf_area_index",
  "canopy_height",
  "canopy_height_m",
  "nlcd_class",
  "classvalue",
  "gridcode",
  "landcover",
  "land_cover",
  "nlcd",
  "soil",
  "soil_group",
  "hydrologic_soil_group",
  "hydrologic_group",
  "hsg",
  "hydgrp",
  "hydgrpdcd",
  "ksat_mm_hr",
  "hydraulic_conductivity_mm_hr",
  "soil_hydraulic_conductivity",
  "awc_mm",
  "available_water_capacity_mm",
  "available_water_capacity",
  "root_depth_m",
  "root_zone_depth_m",
  "impervious",
  "impervious_fraction",
  "impervious_percent",
  "wind_speed",
  "wind_speed_ms",
  "ws",
  "ws_ms",
  "wind_direction",
  "wind_from_deg",
  "wdir",
  "u10",
  "v10",
  "u",
  "v",
  "wind_u",
  "wind_v",
  "u_wind",
  "v_wind",
  "eastward_wind",
  "northward_wind",
  "eastward_wind_ms",
  "northward_wind_ms",
  "uas",
  "vas",
  "prcp",
  "prcp_mm",
  "ppt_mm",
  "rain_mm",
  "tmean",
  "tmax",
  "tmax_c",
  "tmin",
  "tmin_c",
  "discharge_m3s",
  "flow_m3s",
  "discharge_cfs",
  "flow_cfs"
]);

const WIND_U_COLUMNS = ["u10", "u", "wind_u", "u_wind", "eastward_wind", "eastward_wind_ms", "uas"];
const WIND_V_COLUMNS = ["v10", "v", "wind_v", "v_wind", "northward_wind", "northward_wind_ms", "vas"];
const DEFAULT_MAP_SIZE_KM = 128;
const DEFAULT_BOUNDS_KM = [0, 0, DEFAULT_MAP_SIZE_KM, DEFAULT_MAP_SIZE_KM];
const CANONICAL_INFRASTRUCTURE_TYPES = new Set([
  "custom",
  "urban",
  "village",
  "transport",
  "industrial",
  "highrise",
  "apartment",
  "residential",
  "villa",
  "commercial",
  "civic",
  "hospital",
  "school",
  "stadium",
  "landmark",
  "bridge",
  "airport",
  "rail",
  "port",
  "logistics",
  "powerplant",
  "wastewater",
  "solar_farm",
  "wind_farm",
  "park",
  "greenhouse",
  "quarry",
  "office_tower",
  "hotel",
  "market",
  "fire_station",
  "police_station",
  "data_center",
  "substation",
  "metro_station",
  "tunnel_portal",
  "research_station",
  "farmstead",
  "terrace_farm",
  "clinic",
  "library",
  "community_center",
  "bus_terminal",
  "water_tower",
  "observatory",
  "cable_car_station",
  "flood_pump_station",
  "desalination_plant",
  "visitor_center",
  "scenic_overlook",
  "trailhead",
  "ranger_station",
  "gauging_station",
  "hydropower_plant",
  "geothermal_plant",
  "water_treatment_plant",
  "mountain_refuge",
  "ferry_terminal",
  "fire_watch_tower",
  "reservoir",
  "dam",
  "canal",
  "levee"
]);
const SUBSURFACE_LITHOLOGY_LOOKUP = {
  soil: 1,
  topsoil: 1,
  regolith: 2,
  weathered: 2,
  alluvium: 3,
  alluvial: 3,
  sand: 3,
  gravel: 3,
  aquifer: 3,
  fractured: 4,
  fractured_bedrock: 4,
  fracturedbedrock: 4,
  bedrock_fractured: 4,
  bedrock: 5,
  sandstone: 5,
  granite: 5,
  limestone: 5,
  aquitard: 6,
  clay: 6,
  shale: 6,
  mudstone: 6,
  confining: 6
};

export async function readLayerFile(file, role) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".json") || name.endsWith(".geojson")) {
    return normalizeLayerObject(JSON.parse(await file.text()), role, file.name);
  }
  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    return parseLayerCSV(await file.text(), role, file.name);
  }
  if (name.endsWith(".tif") || name.endsWith(".tiff")) {
    return parseGeoTiff(await file.arrayBuffer(), role, file.name);
  }
  throw new Error(`不支持的文件类型: ${file.name}`);
}

export function readLayerObject(input, role, sourceName = "inline-layer") {
  return normalizeLayerObject(input, role, sourceName);
}

export function mergeLayerBundle(target, parsed) {
  const next = {
    ...target,
    stamp: (target?.stamp || 0) + 1,
    sources: [...(target?.sources || [])]
  };
  if (parsed.dem) next.dem = parsed.dem;
  if (parsed.landCover) next.landCover = parsed.landCover;
  if (parsed.soilGroup) next.soilGroup = parsed.soilGroup;
  if (parsed.soilHydraulicConductivity) next.soilHydraulicConductivity = parsed.soilHydraulicConductivity;
  if (parsed.availableWaterCapacity) next.availableWaterCapacity = parsed.availableWaterCapacity;
  if (parsed.rootDepth) next.rootDepth = parsed.rootDepth;
  if (parsed.imperviousFraction) next.imperviousFraction = parsed.imperviousFraction;
  if (parsed.vegetation) next.vegetation = parsed.vegetation;
  if (parsed.leafAreaIndex) next.leafAreaIndex = parsed.leafAreaIndex;
  if (parsed.canopyHeight) next.canopyHeight = parsed.canopyHeight;
  if (parsed.temperature) next.temperature = parsed.temperature;
  if (parsed.precipitation) next.precipitation = parsed.precipitation;
  if (parsed.windSpeed) next.windSpeed = parsed.windSpeed;
  if (parsed.windDirection) next.windDirection = parsed.windDirection;
  if (parsed.metSummary) next.metSummary = [...(next.metSummary || []), parsed.metSummary];
  if (parsed.surfacePatches) next.surfacePatches = mergeSurfacePatchLayers(next.surfacePatches, parsed.surfacePatches);
  if (parsed.flowlines) next.flowlines = mergeFlowlineLayers(next.flowlines, parsed.flowlines);
  if (parsed.infrastructure) next.infrastructure = mergeInfrastructureLayers(next.infrastructure, parsed.infrastructure);
  if (parsed.subsurface) next.subsurface = mergeSubsurfaceLayers(next.subsurface, parsed.subsurface);
  if (parsed.calibration) next.calibration = { ...(next.calibration || {}), ...parsed.calibration };
  next.sources.push(...parsed.sources);
  return next;
}

export function summarizeLayerBundle(bundle) {
  if (!bundle || !bundle.sources?.length) {
    return "当前使用程序生成数据";
  }
  const layers = [];
  if (bundle.dem) layers.push("DEM");
  if (bundle.soilHydraulicConductivity || bundle.availableWaterCapacity || bundle.rootDepth) layers.push("土壤水文");
  if (bundle.imperviousFraction) layers.push("不透水面");
  if (bundle.soilGroup) layers.push("土壤");
  if (bundle.landCover) layers.push("土地覆盖");
  if (bundle.vegetation) layers.push("植被");
  if (bundle.leafAreaIndex) layers.push("LAI");
  if (bundle.temperature || bundle.precipitation || bundle.windSpeed || bundle.windDirection) layers.push("气象边界");
  if (bundle.surfacePatches) layers.push("地表情景");
  if (bundle.flowlines) layers.push("河网");
  if (bundle.infrastructure) layers.push("人造设施");
  if (bundle.subsurface) layers.push("地下观测");
  if (bundle.calibration) layers.push("校准");
  return `${layers.join(" / ")} · ${bundle.sources.length} 个文件`;
}

function normalizeLayerObject(input, role, sourceName) {
  if (role === "subsurface") {
    const subsurface = input.type === "FeatureCollection"
      ? geoJsonToSubsurfaceLayer(input, sourceName)
      : objectToSubsurfaceLayer(input, sourceName);
    return { sources: [sourceName], subsurface };
  }
  if (input.type === "FeatureCollection" && role === "hydrology") {
    const flowlines = geoJsonToFlowlineLayer(input, sourceName);
    if (flowlines) return { sources: [sourceName], flowlines };
  }
  if (input.type === "FeatureCollection" && role === "infrastructure") {
    const infrastructure = geoJsonToInfrastructureLayer(input, sourceName);
    if (infrastructure) return { sources: [sourceName], infrastructure };
  }
  if (input.type === "FeatureCollection" && ["surfaceScenario", "surfacePatch", "surfacePatches"].includes(role)) {
    const surfacePatches = geoJsonToSurfacePatchLayer(input, sourceName);
    if (surfacePatches) return { sources: [sourceName], surfacePatches };
  }
  const obj = input.type === "FeatureCollection" ? geoJsonToLayer(input, role, sourceName) : input;
  const width = Number(obj.width || obj.cols || obj.columns || obj.nx);
  const height = Number(obj.height || obj.rows || obj.ny);
  const parsed = { sources: [sourceName] };

  if (obj.calibration || role === "calibration") {
    parsed.calibration = normalizeCalibrationInput(obj.calibration || obj, sourceName);
  }

  const layerSpecs = [
    ["dem", ["dem", "elevation", "elevation_m"], Float32Array],
    ["landCover", ["landCover", "land_cover", "landcover", "nlcd", "nlcd_class", "classvalue", "gridcode"], Uint16Array],
    ["soilGroup", ["soilGroup", "soil_group", "hydrologic_soil_group", "hydrologic_group", "hsg", "hydgrp", "hydgrpdcd", "soil"], Uint8Array],
    ["soilHydraulicConductivity", ["soilHydraulicConductivity", "soil_hydraulic_conductivity", "ksat_mm_hr", "hydraulic_conductivity_mm_hr"], Float32Array],
    ["availableWaterCapacity", ["availableWaterCapacity", "available_water_capacity", "available_water_capacity_mm", "awc_mm"], Float32Array],
    ["rootDepth", ["rootDepth", "root_depth", "root_depth_m", "root_zone_depth_m"], Float32Array],
    ["imperviousFraction", ["imperviousFraction", "impervious_fraction", "impervious_percent", "impervious"], Float32Array],
    ["vegetation", ["vegetation", "vegetation_fraction", "ndvi"], Float32Array],
    ["leafAreaIndex", ["leafAreaIndex", "leaf_area_index", "lai"], Float32Array],
    ["canopyHeight", ["canopyHeight", "canopy_height", "canopy_height_m"], Float32Array],
    ["temperature", ["temperature", "temp_c"], Float32Array],
    ["precipitation", ["precipitation", "precip_mm_yr"], Float32Array],
    ["windSpeed", ["windSpeed", "wind_speed", "wind_speed_ms", "ws", "ws_ms"], Float32Array],
    ["windDirection", ["windDirection", "wind_direction", "wind_from_deg", "wdir"], Float32Array]
  ];

  for (const [key, names, Type] of layerSpecs) {
    const value = firstValue(obj, names);
    if (!value) continue;
    parsed[key] = makeRasterLayer(value, width, height, Type, obj, sourceName, key);
  }

  if (role === "met") addWindVectorObjectLayers(parsed, obj, width, height, sourceName);
  if (role === "met" && obj.metSummary) {
    parsed.metSummary = {
      ...obj.metSummary,
      sourceName: obj.metSummary.sourceName || sourceName
    };
  }

  const genericRaster = firstValue(obj, ["data", "values", "raster", "grid"]);
  if (genericRaster && !hasRasterLayer(parsed)) {
    const key = defaultLayerKeyForRole(role, sourceName);
    const Type = key === "landCover" ? Uint16Array : key === "soilGroup" ? Uint8Array : Float32Array;
    parsed[key] = makeRasterLayer(genericRaster, width, height, Type, obj, sourceName, key);
  }

  applyRoleAlias(parsed, role);
  return parsed;
}

function parseLayerCSV(text, role, sourceName) {
  const rows = text
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.split(",").map((part) => part.trim()));
  if (rows.length < 2) throw new Error(`${sourceName} 不包含可解析的表格数据`);

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const body = rows.slice(1);
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  const xKey = ["col", "x", "x_index", "grid_x", "x_km"].find((key) => key in idx);
  const yKey = ["row", "y", "y_index", "grid_y", "y_km"].find((key) => key in idx);
  const hasCoords = xKey && yKey;
  const hasTime = hasAnyColumn(idx, ["date", "datetime", "time", "year", "water_year"]);
  if (role === "subsurface") {
    return parseSubsurfaceCSV(body, idx, xKey, yKey, sourceName);
  }
  if (!hasCoords && role === "calibration" && hasDischargeColumn(idx)) {
    return parseCalibrationCSV(body, idx, sourceName);
  }
  if (!hasCoords && role === "met" && hasTime && hasMeteorologyColumn(idx)) {
    return parseMeteorologyTimeSeries(body, idx, sourceName);
  }
  if (hasCoords && role === "met" && hasTime && hasMeteorologyColumn(idx)) {
    return parseGriddedMeteorologyTimeSeries(body, idx, xKey, yKey, sourceName);
  }
  let width = 0;
  let height = 0;
  let xLookup = null;
  let yLookup = null;

  if (hasCoords) {
    const xs = uniqueSorted(body.map((row) => Number(row[idx[xKey]])));
    const ys = uniqueSorted(body.map((row) => Number(row[idx[yKey]])));
    xLookup = new Map(xs.map((v, i) => [String(v), i]));
    yLookup = new Map(ys.map((v, i) => [String(v), i]));
    width = xs.length;
    height = ys.length;
  } else {
    width = Math.round(Math.sqrt(body.length));
    height = Math.ceil(body.length / width);
  }

  const parsed = { sources: [sourceName] };
  const layerColumns = [
    ["dem", ["dem", "elevation", "elevation_m"], Float32Array],
    ["landCover", ["landcover", "land_cover", "nlcd", "nlcd_class", "classvalue", "gridcode"], Uint16Array],
    ["soilGroup", ["soil", "soil_group", "hydrologic_soil_group", "hydrologic_group", "hsg", "hydgrp", "hydgrpdcd"], Uint8Array],
    ["soilHydraulicConductivity", ["soil_hydraulic_conductivity", "ksat_mm_hr", "hydraulic_conductivity_mm_hr"], Float32Array],
    ["availableWaterCapacity", ["available_water_capacity", "available_water_capacity_mm", "awc_mm"], Float32Array],
    ["rootDepth", ["root_depth", "root_depth_m", "root_zone_depth_m"], Float32Array],
    ["imperviousFraction", ["impervious_fraction", "impervious_percent", "impervious"], Float32Array],
    ["vegetation", ["vegetation", "vegetation_fraction", "ndvi"], Float32Array],
    ["leafAreaIndex", ["leaf_area_index", "lai"], Float32Array],
    ["canopyHeight", ["canopy_height", "canopy_height_m"], Float32Array],
    ["temperature", ["temperature", "temp_c"], Float32Array],
    ["precipitation", ["precipitation", "precip_mm_yr"], Float32Array],
    ["windSpeed", ["wind_speed", "wind_speed_ms", "ws", "ws_ms"], Float32Array],
    ["windDirection", ["wind_direction", "wind_from_deg", "wdir"], Float32Array]
  ];
  const genericColumn = ["value", "data"].find((name) => name in idx);
  if (genericColumn) {
    const key = defaultLayerKeyForRole(role, sourceName);
    const Type = key === "landCover" ? Uint16Array : key === "soilGroup" ? Uint8Array : Float32Array;
    layerColumns.push([key, [genericColumn], Type]);
  }

  for (const [key, names, Type] of layerColumns) {
    const column = names.find((name) => name in idx);
    if (!column) continue;
    const data = new Type(width * height);
    data.fill(Type === Float32Array ? Number.NaN : 0);
    for (let r = 0; r < body.length; r += 1) {
      const row = body[r];
      const x = hasCoords ? xLookup.get(String(Number(row[idx[xKey]]))) : r % width;
      const y = hasCoords ? yLookup.get(String(Number(row[idx[yKey]]))) : Math.floor(r / width);
      data[y * width + x] = parseCellValue(row[idx[column]], key);
    }
    parsed[key] = makeRasterLayer(data, width, height, Type, {}, sourceName, key);
  }

  if (role === "met") addWindVectorCsvLayers(parsed, body, idx, width, height, hasCoords, xLookup, yLookup, xKey, yKey, sourceName);

  const calibrationColumns = [
    "observed_discharge_m3s",
    "discharge_m3s",
    "flow_m3s",
    "discharge_cfs",
    "flow_cfs",
    "discharge_bias",
    "runoff_multiplier",
    "precip_bias",
    "temp_bias"
  ];
  if (calibrationColumns.some((key) => key in idx)) {
    const row = body[0];
    parsed.calibration = normalizeCalibration(Object.fromEntries(calibrationColumns.map((key) => [key, row[idx[key]]])));
  }

  applyRoleAlias(parsed, role);
  return parsed;
}

async function parseGeoTiff(buffer, role, sourceName) {
  const { fromArrayBuffer } = await import("../vendor/geotiff.bundle.js");
  const tiff = await fromArrayBuffer(buffer);
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  const samples = Number(image.getSamplesPerPixel?.() || image.fileDirectory?.SamplesPerPixel || 1);
  const rasters = await image.readRasters({ interleave: true });
  const noData = Number(image.getGDALNoData());
  const meta = makeGeoTiffMeta(image, noData);
  const parsed = { sources: [sourceName] };
  const layerKey = inferGeoTiffLayerKey(role, sourceName);
  const readBand = (band) => {
    const data = new Float32Array(width * height);
    for (let i = 0; i < data.length; i += 1) {
      const value = Number(rasters[i * samples + Math.min(band, samples - 1)]);
      data[i] = Number.isFinite(noData) && value === noData ? Number.NaN : value;
    }
    return data;
  };

  if (role === "met" && samples >= 2 && layerKey === "metBundle") {
    parsed.precipitation = makeRasterLayer(readBand(0), width, height, Float32Array, meta, sourceName, "precipitation");
    parsed.temperature = makeRasterLayer(readBand(1), width, height, Float32Array, meta, sourceName, "temperature");
    if (samples >= 3) parsed.windSpeed = makeRasterLayer(readBand(2), width, height, Float32Array, meta, sourceName, "windSpeed");
    if (samples >= 4) parsed.windDirection = makeRasterLayer(readBand(3), width, height, Float32Array, meta, sourceName, "windDirection");
    return parsed;
  }

  if (role === "landCover" && samples >= 2 && layerKey === "landCover") {
    parsed.landCover = makeRasterLayer(readBand(0), width, height, Uint16Array, meta, sourceName, "landCover");
    parsed.vegetation = makeRasterLayer(readBand(1), width, height, Float32Array, meta, sourceName, "vegetation");
    if (samples >= 3) parsed.canopyHeight = makeRasterLayer(readBand(2), width, height, Float32Array, meta, sourceName, "canopyHeight");
    if (samples >= 4) parsed.leafAreaIndex = makeRasterLayer(readBand(3), width, height, Float32Array, meta, sourceName, "leafAreaIndex");
    return parsed;
  }
  if (role === "soil" && samples >= 2 && layerKey === "soilGroup") {
    parsed.soilGroup = makeRasterLayer(readBand(0), width, height, Uint8Array, meta, sourceName, "soilGroup");
    parsed.soilHydraulicConductivity = makeRasterLayer(readBand(1), width, height, Float32Array, meta, sourceName, "soilHydraulicConductivity");
    if (samples >= 3) parsed.availableWaterCapacity = makeRasterLayer(readBand(2), width, height, Float32Array, meta, sourceName, "availableWaterCapacity");
    if (samples >= 4) parsed.rootDepth = makeRasterLayer(readBand(3), width, height, Float32Array, meta, sourceName, "rootDepth");
    if (samples >= 5) parsed.imperviousFraction = makeRasterLayer(readBand(4), width, height, Float32Array, meta, sourceName, "imperviousFraction");
    return parsed;
  }

  const Type = layerKey === "landCover" ? Uint16Array : layerKey === "soilGroup" ? Uint8Array : Float32Array;
  parsed[layerKey === "metBundle" ? "precipitation" : layerKey] = makeRasterLayer(readBand(0), width, height, Type, meta, sourceName, layerKey === "metBundle" ? "precipitation" : layerKey);
  return parsed;
}

function makeGeoTiffMeta(image, noData) {
  let bbox = null;
  try {
    bbox = image.getBoundingBox?.();
  } catch {
    bbox = null;
  }
  let resolution = null;
  try {
    resolution = image.getResolution?.();
  } catch {
    resolution = null;
  }
  const geoKeys = image.geoKeys || image.getGeoKeys?.() || {};
  const directory = image.fileDirectory || {};
  const gdalMetadata = image.getGDALMetadata?.() || directory.GDAL_METADATA || directory.GDALMetadata || {};
  const epsg = geoKeys.ProjectedCSTypeGeoKey || geoKeys.GeographicTypeGeoKey;
  const isGeographic = Boolean(geoKeys.GeographicTypeGeoKey && !geoKeys.ProjectedCSTypeGeoKey);
  const unitCode = geoKeys.ProjLinearUnitsGeoKey || geoKeys.GeogAngularUnitsGeoKey || null;
  const pixelSizeUnit = isGeographic ? "degree" : unitNameFromGeoKey(unitCode) || "projected-crs-unit";
  return {
    sourceFormat: "GeoTIFF",
    noData,
    bounds: bbox,
    crs: epsg ? `EPSG:${epsg}` : "GeoTIFF",
    projection: geoKeys.ProjectedCSTypeGeoKey || geoKeys.GeographicTypeGeoKey || "GeoTIFF",
    nativePixelSize: normalizePixelSizeMeta(resolution || directory.ModelPixelScale, pixelSizeUnit),
    modelPixelScale: numericArray(directory.ModelPixelScale),
    modelTiepoint: numericArray(directory.ModelTiepoint),
    modelTransformation: numericArray(directory.ModelTransformation),
    pixelSizeUnit,
    linearUnitCode: unitCode || null,
    verticalUnitCode: geoKeys.VerticalUnitsGeoKey || null,
    verticalUnit: unitNameFromGeoKey(geoKeys.VerticalUnitsGeoKey) || null,
    valueUnit: extractGeoTiffMetadataValue(gdalMetadata, ["UNITTYPE", "unit", "units", "UnitType"]) || null,
    scaleFactor: extractGeoTiffMetadataNumber(gdalMetadata, ["scale", "Scale", "SCALE", "scale_factor", "scaleFactor"]),
    addOffset: extractGeoTiffMetadataNumber(gdalMetadata, ["offset", "Offset", "OFFSET", "add_offset", "addOffset"]),
    sampleFormat: numericArray(directory.SampleFormat),
    bitsPerSample: numericArray(directory.BitsPerSample)
  };
}

function inferGeoTiffLayerKey(role, sourceName) {
  const name = sourceName.toLowerCase();
  if (role === "soil") {
    if (/(ksat|hydraulic[_-]?conductivity|conductivity)/.test(name)) return "soilHydraulicConductivity";
    if (/(awc|available[_-]?water|plant[_-]?available[_-]?water)/.test(name)) return "availableWaterCapacity";
    if (/(root[_-]?depth|rootzone|soil[_-]?depth)/.test(name)) return "rootDepth";
    if (/(impervious|sealed|built[_-]?surface)/.test(name)) return "imperviousFraction";
    return "soilGroup";
  }
  if (role === "dem") return "dem";
  if (role === "landCover") {
    if (/(ndvi|vegetation|veg|cover_fraction)/.test(name)) return "vegetation";
    if (/(lai|leaf[_-]?area)/.test(name)) return "leafAreaIndex";
    if (/(canopy|tree_height|chm)/.test(name)) return "canopyHeight";
    return "landCover";
  }
  if (role === "met") {
    if (/(temp|tmean|tas|air_temperature)/.test(name)) return "temperature";
    if (/(wind[_-]?dir|wdir|direction)/.test(name)) return "windDirection";
    if (/(wind|ws|speed|u10|v10)/.test(name)) return "windSpeed";
    if (/(ppt|prcp|precip|rain|precipitation)/.test(name)) return "precipitation";
    return "metBundle";
  }
  return "dem";
}

function makeRasterLayer(value, width, height, Type, meta, sourceName, semanticKey = "") {
  const normalized = normalizeRasterValues(value, semanticKey, meta, Type);
  const data = Type === Float32Array ? normalized.data : new Type(Array.from(normalized.data, (v) => (Number.isFinite(v) ? Math.round(v) : 0)));
  const inferred = inferGrid(data.length, width, height);
  const nativePixelSize = normalizePixelSizeMeta(
    meta.nativeCellSizeM ||
      meta.nativePixelSizeM ||
      meta.nativePixelSize ||
      meta.pixelSizeM ||
      meta.cellSizeM ||
      meta.resolutionM ||
      meta.resolution_m ||
      meta.cell_size_m,
    meta.pixelSizeUnit || meta.pixelSizeUnits || meta.unit || meta.units || null
  );
  return {
    width: inferred.width,
    height: inferred.height,
    data,
    noData: Number.isFinite(Number(meta.noData)) ? Number(meta.noData) : Number.NaN,
    sourceName,
    boundsKm: meta.boundsKm || meta.bounds_km ? normalizeBounds(meta.boundsKm || meta.bounds_km) : null,
    bounds: normalizeBounds(meta.bounds || meta.boundsKm || meta.bounds_km || DEFAULT_BOUNDS_KM),
    crs: meta.crs || meta.projection || "local-grid",
    sourceFormat: meta.sourceFormat || meta.format || null,
    nativeCellSizeM: nativePixelSize,
    nativePixelSizeM: nativePixelSize,
    pixelSizeUnit: nativePixelSize?.unit || meta.pixelSizeUnit || meta.pixelSizeUnits || null,
    modelPixelScale: numericArray(meta.modelPixelScale),
    modelTiepoint: numericArray(meta.modelTiepoint),
    modelTransformation: numericArray(meta.modelTransformation),
    verticalUnit: meta.verticalUnit || meta.elevationUnit || meta.zUnit || null,
    valueUnit: normalized.valueUnit,
    normalizedValueUnit: normalized.normalizedValueUnit,
    scaleFactor: normalized.scaleFactor,
    addOffset: normalized.addOffset,
    appliedScaleFactor: normalized.appliedScaleFactor,
    appliedAddOffset: normalized.appliedAddOffset,
    unitConversionFactor: normalized.unitConversionFactor,
    unitConversionOffset: normalized.unitConversionOffset,
    unitConversionDescription: normalized.unitConversionDescription,
    normalizationWarnings: normalized.warnings,
    rasterizedVector: Boolean(meta.rasterizedVector),
    vectorFeatureCount: Number.isFinite(Number(meta.vectorFeatureCount)) ? Number(meta.vectorFeatureCount) : null
  };
}

function normalizeRasterValues(value, semanticKey, meta = {}, Type = Float32Array) {
  const key = String(semanticKey || "");
  const noData = Number(meta.noData);
  const raw = Array.from(value || [], (item) => {
    const parsed = parseCellValue(item, key);
    if (Number.isFinite(noData) && Number(parsed) === noData) return Number.NaN;
    return parsed;
  });
  const scaleFactor = finiteOrNull(meta.scaleFactor ?? meta.scale_factor ?? meta.dataScale);
  const addOffset = finiteOrNull(meta.addOffset ?? meta.add_offset ?? meta.valueOffset ?? meta.dataOffset);
  const categorical = Type !== Float32Array || key === "landCover" || key === "soilGroup";
  const valueUnit = rasterValueUnit(key, meta);
  const unitTransform = categorical ? null : unitTransformForLayer(key, valueUnit);
  const appliedScaleFactor = categorical ? 1 : firstFinite(scaleFactor, 1);
  const appliedAddOffset = categorical ? 0 : firstFinite(addOffset, 0);
  const data = new Float32Array(raw.length);
  const warnings = [];

  for (let i = 0; i < raw.length; i += 1) {
    let v = raw[i];
    if (!Number.isFinite(v)) {
      data[i] = Number.NaN;
      continue;
    }
    if (!categorical) {
      v = v * appliedScaleFactor + appliedAddOffset;
      if (unitTransform) v = v * unitTransform.factor + unitTransform.offset;
    }
    data[i] = v;
  }

  if (categorical && (scaleFactor != null || addOffset != null)) {
    warnings.push(`${key || "categorical raster"} scale/offset metadata was ignored because the layer is categorical`);
  }
  if (!categorical && !unitTransform && valueUnit && needsKnownUnit(key)) {
    warnings.push(`${key} value unit "${valueUnit}" was not converted; verify it already matches model units`);
  }
  if (!categorical && !valueUnit && needsKnownUnit(key)) {
    warnings.push(`${key} value unit is missing; assuming ${defaultModelUnit(key)}`);
  }

  return {
    data,
    valueUnit,
    normalizedValueUnit: categorical ? valueUnit : unitTransform?.normalizedUnit || defaultModelUnit(key),
    scaleFactor,
    addOffset,
    appliedScaleFactor,
    appliedAddOffset,
    unitConversionFactor: categorical ? null : unitTransform?.factor ?? 1,
    unitConversionOffset: categorical ? null : unitTransform?.offset ?? 0,
    unitConversionDescription: unitTransform?.description || null,
    warnings
  };
}

function rasterValueUnit(key, meta = {}) {
  if (key === "dem") return meta.verticalUnit || meta.elevationUnit || meta.zUnit || meta.valueUnit || meta.units || meta.unit || null;
  return meta.valueUnit || meta.units || meta.unit || meta.verticalUnit || null;
}

function unitTransformForLayer(key, unit) {
  const text = String(unit || "").trim().toLowerCase();
  if (!text) return null;
  if (["dem", "canopyHeight", "rootDepth"].includes(key)) return lengthToMetersTransform(text);
  if (["precipitation", "availableWaterCapacity"].includes(key)) return depthToMillimetersTransform(text);
  if (key === "soilHydraulicConductivity") return hydraulicConductivityToMmHrTransform(text);
  if (key === "temperature") return temperatureToCelsiusTransform(text);
  if (key === "windSpeed") return speedToMetersPerSecondTransform(text);
  if (key === "vegetation" || key === "imperviousFraction") return fractionTransform(text);
  if (key === "windDirection") return angleTransform(text);
  return null;
}

function lengthToMetersTransform(unit) {
  if (/(us survey foot|survey foot|us_survey_foot)/.test(unit)) return unitTransform(1200 / 3937, 0, "m", "US survey feet converted to meters");
  if (/(foot|feet|\bft\b)/.test(unit)) return unitTransform(0.3048, 0, "m", "feet converted to meters");
  if (/(centimeter|centimetre|\bcm\b)/.test(unit)) return unitTransform(0.01, 0, "m", "centimeters converted to meters");
  if (/(millimeter|millimetre|\bmm\b)/.test(unit)) return unitTransform(0.001, 0, "m", "millimeters converted to meters");
  if (/(metre|meter|\bm\b)/.test(unit)) return unitTransform(1, 0, "m", "length already in meters");
  return null;
}

function depthToMillimetersTransform(unit) {
  if (/(millimeter|millimetre|\bmm\b)/.test(unit)) return unitTransform(1, 0, "mm", "depth already in millimeters");
  if (/(centimeter|centimetre|\bcm\b)/.test(unit)) return unitTransform(10, 0, "mm", "centimeters converted to millimeters");
  if (/(metre|meter|\bm\b)/.test(unit)) return unitTransform(1000, 0, "mm", "meters converted to millimeters");
  if (/(inch|\bin\b)/.test(unit)) return unitTransform(25.4, 0, "mm", "inches converted to millimeters");
  if (/(foot|feet|\bft\b)/.test(unit)) return unitTransform(304.8, 0, "mm", "feet converted to millimeters");
  return null;
}

function hydraulicConductivityToMmHrTransform(unit) {
  if (/(mm\/?h|mm hr|mm per hour|millimeter.*hour|millimetre.*hour)/.test(unit)) return unitTransform(1, 0, "mm/hr", "hydraulic conductivity already in mm/hr");
  if (/(cm\/?h|cm hr|cm per hour|centimeter.*hour|centimetre.*hour)/.test(unit)) return unitTransform(10, 0, "mm/hr", "cm/hr converted to mm/hr");
  if (/(m\/?h|m hr|m per hour|meter.*hour|metre.*hour)/.test(unit)) return unitTransform(1000, 0, "mm/hr", "m/hr converted to mm/hr");
  if (/(m\/?s|m s-1|meter.*second|metre.*second)/.test(unit)) return unitTransform(3_600_000, 0, "mm/hr", "m/s converted to mm/hr");
  if (/(in\/?h|inch.*hour)/.test(unit)) return unitTransform(25.4, 0, "mm/hr", "in/hr converted to mm/hr");
  return null;
}

function temperatureToCelsiusTransform(unit) {
  if (/(celsius|degree_c|degc|°c|\bc\b)/.test(unit)) return unitTransform(1, 0, "C", "temperature already in Celsius");
  if (/(kelvin|\bk\b)/.test(unit)) return unitTransform(1, -273.15, "C", "Kelvin converted to Celsius");
  if (/(fahrenheit|degree_f|degf|°f|\bf\b)/.test(unit)) return unitTransform(5 / 9, -32 * 5 / 9, "C", "Fahrenheit converted to Celsius");
  return null;
}

function speedToMetersPerSecondTransform(unit) {
  if (/(m\/?s|m s-1|meter.*second|metre.*second)/.test(unit)) return unitTransform(1, 0, "m/s", "speed already in m/s");
  if (/(km\/?h|kph|kilometer.*hour|kilometre.*hour)/.test(unit)) return unitTransform(1 / 3.6, 0, "m/s", "km/h converted to m/s");
  if (/(mph|mile.*hour)/.test(unit)) return unitTransform(0.44704, 0, "m/s", "mph converted to m/s");
  if (/(knot|kt\b)/.test(unit)) return unitTransform(0.514444, 0, "m/s", "knots converted to m/s");
  return null;
}

function fractionTransform(unit) {
  if (/(percent|percentage|%)/.test(unit)) return unitTransform(0.01, 0, "fraction", "percent converted to fraction");
  if (/(fraction|ratio|unitless|1)/.test(unit)) return unitTransform(1, 0, "fraction", "fraction already unitless");
  return null;
}

function angleTransform(unit) {
  if (/(degree|deg|°)/.test(unit)) return unitTransform(1, 0, "degree", "angle already in degrees");
  if (/(radian|rad)/.test(unit)) return unitTransform(180 / Math.PI, 0, "degree", "radians converted to degrees");
  return null;
}

function unitTransform(factor, offset, normalizedUnit, description) {
  return { factor, offset, normalizedUnit, description };
}

function needsKnownUnit(key) {
  return [
    "dem",
    "canopyHeight",
    "rootDepth",
    "precipitation",
    "availableWaterCapacity",
    "soilHydraulicConductivity",
    "temperature",
    "windSpeed",
    "vegetation",
    "imperviousFraction",
    "windDirection"
  ].includes(key);
}

function defaultModelUnit(key) {
  if (["dem", "canopyHeight", "rootDepth"].includes(key)) return "m";
  if (["precipitation", "availableWaterCapacity"].includes(key)) return "mm";
  if (key === "soilHydraulicConductivity") return "mm/hr";
  if (key === "temperature") return "C";
  if (key === "windSpeed") return "m/s";
  if (key === "windDirection") return "degree";
  if (key === "vegetation" || key === "imperviousFraction") return "fraction";
  return null;
}

function addWindVectorObjectLayers(parsed, obj, width, height, sourceName) {
  if (!hasWindVectorColumns(Object.fromEntries(Object.keys(obj).map((key) => [key.toLowerCase(), true])))) return;
  const uValue = firstValue(obj, WIND_U_COLUMNS);
  const vValue = firstValue(obj, WIND_V_COLUMNS);
  if (!uValue || !vValue) return;
  const uLayer = makeRasterLayer(uValue, width, height, Float32Array, obj, sourceName, "windSpeed");
  const vLayer = makeRasterLayer(vValue, uLayer.width, uLayer.height, Float32Array, obj, sourceName, "windSpeed");
  const vectors = makeWindVectorRasters(uLayer.data, vLayer.data);
  if (!parsed.windSpeed) parsed.windSpeed = makeRasterLayer(vectors.speed, uLayer.width, uLayer.height, Float32Array, uLayer, sourceName, "windSpeed");
  if (!parsed.windDirection) {
    parsed.windDirection = makeRasterLayer(vectors.direction, uLayer.width, uLayer.height, Float32Array, uLayer, sourceName, "windDirection");
  }
}

function addWindVectorCsvLayers(parsed, body, idx, width, height, hasCoords, xLookup, yLookup, xKey, yKey, sourceName) {
  if (!hasWindVectorColumns(idx) || (parsed.windSpeed && parsed.windDirection)) return;
  const speed = new Float32Array(width * height);
  const direction = new Float32Array(width * height);
  speed.fill(Number.NaN);
  direction.fill(Number.NaN);
  for (let r = 0; r < body.length; r += 1) {
    const row = body[r];
    const x = hasCoords ? xLookup.get(String(Number(row[idx[xKey]]))) : r % width;
    const y = hasCoords ? yLookup.get(String(Number(row[idx[yKey]]))) : Math.floor(r / width);
    if (x == null || y == null) continue;
    const vector = windVectorFromColumns(row, idx);
    if (!vector) continue;
    const i = y * width + x;
    speed[i] = vector.speed;
    direction[i] = vector.direction;
  }
  if (!parsed.windSpeed) parsed.windSpeed = makeRasterLayer(speed, width, height, Float32Array, {}, sourceName, "windSpeed");
  if (!parsed.windDirection) parsed.windDirection = makeRasterLayer(direction, width, height, Float32Array, {}, sourceName, "windDirection");
}

function makeWindVectorRasters(uData, vData) {
  const speed = new Float32Array(uData.length);
  const direction = new Float32Array(uData.length);
  speed.fill(Number.NaN);
  direction.fill(Number.NaN);
  for (let i = 0; i < uData.length; i += 1) {
    const vector = windVectorToSpeedDirection(uData[i], vData[i]);
    if (!vector) continue;
    speed[i] = vector.speed;
    direction[i] = vector.direction;
  }
  return { speed, direction };
}

function normalizeBounds(bounds) {
  if (!Array.isArray(bounds) || bounds.length < 4) return [...DEFAULT_BOUNDS_KM];
  return bounds.slice(0, 4).map((value) => Number(value));
}

function inferGrid(length, width, height) {
  if (width && height && width * height === length) return { width, height };
  const side = Math.round(Math.sqrt(length));
  if (side * side === length) return { width: side, height: side };
  if (width && length % width === 0) return { width, height: length / width };
  throw new Error(`Cannot infer raster dimensions for ${length} cells`);
}

function parseCellValue(value, key = "") {
  if (value == null || value === "" || String(value).toLowerCase() === "nodata") return Number.NaN;
  if (key === "soilGroup") return soilGroupToNumber(value);
  const n = Number(value);
  return Number.isFinite(n) ? n : soilGroupToNumber(value);
}

function parseMeteorologyTimeSeries(body, idx, sourceName) {
  const yearly = new Map();
  const windSpeeds = [];
  const windDirections = [];
  const allTemps = [];
  const dailySeries = [];

  for (const row of body) {
    const year = rowYear(row, idx);
    if (!Number.isFinite(year)) continue;
    const date = rowDate(row, idx);
    const bucket = yearly.get(year) || { precip: 0, precipCount: 0, temps: [] };
    const annualPrecip = numberFromColumns(row, idx, ["precip_mm_yr", "precipitation"]);
    const dailyPrecip = numberFromColumns(row, idx, ["prcp", "prcp_mm", "ppt_mm", "rain_mm"]);
    if (Number.isFinite(annualPrecip)) {
      bucket.precip += annualPrecip;
      bucket.precipCount += 1;
    } else if (Number.isFinite(dailyPrecip)) {
      bucket.precip += dailyPrecip;
      bucket.precipCount += 1;
    }

    const tmean = numberFromColumns(row, idx, ["tmean", "temp_c", "temperature"]);
    const tmax = numberFromColumns(row, idx, ["tmax", "tmax_c"]);
    const tmin = numberFromColumns(row, idx, ["tmin", "tmin_c"]);
    const temp = Number.isFinite(tmean) ? tmean : Number.isFinite(tmax) && Number.isFinite(tmin) ? (tmax + tmin) / 2 : Number.NaN;
    if (Number.isFinite(temp)) {
      bucket.temps.push(temp);
      allTemps.push(temp);
    }

    const windVector = windVectorFromColumns(row, idx);
    const windSpeed = numberFromColumns(row, idx, ["wind_speed", "wind_speed_ms", "ws", "ws_ms"]);
    if (Number.isFinite(windSpeed)) windSpeeds.push(windSpeed);
    else if (windVector) windSpeeds.push(windVector.speed);
    const windDirection = numberFromColumns(row, idx, ["wind_direction", "wind_from_deg", "wdir"]);
    if (Number.isFinite(windDirection)) windDirections.push(windDirection);
    else if (windVector) windDirections.push(windVector.direction);
    if (date && (Number.isFinite(dailyPrecip) || Number.isFinite(temp) || Number.isFinite(windSpeed) || windVector)) {
      dailySeries.push({
        date,
        year,
        precipitationMm: Number.isFinite(dailyPrecip) ? dailyPrecip : null,
        temperatureC: Number.isFinite(temp) ? temp : null,
        windSpeedMs: Number.isFinite(windSpeed) ? windSpeed : windVector?.speed ?? null,
        windFromDeg: Number.isFinite(windDirection) ? windDirection : windVector?.direction ?? null
      });
    }
    yearly.set(year, bucket);
  }

  const annualPrecipValues = [];
  const annualTempValues = [];
  const annualPrecipitationSeries = [];
  for (const [year, bucket] of yearly.entries()) {
    if (bucket.precipCount > 0) annualPrecipValues.push(bucket.precip);
    if (bucket.temps.length) annualTempValues.push(mean(bucket.temps));
    annualPrecipitationSeries.push({
      year,
      precipitationMm: bucket.precipCount > 0 ? bucket.precip : null,
      meanTemperatureC: bucket.temps.length ? mean(bucket.temps) : null
    });
  }

  const parsed = { sources: [sourceName] };
  const compactDaily = compactDailySeries(dailySeries, 5000);
  const summary = {
    sourceName,
    type: "meteorology-time-series",
    years: Array.from(yearly.keys()).sort((a, b) => a - b),
    recordCount: body.length,
    annualPrecipitationMm: meanOrNaN(annualPrecipValues),
    meanTemperatureC: meanOrNaN(annualTempValues.length ? annualTempValues : allTemps),
    meanWindSpeedMs: meanOrNaN(windSpeeds),
    circularWindDirectionDeg: circularMean(windDirections),
    annualPrecipitationSeries: annualPrecipitationSeries.sort((a, b) => a.year - b.year),
    boundaryStatistics: summarizeMeteorologyBoundarySeries(dailySeries, annualPrecipitationSeries),
    dailySeries: compactDaily
  };

  if (Number.isFinite(summary.annualPrecipitationMm)) {
    parsed.precipitation = makeScalarLayer(summary.annualPrecipitationMm, Float32Array, sourceName, "annual precip from time series", "precipitation");
  }
  if (Number.isFinite(summary.meanTemperatureC)) {
    parsed.temperature = makeScalarLayer(summary.meanTemperatureC, Float32Array, sourceName, "mean temperature from time series", "temperature");
  }
  if (Number.isFinite(summary.meanWindSpeedMs)) {
    parsed.windSpeed = makeScalarLayer(summary.meanWindSpeedMs, Float32Array, sourceName, "mean wind speed from time series", "windSpeed");
  }
  if (Number.isFinite(summary.circularWindDirectionDeg)) {
    parsed.windDirection = makeScalarLayer(summary.circularWindDirectionDeg, Float32Array, sourceName, "circular mean wind direction from time series", "windDirection");
  }
  parsed.metSummary = summary;
  return parsed;
}

function parseGriddedMeteorologyTimeSeries(body, idx, xKey, yKey, sourceName) {
  const xs = uniqueSorted(body.map((row) => Number(row[idx[xKey]])));
  const ys = uniqueSorted(body.map((row) => Number(row[idx[yKey]])));
  const width = xs.length;
  const height = ys.length;
  const xLookup = new Map(xs.map((v, i) => [String(v), i]));
  const yLookup = new Map(ys.map((v, i) => [String(v), i]));
  const cells = Array.from({ length: width * height }, () => ({
    precipAnnualByYear: new Map(),
    precipDailyByYear: new Map(),
    temps: [],
    windSpeeds: [],
    windDirs: [],
    recordCount: 0
  }));
  const years = new Set();
  const daily = new Map();

  for (const row of body) {
    const x = xLookup.get(String(Number(row[idx[xKey]])));
    const y = yLookup.get(String(Number(row[idx[yKey]])));
    if (x == null || y == null) continue;
    const cell = cells[y * width + x];
    cell.recordCount += 1;
    const year = rowYear(row, idx);
    if (Number.isFinite(year)) years.add(year);
    const date = rowDate(row, idx);

    const annualPrecip = numberFromColumns(row, idx, ["precip_mm_yr", "precipitation"]);
    const dailyPrecip = numberFromColumns(row, idx, ["prcp", "prcp_mm", "ppt_mm", "rain_mm"]);
    if (Number.isFinite(annualPrecip)) {
      const bucket = cell.precipAnnualByYear.get(year) || [];
      bucket.push(annualPrecip);
      cell.precipAnnualByYear.set(year, bucket);
    } else if (Number.isFinite(dailyPrecip)) {
      cell.precipDailyByYear.set(year, (cell.precipDailyByYear.get(year) || 0) + dailyPrecip);
    }

    const tmean = numberFromColumns(row, idx, ["tmean", "temp_c", "temperature"]);
    const tmax = numberFromColumns(row, idx, ["tmax", "tmax_c"]);
    const tmin = numberFromColumns(row, idx, ["tmin", "tmin_c"]);
    const temp = Number.isFinite(tmean) ? tmean : Number.isFinite(tmax) && Number.isFinite(tmin) ? (tmax + tmin) / 2 : Number.NaN;
    if (Number.isFinite(temp)) cell.temps.push(temp);

    const windVector = windVectorFromColumns(row, idx);
    const windSpeed = numberFromColumns(row, idx, ["wind_speed", "wind_speed_ms", "ws", "ws_ms"]);
    if (Number.isFinite(windSpeed)) cell.windSpeeds.push(windSpeed);
    else if (windVector) cell.windSpeeds.push(windVector.speed);
    const windDirection = numberFromColumns(row, idx, ["wind_direction", "wind_from_deg", "wdir"]);
    if (Number.isFinite(windDirection)) cell.windDirs.push(windDirection);
    else if (windVector) cell.windDirs.push(windVector.direction);

    if (date) {
      const day = daily.get(date) || {
        date,
        precipSum: 0,
        precipCount: 0,
        tempSum: 0,
        tempCount: 0,
        windSpeedSum: 0,
        windSpeedCount: 0,
        windDirX: 0,
        windDirY: 0,
        windDirCount: 0
      };
      if (Number.isFinite(dailyPrecip)) {
        day.precipSum += dailyPrecip;
        day.precipCount += 1;
      }
      if (Number.isFinite(temp)) {
        day.tempSum += temp;
        day.tempCount += 1;
      }
      const resolvedWindSpeed = Number.isFinite(windSpeed) ? windSpeed : windVector?.speed;
      const resolvedWindDirection = Number.isFinite(windDirection) ? windDirection : windVector?.direction;
      if (Number.isFinite(resolvedWindSpeed)) {
        day.windSpeedSum += resolvedWindSpeed;
        day.windSpeedCount += 1;
      }
      if (Number.isFinite(resolvedWindDirection)) {
        const rad = (resolvedWindDirection * Math.PI) / 180;
        day.windDirX += Math.cos(rad);
        day.windDirY += Math.sin(rad);
        day.windDirCount += 1;
      }
      daily.set(date, day);
    }
  }

  const precipitation = new Float32Array(width * height);
  const temperature = new Float32Array(width * height);
  const windSpeed = new Float32Array(width * height);
  const windDirection = new Float32Array(width * height);
  precipitation.fill(Number.NaN);
  temperature.fill(Number.NaN);
  windSpeed.fill(Number.NaN);
  windDirection.fill(Number.NaN);

  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i];
    const annualValues = [];
    for (const vals of cell.precipAnnualByYear.values()) annualValues.push(mean(vals));
    for (const total of cell.precipDailyByYear.values()) annualValues.push(total);
    if (annualValues.length) precipitation[i] = mean(annualValues);
    if (cell.temps.length) temperature[i] = mean(cell.temps);
    if (cell.windSpeeds.length) windSpeed[i] = mean(cell.windSpeeds);
    if (cell.windDirs.length) windDirection[i] = circularMean(cell.windDirs);
  }

  const meta = { boundsKm: inferBoundsKmFromCoordinates(xs, ys), note: "gridded met time series aggregate" };
  const dailySeries = Array.from(daily.values())
    .map((row) => ({
      date: row.date,
      year: yearFromDate(row.date),
      precipitationMm: row.precipCount ? row.precipSum / row.precipCount : null,
      temperatureC: row.tempCount ? row.tempSum / row.tempCount : null,
      windSpeedMs: row.windSpeedCount ? row.windSpeedSum / row.windSpeedCount : null,
      windFromDeg: row.windDirCount ? ((Math.atan2(row.windDirY, row.windDirX) * 180) / Math.PI + 360) % 360 : null
    }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const annualPrecipitationSeries = annualPrecipitationRowsFromDailySeries(dailySeries);
  const parsed = {
    sources: [sourceName],
    precipitation: makeRasterLayer(precipitation, width, height, Float32Array, meta, sourceName, "precipitation"),
    temperature: makeRasterLayer(temperature, width, height, Float32Array, meta, sourceName, "temperature"),
    windSpeed: makeRasterLayer(windSpeed, width, height, Float32Array, meta, sourceName, "windSpeed"),
    windDirection: makeRasterLayer(windDirection, width, height, Float32Array, meta, sourceName, "windDirection")
  };
  parsed.metSummary = {
    sourceName,
    type: "gridded-meteorology-time-series",
    width,
    height,
    gridCellCount: width * height,
    recordCount: body.length,
    years: Array.from(years).filter(Number.isFinite).sort((a, b) => a - b),
    annualPrecipitationMm: meanFiniteArray(precipitation),
    meanTemperatureC: meanFiniteArray(temperature),
    meanWindSpeedMs: meanFiniteArray(windSpeed),
    circularWindDirectionDeg: circularMean(Array.from(windDirection).filter(Number.isFinite)),
    annualPrecipitationSeries,
    boundaryStatistics: summarizeMeteorologyBoundarySeries(dailySeries, annualPrecipitationSeries),
    dailySeries: compactDailySeries(dailySeries, 5000)
  };
  return parsed;
}

function parseCalibrationCSV(body, idx, sourceName) {
  const values = [];
  const dated = [];
  for (const row of body) {
    let value = numberFromColumns(row, idx, ["observed_discharge_m3s", "discharge_m3s", "flow_m3s", "q_m3s", "streamflow_m3s"]);
    const cfs = numberFromColumns(row, idx, ["discharge_cfs", "flow_cfs", "q_cfs", "00060"]);
    if (!Number.isFinite(value) && Number.isFinite(cfs)) value = cfs * 0.028316846592;
    if (!Number.isFinite(value)) continue;
    values.push(value);
    dated.push({ date: rowDate(row, idx), year: rowYear(row, idx), value });
  }

  const scalar = {};
  for (const key of [
    "precip_bias",
    "temp_bias",
    "runoff_multiplier",
    "discharge_scale",
    "discharge_bias",
    "drainage_area_km2",
    "drainage_area_sq_km",
    "drainage_area_sqmi",
    "drainage_area_mi2",
    "contributing_drainage_area_km2",
    "contrib_drainage_area_km2",
    "gage_lat",
    "gage_lon",
    "site_latitude",
    "site_longitude",
    "site_code",
    "site_name",
    "station_id",
    "station_name"
  ]) {
    if (key in idx) scalar[key] = body[0]?.[idx[key]];
  }
  if (!values.length && "observed_discharge_m3s" in idx) scalar.observed_discharge_m3s = body[0]?.[idx.observed_discharge_m3s];
  const summary = summarizeObservedDischarge(values, dated, sourceName);
  return {
    sources: [sourceName],
    calibration: normalizeCalibration({
      ...scalar,
      observedDischargeM3s: summary.meanDischargeM3s,
      observedSeries: summary
    })
  };
}

function summarizeObservedDischarge(values, dated, sourceName) {
  const annual = new Map();
  for (const item of dated) {
    if (!Number.isFinite(item.year)) continue;
    const bucket = annual.get(item.year) || [];
    bucket.push(item.value);
    annual.set(item.year, bucket);
  }
  const annualMeans = Array.from(annual.entries()).map(([year, vals]) => ({ year, meanDischargeM3s: mean(vals) }));
  const sorted = values.slice().sort((a, b) => a - b);
  return {
    sourceName,
    type: "observed-discharge-time-series",
    unit: "m3/s",
    recordCount: values.length,
    startDate: dated.map((item) => item.date).filter(Boolean).sort()[0] || null,
    endDate: dated.map((item) => item.date).filter(Boolean).sort().at(-1) || null,
    meanDischargeM3s: meanOrNaN(values),
    medianDischargeM3s: quantile(sorted, 0.5),
    p10DischargeM3s: quantile(sorted, 0.1),
    p90DischargeM3s: quantile(sorted, 0.9),
    annualMeans,
    samples: compactObservedSamples(dated, 5000)
  };
}

function compactObservedSamples(dated, limit) {
  return compactDailySeries(
    dated
      .filter((item) => Number.isFinite(Number(item.value)))
      .map((item) => ({
        date: item.date || null,
        year: Number.isFinite(item.year) ? item.year : yearFromDate(item.date),
        dischargeM3s: Number(item.value)
      })),
    limit
  );
}

function compactDailySeries(series, limit) {
  if (!Array.isArray(series) || !series.length) return [];
  const clean = series
    .filter((item) => item && (item.date || Number.isFinite(Number(item.year))))
    .map((item) => ({
      ...item,
      date: item.date ? String(item.date).slice(0, 10) : null
    }))
    .sort((a, b) => String(a.date || a.year || "").localeCompare(String(b.date || b.year || "")));
  if (clean.length <= limit) return clean;
  const step = clean.length / limit;
  const sampled = [];
  for (let i = 0; i < limit; i += 1) sampled.push(clean[Math.floor(i * step)]);
  return sampled;
}

function annualPrecipitationRowsFromDailySeries(series) {
  const yearly = new Map();
  for (const row of series || []) {
    const year = Number(row.year ?? yearFromDate(row.date));
    const precipitation = Number(row.precipitationMm);
    if (!Number.isFinite(year) || !Number.isFinite(precipitation)) continue;
    const bucket = yearly.get(year) || { year, precipitationMm: 0, wetDayCount: 0, recordCount: 0 };
    bucket.precipitationMm += Math.max(0, precipitation);
    bucket.recordCount += 1;
    if (precipitation >= 1) bucket.wetDayCount += 1;
    yearly.set(year, bucket);
  }
  return Array.from(yearly.values()).sort((a, b) => a.year - b.year);
}

function summarizeMeteorologyBoundarySeries(series, annualPrecipitationSeries = []) {
  const clean = (series || [])
    .map((row) => ({
      date: row.date ? String(row.date).slice(0, 10) : null,
      year: Number(row.year ?? yearFromDate(row.date)),
      precipitationMm: Number(row.precipitationMm),
      temperatureC: Number(row.temperatureC),
      windSpeedMs: Number(row.windSpeedMs),
      windFromDeg: Number(row.windFromDeg)
    }))
    .filter((row) => row.date || Number.isFinite(row.year))
    .sort((a, b) => String(a.date || a.year).localeCompare(String(b.date || b.year)));
  const precipitation = clean.map((row) => row.precipitationMm).filter(Number.isFinite).sort((a, b) => a - b);
  const temperature = clean.map((row) => row.temperatureC).filter(Number.isFinite).sort((a, b) => a - b);
  const windSpeed = clean.map((row) => row.windSpeedMs).filter(Number.isFinite).sort((a, b) => a - b);
  const annualPrecipitation = (annualPrecipitationSeries || [])
    .map((row) => Number(row.precipitationMm))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const wetDayCount = clean.reduce((sum, row) => sum + (Number(row.precipitationMm) >= 1 ? 1 : 0), 0);
  const heavyRainDayCount = clean.reduce((sum, row) => sum + (Number(row.precipitationMm) >= 25 ? 1 : 0), 0);
  const hotDayCount = clean.reduce((sum, row) => sum + (Number(row.temperatureC) >= 30 ? 1 : 0), 0);
  const freezeDayCount = clean.reduce((sum, row) => sum + (Number(row.temperatureC) <= 0 ? 1 : 0), 0);
  const drySpellMaxDays = maxConsecutiveDays(clean, (row) => !Number.isFinite(row.precipitationMm) || row.precipitationMm < 1);
  return {
    recordCount: clean.length,
    startDate: clean.find((row) => row.date)?.date || null,
    endDate: [...clean].reverse().find((row) => row.date)?.date || null,
    yearCount: new Set(clean.map((row) => row.year).filter(Number.isFinite)).size,
    wetDayFraction: clean.length ? wetDayCount / clean.length : null,
    heavyRainDayFraction: clean.length ? heavyRainDayCount / clean.length : null,
    hotDayFraction: clean.length ? hotDayCount / clean.length : null,
    freezeDayFraction: clean.length ? freezeDayCount / clean.length : null,
    maxDrySpellDays: drySpellMaxDays,
    meanDailyPrecipitationMm: meanOrNull(precipitation),
    p95DailyPrecipitationMm: quantile(precipitation, 0.95),
    maxDailyPrecipitationMm: precipitation.length ? precipitation[precipitation.length - 1] : null,
    meanDailyTemperatureC: meanOrNull(temperature),
    p95DailyTemperatureC: quantile(temperature, 0.95),
    p05DailyTemperatureC: quantile(temperature, 0.05),
    meanDailyWindSpeedMs: meanOrNull(windSpeed),
    p95DailyWindSpeedMs: quantile(windSpeed, 0.95),
    maxDailyWindSpeedMs: windSpeed.length ? windSpeed[windSpeed.length - 1] : null,
    meanAnnualPrecipitationMm: meanOrNull(annualPrecipitation),
    p10AnnualPrecipitationMm: quantile(annualPrecipitation, 0.1),
    p90AnnualPrecipitationMm: quantile(annualPrecipitation, 0.9)
  };
}

function maxConsecutiveDays(rows, predicate) {
  let current = 0;
  let max = 0;
  for (const row of rows || []) {
    if (predicate(row)) {
      current += 1;
      max = Math.max(max, current);
    } else {
      current = 0;
    }
  }
  return max;
}

function normalizeCalibrationInput(input, sourceName) {
  const source = input || {};
  const extracted = extractObservedDischargeSeries(source, sourceName);
  if (extracted) {
    return normalizeCalibration({
      ...source,
      observedDischargeM3s: extracted.meanDischargeM3s,
      observedSeries: extracted
    });
  }
  return normalizeCalibration(source);
}

function normalizeCalibration(input) {
  const source = input || {};
  const observedSeries = source.observedSeries || source.observed_series || null;
  const sites = source.sites || observedSeries?.sites || [];
  const firstSite = Array.isArray(sites) ? sites[0] || {} : {};
  const drainageAreaKm2 = drainageAreaToKm2({ ...firstSite, ...source });
  const contributingDrainageAreaKm2 = contributingDrainageAreaToKm2({ ...firstSite, ...source });
  return {
    precipBias: numberOr(source.precipBias ?? source.precip_bias, 0),
    tempBias: numberOr(source.tempBias ?? source.temp_bias, 0),
    runoffMultiplier: numberOr(source.runoffMultiplier ?? source.runoff_multiplier, 1),
    dischargeScale: numberOr(source.dischargeScale ?? source.discharge_scale ?? source.discharge_bias, 1),
    observedDischargeM3s: numberOr(
      source.observedDischargeM3s ?? source.observed_discharge_m3s ?? observedSeries?.meanDischargeM3s,
      Number.NaN
    ),
    drainageAreaKm2,
    contributingDrainageAreaKm2,
    siteCode: source.siteCode ?? source.site_code ?? source.station_id ?? firstSite.siteCode ?? null,
    siteName: source.siteName ?? source.site_name ?? source.station_name ?? firstSite.siteName ?? null,
    siteLatitude: numberOr(source.siteLatitude ?? source.site_latitude ?? source.gage_lat ?? firstSite.latitude, Number.NaN),
    siteLongitude: numberOr(source.siteLongitude ?? source.site_longitude ?? source.gage_lon ?? firstSite.longitude, Number.NaN),
    sites,
    observedSeries
  };
}

function extractObservedDischargeSeries(source, sourceName) {
  const timeSeries = source?.value?.timeSeries || source?.timeSeries || source?.time_series;
  if (!Array.isArray(timeSeries) || !timeSeries.length) return null;

  const values = [];
  const dated = [];
  const sites = new Map();
  let unit = "m3/s";
  let parameterCode = null;

  for (const series of timeSeries) {
    const variable = series.variable || {};
    const variableCode = firstNestedValue(variable.variableCode, "value") || variable.variableCode || null;
    const unitCode = variable.unit?.unitCode || variable.unitCode || variable.unit?.unit || "";
    const parameterText = String(variableCode || "").trim();
    if (parameterText) parameterCode = parameterText;
    const sourceInfo = series.sourceInfo || {};
    const siteCode = firstNestedValue(sourceInfo.siteCode, "value") || sourceInfo.siteCode || "";
    const siteName = sourceInfo.siteName || "";
    const siteMetadata = siteMetadataFromSourceInfo(sourceInfo);
    if (siteCode || siteName) sites.set(String(siteCode || siteName), { siteCode, siteName, ...siteMetadata });

    for (const block of series.values || []) {
      const points = block.value || block.values || [];
      for (const point of points) {
        const raw = point.value ?? point.flow ?? point.discharge;
        const converted = dischargeToM3s(raw, unitCode, parameterText);
        if (!Number.isFinite(converted)) continue;
        const date = point.dateTime || point.datetime || point.date || point.time || null;
        values.push(converted);
        dated.push({ date, year: yearFromDate(date), value: converted });
      }
    }
    if (usesCfs(unitCode, parameterText)) unit = "m3/s from cfs";
  }

  if (!values.length) return null;
  return {
    ...summarizeObservedDischarge(values, dated, sourceName),
    sourceFormat: "usgs-water-services-json",
    parameterCode,
    unit,
    sites: Array.from(sites.values())
  };
}

function siteMetadataFromSourceInfo(sourceInfo) {
  const geog = sourceInfo?.geoLocation?.geogLocation || sourceInfo?.geoLocation || {};
  const props = Array.isArray(sourceInfo?.siteProperty) ? sourceInfo.siteProperty : [];
  const propertyValue = (names) => {
    for (const prop of props) {
      const name = String(prop.name || prop.propertyName || "").toLowerCase();
      if (names.some((candidate) => name === candidate || name.includes(candidate))) return prop.value ?? prop.propertyValue;
    }
    return null;
  };
  return {
    latitude: numberOr(geog.latitude ?? geog.lat, Number.NaN),
    longitude: numberOr(geog.longitude ?? geog.lon ?? geog.lng, Number.NaN),
    drainageAreaKm2: drainageAreaToKm2({
      drainage_area_sqmi: propertyValue(["drain_area_va", "drainage_area", "drainage"]),
      drainage_area_km2: propertyValue(["drain_area_km2", "drainage_area_km2"])
    }),
    contributingDrainageAreaKm2: contributingDrainageAreaToKm2({
      contrib_drainage_area_sqmi: propertyValue(["contrib_drain_area_va", "contrib_drainage_area", "contributing"])
    }),
    huc: propertyValue(["huccd", "huc"]) || null
  };
}

function drainageAreaToKm2(source) {
  const km2 = numberOr(
    source.drainageAreaKm2 ??
      source.drainage_area_km2 ??
      source.drainage_area_sq_km ??
      source.basinAreaKm2 ??
      source.basin_area_km2,
    Number.NaN
  );
  if (Number.isFinite(km2)) return km2;
  const sqmi = numberOr(
    source.drainageAreaSqMi ?? source.drainage_area_sqmi ?? source.drainage_area_mi2 ?? source.drain_area_va,
    Number.NaN
  );
  return Number.isFinite(sqmi) ? sqmi * 2.589988110336 : Number.NaN;
}

function contributingDrainageAreaToKm2(source) {
  const km2 = numberOr(
    source.contributingDrainageAreaKm2 ??
      source.contributing_drainage_area_km2 ??
      source.contrib_drainage_area_km2 ??
      source.contributing_area_km2,
    Number.NaN
  );
  if (Number.isFinite(km2)) return km2;
  const sqmi = numberOr(
    source.contributingDrainageAreaSqMi ??
      source.contributing_drainage_area_sqmi ??
      source.contrib_drainage_area_sqmi ??
      source.contrib_drain_area_va,
    Number.NaN
  );
  return Number.isFinite(sqmi) ? sqmi * 2.589988110336 : Number.NaN;
}

function firstNestedValue(value, key) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstNestedValue(item, key);
      if (found != null && found !== "") return found;
    }
    return null;
  }
  if (value && typeof value === "object") return value[key] ?? null;
  return value ?? null;
}

function dischargeToM3s(value, unitCode, parameterCode) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= -99990) return Number.NaN;
  return usesCfs(unitCode, parameterCode) ? n * 0.028316846592 : n;
}

function usesCfs(unitCode, parameterCode) {
  const text = `${unitCode || ""} ${parameterCode || ""}`.toLowerCase();
  if (text.includes("m3") || text.includes("m^3") || text.includes("cms")) return false;
  return text.includes("ft3") || text.includes("ft^3") || text.includes("cfs") || text.includes("00060");
}

function yearFromDate(date) {
  const match = String(date || "").match(/^(\d{4})/);
  return match ? Number(match[1]) : Number.NaN;
}

function geoJsonToFlowlineLayer(featureCollection, sourceName) {
  const features = Array.isArray(featureCollection.features) ? featureCollection.features : [];
  const lines = [];
  let pointCount = 0;
  for (const feature of features) {
    const geometry = feature?.geometry;
    if (!geometry || !["LineString", "MultiLineString"].includes(geometry.type)) continue;
    const props = normalizeRowKeys(feature.properties || {});
    for (const coordinates of geometryToLines(geometry)) {
      const clean = (coordinates || [])
        .map((point) => [Number(point?.[0]), Number(point?.[1])])
        .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
      if (clean.length < 2) continue;
      pointCount += clean.length;
      lines.push({
        coordinates: clean,
        properties: props,
        name: props.gnis_name || props.name || props.river || props.stream || null,
        sourceId: props.comid || props.nhdplusid || props.id || props.identifier || null,
        streamOrder: finiteOrNull(props.streamorde ?? props.stream_order ?? props.order ?? props.strahler),
        lengthKm: finiteOrNull(props.lengthkm ?? props.length_km ?? props.km)
      });
    }
  }
  if (!lines.length) return null;
  const bounds = normalizeBounds(featureCollection?.bbox || combinedBounds(lines.map((line) => lineBounds(line.coordinates))));
  return {
    type: "flowlines",
    sourceName,
    sourceFormat: "GeoJSON",
    ...geoJsonMeta(featureCollection, bounds),
    featureCount: features.length,
    lineCount: lines.length,
    pointCount,
    lines
  };
}

function mergeFlowlineLayers(existing, incoming) {
  if (!existing) return incoming;
  const bounds = combinedBounds([existing.boundsKm || existing.bounds, incoming.boundsKm || incoming.bounds]);
  return {
    ...incoming,
    sourceName: `${existing.sourceName || "flowlines"} + ${incoming.sourceName || "flowlines"}`,
    bounds,
    boundsKm: existing.boundsKm && incoming.boundsKm ? bounds : null,
    featureCount: (existing.featureCount || 0) + (incoming.featureCount || 0),
    lineCount: (existing.lineCount || existing.lines?.length || 0) + (incoming.lineCount || incoming.lines?.length || 0),
    pointCount: (existing.pointCount || 0) + (incoming.pointCount || 0),
    lines: [...(existing.lines || []), ...(incoming.lines || [])]
  };
}

function geoJsonToSubsurfaceLayer(featureCollection, sourceName) {
  const features = Array.isArray(featureCollection.features) ? featureCollection.features : [];
  const observations = [];
  for (const feature of features) {
    const geometry = feature?.geometry;
    if (!geometry || !["Point", "MultiPoint"].includes(geometry.type)) continue;
    const props = normalizeRowKeys(feature.properties || {});
    for (const point of geometryToPoints(geometry)) {
      const observation = normalizeSubsurfaceObservation(
        {
          ...props,
          x_km: point[0],
          y_km: point[1],
          longitude: props.longitude ?? props.lon,
          latitude: props.latitude ?? props.lat
        },
        sourceName
      );
      if (observation) observations.push(observation);
    }
  }
  const bounds = normalizeBounds(featureCollection?.bbox || combinedBounds(observations.map((item) => observationBounds(item))));
  return makeSubsurfaceLayer(observations, {
    sourceName,
    sourceFormat: "GeoJSON",
    featureCount: features.length,
    ...geoJsonMeta(featureCollection, bounds)
  });
}

function objectToSubsurfaceLayer(input, sourceName) {
  const obj = input?.subsurface || input || {};
  const observations = [];
  const direct = Array.isArray(obj.observations) ? obj.observations : Array.isArray(obj.records) ? obj.records : [];
  for (const item of direct) {
    const observation = normalizeSubsurfaceObservation(item, sourceName);
    if (observation) observations.push(observation);
  }
  const boreholes = [
    ...(Array.isArray(obj.boreholes) ? obj.boreholes : []),
    ...(Array.isArray(obj.wells) ? obj.wells : [])
  ];
  for (const borehole of boreholes) {
    const base = normalizeRowKeys(borehole || {});
    const intervals = Array.isArray(borehole?.strata)
      ? borehole.strata
      : Array.isArray(borehole?.layers)
        ? borehole.layers
        : Array.isArray(borehole?.intervals)
          ? borehole.intervals
          : [];
    if (!intervals.length) {
      const observation = normalizeSubsurfaceObservation(base, sourceName);
      if (observation) observations.push(observation);
      continue;
    }
    for (const interval of intervals) {
      const observation = normalizeSubsurfaceObservation({ ...base, ...normalizeRowKeys(interval) }, sourceName);
      if (observation) observations.push(observation);
    }
  }
  return makeSubsurfaceLayer(observations, {
    sourceName,
    sourceFormat: obj.sourceFormat || obj.format || "JSON",
    featureCount: direct.length + boreholes.length,
    bounds: normalizeBounds(obj.bounds || obj.boundsKm || obj.bounds_km || combinedBounds(observations.map((item) => observationBounds(item)))),
    boundsKm: obj.boundsKm || obj.bounds_km ? normalizeBounds(obj.boundsKm || obj.bounds_km) : null,
    crs: obj.crs || obj.projection || "local-grid"
  });
}

function parseSubsurfaceCSV(body, idx, xKey, yKey, sourceName) {
  const observations = [];
  const headers = Object.keys(idx);
  for (const row of body) {
    const record = {};
    for (const header of headers) record[header] = row[idx[header]];
    if (xKey) record.x_km = row[idx[xKey]];
    if (yKey) record.y_km = row[idx[yKey]];
    const observation = normalizeSubsurfaceObservation(record, sourceName);
    if (observation) observations.push(observation);
  }
  return {
    sources: [sourceName],
    subsurface: makeSubsurfaceLayer(observations, {
      sourceName,
      sourceFormat: "CSV",
      featureCount: body.length,
      bounds: combinedBounds(observations.map((item) => observationBounds(item))),
      crs: "local-grid"
    })
  };
}

function mergeSubsurfaceLayers(existing, incoming) {
  if (!existing) return incoming;
  const bounds = combinedBounds([existing.boundsKm || existing.bounds, incoming.boundsKm || incoming.bounds]);
  const observations = [...(existing.observations || []), ...(incoming.observations || [])];
  return makeSubsurfaceLayer(observations, {
    ...incoming,
    sourceName: `${existing.sourceName || "subsurface"} + ${incoming.sourceName || "subsurface"}`,
    sourceFormat: existing.sourceFormat === incoming.sourceFormat ? incoming.sourceFormat : "mixed",
    featureCount: (existing.featureCount || 0) + (incoming.featureCount || 0),
    bounds,
    boundsKm: existing.boundsKm && incoming.boundsKm ? bounds : null,
    crs: incoming.crs || existing.crs || "local-grid"
  });
}

function makeSubsurfaceLayer(observations, meta = {}) {
  const clean = (observations || []).filter(Boolean);
  const boreholeKeys = new Set();
  let intervalCount = 0;
  let waterTableObservationCount = 0;
  let bedrockObservationCount = 0;
  let aquiferObservationCount = 0;
  let hazardObservationCount = 0;
  for (const observation of clean) {
    boreholeKeys.add(observation.boreholeId || `${roundedKey(observation.xKm ?? observation.longitude ?? 0, 5)},${roundedKey(observation.yKm ?? observation.latitude ?? 0, 5)}`);
    if (Number.isFinite(observation.topDepthM) || Number.isFinite(observation.bottomDepthM) || observation.lithologyCode > 0) intervalCount += 1;
    if (Number.isFinite(observation.waterTableDepthM)) waterTableObservationCount += 1;
    if (Number.isFinite(observation.bedrockDepthM)) bedrockObservationCount += 1;
    if (Number.isFinite(observation.aquiferPotential)) aquiferObservationCount += 1;
    if (Number.isFinite(observation.fractureRisk) || Number.isFinite(observation.liquefactionRisk)) hazardObservationCount += 1;
  }
  const bounds = normalizeBounds(meta.bounds || combinedBounds(clean.map((item) => observationBounds(item))));
  return {
    type: "subsurface-observations",
    sourceName: meta.sourceName || "subsurface-observations",
    sourceFormat: meta.sourceFormat || "JSON",
    crs: meta.crs || "local-grid",
    bounds,
    boundsKm: meta.boundsKm || (isWgs84LikeBounds(bounds, meta.crs) ? null : bounds),
    featureCount: meta.featureCount ?? clean.length,
    observationCount: clean.length,
    boreholeCount: boreholeKeys.size,
    intervalCount,
    waterTableObservationCount,
    bedrockObservationCount,
    aquiferObservationCount,
    hazardObservationCount,
    observations: clean
  };
}

function normalizeSubsurfaceObservation(input, sourceName) {
  const row = normalizeRowKeys(input || {});
  const xKm = nullableFinite(firstPresent(row.x_km, row.xkm, row.local_x_km, row.easting_km, row.x));
  const yKm = nullableFinite(firstPresent(row.y_km, row.ykm, row.local_y_km, row.northing_km, row.y));
  const longitude = nullableFinite(firstPresent(row.longitude, row.lon, row.lng, row.x_longitude));
  const latitude = nullableFinite(firstPresent(row.latitude, row.lat, row.y_latitude));
  const waterTableDepthM = nullableFinite(firstPresent(row.water_table_depth_m, row.water_table_m, row.groundwater_depth_m, row.depth_to_water_m, row.dtw_m));
  const bedrockDepthM = nullableFinite(firstPresent(row.bedrock_depth_m, row.depth_to_bedrock_m, row.rock_depth_m));
  const topDepthM = nullableFinite(firstPresent(row.top_depth_m, row.interval_top_m, row.from_m, row.depth_top_m));
  const bottomDepthM = nullableFinite(firstPresent(row.bottom_depth_m, row.interval_bottom_m, row.to_m, row.depth_bottom_m));
  const lithologyCode = lithologyCodeFromValue(firstPresent(row.lithology_code, row.lithology, row.geology, row.rock_type, row.material));
  if (
    !Number.isFinite(xKm) &&
    !Number.isFinite(yKm) &&
    !Number.isFinite(longitude) &&
    !Number.isFinite(latitude) &&
    !Number.isFinite(waterTableDepthM) &&
    !Number.isFinite(bedrockDepthM) &&
    lithologyCode === 0
  ) {
    return null;
  }
  return {
    sourceName,
    id: firstPresent(row.id, row.observation_id, row.obs_id, row.sample_id) || null,
    boreholeId: firstPresent(row.borehole_id, row.borehole, row.well_id, row.well, row.station_id, row.site_id, row.id) || null,
    xKm,
    yKm,
    longitude,
    latitude,
    waterTableDepthM,
    bedrockDepthM,
    topDepthM,
    bottomDepthM,
    lithology: firstPresent(row.lithology, row.geology, row.rock_type, row.material) || null,
    lithologyCode,
    aquiferPotential: nullableFinite(firstPresent(row.aquifer_potential, row.aquifer_index, row.groundwater_potential)),
    fractureRisk: nullableFinite(firstPresent(row.fracture_risk, row.fracture_index, row.geologic_hazard)),
    liquefactionRisk: nullableFinite(firstPresent(row.liquefaction_risk, row.liquefaction_index)),
    porosity: nullableFinite(firstPresent(row.porosity, row.porosity_fraction)),
    permeabilityMmHr: nullableFinite(firstPresent(row.permeability_mm_hr, row.ksat_mm_hr, row.hydraulic_conductivity_mm_hr)),
    porePressureKpa: nullableFinite(firstPresent(row.pore_pressure_kpa, row.pore_pressure)),
    confidence: nullableFinite(firstPresent(row.confidence, row.weight, row.data_quality)),
    properties: row
  };
}

function nullableFinite(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function lithologyCodeFromValue(value) {
  if (value == null || value === "") return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return clamp(Math.round(numeric), 0, 6);
  const key = String(value).trim().toLowerCase().replace(/[\s-]+/g, "_");
  return SUBSURFACE_LITHOLOGY_LOOKUP[key] || 0;
}

function roundedKey(value, digits = 5) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const scale = 10 ** digits;
  return Math.round(n * scale) / scale;
}

function observationBounds(observation) {
  const x = Number.isFinite(observation?.xKm) ? observation.xKm : observation?.longitude;
  const y = Number.isFinite(observation?.yKm) ? observation.yKm : observation?.latitude;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [x, y, x, y];
}

function geoJsonToInfrastructureLayer(featureCollection, sourceName) {
  const features = Array.isArray(featureCollection.features) ? featureCollection.features : [];
  const items = [];
  const counts = { point: 0, line: 0, polygon: 0 };
  for (const feature of features) {
    const geometry = feature?.geometry;
    if (!geometry || !["Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon"].includes(geometry.type)) continue;
    const props = normalizeRowKeys(feature.properties || {});
    const geometryClass = geometry.type.includes("Point") ? "point" : geometry.type.includes("LineString") ? "line" : "polygon";
    counts[geometryClass] += 1;
    items.push({
      geometryType: geometry.type,
      geometryClass,
      coordinates: geometry.coordinates || [],
      properties: props,
      infrastructureType: normalizeInfrastructureType(
        props.infrastructure_type ?? props.structure_type ?? props.type ?? props.kind ?? props.class ?? props.landuse ?? props.use ?? props.name
      ),
      intensity: finiteOrNull(props.intensity ?? props.weight ?? props.capacity_factor),
      radiusKm: finiteOrNull(props.radius_km ?? props.buffer_km ?? props.influence_km),
      imperviousFraction: finiteOrNull(props.impervious_fraction ?? props.impervious ?? props.sealed_fraction),
      runoffDelta: finiteOrNull(props.runoff_delta ?? props.runoff_increase),
      roughnessDelta: finiteOrNull(props.roughness_delta ?? props.drag_delta),
      temperatureDeltaC: finiteOrNull(props.temperature_delta_c ?? props.heat_delta_c ?? props.uhi_delta_c),
      storageMm: finiteOrNull(props.storage_mm ?? props.retention_mm),
      flowRetention: finiteOrNull(props.flow_retention ?? props.retention_fraction),
      irrigationMm: finiteOrNull(props.irrigation_mm ?? props.imported_water_mm),
      vegetationDelta: finiteOrNull(props.vegetation_delta ?? props.greening_delta),
      waterDemandMm: finiteOrNull(props.water_demand_mm ?? props.withdrawal_mm),
      buildingDensity: finiteOrNull(
        props.building_density ??
          props.building_density_fraction ??
          props.building_coverage ??
          props.site_coverage ??
          props.coverage_fraction
      ),
      buildingHeightM: finiteOrNull(
        props.building_height_m ??
          props.avg_building_height_m ??
          props.mean_height_m ??
          props.height_m ??
          props.height
      ),
      floorCount: finiteOrNull(
        props.floor_count ??
          props.floors ??
          props.levels ??
          props.building_levels ??
          props["building:levels"]
      ),
      landmarkHeightM: finiteOrNull(props.landmark_height_m ?? props.tower_height_m ?? props.spire_height_m)
    });
  }
  if (!items.length) return null;
  const bounds = normalizeBounds(featureCollection?.bbox || combinedBounds(items.map((item) => geometryBounds(item))));
  return {
    type: "infrastructure",
    sourceName,
    sourceFormat: "GeoJSON",
    ...geoJsonMeta(featureCollection, bounds),
    featureCount: features.length,
    infrastructureCount: items.length,
    pointFeatureCount: counts.point,
    lineFeatureCount: counts.line,
    polygonFeatureCount: counts.polygon,
    features: items
  };
}

function mergeInfrastructureLayers(existing, incoming) {
  if (!existing) return incoming;
  const bounds = combinedBounds([existing.boundsKm || existing.bounds, incoming.boundsKm || incoming.bounds]);
  return {
    ...incoming,
    sourceName: `${existing.sourceName || "infrastructure"} + ${incoming.sourceName || "infrastructure"}`,
    bounds,
    boundsKm: existing.boundsKm && incoming.boundsKm ? bounds : null,
    featureCount: (existing.featureCount || 0) + (incoming.featureCount || 0),
    infrastructureCount: (existing.infrastructureCount || existing.features?.length || 0) + (incoming.infrastructureCount || incoming.features?.length || 0),
    pointFeatureCount: (existing.pointFeatureCount || 0) + (incoming.pointFeatureCount || 0),
    lineFeatureCount: (existing.lineFeatureCount || 0) + (incoming.lineFeatureCount || 0),
    polygonFeatureCount: (existing.polygonFeatureCount || 0) + (incoming.polygonFeatureCount || 0),
    features: [...(existing.features || []), ...(incoming.features || [])]
  };
}

function geoJsonToSurfacePatchLayer(featureCollection, sourceName) {
  const features = Array.isArray(featureCollection.features) ? featureCollection.features : [];
  const items = [];
  const counts = { point: 0, line: 0, polygon: 0 };
  for (const feature of features) {
    const geometry = feature?.geometry;
    if (!geometry || !["Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon"].includes(geometry.type)) continue;
    const props = normalizeRowKeys(feature.properties || {});
    const geometryClass = geometry.type.includes("Point") ? "point" : geometry.type.includes("LineString") ? "line" : "polygon";
    counts[geometryClass] += 1;
    const patchType = normalizeSurfacePatchType(
      firstPresent(
        props.surface_type,
        props.patch_type,
        props.ecozone,
        props.habitat,
        props.landcover,
        props.land_cover,
        props.nlcd,
        props.type,
        props.kind,
        props.name
      )
    );
    items.push({
      geometryType: geometry.type,
      geometryClass,
      coordinates: geometry.coordinates || [],
      properties: props,
      patchType,
      intensity: finiteOrNull(props.intensity ?? props.weight ?? props.scenario_weight),
      radiusKm: finiteOrNull(props.radius_km ?? props.buffer_km ?? props.influence_km),
      lineRadiusKm: finiteOrNull(props.line_radius_km ?? props.corridor_radius_km ?? props.width_km),
      landCoverCode: landCoverCodeFromValue(firstPresent(props.land_cover, props.landcover, props.nlcd, props.nlcd_class, props.classvalue, props.gridcode)),
      soilGroup: finiteOrNull(parseCellValue(firstPresent(props.soil_group, props.hydrologic_soil_group, props.hsg, props.hydgrp, props.soil), "soilGroup")),
      vegetationFraction: finiteOrNull(props.vegetation_fraction ?? props.vegetation ?? props.ndvi ?? props.cover_fraction),
      vegetationDelta: finiteOrNull(props.vegetation_delta ?? props.greening_delta ?? props.veg_delta),
      leafAreaIndex: finiteOrNull(props.lai ?? props.leaf_area_index),
      canopyHeightM: finiteOrNull(props.canopy_height_m ?? props.canopy_height ?? props.tree_height_m),
      rootDepthM: finiteOrNull(props.root_depth_m ?? props.root_zone_depth_m),
      soilHydraulicConductivityMmHr: finiteOrNull(props.ksat_mm_hr ?? props.hydraulic_conductivity_mm_hr ?? props.soil_hydraulic_conductivity),
      availableWaterCapacityMm: finiteOrNull(props.awc_mm ?? props.available_water_capacity_mm ?? props.available_water_capacity),
      imperviousFraction: finiteOrNull(props.impervious_fraction ?? props.impervious ?? props.impervious_percent),
      imperviousDelta: finiteOrNull(props.impervious_delta ?? props.sealed_delta),
      precipitationDeltaMm: finiteOrNull(props.precipitation_delta_mm ?? props.precip_delta_mm ?? props.rain_delta_mm),
      precipitationScale: finiteOrNull(props.precipitation_scale ?? props.precip_scale ?? props.rain_scale),
      temperatureDeltaC: finiteOrNull(props.temperature_delta_c ?? props.temp_delta_c ?? props.heat_delta_c),
      windSpeedDeltaMs: finiteOrNull(props.wind_speed_delta_ms ?? props.wind_delta_ms),
      windDirectionDeg: finiteOrNull(props.wind_direction ?? props.wind_from_deg ?? props.wind_direction_deg),
      roughnessDelta: finiteOrNull(props.roughness_delta ?? props.drag_delta)
    });
  }
  if (!items.length) return null;
  const bounds = normalizeBounds(featureCollection?.bbox || combinedBounds(items.map((item) => geometryBounds(item))));
  return {
    type: "surfacePatches",
    sourceName,
    sourceFormat: "GeoJSON",
    ...geoJsonMeta(featureCollection, bounds),
    featureCount: features.length,
    patchCount: items.length,
    pointFeatureCount: counts.point,
    lineFeatureCount: counts.line,
    polygonFeatureCount: counts.polygon,
    features: items
  };
}

function mergeSurfacePatchLayers(existing, incoming) {
  if (!existing) return incoming;
  const bounds = combinedBounds([existing.boundsKm || existing.bounds, incoming.boundsKm || incoming.bounds]);
  return {
    ...incoming,
    sourceName: `${existing.sourceName || "surface-patches"} + ${incoming.sourceName || "surface-patches"}`,
    bounds,
    boundsKm: existing.boundsKm && incoming.boundsKm ? bounds : null,
    featureCount: (existing.featureCount || 0) + (incoming.featureCount || 0),
    patchCount: (existing.patchCount || existing.features?.length || 0) + (incoming.patchCount || incoming.features?.length || 0),
    pointFeatureCount: (existing.pointFeatureCount || 0) + (incoming.pointFeatureCount || 0),
    lineFeatureCount: (existing.lineFeatureCount || 0) + (incoming.lineFeatureCount || 0),
    polygonFeatureCount: (existing.polygonFeatureCount || 0) + (incoming.polygonFeatureCount || 0),
    features: [...(existing.features || []), ...(incoming.features || [])]
  };
}

function normalizeSurfacePatchType(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "custom";
  if (/(mixed[-_\s]?forest|forest|woodland|tree|reforest|afforest|林|森林)/.test(text)) return "forest";
  if (/(wetland|marsh|swamp|riparian|湿地|沼泽)/.test(text)) return "wetland";
  if (/(grass|pasture|meadow|rangeland|草地|牧草)/.test(text)) return "grassland";
  if (/(crop|farm|agriculture|irrigated|farmland|耕地|农田|农业)/.test(text)) return "cropland";
  if (/(shrub|scrub|灌丛|灌木)/.test(text)) return "shrubland";
  if (/(bare|barren|rock|sand|裸地|荒地)/.test(text)) return "bare";
  if (/(burn|fire|scar|wildfire|火烧|烧毁)/.test(text)) return "burned";
  if (/(drought|dry|干旱)/.test(text)) return "drought";
  if (/(heat|warming|热浪|增温)/.test(text)) return "heatwave";
  if (/(park|green|garden|urban[-_\s]?green|绿地|公园)/.test(text)) return "urban_green";
  if (/(water|lake|pond|open[-_\s]?water|水体|湖)/.test(text)) return "open_water";
  return text.replace(/[^a-z0-9_-]+/g, "_") || "custom";
}

function landCoverCodeFromValue(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (Number.isFinite(n)) return n;
  const text = String(value).trim().toLowerCase();
  if (/(open[-_\s]?water|water|lake|pond)/.test(text)) return 11;
  if (/(developed[-_\s]?open|urban[-_\s]?open)/.test(text)) return 21;
  if (/(developed|urban|built)/.test(text)) return 22;
  if (/(barren|bare|rock|sand)/.test(text)) return 31;
  if (/(deciduous|broadleaf)/.test(text)) return 41;
  if (/(evergreen|conifer)/.test(text)) return 42;
  if (/(mixed[-_\s]?forest|forest|woodland|tree)/.test(text)) return 43;
  if (/(shrub|scrub)/.test(text)) return 52;
  if (/(grass|meadow|rangeland)/.test(text)) return 71;
  if (/(pasture|hay)/.test(text)) return 81;
  if (/(crop|cultivated|agriculture|farm)/.test(text)) return 82;
  if (/(woody[-_\s]?wetland|swamp)/.test(text)) return 90;
  if (/(wetland|marsh)/.test(text)) return 95;
  return null;
}

function normalizeInfrastructureType(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "custom";
  const key = text.replace(/[^a-z0-9_-]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  if (CANONICAL_INFRASTRUCTURE_TYPES.has(key)) return key;
  if (/(office[-_\s]?tower|office[-_\s]?high[-_\s]?rise|business[-_\s]?tower|office[-_\s]?building)/.test(text)) return "office_tower";
  if (/(hotel|motel|inn|resort|lodging)/.test(text)) return "hotel";
  if (/(market|bazaar|commerce[-_\s]?market|trade[-_\s]?hall)/.test(text)) return "market";
  if (/(fire[-_\s]?station|firehouse|fire[-_\s]?rescue)/.test(text)) return "fire_station";
  if (/(police[-_\s]?station|sheriff|public[-_\s]?security)/.test(text)) return "police_station";
  if (/(data[-_\s]?center|datacenter|server[-_\s]?farm|compute[-_\s]?campus)/.test(text)) return "data_center";
  if (/(substation|transformer[-_\s]?yard|switchyard)/.test(text)) return "substation";
  if (/(metro[-_\s]?station|subway[-_\s]?station|underground[-_\s]?station)/.test(text)) return "metro_station";
  if (/(tunnel[-_\s]?portal|tunnel[-_\s]?mouth|portal[-_\s]?headwall)/.test(text)) return "tunnel_portal";
  if (/(observatory|astronomical[-_\s]?observatory|clear[-_\s]?sky[-_\s]?station|telescope[-_\s]?station)/.test(text)) return "observatory";
  if (/(cable[-_\s]?car[-_\s]?station|gondola[-_\s]?station|ropeway[-_\s]?station|aerial[-_\s]?tram[-_\s]?station)/.test(text)) return "cable_car_station";
  if (/(flood[-_\s]?pump[-_\s]?station|stormwater[-_\s]?pump[-_\s]?station|drainage[-_\s]?pump[-_\s]?station|pump[-_\s]?station)/.test(text)) return "flood_pump_station";
  if (/(desalination[-_\s]?plant|seawater[-_\s]?desalination|reverse[-_\s]?osmosis[-_\s]?plant|water[-_\s]?production[-_\s]?plant)/.test(text)) return "desalination_plant";
  if (/(hydropower|hydro[-_\s]?electric|hydroelectric|water[-_\s]?power|水电站|水力发电)/.test(text)) return "hydropower_plant";
  if (/(geothermal|thermal[-_\s]?plant|hot[-_\s]?spring[-_\s]?power|地热|地热电站)/.test(text)) return "geothermal_plant";
  if (/(water[-_\s]?treatment|drinking[-_\s]?water[-_\s]?plant|filtration[-_\s]?plant|purification[-_\s]?plant|净水厂|自来水厂)/.test(text)) return "water_treatment_plant";
  if (/(mountain[-_\s]?refuge|alpine[-_\s]?hut|mountain[-_\s]?shelter|alpine[-_\s]?shelter|山地避难|高山小屋)/.test(text)) return "mountain_refuge";
  if (/(ferry[-_\s]?terminal|ferry[-_\s]?port|ferry[-_\s]?dock|ferry[-_\s]?pier|渡轮|轮渡码头)/.test(text)) return "ferry_terminal";
  if (/(fire[-_\s]?watch[-_\s]?tower|fire[-_\s]?lookout|lookout[-_\s]?tower|watch[-_\s]?tower|防火瞭望塔|火情瞭望)/.test(text)) return "fire_watch_tower";
  if (/(visitor[-_\s]?center|visitor[-_\s]?centre|tourist[-_\s]?center|tourist[-_\s]?centre|interpretive[-_\s]?center|interpretive[-_\s]?centre|游客中心)/.test(text)) return "visitor_center";
  if (/(scenic[-_\s]?overlook|viewpoint|view[-_\s]?point|lookout|observation[-_\s]?deck|观景台|瞭望点|了望点)/.test(text)) return "scenic_overlook";
  if (/(trailhead|trail[-_\s]?head|hiking[-_\s]?entrance|trail[-_\s]?entrance|步道入口|登山口)/.test(text)) return "trailhead";
  if (/(ranger[-_\s]?station|warden[-_\s]?station|forest[-_\s]?station|park[-_\s]?ranger|护林站|管理站|景区管理站)/.test(text)) return "ranger_station";
  if (/(stream[-_\s]?gage|stream[-_\s]?gauge|gauging[-_\s]?station|hydrometric[-_\s]?station|river[-_\s]?gauge|water[-_\s]?level[-_\s]?station|水文测站|水文站)/.test(text)) return "gauging_station";
  if (/(research[-_\s]?station|field[-_\s]?station|lab[-_\s]?station|observatory[-_\s]?station)/.test(text)) return "research_station";
  if (/(farmstead|farm[-_\s]?yard|ranch[-_\s]?stead|homestead[-_\s]?farm)/.test(text)) return "farmstead";
  if (/(terrace[-_\s]?farm|terraced[-_\s]?field|terraced[-_\s]?agriculture|rice[-_\s]?terrace)/.test(text)) return "terrace_farm";
  if (/(clinic|urgent[-_\s]?care|medical[-_\s]?clinic|community[-_\s]?health|诊所|急诊点|卫生站)/.test(text)) return "clinic";
  if (/(library|reading[-_\s]?room|public[-_\s]?library|图书馆|阅览室)/.test(text)) return "library";
  if (/(community[-_\s]?center|community[-_\s]?centre|cultural[-_\s]?center|neighborhood[-_\s]?center|社区中心|文化中心)/.test(text)) return "community_center";
  if (/(bus[-_\s]?terminal|bus[-_\s]?hub|coach[-_\s]?station|transit[-_\s]?center|公交枢纽|客运站|巴士站)/.test(text)) return "bus_terminal";
  if (/(water[-_\s]?tower|elevated[-_\s]?tank|water[-_\s]?storage[-_\s]?tower|高位水池|水塔)/.test(text)) return "water_tower";
  if (/(landmark|monument|memorial|spire|observation|iconic|地标|纪念|观景)/.test(text)) return "landmark";
  if (/(skyscraper|high[-_\s]?rise|supertall|tower|highrise|高层|高楼)/.test(text)) return "highrise";
  if (/(apartment|condo|multifamily|multi[-_\s]?family|residential[-_\s]?block|housing[-_\s]?block|居民楼|公寓)/.test(text)) return "apartment";
  if (/(villa|detached|townhouse|cottage|bungalow|小洋房|别墅)/.test(text)) return "villa";
  if (/(commercial|office|retail|mall|cbd|商务|商业)/.test(text)) return "commercial";
  if (/(hospital|clinic|medical|医院|诊所)/.test(text)) return "hospital";
  if (/(school|campus|university|college|学校|校园|大学)/.test(text)) return "school";
  if (/(stadium|arena|sports|体育场|球场)/.test(text)) return "stadium";
  if (/(civic|government|public|courthouse|library|公共|政务)/.test(text)) return "civic";
  if (/(airport|runway|airfield|机场|跑道)/.test(text)) return "airport";
  if (/(bridge|viaduct|overpass|桥|高架)/.test(text)) return "bridge";
  if (/(rail|railway|train|metro|subway|铁路|轨道|地铁)/.test(text)) return "rail";
  if (/(road|highway|transport|street|expressway|道路|公路|交通)/.test(text)) return "transport";
  if (/(port|harbor|dock|terminal|港口|码头)/.test(text)) return "port";
  if (/(power|powerplant|power[-_\s]?plant|substation|电厂|变电)/.test(text)) return "powerplant";
  if (/(wastewater|sewage|treatment|污水|水处理)/.test(text)) return "wastewater";
  if (/(solar|photovoltaic|pv|光伏|太阳能)/.test(text)) return "solar_farm";
  if (/(wind[-_\s]?farm|turbine|风电|风机)/.test(text)) return "wind_farm";
  if (/(park|green|garden|公园|绿地)/.test(text)) return "park";
  if (/(logistics|warehouse|depot|物流|仓储)/.test(text)) return "logistics";
  if (/(greenhouse|glasshouse|温室|大棚)/.test(text)) return "greenhouse";
  if (/(quarry|mine|pit|采石|矿)/.test(text)) return "quarry";
  if (/(residential|neighborhood|suburb|housing|居住|住宅)/.test(text)) return "residential";
  if (/(city|town|urban|built|settlement|城镇|城市)/.test(text)) return "urban";
  if (/(village|rural|hamlet|farm|agriculture|乡村|村庄|农业)/.test(text)) return "village";
  if (/(dam|weir|barrage)/.test(text)) return "dam";
  if (/(reservoir|lake|pond|retention|detention)/.test(text)) return "reservoir";
  if (/(canal|ditch|irrigation|aqueduct)/.test(text)) return "canal";
  if (/(levee|dike|dyke|embankment|floodwall)/.test(text)) return "levee";
  if (/(industrial|factory|mine|quarry|plant)/.test(text)) return "industrial";
  return key || "custom";
}

function geoJsonToLayer(featureCollection, role, sourceName) {
  const features = Array.isArray(featureCollection.features) ? featureCollection.features : [];
  const cells = features
    .map((feature) => normalizeRowKeys(feature.properties || {}))
    .filter((props) => "x" in props || "col" in props || "x_km" in props);
  if (cells.length) return applyGeoJsonRoleAlias(tableObjectsToGrid(cells, featureCollection), role, sourceName);

  const polygonFeatures = features
    .filter((feature) => feature?.geometry && ["Polygon", "MultiPolygon"].includes(feature.geometry.type))
    .map((feature, index) => ({
      feature,
      index,
      props: normalizeRowKeys(feature.properties || {}),
      polygons: geometryToPolygons(feature.geometry),
      bounds: geometryBounds(feature.geometry)
    }))
    .filter((item) => item.polygons.length && item.bounds);

  if (!polygonFeatures.length) return { width: 0, height: 0 };
  return applyGeoJsonRoleAlias(rasterizeGeoJsonPolygons(featureCollection, polygonFeatures), role, sourceName);
}

function tableObjectsToGrid(rows, featureCollection = null) {
  const xs = uniqueSorted(rows.map((row) => Number(row.x ?? row.col ?? row.x_km)));
  const ys = uniqueSorted(rows.map((row) => Number(row.y ?? row.row ?? row.y_km)));
  const width = xs.length;
  const height = ys.length;
  const xLookup = new Map(xs.map((v, i) => [String(v), i]));
  const yLookup = new Map(ys.map((v, i) => [String(v), i]));
  const out = {
    width,
    height,
    ...geoJsonMeta(featureCollection, [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)])
  };
  for (const field of NUMERIC_FIELDS) {
    if (!rows.some((row) => field in row)) continue;
    const data = new Array(width * height).fill(Number.NaN);
    for (const row of rows) {
      const x = xLookup.get(String(Number(row.x ?? row.col ?? row.x_km)));
      const y = yLookup.get(String(Number(row.y ?? row.row ?? row.y_km)));
      data[y * width + x] = row[field];
    }
    out[field] = data;
  }
  return out;
}

function rasterizeGeoJsonPolygons(featureCollection, polygonFeatures) {
  const bounds = normalizeBounds(featureCollection?.bbox || combinedBounds(polygonFeatures.map((item) => item.bounds)));
  const width = clampRasterResolution(
    Number(featureCollection?.rasterWidth || featureCollection?.width || featureCollection?.properties?.rasterWidth)
  );
  const height = clampRasterResolution(
    Number(featureCollection?.rasterHeight || featureCollection?.height || featureCollection?.properties?.rasterHeight || width)
  );
  const fields = Array.from(NUMERIC_FIELDS).filter((field) => polygonFeatures.some((item) => field in item.props));
  const out = {
    width,
    height,
    ...geoJsonMeta(featureCollection, bounds),
    vectorFeatureCount: polygonFeatures.length,
    rasterizedVector: true
  };
  const sortedFeatures = [...polygonFeatures].sort((a, b) => boundsArea(b.bounds) - boundsArea(a.bounds) || a.index - b.index);
  const dx = bounds[2] - bounds[0];
  const dy = bounds[3] - bounds[1];
  for (const field of fields) {
    const data = new Array(width * height).fill(Number.NaN);
    for (const item of sortedFeatures) {
      if (!(field in item.props)) continue;
      const value = parseCellValue(item.props[field], field);
      if (!Number.isFinite(value)) continue;
      const [fx0, fy0, fx1, fy1] = item.bounds;
      const minX = clamp(Math.floor(((fx0 - bounds[0]) / dx) * width) - 1, 0, width - 1);
      const maxX = clamp(Math.ceil(((fx1 - bounds[0]) / dx) * width) + 1, 0, width - 1);
      const minY = clamp(Math.floor(((fy0 - bounds[1]) / dy) * height) - 1, 0, height - 1);
      const maxY = clamp(Math.ceil(((fy1 - bounds[1]) / dy) * height) + 1, 0, height - 1);
      for (let y = minY; y <= maxY; y += 1) {
        const py = bounds[1] + ((y + 0.5) / height) * dy;
        for (let x = minX; x <= maxX; x += 1) {
          const px = bounds[0] + ((x + 0.5) / width) * dx;
          if (multiPolygonContains(item.polygons, px, py)) data[y * width + x] = value;
        }
      }
    }
    out[field] = data;
  }
  return out;
}

function applyGeoJsonRoleAlias(out, role, sourceName) {
  if (!out || out.width === 0 || out.height === 0) return out;
  if (out.value && role) out[defaultLayerKeyForRole(role, sourceName)] = out.value;
  if (out.data && role && !out[defaultLayerKeyForRole(role, sourceName)]) out[defaultLayerKeyForRole(role, sourceName)] = out.data;
  if (out.gridcode && role === "landCover" && !out.landcover && !out.land_cover && !out.nlcd) out.landcover = out.gridcode;
  if (out.classvalue && role === "landCover" && !out.landcover && !out.land_cover && !out.nlcd) out.landcover = out.classvalue;
  if (out.hsg && role === "soil" && !out.soil_group && !out.hydrologic_soil_group) out.soil_group = out.hsg;
  if (out.hydgrp && role === "soil" && !out.soil_group && !out.hydrologic_soil_group) out.soil_group = out.hydgrp;
  if (out.hydgrpdcd && role === "soil" && !out.soil_group && !out.hydrologic_soil_group) out.soil_group = out.hydgrpdcd;
  return out;
}

function geoJsonMeta(featureCollection, bounds) {
  if (!featureCollection) return {};
  const crs = geoJsonCrs(featureCollection, bounds);
  const meta = {
    bounds,
    crs
  };
  if (!isWgs84LikeBounds(bounds, crs)) meta.boundsKm = bounds;
  return meta;
}

function geoJsonCrs(featureCollection, bounds) {
  const crsName =
    featureCollection?.crs?.properties?.name ||
    featureCollection?.crs?.name ||
    featureCollection?.properties?.crs ||
    featureCollection?.properties?.projection ||
    "";
  if (crsName) return String(crsName);
  return isWgs84LikeBounds(bounds, "") ? "EPSG:4326" : "local-grid";
}

function isWgs84LikeBounds(bounds, crs = "") {
  if (!Array.isArray(bounds) || bounds.length < 4) return false;
  const [x0, y0, x1, y1] = bounds.map(Number);
  const text = String(crs || "").toLowerCase();
  if (text.includes("local")) return false;
  const allGeographic = [x0, x1].every((v) => Number.isFinite(v) && v >= -180 && v <= 180) &&
    [y0, y1].every((v) => Number.isFinite(v) && v >= -90 && v <= 90);
  const looksOutsideLocal = x0 < 0 || y0 < 0 || x1 > DEFAULT_MAP_SIZE_KM || y1 > DEFAULT_MAP_SIZE_KM;
  return allGeographic && (text.includes("4326") || text.includes("wgs") || looksOutsideLocal);
}

function normalizeRowKeys(row) {
  const next = {};
  for (const [key, value] of Object.entries(row || {})) {
    next[key] = value;
    next[String(key).trim().toLowerCase()] = value;
  }
  return next;
}

function geometryToPolygons(geometry) {
  if (geometry.type === "Polygon") return [geometry.coordinates || []];
  if (geometry.type === "MultiPolygon") return geometry.coordinates || [];
  return [];
}

function geometryToLines(geometry) {
  if (geometry.type === "LineString") return [geometry.coordinates || []];
  if (geometry.type === "MultiLineString") return geometry.coordinates || [];
  return [];
}

function geometryToPoints(geometry) {
  if (geometry.type === "Point") return [geometry.coordinates || []]
    .map((point) => [Number(point?.[0]), Number(point?.[1])])
    .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
  if (geometry.type === "MultiPoint") {
    return (geometry.coordinates || [])
      .map((point) => [Number(point?.[0]), Number(point?.[1])])
      .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
  }
  return [];
}

function geometryBounds(geometry) {
  const coords = [];
  collectCoordinates(geometry?.coordinates, coords);
  const xs = coords.map((point) => Number(point[0])).filter(Number.isFinite);
  const ys = coords.map((point) => Number(point[1])).filter(Number.isFinite);
  if (!xs.length || !ys.length) return null;
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function collectCoordinates(value, out) {
  if (!Array.isArray(value)) return;
  if (typeof value[0] === "number" && typeof value[1] === "number") {
    out.push(value);
    return;
  }
  for (const item of value) collectCoordinates(item, out);
}

function combinedBounds(boundsList) {
  const valid = boundsList.filter((bounds) => Array.isArray(bounds) && bounds.length >= 4);
  if (!valid.length) return [...DEFAULT_BOUNDS_KM];
  return [
    Math.min(...valid.map((bounds) => bounds[0])),
    Math.min(...valid.map((bounds) => bounds[1])),
    Math.max(...valid.map((bounds) => bounds[2])),
    Math.max(...valid.map((bounds) => bounds[3]))
  ];
}

function lineBounds(coordinates) {
  const xs = coordinates.map((point) => Number(point[0])).filter(Number.isFinite);
  const ys = coordinates.map((point) => Number(point[1])).filter(Number.isFinite);
  if (!xs.length || !ys.length) return null;
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function boundsArea(bounds) {
  return Math.abs((bounds[2] - bounds[0]) * (bounds[3] - bounds[1]));
}

function multiPolygonContains(polygons, x, y) {
  for (const polygon of polygons) {
    if (polygonContains(polygon, x, y)) return true;
  }
  return false;
}

function polygonContains(rings, x, y) {
  if (!rings?.length || !pointInRing(rings[0], x, y)) return false;
  for (let i = 1; i < rings.length; i += 1) {
    if (pointInRing(rings[i], x, y)) return false;
  }
  return true;
}

function pointInRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = Number(ring[i][0]);
    const yi = Number(ring[i][1]);
    const xj = Number(ring[j][0]);
    const yj = Number(ring[j][1]);
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function clampRasterResolution(value) {
  return clamp(Number.isFinite(value) && value > 0 ? Math.round(value) : 256, 8, 1024);
}

function firstValue(obj, names) {
  for (const name of names) {
    if (obj[name]) return obj[name];
  }
  return null;
}

function hasAnyColumn(idx, names) {
  return names.some((name) => name in idx);
}

function hasMeteorologyColumn(idx) {
  return hasAnyColumn(idx, [
    "prcp",
    "prcp_mm",
    "ppt_mm",
    "rain_mm",
    "precip_mm_yr",
    "precipitation",
    "tmean",
    "temp_c",
    "temperature",
    "tmax",
    "tmax_c",
    "tmin",
    "tmin_c",
    "wind_speed",
    "wind_speed_ms",
    "ws",
    "ws_ms",
    "wind_direction",
    "wind_from_deg",
    "wdir",
    ...WIND_U_COLUMNS,
    ...WIND_V_COLUMNS
  ]);
}

function hasDischargeColumn(idx) {
  return hasAnyColumn(idx, [
    "observed_discharge_m3s",
    "discharge_m3s",
    "flow_m3s",
    "q_m3s",
    "streamflow_m3s",
    "discharge_cfs",
    "flow_cfs",
    "q_cfs",
    "00060"
  ]);
}

function numberFromColumns(row, idx, names) {
  for (const name of names) {
    if (!(name in idx)) continue;
    const raw = row[idx[name]];
    if (raw == null || String(raw).trim() === "") continue;
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return Number.NaN;
}

function hasWindVectorColumns(idx) {
  return WIND_U_COLUMNS.some((name) => name in idx) && WIND_V_COLUMNS.some((name) => name in idx);
}

function windVectorFromColumns(row, idx) {
  const u = numberFromColumns(row, idx, WIND_U_COLUMNS);
  const v = numberFromColumns(row, idx, WIND_V_COLUMNS);
  return windVectorToSpeedDirection(u, v);
}

function windVectorToSpeedDirection(u, v) {
  if (!Number.isFinite(u) || !Number.isFinite(v)) return null;
  const speed = Math.hypot(u, v);
  if (speed <= 1e-9) return null;
  return {
    speed,
    direction: ((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360
  };
}

function rowDate(row, idx) {
  const key = ["date", "datetime", "time"].find((name) => name in idx);
  if (!key) return null;
  const value = String(row[idx[key]] || "").trim();
  return value || null;
}

function rowYear(row, idx) {
  if ("water_year" in idx) {
    const raw = row[idx.water_year];
    const value = raw == null || String(raw).trim() === "" ? Number.NaN : Number(raw);
    if (Number.isFinite(value)) return value;
  }
  if ("year" in idx) {
    const raw = row[idx.year];
    const value = raw == null || String(raw).trim() === "" ? Number.NaN : Number(raw);
    if (Number.isFinite(value)) return value;
  }
  const date = rowDate(row, idx);
  if (!date) return Number.NaN;
  const match = date.match(/^(\d{4})/);
  return match ? Number(match[1]) : Number.NaN;
}

function makeScalarLayer(value, Type, sourceName, note, semanticKey = "") {
  return makeRasterLayer([value], 1, 1, Type, { boundsKm: DEFAULT_BOUNDS_KM, note }, sourceName, semanticKey);
}

function inferBoundsKmFromCoordinates(xs, ys) {
  const validXs = xs.filter(Number.isFinite);
  const validYs = ys.filter(Number.isFinite);
  if (!validXs.length || !validYs.length) return [...DEFAULT_BOUNDS_KM];
  const minX = Math.min(...validXs);
  const maxX = Math.max(...validXs);
  const minY = Math.min(...validYs);
  const maxY = Math.max(...validYs);
  if (minX >= 0 && maxX <= DEFAULT_MAP_SIZE_KM && minY >= 0 && maxY <= DEFAULT_MAP_SIZE_KM) {
    return expandPointBounds([minX, minY, maxX, maxY], validXs, validYs);
  }
  return [...DEFAULT_BOUNDS_KM];
}

function expandPointBounds(bounds, xs, ys) {
  const [minX, minY, maxX, maxY] = bounds;
  const dx = medianSpacing(xs);
  const dy = medianSpacing(ys);
  return [
    clamp(minX - dx / 2, 0, DEFAULT_MAP_SIZE_KM),
    clamp(minY - dy / 2, 0, DEFAULT_MAP_SIZE_KM),
    clamp(maxX + dx / 2, 0, DEFAULT_MAP_SIZE_KM),
    clamp(maxY + dy / 2, 0, DEFAULT_MAP_SIZE_KM)
  ];
}

function medianSpacing(values) {
  const unique = uniqueSorted(values);
  if (unique.length < 2) return DEFAULT_MAP_SIZE_KM;
  const gaps = [];
  for (let i = 1; i < unique.length; i += 1) gaps.push(unique[i] - unique[i - 1]);
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)] || DEFAULT_MAP_SIZE_KM;
}

function hasRasterLayer(parsed) {
  return Boolean(
    parsed.dem ||
      parsed.landCover ||
      parsed.soilGroup ||
      parsed.soilHydraulicConductivity ||
      parsed.availableWaterCapacity ||
      parsed.rootDepth ||
      parsed.imperviousFraction ||
      parsed.vegetation ||
      parsed.leafAreaIndex ||
      parsed.canopyHeight ||
      parsed.temperature ||
      parsed.precipitation ||
      parsed.windSpeed ||
      parsed.windDirection
  );
}

function defaultLayerKeyForRole(role, sourceName) {
  if (role === "soil") return inferGeoTiffLayerKey(role, sourceName);
  if (role === "landCover") return inferGeoTiffLayerKey(role, sourceName);
  if (role === "met") {
    const key = inferGeoTiffLayerKey(role, sourceName);
    return key === "metBundle" ? "precipitation" : key;
  }
  return "dem";
}

function applyRoleAlias(parsed, role) {
  if (role === "dem" && parsed.elevation && !parsed.dem) parsed.dem = parsed.elevation;
  if (role === "landCover" && parsed.landcover && !parsed.landCover) parsed.landCover = parsed.landcover;
  if (role === "soil" && parsed.soil && !parsed.soilGroup) parsed.soilGroup = parsed.soil;
}

function soilGroupToNumber(value) {
  const text = String(value).trim().toUpperCase();
  if (text.startsWith("A")) return 1;
  if (text.startsWith("B")) return 2;
  if (text.startsWith("C")) return 3;
  if (text.startsWith("D")) return 4;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Number.isFinite))).sort((a, b) => a - b);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mean(values) {
  const finite = values.filter(Number.isFinite);
  return finite.reduce((sum, value) => sum + value, 0) / Math.max(1, finite.length);
}

function meanOrNaN(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? mean(finite) : Number.NaN;
}

function meanOrNull(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? mean(finite) : null;
}

function meanFiniteArray(values) {
  return meanOrNaN(Array.from(values));
}

function quantile(sortedValues, q) {
  if (!sortedValues.length) return Number.NaN;
  const pos = (sortedValues.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedValues[lo];
  return sortedValues[lo] + (sortedValues[hi] - sortedValues[lo]) * (pos - lo);
}

function circularMean(values) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return Number.NaN;
  let sx = 0;
  let sy = 0;
  for (const value of finite) {
    const rad = (value * Math.PI) / 180;
    sx += Math.cos(rad);
    sy += Math.sin(rad);
  }
  return ((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360;
}

function numberOr(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function finiteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function firstPresent(...values) {
  for (const value of values) {
    if (value != null && value !== "") return value;
  }
  return null;
}

function firstFinite(...values) {
  for (const value of values) {
    if (value == null || value === "") continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return Number.NaN;
}

function numericArray(value) {
  if (!Array.isArray(value) && !(value && typeof value.length === "number")) return null;
  const out = Array.from(value, (item) => Number(item)).filter(Number.isFinite);
  return out.length ? out : null;
}

function normalizePixelSizeMeta(value, unit = null) {
  if (value == null) return null;
  let x = Number.NaN;
  let y = Number.NaN;
  if (typeof value === "number" || typeof value === "string") {
    x = Number(value);
    y = Number(value);
  } else if (Array.isArray(value) || typeof value.length === "number") {
    x = Math.abs(Number(value[0]));
    y = Math.abs(Number(value[1] ?? value[0]));
  } else if (typeof value === "object") {
    x = Math.abs(Number(value.x ?? value.width ?? value.cellSizeX ?? value.pixelSizeX ?? value.mean));
    y = Math.abs(Number(value.y ?? value.height ?? value.cellSizeY ?? value.pixelSizeY ?? value.mean ?? x));
    unit = value.unit || value.units || unit;
  }
  if (!Number.isFinite(x) || x <= 0 || !Number.isFinite(y) || y <= 0) return null;
  return {
    x,
    y,
    mean: (x + y) / 2,
    unit: unit || null
  };
}

function unitNameFromGeoKey(code) {
  const n = Number(code);
  if (n === 9001) return "metre";
  if (n === 9002 || n === 9003) return "foot";
  if (n === 9102) return "degree";
  return Number.isFinite(n) ? `EPSG:${n}` : null;
}

function extractGeoTiffMetadataNumber(metadata, keys) {
  const value = extractGeoTiffMetadataValue(metadata, keys);
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function extractGeoTiffMetadataValue(metadata, keys) {
  if (!metadata) return null;
  const entries = metadata instanceof Map ? Array.from(metadata.entries()) : Object.entries(metadata);
  const lowered = new Map(entries.map(([key, value]) => [String(key).toLowerCase(), value]));
  for (const key of keys) {
    const value = lowered.get(String(key).toLowerCase());
    if (value != null && value !== "") return value;
  }
  if (typeof metadata === "string") {
    for (const key of keys) {
      const pattern = new RegExp(`<Item[^>]+name=["']${key}["'][^>]*>([^<]+)</Item>`, "i");
      const match = metadata.match(pattern);
      if (match) return match[1];
    }
  }
  return null;
}
