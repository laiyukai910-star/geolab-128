const UNITY_HEIGHTMAP_RESOLUTIONS = Object.freeze([33, 65, 129, 257, 513, 1025, 2049, 4097]);
const UNREAL_HEIGHTMAP_RESOLUTIONS = Object.freeze([127, 253, 505, 1009, 2017, 4033]);
const TEXT_ENCODER = new TextEncoder();

export const ENGINE_EXPORT_PROFILES = Object.freeze({
  unity: {
    id: "unity",
    label: "Unity Terrain",
    heightExtension: "raw",
    heightBitDepth: 16,
    byteOrder: "little-endian",
    allowedResolutions: UNITY_HEIGHTMAP_RESOLUTIONS,
    axisMapping: { east: "+X", north: "+Z", up: "+Y" },
    horizontalUnit: "meter",
    verticalUnit: "meter"
  },
  unreal: {
    id: "unreal",
    label: "Unreal Engine Landscape",
    heightExtension: "r16",
    heightBitDepth: 16,
    byteOrder: "little-endian",
    allowedResolutions: UNREAL_HEIGHTMAP_RESOLUTIONS,
    axisMapping: { east: "+X", north: "+Y", up: "+Z" },
    horizontalUnit: "centimeter",
    verticalUnit: "centimeter"
  }
});

export function buildEngineScenePackage(model, params = {}, options = {}) {
  if (!model?.height?.length || !model.n) throw new Error("A built terrain model is required for engine export");
  const engine = String(options.engine || "unity").toLowerCase();
  const profile = ENGINE_EXPORT_PROFILES[engine];
  if (!profile) throw new Error(`Unsupported engine export profile: ${engine}`);
  const resolution = chooseEngineResolution(model.n, profile.allowedResolutions, options.resolution);
  const elevationRange = finiteRange(model.height);
  const heightBytes = encodeHeightR16(model, resolution, elevationRange);
  const layerDefinitions = buildLayerDefinitions(model);
  const layerEntries = layerDefinitions.map((layer) => {
    const pixels = encodeWeightR8(model, resolution, layer.sample);
    const extension = engine === "unity" ? "tga" : "r8";
    return {
      path: `layers/${layer.id}.${extension}`,
      bytes: engine === "unity" ? encodeGrayscaleTga(pixels, resolution, resolution) : pixels,
      role: layer.role,
      range: [0, 1],
      encoding: engine === "unity" ? "8-bit grayscale TGA" : "8-bit unsigned raw"
    };
  });
  const heightBaseName = `heightmap-${engine}-${resolution}`;
  const heightPath = `${heightBaseName}.${profile.heightExtension}`;
  const vectors = buildSceneVectors(model, resolution);
  const generatedAt = new Date().toISOString();
  const manifest = buildManifest({
    model,
    params,
    profile,
    engine,
    resolution,
    elevationRange,
    heightPath,
    layerEntries,
    generatedAt
  });
  const entries = [
    { path: heightPath, bytes: heightBytes },
    ...layerEntries.map((entry) => ({ path: entry.path, bytes: entry.bytes })),
    { path: "vectors/scene-vectors.json", bytes: jsonBytes(vectors) },
    { path: "reports/physical-coupling.json", bytes: jsonBytes(model.physicalCoupling || null) },
    { path: "scene-manifest.json", bytes: jsonBytes(manifest) },
    { path: "README.txt", bytes: TEXT_ENCODER.encode(buildEngineReadme(manifest)) }
  ];
  if (engine === "unreal") {
    entries.push({
      path: `${heightBaseName}.json`,
      bytes: jsonBytes({ width: resolution, height: resolution, bbp: 16 })
    });
  }
  const zipBytes = encodeStoredZip(entries);
  const fileName = `geolab-${Math.round(model.sizeKm || 128)}km-${engine}-scene.zip`;
  return {
    type: "geolab-engine-scene-package",
    engine,
    fileName,
    manifest,
    files: entries.map((entry) => ({ path: entry.path, sizeBytes: entry.bytes.length })),
    blob: new Blob([zipBytes], { type: "application/zip" })
  };
}

