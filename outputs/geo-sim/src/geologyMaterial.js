import * as THREE from "three";
import { caveFieldGLSL } from "./caveField.js";

export function createGeologyMaterial(cave=null,inspectionFill=0.8) {
  const material = new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.9, metalness:0});
  material.userData.inspectionFill = inspectionFill;
  material.customProgramCacheKey = () => `geolab-continuous-strata-v2:${inspectionFill}:${JSON.stringify(cave)}`;
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
      attribute float stratumDepth; varying vec3 rockCoord; varying vec3 rockPosition;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        rockPosition = position; rockCoord = vec3(position.x*1000.0,-stratumDepth,position.z*1000.0);`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
      varying vec3 rockCoord; varying vec3 rockPosition;
      ${cave?caveFieldGLSL(cave):""}
      float rockHash(vec3 p){p=fract(p*0.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
      float rockNoise(vec3 p){vec3 a=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(mix(rockHash(a),rockHash(a+vec3(1,0,0)),f.x),mix(rockHash(a+vec3(0,1,0)),rockHash(a+vec3(1,1,0)),f.x),f.y),
          mix(mix(rockHash(a+vec3(0,0,1)),rockHash(a+vec3(1,0,1)),f.x),mix(rockHash(a+vec3(0,1,1)),rockHash(a+1.0),f.x),f.y),f.z);}
      float rockDetail(vec3 p,float scale,float footprint){float fade=1.0-smoothstep(scale*0.2,scale,footprint);return mix(0.5,rockNoise(p/scale),fade);}
      vec3 rockNormal(vec3 n,float h){vec3 dx=dFdx(-vViewPosition)*1000.0,dy=dFdy(-vViewPosition)*1000.0;
        vec3 rx=cross(dy,n),ry=cross(n,dx);float det=dot(dx,rx);
        if(abs(det)<1e-12)return n;
        return normalize(abs(det)*n-sign(det)*(dFdx(h)*rx+dFdy(h)*ry));}
      `)
      .replace("#include <color_fragment>", `#include <color_fragment>
        ${cave?"if(caveVoid(rockPosition)<0.0)discard;":""}
        float footprint=max(length(dFdx(rockCoord)),length(dFdy(rockCoord)));
        float weather=rockDetail(rockCoord,90.0,footprint);
        float mineral=rockDetail(rockCoord,0.34,footprint);
        float grain=rockDetail(rockCoord,0.07,footprint);
        vec3 beddingCoord=rockCoord*vec3(0.018,0.85,0.018);
        beddingCoord.y+=(weather-0.5)*1.4;
        float bedding=rockDetail(beddingCoord,1.0,footprint*0.85);
        float micrograin=rockDetail(rockCoord,0.009,footprint);
        float seamPhase=rockCoord.y*4.0+rockDetail(rockCoord,3.5,footprint)*0.7;
        float lamina=(0.5+0.5*sin(seamPhase))*(1.0-smoothstep(0.08,0.5,footprint));
        float rockHeight=mineral*0.005+grain*0.001+micrograin*0.0003+lamina*0.003;
        diffuseColor.rgb *= 0.72+weather*0.32+bedding*0.12+(grain-0.5)*0.14;
        diffuseColor.rgb*=0.98+lamina*0.045+(micrograin-0.5)*0.10;
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.08,0.99,0.87),smoothstep(0.58,0.8,weather)*0.32);
      `)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        roughnessFactor=clamp(0.84+(grain-0.5)*0.16,0.64,0.97);`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        normal=rockNormal(normal,rockHeight);`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        totalEmissiveRadiance+=diffuseColor.rgb*${inspectionFill.toFixed(4)};`);
  };
  return material;
}
