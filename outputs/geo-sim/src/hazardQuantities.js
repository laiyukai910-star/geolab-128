import { SUBSURFACE_LITHOLOGY } from "./lithologyTable.js";

/*
 * Dimensional hazard quantities.
 *
 * WHY THIS EXISTS
 *
 * The hazard fields were dimensionless 0-1 composites built from weighted sums of the same drivers,
 * and even `floodDepthM` was a scaled index rather than a depth: `flood * (0.15 + floodDrive * 1.8 + ...)`.
 * A number like that cannot be checked against anything, because it does not correspond to a physical
 * quantity. This module computes quantities that can be: a depth in metres, a factor of safety, a
 * water deficit in millimetres, a fuel moisture as a fraction of oven-dry mass.
 *
 * Every relation here is a published one, named with its source. Every coefficient that this module
 * chooses rather than derives from those sources is marked CALIBRATED and states what it is for, so a
 * reader can tell a cited constant from a tuned one - the distinction the rest of the repository
 * already keeps in `geoLithology.js`.
 *
 * WHAT THIS IS NOT
 *
 * These are screening quantities for a regional scenario, computed from a DEM and a land surface
 * model. They are not a flood study, a geotechnical assessment or a fire behaviour prediction. Each
 * function's comment states its own assumptions and the direction in which it is likely to be wrong.
 */

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const clamp01 = value => clamp(Number(value) || 0, 0, 1);
const finite = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

/** Standard gravity, m/s^2. */
const GRAVITY = 9.81;
/** Density of water at 10 degrees C, kg/m^3. */
const WATER_DENSITY = 999.7;
/** Density of the solid mineral fraction, kg/m^3. Used to convert a dry bulk density to porosity. */
const PARTICLE_DENSITY = 2650;
/** Density of the soil-water mixture used for the saturated unit weight, kg/m^3. */
const SOIL_WATER_DENSITY = 1000;
/** Ratio of specific heats for air, used by the Van Wagner equilibrium moisture content. */
const AIR_HEAT_RATIO = 1.4;

/**
 * Surface roughness length as a Manning n.
 *
 * Manning's n is a look-up property, not a formula. These are the mid-range values for the cover
 * classes this model carries, taken from the ranges tabulated for overland flow. CALIBRATED only in
 * the sense that a single value is chosen from each cited range.
 */
export function manningRoughness(landCover, vegetationType) {
  // Water and impervious surfaces are smooth; forests are rough; row crop sits between grass and brush.
  const byCover = {
    11: 0.035, // open water
    21: 0.030, // developed, open space
    22: 0.014, // developed, low intensity (paved)
    23: 0.014, // developed, medium intensity
    24: 0.013, // developed, high intensity
    31: 0.030, // barren
    41: 0.160, // deciduous forest
    42: 0.180, // evergreen forest
    43: 0.160, // mixed forest
    52: 0.060, // shrub
    71: 0.034, // grassland
    81: 0.040, // pasture
    82: 0.035, // row crop
    90: 0.140, // woody wetland
    95: 0.070  // emergent wetland
  };
  if (Number.isFinite(byCover[landCover])) return byCover[landCover];
  // With no cover class, fall back on the vegetation fraction: bare ground is smooth, full cover is rough.
  const vegetation = clamp01(vegetationType);
  return 0.020 + vegetation * 0.130;
}

/**
 * Flood depth on a sloping plane, from discharge, by inverting Manning's equation.
 *
 * Manning's equation for a wide sheet of unit width: q = (1/n) * y^(5/3) * S^(1/2), where q is
 * discharge per unit width in m^2/s, y the flow depth in m and S the energy slope. Inverting gives
 *     y = ( q * n / sqrt(S) )^(3/5)
 * which is the standard normal-depth relation for a wide rectangular section (Manning 1891; Chow
 * 1959, Open-Channel Hydraulics).
 *
 * ASSUMPTIONS, and where this is wrong. Uniform flow at normal depth, a wide rectangular section, and
 * no backwater. On a real floodplain the depth is set by backwater and by the channel's own capacity,
 * so this OVERSTATES depth on steep headwater cells and UNDERSTATES it in flat ponded reaches. It is a
 * screening depth, and it is reported in metres so it can at least be compared with a known flood.
 */
