const DEFAULT_SIZE_KM = 128;

export function createDefaultAoi() {
  return {
    lat: 37.8651,
    lon: -119.5383,
    sizeKm: DEFAULT_SIZE_KM,
    startYear: 2020,
    endYear: 2024,
    gageSite: "",
    proxyBaseUrl: ""
  };
}

export function buildAcquisitionPlan(input) {
  const lat = Number(input.lat);
  const lon = Number(input.lon);
  const sizeKm = Number(input.sizeKm || DEFAULT_SIZE_KM);
  const startYear = Number(input.startYear || new Date().getUTCFullYear() - 5);
  const endYear = Number(input.endYear || new Date().getUTCFullYear() - 1);
  const gageSite = String(input.gageSite || "").trim();
  const proxyBaseUrl = normalizeProxyBase(input.proxyBaseUrl);
  const bbox = squareBbox(lon, lat, sizeKm);
  const bboxText = bbox.map((v) => fixed(v, 6)).join(",");
  const centerDaymet = `https://daymet.ornl.gov/single-pixel/api/data?lat=${fixed(lat, 6)}&lon=${fixed(lon, 6)}&vars=prcp,tmax,tmin,vp,srad,swe,dayl&years=${startYear}:${endYear}`;
  const startDate = `${startYear}-01-01`;
  const endDate = `${endYear}-12-31`;
  const normalizedCalibrationUrl = proxyBaseUrl && gageSite
    ? usgsDailyValuesProxyUrl(proxyBaseUrl, gageSite, startDate, endDate)
    : null;
  const gageDiscoveryUrl = proxyBaseUrl ? usgsGagesProxyUrl(proxyBaseUrl, lat, lon, sizeKm, startDate, endDate) : null;
  const demDiscoveryUrl = proxyBaseUrl ? tnmDemProductsProxyUrl(proxyBaseUrl, lat, lon, sizeKm) : null;
  const daymetGridUrl = proxyBaseUrl ? daymetGridSampleProxyUrl(proxyBaseUrl, lat, lon, sizeKm, startYear, endYear) : null;
  const osmInfrastructureUrl = proxyBaseUrl ? osmInfrastructureProxyUrl(proxyBaseUrl, lat, lon, sizeKm) : null;

  const sources = [
    {
      id: "usgs_3dep_dem_candidates",
      role: "dem",
      priority: "high",
      name: "USGS 3DEP DEM product candidates",
      url: tnmProductsUrl(bboxText, "Digital Elevation Model (DEM) 1 meter", "GeoTIFF"),
      docs: "https://tnmaccess.nationalmap.gov/api/v1/docs",
      expectedImport: demDiscoveryUrl
        ? "Cloudflare /tnm/dem-products ranked candidate list with direct GeoTIFF download URLs and estimated native cell size."
        : "TNM products JSON. Prefer 1 m GeoTIFF where coverage exists, then 1/3 arc-second fallback.",
      expectedFields: ["title", "downloadUrl", "format", "estimatedNativeCellSizeM", "metadataUrl"],
      normalizedProxyUrl: demDiscoveryUrl,
      notes: "Use this discovery source before downloading DEM tiles. Mosaic and reproject selected GeoTIFF products before importing into GeoLab."
    },
    {
      id: "usgs_3dep_dem_1m",
      role: "dem",
      priority: "high",
      name: "USGS 3DEP 1 meter DEM",
      url: tnmProductsUrl(bboxText, "Digital Elevation Model (DEM) 1 meter", "GeoTIFF"),
      docs: "https://tnmaccess.nationalmap.gov/api/v1/docs",
      expectedImport: "DEM GeoTIFF",
      notes: "Use this first where lidar-derived 1 m DEM products are available. If the product list is empty, use the 1/3 arc-second fallback."
    },
    {
      id: "usgs_3dep_dem_13arc",
      role: "dem",
      priority: "fallback",
      name: "USGS 3DEP 1/3 arc-second DEM",
      url: tnmProductsUrl(bboxText, "National Elevation Dataset (NED) 1/3 arc-second", "GeoTIFF"),
      docs: "https://tnmaccess.nationalmap.gov/api/v1/docs",
      expectedImport: "DEM GeoTIFF",
      notes: "Fallback DEM source for broad coverage when 1 m products are unavailable or too fragmented."
    },
    {
      id: "usda_gssurgo",
      role: "soil",
      priority: "high",
      name: "USDA-NRCS gSSURGO / SSURGO",
      url: "https://www.nrcs.usda.gov/resources/data-and-reports/gridded-soil-survey-geographic-gssurgo-database",
      expectedImport: "CSV/GeoTIFF with hydrologic_soil_group or soilGroup values A-D / 1-4 plus optional ksat_mm_hr, awc_mm, root_depth_m",
      expectedFields: ["hydrologic_soil_group", "ksat_mm_hr", "awc_mm", "root_depth_m"],
      notes: "Extract Hydrologic Soil Group, saturated hydraulic conductivity, available water capacity, root zone depth, drainage, and restrictive-layer depth for the AOI."
    },
    {
      id: "nrcs_web_soil_survey",
      role: "soil",
      priority: "fallback",
      name: "USDA-NRCS Web Soil Survey / SSURGO tabular export",
      url: "https://websoilsurvey.nrcs.usda.gov/",
      expectedImport: "CSV joined to AOI grid with HSG, Ksat, AWC, root depth, and drainage attributes",
      expectedFields: ["soil_group", "ksat_mm_hr", "awc_mm", "root_depth_m"],
      notes: "Use when full gSSURGO processing is too heavy. Join tabular component fields to an AOI raster in GIS before importing."
    },
    {
      id: "mrlc_nlcd",
      role: "landCover",
      priority: "high",
      name: "MRLC NLCD land cover / tree canopy",
      url: "https://www.mrlc.gov/",
      expectedImport: "GeoTIFF/CSV with NLCD codes, vegetation_fraction, canopy_height_m, or impervious_fraction",
      expectedFields: ["landcover", "vegetation_fraction", "canopy_height_m", "impervious_fraction"],
      notes: "Use annual NLCD or legacy NLCD plus Tree Canopy Cover and impervious products where available. Import landcover separately from canopy/vegetation when possible."
    },
    {
      id: "mrlc_impervious",
      role: "landCover",
      priority: "high",
      name: "MRLC NLCD impervious descriptor",
      url: "https://www.mrlc.gov/data",
      expectedImport: "GeoTIFF/CSV with impervious_fraction or impervious_percent",
      expectedFields: ["impervious_fraction"],
      notes: "Use this to constrain urban runoff and curve-number behavior instead of inferring hardened surfaces from NLCD class alone."
    },
    {
      id: "daymet_grid_sample",
      role: "meteorology",
      priority: "high-screening",
      name: "NASA ORNL Daymet sampled AOI meteorology grid",
      url: centerDaymet,
      docs: "https://daymet.ornl.gov/web_services.html",
      expectedImport: daymetGridUrl
        ? "Cloudflare /daymet/grid-sample GeoLab meteorology JSON with precipitation, temperature, and overlapping daily forcing."
        : "Daymet single-pixel CSV sampled across the AOI and aggregated into a gridded GeoLab meteorology layer.",
      expectedFields: ["precipitation", "temperature", "metSummary.dailySeries", "boundsKm"],
      normalizedProxyUrl: daymetGridUrl,
      notes: "Use this to bring daily Daymet forcing into calibration diagnostics quickly. Full Daymet NetCDF/THREDDS or PRISM rasters are still preferred for final spatial forcing."
    },
    {
      id: "daymet_single_pixel",
      role: "meteorology",
      priority: "screening",
      name: "NASA ORNL Daymet single-pixel weather",
      url: centerDaymet,
      docs: "https://daymet.ornl.gov/getdata",
      expectedImport: "CSV after aggregation to annual precipitation and mean temperature",
      notes: "Good quick center-point screening for precipitation and temperature; use gridded Daymet NCSS for production AOI fields."
    },
    {
      id: "daymet_gridded_ncss",
      role: "meteorology",
      priority: "high",
      name: "NASA ORNL Daymet gridded subset",
      url: "https://daymet.ornl.gov/web_services.html",
      expectedImport: "NetCDF converted to GeoTIFF/CSV precipitation, temperature, wind proxy fields",
      notes: "Use NCSS/THREDDS gridded subset for spatially varying meteorological boundary conditions."
    },
    {
      id: "prism_climate",
      role: "meteorology",
      priority: "alternative",
      name: "PRISM Climate Group gridded climate",
      url: "https://prism.oregonstate.edu/",
      expectedImport: "GeoTIFF/CSV precipitation and temperature normals or time series",
      notes: "Useful for U.S. climate normals and high-quality precipitation/temperature fields."
    },
    {
      id: "usgs_waterdata_modern",
      role: "calibration",
      priority: "high",
      name: "USGS Water Data APIs",
      url: "https://api.waterdata.usgs.gov/",
      docs: "https://www.usgs.gov/tools/usgs-water-data-apis",
      expectedImport: "Observed discharge converted to observedDischargeM3s plus gage drainage area when available",
      notes: "Modern USGS water API family. Use monitoring locations and daily values near the AOI to pick calibration gages, and compare gage drainage area with the modeled outlet catchment."
    },
    {
      id: "usgs_gage_candidates",
      role: "calibration",
      priority: "high",
      name: "USGS streamgage candidates with daily discharge",
      url: `https://waterservices.usgs.gov/nwis/site/?format=rdb&bBox=${bboxText}&hasDataTypeCd=dv&parameterCd=00060&siteType=ST&siteStatus=all&siteOutput=expanded`,
      docs: "https://nwis.waterservices.usgs.gov/docs/site-service/site-service-details/",
      expectedImport: gageDiscoveryUrl
        ? "Cloudflare /usgs/gages ranked candidate list; choose a station, then fetch /usgs/daily-values for calibration."
        : "USGS Site Service RDB with streamgage coordinates and drainage-area fields.",
      expectedFields: ["site_no", "station_nm", "dec_lat_va", "dec_long_va", "drain_area_va", "contrib_drain_area_va"],
      normalizedProxyUrl: gageDiscoveryUrl,
      notes: "Use this before calibration download when the AOI gage is unknown. Candidate ranking is only a screening aid; final suitability depends on modeled watershed area and channel match."
    },
    {
      id: "usgs_water_services_legacy",
      role: "calibration",
      priority: "transition",
      name: "USGS legacy WaterServices",
      url: gageSite
        ? `https://waterservices.usgs.gov/nwis/dv/?format=json&sites=${encodeURIComponent(gageSite)}&parameterCd=00060&statCd=00003&startDT=${startDate}&endDT=${endDate}`
        : `https://waterservices.usgs.gov/nwis/site/?format=rdb&bBox=${bboxText}&hasDataTypeCd=dv&parameterCd=00060&siteType=ST&siteStatus=all`,
      docs: "https://nwis.waterservices.usgs.gov/docs/dv-service/daily-values-service-details/",
      expectedImport: normalizedCalibrationUrl
        ? "Cloudflare /usgs/daily-values GeoLab calibration JSON, or raw USGS daily-values JSON/CSV with date plus discharge_cfs / 00060 / discharge_m3s"
        : "USGS daily-values JSON or CSV with date plus discharge_cfs / 00060 / discharge_m3s",
      expectedFields: ["date", "00060", "discharge_cfs", "discharge_m3s"],
      normalizedProxyUrl: normalizedCalibrationUrl,
      notes: "Legacy daily-values JSON can be imported directly as calibration data. USGS says these services are planned for decommissioning in early 2027."
    },
    {
      id: "usgs_nhdplus_hr_flowlines",
      role: "hydrology",
      priority: "high",
      name: "USGS NHDPlus High Resolution flowlines",
      url: `https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/6/query?f=geojson&geometry=${encodeURIComponent(JSON.stringify({ xmin: bbox[0], ymin: bbox[1], xmax: bbox[2], ymax: bbox[3], spatialReference: { wkid: 4326 } }))}&geometryType=esriGeometryEnvelope&inSR=4326&outSR=4326&outFields=COMID,GNIS_NAME,StreamOrde,LengthKM&returnGeometry=true`,
      expectedImport: "GeoJSON LineString/MultiLineString flowlines with COMID, GNIS_NAME, stream order, and optional length_km",
      expectedFields: ["COMID", "GNIS_NAME", "stream_order", "length_km"],
      notes: "Use to constrain the modeled river skeleton and audit calibration gage distance to an authoritative hydrography network."
    },
    {
      id: "osm_overpass_infrastructure",
      role: "infrastructure",
      priority: "high",
      name: "OpenStreetMap built environment, transport, and water-control features",
      url: overpassInfrastructureUrl(bbox),
      docs: "https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL",
      expectedImport: osmInfrastructureUrl
        ? "Cloudflare /osm/infrastructure GeoLab infrastructure GeoJSON with standardized physical feedback fields."
        : "Overpass JSON converted to GeoJSON with infrastructure_type plus physical feedback attributes.",
      expectedFields: ["infrastructure_type", "radius_km", "impervious_fraction", "runoff_delta", "temperature_delta_c", "storage_mm", "flow_retention", "irrigation_mm", "building_height_m", "floor_count"],
      normalizedProxyUrl: osmInfrastructureUrl,
      notes: "The Cloudflare endpoint maps OSM place, highway, railway, building, landuse, amenity, waterway, reservoir, and power tags into GeoLab infrastructure classes before import."
    }
  ];

  return {
    generatedAt: new Date().toISOString(),
    aoi: {
      center: { lat, lon },
      sizeKm,
      areaKm2: Math.round(sizeKm * sizeKm),
      bboxWgs84: {
        west: bbox[0],
        south: bbox[1],
        east: bbox[2],
        north: bbox[3],
        text: bboxText
      }
    },
    proxy: proxyBaseUrl
      ? {
          baseUrl: proxyBaseUrl,
          endpoint: `${proxyBaseUrl}/proxy?url=<encoded source URL>`,
          demDiscoveryEndpoint: `${proxyBaseUrl}/tnm/dem-products?lat=<lat>&lon=<lon>&sizeKm=<km>`,
          daymetGridEndpoint: `${proxyBaseUrl}/daymet/grid-sample?lat=<lat>&lon=<lon>&sizeKm=<km>&startYear=<YYYY>&endYear=<YYYY>&grid=3`,
          osmInfrastructureEndpoint: `${proxyBaseUrl}/osm/infrastructure?lat=<lat>&lon=<lon>&sizeKm=<km>&limit=900`,
          calibrationEndpoint: `${proxyBaseUrl}/usgs/daily-values?site=<usgs_site>&start=<YYYY-MM-DD>&end=<YYYY-MM-DD>`,
          gageDiscoveryEndpoint: `${proxyBaseUrl}/usgs/gages?lat=<lat>&lon=<lon>&sizeKm=<km>&start=<YYYY-MM-DD>&end=<YYYY-MM-DD>`
        }
      : null,
    dataRequirements: buildDataRequirements(),
    sources: attachProxySources(sources, proxyBaseUrl),
    importPipeline: [
      "下载或导出每个源，并按 AOI 边界裁剪。",
      "把所有栅格重投影到适合局地距离和面积计算的统一投影 CRS。",
      "转换为带 boundsKm 与 CRS 元数据的 GeoTIFF 或 GeoLab JSON/CSV。",
      "优先加载 DEM，使模型目标范围跟随真实 DEM。",
      "加载土壤 HSG 及 Ksat/AWC/根深、土地覆盖及冠层/LAI/不透水面、气象和校准文件。",
      "运行质量报告，检查覆盖率、CRS、边界、校准偏差、坡度/坡向和湿润指数输出。"
    ],
    warnings: [
      "这份计划生成权威源 URL 和处理步骤，本身不是已完成校准的科学模型。",
      "TNM 产品名称和可用性会随 AOI 改变；下载前应检查返回的产品元数据。",
      `Daymet 单点数据只是 ${Math.round(sizeKm * sizeKm)} km2 AOI 的筛查捷径；正式生产应优先使用栅格子集。`,
      "USGS legacy WaterServices 应在 2027 年退役窗口前迁移到现代 Water Data APIs。"
    ]
  };
}

