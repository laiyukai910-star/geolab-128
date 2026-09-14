import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === "three"
      ? new URL("../vendor/three/three.module.js", import.meta.url).href
      : specifier.startsWith("three/addons/")
        ? new URL(`../vendor/three/addons/${specifier.slice(13)}`, import.meta.url).href
        : specifier, context);
  }
});
const THREE = await import("three");
const { RoundedBoxGeometry } = await import("three/addons/geometries/RoundedBoxGeometry.js");
const { mergeGeometries, mergeVertices } = await import("three/addons/utils/BufferGeometryUtils.js");
const { buildingDetailParts, ENVELOPE_DETAIL_KINDS } = await import("../src/facilityEnvelopeDetails.js");

// The helper set is copied from facilityGeometry.js with the one change the module contract needs:
// each helper returns the part it emitted, so the caller can append the returned array.
function makeHelpers(tier) {
  const radial = [16, 28, 44][tier], parts = [];
  const wall = 0xe7e4dc, trim = 0xf4f1e9, glass = 0x6d9cab, metal = 0x9eacb0;
  const put = (geometry, color, position = [0, 0, 0], rotation = [0, 0, 0]) => {
    geometry.rotateX(rotation[0]); geometry.rotateY(rotation[1]); geometry.rotateZ(rotation[2]);
    geometry.translate(...position);
    const rgb = new THREE.Color(color), values = new Float32Array(geometry.attributes.position.count * 3);
    const response = new Float32Array(geometry.attributes.position.count * 2);
    const glazed = [glass, 0x679aaa, 0x94bdb1, 0xaccdc0].includes(color);
    const metallic = color === metal;
    for (let i = 0; i < response.length; i += 2) { response[i] = glazed ? 0.18 : metallic ? 0.40 : 0.86; response[i + 1] = metallic ? 0.55 : 0; }
    for (let i = 0; i < values.length; i += 3) rgb.toArray(values, i);
    geometry.setAttribute("color", new THREE.BufferAttribute(values, 3));
    geometry.setAttribute("constructionResponse", new THREE.BufferAttribute(response, 2));
    const source = geometry.index ? geometry.toNonIndexed() : geometry;
    source.deleteAttribute("uv"); parts.push(source);
    if (source !== geometry) geometry.dispose();
    return source;
    return source;
  };
  const box = (p, size, color = wall, bevel = 0.006) => put(
    new RoundedBoxGeometry(...size, tier + 1, Math.min(bevel, ...size.map(s => s * 0.16))), color, p);
  const cylinder = (p, radius, height, color = metal) => put(new THREE.CylinderGeometry(radius, radius, height, radial), color, p);
  const tube = (points, radius, color = metal) => put(new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 12 + tier * 8, radius, 8 + tier * 4, false), color);
  const ring = (radius, tubeRadius, p, color = metal) => put(new THREE.TorusGeometry(radius, tubeRadius, 6 + tier * 2, radial), color, p, [Math.PI / 2, 0, 0]);
  return { helpers: { box, cylinder, tube, ring, put, tier, radial, colors: { wall, trim, glass, metal } }, parts };
}
const verticesOf = geometries => geometries.reduce((total, geometry) => total + geometry.getAttribute("position").count, 0);
const checksumOf = geometries => geometries.reduce((sum, geometry) =>
  sum + geometry.getAttribute("position").array.reduce((inner, value) => inner + Math.round(value * 1e6), 0), 0);
const boundsOf = geometries => geometries.reduce((box, geometry) => {
  geometry.computeBoundingBox();
  return box.union(geometry.boundingBox);
}, new THREE.Box3());

// The envelopes of the three bodies, plus the headroom the members legitimately add over a roof.
const ENVELOPE_LIMITS = Object.freeze({
  "setback-tower": { min: [-0.49, -0.505, -0.49], max: [0.49, 0.575, 0.49] },
  "courtyard-midrise": { min: [-0.5, -0.5, -0.5], max: [0.5, 0.43, 0.5] },
  "cross-plan-civic": { min: [-0.5, -0.5, -0.5], max: [0.5, 0.34, 0.63] }
});

assert.deepEqual(buildingDetailParts("hipped-roof", makeHelpers(1).helpers), [], "a kind this module does not own returns no members");
assert.deepEqual(buildingDetailParts(undefined, makeHelpers(1).helpers), [], "an unknown kind returns no members");

