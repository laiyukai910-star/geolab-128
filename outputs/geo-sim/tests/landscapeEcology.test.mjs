import assert from "node:assert/strict";
import {
  buildEcologicalIntegrityReport,
  buildLandscapeBlockNetwork,
  buildWildlifeState,
  makeEcologicalIntegrityCSV
} from "../src/landscapeEcology.js";
import { buildModel, createDefaultParams } from "../src/geoEngine.js";

const n = 8;
const length = n * n;
const filled = (value) => new Float32Array(length).fill(value);
const flowAccumulation = Float32Array.from({ length }, (_, index) => index + 1);
const model = {
  n,
  sizeKm: 8,
  areaKm2: 64,
  cellSizeKm: 8 / (n - 1),
  height: filled(500),
  slope: filled(8),
  flowAccumulation,
  wetnessIndex: filled(8),
  temperature: filled(15),
  precipitation: filled(600),
  windSpeed: filled(4),
  terrainDiagnostics: { roughness: filled(50) },
  surface: {
    vegetation: filled(0.55),
    canopyHeight: filled(12),
    imperviousFraction: filled(0.02),
    potentialEvapotranspiration: filled(1000),
    actualEvapotranspiration: filled(480),
    waterBalance: filled(120),
    biomassCarbonKgM2: filled(8)
  },
  hazards: {
    currentFloodHazard: filled(0.08),
    currentDroughtStress: filled(0.12),
    currentWildfireRisk: filled(0.09),
    currentLandslideRisk: filled(0.06),
    currentHazardIndex: filled(0.11)
  }
};

const network = buildLandscapeBlockNetwork(model, { seaLevel: 0 }, { gridSize: 4 });
assert.equal(network.schemaVersion, 2);
assert.equal(network.blocks.length, 16);
assert.equal(network.geographicConsistency.mapAreaClosurePct, 100);
assert.equal(network.geographicConsistency.aridityZoneAreaKm2["dry-subhumid"], 64);
assert.ok(network.geographicConsistency.coreHabitatAreaKm2 > 0);
assert.ok(network.geographicConsistency.meanClimateVegetationConsistency > 0.5);
assert.ok(network.blocks.every((block) => block.aridityZone === "dry-subhumid"));

const wildlife = buildWildlifeState({ ...model, landscapeNetwork: network }, {
  continentTemplate: "europe_alpine",
  wildlifeEnabled: true,
  wildlifeAbundance: 1,
  wildlifeMigrationStrength: 0.68,
  wildlifeHabitatSensitivity: 0.72,
  wildlifeMaxAgents: 0,
  wildlifeReleases: [{
    batchId: "regional-mismatch",
    speciesId: "siberian_tiger",
    count: 20,
    targetHabitat: "forest"
  }]
}, network);

assert.equal(wildlife.schemaVersion, 3);
assert.ok(wildlife.populations.some((row) => row.populationEstimate > 0));
assert.ok(wildlife.populations.every((row) => Number.isFinite(row.estimatedBiomassKg)));
assert.ok(wildlife.foodWeb.summary.herbivoreBiomassKg > 0);
assert.ok(Number.isFinite(wildlife.ecologicalIntegrity.summary.integrityIndex));
assert.ok(wildlife.ecologicalIntegrity.biodiversity.hillNumberQ1 >= 1);

const blockedRelease = wildlife.releaseOutcomes.find((row) => row.batchId === "regional-mismatch");
assert.equal(blockedRelease.status, "outside-regional-template");
assert.equal(blockedRelease.survivingCount, 0);
assert.equal(blockedRelease.releaseBlockIds.length, 0);
assert.equal(wildlife.ecologicalIntegrity.translocation.blockedReleaseCount, 1);

const capacityLimitedWildlife = buildWildlifeState({ ...model, landscapeNetwork: network }, {
  continentTemplate: "europe_alpine",
  wildlifeEnabled: true,
  wildlifeAbundance: 1,
  wildlifeMaxAgents: 0,
  wildlifeReleases: [{ batchId: "capacity-limit", speciesId: "red_deer", count: 100000, targetHabitat: "best" }]
}, network);
const capacityLimitedOutcome = capacityLimitedWildlife.releaseOutcomes.find((row) => row.batchId === "capacity-limit");
const redDeerPopulation = capacityLimitedWildlife.populations.find((row) => row.speciesId === "red_deer");
assert.ok(capacityLimitedOutcome.capacityLimited);
assert.ok(capacityLimitedOutcome.survivingCount <= capacityLimitedOutcome.availableCapacityBeforeRelease);
assert.ok(redDeerPopulation.populationEstimate <= redDeerPopulation.carryingCapacity);

const report = buildEcologicalIntegrityReport({ ...model, landscapeNetwork: network, wildlife });
assert.equal(report.type, "geolab-ecological-integrity-report");
assert.equal(report.geographicConsistency.mapAreaClosurePct, 100);
assert.match(report.ecologicalIntegrity.interpretationBoundary, /not a field biodiversity assessment/i);
assert.ok(report.methodReferences.some((row) => row.id === "iucn-conservation-translocation"));

const csv = makeEcologicalIntegrityCSV(report);
assert.match(csv, /^species_id,label_zh,guild,/);
assert.match(csv, /siberian_tiger/);

const fullParams = createDefaultParams();
fullParams.resolution = 128;
fullParams.mapSizeKm = 8;
fullParams.aoi = { ...(fullParams.aoi || {}), sizeKm: 8 };
fullParams.wildlifeMaxAgents = 0;
const fullModel = buildModel(fullParams);
assert.equal(fullModel.areaKm2, 64);
assert.equal(fullModel.cellSupportAreaKm2, 64 / (128 * 128));
assert.equal(fullModel.stats.rasterAreaClosurePct, 100);
assert.equal(fullModel.stats.landscapeNetwork.mapAreaClosurePct, 100);
assert.ok(fullModel.stats.wildlife.trophicResourceSupport > 0 && fullModel.stats.wildlife.trophicResourceSupport < 1);
assert.ok(fullModel.stats.wildlife.ecologicalIntegrityIndex > 0 && fullModel.stats.wildlife.ecologicalIntegrityIndex <= 1);

assert.throws(() => buildEcologicalIntegrityReport({}), /completed landscape and wildlife model/);
assert.throws(() => makeEcologicalIntegrityCSV({}), /ecological integrity report/);

console.log("landscape ecology tests passed");
