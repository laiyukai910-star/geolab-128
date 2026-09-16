import * as THREE from "three";
import { GLTFLoader } from "../vendor/three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "../vendor/three/addons/utils/BufferGeometryUtils.js";

/*
 * Bundled CC0 model assets.
 *
 * The application builds its geometry procedurally, which keeps it small and lets every shape carry
 * the model's own classification. That is the right default, but it is not a reason to hand-write a
 * tree when a good public-domain one exists and reads better. This module loads the bundled
 * collection, and records where each model came from so a rendered scene can always answer what it is
 * showing and under what licence.
 *
 * The collection is Kenney's Nature Kit, released under CC0 1.0. CC0 places the work in the public
 * domain: bundling it inside this MIT repository and redistributing it are both permitted, and no
 * credit is legally required. The credit is recorded anyway, because the licence file that ships with
 * the collection asks for it and because a scene that cannot name its sources is hard to audit.
 *
 * What this is NOT: these are stylised models, not surveyed specimens. A bundled tree is a
 * representation of a tree, not a measurement of one. Anything derived from the model's own arrays -
 * lithology, cover, process - remains the scientific layer, and this module never writes to it.
 */

const BASE = "../vendor/cc0/nature-kit";
const MANIFEST_URL = `${BASE}/manifest.json`;
export const CC0_COLLECTION = Object.freeze({
  id: "kenney-nature-kit",
  name: "Kenney Nature Kit",
  version: "2.1",
  source: "https://kenney.nl/assets/nature-kit",
  licence: "CC0-1.0",
  licenceUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  attributionRequired: false,
  attribution: "Kenney (www.kenney.nl)"
});

/** The credit string to display. Short enough for a caption, complete enough to be honest. */
export const CC0_ATTRIBUTION_TEXT = `${CC0_COLLECTION.name} by ${CC0_COLLECTION.attribution}, ${CC0_COLLECTION.licence}`;

let manifestPromise = null;
const geometryCache = new Map();

/**
 * The collection manifest: which models are bundled, what each is, and its provenance.
 * Fetched once and memoised, because it is static and small.
 */
export function loadCc0Manifest() {
  if (!manifestPromise) {
    manifestPromise = fetch(MANIFEST_URL).then(response => {
      if (!response.ok) throw new Error(`CC0 manifest unavailable: HTTP ${response.status}`);
      return response.json();
    });
  }
  return manifestPromise;
}

/** Every bundled model's metadata, without loading any geometry. */
export async function cc0ModelList() {
  const manifest = await loadCc0Manifest();
  return manifest.models;
}

/** Models of one category: tree, rock, plant or human. */
export async function cc0ModelsByCategory(category) {
  const models = await cc0ModelList();
  return models.filter(model => model.category === category);
}

/**
 * Load one model's geometry from the bundled GLB.
 *
 * The GLB is parsed here rather than handed to a scene, so the caller receives plain geometry it can
 * instance, merge or scale like any other asset, and so the geometry carries its provenance on
 * `userData` without depending on the loader's own object graph surviving.
 */
