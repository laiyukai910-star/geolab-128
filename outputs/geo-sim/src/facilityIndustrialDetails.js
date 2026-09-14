import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// Construction members for the industrial and energy facility kinds of the procedural facility
// library. Each member is expressed in the raw (pre-normalisation) space of facilityGeometry.js and
// stays inside the envelope listed for its kind, so appending these parts cannot change the
// assembly's normalised bounds. Members are emitted through the same put/box/cylinder/tube/ring
// contract the parent library uses, so `color` and `constructionResponse` are baked identically.

/**
 * Returns the extra construction members for one industrial facility kind, or [] when the kind is
 * not handled here.
 * @param {string} kind facility kind from REBUILT_FACILITY_KINDS
 * @param {{box:Function,cylinder:Function,tube:Function,ring:Function,put:Function,tier:number,radial:number,colors:{wall:number,trim:number,glass:number,metal:number}}} helpers
 * @returns {THREE.BufferGeometry[]} non-indexed parts carrying position, color and constructionResponse
 */
export function industrialDetailParts(kind, helpers) {
  const { tier, radial, colors } = helpers;
  const parentPut = helpers.put, sink = helpers.parts, members = [];
  const includesSink = Array.isArray(sink);
  // facilityGeometry.js's put() bakes a part in place - rotate, translate, then a color and a
  // constructionResponse attribute - appends it to the sink it was given and hands it back. This
  // module therefore feeds every member to the parent put as an already non-indexed geometry, so put
  // bakes exactly the object handed to it, and returns the same objects the parent registered: a
  // member cannot be produced without also reaching the assembly. The sink is exposed as
  // helpers.parts, but the returned array does not depend on it, because a put that records only in
  // its own private array would otherwise leave this module with nothing to return. The geometry
  // classes and their parameters match the parent's own box, cylinder, tube and ring.
  const mark = (geometry) => {
    if (!members.includes(geometry)) members.push(geometry);
    if (includesSink && !sink.includes(geometry)) sink.push(geometry);
    return geometry;
  };
  const bake = (geometry) => {
    const source = geometry.index ? geometry.toNonIndexed() : geometry;
    source.deleteAttribute("uv");
    return source;
  };
  const put = (geometry, color, position = [0, 0, 0], rotation = [0, 0, 0]) => {
    const source = bake(geometry);
    const result = parentPut(source, color, position, rotation);
    return mark(result instanceof THREE.BufferGeometry ? result : source);
  };
  const h = {
    ...helpers, put,
    box: (p, size, color = colors.wall, bevel = 0.006) => put(
      new RoundedBoxGeometry(...size, tier + 1, Math.min(bevel, ...size.map(s => s * 0.16))), color, p),
    cylinder: (p, radius, height, color = colors.metal) => put(
      new THREE.CylinderGeometry(radius, radius, height, radial), color, p),
    tube: (points, radius, color = colors.metal) => put(new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point))),
      12 + tier * 8, radius, 8 + tier * 4, false), color),
    ring: (radius, tubeRadius, p, color = colors.metal) => put(
      new THREE.TorusGeometry(radius, tubeRadius, 6 + tier * 2, radial), color, p, [Math.PI / 2, 0, 0])
  };
  if (kind === "sawtooth-industrial") return sawtoothDetails(h, members, tier, radial, colors);
  if (kind === "process-tank") return tankDetails(h, members, tier, radial, colors);
  if (kind === "solar-panel-frame") return solarDetails(h, members, tier, radial, colors);
  if (kind === "turbine-blade") return bladeDetails(h, members, tier, radial, colors);
  return [];
}

