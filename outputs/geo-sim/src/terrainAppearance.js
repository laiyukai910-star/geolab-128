import {
  rockMassStrength,
  regolithThicknessM,
  soilThicknessM,
  landformClass,
  lithologyMechanicalProperties,
  layerStructureSpacingM,
  columnDepthEdgesM
} from "./geoLithology.js";
import { SUBSURFACE_LITHOLOGY } from "./lithologyTable.js";

const unit = value => Math.min(1, Math.max(0, Number(value) || 0));
const smooth = (low, high, value) => {
  const t = unit((value - low) / (high - low));
  return t * t * (3 - 2 * t);
};
// Illustrative bed colors and alternating cliff/bench levels, not mapped local stratigraphy.
const CANYON_BEDS = [
  [780, [94, 91, 88]],
  [930, [125, 100, 91]],
  [1110, [154, 111, 91]],
  [1320, [185, 105, 78]],
  [1510, [178, 135, 106]],
  [1710, [169, 111, 91]],
  [1890, [191, 145, 112]],
  [2070, [207, 176, 139]],
  [2270, [191, 183, 157]],
  [2440, [159, 151, 135]]
];
const DRY_SOIL = [174, 151, 112];
const COLD_SOIL = [146, 145, 135];
const DRY_PLANT = [132, 126, 79];
const COLD_PLANT = [104, 124, 112];

function canyonBedColor(height) {
  let color = CANYON_BEDS[0][1];
  for (let i = 1; i < CANYON_BEDS.length; i += 1) {
    const [elevation, next] = CANYON_BEDS[i];
    const blend = smooth(elevation - 35, elevation + 35, height);
    if (blend === 0) break;
    color = color.map((channel, index) => channel * (1 - blend) + next[index] * blend);
  }
  return color;
}

/**
 * Geomorphic description of one surface cell, derived from the lithology that underlies it.
 *
 * This is the part of the surface appearance that has a physical basis: rock mass strength and
 * weathered-cover thickness follow the relationships in geoLithology.js, and the three surface
 * fractions are then apportioned by the processes that actually move material. Where a cell has no
 * subsurface column the previous slope/cover/wetness heuristic is used instead, so imported
 * scenarios without a subsurface model keep their established appearance.
 */
