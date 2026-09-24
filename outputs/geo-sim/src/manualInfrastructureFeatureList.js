export function manualInfrastructureCoordinatePairs(feature) {
  const pairs = [];
  const visit = (coordinates) => {
    if (!Array.isArray(coordinates)) return;
    if (coordinates.length >= 2 && Number.isFinite(coordinates[0]) && Number.isFinite(coordinates[1])) {
      pairs.push([coordinates[0], coordinates[1]]);
      return;
    }
    coordinates.forEach(visit);
  };
  visit(feature?.geometry?.coordinates);
  return pairs;
}

export function manualInfrastructureFeatureBounds(feature) {
  const pairs = manualInfrastructureCoordinatePairs(feature);
  if (!pairs.length) return null;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pairs) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const inputRadius = Number(feature.properties?.radius_km);
  const radius = feature.geometry?.type === "Point" && Number.isFinite(inputRadius) ? Math.max(0, inputRadius) : 0;
  return {
    x0, x1, y0, y1,
    widthKm: Math.max(x1 - x0, radius * 2),
    heightKm: Math.max(y1 - y0, radius * 2),
    centerXKm: (x0 + x1) / 2,
    centerYKm: (y0 + y1) / 2
  };
}
