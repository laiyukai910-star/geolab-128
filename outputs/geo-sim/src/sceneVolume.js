import * as THREE from "three";
import { createGeologyMaterial } from "./geologyMaterial.js";
import { createCaveDisplay, disposeCaveDisplay } from "./caveGeometry.js";
import { createHabitatAssemblies, sessileHabitatSites } from "./habitatAssemblies.js";
import { buildTerrainVolume, volumeDisplayConfig, sampleTerrainHeight, underwaterFocus, constrainTerrainCamera } from "./terrainVolume.js";

function createSky() {
  const material = new THREE.ShaderMaterial({
    depthWrite: false, depthTest: false,
    uniforms: { time: { value: 0 }, skyProjectionInverse: { value: new THREE.Matrix4() }, skyRotation: { value: new THREE.Matrix3() } },
    vertexShader: `varying vec2 skyNdc;
      void main() { skyNdc = position.xy; gl_Position = vec4(position.xy, 0.999999, 1.0); }`,
    fragmentShader: `varying vec2 skyNdc; uniform float time;
      uniform mat4 skyProjectionInverse; uniform mat3 skyRotation;
      float hash(vec2 p) { vec3 q=fract(vec3(p.xyx)*0.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
      float noise(vec2 p) { vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.0),f.x),f.y); }
      float filteredNoise(vec2 p, float footprint) {
        float fade=1.0-smoothstep(0.25,1.0,footprint);
        return mix(0.5,noise(p),fade);
      }
      void main() {
        vec3 viewRay=(skyProjectionInverse*vec4(skyNdc,1.0,1.0)).xyz;
        vec3 ray=normalize(skyRotation*viewRay);
        vec3 sky=mix(vec3(0.57,0.73,0.80),vec3(0.035,0.16,0.32),pow(max(ray.y,0.0),0.45));
        vec3 sun=normalize(vec3(-0.5,0.72,0.42));
        float alignment=max(dot(ray,sun),0.0);
        sky+=vec3(1.0,0.84,0.54)*(pow(alignment,700.0)*1.5+pow(alignment,16.0)*0.12);
        vec2 p=ray.xz/max(ray.y+0.2,0.15)*2.5+vec2(time*0.006,0.0);
        float footprint=max(length(dFdx(p)),length(dFdy(p)));
        float cloud=filteredNoise(p,footprint)*0.55+filteredNoise(p*2.1,footprint*2.1)*0.28+filteredNoise(p*4.3,footprint*4.3)*0.17;
        float cover=smoothstep(0.55,0.74,cloud)*smoothstep(0.0,0.22,ray.y);
        sky=mix(sky,vec3(0.87,0.90,0.89),cover*0.82);
        sky=mix(vec3(0.27,0.34,0.38),sky,smoothstep(-0.22,0.02,ray.y));
        gl_FragColor=vec4(sky,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  // Reconstruct world rays without translating a distant shell or writing scene depth.
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([-1,-1,0, 3,-1,0, -1,3,0], 3));
  const sky = new THREE.Mesh(geometry, material);
  sky.name = "atmosphere display";
  sky.frustumCulled = false;
  sky.renderOrder = -10000;
  sky.onBeforeRender = (_renderer, _scene, camera) => {
    material.uniforms.skyProjectionInverse.value.copy(camera.projectionMatrixInverse);
    material.uniforms.skyRotation.value.setFromMatrix4(camera.matrixWorld);
  };
  return sky;
}

function createWaterMaterial(config) {
  const uniforms = { waterLevel: { value: config.seaLevel * config.verticalScale / 1000 },
    waterVerticalScale: { value: config.verticalScale }, waterTime: { value: 0 } };
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0, roughness: 0.24,
    transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
  material.forceSinglePass = true;
  material.userData.waterUniforms = uniforms;
  material.customProgramCacheKey = () => "geolab-water-volume-v1";
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    const shared = `uniform float waterLevel; uniform float waterVerticalScale; uniform float waterTime;
      varying float waterDepthM; varying vec3 waterWorld;`;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${shared}`)
      .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>\nobjectNormal = vec3(0.0,1.0,0.0);`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        waterDepthM=(waterLevel-position.y)*1000.0/waterVerticalScale;
        transformed.y=waterLevel;
        waterWorld=(modelMatrix*vec4(transformed,1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${shared}`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        if(waterDepthM<=0.0) discard;
        float attenuation=1.0-exp(-waterDepthM/18.0);
        diffuseColor.rgb=mix(vec3(0.10,0.42,0.43),vec3(0.015,0.12,0.20),attenuation);
        float foam=(1.0-smoothstep(0.05,1.6,waterDepthM))*0.20;
        diffuseColor.rgb+=foam;
        diffuseColor.a=mix(0.20,0.88,attenuation)*smoothstep(0.0,0.25,waterDepthM);`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        vec2 p=waterWorld.xz*1000.0;
        float footprint=max(length(dFdx(p)),length(dFdy(p)));
        float farFade=1.0-smoothstep(3.0,18.0,footprint);
        float fineFade=1.0-smoothstep(0.8,5.5,footprint);
        float wave=sin(dot(p,vec2(0.34,0.08))-waterTime*1.2)*0.12*farFade;
        float ripple=sin(dot(p,vec2(-0.4,1.05))+waterTime*1.6)*0.045*fineFade;
        vec3 waterNormal=normalize(vec3(wave+ripple,1.0,wave*0.4-ripple));
        normal=normalize(mat3(viewMatrix)*waterNormal)*(gl_FrontFacing?1.0:-1.0);`);
  };
  return material;
}

