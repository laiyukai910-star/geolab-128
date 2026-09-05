import * as THREE from "three";

// Render-only botanical structure. Branch/leaf counts do not represent biomass.
export function createFoliageGeometry(conifer, quality, variant = 0) {
  const distant = quality === "distant";
  const tier = quality === "exhaustive" ? 2 : quality === "ultra" ? 1 : 0;
  let seed = (1937 + variant * 65537 + (conifer ? 971 : 0)) >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const positions = [], colors = [], indices = [];
  let branchCount = 0, leafCount = 0;
  const up = new THREE.Vector3(0, 1, 0);
  const frame = direction => {
    const axis = direction.clone().normalize();
    const side = new THREE.Vector3().crossVectors(axis, Math.abs(axis.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : up).normalize();
    return [axis, side, new THREE.Vector3().crossVectors(axis, side).normalize()];
  };
  const vertex = (point, color) => {
    positions.push(point.x, point.y, point.z);
    colors.push(...color);
    return positions.length / 3 - 1;
  };
  const branch = (a, b, radius) => {
    const [axis, side, normal] = frame(b.clone().sub(a));
    const sides = distant ? 3 : 5 + tier * 2;
    const rings = distant ? 1 : 3;
    const first = positions.length / 3;
    for (let ring = 0; ring <= rings; ring++) {
      const t = ring / rings;
      const center = a.clone().lerp(b, t).addScaledVector(normal, Math.sin(t * Math.PI) * radius * 1.8);
      for (let i = 0; i < sides; i++) {
        const angle = i / sides * Math.PI * 2;
        const r = radius * (1 - t * 0.72) * (1 + 0.08 * Math.cos(i * 3));
        vertex(center.clone().addScaledVector(side, Math.cos(angle) * r).addScaledVector(normal, Math.sin(angle) * r), [0.42, 0.31, 0.2]);
      }
    }
    for (let ring = 0; ring < rings; ring++) for (let i = 0; i < sides; i++) {
      const a0 = first + ring * sides + i, a1 = first + ring * sides + (i + 1) % sides;
      indices.push(a0, a1, a0 + sides, a1, a1 + sides, a0 + sides);
    }
    // Close cut ends so branch meshes remain opaque from below and above.
    const start = vertex(a, [0.35, 0.25, 0.15]), end = vertex(b, [0.35, 0.25, 0.15]);
    for (let i = 0; i < sides; i++) {
      const next = (i + 1) % sides;
      indices.push(start, first + next, first + i, end, first + rings * sides + i, first + rings * sides + next);
    }
    branchCount++;
  };
  const leaf = (origin, direction, length, width) => {
    const [axis, side, normal] = frame(direction);
    const roll = random() * Math.PI * 2;
    const lateral = side.clone().multiplyScalar(Math.cos(roll)).addScaledVector(normal, Math.sin(roll));
    const fold = new THREE.Vector3().crossVectors(axis, lateral);
    const shade = 0.62 + random() * 0.34;
    const color = [shade * 0.88, shade, shade * 0.71];
    const base = vertex(origin, color);
    const left = vertex(origin.clone().addScaledVector(axis, length * 0.42).addScaledVector(lateral, width), color);
    const ridge = vertex(origin.clone().addScaledVector(axis, length * 0.48).addScaledVector(fold, width * 0.38), color);
    const right = vertex(origin.clone().addScaledVector(axis, length * 0.42).addScaledVector(lateral, -width), color);
    const tip = vertex(origin.clone().addScaledVector(axis, length).addScaledVector(fold, -width * 0.15), color);
    indices.push(base, left, ridge, base, ridge, right, left, tip, ridge, ridge, tip, right);
    leafCount++;
  };
  branch(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0.01, conifer ? 0.49 : 0.28, 0), 0.025);
  const levels = distant ? 4 : conifer ? 7 + tier * 2 : 4 + tier;
  for (let level = 0; level < levels; level++) {
    const t = level / (levels - 1);
      const branches = distant ? 5 : conifer ? 7 : 6;
    for (let arm = 0; arm < branches; arm++) {
      const angle = arm / branches * Math.PI * 2 + level * 2.399 + random() * 0.4;
      const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const lateral = new THREE.Vector3(-radial.z, 0, radial.x);
      const length = conifer ? (0.44 * (1 - t) + 0.025) : (0.36 * Math.sin((0.2 + t * 0.65) * Math.PI));
      const root = new THREE.Vector3(0, conifer ? -0.42 + t * 0.87 : -0.37 + t * 0.5, 0);
      const tip = root.clone().addScaledVector(radial, length).addScaledVector(up, conifer ? -0.035 : 0.15 + random() * 0.12);
      branch(root, tip, (conifer ? 0.011 : 0.017) * (1 - t * 0.55));
      if (distant) {
        for (let j = 0; j < 5; j++) {
          const origin = root.clone().lerp(tip, (j + 1) / 6);
          leaf(origin, radial.clone().addScaledVector(up, 0.6), 0.18, conifer ? 0.07 * (1 - t * 0.7) : 0.095);
        }
        continue;
      }
      const twigs = 5 + tier * 2;
      for (let twig = 1; twig <= twigs; twig++) {
        const s = twig / (twigs + 1);
        for (const sign of [-1, 1]) {
          const start = root.clone().lerp(tip, s);
          const reach = (conifer ? 0.13 : 0.15) * (1 - s * 0.55) * (1 - t * 0.5);
          const end = start.clone().addScaledVector(lateral, sign * reach).addScaledVector(radial, reach * 0.4).addScaledVector(up, conifer ? 0.01 : 0.06);
          branch(start, end, conifer ? 0.0025 : 0.0038);
          const foliageCount = conifer ? 6 + tier * 3 : 4 + tier * 2;
          for (let j = 0; j < foliageCount; j++) {
            const u = (j + 0.5) / foliageCount;
            const origin = start.clone().lerp(end, u);
            const direction = lateral.clone().multiplyScalar(sign * (0.3 + random())).addScaledVector(radial, random() - 0.3).addScaledVector(up, 0.2 + random() * 0.7);
            leaf(origin, direction, conifer ? 0.035 + random() * 0.025 : 0.055 + random() * 0.045, conifer ? 0.008 : 0.022);
          }
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.userData.foliage = { branchCount, leafCount, representation: "procedural-branches-and-folded-leaves", scientificState: false };
  return geometry;
}
