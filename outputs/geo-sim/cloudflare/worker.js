const DEFAULT_SIZE_KM = 128;
const CFS_TO_M3S = 0.028316846592;
const MAX_USGS_DAILY_YEARS = 25;
const MAX_DAYMET_YEARS = 10;
const MAX_DAYMET_GRID = 5;
const MAX_OSM_RESPONSE_BYTES = 6_000_000;
const MAX_OSM_FEATURES = 2000;
const ALLOWED_HOSTS = new Set([
  "tnmaccess.nationalmap.gov",
  "hydro.nationalmap.gov",
  "daymet.ornl.gov",
  "waterservices.usgs.gov",
  "api.waterdata.usgs.gov",
  "overpass-api.de"
]);

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type, accept",
  "access-control-max-age": "86400"
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
    if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);

    try {
      if (url.pathname === "/" || url.pathname === "/health") {
        return json({ ok: true, service: "geolab-128-data-proxy" });
      }
      if (url.pathname === "/plan") {
        return json(buildAcquisitionPlan(url.searchParams, url.origin));
      }
      if (url.pathname === "/proxy") {
        return proxyAllowedSource(url.searchParams, ctx);
      }
      if (url.pathname === "/usgs/daily-values") {
        return fetchUsgsDailyValues(url.searchParams, ctx);
      }
      if (url.pathname === "/usgs/gages") {
        return fetchUsgsGages(url.searchParams, url.origin, ctx);
      }
      if (url.pathname === "/tnm/dem-products") {
        return fetchTnmDemProducts(url.searchParams, url.origin, ctx);
      }
      if (url.pathname === "/daymet/grid-sample") {
        return fetchDaymetGridSample(url.searchParams, url.origin, ctx);
      }
      if (url.pathname === "/osm/infrastructure") {
        return fetchOsmInfrastructure(url.searchParams, url.origin, ctx);
      }
      return json({ error: "Not found" }, 404);
    } catch (error) {
      return json({ error: error?.message || String(error) }, 400);
    }
  }
};

async function proxyAllowedSource(params, ctx) {
  const target = new URL(required(params, "url"));
  if (!ALLOWED_HOSTS.has(target.hostname)) {
    return json({ error: `Host not allowed: ${target.hostname}` }, 403);
  }
  const upstream = await fetch(target.toString(), {
    headers: {
      accept: params.get("accept") || "application/json,text/csv,text/plain,*/*"
    },
    cf: {
      cacheTtl: clampNumber(params.get("cacheTtl"), 60, 86400, 1800),
      cacheEverything: false
    }
  });
  ctx?.waitUntil?.(logSourceCheck(target, upstream.status));
  const headers = new Headers(upstream.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  headers.set("cache-control", "public, max-age=1800");
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers
  });
}

async function fetchUsgsDailyValues(params, ctx) {
  const site = normalizeSiteCode(required(params, "site"));
  const { startDate, endDate } = boundedDailyDateWindow(params);
  const upstreamUrl = usgsDailyValuesUrl(site, startDate, endDate);
  const upstream = await fetch(upstreamUrl, {
    headers: { accept: "application/json" },
    cf: {
      cacheTtl: clampNumber(params.get("cacheTtl"), 60, 86400, 1800),
      cacheEverything: false
    }
  });
  ctx?.waitUntil?.(logSourceCheck(new URL(upstreamUrl), upstream.status));
  const text = await upstream.text();
  if (!upstream.ok) {
    return json({
      error: "USGS daily-values request failed",
      upstreamStatus: upstream.status,
      upstreamUrl,
      preview: trim(text, 360)
    }, upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502);
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return json({ error: "USGS daily-values response was not valid JSON", upstreamUrl, preview: trim(text, 360) }, 502);
  }
  const sourceName = `usgs-daily-values-${site}-${startDate}-${endDate}`;
  const calibration = normalizeUsgsDailyValues(payload, { sourceName, upstreamUrl, site, startDate, endDate });
  if (!calibration.observedSeries?.recordCount) {
    return json({ error: "USGS response did not contain usable discharge values", upstreamUrl, sourceName }, 422);
  }
  return json({
    type: "geolab-calibration",
    generatedAt: new Date().toISOString(),
    sourceName,
    upstream: {
      host: "waterservices.usgs.gov",
      endpoint: "nwis/dv",
      site,
      parameterCd: "00060",
      statCd: "00003",
      startDate,
      endDate,
      url: upstreamUrl
    },
    calibration
  });
}

async function fetchUsgsGages(params, origin, ctx) {
  const lat = clampNumber(params.get("lat"), -90, 90, 37.8651);
  const lon = clampNumber(params.get("lon"), -180, 180, -119.5383);
  const sizeKm = clampNumber(params.get("sizeKm"), 1, 256, DEFAULT_SIZE_KM);
  const limit = Math.round(clampNumber(params.get("limit"), 1, 50, 12));
  const startYear = Math.round(clampNumber(params.get("startYear"), 1889, 2100, new Date().getUTCFullYear() - 5));
  const endYear = Math.round(clampNumber(params.get("endYear"), 1889, 2100, new Date().getUTCFullYear() - 1));
  const startDate = normalizeIsoDate(params.get("start") || `${startYear}-01-01`);
  const endDate = normalizeIsoDate(params.get("end") || `${endYear}-12-31`);
  const bbox = squareBbox(lon, lat, sizeKm);
  const bboxText = bbox.map((v) => fixed(v, 6)).join(",");
  const upstreamUrl = usgsSiteServiceUrl(bboxText);
  const upstream = await fetch(upstreamUrl, {
    headers: { accept: "text/plain,*/*" },
    cf: {
      cacheTtl: clampNumber(params.get("cacheTtl"), 60, 86400, 1800),
      cacheEverything: false
    }
  });
  ctx?.waitUntil?.(logSourceCheck(new URL(upstreamUrl), upstream.status));
  const text = await upstream.text();
  if (!upstream.ok) {
    return json({
      error: "USGS site-service request failed",
      upstreamStatus: upstream.status,
      upstreamUrl,
      preview: trim(text, 360)
    }, upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502);
  }
  const candidates = rankUsgsGageCandidates(
    parseUsgsSiteRdb(text),
    { lat, lon, sizeKm, startDate, endDate, origin }
  );
  return json({
    type: "geolab-usgs-gage-candidates",
    generatedAt: new Date().toISOString(),
    aoi: {
      center: { lat, lon },
      sizeKm,
      areaKm2: Math.round(sizeKm * sizeKm),
      bboxWgs84: { west: bbox[0], south: bbox[1], east: bbox[2], north: bbox[3], text: bboxText }
    },
    upstream: {
      host: "waterservices.usgs.gov",
      endpoint: "nwis/site",
      parameterCd: "00060",
      hasDataTypeCd: "dv",
      url: upstreamUrl
    },
    count: Math.min(limit, candidates.length),
    totalParsed: candidates.length,
    candidates: candidates.slice(0, limit),
    recommendation: candidates[0]
      ? {
          siteCode: candidates[0].siteCode,
          siteName: candidates[0].siteName,
          score: candidates[0].score,
          normalizedCalibrationUrl: candidates[0].normalizedCalibrationUrl,
          note: "Screen this candidate against modeled watershed area and station-to-channel distance before fitting parameters."
        }
      : null
  });
}

async function fetchTnmDemProducts(params, origin, ctx) {
  const lat = clampNumber(params.get("lat"), -90, 90, 37.8651);
  const lon = clampNumber(params.get("lon"), -180, 180, -119.5383);
  const sizeKm = clampNumber(params.get("sizeKm"), 1, 256, DEFAULT_SIZE_KM);
  const limit = Math.round(clampNumber(params.get("limit"), 1, 50, 16));
  const bbox = squareBbox(lon, lat, sizeKm);
  const bboxText = bbox.map((v) => fixed(v, 6)).join(",");
  const productQueries = [
    {
      datasetKey: "1m",
      label: "USGS 3DEP 1 meter DEM",
      url: withUrlParam(tnmProductsUrl(bboxText, "Digital Elevation Model (DEM) 1 meter", "GeoTIFF"), "max", "50")
    },
    {
      datasetKey: "13arc",
      label: "USGS 3DEP 1/3 arc-second DEM",
      url: withUrlParam(tnmProductsUrl(bboxText, "National Elevation Dataset (NED) 1/3 arc-second", "GeoTIFF"), "max", "50")
    }
  ];
  const responses = await Promise.all(productQueries.map(async (query) => {
    const upstream = await fetch(query.url, {
      headers: { accept: "application/json" },
      cf: {
        cacheTtl: clampNumber(params.get("cacheTtl"), 60, 86400, 1800),
        cacheEverything: false
      }
    });
    ctx?.waitUntil?.(logSourceCheck(new URL(query.url), upstream.status));
    const text = await upstream.text();
    if (!upstream.ok) {
      return {
        ...query,
        ok: false,
        status: upstream.status,
        preview: trim(text, 360),
        items: []
      };
    }
    try {
      const payload = JSON.parse(text);
      const items = Array.isArray(payload.items) ? payload.items : [];
      return {
        ...query,
        ok: true,
        status: upstream.status,
        total: Number(payload.total ?? items.length),
        items
      };
    } catch {
      return {
        ...query,
        ok: false,
        status: 502,
        preview: trim(text, 360),
        items: []
      };
    }
  }));
  const products = responses.flatMap((response) => (
    response.items.map((item) => ({ ...item, _datasetKey: response.datasetKey, _datasetLabel: response.label }))
  ));
  const candidates = rankTnmDemProducts(products, { bbox, origin, lat, lon, sizeKm });
  return json({
    type: "geolab-dem-product-candidates",
    generatedAt: new Date().toISOString(),
    aoi: {
      center: { lat, lon },
      sizeKm,
      areaKm2: Math.round(sizeKm * sizeKm),
      bboxWgs84: { west: bbox[0], south: bbox[1], east: bbox[2], north: bbox[3], text: bboxText }
    },
    upstream: {
      host: "tnmaccess.nationalmap.gov",
      endpoint: "api/v1/products",
      formats: ["GeoTIFF"],
      queries: responses.map((response) => ({
        datasetKey: response.datasetKey,
        label: response.label,
        ok: response.ok,
        status: response.status,
        total: response.total ?? response.items.length,
        url: response.url,
        preview: response.preview
      }))
    },
    count: Math.min(limit, candidates.length),
    totalParsed: candidates.length,
    candidates: candidates.slice(0, limit),
    recommendation: candidates[0]
      ? {
          title: candidates[0].title,
          dataset: candidates[0].dataset,
          estimatedNativeCellSizeM: candidates[0].estimatedNativeCellSizeM,
          score: candidates[0].score,
          downloadUrl: candidates[0].downloadUrl,
          note: "Use the highest-resolution GeoTIFF candidate whose metadata fully overlaps the AOI; mosaic multiple tiles before import when the AOI crosses tile boundaries."
        }
      : null
  });
}

