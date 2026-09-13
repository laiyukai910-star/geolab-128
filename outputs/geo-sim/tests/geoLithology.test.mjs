import assert from 'node:assert/strict';
import {
  lithologyMechanicalProperties,
  jointSpacingM,
  columnarJointSpacingM,
  layerStructureSpacingM,
  rockMassStrength,
  regolithThicknessM,
  landformClass,
  lithologyDisplayColor,
  lithologyDisplayColorBytes,
  unclassifiedDisplayColor,
  wetRockDisplayColor,
  karstHostScore,
  karstHostAssessment,
  stratigraphicProfile,
  columnKarstHost
} from '../src/geoLithology.js';
import { SUBSURFACE_LITHOLOGY } from '../src/lithologyTable.js';
import { surfaceGeomorphology, terrainSurfaceWeights, naturalTerrainColor, packTerrainStructure, unpackLog, TERRAIN_STRUCTURE_RANGES, surfaceDetailSuitability, MATERIAL_CLASS_CODE } from '../src/terrainAppearance.js';

const table = SUBSURFACE_LITHOLOGY;
const codes = Object.keys(table).map(Number);

// Petrophysical derivation must be bounded and must follow the direction the lithology table
// already states: denser and less porous means stiffer.
for (const code of codes) {
  const properties = lithologyMechanicalProperties(table[code]);
  for (const value of [properties.cementation, properties.stiffness]) {
    assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, `stiffness out of range for ${table[code].code}`);
  }
  assert.ok(properties.porosity >= 0 && properties.porosity <= 1);
}
assert.ok(lithologyMechanicalProperties(table[5]).stiffness > lithologyMechanicalProperties(table[1]).stiffness,
  'competent bedrock must be stiffer than root-zone soil');
assert.ok(lithologyMechanicalProperties(table[5]).stiffness > lithologyMechanicalProperties(table[2]).stiffness,
  'competent bedrock must be stiffer than weathered cover');
assert.ok(lithologyMechanicalProperties(table[4]).stiffness > lithologyMechanicalProperties(table[3]).stiffness,
  'fractured bedrock must be stiffer than alluvium');
assert.ok(lithologyMechanicalProperties({ porosity: 0.5, permeabilityMmHr: 40, densityKgM3: 1500 }).stiffness < 0.05,
  'a loose porous material must be nearly incoherent');

// [1] Joint spacing at fracture saturation is proportional to layer thickness.
for (const thickness of [0.1, 0.5, 1, 3, 10]) {
  const weak = jointSpacingM(thickness, 0);
  const strong = jointSpacingM(thickness, 1);
  assert.ok(Math.abs(weak - thickness * 0.3) < 1e-9, `weak rock must sit at the low end of the ratio window at ${thickness} m`);
  assert.ok(Math.abs(strong - thickness * 1.5) < 1e-9, `strong rock must sit at the high end of the ratio window at ${thickness} m`);
}
assert.ok(Math.abs(jointSpacingM(2, 0.5) / jointSpacingM(1, 0.5) - 2) < 1e-9, 'joint spacing must scale linearly with bed thickness');
assert.ok(jointSpacingM(0, 1) > 0, 'a degenerate bed must still yield a positive spacing');
assert.equal(jointSpacingM(NaN, 1), jointSpacingM(1, 1), 'a non-finite thickness must fall back, not propagate NaN');

// [2] Columnar spacing grows inwards from the cooling boundary and with unit thickness.
let previous = -1;
for (const depth of [0, 0.5, 1, 2, 4]) {
  const spacing = columnarJointSpacingM(4, depth);
  assert.ok(spacing > previous, `columnar spacing must grow inwards from the cooling boundary, failed at ${depth} m`);
  previous = spacing;
}
assert.ok(columnarJointSpacingM(8, 1) > columnarJointSpacingM(2, 1), 'a thicker cooling unit must carry wider columns');
assert.ok(columnarJointSpacingM(0, 0) > 0, 'a degenerate flow must still yield a positive spacing');

// Jointed rock masses use the thickness or cooling relation; loose material carries an aggregate
// scale instead, because it has no joints to space.
assert.equal(layerStructureSpacingM(5, 1, 0, table).style, 'columnar');
assert.equal(layerStructureSpacingM(4, 1, 0, table).style, 'columnar');
assert.equal(layerStructureSpacingM(6, 1, 0, table).style, 'layered');
assert.equal(layerStructureSpacingM(1, 1, 0, table).style, 'granular');
assert.equal(layerStructureSpacingM(2, 1, 0, table).style, 'granular');
assert.equal(layerStructureSpacingM(3, 1, 0, table).style, 'granular');
assert.equal(layerStructureSpacingM(5, 1, 0, table).materialClass, 'rock');
assert.equal(layerStructureSpacingM(3, 1, 0, table).materialClass, 'unconsolidated');