export async function loadCc0Geometry(id) {
  const key = String(id);
  if (geometryCache.has(key)) return geometryCache.get(key);
  const models = await cc0ModelList();
  const entry = models.find(model => model.id === key);
  if (!entry) throw new Error(`Unknown CC0 model: ${key}`);
  const response = await fetch(`${BASE}/models/${key}.glb`);
  if (!response.ok) throw new Error(`CC0 model ${key} unavailable: HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();
  const gltf = await new Promise((resolve, reject) => {
    new GLTFLoader().parse(buffer, "", resolve, reject);
  });
  gltf.scene.updateMatrixWorld(true);
  // Bake each mesh's world transform into its geometry, so the caller gets geometry in the model's
  // own coordinates and can instance it without carrying the loader's node hierarchy around.
  const parts = [];
  gltf.scene.traverse(node => {
    if (!node.isMesh || !node.geometry) return;
    const geometry = node.geometry.clone();
    geometry.applyMatrix4(node.matrixWorld);
    // The collection's meshes carry uv and normal but not colour, so a vertex colour attribute is
    // added flat white. Without it the geometry cannot be merged with the application's own, which
    // all carry colour.
    if (!geometry.getAttribute("color")) {
      const count = geometry.getAttribute("position").count;
      const colors = new Float32Array(count * 3).fill(1);
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    }
    geometry.userData.cc0 = {
      collection: CC0_COLLECTION.id,
      id: entry.id,
      category: entry.category,
      licence: CC0_COLLECTION.licence,
      attribution: CC0_COLLECTION.attribution
    };
    parts.push(geometry);
  });
  const result = {
    id: entry.id,
    category: entry.category,
    description: entry.description,
    parts,
    provenance: {
      collection: CC0_COLLECTION.name,
      version: CC0_COLLECTION.version,
      source: CC0_COLLECTION.source,
      licence: CC0_COLLECTION.licence,
      licenceUrl: CC0_COLLECTION.licenceUrl,
      attribution: CC0_COLLECTION.attribution,
      attributionRequired: CC0_COLLECTION.attributionRequired
    }
  };
  geometryCache.set(key, result);
  return result;
}

/**
 * The merged geometry of one model, ready for instancing.
 *
 * Returns null when the model has not been preloaded or its load failed, so a caller can fall back to
 * its own procedural geometry rather than stalling on the network. Loading is asynchronous by nature;
 * a synchronous factory should therefore ask this and have an answer ready, which is what
 * `preloadCc0Collection` is for.
 */
export function cc0GeometrySync(id) {
  const entry = geometryCache.get(String(id));
  if (!entry) return null;
  const merged = mergeCc0Parts(entry);
  return merged;
}

/** Merge a loaded entry's parts once and remember the result. */
function mergeCc0Parts(entry) {
  if (entry.merged) return entry.merged;
  const merged = mergeGeometries(entry.parts, false);
  if (!merged) return null;
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  merged.userData.cc0 = { ...entry.provenance, id: entry.id, category: entry.category };
  entry.merged = merged;
  return merged;
}

/**
 * Load every bundled model and keep the merged geometry in memory.
 *
 * Called once at start-up so the synchronous placement paths have real models to instance instead of
 * having to fall back. Resolves with a report rather than throwing: a collection that partly fails to
 * load should leave the application drawing its own geometry, not fail to start.
 */
export async function preloadCc0Collection({ concurrency = 4 } = {}) {
  const models = await cc0ModelList();
  const loaded = [], failed = [];
  const queue = [...models];
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, async () => {
    while (queue.length) {
      const model = queue.shift();
      try {
        const entry = await loadCc0Geometry(model.id);
        if (mergeCc0Parts(entry)) loaded.push(model.id); else failed.push({ id: model.id, reason: "merge failed" });
      } catch (error) {
        failed.push({ id: model.id, reason: error.message });
      }
    }
  });
  await Promise.all(workers);
  return { requested: models.length, loaded: loaded.length, failed };
}

/** Every loaded model of one category, merged and ready to instance. */
export function cc0GeometriesByCategory(category) {
  const result = [];
  for (const entry of geometryCache.values()) {
    if (entry.category !== category) continue;
    const merged = mergeCc0Parts(entry);
    if (merged) result.push({ id: entry.id, description: entry.description, geometry: merged });
  }
  return result;
}

/** Free every cached geometry. Callers own the geometries they were handed. */
export function disposeCc0Cache() {
  for (const entry of geometryCache.values()) {
    entry.merged?.dispose();
    for (const part of entry.parts) part.dispose();
  }
  geometryCache.clear();
}

/** Diagnostics: what is bundled, and what has actually been loaded. */
export function cc0Diagnostics() {
  return {
    collection: CC0_COLLECTION.id,
    licence: CC0_COLLECTION.licence,
    attribution: CC0_ATTRIBUTION_TEXT,
    loaded: [...geometryCache.keys()],
    cachedCount: geometryCache.size
  };
}