async function fetchDaymetGridSample(params, origin, ctx) {
  const lat = clampNumber(params.get("lat"), -90, 90, 37.8651);
  const lon = clampNumber(params.get("lon"), -180, 180, -119.5383);
  const sizeKm = clampNumber(params.get("sizeKm"), 1, 256, DEFAULT_SIZE_KM);
  const startYear = Math.round(clampNumber(params.get("startYear"), 1980, 2100, new Date().getUTCFullYear() - 5));
  const endYear = Math.round(clampNumber(params.get("endYear"), 1980, 2100, new Date().getUTCFullYear() - 1));
  const grid = Math.round(clampNumber(params.get("grid"), 1, MAX_DAYMET_GRID, 3));
  const years = daymetYears(startYear, endYear);
  const bbox = squareBbox(lon, lat, sizeKm);
  const samples = daymetSamplePoints(bbox, sizeKm, grid);
  const responses = await Promise.all(samples.map(async (sample) => {
    const upstreamUrl = daymetSinglePixelUrl(sample.lat, sample.lon, years);
    const upstream = await fetch(upstreamUrl, {
      headers: { accept: "text/csv,text/plain,*/*" },
      cf: {
        cacheTtl: clampNumber(params.get("cacheTtl"), 60, 86400, 1800),
        cacheEverything: false
      }
    });
    ctx?.waitUntil?.(logSourceCheck(new URL(upstreamUrl), upstream.status));
    const text = await upstream.text();
    if (!upstream.ok) {
      return {
        ...sample,
        ok: false,
        status: upstream.status,
        upstreamUrl,
        preview: trim(text, 360),
        records: []
      };
    }
    try {
      return {
        ...sample,
        ok: true,
        status: upstream.status,
        upstreamUrl,
        ...summarizeDaymetCsv(text)
      };
    } catch (error) {
      return {
        ...sample,
        ok: false,
        status: 502,
        upstreamUrl,
        preview: error?.message || "Daymet CSV parse failed",
        records: []
      };
    }
  }));
  const good = responses.filter((sample) => sample.ok && sample.records?.length);
  if (!good.length) {
    return json({
      error: "Daymet grid sample did not return usable meteorology records",
      upstream: responses.map(daymetSampleStatus)
    }, 422);
  }
  const sourceName = `daymet-grid-sample-${fixed(lat, 4)}-${fixed(lon, 4)}-${years[0]}-${years[years.length - 1]}`;
  const meteorology = normalizeDaymetGridSamples(good, {
    sourceName,
    lat,
    lon,
    sizeKm,
    grid,
    bbox,
    years
  });
  return json({
    type: "geolab-daymet-meteorology",
    generatedAt: new Date().toISOString(),
    sourceName,
    aoi: {
      center: { lat, lon },
      sizeKm,
      areaKm2: Math.round(sizeKm * sizeKm),
      bboxWgs84: { west: bbox[0], south: bbox[1], east: bbox[2], north: bbox[3], text: bbox.map((v) => fixed(v, 6)).join(",") }
    },
    upstream: {
      host: "daymet.ornl.gov",
      endpoint: "single-pixel/api/data",
      vars: ["prcp", "tmax", "tmin", "vp", "srad", "swe", "dayl"],
      years,
      grid,
      sampleCount: samples.length,
      usableSampleCount: good.length,
      samples: responses.map(daymetSampleStatus)
    },
    meteorology
  });
}

async function fetchOsmInfrastructure(params, origin, ctx) {
  const lat = clampNumber(params.get("lat"), -90, 90, 37.8651);
  const lon = clampNumber(params.get("lon"), -180, 180, -119.5383);
  const sizeKm = clampNumber(params.get("sizeKm"), 1, 256, DEFAULT_SIZE_KM);
  const limit = Math.round(clampNumber(params.get("limit"), 1, MAX_OSM_FEATURES, 900));
  const bbox = squareBbox(lon, lat, sizeKm);
  const upstreamUrl = overpassInfrastructureUrl(bbox);
  const upstream = await fetch(upstreamUrl, {
    headers: { accept: "application/json" },
    cf: {
      cacheTtl: clampNumber(params.get("cacheTtl"), 60, 86400, 3600),
      cacheEverything: false
    }
  });
  ctx?.waitUntil?.(logSourceCheck(new URL(upstreamUrl), upstream.status));
  const text = await boundedResponseText(upstream, MAX_OSM_RESPONSE_BYTES);
  if (!upstream.ok) {
    return json({
      error: "Overpass infrastructure request failed",
      upstreamStatus: upstream.status,
      upstreamUrl,
      preview: trim(text, 360)
    }, upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502);
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return json({ error: "Overpass response was not valid JSON", upstreamUrl, preview: trim(text, 360) }, 502);
  }
  const sourceName = `osm-infrastructure-${fixed(lat, 4)}-${fixed(lon, 4)}-${fixed(sizeKm, 1)}km`;
  const infrastructure = overpassToInfrastructureGeoJson(payload, { bbox, lat, lon, sizeKm, limit, sourceName });
  if (!infrastructure.features.length) {
    return json({ error: "Overpass response did not contain usable infrastructure geometry", upstreamUrl, sourceName }, 422);
  }
  return json({
    type: "geolab-osm-infrastructure",
    generatedAt: new Date().toISOString(),
    sourceName,
    aoi: {
      center: { lat, lon },
      sizeKm,
      bboxWgs84: { west: bbox[0], south: bbox[1], east: bbox[2], north: bbox[3] }
    },
    upstream: {
      host: "overpass-api.de",
      endpoint: "api/interpreter",
      queryProfile: "built-transport-water-control",
      url: upstreamUrl
    },
    summary: infrastructure.properties.summary,
    infrastructure
  });
}