export function surfaceGeomorphology(model, params, index, options = {}) {  const height = Number(model.height?.[index]) || 0;
  const slope = Math.max(0, Number(model.slope?.[index]) || 0);
  const wetnessIndex = Number(model.wetnessIndex?.[index]) || 0;
  const cover = unit(model.surface?.vegetation?.[index]);
  const sealed = unit(model.surface?.imperviousFraction?.[index]);
  const deposition = unit(model.hydraulics?.depositionRisk?.[index]);
  const erosion = Number.isFinite(model.hydraulics?.erosionRisk?.[index]) ? unit(model.hydraulics.erosionRisk[index]) : 0.5;
  const seeded = !!model.hydraulics?.channelMask?.[index] && (model.hydraulics?.channelDepthM?.[index] ?? 0) > 0;

  // The table has to default here, not only at the public wrappers: a caller that forgets it would
  // otherwise silently receive the no-lithology fallback and pack it as a meaningless spacing. An
  // explicitly empty or missing table means no lithology information at all, so fall back too.
  const table = options.lithologyTable === null ? null : (options.lithologyTable || SUBSURFACE_LITHOLOGY);
  const hasTable = !!table && Object.keys(table).length > 0;
  const volume = model.subsurface;
  const columnIndex = Number.isInteger(options.columnIndex) ? options.columnIndex
    : subsurfaceColumnIndex(model, index);
  const lithologyCode = columnIndex >= 0 ? (volume?.lithologyCode?.[columnIndex] ?? 0) : -1;
  // Unresolved codes fall back to the table's unresolved entry rather than reporting an id the rest
  // of the pipeline cannot colour.
  const resolvedCode = hasTable && lithologyCode >= 0 ? (table[lithologyCode] ? lithologyCode : 0) : -1;
  const lithology = resolvedCode >= 0 ? table[resolvedCode] : null;
  if (!lithology) {
    // Fallback: no subsurface column, so keep the established slope/cover/wetness proxy.
    const rock = unit(smooth(18, 58, slope) * (1 - cover * 0.45) * (1 - sealed) * (1 - deposition * 0.55) * (1 + erosion * 0.2));
    const vegetation = cover * (1 - rock) * (1 - sealed);
    return {
      source: "surface-proxy",
      lithologyCode: -1, lithologyName: null, landform: null,
      rockMassStrength: null, regolithM: null,
      // Without a lithology there is no defensible joint spacing. Unclassified marks that, and the
      // shader then draws the generic granular response rather than inventing a blocky rock mass.
      jointSpacingM: 0.5, jointStyle: "unclassified", materialClass: "unconsolidated",
      rock, scree: unit((1 - sealed) * (1 - cover * 0.85) * (1 - unit(smooth(4, 14, wetnessIndex)) * 0.7) * (0.5 + erosion * 0.5)),
      vegetation, regolith: unit(1 - rock - vegetation - sealed),
      wet: smooth(4, 14, wetnessIndex), sealed, seeded
    };
  }

  // The jointed unit behind the surface is the whole weathered-plus-bedrock package, not just the
  // topmost slice, so its characteristic bed thickness is the thickness-weighted harmonic mean of
  // the layers. A thinly interbedded sequence therefore stays closely jointed even when one thick
  // bed sits at the top. The edges are read for THIS column, so the thickness follows the lateral
  // variation the stratigraphic derivation applies, and the surface and the geology agree.
  const bedThicknessM = effectiveBedThicknessM(volume, columnIndex, columnDepthEdgesM(model, columnIndex, { seaLevel: params?.seaLevel }));
  const topLayerLithology = lithology;
  const { spacingM, style, stiffness, materialClass } = layerStructureSpacingM(resolvedCode, bedThicknessM, 0, table);
  const strength = rockMassStrength(topLayerLithology, spacingM, smooth(4, 14, wetnessIndex));

  const weatheringProfile = {
    porosity: lithologyMechanicalProperties(lithology).porosity,
    meanTemperatureC: Number(model.temperature?.[index]) || 0,
    precipitationMmYr: Number(model.precipitation?.[index]) || 0,
    slopeDeg: slope,
    wetnessIndex
  };
  const regolithM = regolithThicknessM(weatheringProfile);
  const soilM = soilThicknessM(weatheringProfile);

  // Bare rock is where cover cannot be held: steep ground, a strong mass, thin weathered cover,
  // active erosion, or a channel bed that is swept by flow. Steepness and how much soil the ground
  // can hold are the two controlling factors; a deep saprolite profile keeps even steep ground
  // vegetated, which is what the strength and erosion terms modulate rather than override.
  const steepness = smooth(26, 62, slope);
  // Retention saturates on the mobile soil layer, not on the whole weathered profile: saprolite is
  // weathered rock and does not by itself hold a vegetation mat.
  const coverRetention = 1 - Math.exp(-soilM / 0.30);
  const strengthTerm = unit((strength - 40) / 55);
  // A channel cell is wet ground, not automatically a rock face: a sand-bed river is not bedrock.
  // Suppressing placed rock and scree detail on channels is a separate concern, handled by
  // surfaceDetailSuitability.
  const rock = unit((1 - sealed) * steepness * (1 - cover * 0.5) * (1 - deposition * 0.4)
    * (0.35 + 0.65 * strengthTerm) * (1 - 0.85 * coverRetention) * (0.8 + 0.35 * erosion));
  // Scree is material shed from above and trapped below. It is a deposit, so it competes with
  // vegetation for the same gentle-to-moderate ground rather than with bare rock, and it needs both
  // a slope to deliver debris and enough weathered material to supply it.
  const scree = unit((1 - sealed) * (1 - cover * 0.7)
    * smooth(28, 52, slope) * (0.55 + 0.45 * erosion) * coverRetention * (0.4 + 0.6 * strengthTerm));
  const vegetation = unit(cover * (1 - rock) * (1 - sealed) * (1 - scree * 0.55));
  const regolith = unit(1 - rock - scree - vegetation - sealed);

  return {
    source: "lithology",
    lithologyCode: resolvedCode, lithologyName: lithology.name,
    lithologyId: lithologyCode, unresolvedLithology: resolvedCode !== lithologyCode,
    landform: landformClass({ rockMassStrengthValue: strength, regolithM, slopeDeg: slope }),
    rockMassStrength: strength, regolithM, soilM, saproliteM: Math.max(0, regolithM - soilM),
    // Exposed so the packed surface structure bands at the same thickness the geology reports.
    bedThicknessM,
    jointSpacingM: spacingM, jointStyle: style, materialClass, stiffness,
    rock, scree, vegetation, regolith,
    wet: smooth(4, 14, wetnessIndex), sealed, seeded
  };
}

