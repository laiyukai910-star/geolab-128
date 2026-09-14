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
const { civilDetailParts } = await import("../src/facilityCivilDetails.js");

// Faithful copies of the helpers in facilityGeometry.js, so the module is exercised against the same
// primitives, the same colour bake and the same constructionResponse encoding it meets in place.
function makeHelpers(tier) {
  const radial = [16, 28, 44][tier], parts = [];
  const wall = 0xe7e4dc, trim = 0xf4f1e9, glass = 0x6d9cab, metal = 0x9eacb0;
  const put = (geometry, color, position = [0, 0, 0], rotation = [0, 0, 0]) => {
    geometry.rotateX(rotation[0]); geometry.rotateY(rotation[1]); geometry.rotateZ(rotation[2]);
    geometry.translate(...position);
    const rgb = new THREE.Color(color), values = new Float32Array(geometry.attributes.position.count * 3);
    const response = new Float32Array(geometry.attributes.position.count * 2);
    const glazed = [glass,0x679aaa,0x94bdb1,0xaccdc0].includes(color);
    const metallic = color === metal;
    for(let i=0;i<response.length;i+=2){response[i]=glazed?0.18:metallic?0.40:0.86;response[i+1]=metallic?0.55:0;}
    for (let i = 0; i < values.length; i += 3) rgb.toArray(values, i);
    geometry.setAttribute("color", new THREE.BufferAttribute(values, 3));
    geometry.setAttribute("constructionResponse", new THREE.BufferAttribute(response, 2));
    const source = geometry.index ? geometry.toNonIndexed() : geometry;
    source.deleteAttribute("uv"); parts.push(source);
    if (source !== geometry) geometry.dispose();
    return source;
  };
  const box = (p, size, color = wall, bevel = 0.006) => put(
    new RoundedBoxGeometry(...size, tier + 1, Math.min(bevel, ...size.map(s => s * 0.16))), color, p);
  const cylinder = (p, radius, height, color = metal) => put(new THREE.CylinderGeometry(radius, radius, height, radial), color, p);
  const tube = (points, radius, color = metal) => put(new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 12 + tier * 8, radius, 8 + tier * 4, false), color);
  const ring = (radius, tubeRadius, p, color = metal) => put(new THREE.TorusGeometry(radius, tubeRadius, 6 + tier * 2, radial), color, p, [Math.PI / 2, 0, 0]);
  return { box, cylinder, tube, ring, put, tier, radial, colors: { wall, trim, glass, metal }, parts };
}

const KINDS = ["buttress-dam", "stepped-spillway", "water-tower-tank", "stadium-bowl", "crane-boom", "crowned-road"];

// The box each kind's members must stay inside, as [min, max] per axis, next to the bounds that kind
// already occupies in facilityGeometry.js: keeping inside them leaves the assembly's normalised
// envelope unchanged, which is what stops the added members from rescaling the existing assembly.
const ENVELOPE = {
  // occupies x[-0.500, 0.500] y[-0.4850, 0.4975] z[-0.4262, 0.3150]
  "buttress-dam": [[-0.5, 0.5], [-0.49, 0.498], [-0.43, 0.315]],
  // occupies x[-0.435, 0.435] y[-0.4575, 0.5268] z[-0.5225, 0.5225]; the basin apron sits below the
  // lowest riser, still inside the normalised band
  "stepped-spillway": [[-0.44, 0.44], [-0.485, 0.5], [-0.53, 0.53]],
  // occupies x[-0.409, 0.535] y[-0.4500, 0.4955] z[-0.409, 0.428]; the brief puts the legs at y ~ -0.5
  "water-tower-tank": [[-0.42, 0.42], [-0.49, 0.42], [-0.42, 0.42]],
  // occupies x[-0.492, 0.492] y[-0.4675, 0.3300] z[-0.492, 0.492]; floodlight masts and the roof edge
  // necessarily rise above the rim, which lengthens the y extent by ~12%
  "stadium-bowl": [[-0.5, 0.5], [-0.47, 0.46], [-0.5, 0.5]],
  // occupies x[-0.508, 0.508] y[-0.4000, 0.1320] z[-0.1320, 0.1320]
  "crane-boom": [[-0.51, 0.51], [-0.41, 0.135], [-0.135, 0.135]],
  // occupies x[-0.500, 0.500] y[-0.0010, 0.0370] z[-0.500, 0.500]; kerb upstands and the footway rise
  // above the flat kerb strips they replace
  "crowned-road": [[-0.5, 0.5], [-0.01, 0.06], [-0.5, 0.5]]
};

const summary = [];
for (const kind of KINDS) {
  const envelope = ENVELOPE[kind], counts = [];
  for (const tier of [0, 1, 2]) {
    const helpers = makeHelpers(tier);
    const details = civilDetailParts(kind, helpers);
    assert.ok(Array.isArray(details) && details.length > 0, `${kind}: members required at tier ${tier}`);
    assert.equal(details.length, helpers.parts.length, `${kind}: every member must be registered through put exactly once`);
    details.forEach((geometry, index) => assert.equal(geometry, helpers.parts[index], `${kind}: return the registered geometries`));
    let vertices = 0;
    for (const geometry of details) {
      const position = geometry.attributes.position, color = geometry.attributes.color;
      const response = geometry.attributes.constructionResponse, normal = geometry.attributes.normal;
      assert.ok(position && position.count > 0, `${kind}: members require positions`);
      assert.equal(geometry.index, null, `${kind}: members are merged non-indexed`);
      assert.deepEqual(Object.keys(geometry.attributes).sort(),
        ["color", "constructionResponse", "normal", "position"], `${kind}: only put()'s attributes`);
      assert.equal(color.count, position.count, `${kind}: a colour per vertex`);
      assert.equal(response.count, position.count, `${kind}: a construction response per vertex`);
      assert.equal(normal.count, position.count, `${kind}: a normal per vertex`);
      for (const value of color.array) assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, `${kind}: colour range`);
      for (const value of response.array) assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, `${kind}: response range`);
      for (const value of normal.array) assert.ok(Number.isFinite(value), `${kind}: finite normals`);
      for (let vertex = 0; vertex < position.count; vertex++) {
        const point = [position.getX(vertex), position.getY(vertex), position.getZ(vertex)];
        for (let axis = 0; axis < 3; axis++) {
          assert.ok(Number.isFinite(point[axis]), `${kind}: finite coordinates`);
          assert.ok(point[axis] >= envelope[axis][0] - 1e-6 && point[axis] <= envelope[axis][1] + 1e-6,
            `${kind} tier ${tier}: axis ${axis} at ${point[axis].toFixed(4)} escapes the kind envelope`);
        }
      }
      vertices += position.count;
    }
    counts.push(vertices);
    if (tier > 0) assert.ok(vertices >= counts[tier - 1], `${kind}: tier ${tier} refines tier ${tier - 1}`);
  }
  const repeat = civilDetailParts(kind, makeHelpers(1));
  assert.equal(repeat.reduce((total, geometry) => total + geometry.attributes.position.count, 0), counts[1],
    `${kind}: two calls at the same tier must agree`);
  summary.push(`${kind} ${counts.join("/")} vertices at tiers 0/1/2`);
}
const unhandled = makeHelpers(1);
assert.deepEqual(civilDetailParts("setback-tower", unhandled), [], "unhandled kinds must return []");
assert.deepEqual(civilDetailParts("observatory-dome", unhandled), []);
assert.equal(unhandled.parts.length, 0, "unhandled kinds must not register members");
console.log(`Civil detail members verified inside their kind envelopes (${summary.join(", ")})`);
