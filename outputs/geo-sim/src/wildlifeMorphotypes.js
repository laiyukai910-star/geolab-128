/**
 * Wildlife morphotype selection.
 *
 * `organismGeometry.js` gives each animal anatomy a `variant` parameter, and for the terrestrial
 * anatomies that parameter selects WHICH ANIMAL is built: a deer, a moose and a zebra are three
 * variants of one quadruped anatomy rather than three separate anatomies. That makes the variant a
 * property of the SPECIES, not of where an individual happens to stand.
 *
 * This matters because the renderer's generic variant rule derives the variant from an instance's
 * position. Applied to an animal that rule would draw the same species as a deer in one place and a
 * moose in another, and would change which animal it is as the herd moves. So the organism batches
 * read the species here instead, and position keeps driving only size and colour.
 *
 * A class with a single morphotype has one entry and its value is always 0.
 */

/** geometryClass -> ordered morphotype list. The index into this list is the geometry variant. */
const MORPHOTYPES = Object.freeze({
  ungulate: Object.freeze(["deer", "moose", "zebra"]),
  bovine: Object.freeze(["bison", "yak"]),
  feline: Object.freeze(["felid", "lynx", "lion"]),
  canid: Object.freeze(["wolf", "fox"]),
  bear: Object.freeze(["bear"]),
  boar: Object.freeze(["boar"]),
  bird: Object.freeze(["wading", "raptor", "penguin"]),
  raptor: Object.freeze(["raptor"]),
  penguin: Object.freeze(["penguin"]),
  "semi-aquatic": Object.freeze(["otter", "rodent", "pinniped"]),
  elephant: Object.freeze(["elephant"]),
  giraffe: Object.freeze(["giraffe"]),
  marsupial: Object.freeze(["macropod"]),
  "small-mammal": Object.freeze(["lagomorph"]),
  human: Object.freeze(["standing", "walking", "seated"])
});

/**
 * Which morphotype of its anatomy a species is. Prefers an explicit per-species morphotype and falls
 * back to the species' own position in its class, so a class never silently collapses to one animal.
 * Returns 0 for a class with a single morphotype, which is the neutral case.
 */
export function wildlifeMorphotypeIndex(species) {
  const morphotypes = MORPHOTYPES[species?.geometryClass];
  if (!morphotypes || morphotypes.length < 2) return 0;
  const explicit = String(SPECIES_MORPHOTYPE[species?.id] || species?.morphotype || "");
  if (explicit) {
    const index = morphotypes.indexOf(explicit);
    if (index >= 0) return index;
  }
  const declared = Number(species?.morphotypeIndex);
  if (Number.isFinite(declared) && declared >= 0) return Math.min(morphotypes.length - 1, Math.trunc(declared));
  return 0;
}

/**
 * Species that are not the first morphotype of their class, named explicitly rather than inferred from
 * list order, so moving a species in `WILDLIFE_SPECIES` cannot silently turn a moose into a deer.
 * A species absent from this table takes its class's first morphotype.
 */
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
  // semi-aquatic: the otter's sinuous tail, the rodent's flat paddle and the pinniped's flippers are
  // three builds, not one rescaled swimmer.
  beaver: "rodent",
  capybara: "rodent",
  arctic_seal: "pinniped"
});

export const WILDLIFE_SPECIES_MORPHOTYPE = SPECIES_MORPHOTYPE;

/** How many morphotypes a species' class provides. Used to size the geometry cache. */
export function wildlifeMorphotypeCount(geometryClass) {
  return MORPHOTYPES[geometryClass]?.length || 1;
}

export const WILDLIFE_MORPHOTYPES = MORPHOTYPES;
