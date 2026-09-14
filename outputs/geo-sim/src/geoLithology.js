// Rock-mass properties and geomorphic expression, derived from the model's own lithology table
// rather than from free-standing visual constants.
//
// The relationships encoded here are taken from published rock mechanics, structural geology and
// geomorphology; the calibration constants that map this repository's lithology entries onto those
// relationships are marked CALIBRATED because they were chosen by the author, not measured.
//
// Sources
//   [1] Wu, H., Pollard, D.D. (1995) "An experimental study of the relationship between joint
//       spacing and layer thickness", Journal of Structural Geology 17(6): 887-905; and
//       Bai, T., Pollard, D.D. (1999) International Journal of Fracture 100: L23-L28.
//       -> at fracture saturation, joint spacing is proportional to layer thickness.
//       https://library.rockfracture.com/JointSpacing.html
//   [2] DeGraff, J.M., Aydin, A. (1993) "Effect of thermal regime on growth increment and spacing
//       of contraction joints in basaltic lava", JGR Solid Earth 98(B4): 6411-6430; and
//       Lore, J., Aydin, A., Goodson, K. (2001) JGR Solid Earth 106(B4): 6447-6459.
//       -> columnar joint spacing grows inwards from a cooling boundary and is larger in thicker
//       flows.
//       https://library.rockfracture.com/ColumnarJointSpacing.html
//   [3] Selby, M.J. (1980) "A rock mass strength classification for geomorphic purposes: with
//       tests from Antarctica and New Zealand", Zeitschrift fuer Geomorphologie 24: 31-51.
//       -> slope form is governed by rock mass strength, so stronger rock stands in steeper faces.
//   [4] Narr, W., Suppe, J. (1991) "Joint spacing in sedimentary rocks", Journal of Structural
//       Geology 13(9): 1037-1048.
//   [5] USGS (1983) "Rock property measurements and analysis of selected igneous, sedimentary and
//       metamorphic rocks from worldwide localities", Open-File Report 83-736.
//       https://pubs.usgs.gov/publication/ofr83736
//       -> measured porosity / dry density / permeability ranges per rock class.
//
// Everything produced here is a display derivation. It does not overwrite height, slope, wetness,
// hydrology, subsurface or any other scientific array.

import { SUBSURFACE_LITHOLOGY } from "./lithologyTable.js";

const clamp01 = value => Math.min(1, Math.max(0, Number(value) || 0));
const finite = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);
const lerp = (low, high, t) => low + (high - low) * clamp01(t);

// CALIBRATED: this repository's lithology entries already carry porosity, permeability and dry
// density. Modulus is not one of them, so it is back-calculated from those three.
// A cemented, low-porosity, dense rock is stiff; a loose or highly porous material is not.
export function lithologyMechanicalProperties(lithology) {
  const porosity = clamp01(lithology?.porosity ?? 0.1);
  const permeability = Math.max(0, finite(lithology?.permeabilityMmHr, 0));
  const density = Math.max(0, finite(lithology?.densityKgM3, 2000));
  const cementation = clamp01((density - 1600) / (2700 - 1600));
  const stiffness = clamp01(cementation * (1 - porosity) * (1 - 0.5 * Math.min(1, Math.log1p(permeability) / Math.log1p(28))));
  return { porosity, permeabilityMmHr: permeability, densityKgM3: density, cementation, stiffness };
}

/**
 * Joint spacing in a layered rock mass. [1][4] Joint spacing at fracture saturation scales with
 * layer thickness; the ratio itself rises with rock competence, so a thick competent bed carries
 * widely spaced joints and a thin weak bed is closely fractured.
 * CALIBRATED: the ratio window 0.3x-1.5x of thickness brackets the published experimental range.
 */
export function jointSpacingM(bedThicknessM, stiffness) {
  const thickness = Math.max(0.02, finite(bedThicknessM, 1));
  return thickness * lerp(0.3, 1.5, clamp01(stiffness));
}

