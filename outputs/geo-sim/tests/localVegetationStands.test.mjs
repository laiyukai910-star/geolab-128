import assert from "node:assert/strict";
import { planLocalVegetationStands } from "../src/localVegetationStands.js";

const n = 17;
const cells = n * n;
const model = {
  n, sizeKm: 1.6, cellSizeKm: 0.1,
  height: new Float32Array(cells).fill(120),
  surface: {
    vegetation: new Float32Array(cells).fill(0.95),
    canopyHeight: new Float32Array(cells).fill(16),
    landCover: new Uint8Array(cells).fill(41),
    vegetationType: new Uint8Array(cells).fill(1),
    imperviousFraction: new Float32Array(cells)
  }
};
const options = { seed: 37, radiusKm: 0.5, spacingKm: 0.04, budget: 180, seaLevel: 0 };
const unchanged = structuredClone(model);
const first = planLocalVegetationStands(model, 0, 0, options);
assert.deepEqual(model, unchanged);
assert.ok(first.length > 30 && first.length <= 180);
assert.deepEqual(first, planLocalVegetationStands(model, 0, 0, options));
assert.ok(first.every(item => item.kind === "broadleaf" && Math.hypot(item.x, item.z) <= 0.5));
assert.ok(first.every(item => Math.abs(item.x) <= 0.8 && Math.abs(item.z) <= 0.8));
assert.ok(first.some(item => item.z < -0.2) && first.some(item => item.z > 0.2));
assert.ok(Math.max(...first.map(item => item.patch)) - Math.min(...first.map(item => item.patch)) > 0.3);
assert.ok(first.every(item => item.patch >= 0 && item.patch <= 1));
assert.deepEqual(planLocalVegetationStands(model, 0, 0, { ...options, budget: 0 }), []);

model.surface.landCover.fill(42);
model.surface.vegetationType.fill(2);
assert.ok(planLocalVegetationStands(model, 0, 0, options).every(item => item.kind === "conifer"));
model.surface.landCover.fill(71);
model.surface.vegetationType.fill(5);
assert.ok(planLocalVegetationStands(model, 0, 0, options).every(item => item.kind === "grass"));
model.surface.landCover.fill(90);
model.surface.vegetationType.fill(7);
assert.ok(planLocalVegetationStands(model, 0, 0, options).every(item => item.kind === "reed"));
model.surface.imperviousFraction.fill(0.8);
assert.equal(planLocalVegetationStands(model, 0, 0, options).length, 0);
model.surface.imperviousFraction.fill(0);
model.slope = new Float32Array(cells).fill(48);
assert.equal(planLocalVegetationStands(model, 0, 0, options).length, 0);
model.slope.fill(0);
model.surface.landCover.fill(11);
assert.equal(planLocalVegetationStands(model, 0, 0, options).length, 0);
model.height.fill(-10);
assert.equal(planLocalVegetationStands(model, 0, 0, options).length, 0);
assert.deepEqual(planLocalVegetationStands(null, 0, 0), []);
