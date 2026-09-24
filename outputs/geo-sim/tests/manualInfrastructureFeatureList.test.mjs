import assert from "node:assert/strict";
import { manualInfrastructureCoordinatePairs, manualInfrastructureFeatureBounds } from "../src/manualInfrastructureFeatureList.js";

const point = { geometry: { type: "Point", coordinates: [12, 4] }, properties: { radius_km: 0.8 } };
assert.deepEqual(manualInfrastructureFeatureBounds(point), {
  x0: 12, x1: 12, y0: 4, y1: 4,
  widthKm: 1.6, heightKm: 1.6, centerXKm: 12, centerYKm: 4
});

const line = { geometry: { type: "LineString", coordinates: [[2, 5], [8, 7], [9, 6]] }, properties: { radius_km: 10 } };
assert.deepEqual(manualInfrastructureFeatureBounds(line), {
  x0: 2, x1: 9, y0: 5, y1: 7,
  widthKm: 7, heightKm: 2, centerXKm: 5.5, centerYKm: 6
});

const polygon = { geometry: { type: "Polygon", coordinates: [[[3, 2], [7, 2], [7, 6], [3, 6], [3, 2]]] } };
assert.equal(manualInfrastructureCoordinatePairs(polygon).length, 5);
assert.deepEqual(manualInfrastructureFeatureBounds(polygon), {
  x0: 3, x1: 7, y0: 2, y1: 6,
  widthKm: 4, heightKm: 4, centerXKm: 5, centerYKm: 4
});

const multiPolygon = { geometry: { type: "MultiPolygon", coordinates: [
  [[[1, 1], [2, 1], [2, 2]]],
  [[[10, 8], [11, 8], [11, 9]]]
] } };
assert.deepEqual(manualInfrastructureFeatureBounds(multiPolygon), {
  x0: 1, x1: 11, y0: 1, y1: 9,
  widthKm: 10, heightKm: 8, centerXKm: 6, centerYKm: 5
});

assert.equal(manualInfrastructureFeatureBounds({ geometry: { type: "Point", coordinates: [Infinity, 2] } }), null);
assert.equal(manualInfrastructureFeatureBounds({ geometry: { type: "Polygon", coordinates: [] } }), null);
assert.equal(manualInfrastructureFeatureBounds(null), null);

const longLine = { geometry: { type: "LineString", coordinates: Array.from({ length: 100000 }, (_, i) => [i / 1000, i / 2000]) } };
assert.equal(manualInfrastructureFeatureBounds(longLine).x1, 99.999);
console.log("Manual infrastructure coordinate bounds passed");