/**
 * Characteristic spacing of an unconsolidated material. Loosened cover and sediment are not a
 * jointed rock mass and carry no joint spacing at all; what the surface shows is the scale of the
 * aggregates the material breaks into, which is set by how coarse and how well packed it is.
 * CALIBRATED: the 0.06 m to 0.35 m window brackets the coarse-aggregate end of gravel and till.
 */
export function aggregateSpacingM(permeabilityMmHr, porosity) {
  const permeability = Math.max(0, finite(permeabilityMmHr, 0));
  const coarseness = clamp01(Math.log1p(permeability) / Math.log1p(20));
  const packing = 1 - clamp01(porosity);
  return 0.06 + 0.29 * clamp01(0.55 * coarseness + 0.45 * packing);
}

/**
 * Material class of a lithology: whether it is a jointed rock mass or an unconsolidated material.
 * Only the table's own codes decide this, so a new entry lands on the right side by its code.
 */
export function lithologyMaterialClass(lithology) {
  const code = lithology?.code || "VOID";
  if (code === "SOIL" || code === "REGOLITH" || code === "ALLUVIUM") return "unconsolidated";
  if (code === "BEDROCK" || code === "FRACTURED" || code === "CARBONATE") return "rock";
  return "unclassified";
}

/**
 * Column diameter proxy for columnar joint spacing in a cooling unit. [2] Spacing grows inwards
 * from the cooling boundary; because the model has no cooling history, depth below the unit's own
 * top stands in for distance from that boundary, and thicker units cool more slowly throughout.
 * CALIBRATED: the 0.06 m base and the growth and thickness coefficients.
 */
export function columnarJointSpacingM(unitThicknessM, depthBelowTopM) {
  const thickness = Math.max(0.05, finite(unitThicknessM, 1));
  const depth = Math.max(0, finite(depthBelowTopM, 0));
  return 0.06 + 0.18 * Math.pow(thickness, 0.5) * (1 + 1.6 * Math.min(1, depth / thickness));
}

/**
 * Joint/bedding spacing for one subsurface layer at one column. Layers whose lithology is
 * competent bedrock or fractured bedrock are treated as cooling units with columnar joints; layers
 * of unconsolidated material carry an aggregate scale instead of a joint spacing, because they are
 * not a fractured rock mass; anything else is treated as a layered unit.
 */
export function layerStructureSpacingM(lithologyCode, bedThicknessM, depthBelowTopM, lithologyTable) {
  const lithology = lithologyTable?.[lithologyCode] || lithologyTable?.[0] || null;
  const properties = lithologyMechanicalProperties(lithology);
  const materialClass = lithologyMaterialClass(lithology);
  const code = lithology?.code || "VOID";
  if (materialClass === "unconsolidated") {
    return { style: "granular", materialClass, spacingM: aggregateSpacingM(properties.permeabilityMmHr, properties.porosity), stiffness: properties.stiffness };
  }
  if (code === "BEDROCK" || code === "FRACTURED") {
    return { style: "columnar", materialClass, spacingM: columnarJointSpacingM(bedThicknessM, depthBelowTopM), stiffness: properties.stiffness };
  }
  return { style: "layered", materialClass, spacingM: jointSpacingM(bedThicknessM, properties.stiffness) , stiffness: properties.stiffness };
}

/**
 * Selby-style rock mass resistance. [3] Strength rises with intact material strength and with
 * wider joint spacing, and falls with weathering and with groundwater pressure. Weathering is
 * read from porosity and permeability, which the lithology table already provides.
 * CALIBRATED: the groundwater penalty is scaled by porosity as well as saturation, because pore
 * pressure can only weaken a mass that has pores to pressurise. The penalty is also capped at 15
 * points, the same order as Selby's own groundwater rating.
 */
