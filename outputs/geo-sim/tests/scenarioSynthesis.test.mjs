import assert from "node:assert/strict";
import { buildScenarioSynthesis, makeScenarioSynthesisMarkdown } from "../src/scenarioSynthesis.js";

const model = {
  sizeKm: 128,
  areaKm2: 16384,
  n: 256,
  cellSizeKm: 128 / 255,
  height: new Float32Array(4),
  stats: {
    meanElevation: 860,
    maxElevation: 3220,
    meanSlope: 14.2,
    meanRoughness: 46,
    meanPrecipitation: 1180,
    meanTemperature: 12.4,
    meanWindSpeed: 5.6,
    meanRunoffCoefficient: 0.36,
    meanActualEvapotranspiration: 620,
    meanVegetation: 0.61,
    meanLeafAreaIndex: 3.2,
    flowRouting: "dinf",
    mainChannelLengthKm: 92,
    riverSegmentCount: 12,
    waterBudget: { residualPctOfInput: 8.2 },
    hydraulicDiagnostics: { highErosionAreaKm2: 18 },
    landscapeNetwork: { blockCount: 64, meanConnectivity: 0.58 },
    wildlife: { speciesCount: 18, activeSpeciesCount: 11, migrationLinkCount: 23 },
    subsurface: {
      layerCount: 8,
      depthM: 240,
      meanWaterTableDepthM: 18,
      meanAquiferPotential: 0.54,
      meanEngineeringRisk: 0.28,
      meanVoxelObservedSupport: 0.22
    },
    hazards: { currentYear: 12, years: 40, mode: "compound", meanCurrentCompositeHazard: 0.31 },
    dataConfidence: {
      meanObservedSupport: 0.44,
      domainFractions: { dem: 0.9, meteorology: 0.6, flowlines: 0.35, landcover: 0.72, vegetation: 0.68, subsurface: 0.22 }
    },
    dataReadiness: { scorePct: 54, class: "exploratory-with-observed-constraints" },
    calibration: { advisor: { status: "not-calibrated" } },
    externalSourceCount: 5
  }
};

const report = buildScenarioSynthesis(model, { simulationYears: 40 }, {
  title: "Mountain watershed teaching case",
  purpose: "systems_learning",
  generatedAt: "2026-08-13T00:00:00.000Z"
});

assert.equal(report.type, "geolab-scenario-synthesis");
assert.equal(report.domains.length, 8);
assert.equal(report.identity.title, "Mountain watershed teaching case");
assert.equal(report.identity.domain.areaKm2, 16384);
assert.ok(report.overview.coverageScorePct > 70);
assert.ok(report.overview.evidenceScorePct > 0 && report.overview.evidenceScorePct < 100);
assert.equal(report.domains.find((item) => item.id === "evidence").evidencePct, 54);
assert.equal(report.domains.find((item) => item.id === "hydrology").evidencePct, 35);
assert.equal(report.domains.find((item) => item.id === "evidence").metrics.readinessScorePct, 54);
assert.ok(report.couplings.some((item) => item.id === "terrain-water"));
assert.ok(report.priorities.some((item) => item.id === "flow-calibration"));
assert.ok(report.priorities.some((item) => item.id === "systems-learning"));
assert.match(report.maturity.boundary.en, /not forecast accuracy/i);

const interventionReport = buildScenarioSynthesis({
  ...model,
  stats: {
    ...model.stats,
    externalInfrastructure: { featureCount: 4, affectedCellCount: 12, meanSuitabilityScore: 0.74 },
    infrastructureBudget: {
      affectedAreaKm2: 5.5,
      equivalentImperviousAreaKm2: 1.8,
      waterDemandVolumeM3: 42000,
      storageCapacityM3: 180000
    }
  }
}, {}, { purpose: "intervention_comparison" });
assert.ok(interventionReport.couplings.some((item) => item.id === "infrastructure-surface-water"));
assert.equal(interventionReport.domains.find((item) => item.id === "infrastructure").metrics.demandVolumeM3Yr, 42000);
assert.ok(interventionReport.priorities.some((item) => item.id === "intervention-counterfactual"));

const lowReadinessReport = buildScenarioSynthesis({
  ...model,
  stats: {
    ...model.stats,
    dataReadiness: { scorePct: 0.3, class: "procedural-baseline" }
  }
});
assert.equal(lowReadinessReport.domains.find((item) => item.id === "evidence").evidencePct, 0.3);

for (const [purpose, priorityId] of [
  ["hypothesis_exploration", "hypothesis-test"],
  ["risk_communication", "risk-context"],
  ["validation_design", "validation-targets"]
]) {
  const purposeReport = buildScenarioSynthesis(model, {}, { purpose });
  assert.ok(purposeReport.priorities.some((item) => item.id === priorityId), `${purpose} should add ${priorityId}`);
}

const markdown = makeScenarioSynthesisMarkdown(report);
assert.match(markdown, /^# Mountain watershed teaching case/m);
assert.match(markdown, /## Cross-System Overview/);
assert.match(markdown, /Terrain to water/);
assert.match(markdown, /Teaching and exploratory prototype/);

assert.throws(() => buildScenarioSynthesis(null), /completed GeoLab model/);
assert.throws(() => makeScenarioSynthesisMarkdown({}), /scenario synthesis report/);

console.log("scenario synthesis tests passed");
