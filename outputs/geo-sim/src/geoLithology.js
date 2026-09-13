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
 * competent bedrock or fractured bedrock are treated as cooling units with columnar joints; every
 * other layer is treated as a layered sedimentary or superficial unit.
 */
export function layerStructureSpacingM(lithologyCode, bedThicknessM, depthBelowTopM, lithologyTable) {
  const lithology = lithologyTable?.[lithologyCode] || lithologyTable?.[0] || null;
  const { stiffness } = lithologyMechanicalProperties(lithology);
  const code = lithology?.code || "VOID";
  if (code === "BEDROCK" || code === "FRACTURED") {
    return { style: "columnar", spacingM: columnarJointSpacingM(bedThicknessM, depthBelowTopM), stiffness };
  }
  return { style: "layered", spacingM: jointSpacingM(bedThicknessM, stiffness), stiffness };
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
export function regolithThicknessM({ porosity, meanTemperatureC, precipitationMmYr, slopeDeg, wetnessIndex }) {
  const water = clamp01(Math.log1p(Math.max(0, finite(precipitationMmYr, 0)) / 200) / Math.log1p(12));
  const freezeThaw = clamp01((12 - finite(meanTemperatureC, 10)) / 22);
  const susceptibility = clamp01(0.25 + 0.75 * clamp01(porosity / 0.42));
  const production = 1.2 * (0.25 + 0.75 * water) * (0.35 + 0.65 * freezeThaw) * susceptibility;
  const removal = Math.exp(0.06 * Math.max(0, finite(slopeDeg, 0))) * (1 + 0.35 * clamp01(wetnessIndex / 14));
  return Math.max(0, production / removal);
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