export function rockMassStrength(lithology, spacingM, wetness) {
  const { stiffness, porosity } = lithologyMechanicalProperties(lithology);
  const intact = 20 + 80 * stiffness;
  const spacingScore = 30 * Math.min(1, Math.log1p(Math.max(0, finite(spacingM, 0))) / Math.log1p(3));
  const weathering = 25 * clamp01(porosity);
  const groundwater = 15 * clamp01(wetness) * clamp01(porosity / 0.35);
  return Math.max(5, Math.min(100, intact + spacingScore - weathering - groundwater));
}

/**
 * Regolith thickness on a hillslope. [3] Weathered cover is produced by weathering and removed by
 * erosion, so it thickens where weathering outpaces removal. Production rises with water
 * availability, with freeze-thaw cycling and with the rock's own susceptibility (porosity); loss
 * rises steeply with slope gradient.
 * CALIBRATED: the 1.2 m production scale and the 0.06-per-degree removal exponent.
 */
/**
 * Thickness of the whole weathered profile above fresh rock: the mobile soil layer plus the
 * saprolite beneath it. This is what a regolith or sediment thickness dataset reports, and it is
 * the quantity the landform classification and the cave and surface derivations are asking about.
 * Use `soilThicknessM` where the question is specifically how much soil vegetation can hold.
 */
export function regolithThicknessM(profile) {
  return soilThicknessM(profile) + saproliteThicknessM(profile);
}

/** Slope- and drainage-driven removal, shared by the soil and saprolite production terms. */
function removalRate(profile) {
  const slope = Math.max(0, finite(profile?.slopeDeg, 0));
  return Math.exp(0.06 * slope) * (1 + 0.35 * clamp01(finite(profile?.wetnessIndex, 0) / 14));
}

/**
 * Thickness of the mobile soil layer alone. Soil is the part that bioturbation, illuviation and
 * colluvial mixing keep churning; below it the profile is saprolite, which is still weathered rock
 * and is what holds the landscape's water and lets roots, and in carbonate dissolution, reach down.
 *
 * The two are genuinely different quantities and were being conflated. The soil layer is thin even
 * on stable humid ground, while a weathering profile in the humid tropics reaches tens of metres,
 * which is why the single previous number was wrong by orders of magnitude for the deep profile and
 * about right for the soil. Source [5]: Nesbitt, H.W., Young, G.M. (1982), "Early Proterozoic
 * climates and plate motions inferred from major element chemistry of lutites", Nature 299: 715-717,
 * doi:10.1038/299715a0, for the chemically weathered profile whose A-CN-K trend this follows.
 */
export function soilThicknessM(profile) {
  const water = clamp01(Math.log1p(Math.max(0, finite(profile?.precipitationMmYr, 0)) / 200) / Math.log1p(12));
  const freezeThaw = clamp01((12 - finite(profile?.meanTemperatureC, 10)) / 22);
  const susceptibility = clamp01(0.25 + 0.75 * clamp01(finite(profile?.porosity, 0.1) / 0.42));
  const production = SOIL_PRODUCTION_SCALE_M * (0.25 + 0.75 * water) * (0.35 + 0.65 * freezeThaw) * susceptibility;
  const removal = removalRate(profile);
  return Math.min(SOIL_DEPTH_CAP_M, Math.max(0, production / removal));
}

/**
 * Thickness of the saprolite beneath the soil: weathered rock that has lost its fabric but has not
 * been mobilised. It grows where weathering outpaces removal, so it is deep on stable humid ground
 * and thin or absent on steep eroding ground. Sources [5] above for the profile, and
 * `regolithThicknessM` for the removal term.
 */
export function saproliteThicknessM(profile) {
  const water = clamp01(Math.log1p(Math.max(0, finite(profile?.precipitationMmYr, 0)) / 200) / Math.log1p(12));
  const freezeThaw = clamp01((12 - finite(profile?.meanTemperatureC, 10)) / 22);
  const susceptibility = clamp01(0.25 + 0.75 * clamp01(finite(profile?.porosity, 0.1) / 0.42));
  const production = SAPROLITE_PRODUCTION_SCALE_M * (0.25 + 0.75 * water) * (0.35 + 0.65 * freezeThaw) * susceptibility;
  return Math.max(0, production / removalRate(profile));
}