export function summarizePlan(plan) {
  if (!plan) return "未生成采集计划";
  const bbox = plan.aoi.bboxWgs84;
  return `${plan.aoi.areaKm2} km² · 边界 ${fixed(bbox.west, 3)}, ${fixed(bbox.south, 3)}, ${fixed(bbox.east, 3)}, ${fixed(bbox.north, 3)} · ${plan.sources.length} 个源`;
}

function buildDataRequirements() {
  return [
    {
      group: "terrain",
      required: ["dem"],
      preferredSources: ["usgs_3dep_dem_candidates", "usgs_3dep_dem_1m", "usgs_3dep_dem_13arc"],
      importFields: ["dem", "elevation_m"],
      qualityChecks: ["coverage >= 95%", "projected CRS or WGS84 bbox convertible to AOI local km", "cell size documented"]
    },
    {
      group: "soil_hydrology",
      required: ["soilGroup"],
      optionalHighValue: ["soilHydraulicConductivity", "availableWaterCapacity", "rootDepth"],
      preferredSources: ["usda_gssurgo", "nrcs_web_soil_survey"],
      importFields: ["soil_group", "hydrologic_soil_group", "HYDGRP", "hsg", "ksat_mm_hr", "awc_mm", "root_depth_m"],
      qualityChecks: ["HSG A-D or 1-4 present", "Ksat in mm/hr", "AWC in mm over modeled root zone", "root depth in meters", "GeoJSON polygon feature count documented when vector data is imported"]
    },
    {
      group: "landcover_vegetation",
      required: ["landCover"],
      optionalHighValue: ["vegetation", "leafAreaIndex", "canopyHeight", "imperviousFraction"],
      preferredSources: ["mrlc_nlcd", "mrlc_impervious"],
      importFields: ["landcover", "nlcd", "NLCD", "gridcode", "classvalue", "vegetation_fraction", "lai", "canopy_height_m", "impervious_fraction"],
      qualityChecks: ["NLCD class codes preserved", "fractions encoded 0-1 or 0-100", "canopy height in meters", "GeoJSON polygon feature count documented when vector data is imported"]
    },
    {
      group: "meteorology_boundary",
      required: ["precipitation", "temperature"],
      optionalHighValue: ["windSpeed", "windDirection"],
      preferredSources: ["daymet_grid_sample", "daymet_single_pixel", "daymet_gridded_ncss", "prism_climate"],
      importFields: ["precip_mm_yr", "temp_c", "wind_speed", "wind_direction", "date", "prcp_mm", "tmax", "tmin"],
      qualityChecks: ["time range matches calibration window", "daily or annual aggregation documented", "gridded source preferred over center point"]
    },
    {
      group: "hydrology_flowlines",
      required: ["flowlines"],
      preferredSources: ["usgs_nhdplus_hr_flowlines"],
      importFields: ["LineString", "MultiLineString", "COMID", "GNIS_NAME", "stream_order", "length_km"],
      qualityChecks: ["flowlines overlap AOI", "CRS is EPSG:4326 or explicit local km", "constrained cell count > 0", "river GeoJSON preserves source=flowline"]
    },
    {
      group: "built_environment",
      required: ["infrastructure"],
      preferredSources: ["osm_overpass_infrastructure", "mrlc_impervious"],
      importFields: ["Point/LineString/Polygon", "infrastructure_type", "radius_km", "impervious_fraction", "runoff_delta", "temperature_delta_c", "storage_mm", "flow_retention", "irrigation_mm", "building_height_m", "floor_count"],
      qualityChecks: ["feature class mapped to built, transport, utility, and water-control typologies", "affected cell count > 0", "impervious and retention values are within physical 0-1 bounds", "building height/floor values are plausible for their class"]
    },
    {
      group: "calibration",
      required: ["observedDischargeM3s or observedSeries"],
      preferredSources: ["usgs_waterdata_modern", "usgs_water_services_legacy"],
      importFields: ["date", "discharge_m3s", "flow_m3s", "discharge_cfs", "00060", "drainage_area_km2", "drainage_area_sqmi", "site_code", "site_latitude", "site_longitude"],
      qualityChecks: ["cfs converted to m3/s", "record count >= 30", "gage drainage area is comparable to modeled outlet catchment"]
    }
  ];
}

