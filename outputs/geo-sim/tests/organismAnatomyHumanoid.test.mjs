import { registerHooks } from "node:module";
import assert from "node:assert/strict";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "three") return nextResolve(new URL("../vendor/three/three.module.js", import.meta.url).href, context);
    if (specifier.startsWith("three/addons/")) {
      return nextResolve(new URL(`../vendor/three/addons/${specifier.slice("three/addons/".length)}`, import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  }
});

const THREE = await import("three");
const { mergeGeometries } = await import("three/addons/utils/BufferGeometryUtils.js");
const { humanAnatomy, bipedAnatomy, pachydermAnatomy, smallFaunaAnatomy, semiAquaticAnatomy } =
  await import("../src/organismAnatomyHumanoid.js");
const { createOrganismGeometry, ORGANISM_KINDS, WILDLIFE_ANATOMY_KINDS } = await import("../src/organismGeometry.js");
const { WILDLIFE_SPECIES } = await import("../src/landscapeEcology.js");
const { wildlifeProceduralKind, wildlifeOrganismVariant } = await import("../src/proceduralAssets.js");
const { wildlifeMorphotypeIndex, wildlifeMorphotypeCount, unassignedMorphotypeSpecies, WILDLIFE_MORPHOTYPES } =
  await import("../src/wildlifeMorphotypes.js");

const { readFileSync } = await import("node:fs");
const SOURCE = readFileSync(new URL("../src/organismAnatomyHumanoid.js", import.meta.url), "utf8");
for (const forbidden of ["Math.random", "Date.now", "performance.now"]) {
  assert.ok(!SOURCE.includes(forbidden), `anatomy must stay deterministic: source contains ${forbidden}`);
}

const TIERS = [18, 32, 48];
const ATTRIBUTES = ["position", "normal", "color", "uv"];

/** Merge a part list and report its extents, attributes and vertex count. */
function measure(parts, label) {
  assert.ok(Array.isArray(parts) && parts.length, `${label}: must return a non-empty array of parts`);
  for (const part of parts) {
    assert.ok(part instanceof THREE.BufferGeometry, `${label}: every part must be a BufferGeometry`);
    for (const name of ATTRIBUTES) assert.ok(part.getAttribute(name), `${label}: part is missing ${name}`);
    const position = part.getAttribute("position");
    assert.equal(part.getAttribute("color").count, position.count, `${label}: colour count must match positions`);
    assert.equal(part.getAttribute("uv").count, position.count, `${label}: uv count must match positions`);
  }
  const merged = mergeGeometries(parts);
  assert.ok(merged, `${label}: parts must be merge-compatible with mergeGeometries`);
  merged.computeBoundingBox();
  const box = merged.boundingBox;
  const size = [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z];
  const position = merged.getAttribute("position");
  for (let i = 0; i < position.array.length; i += 1) {
    assert.ok(Number.isFinite(position.array[i]), `${label}: coordinate ${i} must be finite`);
  }
  for (const value of size) assert.ok(Number.isFinite(value) && value > 0, `${label}: extents must be positive and finite`);
  return { vertices: position.count, size, extent: Math.max(...size), box };
}

// ---------------------------------------------------------------- the human figure

for (const [name, fn, variants, limit] of [
  ["humanAnatomy", humanAnatomy, 3, 1.2],
  ["bipedAnatomy", bipedAnatomy, 3, 1.2],
  ["pachydermAnatomy", pachydermAnatomy, 3, 1.35],
  ["smallFaunaAnatomy", smallFaunaAnatomy, 3, 1.35],
  ["semiAquaticAnatomy", semiAquaticAnatomy, 3, 1.3]
]) {
  for (let variant = 0; variant < variants; variant += 1) {
    const counts = [];
    let firstBox = null;
    for (const detail of TIERS) {
      const label = `${name} variant ${variant} detail ${detail}`;
      const measured = measure(fn(detail, variant), label);
      assert.ok(measured.extent <= limit + 1e-6,
        `${label}: largest extent ${measured.extent.toFixed(3)} must stay inside the display envelope ${limit}`);
      counts.push(measured.vertices);
      // Determinism: the same arguments must produce the same geometry.
      const again = measure(fn(detail, variant), `${label} (repeat)`);
      assert.equal(again.vertices, measured.vertices, `${label}: must be deterministic in vertex count`);
      assert.deepEqual(again.size.map(v => +v.toFixed(6)), measured.size.map(v => +v.toFixed(6)),
        `${label}: must be deterministic in extents`);
      if (firstBox === null) firstBox = measured;
    }
    assert.ok(counts[2] > counts[0], `${name} variant ${variant}: detail 48 must carry more vertices than detail 18`);
    assert.ok(counts[1] >= counts[0], `${name} variant ${variant}: detail must not lose vertices as it rises`);
  }
  // The variants must be different builds, not one build reused.
  const boxes = [];
  for (let variant = 0; variant < variants; variant += 1) {
    boxes.push(measure(fn(32, variant), `${name} variant ${variant} @32`).size.map(v => +v.toFixed(4)).join(","));
  }
  assert.equal(new Set(boxes).size, variants, `${name}: each variant must be a distinct build, got ${boxes.join(" | ")}`);
}