/** Hillslope form implied by rock mass strength and cover. [3] */
export function landformClass({ rockMassStrengthValue, regolithM, slopeDeg }) {
  const slope = Math.max(0, finite(slopeDeg, 0));
  if (regolithM >= 0.35 && slope < 25) return "regolith-mantled";
  if (rockMassStrengthValue >= 70 && slope >= 40) return "cliff";
  if (rockMassStrengthValue >= 55 && slope >= 25) return "steep-rock-slope";
  if (slope >= 32) return "talus-fed-slope";
  return "soil-mantled";
}

// ---------------------------------------------------------------- display colour derivation
//
// The lithology table is the single statement of a material's appearance as well as its
// petrophysics. Its `color` entries are sRGB bytes, because sRGB is the space a material tone is
// chosen in; the renderers work in linear-sRGB, and three.js reaches that space from a hex literal
// through exactly the transfer function below. Deriving it here keeps the colours in the table
// instead of restating them as a second, drifting list of hex constants in whatever draws them.

/** IEC 61966-2-1 sRGB electro-optical transfer function: a byte in [0,255] to linear-sRGB. */
function srgbByteToLinear(byte) {
  const channel = Math.min(1, Math.max(0, finite(Number(byte), 0) / 255));
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
}

/** Inverse of the above: linear-sRGB in [0,1] back to an sRGB byte. */
export function linearToSrgbByte(value) {
  const channel = Math.min(1, Math.max(0, finite(value, 0)));
  const encoded = channel <= 0.0031308 ? channel * 12.92 : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
  return Math.round(encoded * 255);
}

// The entry a derivation falls back to when it is handed no entry at all. Code 0 is the model's own
// "unresolved" material, and its tone is what the subsurface renderers already used for a voxel
// whose code is not in the table.
function fallbackLithology(lithologyTable) {
  const table = lithologyTable || SUBSURFACE_LITHOLOGY;
  return table?.[0] || SUBSURFACE_LITHOLOGY[0];
}

/**
 * Display colour of one lithology entry, in linear-sRGB floats — the form a renderer has to place
 * in a vertex buffer. The reverse conversion, `lithologyDisplayColorBytes`, recovers table units.
 */
export function lithologyDisplayColor(lithology) {
  const color = lithology?.color;
  if (!color || color.length < 3) return lithologyDisplayColor(fallbackLithology(null));
  return [srgbByteToLinear(color[0]), srgbByteToLinear(color[1]), srgbByteToLinear(color[2])];
}

/** The same colour expressed back in the table's own sRGB byte units. */
export function lithologyDisplayColorBytes(lithology) {
  return lithologyDisplayColor(lithology).map(linearToSrgbByte);
}

// The unclassified closure of the display solid is not a modeled material and has no lithology
// entry, so its tone has to be stated here. CALIBRATED: a neutral grey, in the same sRGB byte units
// as the table, kept just inside the range spanned by the FRACTURED and BEDROCK entries.
const UNCLASSIFIED_SRGB = Object.freeze([114, 120, 126]);

/** Display colour, linear-sRGB, of the unclassified closure of the display solid. */
export function unclassifiedDisplayColor() {
  return UNCLASSIFIED_SRGB.map(srgbByteToLinear);
}

/**
 * The dark tone damp rock is drawn toward as groundwater saturation rises. It is derived from the
 * AQUITARD entry — the table's own fine-grained, water-retaining material — so the wet tone is
 * still a material statement rather than a free-standing hex constant.
 * CALIBRATED: WET_ROCK_DARKENING and WET_ROCK_NEUTRALISE. Water held in pore space darkens and
 * desaturates what is seen, so the fine-grained tone is scaled down and pulled toward its own grey.
 * The factors were chosen by the author to keep the rendered wet tone in the range it already had.
 */
const WET_ROCK_DARKENING = 0.62;
const WET_ROCK_NEUTRALISE = 0.25;

