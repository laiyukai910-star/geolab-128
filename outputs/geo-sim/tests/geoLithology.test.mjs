import assert from 'node:assert/strict';
import {
  lithologyMechanicalProperties,
  jointSpacingM,
  columnarJointSpacingM,
  layerStructureSpacingM,
  rockMassStrength,
  regolithThicknessM,
  landformClass
} from '../src/geoLithology.js';
import { SUBSURFACE_LITHOLOGY } from '../src/lithologyTable.js';
import { surfaceGeomorphology, terrainSurfaceWeights, naturalTerrainColor, packTerrainStructure, unpackLog, TERRAIN_STRUCTURE_RANGES } from '../src/terrainAppearance.js';

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

// Layered units use the thickness relation, cooling units use the columnar relation.
assert.equal(layerStructureSpacingM(5, 1, 0, table).style, 'columnar');
assert.equal(layerStructureSpacingM(4, 1, 0, table).style, 'columnar');
assert.equal(layerStructureSpacingM(3, 1, 0, table).style, 'layered');
assert.equal(layerStructureSpacingM(2, 1, 0, table).style, 'layered');

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

// A channel bed is swept by flow, so no rock or scree detail belongs on it.
const channelled = surfaceModel(5);
channelled.hydraulics.channelMask = new Uint8Array(n * n).fill(1);
channelled.hydraulics.channelDepthM = new Float32Array(n * n).fill(1.2);
const channelCell = surfaceGeomorphology(channelled, { seaLevel: 0 }, 0, { lithologyTable: table });
assert.equal(channelCell.rock, 1, 'a channel bed is swept clean');
assert.equal(channelCell.scree, 0);

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

console.log('Lithology-derived rock mass, joint spacing, regolith and landform tests passed');