export async function checkAcquisitionPlan(plan, fetcher = fetch) {
  const startedAt = new Date().toISOString();
  const sources = [];
  for (const source of plan.sources) {
    sources.push(await checkSource(source, fetcher));
  }
  const summary = {
    total: sources.length,
    ok: sources.filter((source) => source.status === "ok").length,
    manual: sources.filter((source) => source.status === "manual").length,
    warning: sources.filter((source) => source.status === "warning").length,
    error: sources.filter((source) => source.status === "error").length,
    products: sources.reduce((sum, source) => sum + (source.productCount || 0), 0)
  };
  return {
    generatedAt: new Date().toISOString(),
    startedAt,
    aoi: plan.aoi,
    summary,
    sources
  };
}

export function summarizeManifest(manifest) {
  if (!manifest) return "尚未检查源";
  const s = manifest.summary;
  return `在线检查 ${s.total} 个源 · 可用 ${s.ok} · 警告 ${s.warning} · 手动 ${s.manual} · 产品 ${s.products}`;
}

async function checkSource(source, fetcher) {
  if (source.id.startsWith("usgs_3dep")) return checkTnmSource(source, fetcher);
  if (source.id === "daymet_grid_sample") return checkDaymetGridSampleSource(source, fetcher);
  if (source.id === "osm_overpass_infrastructure") return checkOsmInfrastructureSource(source, fetcher);
  if (source.id === "daymet_single_pixel") {
    if (isBrowserRuntime() && !source.proxyBaseUrl) {
      return {
        ...basicSource(source),
        status: "manual",
        message: "Daymet 单点端点可从脚本/CLI 访问，但可能被浏览器 CORS 阻止。请在浏览器外使用导出的 URL 或源 manifest 工作流。"
      };
    }
    return checkTextSource(source, fetcher, "daymet");
  }
  if (source.id === "usgs_water_services_legacy") return checkWaterSource(source, fetcher);
  if (source.id === "usgs_gage_candidates") return checkWaterSource(source, fetcher);
  if (source.id === "usgs_waterdata_modern") {
    return {
      ...basicSource(source),
      status: "manual",
      message: "现代 USGS Water Data APIs 需要按端点选择集合。可用此条目把校准搜索从 legacy WaterServices 迁移出去。"
    };
  }
  return {
    ...basicSource(source),
    status: "manual",
    message: "手工 GIS 下载/导出源。导入前请用数据提供方工具裁剪 AOI 并转换为 GeoTIFF/CSV。"
  };
}

