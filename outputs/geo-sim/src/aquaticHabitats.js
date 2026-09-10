// Generated from src-ts/aquaticHabitats.ts. Run npm run browser:build to regenerate.
import {
  validateWaterInput,
  WATER_MARINE,
  WATER_RIVER
} from "./wasmAbi.js";
import { WATER_MARINE as WATER_MARINE2 } from "./wasmAbi.js";
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
let waterKernel = null;
let unavailableReason = "Rust water kernel is not initialized in this execution context";
function setAquaticConnectivityKernel(kernel, reason = "Rust water kernel is unavailable") {
  waterKernel = kernel;
  unavailableReason = reason;
}
function aquaticContext(model, params = {}) {
  const started = performance.now();
  const seaLevel = Number(params.seaLevel ?? 0);
  const seaSalinity = Number(params.seaSalinityPSU ?? 35);
  if (!Number.isFinite(seaSalinity)) throw new RangeError("Sea salinity must be finite");
  const segments = model.riverSegments ?? [];
  if (segments.length > model.n * model.n) throw new RangeError("Too many river segments for the water grid");
  const riverNodes = new Uint32Array(segments.length * 2);
  for (let i = 0; i < segments.length; i++) {
    const { from, to } = segments[i];
    for (const index of [from, to]) {
      if (!Number.isInteger(index) || index < 0 || index >= model.height.length) {
        throw new RangeError("River endpoint is outside the water grid");
      }
    }
    riverNodes[i * 2] = from;
    riverNodes[i * 2 + 1] = to;
  }
  const input = { width: model.n, height: model.n, seaLevel, elevation: model.height, riverNodes };
  validateWaterInput(input);
  let flags;
  let backend = "typescript-fallback";
  let fallbackReason = unavailableReason;
  if (waterKernel) {
    try {
      flags = waterKernel(input);
      if (!(flags instanceof Uint8Array) || flags.length !== model.height.length) {
        throw new Error("Rust water kernel returned an invalid cell buffer");
      }
      backend = "rust-wasm";
      fallbackReason = null;
    } catch (error) {
      fallbackReason = error instanceof Error ? error.message : String(error);
      flags = classifyWaterCellsFallback(input);
    }
  } else {
    flags = classifyWaterCellsFallback(input);
  }
  return {
    flags,
    seaLevel,
    seaSalinity: clamp(seaSalinity, 0, 45),
    diagnostics: { backend, fallbackReason, cellCount: flags.length, durationMs: performance.now() - started }
  };
}
function classifyWaterCellsFallback(input) {
  const count = validateWaterInput(input);
  const { width, height, elevation, riverNodes, seaLevel } = input;
  for (const value of elevation) {
    if (!Number.isFinite(value)) throw new RangeError("Water elevations must be finite");
  }
  const flags = new Uint8Array(count);
  for (const index of riverNodes) flags[index] |= WATER_RIVER;
  const queue = new Uint32Array(count);
  let head = 0, tail = 0;
  const visit = (index) => {
    if (!(flags[index] & WATER_MARINE) && elevation[index] < seaLevel) {
      flags[index] |= WATER_MARINE;
      queue[tail++] = index;
    }
  };
  for (let x = 0; x < width; x++) {
    visit(x);
    visit((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    visit(y * width);
    visit(y * width + width - 1);
  }
  while (head < tail) {
    const index = queue[head++], x = index % width;
    if (x) visit(index - 1);
    if (x < width - 1) visit(index + 1);
    if (index >= width) visit(index - width);
    if (index < count - width) visit(index + width);
  }
  return flags;
}
function aquaticSite(model, context, index) {
  if (!Number.isInteger(index) || index < 0 || index >= context.flags.length) return null;
  const bed = model.height[index], isSea = (context.flags[index] & WATER_MARINE) !== 0;
  const river = (context.flags[index] & WATER_RIVER) !== 0 && bed > context.seaLevel;
  if (!isSea && !river) return null;
  const depthM = isSea ? context.seaLevel - bed : Number(model.hydraulics?.channelDepthM?.[index] ?? 0);
  const widthM = isSea ? model.cellSizeKm * 1e3 : Number(model.hydraulics?.channelWidthM?.[index] ?? 0);
  const temperatureC = Number(model.temperature?.[index] ?? 12);
  if (![depthM, widthM, temperatureC, model.cellSizeKm].every(Number.isFinite) || depthM <= 0.08 || widthM <= 0 || model.cellSizeKm <= 0) return null;
  return {
    index,
    environment: isSea ? "marine" : "freshwater",
    depthM,
    widthM,
    bedM: bed,
    waterSurfaceM: bed + depthM,
    salinityPSU: isSea ? context.seaSalinity : 0.3,
    temperatureC,
    areaFraction: isSea ? 1 : clamp(widthM / (model.cellSizeKm * 1e3), 0, 1)
  };
}
function aquaticFit(species, site) {
  if (!site || species.aquaticEnvironment !== site.environment) return 0;
  const [minSalinity, maxSalinity] = species.salinityRange;
  const [minDepth, maxDepth] = species.depthRangeM;
  if (site.salinityPSU < minSalinity || site.salinityPSU > maxSalinity || site.depthM < minDepth || site.depthM > maxDepth) return 0;
  return clamp(1 - Math.abs(site.temperatureC - species.temperature[0]) / species.temperature[1], 0, 1);
}
const profileSeeds = [
  {
    id: "river_trout",
    labelZh: "\u6EAA\u6D41\u9CDF\u9C7C\u578B",
    geometryClass: "fish-trout",
    colorHex: 16777215,
    bodyScale: 0.45,
    adultBodyMassKg: 1.2,
    aquaticEnvironment: "freshwater",
    guild: "aquatic-predator",
    temperature: [12, 12],
    depthRangeM: [0.3, 30],
    salinityRange: [0, 1],
    density: 65,
    growth: 0.22
  },
  {
    id: "river_perch",
    labelZh: "\u6DE1\u6C34\u9C88\u9C7C\u578B",
    geometryClass: "fish-perch",
    colorHex: 16777215,
    bodyScale: 0.4,
    adultBodyMassKg: 0.8,
    aquaticEnvironment: "freshwater",
    guild: "aquatic-predator",
    temperature: [19, 15],
    depthRangeM: [0.3, 40],
    salinityRange: [0, 1],
    density: 70,
    growth: 0.25
  },
  {
    id: "reef_fish",
    labelZh: "\u73CA\u745A\u7901\u9C7C\u578B",
    geometryClass: "fish-reef",
    colorHex: 16777215,
    bodyScale: 0.28,
    adultBodyMassKg: 0.2,
    aquaticEnvironment: "marine",
    guild: "aquatic-omnivore",
    temperature: [26, 8],
    depthRangeM: [0.5, 40],
    salinityRange: [28, 40],
    density: 180,
    growth: 0.28
  },
  {
    id: "coastal_ray",
    labelZh: "\u8FD1\u5CB8\u9CD0\u9C7C\u578B",
    geometryClass: "ray",
    colorHex: 16777215,
    bodyScale: 0.85,
    adultBodyMassKg: 12,
    aquaticEnvironment: "marine",
    guild: "benthic-predator",
    temperature: [22, 14],
    depthRangeM: [1, 150],
    salinityRange: [28, 40],
    density: 4,
    growth: 0.12
  },
  {
    id: "reef_octopus",
    labelZh: "\u7901\u6816\u7AE0\u9C7C\u578B",
    geometryClass: "octopus",
    colorHex: 16777215,
    bodyScale: 0.5,
    adultBodyMassKg: 3,
    aquaticEnvironment: "marine",
    guild: "benthic-predator",
    temperature: [22, 12],
    depthRangeM: [0.8, 100],
    salinityRange: [28, 40],
    density: 12,
    growth: 0.3
  },
  {
    id: "moon_jelly",
    labelZh: "\u94B5\u6C34\u6BCD\u578B",
    geometryClass: "jelly",
    colorHex: 16777215,
    bodyScale: 0.4,
    adultBodyMassKg: 0.4,
    aquaticEnvironment: "marine",
    guild: "plankton-predator",
    temperature: [18, 15],
    depthRangeM: [0.8, 100],
    salinityRange: [15, 40],
    density: 95,
    growth: 0.4
  },
  {
    id: "shore_crab",
    labelZh: "\u8FD1\u5CB8\u87F9\u578B",
    geometryClass: "crab",
    colorHex: 16777215,
    bodyScale: 0.22,
    adultBodyMassKg: 0.15,
    aquaticEnvironment: "marine",
    guild: "benthic-omnivore",
    temperature: [20, 16],
    depthRangeM: [0.1, 50],
    salinityRange: [20, 40],
    density: 130,
    growth: 0.3
  },
  {
    id: "freshwater_mussel",
    labelZh: "\u6DE1\u6C34\u868C\u578B",
    geometryClass: "mussel",
    colorHex: 16777215,
    bodyScale: 0.16,
    adultBodyMassKg: 0.08,
    aquaticEnvironment: "freshwater",
    guild: "filter-feeder",
    temperature: [18, 16],
    depthRangeM: [0.2, 20],
    salinityRange: [0, 0.8],
    density: 250,
    growth: 0.1
  }
];
const AQUATIC_PROFILES = Object.freeze(profileSeeds.map((p) => Object.freeze({
  ...p,
  aquaticAffinity: 1,
  humanTolerance: 0.08,
  movementKmPerDay: p.geometryClass === "mussel" ? 0 : 1.2,
  trophicLevel: p.guild === "filter-feeder" ? 2 : 3,
  profileBasis: "illustrative functional morphotype; not a species distribution or abundance estimate"
})));
export {
  AQUATIC_PROFILES,
  WATER_MARINE2 as WATER_MARINE,
  aquaticContext,
  aquaticFit,
  aquaticSite,
  classifyWaterCellsFallback,
  setAquaticConnectivityKernel
};