// The human figure is taller than it is wide, and stands on the ground plane.
{
  const standing = measure(humanAnatomy(32, 0), "human standing");
  assert.ok(standing.size[1] > standing.size[0] && standing.size[1] > standing.size[2],
    "a standing figure must be taller than it is wide");
  // The engine applies its own body scale, so the contract is not an exact unit height: it is that the
  // figure is human-proportioned, stands upright about its own origin, and is of a height the engine can
  // scale. Pinned to a band rather than an exact value so the pose can be tuned without lying.
  const height = standing.size[1];
  assert.ok(height > 0.8 && height <= 1.2,
    `a human figure must be human-proportioned, got a height of ${height.toFixed(3)}`);
  const centre = (standing.box.min.y + standing.box.max.y) / 2;
  assert.ok(Math.abs(centre) < 0.12,
    `the figure must stand about its own origin, got a centre of ${centre.toFixed(3)}`);
  // The walking and seated poses must genuinely differ from standing.
  const standingSize = measure(humanAnatomy(32, 0), "standing").size.map(v => +v.toFixed(4)).join(",");
  const walkingSize = measure(humanAnatomy(32, 1), "walking").size.map(v => +v.toFixed(4)).join(",");
  const seatedSize = measure(humanAnatomy(32, 2), "seated").size.map(v => +v.toFixed(4)).join(",");
  assert.notEqual(walkingSize, standingSize, "the walking pose must not be the standing pose");
  assert.notEqual(seatedSize, standingSize, "the seated pose must not be the standing pose");
}

// ---------------------------------------------------------------- every species resolves

{
  const failures = [];
  for (const species of WILDLIFE_SPECIES) {
    const kind = wildlifeProceduralKind(species, { id: "torso" });
    const variant = wildlifeOrganismVariant(species);
    try {
      const anatomy = kind.replace(/^wildlife-organism-/, "");
      const geometry = createOrganismGeometry(anatomy, "ultra", variant);
      const position = geometry.getAttribute("position");
      assert.ok(position.count > 0, "geometry must not be empty");
      for (const name of ATTRIBUTES) assert.ok(geometry.getAttribute(name), `missing ${name}`);
    } catch (error) {
      failures.push(`${species.id} (${species.geometryClass} -> ${kind}): ${error.message}`);
    }
  }
  assert.deepEqual(failures, [], `every species must build a mesh; failures:\n${failures.join("\n")}`);
  assert.equal(WILDLIFE_SPECIES.length, 44, "the catalogue size is pinned so a new species is noticed");
}

// Every terrestrial class now has a real anatomy rather than the generic part assembly.
{
  const terrestrial = new Set(WILDLIFE_SPECIES.map(s => s.geometryClass).filter(c => !c.startsWith("fish-") &&
    !["ray", "octopus", "jelly", "crab", "mussel"].includes(c)));
  for (const geometryClass of terrestrial) {
    assert.ok(WILDLIFE_ANATOMY_KINDS.has(geometryClass),
      `${geometryClass} must resolve to a species anatomy, not the generic part assembly`);
    assert.ok(ORGANISM_KINDS.includes(geometryClass), `${geometryClass} must be a known organism kind`);
  }
  // The classes that share an anatomy must be able to differ within it.
  assert.ok(wildlifeMorphotypeCount("ungulate") >= 3, "the ungulates must offer deer, moose and zebra");
  assert.ok(wildlifeMorphotypeCount("bird") >= 3, "the birds must offer a wader, a raptor and a penguin");
  assert.ok(wildlifeMorphotypeCount("semi-aquatic") >= 3, "the semi-aquatic class must offer three builds");
}