async function checkDaymetGridSampleSource(source, fetcher) {
  if (!source.normalizedProxyUrl) {
    return {
      ...basicSource(source),
      status: "manual",
      message: "请填写 Cloudflare Worker URL，浏览器才能获取标准化 Daymet 网格采样 JSON。"
    };
  }
  try {
    const response = await fetchWithTimeout(fetcher, source.normalizedProxyUrl, { headers: { Accept: "application/json" } });
    const text = await response.text();
    if (!response.ok) {
      return { ...basicSource(source), status: "error", httpStatus: response.status, message: trim(text, 280) };
    }
    const payload = JSON.parse(text);
    const summary = payload?.meteorology?.metSummary || payload?.metSummary || {};
    return {
      ...basicSource(source),
      status: Number(summary.usableSampleCount || 0) > 0 ? "ok" : "warning",
      httpStatus: response.status,
      productCount: Number(summary.usableSampleCount || 0),
      products: (summary.sampleSummaries || []).slice(0, 8).map((sample) => ({
        lat: sample.lat,
        lon: sample.lon,
        annualPrecipitationMm: sample.annualPrecipitationMm,
        meanTemperatureC: sample.meanTemperatureC,
        recordCount: sample.recordCount
      })),
      message: Number(summary.usableSampleCount || 0) > 0
        ? "Cloudflare Daymet 网格采样已返回标准化气象强迫。"
        : "Daymet 网格采样未返回可用 AOI 样点。"
    };
  } catch (error) {
    return { ...basicSource(source), status: "error", message: sourceError(error) };
  }
}

