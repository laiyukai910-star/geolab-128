// Generated from src-ts/wildlifeMorphotypes.ts. Run npm run browser:build to regenerate.
const MORPHOTYPES = Object.freeze({
  ungulate: Object.freeze(["deer", "moose", "zebra"]),
  bovine: Object.freeze(["bison", "yak"]),
  feline: Object.freeze(["felid", "lynx", "lion"]),
  canid: Object.freeze(["wolf", "fox"]),
  bear: Object.freeze(["bear", "panda"]),
  bird: Object.freeze(["wading", "raptor", "penguin", "ratite", "seabird"]),
  raptor: Object.freeze(["raptor"]),
  penguin: Object.freeze(["penguin"]),
  "semi-aquatic": Object.freeze(["otter", "rodent", "pinniped"]),
  human: Object.freeze(["standing", "walking", "seated"]),
  // One build each: these classes have a single defining body plan, so their morphotype list has one
  // entry and the variant is always 0.
  boar: Object.freeze(["suid"]),
  elephant: Object.freeze(["elephant"]),
  giraffe: Object.freeze(["giraffe"]),
  marsupial: Object.freeze(["macropod"]),
  "small-mammal": Object.freeze(["lagomorph"])
});
function wildlifeMorphotypeIndex(species) {
  const key = species?.geometryClass ?? "";
  const morphotypes = Object.hasOwn(MORPHOTYPES, key) ? MORPHOTYPES[key] : void 0;
  if (!morphotypes || morphotypes.length < 2) return 0;
  const id = species?.id ?? "";
  const explicit = String((Object.hasOwn(SPECIES_MORPHOTYPE, id) ? SPECIES_MORPHOTYPE[id] : void 0) || species?.morphotype || "");
  if (explicit) {
    const index = morphotypes.indexOf(explicit);
    if (index >= 0) return index;
  }
  const raw = species?.morphotypeIndex;
  const declared = raw === null || raw === void 0 || typeof raw === "string" && !raw.trim() ? NaN : Number(raw);
  if (Number.isFinite(declared) && declared >= 0) return Math.min(morphotypes.length - 1, Math.trunc(declared));
  UNASSIGNED_MORPHOTYPE_SPECIES.add(species?.id);
  return 0;
}
const UNASSIGNED_MORPHOTYPE_SPECIES = /* @__PURE__ */ new Set();
function unassignedMorphotypeSpecies() {
  return [...UNASSIGNED_MORPHOTYPE_SPECIES];
}
const SPECIES_MORPHOTYPE = Object.freeze({
  // ungulates: the stocky antelope-and-deer build is the default; the moose and the zebra differ enough
  // in silhouette that they are separate morphotypes rather than rescaled deer.
  moose: "moose",
  zebra: "zebra",
  // bovines: the bison's massive forequarters and the yak's shaggy skirt are the two builds.
  yak: "yak",
  // felids: the lynx's short tail and tufted ears and the lion's mane are the distinguishing builds.
  eurasian_lynx: "lynx",
  african_lion: "lion",
  // canids: the fox is the small narrow-muzzled build.
  red_fox: "fox",
  // birds: the soaring raptors, the flightless penguin and the long-legged waders are three builds.
  golden_eagle: "raptor",
  andean_condor: "raptor",
  emperor_penguin: "penguin",
  // The albatross is a soaring seabird, not a long-legged wader: it takes the raptor-style long wing
  // with a different body build. The cassowary is a flightless ratite with a casque.
  albatross: "seabird",
  cassowary: "ratite",
  // A giant panda is a bear in build but not in pattern, so it gets its own morphotype rather than
  // being a recoloured brown bear.
  giant_panda: "panda",
  // The African elephant is the larger build with the bigger ear plate.
  african_elephant: "elephant-african",
  // The suid build is the boar itself; the marsupial and lagomorph builds are single-morphotype classes.
  // semi-aquatic: the otter's sinuous tail, the rodent's flat paddle and the pinniped's flippers are
  // three builds, not one rescaled swimmer.
  beaver: "rodent",
  capybara: "rodent",
  arctic_seal: "pinniped"
});
const WILDLIFE_SPECIES_MORPHOTYPE = SPECIES_MORPHOTYPE;
function wildlifeMorphotypeCount(geometryClass) {
  return (Object.hasOwn(MORPHOTYPES, geometryClass) ? MORPHOTYPES[geometryClass]?.length : void 0) || 1;
}
const WILDLIFE_MORPHOTYPES = MORPHOTYPES;
export {
  UNASSIGNED_MORPHOTYPE_SPECIES,
  WILDLIFE_MORPHOTYPES,
  WILDLIFE_SPECIES_MORPHOTYPE,
  unassignedMorphotypeSpecies,
  wildlifeMorphotypeCount,
  wildlifeMorphotypeIndex
};
