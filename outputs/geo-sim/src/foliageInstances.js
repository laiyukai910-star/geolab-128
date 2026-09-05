import * as THREE from "three";

// THREE.LOD.update runs before child traversal, keeping both instance buffers in sync.
export class FoliageInstances extends THREE.LOD {
  constructor(geometry, distantGeometry, material, transforms, fallbackColor, maximumDetail = 128) {
    super();
    this.type = "GeoLabFoliageInstances";
    this.sources = transforms;
    this.capacity = Math.min(transforms.length, maximumDetail);
    this.near = new THREE.InstancedMesh(geometry, material, this.capacity);
    this.far = new THREE.InstancedMesh(distantGeometry, material, transforms.length);
    this.near.count = 0;
    this.far.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.near.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.add(this.far, this.near);
    this.matrices = new Float32Array(transforms.length * 16);
    this.colors = new Float32Array(transforms.length * 3);
    const object = new THREE.Object3D(), color = new THREE.Color();
    transforms.forEach((source, i) => {
      object.position.set(source.x, source.y, source.z);
      object.scale.set(source.sx, source.sy, source.sz);
      object.rotation.set(0, source.ry || 0, 0);
      object.updateMatrix();
      object.matrix.toArray(this.matrices, i * 16);
      color.setHex(source.color ?? fallbackColor).toArray(this.colors, i * 3);
      this.far.setMatrixAt(i, object.matrix);
      this.far.setColorAt(i, color);
    });
    if (this.capacity) this.near.setColorAt(0, color);
    this.far.computeBoundingSphere();
    this.near.boundingSphere = this.far.boundingSphere.clone();
    geometry.computeBoundingSphere();
    distantGeometry.computeBoundingSphere();
    const extraRadius = Math.max(0, geometry.boundingSphere.radius - distantGeometry.boundingSphere.radius);
    this.near.boundingSphere.radius += extraRadius * transforms.reduce((largest, source) => Math.max(largest, source.sx, source.sy, source.sz), 0);
    this.previousView = "";
    this.userData.foliageLod = { nearCount: 0, farCount: transforms.length, pixelThreshold: 16, maximumDetail: this.capacity };
  }

  update(camera) {
    const viewportHeight = globalThis.innerHeight || 900;
    const signature = [...camera.matrixWorld.elements, ...camera.projectionMatrix.elements, ...this.matrixWorld.elements, viewportHeight].join(",");
    if (signature === this.previousView) return;
    this.previousView = signature;
    const cameraPosition = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    const projection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(projection);
    const projectedScale = viewportHeight * camera.projectionMatrix.elements[5] * 0.5;
    const sphere = new THREE.Sphere(), candidates = [];
    const groupScale = this.matrixWorld.getMaxScaleOnAxis();
    this.sources.forEach((source, index) => {
      sphere.center.set(source.x, source.y, source.z).applyMatrix4(this.matrixWorld);
      sphere.radius = Math.max(source.sx, source.sy, source.sz) * groupScale * 0.8;
      const pixels = 2 * sphere.radius * projectedScale / (camera.isOrthographicCamera ? 1 : Math.max(camera.near, sphere.center.distanceTo(cameraPosition)));
      if (pixels >= 16 && frustum.intersectsSphere(sphere)) candidates.push({ index, pixels });
    });
    candidates.sort((a, b) => b.pixels - a.pixels || a.index - b.index);
    const near = new Set(candidates.slice(0, this.capacity).map(item => item.index));
    let nearCount = 0, farCount = 0;
    this.sources.forEach((_, index) => {
      const mesh = near.has(index) ? this.near : this.far;
      const slot = mesh === this.near ? nearCount++ : farCount++;
      mesh.instanceMatrix.array.set(this.matrices.subarray(index * 16, index * 16 + 16), slot * 16);
      mesh.instanceColor.array.set(this.colors.subarray(index * 3, index * 3 + 3), slot * 3);
    });
    this.near.count = nearCount;
    this.far.count = farCount;
    for (const mesh of [this.near, this.far]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    }
    Object.assign(this.userData.foliageLod, { nearCount, farCount });
  }
}
