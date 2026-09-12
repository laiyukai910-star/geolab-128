import * as THREE from "three";
import { FoliageInstances } from "./foliageInstances.js";

export function referenceRockMatrix(source, bounds) {
  const scale=Math.min(source.sx,source.sz);
  const position=new THREE.Vector3(source.x,source.y,source.z);
  const rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),source.ry||0);
  if(Number.isFinite(source.surfaceY)) {
    const normal=new THREE.Vector3(...(source.surfaceNormal||[0,1,0])).normalize();
    if(!Number.isFinite(normal.lengthSq()) || normal.y<=0)normal.set(0,1,0);
    rotation.premultiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),normal));
    // Embed 12% of the scanned thickness in the local surface plane.
    const lift=(-bounds.min.y-(bounds.max.y-bounds.min.y)*0.12)*scale;
    position.set(source.x,source.surfaceY,source.z).addScaledVector(normal,lift);
  }
  return new THREE.Matrix4().compose(position,rotation,new THREE.Vector3().setScalar(scale));
}

// The reference asset is loaded only when an outcrop is large enough to inspect.
export class ScannedRockInstances extends FoliageInstances {
  constructor(geometry, material, transforms, color, library) {
    super(geometry,geometry,material,transforms,color,64,48);
    this.library=library;this.referenceReady=false;this.loadAttempted=false;this.referenceDisposed=false;
    this.fallbackMaterial=material;
    this.userData.referenceLod={status:"placeholder",source:"Poly Haven Rock 09"};
  }
  update(camera) {
    super.update(camera);
    if(!this.near.count || this.loadAttempted || this.referenceDisposed)return;
    this.loadAttempted=true;this.userData.referenceLod.status="loading";
    this.library.loadRock().then(asset=>{
      if(this.referenceDisposed)return;
      asset.material.clippingPlanes=this.fallbackMaterial.clippingPlanes;
      asset.material.needsUpdate=true;
      this.near.geometry=asset.geometry;this.near.material=asset.material;
      this.far.geometry=asset.distantGeometry;this.far.material=asset.material;
      const bounds=new THREE.Sphere();bounds.makeEmpty();
      const localBounds=asset.geometry.boundingSphere.clone().union(asset.distantGeometry.boundingSphere);
      this.sources.forEach((source,index)=>{
        const matrix=referenceRockMatrix(source,asset.geometry.boundingBox);
        matrix.toArray(this.matrices,index*16);
        bounds.union(localBounds.clone().applyMatrix4(matrix));
      });
      this.near.boundingSphere=bounds;this.far.boundingSphere=bounds.clone();
      this.colors.fill(1);
      this.referenceReady=true;this.previousView="";this.userData.referenceLod.status="ready";
    }).catch(()=>{if(!this.referenceDisposed)this.userData.referenceLod.status="fallback"});
  }
  disposeReference(){this.referenceDisposed=true;return this.fallbackMaterial;}
}