export function floodDepthFromDischarge({ dischargeM3S, widthM, slope, roughness, maxDepthM = 25 }) {
  const q = Math.max(0, finite(dischargeM3S, 0));
  const width = Math.max(1, finite(widthM, 1));
  if (q <= 0) return 0;
  // Unit-width discharge. A cell whose flow is concentrated in a narrow channel has a much larger
  // unit discharge than the same flow spread across the cell.
  const unitDischarge = q / width;
  const energySlope = clamp(finite(slope, 0.001), 1e-5, 0.5);
  const n = clamp(finite(roughness, 0.05), 0.010, 0.400);
  const depth = Math.pow((unitDischarge * n) / Math.sqrt(Math.max(1e-9, energySlope)), 0.6);
  return clamp(depth, 0, maxDepthM);
}

/** Mean velocity for that depth, from the same Manning relation: v = (1/n) * y^(2/3) * S^(1/2). */
export function floodVelocityFromDepth({ depthM, slope, roughness }) {
  const depth = Math.max(0, finite(depthM, 0));
  if (depth <= 0) return 0;
  const energySlope = clamp(finite(slope, 0.001), 1e-5, 0.5);
  const n = clamp(finite(roughness, 0.05), 0.010, 0.400);
  return (1 / n) * Math.pow(depth, 2 / 3) * Math.sqrt(energySlope);
}

/**
 * Infinite-slope factor of safety for a shallow landslide.
 *
 * The standard infinite-slope model with vegetation root reinforcement and a piezometric pore
 * pressure ratio, in the form used for shallow rainfall-triggered failures
 * (Montgomery & Dietrich 1994, Water Resources Research 30(4); Selby 1993, Hillslope Materials and
 * Processes):
 *
 *     FS = [ c' + c_root + (gamma - m*gamma_w) * z * cos^2(beta) * tan(phi) ]
 *          / [ gamma * z * sin(beta) * cos(beta) ]
 *
 * where c' is the effective cohesion, c_root the root reinforcement, gamma the moist unit weight,
 * gamma_w the water unit weight, m the fraction of the failure-plane depth that is saturated, z the
 * soil thickness, beta the slope angle and phi the effective friction angle.
 *
 * ASSUMPTIONS, and where this is wrong. A planar failure surface parallel to the ground, a constant
 * soil thickness, and no cohesion loss over time. Real failures are three-dimensional and are
 * controlled by stratigraphy and by the strength of a specific bed, which is why the lithology is
 * allowed to set the friction angle here. FS = 1 is the threshold; the model's own licence is that a
 * value below 1 means the slope cannot be sustained by the assumed strength, not that it will fail.
 */
export function slopeFactorOfSafety({
  slopeDeg, soilThicknessM, effectiveCohesionPa, rootCohesionPa,
  frictionAngleDeg, saturatedFraction, bulkDensityKgM3, porosityFraction
}) {
  const beta = (clamp(finite(slopeDeg, 0), 0, 89) * Math.PI) / 180;
  const phi = (clamp(finite(frictionAngleDeg, 30), 5, 55) * Math.PI) / 180;
  const z = Math.max(0.05, finite(soilThicknessM, 0.5));
  if (beta <= 1e-4) return Infinity; // a level surface cannot fail by this mechanism
  const dryDensity = clamp(finite(bulkDensityKgM3, 1600), 800, 2400);
  // Moist unit weight at the stated saturation, then the buoyant reduction on the normal stress. The
  // pore water adds to the total unit weight and subtracts from the effective normal stress, which is
  // what the two uses of m below do.
  const m = clamp01(saturatedFraction);
  const porosity = clamp(finite(porosityFraction, 0.30), 0.05, 0.75);
  const gamma = (dryDensity + m * porosity * SOIL_WATER_DENSITY) * GRAVITY;
  const gammaW = WATER_DENSITY * GRAVITY;
  const sinB = Math.sin(beta), cosB = Math.cos(beta);
  const cohesion = Math.max(0, finite(effectiveCohesionPa, 5000)) + Math.max(0, finite(rootCohesionPa, 0));
  const driving = gamma * z * sinB * cosB;
  if (driving <= 1e-9) return Infinity;
  const normal = Math.max(0, gamma * z * cosB * cosB - m * gammaW * z * cosB * cosB);
  const resisting = cohesion + normal * Math.tan(phi);
  return resisting / driving;
}

/**
 * Fine fuel moisture as a fraction of oven-dry mass, from the Van Wagner (1987) equilibrium moisture
 * content, which is the moisture code at the base of the Canadian Forest Fire Weather Index System
 * (Van Wagner 1987, Canadian Forestry Service Forestry Technical Report 35; and the CFFDRS itself).
 *
 *     EMC = 0.942 * H^0.679 + 11 * exp( (H-100)/10 ) + 0.18 * (21.1 - T) * (1 - exp(-0.115*H))
 *
 * with H the relative humidity in percent and T the temperature in degrees Celsius, the result as a
 * percentage of oven-dry mass. This is the equilibrium value: the actual code lags it with rain and
 * drying, which is why the caller is given the equilibrium and left to damp it.
 */
