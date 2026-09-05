const unit = value => Math.min(1, Math.max(0, Number(value) || 0));
const smooth = (low, high, value) => {
  const t = unit((value - low) / (high - low));
  return t * t * (3 - 2 * t);
};

// Visual proxies only: wetness index is not measured soil moisture or lithology.
export function terrainSurfaceWeights(model, params, index) {
  if (model.height[index] <= (Number(params?.seaLevel) || 0)) return [0, 0, 0, 0];
  const cover = unit(model.surface?.vegetation?.[index]);
  const sealed = unit(model.surface?.imperviousFraction?.[index]);
  const rock = smooth(18, 58, model.slope?.[index]) * (1 - cover * 0.45) * (1 - sealed);
  const vegetation = cover * (1 - rock) * (1 - sealed);
  return [rock, vegetation, smooth(4, 14, model.wetnessIndex?.[index]), sealed];
}

export function naturalTerrainColor(model, params, index, weights = null) {
  if (model.height[index] <= (Number(params?.seaLevel) || 0)) return [142, 151, 132];
  const [rock, vegetation, wet, sealed] = weights || terrainSurfaceWeights(model, params, index);
  const soil = [139, 121, 93];
  const mineral = [147, 151, 146];
  const plant = [65, 108, 54];
  return soil.map((value, channel) => {
    const natural = value * (1 - rock - vegetation) + mineral[channel] * rock + plant[channel] * vegetation;
    return (natural * (1 - sealed) + 136 * sealed) * (1 - wet * 0.18);
  });
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