// Loose material is not a fractured mass, so its scale has to stay in the aggregate window rather
// than inheriting a bed-thickness joint spacing, which for a thick bed would be metres.
for (const loose of [1, 2, 3]) {
  const looseSpacing = layerStructureSpacingM(loose, 1, 0, table).spacingM;
  assert.ok(looseSpacing > 0.02 && looseSpacing < 0.35, `${table[loose].code} aggregate scale out of the gravel window: ${looseSpacing}`);
  const thick = layerStructureSpacingM(loose, 8, 0, table).spacingM;
  assert.ok(Math.abs(thick - looseSpacing) < 1e-9, `${table[loose].code} aggregate scale must not follow bed thickness`);
}
assert.ok(layerStructureSpacingM(3, 8, 0, table).spacingM < layerStructureSpacingM(6, 8, 0, table).spacingM,
  'a thick bed of loose material must still break finer than a thick bed of rock');

// [3] Rock mass resistance rises with competence and spacing, and falls with weathering and water.
const bedrock = table[5], soil = table[1];
assert.ok(rockMassStrength(bedrock, 2, 0) > rockMassStrength(bedrock, 0.1, 0), 'wider joint spacing must raise mass strength');
// Pore pressure can only weaken a mass that has pores to pressurise, so the groundwater penalty is
// scaled by porosity and a tight granite is barely affected while a porous cover is.
assert.ok(rockMassStrength(soil, 1, 0) > rockMassStrength(soil, 1, 1), 'saturation must lower mass strength in porous material');
assert.ok(rockMassStrength(table[3], 1, 0) > rockMassStrength(table[3], 1, 1), 'saturation must lower mass strength in alluvium');
assert.ok(rockMassStrength(bedrock, 1, 0) - rockMassStrength(bedrock, 1, 1) < rockMassStrength(soil, 1, 0) - rockMassStrength(soil, 1, 1),
  'a tight rock must be less sensitive to saturation than a porous one');
assert.ok(rockMassStrength(bedrock, 1, 0) > rockMassStrength(soil, 1, 0), 'porous cover must be weaker than bedrock');
for (const code of codes) {
  const strength = rockMassStrength(table[code], 1, 0.5);
  assert.ok(strength >= 5 && strength <= 100, `mass strength out of range for ${table[code].code}: ${strength}`);
}

// Weathered cover is produced by weathering and removed by erosion, so it thickens on gentle
// ground and thins on steep ground.
const coverOn = slopeDeg => regolithThicknessM({ porosity: 0.28, meanTemperatureC: 2, precipitationMmYr: 900, slopeDeg, wetnessIndex: 6 });
assert.ok(coverOn(0) > coverOn(10), 'cover must thin as slope rises');
assert.ok(coverOn(10) > coverOn(25));
assert.ok(coverOn(25) > coverOn(45));
assert.ok(regolithThicknessM({ porosity: 0.42, meanTemperatureC: 0, precipitationMmYr: 1600, slopeDeg: 0, wetnessIndex: 10 })
  > regolithThicknessM({ porosity: 0.04, meanTemperatureC: 24, precipitationMmYr: 90, slopeDeg: 0, wetnessIndex: 1 }),
  'a porous rock in a cold wet climate must weather deeper than a tight rock in a hot desert');
assert.equal(regolithThicknessM({ porosity: 0.3, meanTemperatureC: 10, precipitationMmYr: 800, slopeDeg: NaN, wetnessIndex: 5 }) >= 0, true);
for (const slope of [0, 20, 45, 70]) assert.ok(Number.isFinite(coverOn(slope)) && coverOn(slope) >= 0);

// Landform classes must partition the strength/cover/slope space consistently.
assert.equal(landformClass({ rockMassStrengthValue: 85, regolithM: 0.05, slopeDeg: 60 }), 'cliff');
assert.equal(landformClass({ rockMassStrengthValue: 60, regolithM: 0.1, slopeDeg: 35 }), 'steep-rock-slope');
assert.equal(landformClass({ rockMassStrengthValue: 40, regolithM: 0.8, slopeDeg: 8 }), 'regolith-mantled');
assert.equal(landformClass({ rockMassStrengthValue: 45, regolithM: 0.05, slopeDeg: 40 }), 'talus-fed-slope');
assert.equal(landformClass({ rockMassStrengthValue: 45, regolithM: 0.05, slopeDeg: 12 }), 'soil-mantled');