async function checkOsmInfrastructureSource(source, fetcher) {
  if (!source.normalizedProxyUrl) {
    return {
      ...basicSource(source),
      status: "manual",
      message: "请填写 Cloudflare Worker URL，浏览器才能获取标准化 OSM 设施 GeoJSON。"
    };
  }
  try {
    const response = await fetchWithTimeout(fetcher, source.normalizedProxyUrl, { headers: { Accept: "application/json" } });
    const text = await response.text();
    if (!response.ok) {
      return { ...basicSource(source), status: "error", httpStatus: response.status, message: trim(text, 280) };
    }
    const payload = JSON.parse(text);
    const summary = payload?.summary || payload?.infrastructure?.properties?.summary || {};
    const featureCount = Number(summary.featureCount || payload?.infrastructure?.features?.length || 0);
    return {
      ...basicSource(source),
      status: featureCount > 0 ? "ok" : "warning",
      httpStatus: response.status,
      productCount: featureCount,
      products: Object.entries(summary.classCounts || {}).slice(0, 12).map(([type, count]) => ({ type, count })),
      message: featureCount > 0
        ? "Cloudflare OSM 端点已返回标准化设施 GeoJSON。"
        : "OSM 设施端点请求成功，但没有返回可用人造环境要素。"
    };
  } catch (error) {
    return { ...basicSource(source), status: "error", message: sourceError(error) };
  }
}