export function chooseEngineResolution(sourceResolution, allowedResolutions, requestedResolution = null) {
  const allowed = Array.from(allowedResolutions || []).filter((value) => Number.isInteger(value) && value > 1);
  if (!allowed.length) throw new Error("At least one engine heightmap resolution is required");
  const requested = Number(requestedResolution);
  if (Number.isFinite(requested) && allowed.includes(Math.round(requested))) return Math.round(requested);
  const source = Math.max(2, Math.round(Number(sourceResolution) || allowed[0]));
  return allowed.reduce((best, value) => {
    const distance = Math.abs(value - source);
    const bestDistance = Math.abs(best - source);
    if (distance < bestDistance) return value;
    if (distance === bestDistance && value > best) return value;
    return best;
  }, allowed[0]);
}

function buildManifest(input) {
  const sizeM = finite(input.model.sizeKm, 128) * 1000;
  const elevationRangeM = Math.max(0.01, input.elevationRange.max - input.elevationRange.min);
  const sampleSpacingM = sizeM / Math.max(1, input.resolution - 1);
  const unity = input.engine === "unity" ? {
    terrainDataSizeM: [sizeM, elevationRangeM, sizeM],
    terrainBaseElevationM: input.elevationRange.min,
    terrainObjectPositionM: { x: -sizeM * 0.5, y: input.elevationRange.min, z: -sizeM * 0.5 },
    importSettings: {
      depth: 16,
      byteOrder: "Windows/little-endian",
      resolution: input.resolution,
      flipVertically: false
    }
  } : null;
  const unreal = input.engine === "unreal" ? {
    landscapeScaleCm: {
      x: sampleSpacingM * 100,
      y: sampleSpacingM * 100,
      z: elevationRangeM * 100 / 512
    },
    landscapeLocationZCm: (input.elevationRange.min + elevationRangeM * 0.5) * 100,
    landscapeLocationCm: { x: 0, y: 0, z: (input.elevationRange.min + elevationRangeM * 0.5) * 100 },
    importSettings: {
      format: "r16",
      resolution: input.resolution,
      heightRangeInterpretation: "raw 0..65535 maps to -256..255.992 before Z scale"
    }
  } : null;
  return {
    type: "geolab-engine-scene-manifest",
    schemaVersion: "1.0.0",
    engine: input.profile,
    generatedAt: input.generatedAt,
    terrain: {
      sourceResolution: input.model.n,
      exportResolution: input.resolution,
      mapSizeKm: finite(input.model.sizeKm, 128),
      mapAreaKm2: finite(input.model.areaKm2, finite(input.model.sizeKm, 128) ** 2),
      sampleSpacingM,
      heightFile: input.heightPath,
      heightEncoding: {
        bitDepth: 16,
        byteOrder: "little-endian",
        rowOrder: "south-to-north",
        sampleSemantics: "PixelIsPoint",
        rawMinimum: 0,
        rawMaximum: 65535,
        elevationMinimumM: input.elevationRange.min,
        elevationMaximumM: input.elevationRange.max,
        elevationPerRawUnitM: elevationRangeM / 65535
      },
      unity,
      unreal
    },
    coordinateReference: {
      type: "local-engineering-crs",
      origin: "terrain center at model elevation zero",
      canonicalAxes: { east: "+X", north: "+Y", up: "+Z" },
      canonicalUnit: "meter",
      targetBounds: input.model.targetBounds || null,
      spatialContext: input.model.spatialContext || null,
      geographicAnchor: input.model.spatialContext?.bboxWgs84 || null,
      localExtentM: {
        west: -sizeM * 0.5,
        east: sizeM * 0.5,
        south: -sizeM * 0.5,
        north: sizeM * 0.5
      },
      caveat: input.model.spatialContext?.bboxWgs84
        ? "The WGS84 bounding box is retained as an anchor; verify projected CRS and vertical datum before round-tripping survey data."
        : "No authoritative geodetic CRS or vertical datum is attached; treat coordinates as a local engineering frame."
    },
    layers: input.layerEntries.map((entry) => ({
      path: entry.path,
      role: entry.role,
      range: entry.range,
      encoding: entry.encoding,
      resolution: [input.resolution, input.resolution],
      rowOrder: "south-to-north"
    })),
    vectors: {
      path: "vectors/scene-vectors.json",
      canonicalCoordinateOrder: ["east_m", "north_m", "elevation_m"],
      contains: ["river polylines", "sampled infrastructure anchors"]
    },
    diagnostics: {
      physicalCouplingPath: "reports/physical-coupling.json",
      processIntegrityIndex: finite(input.model.physicalCoupling?.summary?.processIntegrityIndex, null),
      couplingIntegrityIndex: finite(input.model.physicalCoupling?.summary?.couplingIntegrityIndex, null),
      dataReadinessClass: input.model.stats?.dataReadiness?.class || null,
      observedSupport: finite(input.model.stats?.dataConfidence?.meanObservedSupport, null)
    },
    provenance: {
      generatedBy: "GeoLab 128",
      externalSourceCount: input.model.stats?.externalSourceCount || 0,
      sourceNames: (input.params.externalLayers?.sources || []).map((source) => source.name || source.id || source.type || "unnamed-source")
    },
    interpretationBoundary: "This package is an engine interchange asset from a teaching and exploration model. Validate CRS, vertical datum, hydrology, collision, materials, scale, and source evidence before production use."
  };
}