// ---------------------------------------------------------------- surface expression

const n = 4;
function surfaceModel(lithologyCode) {
  return {
    n, sizeKm: 1, cellSizeKm: 1 / (n - 1),
    height: new Float32Array(n * n).fill(400),
    slope: new Float32Array(n * n).fill(45),
    wetnessIndex: new Float32Array(n * n).fill(6),
    temperature: new Float32Array(n * n).fill(3),
    precipitation: new Float32Array(n * n).fill(900),
    surface: { vegetation: new Float32Array(n * n).fill(0.10), imperviousFraction: new Float32Array(n * n).fill(0) },
    hydraulics: { erosionRisk: new Float32Array(n * n).fill(0.7), depositionRisk: new Float32Array(n * n).fill(0.05) },
    subsurface: {
      gridN: n, columnCellCount: n * n, layerCount: 3,
      depthEdgesM: new Float32Array([0, 1, 4, 12]),
      lithologyCode: Uint8Array.from({ length: n * n * 3 }, (_, i) => lithologyCode)
    }
  };
}

const bedrockModel = surfaceModel(5);
const alluviumModel = surfaceModel(3);
const bedrockCell = surfaceGeomorphology(bedrockModel, { seaLevel: 0 }, 0, { lithologyTable: table });
const alluviumCell = surfaceGeomorphology(alluviumModel, { seaLevel: 0 }, 0, { lithologyTable: table });
assert.equal(bedrockCell.source, 'lithology');
assert.equal(alluviumCell.source, 'lithology');
assert.notEqual(bedrockCell.landform, null);
assert.ok(bedrockCell.rockMassStrength > alluviumCell.rockMassStrength, 'the same slope must expose more bare rock over competent bedrock than over alluvium');
assert.ok(bedrockCell.rock > alluviumCell.rock, 'bare-rock fraction must follow rock mass strength');
assert.ok(bedrockCell.jointSpacingM > 0 && alluviumCell.jointSpacingM > 0);
for (const cell of [bedrockCell, alluviumCell]) {
  for (const key of ['rock', 'scree', 'vegetation', 'regolith', 'wet', 'sealed']) {
    assert.ok(Number.isFinite(cell[key]) && cell[key] >= 0 && cell[key] <= 1, `${key} out of range: ${cell[key]}`);
  }
  assert.ok(cell.rock + cell.scree + cell.vegetation + cell.regolith <= 1 + 1e-9, 'surface fractions must not overflow');
}

// Gentle ground under a weak material in a weathering climate must build cover rather than sit as
// bare rock. At 6 degrees nothing removes material, so the class follows the production side.
const gentle = surfaceModel(3);
gentle.slope = new Float32Array(n * n).fill(6);
gentle.precipitation = new Float32Array(n * n).fill(2000);
gentle.temperature = new Float32Array(n * n).fill(1);
const gentleCell = surfaceGeomorphology(gentle, { seaLevel: 0 }, 0, { lithologyTable: table });
assert.ok(gentleCell.rock < bedrockCell.rock, 'a gentle slope must expose less rock than a steep one');
assert.ok(gentleCell.regolithM > 0.35, `a wet climate on gentle ground must build cover, got ${gentleCell.regolithM} m`);
assert.equal(gentleCell.landform, 'regolith-mantled');

// A channel bed is wet ground, not automatically a rock face: a sand-bed river is not bedrock, so
// the geomorphology keeps its normal expression. Sweeping placed rock and scree detail off the
// channel is a separate concern and must still happen.
const channelled = surfaceModel(5);
channelled.hydraulics.channelMask = new Uint8Array(n * n).fill(1);
channelled.hydraulics.channelDepthM = new Float32Array(n * n).fill(1.2);
const channelCell = surfaceGeomorphology(channelled, { seaLevel: 0 }, 0, { lithologyTable: table });
assert.ok(channelCell.seeded, 'a channel cell must still be reported as a channel');
assert.deepEqual(surfaceDetailSuitability(channelled, 0, table), { rock: 0, scree: 0 }, 'a channel bed must carry no placed rock or scree detail');

// Without a subsurface column the established slope/cover/wetness proxy must still be used.
const bare = { ...surfaceModel(5) };
delete bare.subsurface;
assert.equal(surfaceGeomorphology(bare, { seaLevel: 0 }, 0, { lithologyTable: table }).source, 'surface-proxy');

