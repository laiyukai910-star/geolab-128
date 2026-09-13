import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  surfaceGeomorphology,
  terrainSurfaceWeights,
  surfaceDetailSuitability,
  naturalTerrainColor,
  packTerrainStructure,
  unpackLog,
  TERRAIN_STRUCTURE_RANGES,
  MATERIAL_CLASS_CODE
} from '../src/terrainAppearance.js';
import { SUBSURFACE_LITHOLOGY } from '../src/lithologyTable.js';

// Geology -> surface structure agreement. The renderer derives every natural-terrain vertex from
// surfaceGeomorphology alone (terrainRenderer.js, updateTerrainBuffers calls it with no options), so
// the derivation, the four bytes it packs into the vertex buffer and the GLSL decode that reads them
// back have to agree end to end.
// This test reads terrainSurfaceMaterial.js as text instead of importing it, so it needs no three.

const table = SUBSURFACE_LITHOLOGY;
const n = 4;

// The subsurface lithology array is layer-major: lithologyCode[layer * columnCellCount + column], so
// its first columnCellCount entries are the top layer of each column, which is exactly what the
// surface appearance reads.
function buildModel({ side = n, gridN = side, layerCount = 3, depthEdgesM = [0, 1, 4, 12], code = () => 5, slope = 45 } = {}) {
  const columnCellCount = gridN * gridN;
  const cells = side * side;
  const lithologyCode = new Uint8Array(Math.max(0, columnCellCount * layerCount));
  for (let column = 0; column < columnCellCount; column += 1) {
    for (let layer = 0; layer < layerCount; layer += 1) {
      lithologyCode[layer * columnCellCount + column] = code(column, layer);
    }
  }
  return {
    n: side, sizeKm: 1, cellSizeKm: 1 / (side - 1),
    height: new Float32Array(cells).fill(400),
    slope: new Float32Array(cells).fill(slope),
    wetnessIndex: new Float32Array(cells).fill(6),
    temperature: new Float32Array(cells).fill(3),
    precipitation: new Float32Array(cells).fill(900),
    surface: { vegetation: new Float32Array(cells).fill(0.10), imperviousFraction: new Float32Array(cells).fill(0) },
    hydraulics: { erosionRisk: new Float32Array(cells).fill(0.7), depositionRisk: new Float32Array(cells).fill(0.05) },
    subsurface: {
      gridN, columnCellCount, layerCount,
      depthEdgesM: new Float32Array(depthEdgesM),
      lithologyCode
    }
  };
}

// Every display derivation must leave the scientific arrays exactly as it found them.
function withoutMutation(model, what, run) {
  const before = structuredClone(model);
  const result = run();
  assert.deepEqual(model, before, `${what} must not mutate the model`);
  return result;
}

// ---------------------------------------------------------------- [1] the omitted-table regression

// The production call site passes no options at all. A model that does have a subsurface volume must
// still get the lithology derivation; the no-lithology proxy it used to fall into reports
// jointSpacingM === null, which then packs as a meaningless structure byte.
const bedrockModel = buildModel({ code: () => 5 });
const bedrockCell = withoutMutation(bedrockModel, 'surfaceGeomorphology without options',
  () => surfaceGeomorphology(bedrockModel, { seaLevel: 0 }, 0));
assert.equal(bedrockCell.source, 'lithology', 'an omitted table must not drop a resolved subsurface column');
assert.equal(bedrockCell.lithologyCode, 5);
assert.equal(bedrockCell.landform, 'cliff');
for (const key of ['jointSpacingM', 'stiffness', 'rockMassStrength', 'regolithM']) {
  assert.ok(Number.isFinite(bedrockCell[key]), `omitted table: ${key} must be a finite number, got ${bedrockCell[key]}`);
}
assert.deepEqual(bedrockCell, surfaceGeomorphology(bedrockModel, { seaLevel: 0 }, 0, { lithologyTable: table }),
  'the defaulted table must be the built-in one');