async function checkTnmSource(source, fetcher) {
  try {
    const url = source.normalizedProxyUrl || sourceFetchUrl(source, withExtraParams(source.url, { max: "8" }));
    const response = await fetchWithTimeout(fetcher, url, { headers: { Accept: "application/json" } });
    const text = await response.text();
    if (!response.ok) {
      return { ...basicSource(source), status: "error", httpStatus: response.status, message: trim(text, 280) };
    }
    const json = JSON.parse(text);
    const items = Array.isArray(json.items) ? json.items : Array.isArray(json.candidates) ? json.candidates : [];
    return {
      ...basicSource(source),
      status: items.length ? "ok" : "warning",
      httpStatus: response.status,
      productCount: Number(json.total ?? json.totalParsed ?? json.count ?? items.length),
      products: items.slice(0, 8).map((item) => ({
        title: item.title,
        format: item.format,
        extent: item.extent,
        estimatedNativeCellSizeM: item.estimatedNativeCellSizeM,
        score: item.score,
        downloadURL: item.downloadURL || item.downloadUrl || item.urls?.download,
        metadataURL: item.metaUrl || item.metadataURL || item.metadataUrl
      })),
      message: items.length
        ? (json.type === "geolab-dem-product-candidates"
            ? "Cloudflare TNM DEM 搜索已返回排序 GeoTIFF 候选。"
            : "TNM 产品查询已返回可下载候选。")
        : "TNM 查询成功，但当前 AOI 未返回产品。"
    };
  } catch (error) {
    return { ...basicSource(source), status: "error", message: sourceError(error) };
  }
}

