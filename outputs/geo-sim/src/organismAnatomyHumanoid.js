import * as THREE from "three";
import { mergeGeometries } from "../vendor/three/addons/utils/BufferGeometryUtils.js";

/*
 * Human figure and the remaining terrestrial morphotypes.
 *
 * `humanAnatomy` is the first human geometry in this repository. A figure drawn at regional scale is a
 * stand-in for people, not a depiction of any individual or group, and the proportions are a generic
 * adult morphotype chosen to read at the engine's on-screen size - they are NOT anthropometric
 * measurements. CALIBRATED marks every proportion that is a judgement call.
 *
 * `bipedAnatomy` covers the bird builds, `pachydermAnatomy` the elephant and giraffe, and
 * `smallFaunaAnatomy` the macropod, the lagomorph and the suid. Each is a procedural morphotype and
 * not a scanned specimen.
 *
 * Every function returns an array of parts and merges nothing: the caller merges the array with
 * mergeGeometries, matching the other anatomy modules.
 *
 * Axis convention: +X faces forward, +Y is up, +Z is the subject's left.
 */

const TAU = Math.PI * 2;
const vec = p => new THREE.Vector3(...p);

function tint(geometry, hex) {
  const color = new THREE.Color(hex), positions = geometry.getAttribute("position"), colors = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) color.toArray(colors, i * 3);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  if (!geometry.getAttribute("uv")) geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(positions.count * 2), 2));
  return geometry;
}

function sphere(position, scale, color, segments) {
  const g = new THREE.SphereGeometry(1, segments, Math.max(10, Math.round(segments / 2)));
  g.scale(...scale); g.translate(...position); return tint(g, color);
}

function limb(from, to, radius, color, segments) {
  const a = vec(from), b = vec(to), direction = b.clone().sub(a), length = direction.length();
  const g = new THREE.CylinderGeometry(radius * 0.82, radius, Math.max(1e-4, length), Math.max(6, Math.round(segments / 3)), 1, false);
  g.translate(0, length / 2, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const axis = up.clone().cross(direction);
  if (axis.lengthSq() > 1e-12) g.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(axis.normalize(), Math.acos(Math.min(1, Math.max(-1, up.dot(direction.clone().normalize()))))));
  else if (direction.y < 0) g.rotateX(Math.PI);
  g.translate(...from);
  return tint(g, color);
}