/**
 * Characteristic bed thickness of the package under one surface cell: the thickness-weighted
 * harmonic mean of its layer thicknesses, which is the thickness a single equivalent bed would
 * need in order to fracture at the same spacing as the interbedded stack.
 */
function effectiveBedThicknessM(volume, columnIndex, depthEdges) {
  if (!depthEdges || depthEdges.length < 2 || columnIndex < 0) return 1;
  const layerCount = Math.min(volume.layerCount || (depthEdges.length - 1), depthEdges.length - 1);
  let inverseSum = 0, counted = 0;
  for (let layer = 0; layer < layerCount; layer += 1) {
    const thickness = Math.max(0.02, (depthEdges[layer + 1] ?? 0) - (depthEdges[layer] ?? 0));
    inverseSum += 1 / thickness;
    counted += 1;
  }
  return counted > 0 && inverseSum > 0 ? counted / inverseSum : 1;
}

function subsurfaceColumnIndex(model, surfaceIndex) {  const volume = model?.subsurface;
  if (!volume?.columnCellCount) return -1;
  if (volume.columnCellCount === model.n * model.n) return surfaceIndex;
  const x = surfaceIndex % model.n;
  const y = Math.floor(surfaceIndex / model.n);
  const gx = Math.min(volume.gridN - 1, Math.max(0, Math.round((x / Math.max(1, model.n - 1)) * (volume.gridN - 1))));
  const gy = Math.min(volume.gridN - 1, Math.max(0, Math.round((y / Math.max(1, model.n - 1)) * (volume.gridN - 1))));
  return gy * volume.gridN + gx;
}

/**
 * Packed surface weights. Kept as [rock, vegetation, wet, sealed] because that is the layout the
 * terrain vertex buffer and shader already use; scree and regolith fold into the soil response
 * through the colour function instead of widening the buffer.
 */
export function terrainSurfaceWeights(model, params, index, lithologyTable = SUBSURFACE_LITHOLOGY, prepared = null) {
  if (model.height[index] <= (Number(params?.seaLevel) || 0)) return [0, 0, 0, 0];
  const geomorphology = prepared || surfaceGeomorphology(model, params, index, { lithologyTable });
  return [geomorphology.rock, geomorphology.vegetation, geomorphology.wet, geomorphology.sealed];
}

