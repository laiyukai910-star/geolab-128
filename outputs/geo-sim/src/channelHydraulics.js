// Generated from src-ts/channelHydraulics.ts. Run npm run browser:build to regenerate.
function rectangularDischarge(depthM, widthM, slope, roughness) {
  const area = widthM * depthM;
  const radius = area / (widthM + 2 * depthM);
  return area * Math.pow(radius, 2 / 3) * Math.sqrt(slope) / roughness;
}
function solveRectangularNormalDepth(dischargeM3s, widthM, slope, roughness, maximumDepthM = 1e3) {
  if (![dischargeM3s, widthM, slope, roughness, maximumDepthM].every(Number.isFinite) || dischargeM3s < 0 || widthM <= 0 || slope < 0 || roughness <= 0 || maximumDepthM <= 0) {
    throw new RangeError("Normal-depth inputs must be finite and physically admissible");
  }
  const empty = { depthM: 0, areaM2: 0, hydraulicRadiusM: 0, velocityMps: 0, relativeResidual: 0 };
  if (dischargeM3s === 0) return { ...empty, status: "dry" };
  if (slope === 0) return { ...empty, relativeResidual: 1, status: "zero-slope" };
  let lower = 0;
  let upper = Math.min(maximumDepthM, Math.max(1e-3, 2 * Math.pow(dischargeM3s * roughness / (widthM * Math.sqrt(slope)), 0.6)));
  while (upper < maximumDepthM && rectangularDischarge(upper, widthM, slope, roughness) < dischargeM3s) upper = Math.min(maximumDepthM, upper * 2);
  const limited = rectangularDischarge(upper, widthM, slope, roughness) < dischargeM3s;
  let depth = upper;
  if (!limited) for (let iteration = 0; iteration < 60; iteration++) {
    depth = (lower + upper) * 0.5;
    const capacity = rectangularDischarge(depth, widthM, slope, roughness);
    if (Math.abs(capacity - dischargeM3s) <= dischargeM3s * 1e-9) break;
    if (capacity < dischargeM3s) lower = depth;
    else upper = depth;
  }
  const area = widthM * depth;
  return {
    depthM: depth,
    areaM2: area,
    hydraulicRadiusM: area / (widthM + 2 * depth),
    velocityMps: dischargeM3s / area,
    relativeResidual: Math.abs(rectangularDischarge(depth, widthM, slope, roughness) - dischargeM3s) / dischargeM3s,
    status: limited ? "depth-limit" : "solved"
  };
}
export {
  rectangularDischarge,
  solveRectangularNormalDepth
};