// Indexed, like every other primitive here: mergeGeometries refuses to mix indexed and non-indexed
// inputs, and a non-indexed plate would fail the merge the caller performs.
function plate(corners, color) {
  const [a, b, c, d] = corners.map(vec);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([a, b, c, d].flatMap(v => v.toArray()), 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return tint(g, color);
}

/**
 * Uniformly scale a part list so its merged extents fit a limit. Measured on the merged result rather
 * than per part, so it agrees with the envelope the engine measures. A build already inside the limit
 * is left exactly as it is, so anatomical proportion is never altered without cause.
 */
function fitToEnvelope(parts, limit) {
  const merged = mergeGeometries(parts);
  if (!merged) return;
  merged.computeBoundingBox();
  const box = merged.boundingBox;
  const extent = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
  merged.dispose?.();
  if (!Number.isFinite(extent) || extent <= limit) return;
  const fit = limit / extent;
  for (const part of parts) part.scale(fit, fit, fit);
}

// ---------------------------------------------------------------- human

const SKIN = 0xc79a76, HAIR = 0x39302b, GARMENT = 0x4d6478, TROUSER = 0x3b4148, SHOE = 0x2a2a2c;

/** CALIBRATED: head-to-height ratio of roughly one to seven, the usual figure-drawing convention. */
export function humanAnatomy(detail, variant) {
  const d = Math.max(12, Math.round(Number(detail) || 24));
  const pose = Math.abs(Math.floor(Number(variant) || 0)) % 3; // 0 standing, 1 walking, 2 seated
  const parts = [];
  const hipY = pose === 2 ? -0.06 : 0.02;
  // Torso as two tapered blocks so the shoulders read wider than the waist.
  parts.push(sphere([0, hipY + 0.06, 0], [0.072, 0.083, 0.055], GARMENT, d));
  parts.push(sphere([0, hipY + 0.20, 0], [0.099, 0.084, 0.062], GARMENT, d));
  parts.push(sphere([0, hipY + 0.02, 0], [0.079, 0.055, 0.058], TROUSER, d));
  // Neck and head, with a slight forward set so the figure reads as looking ahead.
  parts.push(limb([0, hipY + 0.27, 0], [0, hipY + 0.315, 0], 0.027, SKIN, d));
  parts.push(sphere([0, hipY + 0.362, 0.004], [0.062, 0.074, 0.062], SKIN, d));
  parts.push(sphere([0, hipY + 0.392, -0.012], [0.065, 0.055, 0.066], HAIR, d));
  // Arms: one swings forward in the walking pose, both rest forward when seated.
  for (const side of [-1, 1]) {
    const shoulder = [0, hipY + 0.255, side * 0.098];
    const swing = pose === 1 ? (side > 0 ? 0.07 : -0.07) : pose === 2 ? 0.06 : 0;
    const elbow = [shoulder[0] + swing, hipY + 0.135, side * 0.11];
    const hand = [elbow[0] + (pose === 2 ? 0.1 : swing), hipY + 0.015 + (pose === 2 ? 0.06 : 0), side * 0.108];
    parts.push(limb(shoulder, elbow, 0.031, GARMENT, d));
    parts.push(limb(elbow, hand, 0.025, SKIN, d));
    parts.push(sphere(hand, [0.028, 0.033, 0.02], SKIN, d));
  }
  // Legs: hips flexed and shins vertical when seated, one leg forward when walking.
  for (const side of [-1, 1]) {
    const hip = [0, hipY - 0.03, side * 0.042];
    if (pose === 2) {
      const knee = [hip[0] + 0.15, hip[1] - 0.01, hip[2]];
      const ankle = [knee[0], knee[1] - 0.20, knee[2]];
      parts.push(limb(hip, knee, 0.045, TROUSER, d));
      parts.push(limb(knee, ankle, 0.034, TROUSER, d));
      parts.push(plate([[ankle[0] - 0.01, ankle[1], ankle[2] - 0.026], [ankle[0] + 0.10, ankle[1], ankle[2] - 0.026],
        [ankle[0] + 0.10, ankle[1], ankle[2] + 0.026], [ankle[0] - 0.01, ankle[1], ankle[2] + 0.026]], SHOE));
    } else {
      const stride = pose === 1 ? (side > 0 ? 0.05 : -0.05) : 0;
      const knee = [hip[0] + stride, hip[1] - 0.155, hip[2]];
      const ankle = [knee[0] - stride * 0.6, hip[1] - 0.30, knee[2]];
      parts.push(limb(hip, knee, 0.048, TROUSER, d));
      parts.push(limb(knee, ankle, 0.035, TROUSER, d));
      parts.push(sphere([ankle[0] + 0.028, ankle[1] - 0.026, ankle[2]], [0.058, 0.021, 0.031], SHOE, d));
    }
  }
  return parts;
}

/** Semi-aquatic builds: 0 otter, 1 beaver or capybara with a flat paddle tail, 2 pinniped. */
export function semiAquaticAnatomy(detail, variant) {
  const d = Math.max(12, Math.round(Number(detail) || 24));
  const build = Math.abs(Math.floor(Number(variant) || 0)) % 3;
  const fur = build === 2 ? 0x8d949a : build === 1 ? 0x6f5638 : 0x7a5c40;
  const parts = [];
  if (build === 0) {
    // Otter: long sinuous low-slung body, short webbed limbs, a thick tapering muscular tail.
    parts.push(sphere([0, 0, 0], [0.30, 0.115, 0.10], fur, d));
    parts.push(sphere([0.30, 0.02, 0], [0.10, 0.095, 0.088], fur, d));
    parts.push(sphere([0.40, -0.01, 0], [0.045, 0.038, 0.042], 0x4a3a2c, d));
    for (const side of [-1, 1]) {
      parts.push(limb([0.17, -0.08, side * 0.085], [0.22, -0.20, side * 0.10], 0.026, fur, d));
      parts.push(limb([-0.13, -0.08, side * 0.085], [-0.11, -0.20, side * 0.10], 0.028, fur, d));
      parts.push(plate([[0.20, -0.23, side * 0.07], [0.20, -0.23, side * 0.13], [0.30, -0.24, side * 0.13], [0.30, -0.24, side * 0.07]], 0x5e4830));
      parts.push(sphere([0.34, 0.06, side * 0.045], [0.016, 0.016, 0.014], 0x1d2422, d));
    }
    parts.push(limb([-0.30, 0, 0], [-0.52, -0.05, 0], 0.055, fur, d));
    parts.push(limb([-0.52, -0.05, 0], [-0.66, -0.10, 0], 0.024, fur, d));
    return parts;
  }
  if (build === 1) {
    // Rodent: heavy barrel body, short legs, and a broad flattened paddle tail - not a tube.
    parts.push(sphere([0, 0.02, 0], [0.24, 0.17, 0.15], fur, d));
    parts.push(sphere([0.26, 0.05, 0], [0.10, 0.095, 0.085], fur, d));
    parts.push(sphere([0.35, 0.02, 0], [0.045, 0.045, 0.040], 0x8a7050, d));
    for (const side of [-1, 1]) {
      parts.push(sphere([0.30, 0.12, side * 0.048], [0.026, 0.026, 0.020], fur, d));
      parts.push(limb([0.16, -0.10, side * 0.10], [0.19, -0.26, side * 0.11], 0.030, fur, d));
      parts.push(limb([-0.15, -0.10, side * 0.10], [-0.12, -0.26, side * 0.11], 0.032, fur, d));
      parts.push(sphere([0.18, -0.15, side * 0.05], [0.020, 0.015, 0.016], 0x241f1b, d));
    }
    // The paddle: wide, flat and scaled hard on the vertical axis.
    parts.push(sphere([-0.44, -0.02, 0], [0.19, 0.030, 0.085], 0x3f3a33, d));
    parts.push(plate([[-0.26, 0.0, -0.055], [-0.26, 0.0, 0.055], [-0.62, -0.03, 0.075], [-0.62, -0.03, -0.075]], 0x36322c));
    return parts;
  }
  // Pinniped: fusiform body with a blubber neck, fore and hind flippers swept back.
  parts.push(sphere([0, 0.02, 0], [0.34, 0.155, 0.135], fur, d));
  parts.push(sphere([0.03, 0.0, 0], [0.155, 0.135, 0.125], 0x99a0a6, d));
  parts.push(sphere([0.32, 0.04, 0], [0.085, 0.082, 0.075], fur, d));
  parts.push(sphere([0.40, 0.02, 0], [0.038, 0.032, 0.036], 0x2b3336, d));
  for (const side of [-1, 1]) {
    parts.push(sphere([0.36, 0.05, side * 0.042], [0.014, 0.014, 0.012], 0x14191b, d));
    // Foreflipper: flattened and swept back, unmistakably not a leg.
    parts.push(plate([[0.20, -0.06, side * 0.10], [0.16, -0.10, side * 0.12], [-0.02, -0.16, side * 0.20], [0.04, -0.11, side * 0.16]], 0x7e858a));
    // Hindflipper, trailed behind.
    parts.push(plate([[-0.28, -0.05, side * 0.055], [-0.28, -0.09, side * 0.075], [-0.58, -0.10, side * 0.135], [-0.56, -0.05, side * 0.10]], 0x757c81));
  }
  fitToEnvelope(parts, 1.30);
  return parts;
}

// ---------------------------------------------------------------- remaining terrestrial classes

/** Bird builds: 0 wading crane and hornbill, 1 soaring raptor, 2 flightless penguin. */
export function bipedAnatomy(detail, variant) {
  const d = Math.max(12, Math.round(Number(detail) || 24));
  const build = Math.abs(Math.floor(Number(variant) || 0)) % 3;
  const parts = [];
  const body = build === 2 ? 0xb9c2c8 : 0x6d6b62;
  const dark = build === 2 ? 0x2c3438 : 0x4c4a44;
  if (build === 2) {
    parts.push(sphere([0, 0.03, 0], [0.13, 0.27, 0.13], body, d));
    parts.push(sphere([0, 0.28, 0.01], [0.084, 0.09, 0.084], dark, d));
    parts.push(limb([0.07, 0.27, 0], [0.19, 0.26, 0], 0.022, 0x8a7f52, d));
    for (const side of [-1, 1]) {
      parts.push(plate([[0.02, 0.06, side * 0.09], [-0.14, -0.04, side * 0.11], [-0.20, -0.16, side * 0.10], [-0.06, -0.08, side * 0.08]], dark));
      parts.push(plate([[-0.03, -0.24, side * 0.04], [-0.03, -0.24, side * 0.10], [0.06, -0.26, side * 0.10], [0.06, -0.26, side * 0.04]], 0xa8763f));
    }
    return parts;
  }
  parts.push(sphere([0, 0.02, 0], build === 1 ? [0.16, 0.10, 0.11] : [0.12, 0.11, 0.10], body, d));
  // Long S-neck for the wader, short deep chest and a hooked bill for the raptor.
  if (build === 0) {
    parts.push(limb([0.06, 0.06, 0], [0.16, 0.20, 0], 0.032, body, d));
    parts.push(limb([0.16, 0.20, 0], [0.26, 0.30, 0], 0.028, body, d));
    parts.push(sphere([0.30, 0.31, 0], [0.048, 0.05, 0.042], body, d));
    parts.push(limb([0.34, 0.31, 0], [0.50, 0.29, 0], 0.016, 0x9a8757, d));
    for (const side of [-1, 1]) {
      parts.push(limb([-0.02, -0.06, side * 0.05], [0.03, -0.34, side * 0.055], 0.013, 0x8b8478, d));
      parts.push(limb([0.03, -0.34, side * 0.055], [0.11, -0.44, side * 0.06], 0.010, 0x8b8478, d));
      parts.push(plate([[0.11, -0.46, side * 0.02], [0.11, -0.46, side * 0.10], [0.19, -0.47, side * 0.10], [0.19, -0.47, side * 0.02]], 0x7d7568));
    }
  } else {
    parts.push(sphere([0.17, 0.06, 0], [0.062, 0.058, 0.052], dark, d));
    parts.push(limb([0.21, 0.05, 0], [0.27, 0.02, 0], 0.015, 0xd8b45c, d));
    parts.push(sphere([0.285, 0.008, 0], [0.022, 0.026, 0.018], 0x6b5326, d));
    for (const side of [-1, 1]) {
      // High-aspect wing with separated primaries at the tip.
      parts.push(plate([[-0.02, 0.07, side * 0.07], [0.12, 0.06, side * 0.09], [0.02, -0.01, side * 0.62], [-0.14, 0.0, side * 0.58]], dark));
      for (let f = 0; f < 5; f++) {
        const t = f / 4;
        parts.push(plate([[-0.14 + t * 0.02, 0.0, side * (0.5 + t * 0.1)], [-0.06 + t * 0.02, -0.01, side * (0.52 + t * 0.1)],
          [-0.10 + t * 0.02, -0.03, side * (0.62 + t * 0.09)], [-0.18 + t * 0.02, -0.02, side * (0.60 + t * 0.09)]], 0x57554e));
      }
      parts.push(limb([-0.02, -0.06, side * 0.045], [-0.05, -0.16, side * 0.05], 0.014, 0xd8b45c, d));
      parts.push(sphere([-0.06, -0.18, side * 0.05], [0.026, 0.012, 0.016], 0x8a7038, d));
    }
    parts.push(plate([[-0.14, 0.03, -0.07], [-0.14, 0.03, 0.07], [-0.40, 0.0, 0.10], [-0.40, 0.0, -0.10]], 0x605e57));
    // CALIBRATED: a soaring raptor's wingspan is its largest dimension by nature, so the whole build is
    // measured as the merged extents and scaled to fit the module's display envelope, rather than being
    // shortened wingtip by wingtip. Measured after merge, not per part, because only the merged extents
    // are what the engine's own envelope check sees.
    fitToEnvelope(parts, 1.18);
  }
  return parts;
}

/** Pachyderm builds: 0 elephant with trunk and tusks, 1 giraffe with a long neck, 2 bison or yak. */
export function pachydermAnatomy(detail, variant) {
  const d = Math.max(12, Math.round(Number(detail) || 24));
  const build = Math.abs(Math.floor(Number(variant) || 0)) % 3;
  const coat = build === 0 ? 0x8b8880 : build === 1 ? 0xb99a5f : 0x5c4632;
  const parts = [];
  const hipY = 0.0;
  if (build === 1) {
    // Giraffe: the neck is a substantial share of the total height, and the back slopes down to the rear.
    parts.push(sphere([-0.16, hipY + 0.10, 0], [0.15, 0.10, 0.10], coat, d));
    parts.push(sphere([0.06, hipY + 0.20, 0], [0.13, 0.13, 0.11], coat, d));
    parts.push(limb([0.10, hipY + 0.28, 0], [0.18, hipY + 0.52, 0], 0.042, coat, d));
    parts.push(limb([0.18, hipY + 0.52, 0], [0.28, hipY + 0.72, 0], 0.034, coat, d));
    parts.push(sphere([0.31, hipY + 0.74, 0], [0.055, 0.05, 0.045], coat, d));
    parts.push(limb([0.35, hipY + 0.74, 0], [0.44, hipY + 0.72, 0], 0.016, 0xa88b58, d));
    for (const side of [-1, 1]) {
      parts.push(limb([0.30, hipY + 0.79, side * 0.022], [0.31, hipY + 0.85, side * 0.026], 0.010, 0x6b5433, d));
      for (const legX of [0.14, -0.22]) parts.push(limb([legX, hipY + 0.05, side * 0.075], [legX, hipY - 0.46, side * 0.08], 0.026, coat, d));
    }
    parts.push(plate([[-0.30, hipY + 0.15, 0], [-0.28, hipY + 0.22, 0], [-0.40, hipY + 0.02, 0], [-0.40, hipY + 0.06, 0]], 0x4a3a26));
    return parts;
  }
  if (build === 2) {
    // Bison and yak: massive forequarters with a shoulder hump, low hindquarters, shaggy skirt.
    parts.push(sphere([0.10, hipY + 0.16, 0], [0.24, 0.20, 0.15], coat, d));
    parts.push(sphere([-0.20, hipY + 0.10, 0], [0.17, 0.14, 0.13], coat, d));
    parts.push(sphere([0.36, hipY + 0.20, 0], [0.09, 0.09, 0.075], coat, d));
    parts.push(plate([[0.06, hipY + 0.32, -0.15], [0.06, hipY + 0.32, 0.15], [-0.06, hipY + 0.14, 0.16], [-0.06, hipY + 0.14, -0.16]], 0x3f3122));
    for (const side of [-1, 1]) {
      parts.push(limb([0.40, hipY + 0.22, side * 0.055], [0.38, hipY + 0.27, side * 0.12], 0.017, 0xd8cdb4, d));
      for (const legX of [0.20, -0.24]) parts.push(limb([legX, hipY + 0.04, side * 0.085], [legX, hipY - 0.46, side * 0.09], 0.032, coat, d));
    }
    parts.push(limb([-0.30, hipY + 0.14, 0], [-0.38, hipY - 0.05, 0], 0.014, 0x3f3122, d));
    return parts;
  }
  // Elephant: barrel torso, columnar legs, a ringed trunk, broad ear plates and tusks.
  parts.push(sphere([0, hipY + 0.16, 0], [0.24, 0.19, 0.15], coat, d));
  parts.push(sphere([0.30, hipY + 0.18, 0], [0.11, 0.11, 0.10], coat, d));
  parts.push(limb([0.36, hipY + 0.14, 0], [0.46, hipY + 0.02, 0], 0.042, coat, d));
  parts.push(limb([0.46, hipY + 0.02, 0], [0.52, hipY - 0.22, 0], 0.030, coat, d));
  for (const side of [-1, 1]) {
    // Ear as a broad flattened plate rather than a lump.
    parts.push(plate([[0.30, hipY + 0.30, side * 0.10], [0.30, hipY + 0.30, side * 0.34], [0.14, hipY + 0.02, side * 0.30], [0.14, hipY + 0.04, side * 0.10]], 0x9a968e));
    parts.push(limb([0.38, hipY + 0.10, side * 0.055], [0.52, hipY + 0.06, side * 0.075], 0.015, 0xeee6d2, d));
    for (const legX of [0.16, -0.16]) parts.push(limb([legX, hipY + 0.02, side * 0.10], [legX, hipY - 0.48, side * 0.10], 0.048, coat, d));
  }
  parts.push(limb([-0.24, hipY + 0.16, 0], [-0.32, hipY - 0.06, 0], 0.016, coat, d));
  return parts;
}

/** Small fauna builds: 0 macropod, 1 suid, 2 lagomorph or arboreal rodent. */
export function smallFaunaAnatomy(detail, variant) {
  const d = Math.max(12, Math.round(Number(detail) || 24));
  const build = Math.abs(Math.floor(Number(variant) || 0)) % 3;
  const fur = build === 0 ? 0xa8763f : build === 1 ? 0x6d5642 : 0x9c8b6f;
  const parts = [];
  if (build === 0) {
    // Kangaroo: upright, huge hind legs and feet, thick counterbalancing tail, small forelimbs.
    parts.push(sphere([0.02, 0.10, 0], [0.09, 0.15, 0.09], fur, d));
    parts.push(sphere([0.10, 0.30, 0], [0.055, 0.06, 0.05], fur, d));
    for (const side of [-1, 1]) {
      parts.push(plate([[0.09, 0.35, side * 0.02], [-0.01, 0.30, side * 0.055], [0.03, 0.42, side * 0.06], [0.11, 0.42, side * 0.03]], fur));
      parts.push(limb([0.08, 0.20, side * 0.06], [0.14, 0.10, side * 0.07], 0.018, fur, d));
      parts.push(limb([-0.02, -0.02, side * 0.07], [0.10, -0.14, side * 0.08], 0.045, fur, d));
      parts.push(limb([0.10, -0.14, side * 0.08], [-0.10, -0.20, side * 0.08], 0.032, fur, d));
      parts.push(plate([[-0.10, -0.24, side * 0.045], [-0.10, -0.24, side * 0.105], [0.16, -0.22, side * 0.105], [0.16, -0.22, side * 0.045]], 0x8a6135));
    }
    parts.push(limb([-0.06, 0.04, 0], [-0.32, -0.10, 0], 0.048, fur, d));
    parts.push(limb([-0.32, -0.10, 0], [-0.52, -0.18, 0], 0.020, fur, d));
    return parts;
  }
  if (build === 1) {
    // Suid: low barrel body, short legs, a disc snout and a curled tail.
    parts.push(sphere([0, 0.06, 0], [0.20, 0.14, 0.12], fur, d));
    parts.push(sphere([0.24, 0.06, 0], [0.09, 0.085, 0.075], fur, d));
    parts.push(sphere([0.32, 0.05, 0], [0.035, 0.045, 0.035], 0xb08a6a, d));
    for (const side of [-1, 1]) {
      parts.push(plate([[0.16, 0.15, side * 0.06], [0.10, 0.11, side * 0.10], [0.20, 0.10, side * 0.10], [0.24, 0.14, side * 0.06]], 0x4f4034));
      for (const legX of [0.14, -0.13]) parts.push(limb([legX, 0.0, side * 0.075], [legX, -0.30, side * 0.08], 0.025, fur, d));
    }
    parts.push(limb([-0.20, 0.10, 0], [-0.30, 0.16, 0], 0.010, 0x4f4034, d));
    return parts;
  }
  // Lagomorph: crouched body with long upright ears as the defining feature.
  parts.push(sphere([0, 0.0, 0], [0.16, 0.12, 0.11], fur, d));
  parts.push(sphere([0.16, 0.04, 0], [0.072, 0.068, 0.062], fur, d));
  for (const side of [-1, 1]) {
    parts.push(plate([[0.15, 0.10, side * 0.028], [0.15, 0.10, side * 0.062], [0.07, 0.30, side * 0.055], [0.07, 0.30, side * 0.022]], 0xa88a68));
    parts.push(sphere([0.06, -0.08, side * 0.085], [0.062, 0.05, 0.042], fur, d));
    parts.push(limb([0.13, -0.06, side * 0.06], [0.17, -0.20, side * 0.065], 0.020, fur, d));
  }
  parts.push(sphere([-0.15, 0.02, 0], [0.032, 0.032, 0.032], 0xe8e2d6, d));
  return parts;
}
