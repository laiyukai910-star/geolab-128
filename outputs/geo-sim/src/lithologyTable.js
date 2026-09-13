// Lithology reference table. These entries are the model's per-material petrophysical properties,
// used for groundwater storage, permeability, export, geomorphic derivation and display. They are
// material classes, not a survey of any particular site; imported borehole lithology maps onto
// these codes.
//
// Porosity, permeability and dry density are of the order measured for these material classes in
// USGS Open-File Report 83-736, "Rock property measurements and analysis of selected igneous,
// sedimentary and metamorphic rocks from worldwide localities":
//   https://pubs.usgs.gov/publication/ofr83736
// They are representative values for a material class, not borehole measurements.
//
// `color` is the single display source of truth for these codes: the subsurface volume, the
// geological section and the surface's weathered-cover tint all derive from it, and no other file
// may keep its own lithology palette. The values are the tones the rendered application was tuned
// against, which is why they are lighter than a raw material photograph: the subsurface material
// adds a display-only inspection fill (see geologyMaterial.js) that raises the visible brightness,
// and these bytes compensate for it. They are display tones, not measured rock colours.
export const SUBSURFACE_LITHOLOGY = {
  0: { code: "VOID", name: "未解析", color: [98, 101, 105], porosity: 0.04, permeabilityMmHr: 0.02, densityKgM3: 1900 },
  1: { code: "SOIL", name: "表土/根区", color: [154, 112, 72], porosity: 0.42, permeabilityMmHr: 10, densityKgM3: 1650 },
  2: { code: "REGOLITH", name: "风化壳", color: [137, 123, 92], porosity: 0.28, permeabilityMmHr: 3.2, densityKgM3: 1850 },
  3: { code: "ALLUVIUM", name: "冲洪积含水层", color: [183, 155, 97], porosity: 0.34, permeabilityMmHr: 18, densityKgM3: 1750 },
  4: { code: "FRACTURED", name: "裂隙基岩", color: [119, 123, 121], porosity: 0.12, permeabilityMmHr: 1.4, densityKgM3: 2380 },
  5: { code: "BEDROCK", name: "完整基岩", color: [95, 102, 107], porosity: 0.04, permeabilityMmHr: 0.08, densityKgM3: 2650 },
  6: { code: "AQUITARD", name: "黏土隔水层", color: [114, 95, 89], porosity: 0.22, permeabilityMmHr: 0.03, densityKgM3: 2050 }
};

/** Display tone for a code that resolved to nothing, matching the unclassified void entry. */
export const UNCLASSIFIED_LITHOLOGY_COLOR = Object.freeze([114, 120, 126]);