// Scientific arrays must survive every derivation untouched.
const before = structuredClone(bedrockModel);
surfaceGeomorphology(bedrockModel, { seaLevel: 0 }, 0, { lithologyTable: table });
terrainSurfaceWeights(bedrockModel, { seaLevel: 0 }, 0, table);
naturalTerrainColor(bedrockModel, { seaLevel: 0 }, 0);
packTerrainStructure(bedrockModel, bedrockCell);
assert.deepEqual(bedrockModel, before, 'display derivation must not mutate model arrays');

// Structure packing must round-trip through the shader's logarithmic decode. One byte spans three
// decades, so a single quantisation step is about 2.7 percent.
for (const spacing of [0.02, 0.05, 0.3, 1, 2.5, 8, 20]) {
  const packed = packTerrainStructure({ subsurface: { depthEdgesM: [0, spacing, 4 * spacing] } }, { jointSpacingM: spacing, stiffness: 0.5, rockMassStrength: 50 });
  const decoded = unpackLog(packed[0], TERRAIN_STRUCTURE_RANGES.jointSpacingM);
  assert.ok(Math.abs(decoded / spacing - 1) < 0.03, `joint spacing must round-trip within one quantisation step, got ${decoded} for ${spacing}`);
}
assert.equal(packTerrainStructure({ subsurface: { depthEdgesM: [0, 0.5, 4] } }, { jointSpacingM: 0.001 }).length, 4, 'out-of-range spacings must clamp, not overflow a byte');
assert.equal(packTerrainStructure({ subsurface: { depthEdgesM: [0, 1e6, 2e6] } }, { jointSpacingM: 1e6 })[0] <= 255, true);
const packed = packTerrainStructure(bedrockModel, bedrockCell);
assert.equal(packed.length, 4);
assert.ok(packed.every(value => Number.isInteger(value) && value >= 0 && value <= 255));

// ================================================================ display colour derivation
//
// The lithology table states each material's colour once. These assertions pin the derivation that
// turns those sRGB bytes into the linear-sRGB floats a renderer needs, and pin the fact that the
// subsurface palette is now that derivation rather than a second list of hex constants.

// The old subsurface palette, kept only so the two can be compared. Every code differed from the
// table's own colour, so `npm test` reports the size of that difference instead of hiding it.
const LEGACY_SUBSURFACE_HEX = [0x626569, 0x9a7048, 0x897b5c, 0xb79b61, 0x777b79, 0x5f666b, 0x725f59];
const expectedLinear = bytes => bytes.map(byte => {
  const channel = byte / 255;
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
});

for (const code of codes) {
  const entry = table[code];
  const color = lithologyDisplayColor(entry);
  assert.ok(Array.isArray(color) && color.length === 3, `${entry.code}: a display colour must be three channels`);
  for (const channel of color) {
    assert.ok(Number.isFinite(channel) && channel >= 0 && channel <= 1, `${entry.code}: linear channel out of range: ${channel}`);
  }
  const expected = expectedLinear(entry.color);
  color.forEach((channel, i) => assert.ok(Math.abs(channel - expected[i]) < 1e-12,
    `${entry.code}: channel ${i} must be the sRGB transfer function of the table byte`));
  assert.deepEqual(lithologyDisplayColorBytes(entry), entry.color.slice(0, 3),
    `${entry.code}: the colour must round-trip back to the table's own sRGB bytes`);
}
// An sRGB byte ordering is preserved by the transfer function, so the palette must still be ordered
// the way the table is: a lighter material stays lighter in linear-sRGB.
for (let code = 1; code < codes.length; code++) {
  const previous = lithologyDisplayColor(table[code - 1]);
  const current = lithologyDisplayColor(table[code]);
  for (let channel = 0; channel < 3; channel++) {
    assert.equal(previous[channel] <= current[channel], table[code - 1].color[channel] <= table[code].color[channel],
      `${table[code].code}: linear channel ${channel} must not reorder the table`);
  }
}
assert.deepEqual(lithologyDisplayColor(null), lithologyDisplayColor(table[0]),
  'an absent lithology must fall back to the table\'s unresolved entry');