// ---------------------------------------------------------------------------------------------
// sawtooth-industrial: envelope x,z in [-0.5,0.5], y in [-0.5,0.5].
// The parent hall is a 0.96 x 0.64 x 0.96 block with its eaves at y = 0.17 and sawtooth ridges at
// y = 0.38, one loading door on the +z face and a chimney flue near (0.37, -0.25).
// ---------------------------------------------------------------------------------------------
function sawtoothDetails(h, parts, tier, radial, colors) {
  const { box, cylinder, tube, ring, put } = h;
  const { wall, trim, glass, metal } = colors;

  const bays = 4 + tier;                       // sawtooth bays across the 0.96 m hall
  const bayWidth = 0.96 / bays;                // roof bay pitch, matched by the structural grid
  const hallHalf = 0.465;                      // interior wall face, keeps members inside the shell

  // Structural bays: columns at a regular spacing along both long walls.
  const columnXs = [];
  for (let i = 0; i <= bays; i++) columnXs.push(-0.47 + i * 0.94 / bays);
  for (const z of [-hallHalf, hallHalf]) {
    for (const x of columnXs) {
      // Pinned-base perimeter column, standing on a stub plinth at the slab.
      box([x, -0.48, z], [0.05, 0.04, 0.05], 0x9aa09d);
      box([x, -0.25, z], [0.026, 0.42, 0.034], wall);
      if (tier >= 1) box([x, -0.45, z], [0.05, 0.024, 0.07], trim);
    }
  }
  // Perimeter ring beam carried on top of the columns, closing the bay frame on all four sides.
  for (const z of [-hallHalf, hallHalf]) box([0, 0.155, z], [0.98, 0.046, 0.05], trim);
  for (const x of [-0.47, 0.47]) box([x, 0.155, 0], [0.05, 0.046, 0.96], trim);

  // Roof bracing in at least two bays: a diagonal tie and a vertical post per braced bay on each
  // long wall. The first and last bays are chosen because roofing work planes them there.
  for (const bay of [0, bays - 1]) {
    const x0 = columnXs[bay];
    const x1 = columnXs[bay + 1];
    for (const z of [-hallHalf, hallHalf]) {
      tube([[x0, 0.12, z], [x1, -0.02, z]], 0.006, metal);
      tube([[x1, -0.02, z], [x1, 0.12, z]], 0.006, metal);
    }
  }

  // Two loading dock doors with dock bumpers and a leveller, set into the +z wall. The doors sit
  // between column lines and clear of the sawtooth monitor glazing landings on the roof grid.
  const doors = [-0.35, 0.35];
  const frameHalf = 0.15;                                          // surround face lands on x = 0.5
  for (const x0 of doors) {
    box([x0, -0.25, 0.455], [frameHalf * 2, 0.44, 0.012], metal);    // door frame surround
    box([x0, -0.245, 0.482], [0.30, 0.38, 0.014], 0xb4bcbd);         // insulated sectional door leaf
    for (let i = 0; i < 5 + tier * 2; i++) {
      // Horizontal panel joints across the door leaf.
      box([x0, -0.425 + i * 0.38 / (4 + tier * 2), 0.490], [0.30, 0.009, 0.004], metal, 0.001);
    }
    box([x0, -0.012, 0.463], [0.30, 0.036, 0.022], trim);            // door head and lintel trim
    box([x0, -0.478, 0.474], [0.28, 0.024, 0.03], 0x9aa09d);         // leveller plate at the threshold
    for (const sign of [-1, 1]) {
      // Rubber dock bumpers either side of the opening, on their steel mounts.
      box([x0 + sign * 0.13, -0.25, 0.469], [0.014, 0.05, 0.014], metal, 0.001);
      cylinder([x0 + sign * 0.13, -0.173, 0.469], 0.01, 0.105, 0x4a4f52);
      box([x0 + sign * 0.13, -0.114, 0.469], [0.016, 0.014, 0.012], metal, 0.001);
    }
    if (tier >= 1) {
      for (const sign of [-1, 1]) {
        // Door track and guide roller on each jamb.
        box([x0 + sign * 0.135, -0.245, 0.462], [0.012, 0.40, 0.02], 0x8f9798);
        cylinder([x0 + sign * 0.135, -0.03, 0.462], 0.011, 0.024, metal);
      }
      box([x0, -0.25, 0.477], [0.24, 0.03, 0.006], 0xd8d2c4);        // door window band
    }
  }
  // Hardstanding apron in front of the doors: kerbed concrete slab and its expansion joints.
  box([0, -0.48, 0.4695], [0.94, 0.036, 0.035], 0xb6b2a4);
  for (const x of [-0.47, 0.47]) box([x, -0.462, 0.4695], [0.04, 0.05, 0.04], 0x9aa09d);
  for (let i = 0; i <= bays; i++) {
    box([columnXs[i], -0.4635, 0.4695], [0.012, 0.006, 0.03], 0x9aa09d, 0.001);
  }

  // Crane rail / gantry beam running the length of the hall above the crane columns, with a hoist
  // trolley block, its fall and hook, and end stops at both walls.
  box([0, 0.39, -0.43], [0.98, 0.022, 0.026], metal);                // gantry crane rail
  for (const x of [-0.46, 0.46]) box([x, 0.372, -0.43], [0.02, 0.04, 0.03], trim); // rail end stops
  const trolley = 0.06 + 0.10 * ((tier + 1) % 3);                    // deterministic trolley park
  box([trolley, 0.372, -0.43], [0.10, 0.026, 0.07], 0x8f9798);       // hoist trolley block
  box([trolley, 0.352, -0.43], [0.06, 0.02, 0.05], metal);
  cylinder([trolley, 0.31, -0.43], 0.006, 0.07, metal);              // hoist fall
  box([trolley, 0.262, -0.43], [0.05, 0.032, 0.045], 0x6f7a7c);      // hook block
  put(new THREE.TorusGeometry(0.014, 0.006, 4 + tier * 2, radial / 2), metal, [trolley, 0.228, -0.43], [Math.PI / 2, 0, 0]);
  if (tier >= 1) {
    for (const x of [-0.43, 0, 0.43]) box([x, 0.368, -0.43], [0.05, 0.036, 0.03], trim); // rail brackets
    for (const x of [-0.46, 0.46]) cylinder([x, 0.39, -0.43], 0.014, 0.10, metal);       // buffers
  }

  // Roof vents / ridge extractors on the sawtooth slopes: a glazed monitor rising from each eave
  // with a louvred ventilator head, and a powered extractor on the ridges where the tier allows.
  for (let bay = 0; bay < bays; bay++) {
    const x = -0.48 + (bay + 0.5) * bayWidth;
    const ventWidth = Math.min(bayWidth * 0.6, 0.13);
    box([x, 0.30, -0.485], [ventWidth, 0.155, 0.014], wall);         // monitor cheek
    box([x, 0.318, -0.492], [ventWidth - 0.02, 0.10, 0.008], glass); // monitor glazing
    box([x, 0.384, -0.484], [ventWidth + 0.012, 0.016, 0.024], trim); // vent head flashing
    if (tier >= 1) {
      for (let j = 0; j < 3; j++) {
        // Louvre blades in the monitor head.
        box([x, 0.336 + j * 0.026, -0.495], [ventWidth - 0.03, 0.008, 0.008], metal, 0.001);
      }
      if (bay < bays - 1) {
        const ridgeX = -0.48 + (bay + 1) * bayWidth;
        box([ridgeX, 0.40, -0.23], [0.06, 0.036, 0.06], metal);      // extractor base
        cylinder([ridgeX, 0.432, -0.23], 0.022, 0.045, 0x8f9798);    // extractor fan casing
        box([ridgeX, 0.462, -0.23], [0.06, 0.016, 0.06], trim);      // weather cowl
      }
    }
  }
  return parts;
}