async function checkTextSource(source, fetcher, type) {
  try {
    const response = await fetchWithTimeout(fetcher, sourceFetchUrl(source));
    const text = await response.text();
    if (!response.ok) {
      return { ...basicSource(source), status: "error", httpStatus: response.status, message: trim(text, 280) };
    }
    const lines = text.split(/\r?\n/).filter(Boolean);
    return {
      ...basicSource(source),
      status: "ok",
      httpStatus: response.status,
      productCount: type === "daymet" ? 1 : 0,
      preview: lines.slice(0, 10),
      message: type === "daymet" ? "Daymet 已返回 AOI 中心点表格气象数据。" : "数据源已返回文本数据。"
    };
  } catch (error) {
    return { ...basicSource(source), status: "error", message: sourceError(error) };
  }
}

async function checkWaterSource(source, fetcher) {
  try {
    const response = await fetchWithTimeout(fetcher, source.normalizedProxyUrl || sourceFetchUrl(source));
    const text = await response.text();
    if (!response.ok) {
      return {
        ...basicSource(source),
        status: "warning",
        httpStatus: response.status,
        message: `Legacy WaterServices 未返回本次请求的校准数据。${trim(text, 180)}`
      };
    }
    return {
      ...basicSource(source),
      status: "ok",
      httpStatus: response.status,
      productCount: 1,
      preview: text.split(/\r?\n/).slice(0, 12),
      message: source.normalizedProxyUrl
        ? "Cloudflare 已将 USGS 日值标准化为 GeoLab 校准 JSON。"
        : "Legacy WaterServices 已返回候选校准数据。"
    };
  } catch (error) {
    return { ...basicSource(source), status: "error", message: sourceError(error) };
  }
}

function basicSource(source) {
  return {
    id: source.id,
    role: source.role,
    priority: source.priority,
    name: source.name,
    url: source.url,
    proxyUrl: source.proxyUrl || null,
    normalizedProxyUrl: source.normalizedProxyUrl || null,
    expectedImport: source.expectedImport,
    docs: source.docs || null
  };
}

function attachProxySources(sources, proxyBaseUrl) {
  if (!proxyBaseUrl) return sources;
  return sources.map((source) => ({
    ...source,
    proxyBaseUrl,
    proxyUrl: sourceFetchUrl({ ...source, proxyBaseUrl })
  }));
}

function sourceFetchUrl(source, upstreamUrl = source.url) {
  if (!source.proxyBaseUrl) return upstreamUrl;
  const proxy = new URL(`${source.proxyBaseUrl}/proxy`);
  proxy.searchParams.set("url", upstreamUrl);
  return proxy.toString();
}

function usgsDailyValuesProxyUrl(proxyBaseUrl, site, startDate, endDate) {
  const url = new URL(`${proxyBaseUrl}/usgs/daily-values`);
  url.searchParams.set("site", site);
  url.searchParams.set("start", startDate);
  url.searchParams.set("end", endDate);
  return url.toString();
}

function usgsGagesProxyUrl(proxyBaseUrl, lat, lon, sizeKm, startDate, endDate) {
  const url = new URL(`${proxyBaseUrl}/usgs/gages`);
  url.searchParams.set("lat", fixed(lat, 6));
  url.searchParams.set("lon", fixed(lon, 6));
  url.searchParams.set("sizeKm", fixed(sizeKm, 3));
  url.searchParams.set("start", startDate);
  url.searchParams.set("end", endDate);
  return url.toString();
}