export function wetRockDisplayColor(lithologyTable) {
  const table = lithologyTable || SUBSURFACE_LITHOLOGY;
  const [r, g, b] = lithologyDisplayColor(table?.[6] || fallbackLithology(table));
  const grey = (r + g + b) / 3;
  return [r, g, b].map(channel => (channel + (grey - channel) * WET_ROCK_NEUTRALISE) * WET_ROCK_DARKENING);
}

// ---------------------------------------------------------------- karst (dissolution) host
//
// Whether a bed can host karst is a statement about its material, and this model states its
// materials only through this table's petrophysical fields, so the assessment is derived from those
// fields alone and invents no rock classification of its own.
//
// [5] The measured property ranges for these material classes separate a soluble carbonate host
// from a silicate one in two ways at once: a carbonate host carries its pore space as mouldic,
// vuggy or intergranular porosity rather than as a tight crystalline fabric, so it is both more
// porous and less dense than a quartz-framework rock of the same class. Dry density carries a
// physical scale: quartz and framework silicates sit at about 2650 kg/m3, and although calcite and
// dolomite are denser as minerals, they build rocks of lower bulk density because their pore space
// is not filled by silicate cement. Both fields must therefore agree before a bed is called a host,
// which is why code 5 BEDROCK (porosity 0.04, density 2650) cannot reach the threshold on either
// term, and comes out clearly non-karstic.

/**
 * CALIBRATED: the solubility window. A host carries more than MIN_HOST_POROSITY of pore space while
 * its bulk density falls below DENSITY_HOST_FRACTION of DENSITY_BASELINE_KG_M3, the density of a
 * quartz-framework rock. The density term reaches zero at the baseline, so any entry denser than a
 * quartz rock is unsoluble under this table whatever its porosity, and the porosity term reaches
 * zero at MIN_HOST_POROSITY, so a tight fabric cannot be carried by its density alone. The window is
 * placed between the table's own non-carbonate entries and a dolomite-like one; the tests pin both.
 * CALIBRATED: PERMEABILITY_HOST_MM_HR and PERMEABILITY_WEIGHT. Karst needs moving water as well as
 * soluble rock, and the table states mobility as permeability. The term is a mild modifier rather
 * than a gate, so a tight but genuinely soluble bed still scores; above PERMEABILITY_HOST_MM_HR the
 * modifier has reached its ceiling and stops separating materials.
 * CALIBRATED: KARST_HOST_THRESHOLD. The score at which the two petrophysical terms together are read
 * as a plausible host. Measured on this table it separates the two groups rather than sitting inside
 * either: the highest-scoring entry that is not a soluble-host candidate is FRACTURED at 0.63, and
 * the soluble reference the tests use — a limestone-like entry of 18 percent porosity, 2450 kg/m3
 * and 12 mm/h, which is where a karst host is expected to sit — scores 0.75. The threshold is placed
 * between them.
 */
const MIN_HOST_POROSITY = 0.06;
const DENSITY_BASELINE_KG_M3 = 2650;
const DENSITY_HOST_FRACTION = 0.9;
const PERMEABILITY_HOST_MM_HR = 14;
const PERMEABILITY_WEIGHT = 0.08;
export const KARST_HOST_THRESHOLD = 0.7;
// CALIBRATED: the mobile soil layer is thin even on stable humid ground, so its production term is
// capped well below a metre of pure production.
const SOIL_PRODUCTION_SCALE_M = 1.2;
const SOIL_DEPTH_CAP_M = 1.5;
// CALIBRATED: the weathered profile beneath the soil reaches tens of metres in the humid tropics and
// is thin or absent where erosion keeps pace with weathering. [5]
const SAPROLITE_PRODUCTION_SCALE_M = 55;

