const FOREST_COVERS = new Set([41, 42, 43]);
const OPEN_COVERS = new Set([52, 71, 81]);
const WETLAND_COVERS = new Set([90, 95]);

function random01(x, z, seed) {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function bilinear(values, n, gx, gz) {
  if (!values) return 0;
  const x0 = Math.floor(gx), z0 = Math.floor(gz);
  const x1 = Math.min(n - 1, x0 + 1), z1 = Math.min(n - 1, z0 + 1);
  const tx = gx - x0, tz = gz - z0;
  const a = values[z0 * n + x0] * (1 - tx) + values[z0 * n + x1] * tx;
  const b = values[z1 * n + x0] * (1 - tx) + values[z1 * n + x1] * tx;
  return a * (1 - tz) + b * tz;
}

// A bounded visual stand around the camera focus; it does not alter modeled biomass or land cover.
export function planLocalVegetationStands(model, centerXKm, centerZKm, options = {}) {
  const n = model?.n || 0;
  const vegetation = model?.surface?.vegetation;
  if (n < 2 || !vegetation) return [];
  const sizeKm = model.sizeKm || model.cellSizeKm * (n - 1);
  const spacingKm = options.spacingKm || 0.04;
  const radiusKm = options.radiusKm || 1.45;
  const budget = Math.max(0, Math.floor(options.budget ?? 2400));
  if (!budget) return [];
  const seed = Number(options.seed) || 0;
  const seaLevel = Number(options.seaLevel) || 0;
  const minX = Math.ceil((centerXKm - radiusKm) / spacingKm);
  const maxX = Math.floor((centerXKm + radiusKm) / spacingKm);
  const minZ = Math.ceil((centerZKm - radiusKm) / spacingKm);
  const maxZ = Math.floor((centerZKm + radiusKm) / spacingKm);
  const result = [];
  for (let z = minZ; z <= maxZ; z++) for (let x = minX; x <= maxX; x++) {
    const wx = (x + (random01(x, z, seed + 17) - 0.5) * 0.76) * spacingKm;
    const wz = (z + (random01(x, z, seed + 19) - 0.5) * 0.76) * spacingKm;
    if ((wx - centerXKm) ** 2 + (wz - centerZKm) ** 2 > radiusKm ** 2) continue;
    const gx = (wx / sizeKm + 0.5) * (n - 1);
    const gz = (wz / sizeKm + 0.5) * (n - 1);
    if (gx < 0 || gz < 0 || gx > n - 1 || gz > n - 1) continue;
    if (bilinear(model.height, n, gx, gz) <= seaLevel) continue;
    const cover = bilinear(vegetation, n, gx, gz);
    if (cover < 0.28) continue;
    const cell = Math.round(gz) * n + Math.round(gx);
    const landCover = model.surface.landCover?.[cell] || 0;
    const vegetationType = model.surface.vegetationType?.[cell] || 0;
    if (landCover === 11 || landCover === 82 || vegetationType === 6
      || model.surface.imperviousFraction?.[cell] > 0.38
      || bilinear(model.slope, n, gx, gz) > 38) continue;
    const canopyM = bilinear(model.surface.canopyHeight, n, gx, gz);
    let kind;
    if (WETLAND_COVERS.has(landCover) || vegetationType === 7) kind = "reed";
    else if (FOREST_COVERS.has(landCover) && canopyM > 4.5) {
      kind = landCover === 42 || vegetationType === 2 ? "conifer" : "broadleaf";
    } else if (OPEN_COVERS.has(landCover) || vegetationType === 5 || vegetationType === 9) kind = "grass";
    else kind = canopyM > 4.5 ? "broadleaf" : "shrub";
    const density = kind === "grass" || kind === "reed" ? 0.78 : kind === "shrub" ? 0.65 : 0.57;
    if (random01(x, z, seed + 23) > cover * density) continue;
    result.push({ x: wx, z: wz, kind, cover, canopyM, landCover,
      variant: Math.floor(random01(x, z, seed + 29) * 3),
      scale: 0.76 + random01(x, z, seed + 31) * 0.48,
      rotation: random01(x, z, seed + 37) * Math.PI * 2,
      priority: random01(x, z, seed + 41) });
  }
  // Select across the whole disc so the budget never cuts a straight boundary through a stand.
  result.sort((a, b) => a.priority - b.priority);
  return result.slice(0, budget).map(({ priority, ...stand }) => stand);
}
