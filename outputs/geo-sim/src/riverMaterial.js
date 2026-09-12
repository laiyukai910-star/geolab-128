import * as THREE from "three";

export function createRiverMaterial() {
  const material = new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.24,metalness:0,
    transparent:true,opacity:0.86,depthWrite:false,side:THREE.DoubleSide});
  const uniforms = {riverTime:{value:0}};
  material.userData.riverUniforms = uniforms;
  material.userData.representation = "Directional surface animation driven by modeled mean velocity, not a fluid solver";
  material.customProgramCacheKey = () => "geolab-river-surface-v1";
  material.forceSinglePass = true;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms,uniforms);
    const varying = "varying vec3 riverPoint; varying vec3 riverState; varying vec2 riverFlow;";
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>",`#include <common>\n${varying}\nattribute vec3 riverData; attribute vec2 riverDirection;`)
      .replace("#include <begin_vertex>",`#include <begin_vertex>
        riverPoint=(modelMatrix*vec4(position,1.0)).xyz*1000.0;riverState=riverData;riverFlow=riverDirection;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>",`#include <common>\n${varying}\nuniform float riverTime;`)
      .replace("#include <color_fragment>",`#include <color_fragment>
        vec2 flowDirection=riverFlow/max(length(riverFlow),0.00001);
        vec2 crossDirection=vec2(-flowDirection.y,flowDirection.x);
        float footprint=max(length(dFdx(riverPoint.xz)),length(dFdy(riverPoint.xz)));
        float waveFade=1.0-smoothstep(0.08,0.7,footprint);
        float capillaryFade=1.0-smoothstep(0.008,0.06,footprint);
        float phase=dot(riverPoint.xz,flowDirection)*4.0-riverTime*riverState.z*4.0;
        float crossPhase=dot(riverPoint.xz,crossDirection)*31.0+sin(phase)*0.4;
        float wave=sin(phase)*waveFade;
        float depthShade=1.0-exp(-max(0.0,riverState.y)/2.5);
        float bankFade=1.0-smoothstep(0.78,1.0,abs(riverState.x));
        diffuseColor.rgb*=mix(1.1,0.78,depthShade)+wave*0.035;
        diffuseColor.a*=mix(0.48,1.0,depthShade)*bankFade;
      `)
      .replace("#include <normal_fragment_maps>",`#include <normal_fragment_maps>
        vec2 gradient=flowDirection*cos(phase)*waveFade*0.055+crossDirection*cos(crossPhase)*capillaryFade*0.025;
        vec3 rippleNormal=normalize(vec3(-gradient.x,1.0,-gradient.y));
        normal=normalize(mat3(viewMatrix)*rippleNormal)*(gl_FrontFacing?1.0:-1.0);
      `);
  };
  return material;
}
