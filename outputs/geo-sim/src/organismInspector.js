import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createOrganismGeometry, createOrganismMaterial } from "./organismGeometry.js";

export class OrganismInspector {
  constructor(renderer) {
    this.renderer=renderer;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0xc7cfd0);
    this.scene.add(new THREE.HemisphereLight(0xf0f8ff,0x67615a,1.2));
    const key=new THREE.DirectionalLight(0xffebd0,2.4);key.position.set(3,4,5);key.castShadow=true;
    key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-2;key.shadow.camera.right=2;key.shadow.camera.top=2;key.shadow.camera.bottom=-2;key.shadow.bias=-0.0002;
    key.shadow.normalBias=0.008;
    this.scene.add(key);
    const rim=new THREE.DirectionalLight(0xc5e6f0,1.4);rim.position.set(-3,2,-2);this.scene.add(rim);
    this.camera=new THREE.PerspectiveCamera(40,1,0.01,50);
    this.controls=new OrbitControls(this.camera,renderer.domElement);
    this.controls.enableDamping=true;this.controls.minDistance=0.3;this.controls.maxDistance=12;
    this.controls.enabled=false;this.active=false;
  }
  show(kind) {
    this.setMesh(new THREE.Mesh(createOrganismGeometry(kind,"exhaustive"),createOrganismMaterial(kind)));
    globalThis.__geoLabSpecimenStats={kind,triangles:this.mesh.geometry.index.count/3,...this.mesh.geometry.userData.anatomy};
  }
  showReference(asset) {
    const material=asset.material.clone();material.clippingPlanes=null;
    this.setMesh(new THREE.Mesh(asset.geometry.clone(),material));
    globalThis.__geoLabSpecimenStats={kind:"rock-09-reference",triangles:this.mesh.geometry.index.count/3,source:asset.source,license:"CC0-1.0"};
  }
  setMesh(mesh) {
    this.mesh?.geometry.dispose();this.mesh?.material.dispose();if(this.mesh)this.scene.remove(this.mesh);
    this.mesh=mesh;
    this.mesh.castShadow=true;this.mesh.receiveShadow=true;
    this.scene.add(this.mesh);this.active=true;this.controls.enabled=true;
    const box=this.mesh.geometry.boundingBox,center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
    this.controls.target.copy(center);
    const aspect=this.renderer.domElement.clientWidth/Math.max(1,this.renderer.domElement.clientHeight);
    const distance=Math.max(size.x/Math.min(1,aspect),size.y,size.z)*1.75;
    this.camera.position.copy(center).add(new THREE.Vector3(0.5,0.35,1).normalize().multiplyScalar(distance));
    this.controls.update();
  }
  hide(){this.active=false;this.controls.enabled=false;}
  render(time){
    this.camera.aspect=this.renderer.domElement.clientWidth/Math.max(1,this.renderer.domElement.clientHeight);
    this.camera.updateProjectionMatrix();this.controls.update();if(this.mesh.material.userData.organismTime)this.mesh.material.userData.organismTime.value=time;
    const shadows=this.renderer.shadowMap.enabled;this.renderer.shadowMap.enabled=true;
    this.renderer.render(this.scene,this.camera);this.renderer.shadowMap.enabled=shadows;
  }
  dispose(){
    this.hide();this.mesh?.geometry.dispose();this.mesh?.material.dispose();this.controls.dispose();
    this.scene.traverse(object=>object.shadow?.dispose());this.scene.clear();this.mesh=null;
  }
}