// Display suitability, not a prediction of rockfall deposits or soil moisture.
export function surfaceDetailSuitability(model, index, lithologyTable = SUBSURFACE_LITHOLOGY, prepared = null) {
  const sealed = unit(model.surface?.imperviousFraction?.[index]);
  const vegetation = unit(model.surface?.vegetation?.[index]);
  const wet = smooth(4, 14, model.wetnessIndex?.[index]);
  const deposition = unit(model.hydraulics?.depositionRisk?.[index]);
  const erosion = model.hydraulics?.erosionRisk?.[index] ? unit(model.hydraulics.erosionRisk[index]) : 1;
  if (model.hydraulics?.channelMask?.[index] && model.hydraulics.channelDepthM?.[index] > 0) return { rock: 0, scree: 0 };
  const geomorphology = prepared || surfaceGeomorphology(model, { seaLevel: 0 }, index, { lithologyTable });
  if (geomorphology.source === "lithology") return { rock: geomorphology.rock, scree: geomorphology.scree };
  return {
    rock: (1 - sealed) * (1 - vegetation * 0.65) * (1 - wet * 0.5) * (1 - deposition * 0.6),
    scree: (1 - sealed) * (1 - vegetation * 0.85) * (1 - wet * 0.7) * (0.5 + erosion * 0.5)
  };
}

// The structure buffer carries the two spacings the surface shader needs to draw joints and beds
// at the right scale. Both are logarithmic, because joint spacing spans two orders of magnitude
// between a closely fractured mudstone and a sparsely jointed granite.
const JOINT_SPACING_RANGE_M = [0.02, 20];
const BED_THICKNESS_RANGE_M = [0.01, 50];
const packLog = (value, [low, high]) => {
  const clamped = Math.min(high, Math.max(low, Number(value) || low));
  return Math.round(255 * (Math.log(clamped / low) / Math.log(high / low)));
};
export const unpackLog = (byte, [low, high]) => low * Math.pow(high / low, byte / 255);

/** Pack geomorphic structure into four normalized bytes for the terrain vertex buffer. */
export function packTerrainStructure(model, geomorphology) {
  // The bed thickness has to be the same per-column quantity the stratigraphic derivation uses, or
  // the shader would band the surface at the region's reference thickness while the geology reports a
  // different one for that column. `geomorphology.bedThicknessM` is that value; the reference array is
  // only the fallback for a caller that built the geomorphology some other way.
  const referenceEdges = model?.subsurface?.depthEdgesM;
  const referenceThickness = referenceEdges
    ? Math.max(0.01, (referenceEdges[1] ?? 1) - (referenceEdges[0] ?? 0))
    : 1;
  const bedThicknessM = Math.max(0.01, Number(geomorphology?.bedThicknessM) || referenceThickness);
  return [
    packLog(geomorphology?.jointSpacingM ?? 1, JOINT_SPACING_RANGE_M),
    packLog(bedThicknessM, BED_THICKNESS_RANGE_M),
    Math.round(255 * unit(geomorphology?.stiffness ?? 0.5)),
    MATERIAL_CLASS_CODE[geomorphology?.materialClass] ?? MATERIAL_CLASS_CODE.unclassified
  ];
}
export const TERRAIN_STRUCTURE_RANGES = Object.freeze({ jointSpacingM: JOINT_SPACING_RANGE_M, bedThicknessM: BED_THICKNESS_RANGE_M });
// The fourth byte tells the shader which of the two spacing scales the first byte holds: a joint
// spacing in a rock mass, or an aggregate scale in a loose material with no joints. Values are
// uploaded normalized, so they are compared as fractions of 255 in terrainSurfaceMaterial.js.
export const MATERIAL_CLASS_CODE = Object.freeze({ unclassified: 64, unconsolidated: 191, rock: 255 });

