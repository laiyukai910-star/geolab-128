import * as THREE from "three";

export const SKY_VERTEX_SHADER = `varying vec2 skyNdc;
  void main() { skyNdc = position.xy; gl_Position = vec4(position.xy, 0.999999, 1.0); }`;

// The cloud field is anchored to view directions, then folded from a dome into a bounded ring
// around the horizon. Every step keeps the local rate of change finite, so no pixel straddles an
// unbounded gradient and the pattern stays put while the camera turns. Detail is filtered by an
// analytic footprint rather than by screen derivatives of the pattern itself.
export const SKY_CLOUD_LIBRARY = `float hash(vec2 p) { vec3 q=fract(vec3(p.xyx)*0.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
  float noise(vec2 p) { vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.0),f.x),f.y); }
  // Cloud coordinates for one view direction. The source term is floored so rays below the
  // horizon wrap into the same continuous ring instead of running off to infinity. The ring map is
  // r/(1+0.3r): linear to first order, monotone and never stretching, with a slope of
  // 1/(1+0.3r)^2 that runs from 1 down towards 0, and an extent bounded at 1/0.3. The far field
  // therefore stays finite without squeezing the horizon into unbroken radial streaks.
  void skyField(vec3 ray, float drift, out vec2 outCloud, out vec2 outDome, out float outDomeLength, out float outExtent, out float outSlope) {
    float source=clamp(ray.y+0.22,0.06,2.0);
    outDome=ray.xz/source+vec2(drift,0.0);
    outDomeLength=max(length(outDome),0.0001);
    float radius=min(outDomeLength,12.0);
    float squeeze=1.0+0.3*radius;
    outExtent=radius/squeeze;
    outSlope=1.0/(squeeze*squeeze);
    outCloud=outDome/outDomeLength*outExtent;
  }
  // Fade each octave once one screen pixel spans more than its feature size, which is where the
  // renderer can no longer resolve it. The footprint is analytic, so the fade is continuous across
  // the frame and stable from one frame to the next.
  float skyOctaveWeight(float footprint, float scale) {
    return 1.0-smoothstep(0.5,1.8,footprint*scale);
  }`;

export const SKY_FRAGMENT_SHADER = `varying vec2 skyNdc; uniform float time;
  uniform mat4 skyProjectionInverse; uniform mat3 skyRotation;
  ${SKY_CLOUD_LIBRARY}
  void main() {
    vec3 viewRay=(skyProjectionInverse*vec4(skyNdc,1.0,1.0)).xyz;
    vec3 ray=normalize(skyRotation*viewRay);
    vec3 sky=mix(vec3(0.57,0.73,0.80),vec3(0.035,0.16,0.32),pow(max(ray.y,0.0),0.45));
    vec3 sun=normalize(vec3(-0.5,0.72,0.42));
    float alignment=max(dot(ray,sun),0.0);
    sky+=vec3(1.0,0.84,0.54)*(pow(alignment,700.0)*1.5+pow(alignment,16.0)*0.12);
    vec2 cloudPoint, dome; float domeLength, extent, slope;
    skyField(ray,time*0.004,cloudPoint,dome,domeLength,extent,slope);
    // d(dome)/d(ray) = (direction - ray.y*dome)/source is the dome's screen-space rate, confined to
    // the unit sphere. It stays finite along the horizon, unlike the projected ray it replaced.
    mat2 rayJacobian=mat2(dFdx(ray.x),dFdx(ray.z),dFdy(ray.x),dFdy(ray.z));
    vec2 direction=vec2(ray.x,ray.z), domeDirection=dome/domeLength;
    vec2 domeSpread=rayJacobian*(direction-ray.y*dome)/clamp(ray.y+0.22,0.06,2.0);
    // The fold scales the angular part by the ring extent and the radial part by its slope.
    vec2 radialPart=dot(domeSpread,domeDirection)*domeDirection;
    float footprint=extent/domeLength*length(domeSpread-radialPart)+slope*length(radialPart);
    float coverage=noise(cloudPoint)*0.54*skyOctaveWeight(footprint,1.0)
      +noise(cloudPoint*2.13+vec2(19.3,7.7))*0.29*skyOctaveWeight(footprint,2.13)
      +noise(cloudPoint*4.31+vec2(3.1,27.4))*0.17*skyOctaveWeight(footprint,4.31);
    float cover=smoothstep(0.48,0.66,coverage)*smoothstep(0.0,0.22,ray.y);
    sky=mix(sky,vec3(0.87,0.90,0.89),cover*0.82);
    sky=mix(vec3(0.27,0.34,0.38),sky,smoothstep(-0.22,0.02,ray.y));
    gl_FragColor=vec4(sky,1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export function createSkyMaterial() {
  return new THREE.ShaderMaterial({
    depthWrite: false, depthTest: false,
    uniforms: { time: { value: 0 }, skyProjectionInverse: { value: new THREE.Matrix4() }, skyRotation: { value: new THREE.Matrix3() } },
    vertexShader: SKY_VERTEX_SHADER,
    fragmentShader: SKY_FRAGMENT_SHADER
  });
}

export function createSky() {
  const material = createSkyMaterial();
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