function buildEngineReadme(manifest) {
  const terrain = manifest.terrain;
  const layerLines = manifest.layers.map((layer) => `- ${layer.path}: ${layer.role}`).join("\r\n");
  if (manifest.engine.id === "unity") {
    return [
      "GeoLab 128 - Unity Terrain interchange package",
      "",
      `1. Create a Unity Terrain and set Heightmap Resolution to ${terrain.exportResolution}.`,
      `2. Import ${terrain.heightFile} as 16-bit RAW, Windows/little-endian, with Flip Vertically disabled.`,
      `3. Set Terrain Size to ${terrain.unity.terrainDataSizeM.join(" x ")} meters.`,
      `4. Place the Terrain object at X/Y/Z = ${terrain.unity.terrainObjectPositionM.x} / ${round(terrain.unity.terrainObjectPositionM.y, 4)} / ${terrain.unity.terrainObjectPositionM.z} meters.`,
      "5. Import the TGA files as terrain-mask textures and map them in a Terrain Layer material or shader.",
      "6. Read vectors/scene-vectors.json in the canonical east/north/up meter frame before mapping to Unity X/Z/Y.",
      "",
      "Surface masks:",
      layerLines,
      "",
      manifest.interpretationBoundary
    ].join("\r\n");
  }
  return [
    "GeoLab 128 - Unreal Engine Landscape interchange package",
    "",
    `1. In Landscape mode, import ${terrain.heightFile} at ${terrain.exportResolution} x ${terrain.exportResolution}.`,
    `2. Set Landscape X/Y scale to ${round(terrain.unreal.landscapeScaleCm.x, 6)} cm.`,
    `3. Set Landscape Z scale to ${round(terrain.unreal.landscapeScaleCm.z, 6)} and actor Z location to ${round(terrain.unreal.landscapeLocationZCm, 4)} cm.`,
    "4. Create Landscape Layer Info assets and import the matching 8-bit R8 weight files.",
    "5. Read vectors/scene-vectors.json in east/north/up meters, then convert to Unreal X/Y/Z centimeters.",
    "",
    "Landscape masks:",
    layerLines,
    "",
    manifest.interpretationBoundary
  ].join("\r\n");
}

function buildLayerDefinitions(model) {
  return [
    { id: "vegetation", role: "vegetation cover fraction", sample: (i) => finite(model.surface?.vegetation?.[i], 0) },
    { id: "wetness", role: "topographic wetness screening", sample: (i) => clamp(finite(model.wetnessIndex?.[i], 0) / 24, 0, 1) },
    { id: "impervious", role: "impervious surface fraction", sample: (i) => finite(model.surface?.imperviousFraction?.[i], 0) },
    { id: "erosion", role: "erosion-risk screening", sample: (i) => finite(model.hydraulics?.erosionRisk?.[i], 0) },
    { id: "flood", role: "current flood-hazard screening", sample: (i) => finite(model.hazards?.currentFloodHazard?.[i] ?? model.hazards?.floodHazard?.[i], 0) }
  ];
}

