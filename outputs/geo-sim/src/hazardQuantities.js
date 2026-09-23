import { SUBSURFACE_LITHOLOGY } from "./lithologyTable.js";
import { solveRectangularNormalDepth } from "./channelHydraulics.js";

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

/** Seconds in a Julian year. The model's discharge fields are annual volumes, so a rate needs this. */
const SECONDS_PER_YEAR = 365.25 * 24 * 3600;
/** CALIBRATED: the channel design factor and overland factor the engine's own hydraulics already use,
 * restated here so this module converts an annual volume into a design discharge the same way rather
 * than a second, subtly different way. */
const CHANNEL_DESIGN_FACTOR = 2.35;
const OVERLAND_RUNOFF_FACTOR = 0.42;

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
 * Atmospheric water deficit in millimetres: potential evapotranspiration minus precipitation over
 * the stated period. Positive values mark an unmet atmospheric water demand; negative values mark a
 * precipitation surplus. This is a climatic demand-balance proxy, not the USGS ecosystem climatic
 * water deficit (PET minus actual ET), because this function does not model storage depletion here.
 *
 * This annual difference is not a standardized drought index and does not represent soil-water
 * depletion. It uses potential evapotranspiration as a simple atmospheric-demand proxy.
 */
export function climaticWaterDeficitMm({ precipitationMm, potentialEvapotranspirationMm }) {
  return finite(potentialEvapotranspirationMm, 0) - finite(precipitationMm, 0);
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
  waterDeficit: "Potential evapotranspiration minus precipitation, in millimetres; positive means unmet atmospheric demand",
  rootCohesion: "Wu and Waldron root reinforcement, collapsed to a screening coefficient"
});

/**
 * Relative humidity from a vapour pressure deficit, in percent.
 *
 * VPD = e_s(T) * (1 - RH/100), so RH = 100 * (1 - VPD / e_s(T)). The saturation vapour pressure is the
 * Magnus form, e_s = 0.6108 * exp(17.27 T / (T + 237.3)) kPa (Allen et al. 1998, FAO-56, the same
 * relation the model's own evapotranspiration already rests on). CALIBRATED: the clamping band, which
 * keeps the result inside the range a screen-height humidity can occupy.
 */
export function relativeHumidityFromVpd({ temperatureC, vaporPressureDeficitKPa }) {
  const T = clamp(finite(temperatureC, 20), -60, 60);
  const vpd = Math.max(0, finite(vaporPressureDeficitKPa, 0));
  const saturation = 0.6108 * Math.exp((17.27 * T) / (T + 237.3));
  if (!(saturation > 0)) return 50;
  return clamp(100 * (1 - vpd / saturation), 5, 100);
}

/**
 * The dimensional hazard quantities for a whole model.
 *
 * This computes a depth in metres, a velocity in metres per second, a factor of safety, a water
 * deficit in millimetres and a fuel moisture as a fraction of oven-dry mass, cell by cell, from the
 * model's own arrays. It writes nothing: the result is returned, so a caller decides what to publish
 * and the existing fields keep whatever contract they already had.
 *
 * Missing input is treated as absent rather than defaulted into a plausible-looking number. A cell
 * with no discharge gets no flood depth, and a cell with no slope gets no factor of safety, so an
 * empty quantity can be told apart from a real one.
 */