assert.deepEqual(lithologyDisplayColor({ code: 'NO_COLOR' }), lithologyDisplayColor(table[0]));
assert.deepEqual(lithologyDisplayColor({ color: [] }), lithologyDisplayColor(table[0]));
assert.deepEqual(lithologyDisplayColorBytes({ porosity: 0.2 }), table[0].color.slice(0, 3));
for (const value of [...unclassifiedDisplayColor(), ...wetRockDisplayColor()]) {
  assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, `a derived display tone is out of range: ${value}`);
}
// The wet tone is a material statement drawn from the AQUITARD entry, so it must have that entry's
// hue and be darker than it: a saturated fine-grained rock reads darker than the same rock dry.
const aquitardTone = lithologyDisplayColor(table[6]);
const wetTone = wetRockDisplayColor();
for (let i = 0; i < 3; i++) assert.ok(wetTone[i] > 0 && wetTone[i] < aquitardTone[i], `wet tone channel ${i} must be a darker aquitard tone`);
assert.deepEqual(wetRockDisplayColor(), wetRockDisplayColor(table), 'the wet tone must accept an explicit table');
// The table is the single display source of truth, and it was given the palette the rendered
// application was tuned against, so the derivation must now reproduce those tones exactly rather
// than the near-miss it produced while the palette was duplicated in the renderer.
for (const code of codes) {
  assert.deepEqual(expectedLinear(
    [(LEGACY_SUBSURFACE_HEX[code] >> 16) & 255, (LEGACY_SUBSURFACE_HEX[code] >> 8) & 255, LEGACY_SUBSURFACE_HEX[code] & 255]),
    lithologyDisplayColor(table[code]),
    `${table[code].code}: the table must carry the display tone the subsurface renderer draws`);
}

// The palette really used by the subsurface renderer: terrainVolume.js must carry no colour list of
// its own, and the tone it draws a single-lithology column with must be the table-derived one.
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  return next(specifier === 'three' ? new URL('../vendor/three/three.module.js', import.meta.url).href : specifier, context);
} });
const THREE = await import('three');
const { sampleStratumColor } = await import('../src/terrainVolume.js');
import { readFileSync } from 'node:fs';
const terrainVolumeSource = readFileSync(new URL('../src/terrainVolume.js', import.meta.url), 'utf8');
for (const hex of LEGACY_SUBSURFACE_HEX) {
  assert.ok(!terrainVolumeSource.includes(hex.toString(16)),
    `terrainVolume.js must not restate the lithology palette (found 0x${hex.toString(16)})`);
}
for (const code of codes) {
  const model = surfaceModel(code);
  const sampled = [sampleStratumColor(model, 0, 0, 0), sampleStratumColor(model, 1, 1, 1), sampleStratumColor(model, 3, 3, 2)];
  for (const tone of sampled) {
    const expected = lithologyDisplayColor(table[code]);
    for (const [channel, actual] of [['r', tone.r], ['g', tone.g], ['b', tone.b]]) {
      assert.ok(Math.abs(actual - expected[['r', 'g', 'b'].indexOf(channel)]) < 1e-6,
        `${table[code].code}: the subsurface renderer must draw the table's own colour (${channel}: ${actual})`);
    }
  }
}
// The palette used to be stated as hex in the renderer. A reviewer should find no hex literal in
// terrainVolume.js now: three.js linearises from the derived floats, and the bytes live only in the
// table. The renderer's second copy of this palette is checked in geologyStructure.test.mjs.
assert.ok(terrainVolumeSource.includes('lithologyDisplayColor'), 'terrainVolume.js must derive its tones from geoLithology.js');
for (const code of codes) {
  assert.equal(new THREE.Color(...lithologyDisplayColor(table[code])).getHex(), LEGACY_SUBSURFACE_HEX[code],
    `${table[code].code}: the derived tone must round-trip back to the palette the renderer draws`);
}

// ================================================================ karst (dissolution) host
//
// The assessment reads only the table's own petrophysical fields. Code 5 BEDROCK (porosity 0.04,
// density 2650) must come out clearly non-karstic; a porous, low-density carbonate reference must
// not.

const CARBONATE_REFERENCE = { code: 'CARBONATE', name: '灰岩参照', color: [148, 140, 122], porosity: 0.18, permeabilityMmHr: 12, densityKgM3: 2450 };
const karstTable = { ...table, 7: CARBONATE_REFERENCE };
assert.equal(karstHostAssessment(table[5]).isHost, false, 'competent bedrock must not be a karst host');
assert.equal(karstHostScore(table[5]), 0, 'competent bedrock scores zero on both terms');
assert.ok(karstHostAssessment(table[5]).score < karstHostAssessment(CARBONATE_REFERENCE).score,
  'a dense quartz-framework rock must score below a porous carbonate one');
