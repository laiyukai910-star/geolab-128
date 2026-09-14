import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

/**
 * Construction members for the civil and water-works facility kinds.
 *
 * These six kinds are mass forms: a dam wall, a spillway chute, an elevated tank, a stadium bowl, a
 * lattice boom and a carriageway. facilityGeometry.js gives each of them its primary shape; what makes
 * them read as works is the buildable detail - parapets, adit portals, gate gantries, stilling basins,
 * construction joints, chute walls, ring beams, ladders, vomitories, floodlights, truss lacing, kerbs
 * and gullies - which is what this module adds.
 *
 * Every member is registered exactly once through helpers.put, which is what bakes the vertex colour
 * and the constructionResponse attribute; the returned array holds those same registered geometries in
 * registration order. That makes exactly one wiring safe: the caller's put must write to a sink of its
 * own, and the returned array is then added to the assembly under an identity check. facilityGeometry.js
 * wires it that way -
 *   const detailPut = (geometry, color, position, rotation) => put(geometry, color, position, rotation, detailParts);
 *   for (const member of civilDetailParts(kind, { ...helpers, put: detailPut })) if (!parts.includes(member)) parts.push(member);
 * - so a member is never added twice, which would double the merge cost for geometry that renders
 * identically.
 *
 * helpers.box/cylinder/tube/ring are equivalent to the local builders below (facilityGeometry's exact
 * segment counts and bevel clamp), but a wrapper registers a non-indexed copy of a geometry it creates
 * internally, which its caller can never reference again. The module builds primitives locally only so
 * that the returned array can hold precisely what put() was handed; every member still goes through the
 * provided put(), and no attribute is ever built here.
 *
 * Determinism: the members depend only on `kind` and `tier`, and each kind stays inside the envelope
 * facilityGeometry.js already occupies for it, so the assembly's normalised bounds keep their category.
 */