function buildAcquisitionPlan(params, origin = "") {
  const lat = clampNumber(params.get("lat"), -90, 90, 37.8651);
  const lon = clampNumber(params.get("lon"), -180, 180, -119.5383);
  const sizeKm = clampNumber(params.get("sizeKm"), 1, 256, DEFAULT_SIZE_KM);
  const startYear = clampNumber(params.get("startYear"), 1980, 2100, new Date().getUTCFullYear() - 5);
  const endYear = clampNumber(params.get("endYear"), 1980, 2100, new Date().getUTCFullYear() - 1);
  const gageSite = String(params.get("gageSite") || "").trim();
  const bbox = squareBbox(lon, lat, sizeKm);
  const bboxText = bbox.map((v) => fixed(v, 6)).join(",");
  const nhdEnvelope = encodeURIComponent(JSON.stringify({
    xmin: bbox[0],
    ymin: bbox[1],
    xmax: bbox[2],
    ymax: bbox[3],
    spatialReference: { wkid: 4326 }
  }));
  const startDate = `${startYear}-01-01`;
  const endDate = `${endYear}-12-31`;
  const normalizedCalibrationUrl = gageSite && origin
    ? usgsDailyValuesProxyUrl(origin, gageSite, startDate, endDate)
    : null;
  const gageDiscoveryUrl = origin ? usgsGagesProxyUrl(origin, lat, lon, sizeKm, startDate, endDate) : null;
  const demDiscoveryUrl = origin ? tnmDemProductsProxyUrl(origin, lat, lon, sizeKm) : null;
  const daymetGridUrl = origin ? daymetGridSampleProxyUrl(origin, lat, lon, sizeKm, startYear, endYear) : null;
  const osmInfrastructureUrl = origin ? osmInfrastructureProxyUrl(origin, lat, lon, sizeKm) : null;
  return {
    generatedAt: new Date().toISOString(),
    aoi: {
      center: { lat, lon },
      sizeKm,
      areaKm2: Math.round(sizeKm * sizeKm),
      bboxWgs84: { west: bbox[0], south: bbox[1], east: bbox[2], north: bbox[3], text: bboxText }
    },
    proxy: {
      allowedHosts: Array.from(ALLOWED_HOSTS),
      usage: "/proxy?url=<encoded authoritative source URL>",
      normalizedCalibrationUsage: "/usgs/daily-values?site=<usgs_site>&start=<YYYY-MM-DD>&end=<YYYY-MM-DD>",
      gageDiscoveryUsage: "/usgs/gages?lat=<lat>&lon=<lon>&sizeKm=<km>&start=<YYYY-MM-DD>&end=<YYYY-MM-DD>",
      demDiscoveryUsage: "/tnm/dem-products?lat=<lat>&lon=<lon>&sizeKm=<km>",
      daymetGridUsage: "/daymet/grid-sample?lat=<lat>&lon=<lon>&sizeKm=<km>&startYear=<YYYY>&endYear=<YYYY>&grid=3",
      osmInfrastructureUsage: "/osm/infrastructure?lat=<lat>&lon=<lon>&sizeKm=<km>&limit=900"
    },
    dataRequirements: buildDataRequirements(),
    sources: [
      {
        id: "usgs_3dep_dem_candidates",
        role: "dem",
        expectedFields: ["title", "downloadUrl", "format", "estimatedNativeCellSizeM", "metadataUrl"],
        normalizedUrl: demDiscoveryUrl,
        normalizedProxyUrl: demDiscoveryUrl,
        url: tnmProductsUrl(bboxText, "Digital Elevation Model (DEM) 1 meter", "GeoTIFF")
      },
      {
        id: "usgs_3dep_dem_1m",
        role: "dem",
        url: tnmProductsUrl(bboxText, "Digital Elevation Model (DEM) 1 meter", "GeoTIFF")
      },
      {
        id: "usgs_3dep_dem_13arc",
        role: "dem",
        url: tnmProductsUrl(bboxText, "National Elevation Dataset (NED) 1/3 arc-second", "GeoTIFF")
      },
      {
        id: "daymet_grid_sample",
        role: "meteorology",
        expectedFields: ["precipitation", "temperature", "metSummary.dailySeries", "boundsKm"],
        normalizedUrl: daymetGridUrl,
        normalizedProxyUrl: daymetGridUrl,
        url: `https://daymet.ornl.gov/single-pixel/api/data?lat=${fixed(lat, 6)}&lon=${fixed(lon, 6)}&vars=prcp,tmax,tmin,vp,srad,swe,dayl&years=${daymetYears(startYear, endYear).join(",")}`
      },
      {
        id: "daymet_single_pixel",
        role: "meteorology",
        url: `https://daymet.ornl.gov/single-pixel/api/data?lat=${fixed(lat, 6)}&lon=${fixed(lon, 6)}&vars=prcp,tmax,tmin,vp,srad,swe,dayl&years=${startYear}:${endYear}`
      },
      {
        id: "usda_gssurgo",
        role: "soil",
        url: "https://www.nrcs.usda.gov/resources/data-and-reports/gridded-soil-survey-geographic-gssurgo-database",
        expectedFields: ["hydrologic_soil_group", "ksat_mm_hr", "awc_mm", "root_depth_m"]
      },
      {
        id: "nrcs_web_soil_survey",
        role: "soil",
        url: "https://websoilsurvey.nrcs.usda.gov/",
        expectedFields: ["soil_group", "ksat_mm_hr", "awc_mm", "root_depth_m"]
      },
      {
        id: "mrlc_nlcd",
        role: "landCover",
        url: "https://www.mrlc.gov/",
        expectedFields: ["landcover", "vegetation_fraction", "canopy_height_m", "impervious_fraction"]
      },
      {
        id: "mrlc_impervious",
        role: "landCover",
        url: "https://www.mrlc.gov/data",
        expectedFields: ["impervious_fraction"]
      },
      {
        id: "prism_climate",
        role: "meteorology",
        url: "https://prism.oregonstate.edu/",
        expectedFields: ["precip_mm_yr", "temp_c"]
      },
      {
        id: "usgs_gage_candidates",
        role: "calibration",
        expectedFields: ["site_no", "station_nm", "dec_lat_va", "dec_long_va", "drain_area_va", "contrib_drain_area_va"],
        normalizedUrl: gageDiscoveryUrl,
        normalizedProxyUrl: gageDiscoveryUrl,
        url: `https://waterservices.usgs.gov/nwis/site/?format=rdb&bBox=${bboxText}&hasDataTypeCd=dv&parameterCd=00060&siteType=ST&siteStatus=all&siteOutput=expanded`
      },
      {
        id: "usgs_water_services_legacy",
        role: "calibration",
        expectedFields: ["date", "00060", "discharge_cfs", "discharge_m3s"],
        normalizedUrl: normalizedCalibrationUrl,
        normalizedProxyUrl: normalizedCalibrationUrl,
        url: gageSite
          ? `https://waterservices.usgs.gov/nwis/dv/?format=json&sites=${encodeURIComponent(gageSite)}&parameterCd=00060&statCd=00003&startDT=${startDate}&endDT=${endDate}`
          : `https://waterservices.usgs.gov/nwis/site/?format=rdb&bBox=${bboxText}&hasDataTypeCd=dv&parameterCd=00060&siteType=ST&siteStatus=all`
      },
      {
        id: "usgs_nhdplus_hr_flowlines",
        role: "hydrology",
        expectedFields: ["COMID", "GNIS_NAME", "stream_order", "length_km"],
        url: `https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/6/query?f=geojson&geometry=${nhdEnvelope}&geometryType=esriGeometryEnvelope&inSR=4326&outSR=4326&outFields=COMID,GNIS_NAME,StreamOrde,LengthKM&returnGeometry=true`
      },
      {
        id: "osm_overpass_infrastructure",
        role: "infrastructure",
        expectedFields: ["infrastructure_type", "radius_km", "impervious_fraction", "runoff_delta", "temperature_delta_c", "storage_mm", "flow_retention", "irrigation_mm", "building_height_m", "floor_count"],
        normalizedUrl: osmInfrastructureUrl,
        normalizedProxyUrl: osmInfrastructureUrl,
        url: overpassInfrastructureUrl(bbox)
      }
    ]
  };
}

function tnmProductsUrl(bboxText, datasets, prodFormats) {
  const url = new URL("https://tnmaccess.nationalmap.gov/api/v1/products");
  url.searchParams.set("bbox", bboxText);
  url.searchParams.set("datasets", datasets);
  url.searchParams.set("prodFormats", prodFormats);
  url.searchParams.set("outputFormat", "JSON");
  return url.toString();
}

function withUrlParam(url, key, value) {
  const next = new URL(url);
  if (!next.searchParams.has(key)) next.searchParams.set(key, value);
  return next.toString();
}

function usgsDailyValuesProxyUrl(origin, site, startDate, endDate) {
  const url = new URL("/usgs/daily-values", origin);
  url.searchParams.set("site", site);
  url.searchParams.set("start", startDate);
  url.searchParams.set("end", endDate);
  return url.toString();
}

function usgsGagesProxyUrl(origin, lat, lon, sizeKm, startDate, endDate) {
  const url = new URL("/usgs/gages", origin);
  url.searchParams.set("lat", fixed(lat, 6));
  url.searchParams.set("lon", fixed(lon, 6));
  url.searchParams.set("sizeKm", fixed(sizeKm, 3));
  url.searchParams.set("start", startDate);
  url.searchParams.set("end", endDate);
  return url.toString();
}

function tnmDemProductsProxyUrl(origin, lat, lon, sizeKm) {
  const url = new URL("/tnm/dem-products", origin);
  url.searchParams.set("lat", fixed(lat, 6));
  url.searchParams.set("lon", fixed(lon, 6));
  url.searchParams.set("sizeKm", fixed(sizeKm, 3));
  return url.toString();
}

function daymetGridSampleProxyUrl(origin, lat, lon, sizeKm, startYear, endYear) {
  const url = new URL("/daymet/grid-sample", origin);
  url.searchParams.set("lat", fixed(lat, 6));
  url.searchParams.set("lon", fixed(lon, 6));
  url.searchParams.set("sizeKm", fixed(sizeKm, 3));
  url.searchParams.set("startYear", String(Math.round(startYear)));
  url.searchParams.set("endYear", String(Math.round(endYear)));
  url.searchParams.set("grid", "3");
  return url.toString();
}

function osmInfrastructureProxyUrl(origin, lat, lon, sizeKm) {
  const url = new URL("/osm/infrastructure", origin);
  url.searchParams.set("lat", fixed(lat, 6));
  url.searchParams.set("lon", fixed(lon, 6));
  url.searchParams.set("sizeKm", fixed(sizeKm, 3));
  url.searchParams.set("limit", "900");
  return url.toString();
}

function usgsDailyValuesUrl(site, startDate, endDate) {
  const url = new URL("https://waterservices.usgs.gov/nwis/dv/");
  url.searchParams.set("format", "json");
  url.searchParams.set("sites", site);
  url.searchParams.set("parameterCd", "00060");
  url.searchParams.set("statCd", "00003");
  url.searchParams.set("startDT", startDate);
  url.searchParams.set("endDT", endDate);
  return url.toString();
}

function daymetSinglePixelUrl(lat, lon, years) {
  const url = new URL("https://daymet.ornl.gov/single-pixel/api/data");
  url.searchParams.set("lat", fixed(lat, 6));
  url.searchParams.set("lon", fixed(lon, 6));
  url.searchParams.set("vars", "prcp,tmax,tmin,vp,srad,swe,dayl");
  url.searchParams.set("years", years.join(","));
  return url.toString();
}

function overpassInfrastructureUrl(bbox) {
  const url = new URL("https://overpass-api.de/api/interpreter");
  url.searchParams.set("data", overpassInfrastructureQuery(bbox));
  return url.toString();
}

function overpassInfrastructureQuery(bbox) {
  const [west, south, east, north] = bbox.map((value) => fixed(value, 6));
  const area = `(${south},${west},${north},${east})`;
  const outputArea = `(${south},${west},${north},${east})`;
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
    `out geom${outputArea};`
  ].join("");
}

function usgsSiteServiceUrl(bboxText) {
  const url = new URL("https://waterservices.usgs.gov/nwis/site/");
  url.searchParams.set("format", "rdb");
  url.searchParams.set("bBox", bboxText);
  url.searchParams.set("hasDataTypeCd", "dv");
  url.searchParams.set("parameterCd", "00060");
  url.searchParams.set("siteType", "ST");
  url.searchParams.set("siteStatus", "all");
  url.searchParams.set("siteOutput", "expanded");
  return url.toString();
}

function parseUsgsSiteRdb(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.startsWith("#"));
  if (lines.length < 2) return [];
  const headers = lines[0].split("\t").map((header) => header.trim());
  const rows = [];
  for (const line of lines.slice(1)) {
    const cells = line.split("\t");
    if (looksLikeRdbTypeRow(cells, headers)) continue;
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    const site = gageCandidateFromRdbRow(row);
    if (site) rows.push(site);
  }
  return rows;
}

function looksLikeRdbTypeRow(cells, headers) {
  if (cells.length !== headers.length) return false;
  return cells.every((cell) => /^[0-9]+[a-z]?$|^[a-z]+$/i.test(String(cell || "").trim()));
}

