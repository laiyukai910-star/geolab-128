import * as THREE from "three";

// Construction members for three facility kinds whose massing blocks are otherwise bare shells:
// storey bands, terrace parapets, an entrance canopy, courtyard paving and arcades, balconies, a
// civic portico and the roof plant those buildings carry. Every member is emitted through the
// caller's helpers, so the caller bakes the colour and constructionResponse attributes and merges
// the returned geometries into its own parts array.
//
// The helpers MUST return the geometry they emit, for example
//   const box = (...args) => { core.box(...args); return core.parts.at(-1); };
// because this module hands the caller back exactly what those helpers returned. Members are kept
// inside the normalised envelopes of the three kinds, so the caller's unit-box fit is unchanged.
export const ENVELOPE_DETAIL_KINDS = Object.freeze(["setback-tower", "courtyard-midrise", "cross-plan-civic"]);

export function buildingDetailParts(kind, helpers) {
  if (!ENVELOPE_DETAIL_KINDS.includes(kind)) return [];
  const { tier, radial, colors } = helpers;
  const { wall, trim, glass, metal } = colors;
  // The caller locks radial resolution and detail tier together (16/28/44 for tiers 0/1/2), so the
  // two agree; taking the larger keeps repetition counts sane if that pairing ever changes.
  const density = Math.max(tier, Math.round(radial / 16) - 1);
  const stone = 0xb6b2a4; // the plinth and paving stone the facility library already uses
  const parts = [];
  const take = result => {
    const geometry = result?.isBufferGeometry ? result : result?.geometry?.isBufferGeometry ? result.geometry : null;
    if (geometry) parts.push(geometry);
    return geometry;
  };
  const box = (...args) => take(helpers.box(...args));
  const cylinder = (...args) => take(helpers.cylinder(...args));
  const tube = (...args) => take(helpers.tube(...args));
  const ring = (...args) => take(helpers.ring(...args));
  const put = (...args) => take(helpers.put(...args));
  // A guarding parapet standing on the caller's roof slab, set in from the slab edge it belongs to.
  const roofParapet = (centre, half, y, height) => {
    const thickness = 0.02;
    for (const sign of [-1, 1]) {
      box([centre[0], y + height / 2, centre[1] + sign * (half[1] - thickness / 2)], [half[0] * 2, height, thickness], trim, 0.001);
      box([centre[0] + sign * (half[0] - thickness / 2), y + height / 2, centre[1]], [thickness, height, half[1] * 2 - thickness * 2], trim, 0.001);
    }
  };

  if (kind === "setback-tower") {
    // The caller stacks three blocks 0.94 wide at the base, each 0.18 narrower than the one below,
    // from y = -0.5 to y = 0.42, with a roof plant box over the front of the top roof.
    const base = 0.94, inset = 0.18, depth = 0.82, storeys = 3 + density;
    const level = index => {
      const width = base - index * inset, height = index === 0 ? 0.36 : 0.28;
      const y = index === 0 ? -0.5 + 0.18 : -0.5 + 0.36 + (index - 1) * 0.28 + 0.14;
      return { width, height, y, depth: width * depth };
    };
    // A floor line at every storey of every tier of the tower: a shallow spandrel band projecting
    // past the perforated facade, which is what marks the storey divisions on a built tower.
    for (let index = 0; index < 3; index++) {
      const { width, height, y, depth: span } = level(index);
      for (let storey = 1; storey < storeys; storey++) {
        box([0, y - height / 2 + storey * height / storeys, 0], [width + 0.024, 0.014, span + 0.024], trim, 0.001);
      }
    }
    // Every setback leaves a real roof terrace, so each one needs a guarding edge: a parapet set on
    // the trim slab the caller lays over the block below.
    const terraceParapet = index => {
      const { width, height, y, depth: span } = level(index);
      const slab = y + height / 2 + 0.018, height2 = 0.03 + density * 0.005;
      roofParapet([0, 0], [width / 2 + 0.0025, span / 2 + 0.0025], slab, height2);
    };
    terraceParapet(0);
    terraceParapet(1);
    terraceParapet(2);
    // Stair and lift core breaking the top roof, with the lift overrun above it. The caller's plant
    // box occupies the front half of that roof, so the core takes the rear strip behind it.
    const crown = level(2), crownTop = crown.y + crown.height / 2 + 0.018;
    box([0, crownTop + 0.0275, -0.19], [0.26, 0.075, 0.085], wall);
    box([0.06, crownTop + 0.0795, -0.19], [0.10, 0.029, 0.075], metal);
    // Louvred plant intake on the core face, the way a lift overrun is ventilated.
    if (density >= 1) for (let fin = 0; fin < 2 + density; fin++) {
      box([-0.07 + fin * 0.14 / (1 + density), crownTop + 0.0275, -0.1465], [0.03, 0.05, 0.006], metal, 0.001);
    }
    // A lattice mast standing on the roof plant, hooped and guyed back to the roof slab. It tops out
    // level with the caller's own thin mast so the assembly envelope does not grow.
    const plantTop = 0.50, mastTop = 0.565, mastX = -0.105, mastZ = 0.075, mastBase = 0.032, mastHead = 0.013;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      tube([[mastX + sx * mastBase, plantTop, mastZ + sz * mastBase], [mastX + sx * mastHead, mastTop, mastZ + sz * mastHead]], 0.005, metal);
    }
    for (let hoop = 0; hoop < 2 + density; hoop++) {
      const t = (hoop + 1) / (3 + density);
      ring(mastBase + (mastHead - mastBase) * t, 0.004, [mastX, plantTop + (mastTop - plantTop) * t, mastZ], metal);
    }
    if (density >= 1) for (const sx of [-1, 1]) {
      tube([[mastX + sx * mastBase, plantTop, mastZ - mastBase], [mastX + sx * mastHead, mastTop, mastZ + mastHead]], 0.003, metal);
      tube([[mastX + sx * mastBase, plantTop, mastZ + mastBase], [mastX + sx * mastHead, mastTop, mastZ - mastHead]], 0.003, metal);
    }
    for (const [anchorX, anchorZ] of [[0.27, 0.21], [0.25, -0.19], [-0.05, 0.225]]) {
      tube([[mastX, mastTop - 0.012, mastZ], [anchorX, crownTop + 0.004, anchorZ]], 0.0035, metal);
      if (density >= 1) box([anchorX, crownTop + 0.008, anchorZ], [0.03, 0.016, 0.03], metal, 0.002);
    }
    // Ground-floor entrance on the +z facade the caller already leaves open: a canopy carried on two
    // columns, the recessed lobby plane behind the opening, and a step at the pavement.
    const face = level(0).depth / 2;
    box([0, -0.372, face + 0.03], [0.30, 0.018, 0.08], trim);
    box([0, -0.4925, face + 0.04], [0.34, 0.015, 0.10], stone, 0.002);
    for (const x of [-0.125, 0.125]) cylinder([x, -0.4405, face + 0.043], 0.017, 0.119, trim);
    box([0, -0.44, face - 0.033], [0.20, 0.12, 0.008], glass);
    if (density >= 1) box([0, -0.386, face + 0.066], [0.30, 0.024, 0.012], trim, 0.001);
  } else if (kind === "courtyard-midrise") {
    // Four blocks around a courtyard, standing on the caller's ground slab whose top face is at
    // -0.4625, with the door of the north block opening onto the courtyard at x = 0.
    const slab = -0.4625, court = 0.25, line = 0.24, columnRadius = 0.017;
    const storey = 0.86 / (4 + tier);   // the north block's storey height, so the arcade and the
    const floor1 = -0.49 + storey;      // balconies line up with the caller's window rows
    const lintel = 0.03;
    // Courtyard paving: joints cut both ways across the court, the way a paved court is set out.
    const joints = 2 + density * 2;
    for (let index = 0; index <= joints; index++) {
      const position = -court + index * court * 2 / joints;
      box([0, slab + 0.002, position], [court * 2, 0.007, 0.014], stone, 0.001);
      box([position, slab + 0.002, 0], [0.014, 0.007, court * 2], stone, 0.001);
    }
    // Arcade of columns one storey high with its lintel beam, on the courtyard faces of the north
    // and south blocks and, from the middle tier up, of the west block. Each side runs from corner
    // to corner, so a column shared by two colonnaded sides is placed once.
    const sides = [
      { alongX: true, fixed: -line, dir: 1, door: true },
      { alongX: true, fixed: line, dir: -1 },
      ...(density >= 1 ? [{ alongX: false, fixed: -line, dir: 1 }] : [])
    ];
    const columns = 4 + density * 2, placed = new Set();
    for (const side of sides) {
      for (let index = 0; index < columns; index++) {
        const t = -line + index * line * 2 / (columns - 1);
        // The caller leaves a doorway in the middle of the north courtyard face: keep that bay open.
        if (side.door && Math.abs(t) < 0.075) continue;
        const px = side.alongX ? t : side.fixed, pz = side.alongX ? side.fixed : t;
        if (Math.abs(Math.abs(t) - line) < 1e-9) {
          const key = `${px.toFixed(3)},${pz.toFixed(3)}`;
          if (placed.has(key)) continue;
          placed.add(key);
        }
        cylinder([px, slab + (floor1 - lintel - slab) / 2, pz], columnRadius, floor1 - lintel - slab, trim);
        if (density >= 1) box([px, slab + 0.008, pz], [0.05, 0.016, 0.05], stone, 0.002);
      }
      // Lintel beam over the arcade, carrying the balcony that sits above it.
      box(side.alongX ? [0, floor1 - lintel / 2, side.fixed] : [side.fixed, floor1 - lintel / 2, 0],
        side.alongX ? [line * 2 + 0.02, lintel, 0.05] : [0.05, lintel, line * 2 + 0.02], trim);
    }
    // Balcony slabs and railings on the courtyard-facing elevations of the north and south blocks,
    // which are the two elevations that carry the arcade.
    for (const side of sides.filter(item => item.alongX)) {
      const centre = side.fixed + side.dir * 0.045, edge = side.fixed + side.dir * 0.105;
      box([0, floor1 + 0.01, centre], [0.48, 0.02, 0.13], trim);
      box([0, floor1 + 0.07, edge], [0.48, 0.012, 0.014], metal);
      for (let baluster = 0; baluster < 4 + density * 2; baluster++) {
        box([-line + baluster * line * 2 / (3 + density * 2), floor1 + 0.046, edge], [0.01, 0.044, 0.01], metal, 0.001);
      }
      // Return railings closing the two ends of the balcony.
      if (density >= 1) for (const sign of [-1, 1]) {
        box([sign * (line - 0.006), floor1 + 0.07, centre], [0.012, 0.012, 0.13], metal);
      }
    }
    // Straight stair from the courtyard up to the first-floor balcony, with a handrail: the east
    // block carries no arcade, so the flight runs against its courtyard face.
    const steps = 6 + density * 2, run = 0.24 / steps, rise = (floor1 + 0.018 - slab) / steps;
    for (let step = 0; step < steps; step++) {
      box([0.21, slab + (step + 0.5) * rise, 0.05 - (step + 0.5) * run], [0.10, rise, run], stone, 0.001);
    }
    tube([[0.244, slab + 0.075, 0.06], [0.244, (slab + floor1) / 2 + 0.05, -0.07], [0.244, floor1 + 0.07, -0.20]], 0.007, metal);
    if (density >= 1) for (let post = 0; post <= density; post++) {
      const t = (post + 1) / (density + 2);
      box([0.244, slab + t * (floor1 - slab) + 0.03, 0.06 - t * 0.25], [0.008, 0.05, 0.008], metal, 0.001);
    }
    // Rooftop plant enclosure inside its parapet on the roof of the south block, and a lighter
    // parapet with its own plant on the taller north roof.
    roofParapet([0, 0.37], [0.4925, 0.1225], 0.308, 0.028 + density * 0.002);
    roofParapet([0, -0.37], [0.4925, 0.1225], 0.388, 0.028 + density * 0.002);
    box([-0.10, 0.322, 0.37], [0.30, 0.028, 0.16], metal);
    cylinder([-0.02, 0.348, 0.37], 0.022, 0.05, metal);
    if (density >= 1) {
      // Louvred faces on the plant enclosure, and a small enclosure on the taller roof.
      for (let fin = 0; fin < 3 + density; fin++) {
        box([-0.22 + fin * 0.24 / (2 + density), 0.322, 0.292], [0.03, 0.022, 0.006], metal, 0.001);
      }
      box([0, 0.402, -0.37], [0.34, 0.026, 0.16], metal);
    }
    // Guiding parapets along the courtyard and outer edges of the two lower wing roofs.
    if (density >= 2) for (const sign of [-1, 1]) {
      box([sign * 0.4825, 0.283, 0], [0.02, 0.03, 0.53], trim, 0.001);
      box([sign * 0.2575, 0.283, 0], [0.02, 0.03, 0.53], trim, 0.001);
    }
  } else {
    // A crossing of two blocks with the caller's two portico columns and lintel already standing on
    // the +z face, its column bases at y = -0.425.
    const landingY = -0.425;
    // Podium: a plinth course under the whole crossing, carried forward to receive the portico.
    box([0, -0.485, 0.06], [0.98, 0.03, 1.10], trim, 0.003);
    // Three steps up from the podium to the portico landing, which is set at the column bases.
    box([0, -0.4625, 0.395], [0.88, 0.015, 0.41], stone, 0.002);
    box([0, -0.446, 0.37], [0.80, 0.018, 0.36], stone, 0.002);
    box([0, -0.431, 0.39], [0.72, 0.012, 0.42], stone, 0.002);
    // Portico: a front row of four columns on the landing, carrying the entablature and pediment
    // that rise above the caller's inner columns and lintel.
    for (const x of [-0.36, -0.12, 0.12, 0.36]) {
      cylinder([x, (landingY + 0.165) / 2, 0.56], 0.028, 0.165 - landingY, trim);
      if (density >= 1) box([x, landingY + 0.010, 0.56], [0.075, 0.02, 0.075], trim, 0.002);
      if (density >= 2) box([x, 0.152, 0.56], [0.075, 0.026, 0.075], trim, 0.002);
    }
    box([0, 0.1825, 0.50], [0.88, 0.035, 0.24], trim, 0.002);
    // Pediment over the entablature, cut as a real triangular prism rather than painted on.
    const pediment = new THREE.Shape();
    pediment.moveTo(-0.44, 0); pediment.lineTo(0.44, 0); pediment.lineTo(0, 0.085); pediment.closePath();
    put(new THREE.ExtrudeGeometry(pediment, { depth: 0.24, steps: 1, bevelEnabled: false }), trim, [0, 0.20, 0.38]);
    // Flag masts flanking the steps, with a flag from the middle tier up.
    for (const x of [-0.42, 0.42]) {
      cylinder([x, -0.085, 0.56], 0.008, 0.77, metal);
      cylinder([x, 0.307, 0.56], 0.016, 0.014, metal);
      if (density >= 1) box([x - Math.sign(x) * 0.055, 0.255, 0.56], [0.10, 0.05, 0.006], trim, 0.001);
    }
    // Civic lettering on the lintel face the caller already builds.
    for (let letter = 0; letter < 4 + density; letter++) {
      box([-0.135 + letter * 0.27 / (3 + density), 0.14, 0.613], [0.035, 0.026, 0.008], metal, 0.001);
    }
    // Parapet at the roof edge of both arms of the crossing, both standing on the caller's cornices.
    roofParapet([0, 0], [0.2025, 0.4825], 0.258, 0.045);
    if (density >= 1) roofParapet([0, 0], [0.4825, 0.2025], 0.198, 0.045);
    // Roof plant inside the parapet, louvred and flued.
    box([0, 0.272, -0.34], [0.32, 0.028, 0.22], metal);
    cylinder([0.10, 0.30, -0.34], 0.022, 0.05, metal);
    if (density >= 1) {
      for (let fin = 0; fin < 3 + density; fin++) {
        box([-0.13 + fin * 0.26 / (2 + density), 0.272, -0.454], [0.03, 0.022, 0.006], metal, 0.001);
      }
      box([0.35, 0.212, 0], [0.20, 0.028, 0.30], metal);
      box([-0.35, 0.212, 0], [0.20, 0.028, 0.30], metal);
    }
  }
  return parts;
}