/**
 * Whether one lithology entry is a soluble carbonate host, and how good a karst host it is.
 *
 * Solubility is a mineralogy fact, not a pore-space one. An earlier version of this scored only
 * porosity and bulk density, which ranked clay above limestone and made the call meaningless: it
 * was measuring how porous and light a material is, and answered a different question. The class is
 * therefore decided first, from the table's own code, and only carbonates can be hosts. The score
 * then says how favourable such a host is, which does depend on its pore structure, so it is still
 * built from the table's porosity, dry density and permeability.
 *
 * Only carbonate codes score above zero; everything else is exactly zero with `isCarbonate` false.
 * The carbonate class itself carries the provenance of the global lithology model it comes from,
 * see lithologyTable.js.
 */
export function karstHostScore(lithology) {
  const properties = lithologyMechanicalProperties(lithology);
  if (!isCarbonateLithology(lithology)) return 0;
  const porosityTerm = clamp01((properties.porosity - MIN_HOST_POROSITY) / (0.22 - MIN_HOST_POROSITY));
  const densityTerm = clamp01((DENSITY_BASELINE_KG_M3 - properties.densityKgM3)
    / (DENSITY_BASELINE_KG_M3 * (1 - DENSITY_HOST_FRACTION)));
  const mobilityTerm = clamp01(Math.log1p(properties.permeabilityMmHr) / Math.log1p(PERMEABILITY_HOST_MM_HR));
  return clamp01(0.8 + 0.2 * (0.5 * porosityTerm + 0.5 * densityTerm) - PERMEABILITY_WEIGHT * (1 - mobilityTerm));
}

/** The table's soluble class. This is the mineralogy test, not a property threshold. */
export function isCarbonateLithology(lithology) {
  return (lithology?.code || "VOID") === "CARBONATE";
}

/** Whether one lithology entry is a soluble karst host, with the terms behind the call. */
export function karstHostAssessment(lithology) {
  const properties = lithologyMechanicalProperties(lithology);
  const score = karstHostScore(lithology);
  const carbonate = isCarbonateLithology(lithology);
  return {
    isHost: carbonate && score >= KARST_HOST_THRESHOLD,
    isCarbonate: carbonate,
    score,
    threshold: KARST_HOST_THRESHOLD,
    code: lithology?.code || "VOID",
    porosity: properties.porosity,
    densityKgM3: properties.densityKgM3
  };
}

// ---------------------------------------------------------------- column stratigraphy

/**
 * Stratigraphic profile of ONE subsurface column, read from the model.
 *
 * `column` is the subsurface column index — `row * gridN + column`, the index geoEngine.js itself
 * uses when it exports a column, and the one the subsurface renderers derive from a surface cell.
 * The voxel of a layer is `layer * columnCellCount + column`.
 *
 * The model is only read; no array, and no entry in the lithology table, is written or reordered.
 * The shape of the result never varies with the input, so a caller may iterate `layers` and read
 * `karst.isHost` without a guard even when the model has no subsurface at all.
 */