export function naturalTerrainColor(model, params, index, weights = null, lithologyTable = SUBSURFACE_LITHOLOGY, prepared = null) {
  if (model.height[index] <= (Number(params?.seaLevel) || 0)) return [142, 151, 132];
  const geomorphology = prepared || surfaceGeomorphology(model, params, index, { lithologyTable });
  const [rock, vegetation, wet, sealed] = weights || [geomorphology.rock, geomorphology.vegetation, geomorphology.wet, geomorphology.sealed];
  const scenic = params?.scenicPreset;
  const canyonReference = scenic === "grand_canyon";
  const canyonBed = canyonReference ? canyonBedColor(model.height[index]) : null;
  const dedicatedScenic = canyonReference || scenic === "yosemite_valley" ||
    scenic === "guilin_lijiang" || scenic === "mount_fuji";
  let soil = [139, 121, 93];
  let mineral = [147, 151, 146];
  let plant = [65, 108, 54];
  if (canyonBed) {
    soil = canyonBed.map(channel => channel * 0.92 + 10);
    mineral = canyonBed;
    plant = [83, 105, 65];
  } else if (scenic === "yosemite_valley") {
    soil = [120, 130, 118];
    mineral = [179, 183, 177];
    plant = [52, 91, 60];
  } else if (scenic === "guilin_lijiang") {
    soil = [135, 133, 103];
    mineral = [160, 169, 152];
    plant = [45, 106, 62];
  } else if (scenic === "mount_fuji") {
    const upper = smooth(1600, 3000, model.height[index]);
    soil = [117 - upper * 27, 111 - upper * 21, 101 - upper * 13];
    mineral = [135 - upper * 44, 137 - upper * 39, 132 - upper * 31];
    plant = [54, 91, 61];
  } else {
    const rain = model.precipitation?.[index];
    const temperature = model.temperature?.[index];
    const dry = Number.isFinite(rain) ? 1 - smooth(300, 1000, rain) : 0;
    const cold = Number.isFinite(temperature) ? 1 - smooth(-3, 8, temperature) : 0;
    soil = soil.map((value, channel) =>
      (value * (1 - dry * 0.65) + DRY_SOIL[channel] * dry * 0.65) * (1 - cold * 0.45) + COLD_SOIL[channel] * cold * 0.45);
    plant = plant.map((value, channel) =>
      (value * (1 - dry) + DRY_PLANT[channel] * dry) * (1 - cold) + COLD_PLANT[channel] * cold);
  }
  // Weathered cover and scree are drawn toward the lithology's own colour, so a granite upland and
  // a clay plain stop sharing one regolith tone.
  const lithologyColor = lithologyTable?.[geomorphology.lithologyCode]?.color || lithologyTable?.[0]?.color || null;
  const cover = unit(geomorphology.regolith ?? 0) + unit(geomorphology.scree ?? 0);
  const regolithTone = lithologyColor && !dedicatedScenic
    ? soil.map((value, channel) => value * 0.72 + lithologyColor[channel] * 0.28)
    : soil;
  const surfaceColor = regolithTone.map((value, channel) => {
    const natural = value * (1 - rock - vegetation) * (0.75 + 0.25 * unit(cover))
      + mineral[channel] * rock + plant[channel] * vegetation;
    return (natural * (1 - sealed) + 136 * sealed) * (1 - wet * 0.18);
  });
  if (scenic === "guilin_lijiang" && model.hydraulics?.channelMask?.[index]) {
    const streamTone = [50, 116, 129];
    return surfaceColor.map((value, channel) => value * 0.42 + streamTone[channel] * 0.58);
  }
  return surfaceColor;
}

// Sample the global heightfield so duplicated boundary vertices share normals.
export function terrainVertexNormal(model, x, y, verticalScale = 1) {
  const n = model.n;
  const left = Math.max(0, x - 1), right = Math.min(n - 1, x + 1);
  const top = Math.max(0, y - 1), bottom = Math.min(n - 1, y + 1);
  const spacing = model.cellSizeKm || model.sizeKm / Math.max(1, n - 1);
  const scale = verticalScale / (1000 * spacing);
  const dx = (model.height[y * n + right] - model.height[y * n + left]) * scale / Math.max(1, right - left);
  const dz = (model.height[bottom * n + x] - model.height[top * n + x]) * scale / Math.max(1, bottom - top);
  const length = Math.hypot(dx, 1, dz);
  return [-dx / length, 1 / length, -dz / length];
}