assert.equal(karstHostAssessment(CARBONATE_REFERENCE).isHost, true, 'a dolomite-like carbonate must be a karst host');
assert.ok(karstHostScore(CARBONATE_REFERENCE) > karstHostAssessment(CARBONATE_REFERENCE).threshold,
  'the carbonate reference must clear the threshold, not sit on it');
for (const code of codes) {
  const assessment = karstHostAssessment(table[code]);
  assert.ok(Number.isFinite(assessment.score) && assessment.score >= 0 && assessment.score <= 1,
    `${table[code].code}: a host score must be bounded`);
  assert.equal(assessment.threshold, karstHostAssessment(CARBONATE_REFERENCE).threshold, 'one threshold, not two');
}
// The direction the derivation claims: more pore space and less density both raise the score, and a
// tight fabric cannot be carried by low density alone.
assert.ok(karstHostScore({ porosity: 0.20, densityKgM3: 2400, permeabilityMmHr: 5 })
  > karstHostScore({ porosity: 0.10, densityKgM3: 2400, permeabilityMmHr: 5 }), 'pore space must raise the score');
assert.ok(karstHostScore({ porosity: 0.15, densityKgM3: 2300, permeabilityMmHr: 5 })
  > karstHostScore({ porosity: 0.15, densityKgM3: 2560, permeabilityMmHr: 5 }), 'lower bulk density must raise the score');
assert.ok(Math.abs(karstHostScore({ porosity: 0.5, densityKgM3: 2700, permeabilityMmHr: 10 }) - 0.4908) < 0.01,
  'a rock denser than quartz scores on porosity only — no density term, and the mobility penalty is small');

// ================================================================ column stratigraphy

// One column, three layers, three different materials, and a second column that is bedrock all the
// way down. The voxel of a layer is `layer * columnCellCount + column`.
const COLUMN_CODES = [3, 7, 5];
const stratigraphyModel = surfaceModel(3);
stratigraphyModel.subsurface = {
  gridN: n, columnCellCount: n * n, layerCount: 3,
  depthEdgesM: new Float32Array([0, 1, 4, 12]),
  lithologyCode: Uint8Array.from({ length: n * n * 3 }, (_, i) => COLUMN_CODES[Math.floor(i / (n * n))])
};
const bedrockColumnModel = surfaceModel(5);
const karstProfile = stratigraphicProfile(stratigraphyModel, 0, { lithologyTable: karstTable });
const bedrockProfile = stratigraphicProfile(bedrockColumnModel, 0);

assert.equal(karstProfile.layerCount, 3, 'the profile must report one record per modelled layer');
assert.equal(karstProfile.layers.length, 3);
assert.equal(karstProfile.depthEdgesM.length, karstProfile.layerCount + 1);
assert.deepEqual(karstProfile.depthEdgesM, [0, 1, 4, 12], 'the profile must reproduce the model depth edges');
let previousBottom = 0;
karstProfile.layers.forEach((entry, i) => {
  assert.equal(entry.layer, i, 'layer records must be ordered and self-describing');
  for (const key of ['topDepthM', 'bottomDepthM', 'thicknessM', 'jointSpacingM', 'rockMassStrength', 'karstHostScore']) {
    assert.ok(Number.isFinite(entry[key]), `layer ${i}: ${key} must be finite, got ${entry[key]}`);
  }
  assert.equal(entry.topDepthM, previousBottom, `layer ${i} must start where layer ${i - 1} ended`);
  assert.equal(entry.topDepthM, karstProfile.depthEdgesM[i], `layer ${i} top must match depthEdgesM[${i}]`);
  assert.equal(entry.bottomDepthM, karstProfile.depthEdgesM[i + 1], `layer ${i} bottom must match depthEdgesM[${i + 1}]`);
  assert.ok(entry.bottomDepthM > entry.topDepthM, `layer ${i} depths must increase`);
  assert.ok(entry.thicknessM > 0, `layer ${i} must have a positive thickness`);
  assert.ok(Math.abs(entry.thicknessM - (entry.bottomDepthM - entry.topDepthM)) < 1e-9);
  assert.equal(entry.lithologyCode, COLUMN_CODES[i], `layer ${i} must read its own voxel`);
  assert.equal(entry.lithologyName, karstTable[COLUMN_CODES[i]].name, `layer ${i} must name its lithology`);
  assert.ok(entry.jointSpacingM > 0, `layer ${i} must carry a spacing`);
  assert.equal(entry.jointStyle, layerStructureSpacingM(COLUMN_CODES[i], entry.thicknessM, entry.topDepthM, karstTable).style,
    `layer ${i} must report the style layerStructureSpacingM gives`);
  assert.ok(entry.rockMassStrength >= 5 && entry.rockMassStrength <= 100, `layer ${i} mass strength out of range`);
  assert.equal(entry.karstHost, entry.karstHostScore >= karstProfile.karst.threshold, `layer ${i} host flag must match its score`);
  previousBottom = entry.bottomDepthM;
});
assert.equal(previousBottom, 12, 'the profile must reach the base of the modelled column');
// The voxel index is `layer * columnCellCount + column`, the same indexing geoEngine.js exports with.
assert.deepEqual(karstProfile.layers.map(entry => entry.voxelIndex), [0, n * n, 2 * n * n]);
assert.equal(karstProfile.layers[1].lithologyClass, 'CARBONATE');
assert.equal(bedrockProfile.layers[0].lithologyClass, 'BEDROCK');

