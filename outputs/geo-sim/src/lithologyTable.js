// Lithology reference table. These entries are the model's per-material petrophysical properties,
// used for groundwater storage, permeability, export and display. They are material classes, not a
// survey of any particular site; imported borehole lithology maps onto these codes.
//
// Porosity, permeability and dry density are of the order measured for these material classes in
// USGS Open-File Report 83-736, "Rock property measurements and analysis of selected igneous,
// sedimentary and metamorphic rocks from worldwide localities":
//   https://pubs.usgs.gov/publication/ofr83736
// They are representative values for a material class, not borehole measurements.
export const SUBSURFACE_LITHOLOGY = {
  0: { code: "VOID", name: "未解析", color: [62, 58, 55], porosity: 0.04, permeabilityMmHr: 0.02, densityKgM3: 1900 },
  1: { code: "SOIL", name: "表土/根区", color: [133, 103, 71], porosity: 0.42, permeabilityMmHr: 10, densityKgM3: 1650 },
  2: { code: "REGOLITH", name: "风化壳", color: [126, 111, 86], porosity: 0.28, permeabilityMmHr: 3.2, densityKgM3: 1850 },
  3: { code: "ALLUVIUM", name: "冲洪积含水层", color: [148, 132, 91], porosity: 0.34, permeabilityMmHr: 18, densityKgM3: 1750 },
  4: { code: "FRACTURED", name: "裂隙基岩", color: [104, 105, 101], porosity: 0.12, permeabilityMmHr: 1.4, densityKgM3: 2380 },
  5: { code: "BEDROCK", name: "完整基岩", color: [86, 88, 91], porosity: 0.04, permeabilityMmHr: 0.08, densityKgM3: 2650 },
  6: { code: "AQUITARD", name: "黏土隔水层", color: [96, 82, 76], porosity: 0.22, permeabilityMmHr: 0.03, densityKgM3: 2050 }
};
