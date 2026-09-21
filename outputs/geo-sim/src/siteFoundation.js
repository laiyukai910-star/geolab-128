import * as THREE from "three";
import { sampleTerrainHeight } from "./terrainVolume.js";

// A render-only foundation: level bearing surface over a sampled terrain skirt.
export function createSiteFoundation(model, transform, verticalScale) {
  if (![transform.x, transform.z, transform.sx, transform.sz, transform.ry, verticalScale].every(Number.isFinite) || transform.sx <= 0 || transform.sz <= 0 || verticalScale <= 0) return null;
  const points = [], segments = 4;
  const c = Math.cos(transform.ry), s = Math.sin(transform.ry);
  for (let z = 0; z <= segments; z++) for (let x = 0; x <= segments; x++) {
    const dx = (x / segments - 0.5) * transform.sx * 1.04;
    const dz = (z / segments - 0.5) * transform.sz * 1.04;
    const wx = transform.x + c * dx + s * dz, wz = transform.z - s * dx + c * dz;
    const height = sampleTerrainHeight(model, wx, wz);
    if (height === null || !Number.isFinite(height)) return null;
    points.push([wx, height * verticalScale / 1000, wz]);
  }
  const top = Math.max(...points.map(p => p[1])) + 0.00015;
  const positions = [], indices = [];
  for (const p of points) positions.push(p[0], top, p[2], p[0], p[1] - 0.0003, p[2]);
  const edge = (a,b) => indices.push(a*2,b*2,a*2+1,b*2,b*2+1,a*2+1);
  for (let z=0;z<segments;z++) for(let x=0;x<segments;x++) {
    const a=z*5+x,b=a+1,d=a+5,e=d+1;
    indices.push(a*2,d*2,b*2,b*2,d*2,e*2);
    indices.push(a*2+1,b*2+1,d*2+1,b*2+1,e*2+1,d*2+1);
  }
  for(let i=0;i<segments;i++) { edge(i,i+1);edge(20+i+1,20+i);edge((i+1)*5,i*5);edge(i*5+4,(i+1)*5+4); }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
  geometry.setIndex(indices);
  // Separate bearing-surface normals from retaining faces; averaging them rounds the platform visually.
  const surface = geometry.toNonIndexed();
  geometry.dispose();
  surface.computeVertexNormals();surface.computeBoundingSphere();
  surface.userData.siteFoundation={sampleCount:points.length,renderOnly:true};
  return {geometry:surface,top};
}