function buildSceneVectors(model) {
  const sourceRivers = model.riverSegments || [];
  const riverStride = Math.max(1, Math.ceil(sourceRivers.length / 120000));
  const rivers = [];
  for (let index = 0; index < sourceRivers.length; index += 1) {
    const segment = sourceRivers[index];
    if (index % riverStride !== 0 && finite(segment.order, 1) < 3) continue;
    if (rivers.length >= 120000) break;
    rivers.push({
      id: `river-${index}`,
      order: segment.order || 1,
      catchmentKm2: finite(segment.catchment, 0),
      dischargeM3Yr: finite(segment.discharge, 0),
      source: segment.source || "modeled",
      pointsEnuM: [indexToEnu(model, segment.from), indexToEnu(model, segment.to)]
    });
  }
  const infrastructure = [];
  const influence = model.infrastructureInfluence;
  if (influence?.mask) {
    const affectedCount = Math.max(1, finite(influence.cellCount, model.stats?.externalInfrastructure?.affectedCellCount || 1));
    const stride = Math.max(1, Math.ceil(affectedCount / 8192));
    let affectedCursor = 0;
    for (let i = 0; i < influence.mask.length; i += 1) {
      if (!influence.mask[i]) continue;
      affectedCursor += 1;
      if ((affectedCursor - 1) % stride !== 0) continue;
      infrastructure.push({
        id: `facility-cell-${i}`,
        typeCode: influence.typeCode?.[i] ?? 0,
        buildingDensity: finite(influence.buildingDensity?.[i], 0),
        buildingHeightM: Math.max(finite(influence.buildingHeightM?.[i], 0), finite(influence.landmarkHeightM?.[i], 0)),
        positionEnuM: indexToEnu(model, i)
      });
    }
  }
  return {
    type: "geolab-local-scene-vectors",
    coordinateOrder: ["east_m", "north_m", "elevation_m"],
    axes: { east: "+X", north: "+Y", up: "+Z" },
    rivers,
    infrastructure,
    simplification: {
      sourceRiverSegmentCount: sourceRivers.length,
      exportedRiverSegmentCount: rivers.length,
      riverStride,
      maximumRiverSegmentCount: 120000,
      exportedInfrastructureAnchorCount: infrastructure.length
    },
    interpretationBoundary: "Local engineering coordinates; see scene-manifest.json for engine axis mapping and geographic anchoring."
  };
}

function indexToEnu(model, index) {
  const x = index % model.n;
  const y = Math.floor(index / model.n);
  const sizeM = finite(model.sizeKm, 128) * 1000;
  return [
    round(x / Math.max(1, model.n - 1) * sizeM - sizeM * 0.5, 4),
    round(sizeM * 0.5 - y / Math.max(1, model.n - 1) * sizeM, 4),
    round(finite(model.height?.[index], 0), 4)
  ];
}

function encodeHeightR16(model, resolution, range) {
  const bytes = new Uint8Array(resolution * resolution * 2);
  const view = new DataView(bytes.buffer);
  const span = Math.max(0.0001, range.max - range.min);
  let offset = 0;
  for (let y = 0; y < resolution; y += 1) {
    const sourceY = (resolution - 1 - y) / Math.max(1, resolution - 1) * (model.n - 1);
    for (let x = 0; x < resolution; x += 1) {
      const sourceX = x / Math.max(1, resolution - 1) * (model.n - 1);
      const elevation = bilinearSample(model.height, model.n, sourceX, sourceY);
      const raw = Math.round(clamp((elevation - range.min) / span, 0, 1) * 65535);
      view.setUint16(offset, raw, true);
      offset += 2;
    }
  }
  return bytes;
}

function encodeWeightR8(model, resolution, sampler) {
  const bytes = new Uint8Array(resolution * resolution);
  let offset = 0;
  for (let y = 0; y < resolution; y += 1) {
    const sourceY = (resolution - 1 - y) / Math.max(1, resolution - 1) * (model.n - 1);
    for (let x = 0; x < resolution; x += 1) {
      const sourceX = x / Math.max(1, resolution - 1) * (model.n - 1);
      const value = bilinearCallbackSample(model.n, sourceX, sourceY, sampler);
      bytes[offset] = Math.round(clamp(value, 0, 1) * 255);
      offset += 1;
    }
  }
  return bytes;
}