export function computeHazardQuantities(model, options = {}) {
  const n = Math.max(0, Math.trunc(finite(model?.n, 0)));
  const len = n * n;
  const empty = new Float32Array(0);
  if (!len || !model?.height) {
    return {
      cellCount: 0, summary: { method: HAZARD_METHODS, computedCells: 0 },
      floodDepthM: empty, floodVelocityMs: empty, slopeFactorOfSafety: empty,
      waterDeficitMm: empty, fineFuelMoisture: empty, relativeHumidityPercent: empty,
      landslideSusceptibleCells: 0, floodedCells: 0
    };
  }
  const seaLevel = finite(options.seaLevel ?? model.stats?.seaLevel, 0);
  const floodDepthM = new Float32Array(len);
  const floodVelocityMs = new Float32Array(len);
  const factorOfSafety = new Float32Array(len);
  // Which cells actually have a factor of safety. Without this, a cell with no soil keeps the array's
  // initialiser of 0, which reads downstream as "maximally unstable" when it means "not computed" -
  // measured, 416 of 4085 land cells in a default scenario had no soil and were reported as unstable.
  const factorOfSafetyComputed = new Uint8Array(len);
  const waterDeficitMm = new Float32Array(len);
  const fineFuelMoisture = new Float32Array(len);
  const relativeHumidityPercent = new Float32Array(len);
  const lithology = model.subsurface?.lithologyCode;
  const columnCellCount = Math.max(0, Math.trunc(finite(model.subsurface?.columnCellCount, 0)));
  const layerCount = Math.max(0, Math.trunc(finite(model.subsurface?.layerCount, 0)));

  let landslideSusceptibleCells = 0, floodedCells = 0, computedCells = 0;
  for (let index = 0; index < len; index += 1) {
    if (!(Number(model.height[index]) > seaLevel)) continue;
    computedCells += 1;
    // FLOOD DEPTH. `model.discharge` is an ANNUAL RUNOFF VOLUME in cubic metres, not a rate, which
    // is easy to get wrong and produces absurd depths if it is treated as one: the field peaks around
    // 3.6e8 m3 in a default 128 km scenario, and the Amazon is about 2e5 m3/s. The engine's own
    // channel hydraulics divides by the seconds in a year and applies a design factor of 2.35 for a
    // channel, so the same conversion is applied here rather than a second one being invented.
    const annualDischargeM3 = Number(model.discharge?.[index]);
    const isChannel = model.hydraulics?.channelMask?.[index] === 1;
    if (Number.isFinite(annualDischargeM3) && annualDischargeM3 > 0) {
      const meanDischargeM3s = annualDischargeM3 / SECONDS_PER_YEAR;
      const localRunoffM3s = Math.max(0, Number(model.localRunoffAnnualM3?.[index]) / SECONDS_PER_YEAR);
      const designDischargeM3s = isChannel
        ? meanDischargeM3s * CHANNEL_DESIGN_FACTOR
        : Math.max(1e-6, localRunoffM3s * OVERLAND_RUNOFF_FACTOR);
      const channelWidth = Number(model.hydraulics?.channelWidthM?.[index]);
      const widthM = isChannel && Number.isFinite(channelWidth) && channelWidth > 0
        ? channelWidth
        : Math.max(1, finite(model.cellSizeKm, 1) * 1000);
      const slopeRadians = Math.tan((Math.max(0, finite(model.slope?.[index], 0)) * Math.PI) / 180);
      const energySlope = clamp(slopeRadians, 1e-5, 0.35);
      // The same roughness the engine's own channel solver uses, so the two agree on the channel.
      const roughness = clamp(
        0.028 + finite(model.surface?.roughness?.[index], 0.05) * 0.035 +
        clamp01(model.surface?.vegetation?.[index]) * 0.028 +
        Math.min(0.018, finite(model.surface?.leafAreaIndex?.[index], 0) * 0.0025) -
        clamp01(model.surface?.imperviousFraction?.[index]) * 0.006,
        0.022, 0.14);
      // The flow depth at design discharge, from the same normal-depth solver the channel hydraulics
      // use, then the depth ABOVE the bankfull stage is what inundates.
      const design = isChannel
        ? solveRectangularNormalDepth(designDischargeM3s, widthM, energySlope, roughness)
        : null;
      const flowDepthM = design?.depthM ?? Math.pow(
        (designDischargeM3s * roughness) / Math.max(1e-6, widthM * Math.sqrt(energySlope)), 0.6);
      const bankfullM = Math.max(0, finite(model.hydraulics?.channelDepthM?.[index], 0));
      const inundationM = Math.max(0, flowDepthM - bankfullM);
      floodDepthM[index] = clamp(inundationM, 0, 40);
      // Velocity from the same section, so depth and velocity cannot disagree about the discharge.
      floodVelocityMs[index] = design?.velocityMps
        ?? floodVelocityFromDepth({ depthM: flowDepthM, slope: slopeRadians, roughness });
      if (floodDepthM[index] > 0.05) floodedCells += 1;
    }

    // Slope stability, from the column's own material and the model's own soil thickness and roots.
    const soilThickness = Number(model.surface?.rootDepthM?.[index]);
    if (Number.isFinite(soilThickness) && soilThickness > 0 && Number.isFinite(Number(model.slope?.[index]))) {
      const surfaceColumn = index;
      const columnIndex = columnCellCount === len ? surfaceColumn
        : (() => {
            const grid = Math.max(1, Math.trunc(finite(model.subsurface?.gridN, 0)));
            const x = surfaceColumn % n, y = Math.floor(surfaceColumn / n);
            const gx = Math.min(grid - 1, Math.round((x / Math.max(1, n - 1)) * (grid - 1)));
            const gy = Math.min(grid - 1, Math.round((y / Math.max(1, n - 1)) * (grid - 1)));
            return gy * grid + gx;
          })();
      const code = layerCount > 0 && lithology && columnIndex >= 0 && columnIndex < columnCellCount
        ? lithology[columnIndex] : -1;
      const saturation = clamp01(model.subsurface?.groundwaterSaturation?.[columnIndex]);
      const fs = slopeFactorOfSafety({
        slopeDeg: Number(model.slope[index]),
        soilThicknessM: soilThickness,
        effectiveCohesionPa: effectiveCohesionForLithology(code),
        rootCohesionPa: rootCohesionPa(model.surface?.rootCohesion?.[index]),
        frictionAngleDeg: frictionAngleForLithology(code),
        saturatedFraction: saturation,
        bulkDensityKgM3: 1600,
        porosityFraction: 0.32
      });
      // Infinity is a real answer for a level surface but cannot be stored, so it is recorded as the
      // largest representable value rather than as a small number that would read as unstable.
      factorOfSafety[index] = Number.isFinite(fs) ? fs : 999;
      factorOfSafetyComputed[index] = 1;
      if (Number.isFinite(fs) && fs < 1) landslideSusceptibleCells += 1;
    }
    const precipitation = Number(model.precipitation?.[index]);
    const pet = Number(model.surface?.potentialEvapotranspiration?.[index]);
    if (Number.isFinite(precipitation) || Number.isFinite(pet)) {
      waterDeficitMm[index] = climaticWaterDeficitMm({ precipitationMm: precipitation, potentialEvapotranspirationMm: pet });
    }
    const humidity = relativeHumidityFromVpd({
      temperatureC: Number(model.temperature?.[index]),
      vaporPressureDeficitKPa: Number(model.surface?.vaporPressureDeficitKPa?.[index])
    });
    relativeHumidityPercent[index] = humidity;
    // The moisture is damped toward equilibrium rather than set to it: a fine fuel does not reach
    // equilibrium within a day, and the damping is what carries yesterday's rain forward.
    const equilibrium = fineFuelEquilibriumMoisture({ relativeHumidityPercent: humidity, temperatureC: Number(model.temperature?.[index]) });
    const previous = Number(options.previousMoisture?.[index]);
    // CALIBRATED: the 0.35 daily approach to equilibrium.
    fineFuelMoisture[index] = Number.isFinite(previous)
      ? previous + (equilibrium - previous) * 0.35
      : equilibrium;
  }

  const range = array => {
    let low = Infinity, high = -Infinity, finiteCount = 0;
    for (let index = 0; index < array.length; index += 1) {
      const value = array[index];
      if (!Number.isFinite(value)) continue;
      // Zeroes are included, so a range describes the whole field rather than only its active cells.
      if (value < low) low = value;
      if (value > high) high = value;
      finiteCount += 1;
    }
    return finiteCount ? { min: low, max: high } : { min: null, max: null };
  };

  const rangeWhere = (array, mask) => {
    let low = Infinity, high = -Infinity, count = 0;
    for (let index = 0; index < array.length; index += 1) {
      if (!mask[index]) continue;
      const value = array[index];
      if (!Number.isFinite(value)) continue;
      if (value < low) low = value;
      if (value > high) high = value;
      count += 1;
    }
    return count ? { min: low, max: high, cells: count } : { min: null, max: null, cells: 0 };
  };

  return {
    cellCount: len,
    computedCells,
    floodDepthM, floodVelocityMs, factorOfSafety, factorOfSafetyComputed, waterDeficitMm, fineFuelMoisture, relativeHumidityPercent,
    floodedCells, landslideSusceptibleCells,
    units: Object.freeze({
      floodDepthM: "m", floodVelocityMs: "m/s", factorOfSafety: "dimensionless ratio",
      waterDeficitMm: "mm", fineFuelMoisture: "fraction of oven-dry mass", relativeHumidityPercent: "%"
    }),
    summary: {
      method: HAZARD_METHODS,
      computedCells, floodedCells, landslideSusceptibleCells,
      floodDepthM: range(floodDepthM),
      floodVelocityMs: range(floodVelocityMs),
      factorOfSafety: rangeWhere(factorOfSafety, factorOfSafetyComputed),
      factorOfSafetyComputedCells: factorOfSafetyComputed.reduce((sum, flag) => sum + flag, 0),
      waterDeficitMm: range(waterDeficitMm),
      fineFuelMoisture: range(fineFuelMoisture)
    }
  };
}
