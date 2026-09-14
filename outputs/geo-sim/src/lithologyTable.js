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
// The table was missing the rock class that matters most for karst: carbonates. That gap is why a
// limestone borehole interval imported as generic competent bedrock and why the karst assessment
// could only ever report "a soluble-looking host", never a carbonate one.
//
// How common the class is, from the reference global lithology model: the Global Lithological Map
// (GLiM v1.1, Hartmann and Moosdorf 2012, doi:10.1029/2012GC004370) reports the emerged surface as
// 64 percent sediments - roughly a third of that carbonate - 13 percent metamorphics, 7 percent
// plutonics and 6 percent volcanics. GLiM is the public model this table's class set is meant to be
// able to represent; its coarse 0.5-degree version is published as doi:10.1594/PANGAEA.788537 and its
// GIS data through CSDMS (https://csdms.colorado.edu/wiki/Alldata:GLiM). Carrying GLiM's carbonate
// class is what lets a GLiM-derived or limestone-bearing interval land on a soluble host.
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
  6: { code: "AQUITARD", name: "黏土隔水层", color: [114, 95, 89], porosity: 0.22, permeabilityMmHr: 0.03, densityKgM3: 2050 },
  // A soluble carbonate host such as limestone or dolomite, the GLiM carbonate class. It sits between
  // the clastic bedrock and the loose classes: lithified rock, but dissolution along joints, bedding
  // planes and faults gives it secondary mouldic and vuggy porosity with little matrix permeability,
  // which is what makes it both a karst host and a productive but unpredictable aquifer.
  // CALIBRATED to that description rather than fitted: 0.12 porosity, 5 mm/h and 2500 kg/m3 are
  // representative carbonate values of the order tabulated in the USGS report above. No dataset in
  // this repository constrains them, and they are not a borehole measurement.
  7: { code: "CARBONATE", name: "可溶碳酸盐岩", color: [133, 126, 116], porosity: 0.12, permeabilityMmHr: 5, densityKgM3: 2500 }
};

/** Display tone for a code that resolved to nothing, matching the unclassified void entry. */
export const UNCLASSIFIED_LITHOLOGY_COLOR = Object.freeze([114, 120, 126]);