// ---------------------------------------------------------------------------------------------
// process-tank: envelope x,z in [-0.5,0.5], y in [-0.5,0.5].
// The parent tank is a cylinder r = 0.39 from y = -0.38 to y = 0.32 with a domed roof and an
// existing straight ladder at x = +-0.075, z = 0.42.
// ---------------------------------------------------------------------------------------------
function tankDetails(h, parts, tier, radial, colors) {
  const { box, cylinder, tube, ring, put } = h;
  const { wall, trim, metal } = colors;
  const bottom = -0.38, top = 0.32, shell = 0.39;

  // Ring foundation with anchor bolts: a raft under the shell bearing, a kerb around it and a ring
  // of holding-down bolts through the base ring.
  cylinder([0, -0.455, 0], 0.45, 0.09, 0xb6b2a4);                   // concrete ring raft
  ring(0.45, 0.012, [0, -0.412, 0], 0x9aa09d);                       // raft top kerb
  ring(0.39, 0.014, [0, bottom, 0], metal);                          // base ring / bearing plate
  const bolts = 12 + tier * 4;
  for (let i = 0; i < bolts; i++) {
    const angle = i / bolts * Math.PI * 2, x = Math.cos(angle) * 0.425, z = Math.sin(angle) * 0.425;
    cylinder([x, -0.437, z], 0.009, 0.05, metal);                    // anchor bolt shank
    cylinder([x, -0.407, z], 0.013, 0.008, 0x8f9798);                // nut and washer
  }

  // Tank shell course seam line: the horizontal weld between the first and second shell courses,
  // plus vertical plate seams where the tier supports them.
  ring(shell + 0.002, 0.005, [0, bottom + (top - bottom) * 0.5, 0], 0xb9c1bf);
  if (tier >= 1) {
    cylinder([0, bottom + (top - bottom) * 0.25, 0], shell + 0.0015, 0.0035, 0xb9c1bf);
    cylinder([0, bottom + (top - bottom) * 0.75, 0], shell + 0.0015, 0.0035, 0xb9c1bf);
  }
  if (tier >= 2) {
    for (let i = 0; i < 4; i++) {
      const angle = i / 4 * Math.PI * 2, x = Math.cos(angle) * (shell + 0.002), z = Math.sin(angle) * (shell + 0.002);
      box([x, (bottom + top) * 0.5, z], [0.006, top - bottom - 0.06, 0.006], 0xb9c1bf, 0.001); // vertical plate seam
    }
  }

  // Spiral / caged access stair around the shell with its handrail, in place of a bare ladder.
  const turns = 1.55, steps = 18 + tier * 6, stairBottom = -0.24, stairTop = 0.26;
  const stairR = 0.44;
  const railPoints = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, angle = t * Math.PI * 2 * turns, y = stairBottom + t * (stairTop - stairBottom);
    // Tread plate on a bracket off the shell, with a nosing angle at its outer edge.
    box([Math.cos(angle) * stairR, y, Math.sin(angle) * stairR], [0.05, 0.012, 0.115], metal, 0.001);
    if ((i & 1) === 0) {
      // Support bracket landing the tread back onto the shell.
      box([Math.cos(angle) * (shell - 0.01), y - 0.014, Math.sin(angle) * (shell - 0.01)], [0.05, 0.02, 0.03], 0x9aa09d, 0.001);
    }
    if (i % 3 === 0) {
      // Caged stair vertical infill bar at the tread.
      box([Math.cos(angle) * (stairR + 0.012), y + 0.06, Math.sin(angle) * (stairR + 0.012)], [0.006, 0.115, 0.006], metal, 0.001);
    }
    railPoints.push([Math.cos(angle) * 0.465, y + 0.115, Math.sin(angle) * 0.465]);
  }
  tube(railPoints, 0.006, metal);                                    // spiral handrail following the flight
  for (let i = 0; i <= steps; i += 3) {
    const t = i / steps, angle = t * Math.PI * 2 * turns, y = stairBottom + t * (stairTop - stairBottom);
    // Handrail post from the tread up to the rail.
    tube([[Math.cos(angle) * (stairR + 0.012), y, Math.sin(angle) * (stairR + 0.012)],
      [Math.cos(angle) * 0.465, y + 0.115, Math.sin(angle) * 0.465]], 0.005, metal);
  }

  // Top guard rail around the tank roof: hand and mid rails on stanchions off the shell top.
  ring(0.41, 0.006, [0, top + 0.09, 0], metal);                       // top handrail
  ring(0.41, 0.005, [0, top + 0.045, 0], metal);                      // mid rail
  const stanchions = 8 + tier * 4;
  for (let i = 0; i < stanchions; i++) {
    const angle = i / stanchions * Math.PI * 2, x = Math.cos(angle) * 0.41, z = Math.sin(angle) * 0.41;
    cylinder([x, top + 0.055, z], 0.007, 0.13, metal);                // guard rail stanchion
  }

  // Nozzles and a pipe manifold at the base, with flanged connections.
  const nozzle = 0.42;                                               // shell face at the nozzle course
  const riserZ = -0.12, riserX = Math.sqrt(nozzle * nozzle - riserZ * riserZ);
  tube([[shell - 0.04, -0.20, riserZ], [riserX, -0.20, riserZ]], 0.014, metal);   // shell nozzle neck
  ring(0.024, 0.008, [shell + 0.008, -0.20, riserZ], metal);                       // nozzle flange
  for (const y of [-0.20, -0.33]) {
    // Two flanged connections off the manifold into the tank.
    tube([[shell - 0.04, y, riserZ], [riserX + 0.02, y, riserZ]], 0.013, metal);
    ring(0.022, 0.007, [shell + 0.012, y, riserZ], metal);
  }
  box([0.435, -0.33, 0], [0.05, 0.05, 0.52], 0x9eb0b2);              // base pipe manifold
  tube([[riserX, -0.20, riserZ], [riserX, -0.33, riserZ]], 0.012, metal);          // riser into the manifold
  for (const z of [-0.20, 0.20]) ring(0.026, 0.008, [0.435, -0.33, z], metal);     // manifold branch flanges
  tube([[0.435, -0.33, -0.24], [0.435, -0.33, -0.30]], 0.015, metal);              // manifold tail
  ring(0.026, 0.009, [0.435, -0.33, -0.30], metal);                                // tail flange
  if (tier >= 1) {
    for (const z of [-0.20, 0.20]) {
      // Gate valves with handwheels on the manifold branches.
      box([0.435, -0.28, z], [0.04, 0.05, 0.04], 0x8f9798, 0.002);
      put(new THREE.TorusGeometry(0.022, 0.005, 4 + tier * 2, radial / 2), metal, [0.435, -0.245, z], [Math.PI / 2, 0, 0]);
    }
  }

  // Level gauge / sight glass on the shell, between the two gauge flanges.
  const glassAngle = 1.28, glassRadius = shell + 0.032;
  const glassX = Math.cos(glassAngle) * glassRadius, glassZ = Math.sin(glassAngle) * glassRadius;
  for (const y of [-0.06, 0.14]) {
    tube([[Math.cos(glassAngle) * (shell - 0.02), y, Math.sin(glassAngle) * (shell - 0.02)], [glassX, y, glassZ]], 0.012, metal);
    ring(0.022, 0.006, [glassX, y, glassZ], metal);                  // gauge flange
  }
  cylinder([glassX, 0.04, glassZ], 0.010, 0.20, 0xaccdc0);           // sight glass tube
  if (tier >= 1) {
    for (const y of [-0.055, 0.135]) cylinder([glassX, y, glassZ], 0.017, 0.012, metal); // gauge isolation cocks
  }
  return parts;
}