const report = [];
for (const kind of ENVELOPE_DETAIL_KINDS) {
  let previousVertices = 0;
  for (const tier of [0, 1, 2]) {
    const first = makeHelpers(tier), second = makeHelpers(tier);
    const geometries = buildingDetailParts(kind, first.helpers);
    const repeat = buildingDetailParts(kind, second.helpers);
    assert.ok(Array.isArray(geometries) && geometries.length > 0, `${kind}: tier ${tier} must return construction members`);
    assert.equal(geometries.length, first.parts.length, `${kind}: every emitted member must be handed back`);
    geometries.forEach((geometry, index) => assert.equal(geometry, first.parts[index], `${kind}: returned members must be the helper output`));
    for (const geometry of geometries) {
      const position = geometry.getAttribute("position"), color = geometry.getAttribute("color"), response = geometry.getAttribute("constructionResponse");
      assert.ok(position && position.count > 0, `${kind}: every member needs vertices`);
      assert.equal(color?.count, position.count, `${kind}: member colour must cover every vertex`);
      assert.equal(response?.count, position.count, `${kind}: member construction response must cover every vertex`);
      assert.equal(geometry.getAttribute("normal")?.count, position.count, `${kind}: members must merge with the caller's shaded parts`);
      assert.equal(geometry.index, null, `${kind}: members must arrive non-indexed for the caller's merge`);
      for (const value of position.array) assert.ok(Number.isFinite(value) && Math.abs(value) <= 0.7, `${kind}: member coordinates must stay inside the normalized envelope`);
      for (const value of geometry.getAttribute("normal").array) assert.ok(Number.isFinite(value), `${kind}: member normals must be finite`);
      for (const value of color.array) assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, `${kind}: member colours must be completed by the helper`);
      for (let i = 0; i < response.count * 2; i++) assert.ok(Number.isFinite(response.array[i]) && response.array[i] >= 0 && response.array[i] <= 1, `${kind}: construction response must stay in range`);
    }
    const vertices = verticesOf(geometries);
    // The caller concatenates these members with its own parts and re-indexes the result, so they
    // have to survive exactly that pipeline.
    const merged = mergeGeometries(geometries, false);
    assert.ok(merged, `${kind}: members must merge with the caller's own parts`);
    assert.equal(merged.getAttribute("position").count, vertices, `${kind}: merging must not drop vertices`);
    for (const name of ["position", "normal", "color", "constructionResponse"]) {
      assert.equal(merged.getAttribute(name)?.count, vertices, `${kind}: merged members need complete ${name}`);
    }
    const indexed = mergeVertices(merged, 1e-6);
    assert.ok(indexed.index.count > 0, `${kind}: merged members must re-index`);
    merged.dispose(); indexed.dispose();
    assert.equal(verticesOf(repeat), vertices, `${kind}: tier ${tier} must be deterministic in vertex count`);
    assert.equal(checksumOf(repeat), checksumOf(geometries), `${kind}: tier ${tier} must be deterministic in every coordinate`);
    assert.ok(vertices >= previousVertices, `${kind}: tier ${tier} must not lose members against the coarser tier`);
    previousVertices = vertices;
    // The members must fit the body's envelope, so the caller's unit-box fit does not change.
    const bounds = boundsOf(geometries), limits = ENVELOPE_LIMITS[kind];
    for (const [axis, index] of [["x", 0], ["y", 1], ["z", 2]]) {
      assert.ok(bounds.min[axis] >= limits.min[index], `${kind}: members must not grow the envelope below ${axis}`);
      assert.ok(bounds.max[axis] <= limits.max[index], `${kind}: members must not grow the envelope above ${axis}`);
    }
    report.push(`${kind} tier ${tier}: ${geometries.length} members, ${vertices} vertices, `
      + `x ${bounds.min.x.toFixed(3)}..${bounds.max.x.toFixed(3)} y ${bounds.min.y.toFixed(3)}..${bounds.max.y.toFixed(3)} `
      + `z ${bounds.min.z.toFixed(3)}..${bounds.max.z.toFixed(3)}`);
    for (const geometry of geometries) geometry.dispose();
    for (const geometry of repeat) geometry.dispose();
  }
}
console.log(`Facility envelope details passed — ${report.join("; ")}`);