// packTerrainStructure substitutes a spacing of 1 m when the geomorphology carries none, and 1 m is
// what packs to this byte. A derived spacing must never land on it.
const undefinedSpacingByte = Math.round(255 * Math.log(1 / 0.02) / Math.log(20 / 0.02));
const packedBedrock = withoutMutation(bedrockModel, 'packTerrainStructure',
  () => packTerrainStructure(bedrockModel, bedrockCell));
assert.notEqual(packedBedrock[0], undefinedSpacingByte, 'the joint spacing byte must be derived, not the 1 m placeholder');
assert.equal(packedBedrock[0], Math.round(255 * Math.log(bedrockCell.jointSpacingM / 0.02) / Math.log(20 / 0.02)),
  'the first byte must be the logarithm of the derived spacing');
const decodedSpacing = unpackLog(packedBedrock[0], TERRAIN_STRUCTURE_RANGES.jointSpacingM);
assert.ok(Math.abs(decodedSpacing / bedrockCell.jointSpacingM - 1) < 0.03,
  `one byte must carry the derived spacing, got ${decodedSpacing} for ${bedrockCell.jointSpacingM}`);

// A table that cannot resolve the column must still fall back rather than invent a rock mass. This is
// the branch the omitted table used to reach for this very model, so it is the state the first byte
// above must be distinguished from.
const unresolvedTableCell = surfaceGeomorphology(bedrockModel, { seaLevel: 0 }, 0, { lithologyTable: {} });
assert.equal(unresolvedTableCell.source, 'surface-proxy', 'an unusable table must still fall back');
// The fallback carries an explicitly unclassified spacing rather than a null, so the shader is
// handed a value it can interpret and draws the generic granular response instead of blocky rock.
assert.equal(unresolvedTableCell.jointSpacingM, 0.5);
assert.equal(unresolvedTableCell.materialClass, 'unconsolidated');
assert.notEqual(packTerrainStructure(bedrockModel, unresolvedTableCell)[0], undefinedSpacingByte,
  'an unresolved column must be marked loose rather than packed as a 1 m rock spacing');

// The placeholder is not hypothetical: a model with no subsurface column at all still packs it, and so
// does a geomorphology whose spacing is missing. That is what the fixed path must differ from.
const noVolume = buildModel({ code: () => 5 });
delete noVolume.subsurface;
const proxyCell = surfaceGeomorphology(noVolume, { seaLevel: 0 }, 0);
assert.equal(proxyCell.source, 'surface-proxy', 'a model with no subsurface column must keep the slope/cover/wetness proxy');
// The proxy no longer carries a null spacing: it carries an unclassified one, so the shader can
// tell "no lithology here" apart from a real rock spacing.
assert.equal(proxyCell.jointSpacingM, 0.5);
assert.equal(proxyCell.materialClass, 'unconsolidated');
assert.notEqual(packTerrainStructure(noVolume, proxyCell)[0], undefinedSpacingByte,
  'the no-subsurface proxy must not pack a 1 m rock spacing');
assert.equal(packTerrainStructure(bedrockModel, { ...bedrockCell, jointSpacingM: undefined })[0], undefinedSpacingByte,
  'a spacing that really is missing still packs to the independently computed placeholder byte');

// ------------------------------------------------- [2] end-to-end packing agreement per lithology

// Alternate competent bedrock (5) and alluvium (3) column by column. The two materials must reach the
// vertex buffer as two different structures, ordered the way the lithology table orders them.
const alternating = buildModel({ code: column => (column % 2 === 0 ? 5 : 3) });
const packedByCell = [];
for (let index = 0; index < n * n; index += 1) {
  const geomorphology = surfaceGeomorphology(alternating, { seaLevel: 0 }, index, { lithologyTable: table });
  packedByCell.push(packTerrainStructure(alternating, geomorphology));
}
assert.equal(new Set(packedByCell.map(bytes => bytes.join(','))).size, 2,
  'competent bedrock and alluvium must not pack to the same four bytes');