export function stratigraphicProfile(model, column, options = {}) {
  const table = options.lithologyTable || SUBSURFACE_LITHOLOGY;
  const volume = model?.subsurface;
  const raw = Number(column);
  const columnIndex = Number.isFinite(raw) ? Math.trunc(raw) : -1;
  const layerCount = Math.max(0, Math.trunc(finite(volume?.layerCount, 0)));
  const grid = Math.max(1, Math.trunc(finite(volume?.gridN, 0))
    || Math.round(Math.sqrt(Math.max(1, finite(volume?.columnCellCount, 1)))));
  // A volume that states no cell count at all is read from its grid; a volume that states zero has
  // no cells, which is not the same thing and must not fall back to a square grid.
  const columnCellCount = Number.isFinite(Number(volume?.columnCellCount)) && volume.columnCellCount !== null
    ? Math.max(0, Math.trunc(Number(volume.columnCellCount))) : grid * grid;
  const lithologyCode = volume?.lithologyCode || null;
  const usableColumn = columnIndex >= 0 && columnIndex < columnCellCount;
  const wetness = clamp01(options.wetness);
  // The model's own depth edges are the layer geometry; they are only guarded against a
  // non-monotonic or non-finite array, never redefined here.
  const rawEdges = Array.from(volume?.depthEdgesM || [0], value => Math.max(0, finite(Number(value), 0)));
  const depthEdgesM = rawEdges.map((value, index) => (index === 0 ? value : Math.max(value, rawEdges[index - 1])));
  const layerLimit = Math.max(0, Math.min(layerCount, Math.max(0, depthEdgesM.length - 1)));
  const layers = [];
  let scoreSum = 0, scoredThicknessM = 0, columnThicknessM = 0;
  for (let layer = 0; layer < layerLimit; layer += 1) {
    const topDepthM = depthEdgesM[layer], bottomDepthM = depthEdgesM[layer + 1];
    const thicknessM = Math.max(0, bottomDepthM - topDepthM);
    const voxelIndex = usableColumn && lithologyCode ? layer * columnCellCount + columnIndex : -1;
    const code = voxelIndex >= 0 ? Math.max(0, Math.trunc(finite(lithologyCode[voxelIndex], 0))) : 0;
    const lithology = table?.[code] || table?.[0] || null;
    const structure = layerStructureSpacingM(code, thicknessM, topDepthM, table) || {};
    const jointSpacingM = Math.max(0, finite(structure.spacingM, 0));
    const strength = rockMassStrength(lithology, jointSpacingM, wetness);
    const host = karstHostAssessment(lithology);
    scoreSum += host.score * thicknessM;
    scoredThicknessM += thicknessM;
    columnThicknessM += thicknessM;
    layers.push({
      layer, voxelIndex, topDepthM, bottomDepthM, thicknessM,
      lithologyCode: code, lithologyName: lithology?.name ?? null, lithologyClass: lithology?.code || "VOID",
      style: structure.style || "layered", jointStyle: structure.style || "layered",
      jointSpacingM, stiffness: finite(structure.stiffness, 0), rockMassStrength: strength,
      karstHostScore: host.score, karstHost: host.isHost
    });
  }
  const hostLayers = layers.filter(entry => entry.karstHost);
  // The primary host is the highest-scoring layer that actually passed the threshold — never a
  // layer that merely scored above zero, which would let a non-host be reported as the host.
  const candidates = [...hostLayers].sort((a, b) =>
    b.karstHostScore - a.karstHostScore || b.thicknessM - a.thicknessM || a.layer - b.layer);
  return {
    columnIndex: usableColumn ? columnIndex : -1,
    grid,
    layerCount: layers.length,
    depthEdgesM,
    layers,
    karst: {
      isHost: hostLayers.length > 0,
      hostLayerCount: hostLayers.length,
      hostThicknessM: hostLayers.reduce((sum, entry) => sum + entry.thicknessM, 0),
      columnThicknessM,
      score: scoredThicknessM > 0 ? scoreSum / scoredThicknessM : 0,
      threshold: KARST_HOST_THRESHOLD,
      primaryHostLayer: candidates.length ? candidates[0].layer : null,
      primaryHostLithology: candidates.length ? candidates[0].lithologyClass : null
    }
  };
}

/**
 * Whether ONE subsurface column is a plausible karst host, from the thickness-weighted sum of its
 * layers' petrophysical host scores. A thin soluble bed inside a thick quartz-framework sequence
 * therefore does not carry the whole column.
 *
 * Note on what this can currently say: none of the table's seven entries is a carbonate rock, so on
 * the stock table the call separates "a soluble-looking host is present at this column" from "this
 * column is quartz-framework rock or finer-grained cover". It becomes a carbonate-specific call as
 * soon as an imported borehole maps a limestone or dolomite entry onto the table, which is the case
 * the tests pin.
 */
export function columnKarstHost(model, column, options = {}) {
  const profile = stratigraphicProfile(model, column, options);
  return { isHost: profile.karst.isHost, score: profile.karst.score, ...profile.karst };
}

