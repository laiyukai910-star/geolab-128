export const ROCK_SCAN_URL = new URL("../assets/scanned/rock-09-detail.glb", import.meta.url).href;
export const ROCK_SCAN_DISTANT_URL = new URL("../assets/scanned/rock-09-distant.glb", import.meta.url).href;

export function disposeScannedAsset(asset) {
  if (!asset) return;
  const textures = new Set();
  for (const value of Object.values(asset.material)) if (value?.isTexture) textures.add(value);
  for (const texture of textures) { texture.dispose(); texture.source?.data?.close?.(); }
  asset.material.dispose(); asset.geometry.dispose();asset.distantGeometry?.dispose();
}

export class ScannedAssetLibrary {
  constructor(loader = null) {
    this.loader = loader; this.pending = null; this.asset = null; this.disposed = false;
    this.stats = {status:"idle",source:"Poly Haven Rock 09",license:"CC0-1.0"};
  }
  async loadRock() {
    if (this.disposed) throw new Error("Asset library is disposed");
    if (this.asset) return this.asset;
    if (this.pending) return this.pending;
    this.stats.status = "loading";
    this.pending = this.load().then(asset => {
      if (this.disposed) { disposeScannedAsset(asset); throw new Error("Asset library was disposed during load"); }
      this.asset = asset; Object.assign(this.stats,{status:"ready",triangles:asset.geometry.index.count/3}); return asset;
    }).catch(error => { this.stats.status = this.disposed ? "disposed" : "failed"; this.pending = null; throw error; });
    return this.pending;
  }
  async load() {
    const load = this.loader || (async url => {
      const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
      return new GLTFLoader().loadAsync(url);
    });
    const gltf = await load(ROCK_SCAN_URL);
    const meshes = []; gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(object=>{if(object.isMesh)meshes.push(object)});
    if(meshes.length!==1 || Array.isArray(meshes[0].material)) {
      for(const mesh of meshes){for(const material of [].concat(mesh.material))disposeScannedAsset({geometry:mesh.geometry,material});}
      throw new Error("Invalid rock asset contract");
    }
    const mesh=meshes[0],geometry=mesh.geometry,material=mesh.material;
    geometry.applyMatrix4(mesh.matrixWorld); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    if(!geometry.index || !geometry.attributes.uv || !material.map || !material.normalMap) {
      disposeScannedAsset({geometry,material});throw new Error("Missing reference geometry or PBR maps");
    }
    geometry.userData.sharedGeometryCacheOwned = true;
    material.userData.scannedLibraryOwned = true;
    material.vertexColors = false; material.color.set(0xffffff);
    for (const key of ["map","normalMap","roughnessMap","metalnessMap","aoMap"]) if(material[key]) material[key].anisotropy=8;
    try {
      const distant=await load(ROCK_SCAN_DISTANT_URL);distant.scene.updateMatrixWorld(true);
      const distantMeshes=[];
      distant.scene.traverse(object=>{if(object.isMesh)distantMeshes.push(object)});
      if(distantMeshes.length!==1 || !distantMeshes[0].geometry.index) {
        for(const object of distantMeshes) {
          for(const distantMaterial of [].concat(object.material)) disposeScannedAsset({geometry:object.geometry,material:distantMaterial});
        }
        throw new Error("Invalid distant reference mesh");
      }
      const distantMesh=distantMeshes[0],distantGeometry=distantMesh.geometry;
      distantGeometry.applyMatrix4(distantMesh.matrixWorld);
      for(const distantMaterial of [].concat(distantMesh.material))distantMaterial.dispose();
      distantGeometry.computeBoundingSphere();distantGeometry.userData.sharedGeometryCacheOwned=true;
      return {geometry,distantGeometry,material,source:"https://polyhaven.com/a/rock_09"};
    } catch(error){disposeScannedAsset({geometry,material});throw error;}
  }
  dispose() {
    this.disposed = true; this.stats.status = "disposed";
    disposeScannedAsset(this.asset); this.asset = null;
  }
}