const bedrockPack = packedByCell.filter((_, cell) => cell % 2 === 0);
const alluviumPack = packedByCell.filter((_, cell) => cell % 2 === 1);
assert.equal(new Set(bedrockPack.map(bytes => bytes.join(','))).size, 1, 'every bedrock cell must pack identically');
assert.equal(new Set(alluviumPack.map(bytes => bytes.join(','))).size, 1, 'every alluvium cell must pack identically');
assert.ok(bedrockPack[0][2] > alluviumPack[0][2],
  `the competence byte must be higher for bedrock, got ${bedrockPack[0][2]} against ${alluviumPack[0][2]}`);
assert.ok(bedrockPack[0][3] > alluviumPack[0][3],
  `the material-class byte must be higher for rock, got ${bedrockPack[0][3]} against ${alluviumPack[0][3]}`);
assert.notEqual(bedrockPack[0][0], alluviumPack[0][0], 'the spacing byte must differ between the two lithologies');
assert.equal(bedrockPack[0][1], alluviumPack[0][1],
  'both columns share one depth model, so the bed thickness byte is not expected to vary here');
// Loose material is not a fractured rock mass, so it must break finer than the rock it sits on
// rather than inheriting a bed-thickness joint spacing wider than bedrock's.
assert.ok(alluviumPack[0][0] < bedrockPack[0][0],
  `loose alluvium must pack finer than competent bedrock, got ${alluviumPack[0][0]} against ${bedrockPack[0][0]}`);
// The fourth byte separates the two spacing scales: alluvium is not a rock mass, bedrock is. The
// shader decodes it as step(0.6, w/255), so rock must land clearly above that and loose clearly
// below.
assert.equal(alluviumPack[0][3], MATERIAL_CLASS_CODE.unconsolidated, 'loose material must pack the unconsolidated class');
assert.equal(bedrockPack[0][3], MATERIAL_CLASS_CODE.rock, 'a jointed rock mass must pack the rock class');
assert.ok(bedrockPack[0][3] / 255 > 0.8 && alluviumPack[0][3] / 255 < 0.8,
  `the shader threshold must separate the two classes, got ${alluviumPack[0][3]} against ${bedrockPack[0][3]}`);
assert.ok(MATERIAL_CLASS_CODE.unclassified / 255 < 0.8,
  'an unresolved column must also fall on the granular side of the shader threshold');

// ------------------------------------------------------- [3] shader and packer range agreement

const shaderSource = readFileSync(new URL('../src/terrainSurfaceMaterial.js', import.meta.url), 'utf8');
const glslRange = name => {
  const match = new RegExp(`const vec2 ${name} = vec2\\(([^)]*)\\)`).exec(shaderSource);
  assert.ok(match, `${name} must still be declared in terrainSurfaceMaterial.js`);
  const values = match[1].split(',').map(part => Number(part.trim()));
  assert.equal(values.length, 2, `${name} must have exactly two components`);
  values.forEach(value => assert.ok(Number.isFinite(value), `${name} must hold numbers`));
  return values;
};
assert.deepEqual(glslRange('GEO_JOINT_SPACING_RANGE_M'), [...TERRAIN_STRUCTURE_RANGES.jointSpacingM],
  'the shader joint spacing range must equal the range the packer uses');
assert.deepEqual(glslRange('GEO_BED_THICKNESS_RANGE_M'), [...TERRAIN_STRUCTURE_RANGES.bedThicknessM],
  'the shader bed thickness range must equal the range the packer uses');
for (const [label, range] of Object.entries(TERRAIN_STRUCTURE_RANGES)) {
  assert.ok(range[0] > 0 && range[1] > range[0], `${label} must be a positive increasing range to be packed logarithmically`);
}

