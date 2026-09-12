import * as THREE from "three";
import { FoliageInstances } from "./foliageInstances.js";

// The reference asset is loaded only when an outcrop is large enough to inspect.
export class ScannedRockInstances extends FoliageInstances {
  constructor(geometry, material, transforms, color, library) {
    super(geometry,geometry,material,transforms,color,64,48);
    this.library=library;this.referenceReady=false;this.loadAttempted=false;this.referenceDisposed=false;
    this.fallbackMaterial=material;
    this.userData.referenceLod={status:"placeholder",source:"Poly Haven Rock 09"};
  }
  update(camera) {
    const previous=this.previousView;
    super.update(camera);
    if(this.referenceReady && previous!==this.previousView){
      const matrix=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();
      for(const mesh of [this.near,this.far]){
        for(let i=0;i<mesh.count;i++){
          mesh.getMatrixAt(i,matrix);matrix.decompose(p,q,s);s.setScalar(Math.min(s.x,s.z));
          mesh.setMatrixAt(i,matrix.compose(p,q,s));
        }
        mesh.instanceMatrix.needsUpdate=true;
        mesh.instanceColor.array.fill(1);mesh.instanceColor.needsUpdate=true;
      }
    }
    if(!this.near.count || this.loadAttempted || this.referenceDisposed)return;
    this.loadAttempted=true;this.userData.referenceLod.status="loading";
    this.library.loadRock().then(asset=>{
      if(this.referenceDisposed)return;
      asset.material.clippingPlanes=this.fallbackMaterial.clippingPlanes;
      asset.material.needsUpdate=true;
      this.near.geometry=asset.geometry;this.near.material=asset.material;
      this.far.geometry=asset.distantGeometry;this.far.material=asset.material;
      this.referenceReady=true;this.previousView="";this.userData.referenceLod.status="ready";
    }).catch(()=>{if(!this.referenceDisposed)this.userData.referenceLod.status="fallback"});
  }
  disposeReference(){this.referenceDisposed=true;return this.fallbackMaterial;}
}