// ---------------------------------------------------------------------------------------------
// solar-panel-frame: envelope x,z in [-0.5,0.5], y in [-0.5,0.1].
// The parent frame is a flat 0.98 x 0.98 plate at y = 0 with a flat cell grid, so this module
// replaces the read with a tilted rack: every member sits under the tilted plane the modules lie on.
// ---------------------------------------------------------------------------------------------
function solarDetails(h, parts, tier, radial, colors) {
  const { box, cylinder, tube, ring, put } = h;
  const { trim, glass, metal } = colors;
  const tilt = 0.06;                     // vertical rise across the tilted plane, low edge -> high
  const lowCenter = 0.02;                // module-plane centre at the low (-x) edge. The ceiling of
                                         // this kind is y = 0.1 and a tilted 0.19 deep module rises
                                         // 0.45*sin(tilt) + 0.006 + bevel above its centre, so the rack
                                         // height is bounded by that: the frame top lands at ~0.09
  const half = 0.48, planeLength = half * 2;
  const yAt = (x) => lowCenter + tilt * (x - -half) / planeLength;

  // Support posts on the low edge, the torque tube and the high edge, with concrete pads.
  const rows = [-0.40, 0, 0.40];
  for (const z of rows) {
    cylinder([-0.44, -0.27, z], 0.014, 0.46, metal);                 // low-edge post
    box([-0.44, -0.48, z], [0.06, 0.04, 0.06], 0xb6b2a4);            // post pad
    if (Math.abs(z) > 1e-6) {
      // Rear (high-edge) post, shorter because the rack is tilted.
      cylinder([0.44, -0.35, z], 0.014, 0.30, metal);
      box([0.44, -0.48, z], [0.06, 0.04, 0.06], 0xb6b2a4);
    }
  }
  // Torque tube on the rack axis, carrying the purlins between post lines. It is laid along the
  // tilted plane, so its own rotation is the tilt off vertical.
  put(new THREE.CylinderGeometry(0.021, 0.021, 0.905, radial), 0x9aa09d, [0, yAt(0) - 0.045, 0],
    [0, 0, Math.PI / 2 - Math.atan2(tilt, planeLength)]);            // torque tube
  // Purlins running under the modules, at the tilt the modules sit on.
  const purlinZ = [-0.44, -0.15, 0.15, 0.44];
  for (const z of purlinZ) {
    box([0, yAt(0) - 0.05, z], [0.94, 0.026, 0.018], metal);          // purlin
    for (const x of [-0.44, 0.44]) box([x, yAt(x) - 0.068, z], [0.03, 0.04, 0.024], 0x9aa09d, 0.001); // purlin cleat
  }

  // Rails along the low and high edges: the two members that make the tilt explicit.
  box([-0.465, yAt(-0.465) - 0.031, 0], [0.07, 0.038, 0.98], trim);   // low-edge rail
  box([0.465, yAt(0.465) - 0.031, 0], [0.07, 0.038, 0.98], trim);     // high-edge rail
  if (tier >= 1) {
    for (const z of [-0.45, 0, 0.45]) {
      // Rail splice plates along the rack length.
      box([-0.465, yAt(-0.465) - 0.018, z], [0.05, 0.01, 0.05], metal, 0.001);
      box([0.465, yAt(0.465) - 0.018, z], [0.05, 0.01, 0.05], metal, 0.001);
    }
  }

  // Module rows on the tilted plane with walkway gaps between them, each module carrying its frame
  // and, where the tier supports it, its cell grid lines. Every module is placed at its own x with
  // the same tilt, so the whole row lies on the rack plane instead of on a horizontal step.
  const tiltRotation = -Math.atan2(tilt, planeLength);
  const rowCenters = [-0.36, -0.12, 0.12, 0.36], rowDepth = 0.19;
  const cells = 6 + tier * 4;
  for (const z of rowCenters) {
    put(new RoundedBoxGeometry(0.90, 0.012, rowDepth, tier + 1, 0.0019), 0x679aaa, [0, yAt(0) + 0.006, z], [0, 0, tiltRotation]); // PV module
    put(new RoundedBoxGeometry(0.90, 0.008, 0.010, tier + 1, 0.001), trim, [0, yAt(0) + 0.013, z], [0, 0, tiltRotation]); // module frame
    for (const x of [-0.45, 0.45]) box([x, yAt(x) + 0.013, z], [0.012, 0.008, rowDepth], trim); // module frame, short edges
    for (let c = 1; c < cells; c++) {
      const x = -0.45 + c * 0.9 / cells;
      box([x, yAt(x) + 0.014, z], [0.004, 0.005, rowDepth * 0.94], metal, 0.0006); // cell grid line
    }
  }
  // Walkway gaps between the module rows: grated walkway strips with a kerb each side.
  for (const z of [-0.24, 0, 0.24]) {
    box([0, -0.005, z], [0.92, 0.008, 0.032], 0x9aa09d);              // walkway grating
    for (const edge of [-1, 1]) box([0, 0.004, z + edge * 0.018], [0.92, 0.012, 0.006], metal, 0.001); // walkway kerb
    if (tier >= 1) {
      for (let i = 0; i <= 6; i++) box([-0.45 + i * 0.15, 0.001, z], [0.01, 0.004, 0.028], 0x8f9798, 0.0005); // grating bars
    }
  }
  // Rack guard rail along the two walkways at the edge of the array.
  for (const z of [-0.24, 0.24]) {
    for (const x of [-0.45, -0.15, 0.15, 0.45]) cylinder([x, 0.028, z], 0.005, 0.055, metal); // guard post
    for (const x of [-0.45, 0.45]) cylinder([x, 0.028, z], 0.005, 0.055, metal);
    box([0, 0.052, z], [0.90, 0.008, 0.008], metal);                  // guard handrail
  }

  // Inverter cabinet and cable tray at the low edge of the array.
  box([-0.45, -0.075, 0.005], [0.055, 0.155, 0.17], 0xb4bcbd);        // inverter cabinet
  box([-0.424, -0.075, 0.005], [0.006, 0.13, 0.14], trim, 0.001);     // inverter door
  for (const z of [-0.05, 0.05]) cylinder([-0.421, -0.035, z], 0.006, 0.012, metal); // door latches
  box([-0.45, -0.155, 0.005], [0.07, 0.02, 0.19], 0x9aa09d);          // inverter plinth
  if (tier >= 1) {
    for (let i = 0; i < 4; i++) box([-0.419, -0.11 + i * 0.028, 0.005], [0.006, 0.006, 0.09], 0x8f9798, 0.0005); // louvre grille
  }
  // Cable tray running the array length above the inverter, on brackets off the rack. It is kept low
  // so it does not run into the walkway guard rail.
  box([-0.40, -0.006, 0], [0.09, 0.008, 0.94], metal);               // tray base
  for (const edge of [-1, 1]) box([-0.40 + edge * 0.045, 0.008, 0], [0.008, 0.03, 0.94], metal, 0.001); // tray side wall
  box([-0.40, -0.02, 0], [0.10, 0.006, 0.94], trim, 0.001);           // tray lid
  for (const z of [-0.42, 0, 0.42]) box([-0.40, -0.032, z], [0.10, 0.026, 0.02], 0x9aa09d, 0.001); // tray bracket
  tube([[-0.40, -0.014, 0.10], [-0.42, -0.02, 0.06], [-0.45, -0.02, 0.02]], 0.008, metal); // drop into the inverter
  return parts;
}