const decodeBody = /float geoUnpackLog\(float byte, vec2 range\) \{\s*return ([^;]+);/.exec(shaderSource);
assert.ok(decodeBody, 'geoUnpackLog must still be defined in the shader');
assert.equal(decodeBody[1].replace(/\s+/g, ' ').trim(), 'range.x * pow(range.y / range.x, byte)',
  'the shader decode must stay logarithmic in the range');
// Byte x carries joint spacing and byte y carries bed thickness, the order packTerrainStructure writes.
assert.match(shaderSource, /geoUnpackLog\(vGeoStructure\.x, GEO_JOINT_SPACING_RANGE_M\)/);
assert.match(shaderSource, /geoUnpackLog\(vGeoStructure\.y, GEO_BED_THICKNESS_RANGE_M\)/);
// The shader reads normalized bytes, so one byte of the buffer is byte / 255 in the shader.
const rendererSource = readFileSync(new URL('../src/terrainRenderer.js', import.meta.url), 'utf8');
assert.match(rendererSource, /setAttribute\(\s*["']terrainStructure["'][\s\S]{0,200}?,\s*4,\s*true\s*\)/,
  'the structure buffer must still be uploaded as four normalized bytes');

const glslDecode = (byte, [low, high]) => low * Math.pow(high / low, byte / 255);
for (const byte of [0, 64, 128, 192, 255]) {
  for (const [label, range] of Object.entries(TERRAIN_STRUCTURE_RANGES)) {
    assert.equal(glslDecode(byte, range), unpackLog(byte, range),
      `${label} byte ${byte} must decode identically in the GLSL formula and in unpackLog`);
  }
}
assert.ok(Math.abs(unpackLog(0, TERRAIN_STRUCTURE_RANGES.jointSpacingM) - 0.02) < 1e-12, 'byte 0 must decode to the bottom of the range');
assert.ok(Math.abs(unpackLog(255, TERRAIN_STRUCTURE_RANGES.jointSpacingM) - 20) < 1e-12, 'byte 255 must decode to the top of the range');

// -------------------------------------------------------- [4] surface cells onto the subsurface grid

// A subsurface grid coarser than the surface grid, so several surface cells share one column and must
// therefore share the rock mass that column describes.
const side = 8, gridN = 3;
const mappingModel = buildModel({ side, gridN, code: column => (column === 0 ? 5 : column === 4 ? 3 : 0) });
assert.equal(mappingModel.subsurface.columnCellCount, 9);
assert.notEqual(mappingModel.subsurface.columnCellCount, side * side);
// Independent expectation: a surface cell reads the nearest subsurface column.
const nearestColumn = index => {
  const x = index % side, y = Math.floor(index / side);
  const gx = Math.min(gridN - 1, Math.max(0, Math.round((x / (side - 1)) * (gridN - 1))));
  const gy = Math.min(gridN - 1, Math.max(0, Math.round((y / (side - 1)) * (gridN - 1))));
  return gy * gridN + gx;
};
const cells = [];
for (let index = 0; index < side * side; index += 1) {
  const geomorphology = surfaceGeomorphology(mappingModel, { seaLevel: 0 }, index);
  const explicit = surfaceGeomorphology(mappingModel, { seaLevel: 0 }, index, { columnIndex: nearestColumn(index) });
  assert.deepEqual(geomorphology, explicit, `cell ${index} must read the nearest subsurface column`);
  cells.push(geomorphology);
}
// (0,0) and (1,1) both fall in the corner column 0.
assert.equal(nearestColumn(0), 0);
assert.equal(nearestColumn(side + 1), 0);
const corner = cells[0], neighbour = cells[side + 1];
assert.equal(corner.jointSpacingM, neighbour.jointSpacingM, 'cells sharing a subsurface column must share the joint spacing');
assert.equal(corner.rockMassStrength, neighbour.rockMassStrength, 'cells sharing a subsurface column must share the rock mass strength');
assert.deepEqual(
  [corner.lithologyCode, corner.jointSpacingM, corner.stiffness, corner.rockMassStrength, corner.regolithM],
  [neighbour.lithologyCode, neighbour.jointSpacingM, neighbour.stiffness, neighbour.rockMassStrength, neighbour.regolithM],
  'two surface cells in one column must derive one identical appearance');
// Columns 0, 4 and 8 hold three different lithologies.
const centre = cells[2 * side + 2], far = cells[6 * side + 6];
assert.equal(corner.lithologyCode, 5);
assert.equal(centre.lithologyCode, 3);
assert.equal(far.lithologyCode, 0);
for (const [label, other] of [['centre', centre], ['outer', far]]) {
  assert.notEqual(corner.jointSpacingM, other.jointSpacingM, `column 0 and the ${label} column must not share a joint spacing`);
  assert.notEqual(corner.rockMassStrength, other.rockMassStrength, `column 0 and the ${label} column must not share a rock mass strength`);
}
assert.notEqual(centre.jointSpacingM, far.jointSpacingM);
assert.notEqual(centre.rockMassStrength, far.rockMassStrength);
// The coarse grid may collapse cells onto columns, but no further: one appearance per distinct code.
const appearances = new Map();
for (const cell of cells) {
  const key = `${cell.lithologyCode}|${cell.jointSpacingM}|${cell.rockMassStrength}`;
  appearances.set(key, (appearances.get(key) || 0) + 1);
}
const expectedGroupSizes = new Map();
for (let index = 0; index < side * side; index += 1) {
  const code = mappingModel.subsurface.lithologyCode[nearestColumn(index)];
  expectedGroupSizes.set(code, (expectedGroupSizes.get(code) || 0) + 1);
}
assert.equal(appearances.size, expectedGroupSizes.size,
  'the number of distinct appearances must equal the number of distinct column lithologies');
assert.deepEqual([...appearances.values()].sort((a, b) => a - b), [...expectedGroupSizes.values()].sort((a, b) => a - b),
  'each appearance must cover exactly the cells of the columns that share its lithology');

// ------------------------------------------------------------------- [5] no mutation of the model

for (const [label, model, index] of [
  ['uniform bedrock', bedrockModel, 0],
  ['alternating lithology', alternating, 5],
  ['coarse subsurface grid', mappingModel, 2 * side + 2]
]) {
  withoutMutation(model, `surfaceGeomorphology (${label})`, () => surfaceGeomorphology(model, { seaLevel: 0 }, index));
  withoutMutation(model, `surfaceGeomorphology with table (${label})`,
    () => surfaceGeomorphology(model, { seaLevel: 0 }, index, { lithologyTable: table }));
  withoutMutation(model, `terrainSurfaceWeights (${label})`, () => terrainSurfaceWeights(model, { seaLevel: 0 }, index));
  withoutMutation(model, `terrainSurfaceWeights with table (${label})`, () => terrainSurfaceWeights(model, { seaLevel: 0 }, index, table));
  withoutMutation(model, `surfaceDetailSuitability (${label})`, () => surfaceDetailSuitability(model, index));
  withoutMutation(model, `surfaceDetailSuitability with table (${label})`, () => surfaceDetailSuitability(model, index, table));
  withoutMutation(model, `naturalTerrainColor (${label})`, () => naturalTerrainColor(model, { seaLevel: 0 }, index));
  withoutMutation(model, `naturalTerrainColor with table (${label})`, () => naturalTerrainColor(model, { seaLevel: 0 }, index, null, table));
  const prepared = surfaceGeomorphology(model, { seaLevel: 0 }, index);
  withoutMutation(model, `terrainSurfaceWeights with prepared (${label})`, () => terrainSurfaceWeights(model, { seaLevel: 0 }, index, table, prepared));
  withoutMutation(model, `surfaceDetailSuitability with prepared (${label})`, () => surfaceDetailSuitability(model, index, table, prepared));
  withoutMutation(model, `naturalTerrainColor with prepared (${label})`, () => naturalTerrainColor(model, { seaLevel: 0 }, index, [0.2, 0.3, 0.1, 0], table, prepared));
  withoutMutation(model, `packTerrainStructure (${label})`, () => packTerrainStructure(model, prepared));
}

// ------------------------------------------------------------------- [6] degenerate inputs

// A model that does have a subsurface column must never hand NaN to the vertex buffer, whatever the
// field or the lithology code says.
function finiteAppearance(model, label) {
  const geomorphology = surfaceGeomorphology(model, { seaLevel: 0 }, 0);
  for (const key of ['rock', 'scree', 'vegetation', 'regolith', 'wet', 'sealed']) {
    const value = geomorphology[key];
    assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, `${label}: ${key} must stay a finite fraction, got ${value}`);
  }
  for (const key of ['jointSpacingM', 'stiffness', 'rockMassStrength', 'regolithM']) {
    assert.ok(Number.isFinite(geomorphology[key]), `${label}: ${key} must stay finite, got ${geomorphology[key]}`);
  }
  const bytes = packTerrainStructure(model, geomorphology);
  assert.equal(bytes.length, 4);
  assert.ok(bytes.every(value => Number.isInteger(value) && value >= 0 && value <= 255), `${label}: packed bytes must stay inside one byte, got ${bytes}`);
  assert.ok(naturalTerrainColor(model, { seaLevel: 0 }, 0).every(Number.isFinite), `${label}: colour channels must stay finite`);
  assert.ok(terrainSurfaceWeights(model, { seaLevel: 0 }, 0).every(Number.isFinite), `${label}: surface weights must stay finite`);
  assert.ok(Object.values(surfaceDetailSuitability(model, 0)).every(Number.isFinite), `${label}: detail suitability must stay finite`);
  return geomorphology;
}

const nanSlope = buildModel({ code: () => 5 });
nanSlope.slope[0] = NaN;
assert.equal(finiteAppearance(nanSlope, 'slope NaN').source, 'lithology', 'a NaN slope must not discard the lithology derivation');
const nanTemperature = buildModel({ code: () => 5 });
nanTemperature.temperature[0] = NaN;
finiteAppearance(nanTemperature, 'temperature NaN');
const nanPrecipitation = buildModel({ code: () => 5 });
nanPrecipitation.precipitation[0] = NaN;
finiteAppearance(nanPrecipitation, 'precipitation NaN');
const nanWetness = buildModel({ code: () => 5 });
nanWetness.wetnessIndex[0] = NaN;
finiteAppearance(nanWetness, 'wetness NaN');

// A column that declares no layers and carries a code the table does not contain.
const unresolvedColumn = buildModel({ code: () => 5 });
unresolvedColumn.subsurface = {
  gridN: n, columnCellCount: n * n, layerCount: 0, depthEdgesM: [],
  lithologyCode: Uint8Array.from({ length: n * n }, () => 99)
};
const unresolved = finiteAppearance(unresolvedColumn, 'empty layer stack with code 99');
assert.equal(unresolved.source, 'lithology', 'an unknown code must still resolve through the table rather than fall back');
// The unresolved id is reported separately, but the code every consumer sees has to be one the
// table can actually colour, otherwise the surface tint silently falls back to a generic tone.
assert.equal(unresolved.lithologyId, 99, 'the derivation reports the code it was handed');
assert.equal(unresolved.unresolvedLithology, true, 'an unknown code must be flagged as unresolved');
assert.equal(unresolved.lithologyCode, 0, 'the reported code must be one the table can colour');
assert.notEqual(table[unresolved.lithologyCode], undefined, 'every consumer must be able to resolve a colour for the reported code');
assert.equal(unresolved.lithologyName, table[0].name, 'the mechanics and the name come from the table unresolved entry');

console.log('Geology-derived surface structure, packing agreement, grid mapping and degenerate-input tests passed');