function tnmDemProductsProxyUrl(proxyBaseUrl, lat, lon, sizeKm) {
  const url = new URL(`${proxyBaseUrl}/tnm/dem-products`);
  url.searchParams.set("lat", fixed(lat, 6));
  url.searchParams.set("lon", fixed(lon, 6));
  url.searchParams.set("sizeKm", fixed(sizeKm, 3));
  return url.toString();
}

function daymetGridSampleProxyUrl(proxyBaseUrl, lat, lon, sizeKm, startYear, endYear) {
  const url = new URL(`${proxyBaseUrl}/daymet/grid-sample`);
  url.searchParams.set("lat", fixed(lat, 6));
  url.searchParams.set("lon", fixed(lon, 6));
  url.searchParams.set("sizeKm", fixed(sizeKm, 3));
  url.searchParams.set("startYear", String(Math.round(startYear)));
  url.searchParams.set("endYear", String(Math.round(endYear)));
  url.searchParams.set("grid", "3");
  return url.toString();
}

function osmInfrastructureProxyUrl(proxyBaseUrl, lat, lon, sizeKm) {
  const url = new URL(`${proxyBaseUrl}/osm/infrastructure`);
  url.searchParams.set("lat", fixed(lat, 6));
  url.searchParams.set("lon", fixed(lon, 6));
  url.searchParams.set("sizeKm", fixed(sizeKm, 3));
  url.searchParams.set("limit", "900");
  return url.toString();
}

async function fetchWithTimeout(fetcher, url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);
  try {
    return await fetcher(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function withExtraParams(url, params) {
  const next = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    if (!next.searchParams.has(key)) next.searchParams.set(key, value);
  }
  return next.toString();
}

function sourceError(error) {
  const message = error?.name === "AbortError" ? "请求超时" : error?.message || String(error);
  return `${message}。浏览器 CORS 可能阻止在线检查；必要时请在 GIS/脚本工作流中使用导出的 URL。`;
}

function trim(text, max) {
  return String(text || "").replace(/\s+/g, " ").slice(0, max);
}

function isBrowserRuntime() {
  return typeof window !== "undefined" && typeof window.document !== "undefined";
}

function normalizeProxyBase(value) {
  const text = String(value || "").trim().replace(/\/+$/, "");
  if (!text) return "";
  try {
    const url = new URL(text);
    return url.origin + url.pathname.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function tnmProductsUrl(bboxText, dataset, format) {
  const params = new URLSearchParams({
    bbox: bboxText,
    datasets: dataset,
    prodFormats: format,
    outputFormat: "JSON"
  });
  return `https://tnmaccess.nationalmap.gov/api/v1/products?${params.toString()}`;
}

function overpassInfrastructureUrl(bbox) {
  const params = new URLSearchParams({
    data: overpassInfrastructureQuery(bbox)
  });
  return `https://overpass-api.de/api/interpreter?${params.toString()}`;
}

function overpassInfrastructureQuery(bbox) {
  const [west, south, east, north] = bbox.map((value) => fixed(value, 6));
  const area = `(${south},${west},${north},${east})`;
  return [
    "[out:json][timeout:60];",
    "(",
    `node["place"~"city|town|village|hamlet"]${area};`,
    `way["highway"]${area};`,
    `way["railway"]${area};`,
    `way["building"]${area};`,
    `way["landuse"~"residential|commercial|industrial|retail|quarry|construction"]${area};`,
    `way["amenity"~"hospital|school|university|college|stadium"]${area};`,
    `way["leisure"~"park|stadium"]${area};`,
    `way["aeroway"~"aerodrome|runway|taxiway"]${area};`,
    `way["man_made"~"bridge|pier|wastewater_plant|water_works|works|tower|embankment"]${area};`,
    `way["power"~"plant|substation|generator"]${area};`,
    `way["waterway"~"dam|weir|canal|ditch|drain"]${area};`,
    `way["water"~"reservoir|basin|pond"]${area};`,
    `relation["landuse"~"residential|commercial|industrial|retail"]${area};`,
    `relation["water"~"reservoir|basin|pond"]${area};`,
    ");",
    `out geom${area};`
  ].join("");
}

function squareBbox(lon, lat, sizeKm) {
  const half = sizeKm / 2;
  const dLat = half / 110.574;
  const dLon = half / (111.32 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
}

function fixed(value, digits) {
  return Number(value).toFixed(digits);
}