function bilinearSample(array, n, x, y) {
  return bilinearCallbackSample(n, x, y, (index) => finite(array[index], 0));
}

function bilinearCallbackSample(n, x, y, sampler) {
  const x0 = clamp(Math.floor(x), 0, n - 1);
  const y0 = clamp(Math.floor(y), 0, n - 1);
  const x1 = Math.min(n - 1, x0 + 1);
  const y1 = Math.min(n - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const a = finite(sampler(y0 * n + x0), 0);
  const b = finite(sampler(y0 * n + x1), a);
  const c = finite(sampler(y1 * n + x0), a);
  const d = finite(sampler(y1 * n + x1), c);
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}

function encodeGrayscaleTga(pixels, width, height) {
  const bytes = new Uint8Array(18 + pixels.length);
  bytes[2] = 3;
  bytes[12] = width & 255;
  bytes[13] = (width >>> 8) & 255;
  bytes[14] = height & 255;
  bytes[15] = (height >>> 8) & 255;
  bytes[16] = 8;
  bytes[17] = 0x20;
  bytes.set(pixels, 18);
  return bytes;
}

function encodeStoredZip(entries) {
  const prepared = entries.map((entry) => {
    const name = TEXT_ENCODER.encode(entry.path.replace(/\\/g, "/"));
    const bytes = entry.bytes instanceof Uint8Array ? entry.bytes : new Uint8Array(entry.bytes);
    return { name, bytes, crc: crc32(bytes), offset: 0 };
  });
  const localSize = prepared.reduce((sum, entry) => sum + 30 + entry.name.length + entry.bytes.length, 0);
  const centralSize = prepared.reduce((sum, entry) => sum + 46 + entry.name.length, 0);
  const output = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(output.buffer);
  let cursor = 0;
  for (const entry of prepared) {
    entry.offset = cursor;
    view.setUint32(cursor, 0x04034b50, true);
    view.setUint16(cursor + 4, 20, true);
    view.setUint16(cursor + 6, 0x0800, true);
    view.setUint16(cursor + 8, 0, true);
    view.setUint32(cursor + 14, entry.crc, true);
    view.setUint32(cursor + 18, entry.bytes.length, true);
    view.setUint32(cursor + 22, entry.bytes.length, true);
    view.setUint16(cursor + 26, entry.name.length, true);
    output.set(entry.name, cursor + 30);
    output.set(entry.bytes, cursor + 30 + entry.name.length);
    cursor += 30 + entry.name.length + entry.bytes.length;
  }
  const centralOffset = cursor;
  for (const entry of prepared) {
    view.setUint32(cursor, 0x02014b50, true);
    view.setUint16(cursor + 4, 20, true);
    view.setUint16(cursor + 6, 20, true);
    view.setUint16(cursor + 8, 0x0800, true);
    view.setUint16(cursor + 10, 0, true);
    view.setUint32(cursor + 16, entry.crc, true);
    view.setUint32(cursor + 20, entry.bytes.length, true);
    view.setUint32(cursor + 24, entry.bytes.length, true);
    view.setUint16(cursor + 28, entry.name.length, true);
    view.setUint32(cursor + 42, entry.offset, true);
    output.set(entry.name, cursor + 46);
    cursor += 46 + entry.name.length;
  }
  view.setUint32(cursor, 0x06054b50, true);
  view.setUint16(cursor + 8, prepared.length, true);
  view.setUint16(cursor + 10, prepared.length, true);
  view.setUint32(cursor + 12, centralSize, true);
  view.setUint32(cursor + 16, centralOffset, true);
  return output;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function finiteRange(values) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < values.length; i += 1) {
    const value = Number(values[i]);
    if (!Number.isFinite(value)) continue;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };
  if (max <= min) return { min, max: min + 1 };
  return { min, max };
}

function jsonBytes(value) {
  return TEXT_ENCODER.encode(JSON.stringify(value, null, 2));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return null;
  const power = 10 ** digits;
  return Math.round(value * power) / power;
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