// A thin soluble bed inside a thick quartz-framework sequence must not carry the whole column, and
// a column of competent bedrock must not host karst at all.
const carbonates = surfaceModel(7);
carbonates.subsurface.lithologyCode = new Uint8Array(n * n * 3).fill(7);
const carbonateProfile = stratigraphicProfile(carbonates, 0, { lithologyTable: karstTable });
assert.equal(carbonateProfile.karst.isHost, true, 'a carbonate column must report a karst host');
assert.equal(carbonateProfile.karst.hostLayerCount, 3);
assert.ok(Math.abs(carbonateProfile.karst.hostThicknessM - 12) < 1e-9);
assert.equal(carbonateProfile.karst.primaryHostLithology, 'CARBONATE');
assert.equal(bedrockProfile.karst.isHost, false, 'a competent-bedrock column must not report a karst host');
assert.equal(bedrockProfile.karst.hostLayerCount, 0);
assert.equal(bedrockProfile.karst.hostThicknessM, 0);
assert.equal(bedrockProfile.karst.primaryHostLayer, null, 'a non-host column must not name a host layer');
assert.equal(bedrockProfile.karst.primaryHostLithology, null);
for (const entry of bedrockProfile.layers) assert.equal(entry.karstHost, false);
// The mixed column carries one soluble bed, and the column call must be able to disagree with it.
assert.equal(karstProfile.layers[1].karstHost, true, 'the carbonate bed itself is a host');
assert.equal(karstProfile.layers[0].lithologyCode, 3);
assert.equal(karstProfile.layers[2].lithologyClass, 'BEDROCK');
assert.equal(karstProfile.karst.isHost, true);
assert.equal(karstProfile.karst.primaryHostLayer, 0, 'the primary host must be a layer that actually passed');
assert.ok(karstProfile.karst.score > 0 && karstProfile.karst.score <= 1);
assert.equal(columnKarstHost(stratigraphyModel, 0, { lithologyTable: karstTable }).isHost, karstProfile.karst.isHost);
assert.equal(columnKarstHost(stratigraphyModel, 0, { lithologyTable: karstTable }).score, karstProfile.karst.score);
// Wetness is the one non-table input: saturation can only lower mass strength, never raise it.
const wetProfile = stratigraphicProfile(stratigraphyModel, 0, { lithologyTable: karstTable, wetness: 1 });
wetProfile.layers.forEach((entry, i) => assert.ok(entry.rockMassStrength <= karstProfile.layers[i].rockMassStrength + 1e-9,
  `layer ${i}: saturation must not strengthen the mass`));
assert.equal(wetProfile.karst.isHost, karstProfile.karst.isHost, 'wetness is not a solubility input');

// Scientific arrays and the lithology table must survive every derivation untouched.
const beforeStratigraphy = structuredClone(stratigraphyModel);
const beforeTable = structuredClone(table);
const beforeKarstTable = structuredClone(karstTable);
stratigraphicProfile(stratigraphyModel, 0, { lithologyTable: karstTable });
stratigraphicProfile(stratigraphyModel, 1, { lithologyTable: karstTable });
columnKarstHost(stratigraphyModel, 2, { lithologyTable: karstTable });
stratigraphicProfile(bedrockColumnModel, 3);
assert.deepEqual(stratigraphyModel, beforeStratigraphy, 'the profile must not mutate the model');
assert.deepEqual(table, beforeTable, 'the profile must not mutate the lithology table');
assert.deepEqual(karstTable, beforeKarstTable, 'the profile must not mutate a caller-supplied table');

