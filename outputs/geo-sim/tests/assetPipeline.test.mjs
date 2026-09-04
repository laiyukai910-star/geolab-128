import assert from "node:assert/strict";
import {
  ASSET_PIPELINE_SCHEMA_VERSION,
  assetPipelineDiagnostics,
  block3DRendererFacilityTypes,
  createRenderDetailBudgetPlan,
  proceduralAssetVariantCount,
  proceduralAssetVariantIndex,
  proceduralDetailProfile,
  proceduralMaterialClass,
  proceduralMaterialProfile
} from "../src/assetPipeline.js";

assert.equal(ASSET_PIPELINE_SCHEMA_VERSION, 3);

const high = proceduralDetailProfile("high");
const ultra = proceduralDetailProfile("ultra");
const exhaustive = proceduralDetailProfile("exhaustive");
for (const field of ["radial", "curve", "lobes", "bars", "repetitions", "surfaceSegments", "organicSubdivision", "bevelSegments"]) {
  assert.ok(high[field] < ultra[field], `${field} must increase from high to ultra`);
  assert.ok(ultra[field] < exhaustive[field], `${field} must increase from ultra to exhaustive`);
}

const highBudget = createRenderDetailBudgetPlan({ n: 4096, renderDetailQuality: "high" });
const ultraBudget = createRenderDetailBudgetPlan({ n: 4096, renderDetailQuality: "ultra" });
const exhaustiveBudget = createRenderDetailBudgetPlan({ n: 4096, renderDetailQuality: "exhaustive" });
assert.match(exhaustiveBudget.mode, /typed-adaptive-asset-budget-exhaustive-v3/);
assert.ok(highBudget.terrainDetailStep > ultraBudget.terrainDetailStep);
assert.ok(ultraBudget.terrainDetailStep > exhaustiveBudget.terrainDetailStep);
assert.ok(highBudget.maxVegetationInstances < ultraBudget.maxVegetationInstances);
assert.ok(ultraBudget.maxVegetationInstances < exhaustiveBudget.maxVegetationInstances);
assert.equal(block3DRendererFacilityTypes("exhaustive"), null);
assert.ok(block3DRendererFacilityTypes("ultra").includes("observatory"));

assert.equal(proceduralMaterialClass("broadleaf-canopy"), "organic");
assert.equal(proceduralMaterialClass("wildlife-torso"), "wildlife");
assert.equal(proceduralMaterialClass("rippled-water"), "water");
assert.equal(proceduralMaterialClass("curtain-wall"), "glass");
assert.equal(proceduralMaterialClass("crane-boom"), "metal");
assert.notDeepEqual(proceduralMaterialProfile("rippled-water"), proceduralMaterialProfile("fractured-rock"));
for (const kind of ["fractured-rock", "broadleaf-canopy", "rippled-water", "curtain-wall", "crane-boom", "wildlife-torso"]) {
  const profile = proceduralMaterialProfile(kind);
  for (const value of Object.values(profile).filter((entry) => typeof entry === "number")) {
    assert.ok(value >= 0 && value <= 1.5, `${kind} material value is outside the physical renderer contract`);
  }
}

const variantCount = proceduralAssetVariantCount("broadleaf-canopy", "exhaustive");
assert.equal(variantCount, 5);
assert.equal(proceduralAssetVariantCount("setback-tower", "high"), 2);
const sources = Array.from({ length: 48 }, (_, index) => ({
  x: index * 0.371,
  y: Math.sin(index) * 0.2,
  z: index * -0.193,
  sx: 0.8 + index * 0.01,
  color: 0x4a9056 + index
}));
const firstPass = sources.map((source) => proceduralAssetVariantIndex("broadleaf-canopy", source, variantCount));
const secondPass = sources.map((source) => proceduralAssetVariantIndex("broadleaf-canopy", source, variantCount));
assert.deepEqual(firstPass, secondPass, "variant assignment must be deterministic across terrain rebuilds");
assert.ok(new Set(firstPass).size >= 4, "spatial hashing should distribute a populated asset class across variants");
assert.ok(firstPass.every((variant) => variant >= 0 && variant < variantCount));

const diagnostics = assetPipelineDiagnostics();
assert.equal(diagnostics.implementation, "strict-typescript");
assert.equal(diagnostics.variantPolicy, "deterministic-spatial-multi-template");

console.log(JSON.stringify({
  passed: true,
  schemaVersion: ASSET_PIPELINE_SCHEMA_VERSION,
  exhaustive,
  exhaustiveBudget,
  sampledVariantCount: new Set(firstPass).size,
  materialClasses: diagnostics.materialClasses
}, null, 2));