// ---------------------------------------------------------------------------------------------
// turbine-blade: envelope x,z in [-0.2,0.2], y in [-0.5,0.5].
// The parent blade runs from y = -0.5 to y = 0.5 with a tapering chord and a 0.48 rad root twist,
// so every member here is placed with the same section transform.
// ---------------------------------------------------------------------------------------------
const BLADE_RINGS = 24;
function bladeSection(t) {
  // Matches the parent blade's chord, twist and sweep so members sit on the real section.
  const chord = 0.025 + 0.18 * Math.sin((t * 0.85 + 0.12) * Math.PI) * (1 - t * 0.7);
  const twist = (1 - t) * 0.48;
  return { chord, twist, shift: t * t * 0.12, y: t - 0.5 };
}
function bladePoint(section, px, pz) {
  return [px * Math.cos(section.twist) - pz * Math.sin(section.twist) + section.shift,
    section.y,
    px * Math.sin(section.twist) + pz * Math.cos(section.twist)];
}
function bladeDetails(h, parts, tier, radial, colors) {
  const { box, cylinder, tube, ring, put } = h;
  const { trim, metal } = colors;
  const root = Math.min(2, Math.round(BLADE_RINGS * 0.08));
  const tip = BLADE_RINGS - 1 - Math.min(2, Math.round(BLADE_RINGS * 0.08));

  // Root flange with its bolt circle where the blade meets the hub, and the pitch bearing detail
  // behind it: the pitch ring, its blade-side bearing ring and the ring of pitch bolts. Every part
  // clears the blade root plane at y = -0.5.
  cylinder([0, -0.478, 0], 0.19, 0.026, metal);                       // blade root flange
  ring(0.19, 0.007, [0, -0.4645, 0], trim);                           // flange rim
  const bolts = 12 + tier * 4;
  for (let i = 0; i < bolts; i++) {
    const angle = i / bolts * Math.PI * 2, x = Math.cos(angle) * 0.162, z = Math.sin(angle) * 0.162;
    cylinder([x, -0.482, z], 0.009, 0.018, 0x6f7a7c);                  // flange bolt head
    cylinder([x, -0.488, z], 0.012, 0.006, metal);                     // washer face
  }
  cylinder([0, -0.49, 0], 0.19, 0.018, 0x6f7a7c);                      // pitch bearing outer race
  cylinder([0, -0.471, 0], 0.155, 0.02, 0x8f9798);                     // pitch bearing inner race
  ring(0.172, 0.005, [0, -0.48, 0], metal);                            // bearing race joint
  ring(0.155, 0.0045, [0, -0.495, 0], metal);                          // bearing seal line
  const balls = 8 + tier * 4;
  for (let i = 0; i < balls; i++) {
    const angle = i / balls * Math.PI * 2;
    box([Math.cos(angle) * 0.155, -0.4925, Math.sin(angle) * 0.155], [0.006, 0.012, 0.006], metal, 0.001); // pitch bolt
  }

  // Spar and web line along the blade: shear webs down the section, and the spar cap line on the
  // suction and pressure faces every few rings, so the section change reads from any angle.
  const spine = [];
  for (let i = root; i <= tip; i++) spine.push(bladePoint(bladeSection(i / BLADE_RINGS), 0, 0));
  tube(spine, 0.018, trim);                                           // internal spar boom
  for (let i = root; i <= tip; i++) {
    const section = bladeSection(i / BLADE_RINGS);
    if (i % 2 !== 0) continue;
    // Shear web across the section, and the spar caps at the chord extremes.
    const fore = bladePoint(section, section.chord * 0.55, 0);
    const aft = bladePoint(section, -section.chord * 0.48, 0);
    tube([fore, aft], 0.006, 0x9aa09d);                               // shear web
    for (const side of [1, -1]) {
      const cap = bladePoint(section, 0, side * section.chord * 0.10);
      box(cap, [0.03, 0.014, 0.012], trim, 0.001);                    // spar cap band
    }
    if (i === root + 2) {
      // Main spar box bulge visible at the root transition.
      const mid = bladePoint(section, section.chord * 0.1, 0);
      box(mid, [0.05, 0.02, section.chord * 0.2], metal, 0.002);
    }
  }

  // Tip brake and lightning receptor at the blade tip.
  const tipSection = bladeSection(1);
  const tipPoint = bladePoint(tipSection, tipSection.chord * 0.35, 0);
  box([tipPoint[0], 0.478, tipPoint[2]], [0.05, 0.014, tipSection.chord * 0.42], metal, 0.002); // tip brake flap
  const receptor = bladePoint(bladeSection(tip / BLADE_RINGS), 0, tipSection.chord * 0.30); // suction-face skin
  cylinder([receptor[0], 0.4925, receptor[2]], 0.009, 0.014, 0x6f7a7c); // lightning receptor puck
  tube([[receptor[0], 0.4815, receptor[2]], [receptor[0], 0.44, receptor[2]]], 0.004, 0x6f7a7c); // down conductor stub
  if (tier >= 1) {
    // Trailing-edge serrations and the tip brake hinge line.
    for (let i = 0; i < 5; i++) {
      const t = 0.80 + i * 0.035, section = bladeSection(t);
      const point = bladePoint(section, -section.chord * 0.55, 0);
      box(point, [0.012, 0.006, 0.012], trim, 0.001);
    }
    // Tip brake hinge line, run below the brake so it stays inside the y = 0.5 envelope.
    const hinge = bladePoint(tipSection, -tipSection.chord * 0.25, 0);
    tube([[hinge[0], 0.468, hinge[2]], [tipPoint[0], 0.468, tipPoint[2]]], 0.005, metal);
  }
  return parts;
}