// Degenerate input must yield a finite, iterable answer rather than a throw: a caller in the middle
// of scenario loading has no subsurface at all, and a camera probe can name any column.
const emptyProfile = stratigraphicProfile({ n, height: new Float32Array(n * n) }, 0);
assert.equal(emptyProfile.layers.length, 0);
assert.equal(emptyProfile.karst.isHost, false);
assert.equal(emptyProfile.karst.primaryHostLayer, null);
assert.ok(Number.isFinite(emptyProfile.karst.score) && emptyProfile.karst.score >= 0);
const noLayersModel = surfaceModel(5);
noLayersModel.subsurface.layerCount = 0;
const noLayers = stratigraphicProfile(noLayersModel, 0);
assert.equal(noLayers.layerCount, 0, 'layerCount 0 must produce no layers');
assert.equal(noLayers.layers.length, 0);
assert.ok(Number.isFinite(noLayers.karst.score) && noLayers.karst.score >= 0);
assert.equal(noLayers.karst.isHost, false);
const noEdges = surfaceModel(5);
noEdges.subsurface.depthEdgesM = new Float32Array([0]);
assert.equal(stratigraphicProfile(noEdges, 0).layerCount, 0, 'a single depth edge describes no layer');
const noVoxels = surfaceModel(5);
delete noVoxels.subsurface.lithologyCode;
assert.equal(stratigraphicProfile(noVoxels, 0).layerCount, 3, 'the geometry must still be reported');
for (const entry of stratigraphicProfile(noVoxels, 0).layers) {
  assert.ok(Number.isFinite(entry.jointSpacingM) && entry.jointSpacingM > 0);
  assert.ok(Number.isFinite(entry.rockMassStrength));
  assert.equal(entry.voxelIndex, -1, 'with no lithology array there is no voxel to point at');
  assert.equal(entry.lithologyClass, 'VOID');
}
const truncated = surfaceModel(5);
truncated.subsurface.lithologyCode = new Uint8Array(2);
const truncatedProfile = stratigraphicProfile(truncated, 0);
assert.equal(truncatedProfile.layerCount, 3);
assert.ok(truncatedProfile.layers.every(entry => Number.isFinite(entry.karstHostScore) && Number.isFinite(entry.rockMassStrength)),
  'a short lithology array must degrade to unresolved material, not NaN');
for (const column of [-1, -12, 999, n * n, 1.5, NaN, Infinity, -Infinity, null, undefined, '2']) {
  const profile = stratigraphicProfile(stratigraphyModel, column);
  assert.ok(Number.isFinite(profile.karst.score), `column ${column} must yield a finite score`);
  assert.equal(profile.layerCount, 3, `column ${column} must still report the layer geometry`);
  assert.ok(profile.layers.every(entry => Number.isFinite(entry.rockMassStrength) && Number.isFinite(entry.jointSpacingM)),
    `column ${column} must not propagate NaN into a layer`);
  assert.equal(typeof profile.karst.isHost, 'boolean', `column ${column} must report a boolean host flag`);
}
assert.equal(stratigraphicProfile(stratigraphyModel, 999).columnIndex, -1, 'an out-of-range column resolves to -1');
assert.equal(stratigraphicProfile(stratigraphyModel, -2).columnIndex, -1);
assert.equal(stratigraphicProfile(stratigraphyModel, '2').columnIndex, 2);
const zeroColumns = surfaceModel(5);
zeroColumns.subsurface.columnCellCount = 0;
assert.equal(stratigraphicProfile(zeroColumns, 0).columnIndex, -1, 'a volume with no cells has no usable column');
assert.deepEqual(stratigraphicProfile(null, 0).layers, []);
assert.deepEqual(stratigraphicProfile(undefined, 0).layers, []);
assert.equal(stratigraphicProfile({}, 0).karst.isHost, false);
const nonMonotonic = surfaceModel(5);
nonMonotonic.subsurface.depthEdgesM = new Float32Array([0, 6, 3, 9]);
const ordered = stratigraphicProfile(nonMonotonic, 0);
for (let i = 1; i < ordered.layers.length; i++) {
  assert.ok(ordered.layers[i].bottomDepthM >= ordered.layers[i - 1].bottomDepthM,
    'a non-monotonic depth array must be reported in order, not as negative thickness');
}
assert.ok(ordered.layers.every(entry => entry.thicknessM >= 0));

console.log('Lithology-derived rock mass, joint spacing, regolith, landform, display colour, karst and column stratigraphy tests passed');