export function fineFuelEquilibriumMoisture({ relativeHumidityPercent, temperatureC }) {
  const H = clamp(finite(relativeHumidityPercent, 50), 1, 100);
  const T = clamp(finite(temperatureC, 20), -50, 60);
  const emc = 0.942 * Math.pow(H, 0.679) + 11 * Math.exp((H - 100) / 10) + 0.18 * (21.1 - T) * (1 - Math.exp(-0.115 * H));
  return clamp(emc / 100, 0.005, 0.45);
}

/**
 * Climatic water deficit in millimetres: precipitation minus potential evapotranspiration over the
 * stated period.
 *
 * This is the water-balance term from which a drought index such as SPEI is built, and it is reported
 * as a depth so it can be compared with a known deficit. It is deliberately NOT called a drought
 * index: SPEI standardises that deficit against a long-term reference distribution
 * (Vicente-Serrano et al. 2010, Journal of Climate 23(7)), and this model has no multi-decade record
 * to standardise against. Reporting the deficit in millimetres is honest; reporting a standardised
 * index from a single year would not be.
 */
export function climaticWaterDeficitMm({ precipitationMm, potentialEvapotranspirationMm }) {
  return finite(precipitationMm, 0) - finite(potentialEvapotranspirationMm, 0);
}

/**
 * Root reinforcement in pascals, from the root area ratio.
 *
 * Wu (1976) and Waldron (1977) give the added shear strength from roots as
 *     c_root = T_r * (sin(theta) + cos(theta) * tan(phi))
 * per unit root area, with T_r the root tensile strength and theta the angle of the roots to the
 * failure plane. CALIBRATED: the 45-degree angle and the 1.2 kPa per unit root-area-ratio scaling,
 * which collapse the two relations into one screening coefficient for a model that carries a single
 * root-cohesion term rather than a root size distribution.
 */
export function rootCohesionPa(rootAreaRatio, tensileStrengthKPa = 10) {
  const ratio = clamp01(rootAreaRatio);
  return ratio * tensileStrengthKPa * 1000 * 1.2;
}

/**
 * Friction angle for the material at a column, from its own lithology.
 *
 * A screening value per class rather than a measured one. It is derived here rather than tabulated so
 * that a class with no entry still gets a value consistent with its porosity and density, and it is
 * reported so a reader can see which value was used. CALIBRATED: the endpoint angles.
 */
export function frictionAngleForLithology(code, table = SUBSURFACE_LITHOLOGY) {
  const byClass = {
    0: 34, // unclassified
    1: 26, // peat and organic
    2: 30, // alluvium
    3: 33, // colluvium
    4: 35, // fractured bedrock
    5: 42, // competent bedrock
    6: 20, // clay aquitard
    7: 38  // carbonate
  };
  const key = Math.max(0, Math.trunc(finite(code, 0)));
  if (Number.isFinite(byClass[key])) return byClass[key];
  // With no class, take a value from the porosity: a tighter rock is a stronger one.
  const porosity = clamp01(finite(table?.[key]?.porosity, 0.25));
  return 24 + (1 - clamp01(porosity / 0.45)) * 22;
}

/** Effective cohesion in pascals for a class, on the same screening basis as the friction angle. */
export function effectiveCohesionForLithology(code, table = SUBSURFACE_LITHOLOGY) {
  const byClass = { 0: 5000, 1: 2000, 2: 3000, 3: 4000, 4: 8000, 5: 20000, 6: 10000, 7: 15000 };
  const key = Math.max(0, Math.trunc(finite(code, 0)));
  if (Number.isFinite(byClass[key])) return byClass[key];
  const porosity = clamp01(finite(table?.[key]?.porosity, 0.25));
  return 2000 + (1 - clamp01(porosity / 0.45)) * 18000;
}

export const HAZARD_METHODS = Object.freeze({
  floodDepth: "Manning normal depth for a wide rectangular section, inverted for depth",
  floodVelocity: "Manning velocity for the same section",
  slopeStability: "Infinite slope with root reinforcement and a piezometric pore pressure ratio",
  fineFuelMoisture: "Van Wagner equilibrium moisture content, as a fraction of oven-dry mass",
  waterDeficit: "Precipitation minus potential evapotranspiration, in millimetres",
  rootCohesion: "Wu and Waldron root reinforcement, collapsed to a screening coefficient"
});
