import { registerHooks } from "node:module";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Require module-resolved URLs: browser fetch resolves bare paths against the page, not the module.
let failManifestOnce = true;
globalThis.fetch = async (url) => {
  assert.ok(url instanceof URL, "asset requests must not depend on the document base URL");
  if (failManifestOnce && url.pathname.endsWith("manifest.json")) {
    failManifestOnce = false;
    return { ok: false, status: 503 };
  }
  const resolved = fileURLToPath(url);
  if (!existsSync(resolved)) return { ok: false, status: 404, json: async () => { throw new Error("404"); } };
  const buffer = await readFile(resolved);
  return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(buffer.toString("utf8")),
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  };
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "three") return nextResolve(new URL("../vendor/three/three.module.js", import.meta.url).href, context);
    if (specifier.startsWith("three/addons/")) {
      return nextResolve(new URL(`../vendor/three/addons/${specifier.slice("three/addons/".length)}`, import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  }
});

const {
  loadCc0Manifest, cc0ModelList, cc0ModelsByCategory, loadCc0Geometry,
  cc0Diagnostics, disposeCc0Cache, CC0_COLLECTION, CC0_ATTRIBUTION_TEXT
} = await import("../src/cc0Assets.js");
await assert.rejects(loadCc0Manifest(), /503/);

// ---------------------------------------------------------------- provenance is recorded, not assumed

{
  const manifest = await loadCc0Manifest();
  assert.equal(manifest.licence, "CC0-1.0", "the collection must be recorded as CC0");
  assert.equal(manifest.licenceUrl, "https://creativecommons.org/publicdomain/zero/1.0/");
  assert.equal(manifest.source, "https://kenney.nl/assets/nature-kit", "the source must be the real landing page");
  assert.equal(manifest.attributionRequired, false,
    "CC0 requires no attribution, and claiming otherwise would misstate the licence");
  assert.ok(manifest.models.length > 0, "the collection must bundle at least one model");
  assert.ok(manifest.curated.includes(`${manifest.models.length} of 329`),
    "the manifest must say how much of the collection is bundled, so a partial bundle cannot look complete");
  assert.ok(CC0_COLLECTION.licence === "CC0-1.0");
  assert.ok(CC0_ATTRIBUTION_TEXT.includes("Kenney") && CC0_ATTRIBUTION_TEXT.includes("CC0"),
    "the credit string must name the author and the licence");
  // The licence file that shipped with the collection is kept verbatim.
  const licencePath = fileURLToPath(new URL("../vendor/cc0/nature-kit/KENNEY-LICENSE.txt", import.meta.url));
  const licenceText = await readFile(licencePath, "utf8");
  assert.ok(/Creative Commons Zero, CC0/.test(licenceText),
    "the shipped licence file must be the one stating CC0");
  assert.ok(/kenney\.nl/i.test(licenceText), "the shipped licence file must name the author");
}

// ---------------------------------------------------------------- every bundled model is a real model

{
  const models = await cc0ModelList();
  const categories = new Set(models.map(model => model.category));
  for (const expected of ["tree", "rock", "plant", "human"]) {
    assert.ok(categories.has(expected), `the bundle must cover ${expected}`);
  }
  // Every manifest entry must have a file on disk, and every file must be in the manifest. A model
  // listed but missing would fail at render time, and one present but unlisted would ship unrecorded.
  const { readdirSync } = await import("node:fs");
  const onDisk = readdirSync(fileURLToPath(new URL("../vendor/cc0/nature-kit/models/", import.meta.url)))
    .filter(name => name.endsWith(".glb")).map(name => name.replace(/\.glb$/, "")).sort();
  assert.deepEqual(onDisk, models.map(model => model.id).sort(),
    "the bundled files and the manifest must list exactly the same models");

  let totalBytes = 0, totalTriangles = 0, totalParts = 0;
  for (const model of models) {
    const loaded = await loadCc0Geometry(model.id);
    assert.equal(loaded.id, model.id);
    assert.ok(loaded.parts.length > 0, `${model.id} must contain at least one mesh`);
    for (const part of loaded.parts) {
      const position = part.getAttribute("position");
      assert.ok(position && position.count > 0, `${model.id} must have vertices`);
      assert.ok(part.getAttribute("normal"), `${model.id} must carry normals`);
      assert.ok(part.getAttribute("uv"), `${model.id} must carry uvs`);
      // Source material factors must survive merging into the vertex-colour renderer.
      const colour = part.getAttribute("color");
      assert.ok(colour, `${model.id} must carry a colour attribute so it can be merged`);
      assert.equal(colour.count, position.count, `${model.id} colour count must match positions`);
      for (let i = 0; i < position.array.length; i += 1) {
        assert.ok(Number.isFinite(position.array[i]), `${model.id} must have finite coordinates`);
      }
      // Provenance travels with the geometry, so a scene can always name what it drew.
      assert.equal(part.userData.cc0.licence, "CC0-1.0");
      assert.equal(part.userData.cc0.id, model.id);
      totalTriangles += Math.round((part.index ? part.index.count : position.count) / 3);
      totalParts += 1;
    }
    totalBytes += model.bytes;
  }
  assert.ok(totalParts >= models.length, "each model must contribute at least one mesh part");
  const tree = await loadCc0Geometry("tree_default");
  const palette = new Set(tree.parts.map(part => Array.from(part.attributes.color.array.slice(0,3)).join(',')));
  assert.ok(palette.size > 1, "bark and leaves must retain distinct source material colours");
  console.log(`  ${models.length} models, ${totalParts} mesh parts, ${totalTriangles} triangles, ${Math.round(totalBytes / 1024)} KB`);
}

// ---------------------------------------------------------------- loading is cached and repeatable

{
  const first = await loadCc0Geometry("tree_default");
  const second = await loadCc0Geometry("tree_default");
  assert.equal(first, second, "a repeated load must return the cached entry rather than re-parsing");
  const diagnostics = cc0Diagnostics();
  assert.equal(diagnostics.licence, "CC0-1.0");
  assert.ok(diagnostics.attribution.includes("Kenney"));
  assert.ok(diagnostics.loaded.length > 0, "loaded models must be reported");

  // A category filter returns only that category, and only bundled models.
  const trees = await cc0ModelsByCategory("tree");
  assert.ok(trees.length > 0);
  for (const tree of trees) assert.equal(tree.category, "tree");

  // Dispose must clear the cache rather than leave dangling geometries behind.
  disposeCc0Cache();
  assert.equal(cc0Diagnostics().cachedCount, 0, "dispose must empty the cache");
}

// ---------------------------------------------------------------- failures are reported, not swallowed

{
  await assert.rejects(() => loadCc0Geometry("no_such_model"), /Unknown CC0 model/,
    "an unknown model must raise rather than return undefined");
}

console.log(
  `CC0 assets verified (${CC0_COLLECTION.name} ${CC0_COLLECTION.version}, ${CC0_COLLECTION.licence}, ` +
  `attribution not required but recorded, every bundled model parses) passed`
);