export function civilDetailParts(kind, helpers) {
  const { put, tier, radial, colors } = helpers;
  const { wall, trim, glass, metal } = colors;
  const parts = [];
  const register = (geometry, color, position = [0, 0, 0], rotation = [0, 0, 0]) => {
    // put() only reaches for a copy when it is handed an indexed geometry, so flattening first makes
    // the registered member the very object this module returns.
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    put(flat, color, position, rotation);
    parts.push(flat);
    return flat;
  };
  const bevelOf = (bevel, size) => Math.min(bevel, ...size.map(side => side * 0.16));
  const boxRot = (position, size, color = wall, rotation = [0, 0, 0], bevel = 0.006) => register(
    new RoundedBoxGeometry(size[0], size[1], size[2], tier + 1, bevelOf(bevel, size)), color, position, rotation);
  const box = (position, size, color = wall, bevel = 0.006) => boxRot(position, size, color, [0, 0, 0], bevel);
  // Thin steel: a plain 12-triangle bar, used for bracing rather than for castings.
  const bar = (position, size, color = metal, rotation = [0, 0, 0]) =>
    register(new THREE.BoxGeometry(size[0], size[1], size[2]), color, position, rotation);
  // A bar between two points, turned onto the member axis through put()'s Rz*Ry*Rx rotation order.
  const strut = (from, to, thickness = 0.011, color = metal) => {
    const span = [to[0] - from[0], to[1] - from[1], to[2] - from[2]], length = Math.hypot(...span);
    return bar([(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2],
      [length, thickness, thickness], color,
      [0, -Math.asin(span[2] / length), Math.atan2(span[1], span[0])]);
  };
  // A fabricated ring - a hoop of flat bars at one level. Cheaper than a torus and no less ring-like
  // for the brace rings and cage hoops, which are polygonal fabrications in any case.
  const hoop = (radius, height, centre, segments, thickness = 0.009, color = metal) => {
    for (let index = 0; index < segments; index++) {
      const from = (index / segments) * Math.PI * 2, to = ((index + 1) / segments) * Math.PI * 2;
      strut([centre[0] + Math.cos(from) * radius, height, centre[1] + Math.sin(from) * radius],
        [centre[0] + Math.cos(to) * radius, height, centre[1] + Math.sin(to) * radius], thickness, color);
    }
  };
  const cylinder = (position, radius, height, color = metal, rotation = [0, 0, 0]) =>
    register(new THREE.CylinderGeometry(radius, radius, height, radial), color, position, rotation);
  const tube = (points, radius, color = metal) => register(new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point))),
    12 + tier * 8, radius, 8 + tier * 4, false), color);
  const ring = (radius, tubeRadius, position, color = metal, rotation = [Math.PI / 2, 0, 0]) =>
    register(new THREE.TorusGeometry(radius, tubeRadius, 6 + tier * 2, radial), color, position, rotation);
  // A flat annulus lying in the XZ plane, optionally a sector of one.
  const annulus = (inner, outer, position, color = trim, thetaStart = 0, thetaLength = Math.PI * 2) =>
    register(new THREE.RingGeometry(inner, outer, radial, 1, thetaStart, thetaLength), color, position, [-Math.PI / 2, 0, 0]);

  if (kind === "buttress-dam") {
    // Envelope: wall face z 0.13..0.27, crest slab y 0.4625..0.4975, buttresses downstream at -z,
    // three controlled bays on the upstream face at z 0.272..0.2975. Members stay inside that box.
    // Crest parapet: a coping on the downstream crest lip, with balusters and two rails on its face.
    bar([0, 0.478, 0.036], [0.985, 0.038, 0.022], trim);
    const balusters = 9 + tier * 3;
    for (let i = 0; i < balusters; i++) {
      bar([-0.44 + i * 0.88 / (balusters - 1), 0.467, 0.0245], [0.011, 0.055, 0.013], metal);
    }
    tube([[-0.45, 0.4905, 0.0245], [0, 0.4905, 0.0245], [0.45, 0.4905, 0.0245]], 0.006, metal);
    tube([[-0.45, 0.4765, 0.0245], [0, 0.4765, 0.0245], [0.45, 0.4765, 0.0245]], 0.0045, metal);
    // Gallery/adit portal in the downstream face, in the bay between the first two buttresses: a
    // recessed opening behind a lintel, two jambs and a threshold, all proud of the wall face.
    bar([-0.13, -0.325, 0.126], [0.115, 0.155, 0.012], glass);
    bar([-0.13, -0.235, 0.108], [0.165, 0.028, 0.048], wall);
    bar([-0.1995, -0.318, 0.108], [0.022, 0.19, 0.048], wall);
    bar([-0.0605, -0.318, 0.108], [0.022, 0.19, 0.048], wall);
    bar([-0.13, -0.412, 0.108], [0.165, 0.022, 0.05], trim);
    if (tier >= 1) bar([-0.13, -0.213, 0.104], [0.19, 0.014, 0.042], trim);
    // Spillway gate gantries: columns, a cross beam, a hoist drum and the rope down to each gate.
    for (const gate of [-0.3, 0, 0.3]) {
      for (const offset of [-0.062, 0.062]) bar([gate + offset, 0.2, 0.298], [0.016, 0.30, 0.016], metal);
      bar([gate, 0.36, 0.298], [0.175, 0.02, 0.026], metal);
      cylinder([gate, 0.325, 0.293], 0.02, 0.09, metal, [0, 0, Math.PI / 2]);
      tube([[gate, 0.30, 0.293], [gate, 0.10, 0.29]], 0.005, metal);
      if (tier >= 1) {
        tube([[gate - 0.062, 0.14, 0.298], [gate - 0.028, 0.35, 0.298]], 0.006, metal);
        tube([[gate + 0.062, 0.14, 0.298], [gate + 0.028, 0.35, 0.298]], 0.006, metal);
      }
    }
    if (tier >= 2) bar([0, 0.375, 0.296], [0.9, 0.012, 0.03], metal);
    // Stilling basin at the downstream toe: apron and end sill as castings, baffle rows and training
    // walls standing in it.
    box([0, -0.462, -0.16], [0.96, 0.038, 0.5], wall, 0.004);
    box([0, -0.442, -0.398], [0.96, 0.075, 0.03], wall, 0.004);
    for (let row = 0; row < 2 + tier; row++) for (let block = 0; block < 4 + tier; block++) {
      bar([-0.36 + block * 0.72 / (3 + tier), -0.425, -0.34 + row * 0.10], [0.06, 0.042, 0.05], wall);
    }
    for (const x of [-0.465, 0.465]) box([x, -0.38, -0.16], [0.03, 0.20, 0.5], wall, 0.003);
    // Vertical construction joint lines: four across the upstream face, three between the buttresses.
    for (let i = 0; i <= 3 + tier; i++) {
      bar([-0.4 + i * 0.8 / (3 + tier), -0.02, 0.2715], [0.008, 0.9, 0.005], trim);
    }
    for (const x of [0.095, -0.3575, 0.34]) bar([x, -0.02, 0.1285], [0.008, 0.9, 0.005], trim);
  } else if (kind === "stepped-spillway") {
    // The chute falls 0.84 while running 0.90, from (y 0.42, z -0.45) to (y -0.42, z 0.45), 0.7 wide.
    // drop/span is the fall direction, run/span the slope normal, so a member at arc length s along the
    // chute and height o across it sits at (x, -s*fall + o*run, s*run + o*fall).
    const drop = 0.84, runLength = 0.9, span = Math.hypot(drop, runLength);
    const tilt = Math.atan2(drop, runLength), fall = drop / span, run = runLength / span;
    const onChute = (x, s, o) => [x, -s * fall + o * run, s * run + o * fall];
    // Chute side walls, raised 0.12 above the step surfaces and clear of the existing training walls.
    for (const x of [-0.345, 0.345]) boxRot(onChute(x, 0, 0.035), [0.05, 0.17, 1.14], wall, [tilt, 0, 0], 0.004);
    // Coping line on the -x wall, and coping joints along it.
    bar(onChute(-0.345, 0, 0.127), [0.058, 0.024, 1.08], trim, [tilt, 0, 0]);
    for (let joint = 0; joint <= 2 + tier; joint++) {
      bar(onChute(-0.345, (joint / (2 + tier) - 0.5) * 1.04, 0.1395), [0.062, 0.008, 0.014], trim, [tilt, 0, 0]);
    }
    // Maintenance walkway along one side: the +x coping widened to a walkable slab, on the line the
    // kind's existing training-wall pipework already runs.
    bar(onChute(0.3775, 0, 0.127), [0.115, 0.024, 1.08], trim, [tilt, 0, 0]);
    // Step nosing: a raised arris on the leading edge of every step, as a chute's steps are arrised.
    const steps = 8 + tier * 4, stepDepth = 1 / steps + 0.015;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      bar([0, 0.42 - t * 0.84 + 0.0325, -0.45 + t * 0.9 + stepDepth / 2 - 0.014], [0.7, 0.014, 0.028], trim);
    }
    // Stilling basin at the toe, standing in the last steps: apron, baffles, end sill, training walls.
    box([0, -0.4605, 0.41], [0.72, 0.037, 0.22], wall, 0.004);
    for (let row = 0; row < 2 + tier; row++) for (let block = 0; block < 4 + tier; block++) {
      bar([-0.27 + block * 0.54 / (3 + tier), -0.4225, 0.33 + row * 0.11 / (1 + tier)], [0.055, 0.048, 0.045], wall);
    }
    box([0, -0.4335, 0.503], [0.72, 0.093, 0.03], wall, 0.004);
    for (const x of [-0.355, 0.355]) box([x, -0.4175, 0.41], [0.05, 0.125, 0.22], wall, 0.003);
  } else if (kind === "water-tower-tank") {
    // The bowl is a 0.39-radius cylinder from y -0.05 to 0.32 with a domed top; everything below the
    // soffit is the supporting structure this kind was missing.
    const legs = 4 + tier * 2, footY = -0.46, headY = -0.04;
    const legRadius = y => 0.325 - 0.11905 * (y - footY);
    const legAngle = index => (index / legs) * Math.PI * 2 + Math.PI / 4;
    const legPoint = (index, y) => {
      const angle = legAngle(index), radius = legRadius(y);
      return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
    };
    for (let index = 0; index < legs; index++) {
      // Splayed leg from its footing up to the ring beam under the bowl.
      tube([legPoint(index, footY), legPoint(index, headY)], 0.017, metal);
      // Base pad under each leg.
      const foot = legPoint(index, footY);
      bar([foot[0], -0.462, foot[2]], [0.075, 0.032, 0.075], wall);
    }
    // Cross bracing between adjacent legs: X-braces in every row of bays, plus a ring brace per row.
    const rows = 2 + tier;
    for (let row = 0; row < rows; row++) {
      const low = -0.36 + row * (0.24 / rows), high = low + 0.24 / rows;
      for (let index = 0; index < legs; index++) {
        const next = (index + 1) % legs;
        strut(legPoint(index, low), legPoint(next, high), 0.011, metal);
        strut(legPoint(next, low), legPoint(index, high), 0.011, metal);
      }
      hoop(legRadius(low), low, [0, 0], 12 + tier * 4, 0.009, metal);
    }
    // Ring beam under the bowl: a top and bottom ring, raked struts up to the tank soffit.
    ring(legRadius(headY) + 0.003, 0.02, [0, -0.05, 0], metal);
    ring(legRadius(headY) + 0.003, 0.012, [0, -0.088, 0], metal);
    const rakes = 6 + tier * 2;
    for (let index = 0; index < rakes; index++) {
      const angle = (index / rakes) * Math.PI * 2, radius = legRadius(headY) + 0.003;
      strut([Math.cos(angle) * radius, -0.092, Math.sin(angle) * radius],
        [Math.cos(angle) * 0.20, -0.046, Math.sin(angle) * 0.20], 0.010, metal);
    }
    // Caged access ladder up one leg: two rails, rungs and cage hoops with their straps.
    const ladderAngle = legAngle(0), railX = Math.cos(ladderAngle), railZ = Math.sin(ladderAngle);
    const ladderRadius = 0.345, centreX = railX * ladderRadius, centreZ = railZ * ladderRadius;
    const tangent = [-railZ, 0, railX];
    for (const side of [-1, 1]) {
      strut([centreX + tangent[0] * 0.028 * side, -0.44, centreZ + tangent[2] * 0.028 * side],
        [centreX + tangent[0] * 0.028 * side, -0.03, centreZ + tangent[2] * 0.028 * side], 0.012, metal);
    }
    const rungs = 9 + tier * 4;
    for (let index = 0; index < rungs; index++) {
      bar([centreX, -0.42 + index * (0.37 / (rungs - 1)), centreZ], [0.062, 0.008, 0.012], metal,
        [0, -(Math.PI / 2 + ladderAngle), 0]);
    }
    for (const height of [-0.34, -0.22, -0.10]) {
      hoop(0.055, height, [centreX, centreZ], 8 + tier * 2, 0.005, metal);
    }
    for (const side of [-1, 1]) {
      strut([centreX + tangent[0] * 0.055 * side, -0.32, centreZ + tangent[2] * 0.055 * side],
        [centreX + tangent[0] * 0.055 * side, -0.08, centreZ + tangent[2] * 0.055 * side], 0.010, metal);
    }
    strut([centreX + railX * 0.055, -0.32, centreZ + railZ * 0.055],
      [centreX + railX * 0.055, -0.08, centreZ + railZ * 0.055], 0.010, metal);
    // Inlet/outlet pipe down from the bowl to ground level, with a flanged valve and handwheel.
    const pipeAngle = Math.PI / 4 + Math.PI / legs, pipeRadius = 0.33;
    const pipeX = Math.cos(pipeAngle) * pipeRadius, pipeZ = Math.sin(pipeAngle) * pipeRadius;
    cylinder([pipeX, -0.25, pipeZ], 0.03, 0.42, metal);
    ring(0.038, 0.009, [pipeX, -0.11, pipeZ], metal);
    ring(0.038, 0.009, [pipeX, -0.41, pipeZ], metal);
    bar([pipeX, -0.463, pipeZ], [0.095, 0.03, 0.095], wall);
    cylinder([pipeX, -0.26, pipeZ], 0.055, 0.09, metal);
    cylinder([pipeX, -0.203, pipeZ], 0.034, 0.045, metal);
    cylinder([pipeX, -0.165, pipeZ], 0.01, 0.07, metal);
    ring(0.045, 0.008, [pipeX, -0.122, pipeZ], metal);
  } else if (kind === "stadium-bowl") {
    // The seating bank is a cone: radius 0.28 at y -0.40 rising to 0.47 at y 0.30, i.e. 0.19 of run
    // for 0.70 of rise. Members that stand on it are turned onto that frame.
    const rise = 0.7 / Math.hypot(0.7, 0.19), run = 0.19 / Math.hypot(0.7, 0.19);
    // put() applies Rx, Ry then Rz, and for this bank that is Rz(PI)*Ry(-theta)*Rx(atan2(run, -rise)),
    // which maps local +z onto the bank normal and local +y up the slope.
    const bankRotation = theta => [Math.atan2(run, -rise), -theta, Math.PI];
    const bankPoint = (theta, radius, height, slope = 0, normal = 0, tangent = 0) => {
      const sin = Math.sin(theta), cos = Math.cos(theta);
      return [radius * sin + sin * (run * slope - rise * normal) - cos * tangent,
        height + rise * slope + run * normal,
        radius * cos + cos * (run * slope - rise * normal) + sin * tangent];
    };
    // Vomitory openings in the seating: a recessed portal per entrance, with jambs, a lintel, a
    // threshold and, above the lowest tier, the first treads of the vomitory stair.
    const vomitories = 4 + tier * 2, vomitoryRadius = 0.375, vomitoryHeight = -0.05;
    for (let index = 0; index < vomitories; index++) {
      const theta = (index / vomitories) * Math.PI * 2 + Math.PI / vomitories, turn = bankRotation(theta);
      bar(bankPoint(theta, vomitoryRadius, vomitoryHeight, 0, -0.006), [0.075, 0.085, 0.012], glass, turn);
      bar(bankPoint(theta, vomitoryRadius, vomitoryHeight, 0, 0.010, -0.045), [0.016, 0.105, 0.03], wall, turn);
      bar(bankPoint(theta, vomitoryRadius, vomitoryHeight, 0, 0.010, 0.045), [0.016, 0.105, 0.03], wall, turn);
      bar(bankPoint(theta, vomitoryRadius, vomitoryHeight, 0.058, 0.010), [0.106, 0.02, 0.036], wall, turn);
      bar(bankPoint(theta, vomitoryRadius, vomitoryHeight, -0.048, 0.004), [0.106, 0.012, 0.032], trim, turn);
      if (tier >= 1) for (let tread = 0; tread < 2 + tier; tread++) {
        bar(bankPoint(theta, vomitoryRadius, vomitoryHeight, -0.03 + tread * 0.014, 0.010),
          [0.07, 0.008, 0.024], trim, turn);
      }
    }
    // Floodlight masts at the rim, each with a head of lamps turned in towards the pitch.
    const masts = 4 + tier * 2;
    for (let index = 0; index < masts; index++) {
      const theta = (index / masts) * Math.PI * 2, mastX = Math.cos(theta) * 0.46, mastZ = Math.sin(theta) * 0.46;
      const heading = [0, -(Math.PI / 2 + theta), 0];
      register(new THREE.CylinderGeometry(0.007, 0.011, 0.13, radial), metal, [mastX, 0.335, mastZ]);
      bar([mastX, 0.278, mastZ], [0.05, 0.014, 0.05], wall);
      bar([mastX, 0.412, mastZ], [0.085, 0.024, 0.03], metal, heading);
      for (const offset of [-0.026, 0, 0.026]) {
        bar([mastX - Math.cos(theta) * 0.018 - Math.sin(theta) * offset, 0.412,
          mastZ - Math.sin(theta) * 0.018 + Math.cos(theta) * offset], [0.022, 0.016, 0.008], glass, heading);
      }
    }
    // Pitch surround and perimeter barrier between the pitch slab and the lowest tier.
    annulus(0.215, 0.293, [0, -0.3975, 0], 0xb6b2a4);
    ring(0.30, 0.016, [0, -0.388, 0], trim);
    if (tier >= 1) {
      const stakes = 12 + tier * 6;
      for (let index = 0; index < stakes; index++) {
        const theta = (index / stakes) * Math.PI * 2;
        bar([Math.cos(theta) * 0.30, -0.368, Math.sin(theta) * 0.30], [0.011, 0.04, 0.011], metal);
      }
      hoop(0.30, -0.346, [0, 0], 12 + tier * 6, 0.012, metal);
    }
    // Roof edge / canopy over the upper tier on two opposite sides: a soffit sector, its fascia and
    // the short struts carrying it off the rim.
    for (const start of [-Math.PI / 4, (Math.PI * 3) / 4]) {
      annulus(0.435, 0.484, [0, 0.352, 0], 0xcfd4d0, start, Math.PI / 2);
      tube(Array.from({ length: 13 }, (_, step) => {
        const theta = start + (step / 12) * (Math.PI / 2);
        return [Math.cos(theta) * 0.484, 0.352, -Math.sin(theta) * 0.484];
      }), 0.007, metal);
      for (let post = 0; post <= 4 + tier; post++) {
        const theta = start + (post / (4 + tier)) * (Math.PI / 2);
        bar([Math.cos(theta) * 0.474, 0.341, -Math.sin(theta) * 0.474], [0.012, 0.024, 0.012], metal);
      }
    }
  } else if (kind === "crane-boom") {
    // A 0.24 x 0.24 square boom along x, chords at y and z = +/-0.12, existing diagonals in the two
    // vertical planes at z = +/-0.12. Everything added here reads as the rest of the truss.
    const bays = 7 + tier * 3, panel = 1 / bays;
    // Verticals at every panel point the existing diagonals land on, in both side planes.
    for (let index = 0; index <= bays; index++) {
      const x = -0.5 + index * panel;
      for (const z of [-0.12, 0.12]) tube([[x, -0.12, z], [x, 0.12, z]], 0.007, 0xe1ca85);
    }
    // Plan bracing in the top and bottom planes: a transverse strut per panel point and alternating
    // diagonals between them, so the boom is braced on all four faces.
    for (const y of [-0.12, 0.12]) {
      for (let index = 0; index <= bays; index++) bar([-0.5 + index * panel, y, 0], [0.011, 0.011, 0.24], 0xe1ca85);
      for (let index = 0; index < bays; index++) {
        const near = -0.5 + index * panel, far = near + panel;
        const from = index % 2 ? far : near, to = index % 2 ? near : far;
        bar([(near + far) / 2, y, 0], [Math.hypot(panel, 0.24), 0.009, 0.009], 0xe1ca85,
          [0, Math.atan2(-0.24, to - from), 0]);
      }
    }
    // Boom foot: two gusset plates on the end chords, a plinth, the pivot pin and its collars.
    for (const z of [-0.105, 0.105]) bar([-0.47, -0.01, z], [0.075, 0.26, 0.016], metal);
    bar([-0.465, -0.155, 0], [0.08, 0.03, 0.22], wall);
    cylinder([-0.47, 0, 0], 0.016, 0.26, metal, [Math.PI / 2, 0, 0]);
    for (const z of [-0.115, 0.115]) cylinder([-0.47, 0, z], 0.023, 0.012, metal, [Math.PI / 2, 0, 0]);
    // Hoist trolley on the bottom chords, its wheels, and the hook block with sheave and hook on the
    // hoist line.
    bar([0.45, -0.135, 0], [0.10, 0.045, 0.25], metal);
    for (const dx of [-0.035, 0.035]) for (const z of [-0.12, 0.12]) {
      cylinder([0.45 + dx, -0.12, z], 0.016, 0.022, metal, [Math.PI / 2, 0, 0]);
    }
    bar([0.45, -0.335, 0], [0.055, 0.07, 0.045], metal);
    cylinder([0.45, -0.335, 0], 0.024, 0.03, metal, [Math.PI / 2, 0, 0]);
    register(new THREE.TorusGeometry(0.018, 0.006, 6 + tier * 2, radial, Math.PI), metal, [0.45, -0.381, 0],
      [0, 0, Math.PI]);
    // Pendant/backstay tie from the boom tip down to an anchorage at the foot end, with its lugs.
    for (const z of [-0.11, 0.11]) {
      tube([[0.49, 0.115, z], [0.22, -0.06, z], [-0.34, -0.36, z]], 0.007, metal);
      bar([-0.34, -0.375, z], [0.035, 0.03, 0.022], metal);
    }
  } else if (kind === "crowned-road") {
    // A 1 x 1 carriageway crowned 0.02 at the centre, kerbs at z = +/-0.47. crown() keeps markings on
    // the surface instead of floating them above it.
    const crown = z => 0.02 * (1 - Math.abs(z) * 2);
    // Kerb upstands: a face towards the carriageway and a coping that overhangs it. The coping stands
    // 0.05 clear of the road edge, a little above the 0.02 crown, so the upstand reads as a kerb
    // rather than as another flat strip.
    for (const sign of [-1, 1]) {
      box([0, 0.019, sign * 0.458], [1, 0.038, 0.024], wall, 0.003);
      bar([0, 0.043, sign * 0.459], [1, 0.014, 0.036], trim);
    }
    // Footway behind the +z kerb, level with its coping.
    bar([0, 0.043, 0.486], [1, 0.014, 0.024], 0xb6b2a4);
    // Edge line markings, one each side of the carriageway, alongside the existing centre dashes.
    for (const sign of [-1, 1]) {
      bar([0, crown(sign * 0.415) + 0.0012, sign * 0.415], [1, 0.0022, 0.013], trim);
    }
    // Drainage gullies at the kerb line: a raised frame, a grating sunk inside it and a kerb inlet
    // through the kerb face.
    for (const [gully, sign] of [[-0.22, 1], [0.26, -1]]) {
      const along = sign * 0.425, surface = crown(along);
      for (const offset of [-0.021, 0.021]) bar([gully, surface + 0.0018, along + offset], [0.072, 0.005, 0.008], trim);
      for (const offset of [-0.033, 0.033]) bar([gully + offset, surface + 0.0018, along], [0.008, 0.005, 0.034], trim);
      bar([gully, surface - 0.0006, along], [0.05, 0.005, 0.03], metal);
      bar([gully, 0.014, sign * 0.4445], [0.05, 0.02, 0.006], glass);
    }
    // Kerb joints across each kerb face.
    for (let joint = 0; joint <= 3 + tier; joint++) {
      for (const sign of [-1, 1]) {
        bar([-0.48 + joint * 0.96 / (3 + tier), 0.03, sign * 0.4455], [0.006, 0.038, 0.006], trim);
      }
    }
  }
  return parts;
}