/**
 * Passage skeleton for an illustrative cave, anchored to a real stratigraphic column.
 *
 * Cave passages are not free shapes: dissolution follows bedding planes and joints and stays inside
 * the soluble unit that hosts it. This builds the network from the profile's own layer boundaries,
 * so a cave in a thick host spans that host and a cave in a thin one cannot. Source [6]: Palmer,
 * A.N., "Cave Geology", Cave Books, 2007, for bedding-plane and joint control on passage growth.
 *
 * Positions are returned in the normalised cube the cave display already uses: x and z in
 * [-1,1] across the plan, y in [-1,1] from the top of the modelled column to its base. This is
 * illustrative geometry. It does not infer a cave from geological observations and changes no
 * groundwater calculation.
 */
export function cavePassagePlan(profile, options = {}) {
  const layers = Array.isArray(profile?.layers) ? profile.layers : [];
  const depthEdges = Array.isArray(profile?.depthEdgesM) ? profile.depthEdgesM : [];
  const hosts = layers.filter(layer => layer.karstHost && layer.thicknessM > 0);
  if (!hosts.length || depthEdges.length < 2) return null;

  const totalDepthM = Math.max(0.001, finite(depthEdges[depthEdges.length - 1], 1));
  const hostTop = Math.min(...hosts.map(layer => layer.topDepthM));
  const hostBottom = Math.max(...hosts.map(layer => layer.bottomDepthM));
  const hostThicknessM = Math.max(0.001, hostBottom - hostTop);
  const jointSpacingM = Math.max(0.05, finite(options.jointSpacingM, hosts[0].jointSpacingM));
  // Wider jointing means less frequent, larger conduits, so the network reaches further.
  const halfSpan = 0.5 + 0.32 * clamp01(Math.log1p(jointSpacingM) / Math.log1p(8));
  const toY = depthM => (depthM / totalDepthM) * 2 - 1;

  const passages = [];
  for (const [bed, layer] of hosts.entries()) {
    // A passage follows the contact near the top of its own bed rather than a shared depth.
    const contactDepthM = Math.min(layer.bottomDepthM - layer.thicknessM * 0.3, layer.topDepthM + layer.thicknessM * 0.65);
    const y = toY(contactDepthM);
    const drift = ((bed % 3) - 1) * 0.10;
    passages.push({ from: [-halfSpan, y, drift - 0.16], to: [halfSpan, y, drift + 0.16], radius: 0.11 });
    passages.push({ from: [-halfSpan * 0.6, y, drift + 0.30], to: [halfSpan * 0.55, y, drift - 0.30], radius: 0.09 });
  }
  // A vadose shaft down from the top contact, and a phreatic outlet along the base of the host.
  const topY = toY(hostTop), bottomY = toY(hostBottom);
  passages.push({ from: [-0.34, topY, 0.42], to: [-0.30, bottomY + (topY - bottomY) * 0.25, 0.20], radius: 0.085 });
  passages.push({ from: [-0.62, bottomY, 0.10], to: [0.62, bottomY, -0.06], radius: 0.13 });

  const radiusScale = 0.75 + 0.5 * clamp01(hostThicknessM / 40);
  // The wall of a karst cavity is the host rock itself. Carrying its display tone and the thickness
  // its beds are drawn at lets the cave render as that rock rather than one fixed ochre.
  const primaryHost = [...hosts].sort((a, b) => b.karstHostScore - a.karstHostScore
    || b.thicknessM - a.thicknessM || a.layer - b.layer)[0];
  return {
    method: "illustrative karst scenario anchored to bedding contacts",
    hostLayerCount: hosts.length,
    hostThicknessM,
    totalDepthM,
    jointSpacingM,
    hostLithologyCode: primaryHost.lithologyCode,
    hostLithologyName: primaryHost.lithologyName,
    hostColor: options.lithologyTable?.[primaryHost.lithologyCode]?.color
      || (options.lithologyTable || SUBSURFACE_LITHOLOGY)?.[primaryHost.lithologyCode]?.color
      || null,
    hostBedThicknessM: Math.max(0.05, primaryHost.thicknessM),
    passages: passages.map(passage => ({ ...passage, radius: passage.radius * radiusScale }))
  };
}