function gageCandidateFromRdbRow(row) {
  const siteCode = String(row.site_no || row.siteCode || "").trim();
  const latitude = numberOr(row.dec_lat_va ?? row.latitude, Number.NaN);
  const longitude = numberOr(row.dec_long_va ?? row.longitude, Number.NaN);
  if (!siteCode || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const drainageAreaSqmi = numberOr(row.drain_area_va, Number.NaN);
  const contributingDrainageAreaSqmi = numberOr(row.contrib_drain_area_va, Number.NaN);
  return {
    siteCode,
    agency: row.agency_cd || "USGS",
    siteName: row.station_nm || null,
    siteType: row.site_tp_cd || null,
    latitude,
    longitude,
    huc: row.huc_cd || null,
    status: row.site_status || row.siteStatus || null,
    drainageAreaSqmi: Number.isFinite(drainageAreaSqmi) ? drainageAreaSqmi : null,
    drainageAreaKm2: Number.isFinite(drainageAreaSqmi) ? drainageAreaSqmi * 2.589988110336 : null,
    contributingDrainageAreaSqmi: Number.isFinite(contributingDrainageAreaSqmi) ? contributingDrainageAreaSqmi : null,
    contributingDrainageAreaKm2: Number.isFinite(contributingDrainageAreaSqmi) ? contributingDrainageAreaSqmi * 2.589988110336 : null
  };
}

function daymetYears(startYear, endYear) {
  const start = Math.round(startYear);
  const end = Math.round(endYear);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new Error("Daymet endYear must be on or after startYear");
  const count = end - start + 1;
  if (count > MAX_DAYMET_YEARS) throw new Error(`Daymet grid-sample window is limited to ${MAX_DAYMET_YEARS} years per request`);
  return Array.from({ length: count }, (_, index) => start + index);
}

function daymetSamplePoints(bbox, sizeKm, grid) {
  const points = [];
  for (let y = 0; y < grid; y += 1) {
    for (let x = 0; x < grid; x += 1) {
      const fx = grid === 1 ? 0.5 : (x + 0.5) / grid;
      const fy = grid === 1 ? 0.5 : (y + 0.5) / grid;
      points.push({
        x,
        y,
        xKm: round(fx * sizeKm, 3),
        yKm: round(fy * sizeKm, 3),
        lon: bbox[0] + (bbox[2] - bbox[0]) * fx,
        lat: bbox[1] + (bbox[3] - bbox[1]) * fy
      });
    }
  }
  return points;
}

function summarizeDaymetCsv(text) {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const headerIndex = lines.findIndex((line) => /^year\s*,\s*yday\s*,/i.test(line));
  if (headerIndex < 0) throw new Error("Daymet response did not contain a year,yday CSV header");
  const headers = splitCsvLine(lines[headerIndex]).map((header) => normalizeDaymetHeader(header));
  const idx = Object.fromEntries(headers.map((header, index) => [header, index]));
  const records = [];
  const annual = new Map();
  const temps = [];
  const prcps = [];
  const swe = [];
  const vp = [];
  const srad = [];
  for (const line of lines.slice(headerIndex + 1)) {
    const cells = splitCsvLine(line);
    const year = numberOr(cells[idx.year], Number.NaN);
    const yday = numberOr(cells[idx.yday], Number.NaN);
    const prcp = numberOr(cells[idx.prcp], Number.NaN);
    const tmax = numberOr(cells[idx.tmax], Number.NaN);
    const tmin = numberOr(cells[idx.tmin], Number.NaN);
    const temp = Number.isFinite(tmax) && Number.isFinite(tmin) ? (tmax + tmin) / 2 : Number.NaN;
    if (!Number.isFinite(year) || !Number.isFinite(yday)) continue;
    const date = dateFromYearDay(year, yday);
    const record = {
      date,
      year,
      yday,
      precipitationMm: Number.isFinite(prcp) ? prcp : null,
      temperatureC: Number.isFinite(temp) ? temp : null,
      tmaxC: Number.isFinite(tmax) ? tmax : null,
      tminC: Number.isFinite(tmin) ? tmin : null,
      dayLengthS: finiteOrNull(cells[idx.dayl]),
      shortwaveRadiationWm2: finiteOrNull(cells[idx.srad]),
      snowWaterEquivalentKgM2: finiteOrNull(cells[idx.swe]),
      vaporPressurePa: finiteOrNull(cells[idx.vp])
    };
    records.push(record);
    if (Number.isFinite(prcp)) {
      annual.set(year, (annual.get(year) || 0) + prcp);
      prcps.push(prcp);
    }
    if (Number.isFinite(temp)) temps.push(temp);
    const sweValue = Number(record.snowWaterEquivalentKgM2);
    if (Number.isFinite(sweValue)) swe.push(sweValue);
    const vpValue = Number(record.vaporPressurePa);
    if (Number.isFinite(vpValue)) vp.push(vpValue);
    const sradValue = Number(record.shortwaveRadiationWm2);
    if (Number.isFinite(sradValue)) srad.push(sradValue);
  }
  const annualTotals = Array.from(annual.values());
  return {
    records,
    recordCount: records.length,
    years: Array.from(annual.keys()).sort((a, b) => a - b),
    annualPrecipitationMm: meanOrNaN(annualTotals),
    meanTemperatureC: meanOrNaN(temps),
    meanDailyPrecipitationMm: meanOrNaN(prcps),
    meanSnowWaterEquivalentKgM2: meanOrNaN(swe),
    meanVaporPressurePa: meanOrNaN(vp),
    meanShortwaveRadiationWm2: meanOrNaN(srad)
  };
}

function normalizeDaymetGridSamples(samples, options) {
  const totalCells = options.grid * options.grid;
  const precipitation = new Array(totalCells).fill(null);
  const temperature = new Array(totalCells).fill(null);
  const sampleSummaries = [];
  for (const sample of samples) {
    const index = sample.y * options.grid + sample.x;
    precipitation[index] = round(sample.annualPrecipitationMm, 3);
    temperature[index] = round(sample.meanTemperatureC, 3);
    sampleSummaries.push({
      x: sample.x,
      y: sample.y,
      xKm: sample.xKm,
      yKm: sample.yKm,
      lat: round(sample.lat, 6),
      lon: round(sample.lon, 6),
      recordCount: sample.recordCount,
      annualPrecipitationMm: round(sample.annualPrecipitationMm, 3),
      meanTemperatureC: round(sample.meanTemperatureC, 3),
      meanSnowWaterEquivalentKgM2: finiteRound(sample.meanSnowWaterEquivalentKgM2, 3),
      meanVaporPressurePa: finiteRound(sample.meanVaporPressurePa, 3),
      meanShortwaveRadiationWm2: finiteRound(sample.meanShortwaveRadiationWm2, 3)
    });
  }
  const dailySeries = compactDaymetDailySeries(spatialMeanDaymetRecords(samples), 5000);
  return {
    type: "geolab-grid",
    width: options.grid,
    height: options.grid,
    boundsKm: [0, 0, options.sizeKm, options.sizeKm],
    crs: "local-grid",
    nativeCellSizeM: {
      x: round((options.sizeKm * 1000) / Math.max(1, options.grid), 3),
      y: round((options.sizeKm * 1000) / Math.max(1, options.grid), 3),
      sourceGrid: "Daymet nearest 1 km cells sampled across AOI"
    },
    verticalUnit: "metre",
    valueUnit: "precipitation mm/year; temperature C",
    precipitation,
    temperature,
    metSummary: {
      sourceName: options.sourceName,
      type: "daymet-grid-sample",
      width: options.grid,
      height: options.grid,
      gridCellCount: totalCells,
      usableSampleCount: samples.length,
      years: options.years,
      recordCount: samples.reduce((sum, sample) => sum + (sample.recordCount || 0), 0),
      annualPrecipitationMm: finiteRound(meanFinite(precipitation), 3),
      meanTemperatureC: finiteRound(meanFinite(temperature), 3),
      dailySeries,
      sampleSummaries,
      notes: [
        "Daymet daily variables are sampled at evenly spaced AOI points from the single-pixel API and aggregated to a compact GeoLab grid.",
        "Use full Daymet/PRISM/ERA5 gridded rasters or NetCDF processing before treating spatial meteorology as final research forcing."
      ]
    }
  };
}

function spatialMeanDaymetRecords(samples) {
  const byDate = new Map();
  for (const sample of samples) {
    for (const record of sample.records || []) {
      if (!record.date) continue;
      const bucket = byDate.get(record.date) || {
        date: record.date,
        year: record.year,
        precipitation: [],
        temperature: [],
        swe: [],
        vp: [],
        srad: []
      };
      if (Number.isFinite(record.precipitationMm)) bucket.precipitation.push(record.precipitationMm);
      if (Number.isFinite(record.temperatureC)) bucket.temperature.push(record.temperatureC);
      if (Number.isFinite(record.snowWaterEquivalentKgM2)) bucket.swe.push(record.snowWaterEquivalentKgM2);
      if (Number.isFinite(record.vaporPressurePa)) bucket.vp.push(record.vaporPressurePa);
      if (Number.isFinite(record.shortwaveRadiationWm2)) bucket.srad.push(record.shortwaveRadiationWm2);
      byDate.set(record.date, bucket);
    }
  }
  return Array.from(byDate.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((bucket) => ({
      date: bucket.date,
      year: bucket.year,
      precipitationMm: finiteRound(meanOrNaN(bucket.precipitation), 3),
      temperatureC: finiteRound(meanOrNaN(bucket.temperature), 3),
      snowWaterEquivalentKgM2: finiteRound(meanOrNaN(bucket.swe), 3),
      vaporPressurePa: finiteRound(meanOrNaN(bucket.vp), 3),
      shortwaveRadiationWm2: finiteRound(meanOrNaN(bucket.srad), 3)
    }));
}

function compactDaymetDailySeries(series, limit) {
  if (series.length <= limit) return series;
  const step = (series.length - 1) / Math.max(1, limit - 1);
  const sampled = [];
  for (let i = 0; i < limit; i += 1) sampled.push(series[Math.round(i * step)]);
  return sampled;
}

function daymetSampleStatus(sample) {
  return {
    x: sample.x,
    y: sample.y,
    lat: round(sample.lat, 6),
    lon: round(sample.lon, 6),
    ok: Boolean(sample.ok),
    status: sample.status,
    recordCount: sample.recordCount || 0,
    upstreamUrl: sample.upstreamUrl,
    preview: sample.preview
  };
}

function normalizeDaymetHeader(header) {
  const text = String(header || "").trim().toLowerCase();
  if (text.startsWith("dayl")) return "dayl";
  if (text.startsWith("prcp")) return "prcp";
  if (text.startsWith("srad")) return "srad";
  if (text.startsWith("swe")) return "swe";
  if (text.startsWith("tmax")) return "tmax";
  if (text.startsWith("tmin")) return "tmin";
  if (text.startsWith("vp")) return "vp";
  return text.replace(/\s*\(.+\)\s*$/, "");
}

function splitCsvLine(line) {
  return String(line || "").split(",").map((part) => part.trim());
}

function dateFromYearDay(year, yday) {
  const date = new Date(Date.UTC(year, 0, yday));
  return date.toISOString().slice(0, 10);
}

function rankUsgsGageCandidates(gages, options) {
  const aoiAreaKm2 = options.sizeKm * options.sizeKm;
  return gages
    .map((gage) => {
      const distanceKm = haversineKm(options.lat, options.lon, gage.latitude, gage.longitude);
      const referenceArea = Number.isFinite(gage.contributingDrainageAreaKm2) && gage.contributingDrainageAreaKm2 > 0
        ? gage.contributingDrainageAreaKm2
        : gage.drainageAreaKm2;
      const areaRatioToAoi = Number.isFinite(referenceArea) && referenceArea > 0 ? referenceArea / aoiAreaKm2 : null;
      const distanceScore = clamp(1 - distanceKm / Math.max(1, options.sizeKm * 0.8), 0, 1);
      const areaScore = areaRatioToAoi
        ? clamp(1 - Math.abs(Math.log10(Math.max(0.001, areaRatioToAoi))) / 1.3, 0, 1)
        : 0.35;
      const metadataScore = (Number.isFinite(referenceArea) ? 0.55 : 0) + (gage.siteName ? 0.25 : 0) + (gage.huc ? 0.2 : 0);
      const score = round(clamp(distanceScore * 0.45 + areaScore * 0.3 + metadataScore * 0.25, 0, 1), 3);
      return {
        ...gage,
        distanceKm: round(distanceKm, 3),
        areaRatioToAoi: areaRatioToAoi === null ? null : round(areaRatioToAoi, 4),
        score,
        rankNotes: gageRankNotes(distanceKm, areaRatioToAoi, referenceArea),
        dailyValuesUrl: usgsDailyValuesUrl(gage.siteCode, options.startDate, options.endDate),
        normalizedCalibrationUrl: usgsDailyValuesProxyUrl(options.origin, gage.siteCode, options.startDate, options.endDate)
      };
    })
    .sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm);
}

function rankTnmDemProducts(items, options) {
  const seen = new Set();
  return items
    .map((item) => {
      const title = String(item.title || item.name || item.sourceName || "Untitled TNM DEM product");
      const dataset = String(item._datasetLabel || item.datasets || item.dataset || item.sourceName || "USGS 3DEP DEM");
      const downloadUrl = tnmProductDownloadUrl(item);
      const metadataUrl = tnmProductMetadataUrl(item);
      const format = String(item.format || item.productFormat || item.mimeType || "");
      const estimatedNativeCellSizeM = inferDemCellSizeM(item);
      const productBbox = normalizeProductBbox(item);
      const date = parseDateMaybe(item.publicationDate || item.lastUpdated || item.dateCreated || item.modified);
      const resolutionScore = estimatedNativeCellSizeM
        ? clamp(1 - Math.log10(Math.max(1, estimatedNativeCellSizeM)) / 1.6, 0.25, 1)
        : 0.4;
      const formatScore = /geotiff|tiff|tif/i.test(format || title || downloadUrl || "") ? 1 : 0.35;
      const downloadScore = downloadUrl ? 1 : 0.15;
      const recencyScore = date ? clamp((date.getUTCFullYear() - 2000) / 26, 0, 1) : 0.45;
      const overlapScore = productBbox ? bboxOverlapScore(productBbox, options.bbox) : 0.55;
      const score = round(clamp(
        resolutionScore * 0.42 + formatScore * 0.2 + downloadScore * 0.2 + recencyScore * 0.1 + overlapScore * 0.08,
        0,
        1
      ), 3);
      return {
        dataset,
        datasetKey: item._datasetKey || null,
        title,
        format: format || null,
        downloadUrl,
        metadataUrl,
        sourceUrl: item.url || item.sourceUrl || null,
        sourceId: item.sourceId || item.id || null,
        estimatedNativeCellSizeM,
        publicationDate: date ? date.toISOString().slice(0, 10) : null,
        lastUpdated: item.lastUpdated || item.modified || null,
        extent: item.extent || item.boundingBox || productBbox || null,
        score,
        rankNotes: demRankNotes({ estimatedNativeCellSizeM, format, downloadUrl, productBbox, overlapScore })
      };
    })
    .filter((candidate) => {
      const key = `${candidate.downloadUrl || ""}|${candidate.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (
      b.score - a.score
      || (a.estimatedNativeCellSizeM || 9999) - (b.estimatedNativeCellSizeM || 9999)
      || String(b.publicationDate || "").localeCompare(String(a.publicationDate || ""))
    ));
}

function tnmProductDownloadUrl(item) {
  return item.downloadURL
    || item.downloadUrl
    || item.urls?.download
    || item.urls?.Download
    || item.urls?.geotiff
    || item.urls?.GeoTIFF
    || item.url
    || null;
}

function tnmProductMetadataUrl(item) {
  return item.metaUrl
    || item.metadataURL
    || item.metadataUrl
    || item.urls?.metadata
    || item.urls?.Metadata
    || null;
}

function inferDemCellSizeM(item) {
  const text = `${item._datasetKey || ""} ${item._datasetLabel || ""} ${item.datasets || ""} ${item.title || ""}`.toLowerCase();
  if (/\b1\s*meter\b|\b1m\b|1-meter/.test(text)) return 1;
  if (/1\/3\s*arc|13arc|third\s*arc/.test(text)) return 10;
  if (/1\s*arc-second|1\s*arc second/.test(text)) return 30;
  if (/1\/9\s*arc|ninth\s*arc/.test(text)) return 3;
  return null;
}

function normalizeProductBbox(item) {
  const bbox = item.boundingBox || item.bbox || item.extent;
  if (Array.isArray(bbox) && bbox.length >= 4) {
    const values = bbox.slice(0, 4).map(Number);
    return values.every(Number.isFinite) ? values : null;
  }
  if (bbox && typeof bbox === "object") {
    const west = Number(bbox.west ?? bbox.xmin ?? bbox.minX ?? bbox.left);
    const south = Number(bbox.south ?? bbox.ymin ?? bbox.minY ?? bbox.bottom);
    const east = Number(bbox.east ?? bbox.xmax ?? bbox.maxX ?? bbox.right);
    const north = Number(bbox.north ?? bbox.ymax ?? bbox.maxY ?? bbox.top);
    if ([west, south, east, north].every(Number.isFinite)) return [west, south, east, north];
  }
  if (typeof bbox === "string") {
    const values = bbox.split(/[,\s]+/).map(Number).filter(Number.isFinite);
    if (values.length >= 4) return values.slice(0, 4);
  }
  return null;
}

function bboxOverlapScore(candidate, aoi) {
  const west = Math.max(candidate[0], aoi[0]);
  const south = Math.max(candidate[1], aoi[1]);
  const east = Math.min(candidate[2], aoi[2]);
  const north = Math.min(candidate[3], aoi[3]);
  const overlapArea = Math.max(0, east - west) * Math.max(0, north - south);
  const aoiArea = Math.max(0.000001, (aoi[2] - aoi[0]) * (aoi[3] - aoi[1]));
  return clamp(overlapArea / aoiArea, 0, 1);
}

function demRankNotes(candidate) {
  const notes = [];
  if (candidate.estimatedNativeCellSizeM) notes.push(`estimated ${candidate.estimatedNativeCellSizeM} m native cell`);
  if (!/geotiff|tiff|tif/i.test(candidate.format || candidate.downloadUrl || "")) notes.push("verify product format before import");
  if (!candidate.downloadUrl) notes.push("missing direct download URL");
  if (!candidate.productBbox) notes.push("inspect metadata extent before mosaicking");
  else if (candidate.overlapScore < 0.95) notes.push("partial AOI overlap");
  return notes;
}

function gageRankNotes(distanceKm, areaRatioToAoi, referenceArea) {
  const notes = [];
  if (distanceKm > 40) notes.push("Far from AOI center; verify it lies on the modeled drainage network.");
  if (!Number.isFinite(referenceArea)) notes.push("Drainage area missing; area comparability cannot be screened.");
  else if (areaRatioToAoi !== null && (areaRatioToAoi < 0.02 || areaRatioToAoi > 5)) notes.push("Drainage area differs strongly from the full AOI; compare against modeled outlet catchment before calibration.");
  else notes.push("Drainage area is present; compare against the modeled outlet or nearest-channel catchment.");
  return notes;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const r = 6371.0088;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeUsgsDailyValues(payload, metadata) {
  const timeSeries = payload?.value?.timeSeries || payload?.timeSeries || [];
  const values = [];
  const dated = [];
  const sites = new Map();
  let parameterCode = "00060";
  let unit = null;
  for (const series of timeSeries) {
    const variable = series.variable || {};
    const currentParameter = firstVariableCode(variable.variableCode) || variable.parameterCode || parameterCode;
    const unitCode = variable.unit?.unitCode || variable.unitCode || variable.unit?.unitAbbreviation || unit;
    parameterCode = currentParameter || parameterCode;
    unit = unitCode || unit;
    const site = siteMetadataFromSourceInfo(series.sourceInfo, metadata.site);
    if (site.siteCode || site.siteName) sites.set(site.siteCode || site.siteName, site);
    const blocks = series.values || [];
    for (const block of blocks) {
      const points = block.value || block.values || [];
      for (const point of points) {
        const converted = dischargeToM3s(point.value ?? point.flow ?? point.discharge, unitCode, currentParameter);
        if (!Number.isFinite(converted)) continue;
        const date = point.dateTime || point.datetime || point.date || point.time || null;
        values.push(converted);
        dated.push({ date, year: yearFromDate(date), value: converted });
      }
    }
  }
  const observedSeries = {
    ...summarizeObservedDischarge(values, dated, metadata.sourceName),
    sourceFormat: "usgs-water-services-json",
    parameterCode,
    unit: "m3/s",
    sourceUnit: unit || "ft3/s",
    sites: Array.from(sites.values())
  };
  const firstSite = observedSeries.sites[0] || {};
  return {
    sourceName: metadata.sourceName,
    sourceUrl: metadata.upstreamUrl,
    precipBias: 0,
    tempBias: 0,
    runoffMultiplier: 1,
    dischargeScale: 1,
    observedDischargeM3s: observedSeries.meanDischargeM3s,
    observedSeries,
    sites: observedSeries.sites,
    drainageAreaKm2: firstSite.drainageAreaKm2 ?? null,
    contributingDrainageAreaKm2: firstSite.contributingDrainageAreaKm2 ?? null,
    siteCode: firstSite.siteCode || metadata.site,
    siteName: firstSite.siteName || null,
    siteLatitude: firstSite.latitude ?? null,
    siteLongitude: firstSite.longitude ?? null
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
  const sorted = values.slice().sort((a, b) => a - b);
  const dates = dated.map((item) => item.date).filter(Boolean).sort();
  return {
    sourceName,
    type: "observed-discharge-time-series",
    unit: "m3/s",
    recordCount: values.length,
    startDate: dates[0] || null,
    endDate: dates.at(-1) || null,
    meanDischargeM3s: meanOrNaN(values),
    medianDischargeM3s: quantile(sorted, 0.5),
    p10DischargeM3s: quantile(sorted, 0.1),
    p90DischargeM3s: quantile(sorted, 0.9),
    annualMeans: Array.from(annual.entries()).map(([year, vals]) => ({ year, meanDischargeM3s: mean(vals) })),
    samples: compactObservedSamples(dated, 5000)
  };
}

function compactObservedSamples(dated, limit) {
  const clean = dated
    .filter((item) => Number.isFinite(item.value))
    .map((item) => ({
      date: item.date || null,
      year: Number.isFinite(item.year) ? item.year : yearFromDate(item.date),
      dischargeM3s: Number(item.value)
    }));
  if (clean.length <= limit) return clean;
  const sampled = [];
  const step = (clean.length - 1) / Math.max(1, limit - 1);
  for (let i = 0; i < limit; i += 1) sampled.push(clean[Math.round(i * step)]);
  return sampled;
}

function siteMetadataFromSourceInfo(sourceInfo = {}, fallbackSiteCode = "") {
  const geog = sourceInfo?.geoLocation?.geogLocation || sourceInfo?.geoLocation || {};
  const props = Array.isArray(sourceInfo?.siteProperty) ? sourceInfo.siteProperty : [];
  const drainageAreaSqmi = numberOr(propertyValue(props, ["drain_area_va", "drainage area", "drainage_area"]), Number.NaN);
  const contributingDrainageAreaSqmi = numberOr(propertyValue(props, ["contrib_drain_area_va", "contributing drainage", "contrib drainage"]), Number.NaN);
  return {
    siteCode: firstSiteCode(sourceInfo?.siteCode) || fallbackSiteCode || null,
    siteName: sourceInfo?.siteName || sourceInfo?.name || null,
    latitude: numberOr(geog.latitude ?? geog.lat, null),
    longitude: numberOr(geog.longitude ?? geog.lon ?? geog.lng, null),
    drainageAreaSqmi: Number.isFinite(drainageAreaSqmi) ? drainageAreaSqmi : null,
    drainageAreaKm2: Number.isFinite(drainageAreaSqmi) ? drainageAreaSqmi * 2.589988110336 : null,
    contributingDrainageAreaSqmi: Number.isFinite(contributingDrainageAreaSqmi) ? contributingDrainageAreaSqmi : null,
    contributingDrainageAreaKm2: Number.isFinite(contributingDrainageAreaSqmi) ? contributingDrainageAreaSqmi * 2.589988110336 : null
  };
}

function propertyValue(props, names) {
  for (const prop of props) {
    const name = String(prop.name || prop.propertyName || "").toLowerCase();
    if (names.some((candidate) => name === candidate || name.includes(candidate))) return prop.value ?? prop.propertyValue;
  }
  return null;
}

function firstVariableCode(variableCode) {
  const first = Array.isArray(variableCode) ? variableCode[0] : variableCode;
  return first?.value ?? first?.code ?? (typeof first === "string" ? first : null);
}

function firstSiteCode(siteCode) {
  const first = Array.isArray(siteCode) ? siteCode[0] : siteCode;
  return first?.value ?? first?.siteCode ?? (typeof first === "string" ? first : null);
}

function dischargeToM3s(value, unitCode, parameterCode) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= -99990) return Number.NaN;
  return usesCfs(unitCode, parameterCode) ? n * CFS_TO_M3S : n;
}

function usesCfs(unitCode, parameterCode) {
  const unit = String(unitCode || "").toLowerCase();
  if (unit.includes("m3") || unit.includes("m^3") || unit.includes("cms")) return false;
  if (unit.includes("ft3") || unit.includes("ft^3") || unit.includes("cfs") || unit.includes("cubic feet")) return true;
  return String(parameterCode || "").includes("00060");
}

function overpassToInfrastructureGeoJson(payload, options) {
  const elements = Array.isArray(payload?.elements) ? payload.elements : [];
  const features = [];
  let skippedElementCount = 0;
  let relationMemberFeatureCount = 0;
  const limit = Math.max(1, Math.round(options.limit || MAX_OSM_FEATURES));
  for (const element of elements) {
    if (features.length >= limit) break;
    const next = osmElementToInfrastructureFeatures(element);
    if (!next.length) {
      skippedElementCount += 1;
      continue;
    }
    for (const feature of next) {
      if (features.length >= limit) break;
      if (element.type === "relation" && feature.properties?.osm_member_ref) relationMemberFeatureCount += 1;
      features.push(feature);
    }
  }
  const classCounts = {};
  const geometryCounts = {};
  for (const feature of features) {
    const type = feature.properties.infrastructure_type || "custom";
    classCounts[type] = (classCounts[type] || 0) + 1;
    geometryCounts[feature.geometry.type] = (geometryCounts[feature.geometry.type] || 0) + 1;
  }
  const summary = {
    sourceElementCount: elements.length,
    featureCount: features.length,
    skippedElementCount,
    relationMemberFeatureCount,
    truncated: features.length >= limit && elements.length > features.length,
    limit,
    classCounts,
    geometryCounts
  };
  return {
    type: "FeatureCollection",
    name: options.sourceName,
    crs: { type: "name", properties: { name: "EPSG:4326" } },
    bbox: options.bbox,
    properties: {
      crs: "EPSG:4326",
      source: "openstreetmap-overpass",
      sourceName: options.sourceName,
      queryProfile: "built-transport-water-control",
      aoi: {
        center: { lat: options.lat, lon: options.lon },
        sizeKm: options.sizeKm
      },
      summary
    },
    features
  };
}

function osmElementToInfrastructureFeatures(element) {
  const tags = element?.tags || {};
  const infrastructureType = classifyOsmInfrastructure(tags);
  if (!infrastructureType) return [];
  if (element.type === "node") {
    const lat = Number(element.lat);
    const lon = Number(element.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    return [osmInfrastructureFeature(element, {
      type: "Point",
      coordinates: [lon, lat]
    }, infrastructureType)];
  }
  if (element.type === "way") {
    const geometry = osmWayGeometry(element, tags);
    return geometry ? [osmInfrastructureFeature(element, geometry, infrastructureType)] : [];
  }
  if (element.type === "relation") return osmRelationMemberFeatures(element, infrastructureType);
  return [];
}

function osmWayGeometry(element, tags) {
  const coords = osmGeometryCoordinates(element.geometry);
  if (coords.length < 2) return null;
  if (coords.length >= 4 && isClosedRing(coords) && isOsmPolygon(tags)) {
    return { type: "Polygon", coordinates: [ensureClosedRing(coords)] };
  }
  return { type: "LineString", coordinates: coords };
}

function osmRelationMemberFeatures(element, infrastructureType) {
  const tags = element?.tags || {};
  const out = [];
  const members = Array.isArray(element?.members) ? element.members : [];
  for (const member of members) {
    const coords = osmGeometryCoordinates(member?.geometry);
    if (coords.length < 2) continue;
    const geometry = coords.length >= 4 && isClosedRing(coords) && isOsmPolygon(tags)
      ? { type: "Polygon", coordinates: [ensureClosedRing(coords)] }
      : { type: "LineString", coordinates: coords };
    const feature = osmInfrastructureFeature(element, geometry, infrastructureType, {
      osm_member_type: member.type || null,
      osm_member_ref: member.ref || null,
      osm_member_role: member.role || null
    });
    out.push(feature);
  }
  return out;
}

function osmGeometryCoordinates(geometry) {
  if (!Array.isArray(geometry)) return [];
  return geometry
    .map((point) => [Number(point?.lon), Number(point?.lat)])
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
}

function osmInfrastructureFeature(element, geometry, infrastructureType, extraProperties = {}) {
  const tags = element?.tags || {};
  const physical = osmInfrastructureDefaults(infrastructureType, geometry.type, tags);
  const heightM = parseOsmMeters(tags.height ?? tags["building:height"] ?? tags.est_height);
  const levels = parseOsmNumber(tags["building:levels"] ?? tags.levels ?? tags["building:part:levels"]);
  const inferredHeightM = Number.isFinite(heightM) ? heightM : Number.isFinite(levels) ? levels * 3.2 : Number.NaN;
  if (Number.isFinite(inferredHeightM) && (hasBuildingTags(tags) || ["landmark", "powerplant", "bridge"].includes(infrastructureType))) {
    physical.building_height_m = round(inferredHeightM, 2);
  }
  if (Number.isFinite(levels) && hasBuildingTags(tags)) physical.floor_count = round(levels, 1);
  if (infrastructureType === "landmark" && Number.isFinite(inferredHeightM)) {
    physical.landmark_height_m = Math.max(physical.landmark_height_m || 0, round(inferredHeightM, 2));
  }
  return {
    type: "Feature",
    geometry,
    properties: {
      source: "openstreetmap-overpass",
      osm_type: element.type || null,
      osm_id: element.id ?? null,
      name: tags.name || tags["name:en"] || null,
      infrastructure_type: infrastructureType,
      ...physical,
      osm_tags: tags,
      ...extraProperties
    }
  };
}

function classifyOsmInfrastructure(tags) {
  const place = tagText(tags.place);
  if (place) return /city|town/.test(place) ? "urban" : /village|hamlet/.test(place) ? "village" : "custom";

  const waterway = tagText(tags.waterway);
  if (/dam|weir/.test(waterway)) return "dam";
  if (/canal|ditch|drain/.test(waterway)) return "canal";

  const water = tagText(tags.water || tags.landuse);
  if (/reservoir|basin|pond/.test(water)) return "reservoir";

  const aeroway = tagText(tags.aeroway);
  if (aeroway) return "airport";

  const railway = tagText(tags.railway);
  if (railway) return "rail";

  const highway = tagText(tags.highway);
  if (highway) return tagText(tags.bridge) && tagText(tags.bridge) !== "no" ? "bridge" : "transport";

  const building = tagText(tags.building);
  if (building) return classifyOsmBuilding(tags, building);

  const amenity = tagText(tags.amenity);
  if (/hospital|clinic/.test(amenity)) return "hospital";
  if (/school|university|college|kindergarten/.test(amenity)) return "school";
  if (/stadium/.test(amenity)) return "stadium";
  if (/townhall|courthouse|library|public_building|community_centre/.test(amenity)) return "civic";

  const leisure = tagText(tags.leisure);
  if (/park|garden/.test(leisure)) return "park";
  if (/stadium/.test(leisure)) return "stadium";

  const manMade = tagText(tags.man_made);
  if (/wastewater_plant|sewage/.test(manMade)) return "wastewater";
  if (/water_works/.test(manMade)) return "civic";
  if (/pier/.test(manMade)) return "port";
  if (/tower/.test(manMade)) return "landmark";
  if (/embankment/.test(manMade)) return "levee";

  const power = tagText(tags.power);
  if (/plant|substation|generator/.test(power)) {
    const generatorSource = tagText(tags["generator:source"]);
    if (/solar/.test(generatorSource)) return "solar_farm";
    if (/wind/.test(generatorSource)) return "wind_farm";
    return "powerplant";
  }

  const landuse = tagText(tags.landuse);
  if (/industrial/.test(landuse)) return "industrial";
  if (/quarry/.test(landuse)) return "quarry";
  if (/commercial|retail/.test(landuse)) return "commercial";
  if (/residential/.test(landuse)) return "residential";
  if (/construction/.test(landuse)) return "custom";

  const tourism = tagText(tags.tourism);
  if (/attraction|viewpoint/.test(tourism)) return "landmark";
  return null;
}

function classifyOsmBuilding(tags, building) {
  const levels = parseOsmNumber(tags["building:levels"] ?? tags.levels ?? tags["building:part:levels"]);
  const heightM = parseOsmMeters(tags.height ?? tags["building:height"] ?? tags.est_height);
  if ((Number.isFinite(levels) && levels >= 18) || (Number.isFinite(heightM) && heightM >= 70)) return "highrise";
  if (/apartments|condominium|dormitory|residential_block/.test(building)) return "apartment";
  if (/house|detached|semidetached_house|terrace|bungalow|cabin|villa/.test(building)) return "villa";
  if (/residential|yes/.test(building)) return "residential";
  if (/commercial|office|retail|supermarket|kiosk|hotel/.test(building)) return "commercial";
  if (/industrial|warehouse|factory|service/.test(building)) return "industrial";
  if (/hospital/.test(building)) return "hospital";
  if (/school|university|college|kindergarten/.test(building)) return "school";
  if (/stadium|sports/.test(building)) return "stadium";
  if (/civic|public|government|church|cathedral|temple|mosque|synagogue/.test(building)) return "civic";
  if (/tower|monument/.test(building)) return "landmark";
  return "residential";
}

function osmInfrastructureDefaults(type, geometryType, tags) {
  const polygon = geometryType === "Polygon" || geometryType === "MultiPolygon";
  const defaults = {
    urban: { radius_km: 3.5, impervious_fraction: 0.48, runoff_delta: 0.12, roughness_delta: 0.08, temperature_delta_c: 1.6, vegetation_delta: -0.18, water_demand_mm: 80, building_density: 0.42, building_height_m: 28, floor_count: 8 },
    village: { radius_km: 1.4, impervious_fraction: 0.16, runoff_delta: 0.04, roughness_delta: 0.04, temperature_delta_c: 0.45, irrigation_mm: 40, vegetation_delta: -0.06, water_demand_mm: 35, building_density: 0.18, building_height_m: 8, floor_count: 2 },
    transport: { radius_km: osmHighwayRadiusKm(tags.highway), impervious_fraction: 0.62, runoff_delta: 0.09, roughness_delta: 0.02, temperature_delta_c: 0.3, vegetation_delta: -0.22 },
    rail: { radius_km: 0.12, impervious_fraction: 0.38, runoff_delta: 0.06, roughness_delta: 0.01, temperature_delta_c: 0.15, vegetation_delta: -0.18 },
    bridge: { radius_km: 0.16, impervious_fraction: 0.56, runoff_delta: 0.07, roughness_delta: 0.02, temperature_delta_c: 0.1, vegetation_delta: -0.12, building_height_m: 9 },
    industrial: { radius_km: 1.8, impervious_fraction: 0.58, runoff_delta: 0.13, roughness_delta: 0.06, temperature_delta_c: 1.1, vegetation_delta: -0.2, water_demand_mm: 130, building_density: 0.36, building_height_m: 18, floor_count: 3 },
    highrise: { radius_km: 1.2, impervious_fraction: 0.76, runoff_delta: 0.19, roughness_delta: 0.16, temperature_delta_c: 2.5, vegetation_delta: -0.32, water_demand_mm: 190, building_density: 0.72, building_height_m: 170, floor_count: 48 },
    apartment: { radius_km: 1.6, impervious_fraction: 0.58, runoff_delta: 0.13, roughness_delta: 0.12, temperature_delta_c: 1.7, vegetation_delta: -0.22, water_demand_mm: 125, building_density: 0.55, building_height_m: 58, floor_count: 18 },
    residential: { radius_km: 2, impervious_fraction: 0.38, runoff_delta: 0.08, roughness_delta: 0.08, temperature_delta_c: 0.9, irrigation_mm: 20, vegetation_delta: -0.12, water_demand_mm: 75, building_density: 0.32, building_height_m: 16, floor_count: 5 },
    villa: { radius_km: 1.1, impervious_fraction: 0.22, runoff_delta: 0.04, roughness_delta: 0.07, temperature_delta_c: 0.25, irrigation_mm: 45, vegetation_delta: 0.04, water_demand_mm: 55, building_density: 0.18, building_height_m: 8, floor_count: 2 },
    commercial: { radius_km: 1.1, impervious_fraction: 0.68, runoff_delta: 0.16, roughness_delta: 0.1, temperature_delta_c: 2.1, vegetation_delta: -0.28, water_demand_mm: 155, building_density: 0.58, building_height_m: 92, floor_count: 25 },
    civic: { radius_km: 0.75, impervious_fraction: 0.42, runoff_delta: 0.08, roughness_delta: 0.07, temperature_delta_c: 0.8, vegetation_delta: -0.1, water_demand_mm: 80, building_density: 0.28, building_height_m: 24, floor_count: 6 },
    landmark: { radius_km: 0.55, impervious_fraction: 0.5, runoff_delta: 0.09, roughness_delta: 0.14, temperature_delta_c: 0.7, vegetation_delta: -0.08, water_demand_mm: 60, building_density: 0.35, building_height_m: 120, floor_count: 32, landmark_height_m: 260 },
    hospital: { radius_km: 0.75, impervious_fraction: 0.52, runoff_delta: 0.1, roughness_delta: 0.08, temperature_delta_c: 1, vegetation_delta: -0.12, water_demand_mm: 180, building_density: 0.34, building_height_m: 38, floor_count: 10 },
    school: { radius_km: 0.65, impervious_fraction: 0.38, runoff_delta: 0.07, roughness_delta: 0.06, temperature_delta_c: 0.55, irrigation_mm: 20, vegetation_delta: -0.02, water_demand_mm: 70, building_density: 0.24, building_height_m: 16, floor_count: 4 },
    stadium: { radius_km: 0.7, impervious_fraction: 0.56, runoff_delta: 0.12, roughness_delta: 0.09, temperature_delta_c: 0.9, irrigation_mm: 15, vegetation_delta: -0.18, water_demand_mm: 90, building_density: 0.32, building_height_m: 26, floor_count: 5 },
    airport: { radius_km: 2.6, impervious_fraction: 0.66, runoff_delta: 0.15, roughness_delta: -0.02, temperature_delta_c: 1.2, vegetation_delta: -0.36, water_demand_mm: 110, building_density: 0.12, building_height_m: 18, floor_count: 3 },
    port: { radius_km: 1.2, impervious_fraction: 0.64, runoff_delta: 0.14, roughness_delta: 0.08, temperature_delta_c: 1, vegetation_delta: -0.25, water_demand_mm: 95, building_density: 0.26, building_height_m: 22, floor_count: 4 },
    powerplant: { radius_km: 1, impervious_fraction: 0.62, runoff_delta: 0.13, roughness_delta: 0.08, temperature_delta_c: 1.8, vegetation_delta: -0.28, water_demand_mm: 260, building_density: 0.3, building_height_m: 32, floor_count: 5, landmark_height_m: 85 },
    wastewater: { radius_km: 0.85, impervious_fraction: 0.44, runoff_delta: 0.04, roughness_delta: 0.04, temperature_delta_c: 0.25, storage_mm: 90, flow_retention: 0.18, vegetation_delta: -0.08, water_demand_mm: 40, building_density: 0.18, building_height_m: 12, floor_count: 2 },
    solar_farm: { radius_km: 1.4, impervious_fraction: 0.24, runoff_delta: 0.05, roughness_delta: 0.03, temperature_delta_c: 0.45, vegetation_delta: -0.12, building_density: 0.04, building_height_m: 3 },
    wind_farm: { radius_km: 1.6, impervious_fraction: 0.08, runoff_delta: 0.01, roughness_delta: 0.04, temperature_delta_c: 0.05, vegetation_delta: -0.04, building_density: 0.03, landmark_height_m: 115 },
    park: { radius_km: 1.1, impervious_fraction: 0.08, runoff_delta: -0.03, roughness_delta: 0.05, temperature_delta_c: -0.35, irrigation_mm: 70, vegetation_delta: 0.24, building_density: 0.03, building_height_m: 5 },
    logistics: { radius_km: 1.1, impervious_fraction: 0.7, runoff_delta: 0.16, roughness_delta: 0.04, temperature_delta_c: 1.1, vegetation_delta: -0.24, water_demand_mm: 95, building_density: 0.34, building_height_m: 16, floor_count: 2 },
    greenhouse: { radius_km: 0.9, impervious_fraction: 0.34, runoff_delta: 0.06, roughness_delta: 0.03, temperature_delta_c: 0.6, irrigation_mm: 220, vegetation_delta: 0.06, water_demand_mm: 210, building_density: 0.46, building_height_m: 7, floor_count: 1 },
    quarry: { radius_km: 1.2, impervious_fraction: 0.18, runoff_delta: 0.11, roughness_delta: -0.02, temperature_delta_c: 0.35, vegetation_delta: -0.5, building_density: 0.08, building_height_m: 8, floor_count: 1 },
    reservoir: { radius_km: 1.6, impervious_fraction: 0, runoff_delta: -0.06, roughness_delta: -0.03, temperature_delta_c: -0.25, storage_mm: 220, flow_retention: 0.28, vegetation_delta: 0.04 },
    dam: { radius_km: 0.75, impervious_fraction: 0.18, runoff_delta: -0.04, roughness_delta: 0.05, storage_mm: 360, flow_retention: 0.55 },
    canal: { radius_km: 0.55, impervious_fraction: 0.04, runoff_delta: -0.04, roughness_delta: -0.02, irrigation_mm: 160, vegetation_delta: 0.12, flow_retention: 0.12 },
    levee: { radius_km: 0.35, impervious_fraction: 0.08, runoff_delta: 0.03, roughness_delta: 0.04, flow_retention: 0.08 },
    custom: { radius_km: 1, impervious_fraction: 0.12, runoff_delta: 0.02, roughness_delta: 0.02, building_density: 0.1, building_height_m: 10, floor_count: 2 }
  };
  const selected = { ...(defaults[type] || defaults.custom) };
  if (polygon && Number.isFinite(selected.radius_km)) selected.radius_km = Math.max(0.05, Math.min(selected.radius_km, 0.35));
  return selected;
}

function osmHighwayRadiusKm(highway) {
  const text = tagText(highway);
  if (/motorway|trunk/.test(text)) return 0.24;
  if (/primary|secondary/.test(text)) return 0.18;
  if (/tertiary|unclassified|residential/.test(text)) return 0.12;
  if (/service|track|path|footway|cycleway/.test(text)) return 0.06;
  return 0.14;
}

function isOsmPolygon(tags) {
  return Boolean(
    tags?.building ||
    tags?.landuse ||
    tags?.amenity ||
    tags?.leisure ||
    tags?.water ||
    tags?.natural === "water" ||
    tags?.power === "plant" ||
    tags?.power === "substation" ||
    tags?.aeroway === "aerodrome"
  );
}

function isClosedRing(coords) {
  if (!coords.length) return false;
  const first = coords[0];
  const last = coords[coords.length - 1];
  return Math.abs(first[0] - last[0]) < 1e-10 && Math.abs(first[1] - last[1]) < 1e-10;
}

function ensureClosedRing(coords) {
  if (isClosedRing(coords)) return coords;
  return [...coords, coords[0]];
}

function hasBuildingTags(tags) {
  return Boolean(tags?.building || tags?.["building:levels"] || tags?.["building:part:levels"]);
}

function tagText(value) {
  return String(value || "").trim().toLowerCase();
}

function parseOsmNumber(value) {
  if (value == null || value === "") return Number.NaN;
  const match = String(value).replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : Number.NaN;
}

function parseOsmMeters(value) {
  if (value == null || value === "") return Number.NaN;
  const text = String(value).trim().toLowerCase().replace(",", ".");
  const n = parseOsmNumber(text);
  if (!Number.isFinite(n)) return Number.NaN;
  if (/(ft|feet|foot)/.test(text)) return n * 0.3048;
  return n;
}

async function boundedResponseText(response, maxBytes) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(`Upstream response is ${declared} bytes, above the ${maxBytes} byte limit`);
  }
  if (!response.body?.getReader) {
    const text = await response.text();
    const bytes = new TextEncoder().encode(text).byteLength;
    if (bytes > maxBytes) throw new Error(`Upstream response is above the ${maxBytes} byte limit`);
    return text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value?.byteLength || 0;
    if (bytes > maxBytes) throw new Error(`Upstream response is above the ${maxBytes} byte limit`);
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function buildDataRequirements() {
  return [
    {
      group: "terrain",
      importFields: ["dem", "elevation_m"],
      preferredSources: ["usgs_3dep_dem_candidates", "usgs_3dep_dem_1m", "usgs_3dep_dem_13arc"]
    },
    {
      group: "soil_hydrology",
      importFields: ["soil_group", "hydrologic_soil_group", "ksat_mm_hr", "awc_mm", "root_depth_m"],
      preferredSources: ["usda_gssurgo", "nrcs_web_soil_survey"]
    },
    {
      group: "landcover_vegetation",
      importFields: ["landcover", "nlcd", "vegetation_fraction", "lai", "canopy_height_m", "impervious_fraction"],
      preferredSources: ["mrlc_nlcd", "mrlc_impervious"]
    },
    {
      group: "meteorology_boundary",
      importFields: ["precip_mm_yr", "temp_c", "wind_speed", "wind_direction", "date", "prcp_mm", "tmax", "tmin"],
      preferredSources: ["daymet_grid_sample", "daymet_single_pixel", "prism_climate"]
    },
    {
      group: "hydrology_flowlines",
      importFields: ["LineString", "MultiLineString", "COMID", "GNIS_NAME", "stream_order", "length_km"],
      preferredSources: ["usgs_nhdplus_hr_flowlines"]
    },
    {
      group: "built_environment",
      importFields: ["Point/LineString/Polygon", "infrastructure_type", "radius_km", "impervious_fraction", "runoff_delta", "temperature_delta_c", "storage_mm", "flow_retention", "irrigation_mm", "building_height_m", "floor_count"],
      preferredSources: ["osm_overpass_infrastructure", "mrlc_impervious"]
    },
    {
      group: "calibration",
      importFields: ["date", "discharge_m3s", "flow_m3s", "discharge_cfs", "00060"],
      preferredSources: ["usgs_water_services_legacy"]
    }
  ];
}

function normalizeSiteCode(value) {
  const site = String(value || "").trim();
  if (!/^[A-Za-z0-9._-]{1,32}$/.test(site)) throw new Error("Invalid USGS site code");
  return site;
}

function boundedDailyDateWindow(params) {
  const nowYear = new Date().getUTCFullYear();
  const startYear = Math.round(clampNumber(params.get("startYear"), 1889, 2100, nowYear - 5));
  const endYear = Math.round(clampNumber(params.get("endYear"), 1889, 2100, nowYear - 1));
  const startDate = normalizeIsoDate(params.get("start") || params.get("startDT") || `${startYear}-01-01`);
  const endDate = normalizeIsoDate(params.get("end") || params.get("endDT") || `${endYear}-12-31`);
  const startMs = Date.parse(`${startDate}T00:00:00Z`);
  const endMs = Date.parse(`${endDate}T00:00:00Z`);
  if (endMs < startMs) throw new Error("USGS end date must be on or after start date");
  const days = Math.floor((endMs - startMs) / 86400000) + 1;
  if (days > MAX_USGS_DAILY_YEARS * 366) {
    throw new Error(`USGS daily-values window is limited to ${MAX_USGS_DAILY_YEARS} years per request`);
  }
  return { startDate, endDate };
}

function normalizeIsoDate(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`Invalid ISO date: ${text || "(empty)"}`);
  const date = new Date(`${text}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw new Error(`Invalid ISO date: ${text}`);
  }
  return text;
}

function squareBbox(lon, lat, sizeKm) {
  const half = sizeKm / 2;
  const dLat = half / 110.574;
  const dLon = half / (111.32 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
}

function required(params, key) {
  const value = params.get(key);
  if (!value) throw new Error(`Missing required query parameter: ${key}`);
  return value;
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function fixed(value, decimals) {
  return Number(value).toFixed(decimals);
}

function round(value, decimals) {
  const f = 10 ** decimals;
  return Math.round(Number(value) * f) / f;
}

function yearFromDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.getUTCFullYear() : Number.NaN;
}

function parseDateMaybe(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function meanOrNaN(values) {
  return values.length ? mean(values) : Number.NaN;
}

function meanFinite(values) {
  const finite = values.map(Number).filter(Number.isFinite);
  return meanOrNaN(finite);
}

function quantile(sortedValues, q) {
  if (!sortedValues.length) return Number.NaN;
  const pos = (sortedValues.length - 1) * q;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return sortedValues[lower];
  const weight = pos - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
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

function finiteRound(value, decimals) {
  const n = Number(value);
  return Number.isFinite(n) ? round(n, decimals) : null;
}

async function logSourceCheck(target, status) {
  console.log(JSON.stringify({ event: "source-proxy", host: target.hostname, status }));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      ...CORS_HEADERS,
      "content-type": "application/json; charset=utf-8"
    }
  });
}