// The morphotype is a property of the species, not of where an individual stands: two individuals of
// one species must never be built as two different animals.
{
  const byClass = new Map();
  for (const species of WILDLIFE_SPECIES) {
    if (!byClass.has(species.geometryClass)) byClass.set(species.geometryClass, new Set());
    byClass.get(species.geometryClass).add(wildlifeOrganismVariant(species));
  }
  const moose = WILDLIFE_SPECIES.find(s => s.id === "moose");
  const zebra = WILDLIFE_SPECIES.find(s => s.id === "zebra");
  const deer = WILDLIFE_SPECIES.find(s => s.id === "red_deer");
  assert.equal(wildlifeOrganismVariant(moose), 1, "the moose must take the moose morphotype");
  assert.equal(wildlifeOrganismVariant(zebra), 2, "the zebra must take the zebra morphotype");
  assert.equal(wildlifeOrganismVariant(deer), 0, "the red deer must take the default morphotype");
  // The same species must answer the same way every time it is asked.
  for (const species of WILDLIFE_SPECIES) {
    const first = wildlifeMorphotypeIndex(species);
    assert.equal(wildlifeMorphotypeIndex(species), first, `${species.id} must have a stable morphotype`);
  }
}

// ---------------------------------------------------------------- no species silently becomes the wrong animal

// This is the bug this guard exists for. A species in a class with several builds that named none of
// them was silently given the class's FIRST build, so the albatross was drawn as a long-legged wading
// crane - the emperor penguin had been declared but the albatross had not, and nothing said so. Asking
// for every species must now assign every one of them, with no silent fallback.
{
  const unassigned = [];
  for (const species of WILDLIFE_SPECIES) {
    const total = wildlifeMorphotypeCount(species.geometryClass);
    if (total < 2) continue;
    const before = unassignedMorphotypeSpecies().length;
    wildlifeMorphotypeIndex(species);
    if (unassignedMorphotypeSpecies().length > before) unassigned.push(`${species.id} (${species.geometryClass})`);
  }
  assert.deepEqual(unassigned, [],
    `every species in a multi-build class must name its build, or it is drawn as the wrong animal:\n${unassigned.join("\n")}`);
}

// A morphotype list must never offer more builds than the anatomy module can draw, or the extra names
// alias onto an existing build and two species that should differ come out identical.
{
  const drawsBuilds = {
    bipedAnatomy: 5, pachydermAnatomy: 4, smallFaunaAnatomy: 3, semiAquaticAnatomy: 3,
    ungulateAnatomy: 3, carnivoreAnatomy: 3, humanAnatomy: 3
  };
  const moduleFor = geometryClass =>
    ["bird", "raptor", "penguin"].includes(geometryClass) ? "bipedAnatomy"
      : ["elephant", "giraffe", "bovine"].includes(geometryClass) ? "pachydermAnatomy"
        : ["boar", "marsupial", "small-mammal"].includes(geometryClass) ? "smallFaunaAnatomy"
          : geometryClass === "semi-aquatic" ? "semiAquaticAnatomy"
            : geometryClass === "ungulate" ? "ungulateAnatomy"
              : geometryClass === "human" ? "humanAnatomy"
                : ["canid", "feline", "bear"].includes(geometryClass) ? "carnivoreAnatomy" : null;
  const overclaimed = [];
  for (const [geometryClass, morphotypes] of Object.entries(WILDLIFE_MORPHOTYPES)) {
    const module = moduleFor(geometryClass);
    if (!module) continue;
    if (morphotypes.length > drawsBuilds[module]) {
      overclaimed.push(`${geometryClass}: lists ${morphotypes.length} builds but ${module} draws ${drawsBuilds[module]}`);
    }
  }
  assert.deepEqual(overclaimed, [],
    `a morphotype list must not promise a build the anatomy cannot draw:\n${overclaimed.join("\n")}`);
}

const human = measure(humanAnatomy(48, 0), "summary");
console.log(
  `Humanoid anatomies verified (44/44 species build a mesh; human standing ${human.vertices} vertices at detail 48, ` +
  `${human.size.map(v => v.toFixed(3)).join(" x ")} tall-first) passed`
);