export class SceneVolume {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = "closed terrain and water volume";
    this.sky = createSky();
    scene.add(this.group, this.sky);
    this.plane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
    this.clippingPlanes = [this.plane];
    this.waterMeshes = [];
    this.stats = {};
  }

  clear() {
    disposeCaveDisplay(this.caveDisplay);this.caveDisplay=null;
    disposeCaveDisplay(this.habitatDisplay);this.habitatDisplay=null;
    this.habitatFocus=null;
    for (const mesh of [...this.group.children]) {
      // Water surfaces borrow the exact terrain geometry and must never dispose it.
      if (!mesh.userData.borrowedTerrainGeometry) mesh.geometry.dispose();
      mesh.material.dispose();
      this.group.remove(mesh);
    }
    this.waterMeshes = [];
  }

  rebuild(model, params, terrainTiles, viewMode) {
    this.clear();
    this.model = model;
    this.params = params;
    this.config = volumeDisplayConfig(model, params);
    const volume = buildTerrainVolume(model, this.config);
    this.baseY = volume.baseY;
    this.plane.constant = this.config.cutX;
    const solid = new THREE.Mesh(volume.solid, createGeologyMaterial(this.config.cave));
    solid.name = "modeled columns and unclassified closure";
    this.group.add(solid);
    const sides = new THREE.Mesh(volume.waterSides, new THREE.MeshStandardMaterial({ vertexColors: true,
      transparent: true, opacity: 0.65, depthWrite: false, roughness: 0.28, metalness: 0, side: THREE.DoubleSide }));
    sides.name = "water column boundary";
    this.group.add(sides);
    this.waterSides = sides;
    for (const tile of terrainTiles) {
      if (tile.mesh.geometry.boundingBox?.min.y >= this.config.seaLevel * this.config.verticalScale / 1000) continue;
      const water = new THREE.Mesh(tile.mesh.geometry, createWaterMaterial(this.config));
      water.position.copy(tile.mesh.position);
      water.userData.borrowedTerrainGeometry = true;
      water.name = "sea surface";
      water.frustumCulled = false;
      water.renderOrder = 2;
      water.material.clippingPlanes = this.config.mode === "section" ? this.clippingPlanes : null;
      this.group.add(water);
      this.waterMeshes.push(water);
    }
    this.focus = underwaterFocus(model, this.config);
    const edgeDistance=site=>Math.min(site.index%model.n,model.n-1-site.index%model.n,Math.floor(site.index/model.n),model.n-1-Math.floor(site.index/model.n));
    const habitat=sessileHabitatSites(model).map(row=>row.site).sort((a,b)=>edgeDistance(b)-edgeDistance(a))[0];
    if(habitat){
      const x=(habitat.index%model.n)/(model.n-1)*model.sizeKm-model.sizeKm/2;
      const z=Math.floor(habitat.index/model.n)/(model.n-1)*model.sizeKm-model.sizeKm/2;
      this.focus={x,z,y:habitat.bedM*this.config.verticalScale/1000,depthKm:habitat.depthM*this.config.verticalScale/1000,habitat:true};
    }
    this.stats = { mode: this.config.mode, boundarySamples: volume.boundarySamples,
      modeledLayerCount: volume.modeledLayerCount, modeledDepthM: this.config.depthM,
      undergroundDisplayExaggeration: this.config.depthScale, baseYKm: volume.baseY,
      sectionColumn: this.config.cutIndex, cutXKm: this.config.cutX, seaSurfaceTiles: this.waterMeshes.length,
      underwaterAvailable: Boolean(this.focus), underwater: false,
      closure: "unclassified below modeled columns", waterModel: "sea-level surface and optical display; not a 3D fluid solver" };
    this.setVisibility(params, viewMode);
    if(this.config.cave){this.caveDisplay=createCaveDisplay(this.config.cave,this.clippingPlanes);this.scene.add(this.caveDisplay);this.stats.cave=this.caveDisplay.userData.cave;}
    this.stats.sessileLife={count:0,deferred:true};
    this.stats.stratumColors="continuous display reconstruction; categorical scientific columns unchanged";
    globalThis.__geoLabVolumeStats = this.stats;
  }

  setVisibility(params, viewMode) {
    this.params = params;
    this.waterVisible = params.water3DEnabled !== false && viewMode === "landscape";
    for (const mesh of this.waterMeshes) mesh.visible = this.waterVisible;
    if (this.waterSides) this.waterSides.visible = this.waterVisible;
    if(this.habitatDisplay)this.habitatDisplay.visible=this.waterVisible&&this.stats.underwater;
  }

  applyClipping(groups) {
    const planes = this.config?.mode === "section" ? this.clippingPlanes : null;
    for (const group of groups) group?.traverse(object => {
      const materials = object.material ? Array.isArray(object.material) ? object.material : [object.material] : [];
      for (const material of materials) {
        if (material.clippingPlanes !== planes) { material.clippingPlanes = planes; material.needsUpdate = true; }
      }
    });
  }

  update(camera, seconds, orbitTarget = null) {
    if (!this.model) return;
    this.stats.cameraConstrained = this.group.visible && constrainTerrainCamera(this.model, this.config, this.baseY, camera, orbitTarget);
    const { verticalScale, seaLevel, sizeKm, cutX, mode } = this.config;
    const h = sampleTerrainHeight(this.model, camera.position.x, camera.position.z);
    const submerged = this.waterVisible && h !== null && (mode !== "section" || camera.position.x <= cutX)
      && camera.position.y < seaLevel * verticalScale / 1000 && camera.position.y > h * verticalScale / 1000;
    // Build meter-scale organisms only around an immersed camera, never for a regional overview.
    if(submerged&&(!this.habitatFocus||Math.hypot(camera.position.x-this.habitatFocus.x,camera.position.z-this.habitatFocus.z)>Math.max(0.25,sizeKm/(this.model.n-1))*0.5)){
      disposeCaveDisplay(this.habitatDisplay);
      this.habitatFocus={x:camera.position.x,z:camera.position.z};
      this.habitatDisplay=createHabitatAssemblies(this.model,this.params,mode==="section"?this.clippingPlanes:null,this.habitatFocus);
      this.scene.add(this.habitatDisplay);this.stats.sessileLife=this.habitatDisplay.userData.habitat;
    }
    if(this.habitatDisplay)this.habitatDisplay.visible=submerged;
    this.sky.visible = this.params.sky3DEnabled !== false && !submerged;
    this.sky.material.uniforms.time.value = seconds;
    for (const water of this.waterMeshes) water.material.userData.waterUniforms.waterTime.value = seconds;
    for(const mesh of this.habitatDisplay?.children||[])mesh.material.userData.organismTime.value=seconds;
    for(const mesh of this.caveDisplay?.children||[])if(mesh.material?.userData.organismTime)mesh.material.userData.organismTime.value=seconds;
    if (!this.scene.fog) this.scene.fog = new THREE.FogExp2();
    this.scene.fog.color.set(submerged ? 0x19566a : this.sky.visible ? 0xacc4ce : 0x081210);
    this.scene.fog.density = submerged ? 1 / Math.max(0.01, (seaLevel - h) * verticalScale / 1000 * 3) : 0.035 / sizeKm;
    if (!this.scene.background?.isColor) this.scene.background = new THREE.Color();
    this.scene.background.set(submerged ? 0x19566a : this.sky.visible ? 0xacc4ce : 0x081210);
    this.stats.underwater = submerged;
  }

  dispose() {
    this.clear();
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.scene.remove(this.group, this.sky);
  }
}
