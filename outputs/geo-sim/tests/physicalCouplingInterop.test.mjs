import assert from "node:assert/strict";
import {
  buildModel,
  buildPhysicalCouplingReport,
  createDefaultParams,
  makePhysicalCouplingCSV
} from "../src/geoEngine.js";
import {
  buildEngineScenePackage,
  chooseEngineResolution,
  ENGINE_EXPORT_PROFILES
} from "../src/engineInterop.js";

const params = {
  ...createDefaultParams(),
  resolution: 64,
  mapSizeKm: 128,
  landscapeBlockGrid: 12,
  wildlifeMaxAgents: 60
};
const model = buildModel(params);
const water = model.stats.waterBudget;

assert.equal(model.hydroBudget.method, "annual-water-partition-with-NRCS-event-response-screening");
assert.equal(water.method, "precipitation-plus-irrigation-minus-demand-ET-runoff-recharge-storage");
assert.ok(Math.abs(water.residualPctOfInput) < 1e-6);
assert.ok(water.groundwaterRechargeVolumeM3 > 0);
assert.ok(water.soilStorageChangeVolumeM3 > 0);
assert.ok(water.generatedRunoffAnnualM3 > 0);
assert.ok(model.stats.meanPotentialEvapotranspiration >= model.stats.meanActualEvapotranspiration);
assert.ok(model.stats.meanNetRadiationMjM2Day > 0);
assert.ok(model.stats.meanVaporPressureDeficitKPa >= 0);

const coupling = model.physicalCoupling;
assert.equal(coupling.type, "geolab-physical-coupling-state");
assert.equal(coupling.gates.length, 8);
assert.equal(coupling.couplings.length, 8);
assert.equal(coupling.summary.failedGateCount, 0);
assert.ok(coupling.summary.processIntegrityIndex > 0.75);
assert.ok(coupling.summary.couplingIntegrityIndex > 0.65);
assert.ok(coupling.methodReferences.some((item) => item.id === "fao56-reference-et"));
assert.ok(coupling.methodReferences.some((item) => item.id === "nrcs-direct-runoff"));
assert.ok(coupling.diagnostics.maximumAbsoluteRecomputedWaterResidualMm < 0.01);
assert.ok(coupling.diagnostics.meanWaterLedgerMismatchMm < 0.01);

const mfdModel = buildModel({
  ...params,
  resolution: 32,
  mapSizeKm: 64,
  flowRouting: "mfd",
  landscapeBlockGrid: 8,
  wildlifeMaxAgents: 20
});
assert.equal(gateById(mfdModel, "downslope-routing").status, "pass");
assert.equal(gateById(mfdModel, "accumulation-continuity").status, "pass");

const report = buildPhysicalCouplingReport(model, params);
assert.equal(report.map.areaKm2, 16384);
assert.equal(report.summary.activeCouplingCount, 8);
const csv = makePhysicalCouplingCSV(report);
assert.ok(csv.startsWith("record_type,id,label,status,score,evidence_or_signals"));
assert.equal(csv.trim().split("\n").length, 17);

assert.equal(chooseEngineResolution(128, ENGINE_EXPORT_PROFILES.unity.allowedResolutions), 129);
assert.equal(chooseEngineResolution(128, ENGINE_EXPORT_PROFILES.unreal.allowedResolutions), 127);

const unityPackage = buildEngineScenePackage(model, params, { engine: "unity" });
assert.equal(unityPackage.engine, "unity");
assert.equal(unityPackage.manifest.terrain.exportResolution, 65);
assert.deepEqual(unityPackage.manifest.engine.axisMapping, { east: "+X", north: "+Z", up: "+Y" });
assert.equal(unityPackage.manifest.terrain.heightEncoding.bitDepth, 16);
assert.equal(unityPackage.manifest.terrain.heightEncoding.byteOrder, "little-endian");
assert.equal(unityPackage.manifest.terrain.heightEncoding.rowOrder, "south-to-north");
assert.deepEqual(unityPackage.manifest.terrain.unity.terrainObjectPositionM, {
  x: -64000,
  y: unityPackage.manifest.terrain.heightEncoding.elevationMinimumM,
  z: -64000
});
assert.equal(fileSize(unityPackage, "heightmap-unity-65.raw"), 65 * 65 * 2);
assert.equal(fileSize(unityPackage, "layers/vegetation.tga"), 18 + 65 * 65);
assert.ok(unityPackage.files.some((file) => file.path === "reports/physical-coupling.json"));
await assertZipSignature(unityPackage.blob);
const unityHeight = await readStoredZipFile(unityPackage.blob, "heightmap-unity-65.raw");
assert.equal(readRawHeight(unityHeight, 0), expectedRawHeight(model.height[(model.n - 1) * model.n], unityPackage));
assert.equal(readRawHeight(unityHeight, (65 - 1) * 65), expectedRawHeight(model.height[0], unityPackage));

const unrealPackage = buildEngineScenePackage(model, params, { engine: "unreal" });
assert.equal(unrealPackage.engine, "unreal");
assert.equal(unrealPackage.manifest.terrain.exportResolution, 127);
assert.deepEqual(unrealPackage.manifest.engine.axisMapping, { east: "+X", north: "+Y", up: "+Z" });
assert.equal(fileSize(unrealPackage, "heightmap-unreal-127.r16"), 127 * 127 * 2);
assert.equal(fileSize(unrealPackage, "layers/flood.r8"), 127 * 127);
assert.ok(unrealPackage.files.some((file) => file.path === "heightmap-unreal-127.json"));
assert.ok(unrealPackage.manifest.terrain.unreal.landscapeScaleCm.x > 0);
assert.ok(unrealPackage.manifest.terrain.unreal.landscapeScaleCm.z > 0);
assert.equal(unrealPackage.manifest.terrain.unreal.landscapeLocationCm.z, unrealPackage.manifest.terrain.unreal.landscapeLocationZCm);
await assertZipSignature(unrealPackage.blob);

console.log("physical coupling and engine interoperability tests passed");

function fileSize(packageResult, path) {
  return packageResult.files.find((file) => file.path === path)?.sizeBytes;
}

async function assertZipSignature(blob) {
  const bytes = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  assert.deepEqual(Array.from(bytes), [0x50, 0x4b, 0x03, 0x04]);
}

function gateById(modelState, id) {
  return modelState.physicalCoupling.gates.find((gate) => gate.id === id);
}

function readRawHeight(bytes, sampleIndex) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(sampleIndex * 2, true);
}

function expectedRawHeight(elevation, packageResult) {
  const encoding = packageResult.manifest.terrain.heightEncoding;
  const ratio = (elevation - encoding.elevationMinimumM) /
    Math.max(0.0001, encoding.elevationMaximumM - encoding.elevationMinimumM);
  return Math.round(Math.max(0, Math.min(1, ratio)) * 65535);
}

async function readStoredZipFile(blob, expectedPath) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const decoder = new TextDecoder();
  let cursor = 0;
  while (cursor + 30 <= bytes.length && view.getUint32(cursor, true) === 0x04034b50) {
    const compressedSize = view.getUint32(cursor + 18, true);
    const nameLength = view.getUint16(cursor + 26, true);
    const extraLength = view.getUint16(cursor + 28, true);
    const nameStart = cursor + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const path = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
    if (path === expectedPath) return bytes.subarray(dataStart, dataStart + compressedSize);
    cursor = dataStart + compressedSize;
  }
  throw new Error(`ZIP entry not found: ${expectedPath}`);
}
