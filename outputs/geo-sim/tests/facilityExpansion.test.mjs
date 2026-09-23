import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "three") return nextResolve(new URL("../vendor/three/three.module.js", import.meta.url).href, context);
    if (specifier.startsWith("three/addons/")) {
      return nextResolve(new URL(`../vendor/three/addons/${specifier.slice(13)}`, import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  }
});

const { readLayerObject, mergeLayerBundle } = await import("../src/dataAdapters.js");
const { buildModel, buildInfrastructureSuitabilityMatrix, createDefaultParams, INFRASTRUCTURE_TYPE_CODES } = await import("../src/geoEngine.js");
const { createSemanticAssetGeometry, semanticAssetKind } = await import("../src/proceduralAssets.js");

const cases = [
  ["evacuation_shelter", "应急避难中心", "evacuation-shelter", "emergency-civic", "emergency-shelter-dry-access"],
  ["river_hatchery", "河流育苗设施", "river-hatchery", "river-hatchery", "freshwater-hatchery-protected-intake"]
];
assert.equal(new Set(Object.values(INFRASTRUCTURE_TYPE_CODES)).size, Object.keys(INFRASTRUCTURE_TYPE_CODES).length);
for (const [type, label, kind] of cases) {
  assert.ok(INFRASTRUCTURE_TYPE_CODES[type] > 0);
  assert.equal(semanticAssetKind(label), kind);
  const geometry = createSemanticAssetGeometry(label, "ultra");
  assert.equal(geometry.userData.facilityRebuild.kind, kind);
  geometry.dispose();
}

const input = {
  type: "FeatureCollection",
  bbox: [0, 0, 8, 8],
  features: cases.map(([type], index) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [2 + index * 3, 2 + index * 3] },
    properties: { infrastructure_type: type }
  }))
};
const parsed = readLayerObject(input, "infrastructure", "new-facilities.geojson");
assert.deepEqual(parsed.infrastructure.features.map((feature) => feature.infrastructureType), cases.map(([type]) => type));

const model = buildModel({
  ...createDefaultParams(),
  resolution: 32,
  mapSizeKm: 8,
  wildlifeEnabled: false,
  externalLayers: mergeLayerBundle({}, parsed)
});
for (const [type] of cases) {
  assert.ok(model.infrastructureInfluence.typeCode.includes(INFRASTRUCTURE_TYPE_CODES[type]), `${type} must survive placement`);
}

const matrix = buildInfrastructureSuitabilityMatrix(model, {}, { types: cases.map(([type]) => type), maxRowsPerBlock: 2 });
for (const [type, label, , requirement, adaptation] of cases) {
  const row = matrix.rows.find((candidate) => candidate.facility_type === type);
  assert.ok(row, `${type} must appear in the suitability matrix`);
  assert.equal(row.label_zh, label);
  assert.equal(row.requirement_class, requirement);
  assert.equal(row.adaptation_profile_class, adaptation);
  assert.ok(row.hard_constraint_dimensions.length > 0);
}

console.log("facility expansion: typed placement, suitability and 3D assets passed");
