import * as THREE from "three";
import { caveFieldGLSL } from "./caveField.js";

export function createGeologyMaterial(cave=null,inspectionFill=0.8,beddingSpacingM=1.571,profile=null) {
  const material = new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.9, metalness:0});
  material.userData.inspectionFill = inspectionFill;
  // Lamination is drawn at the package's own bedding scale rather than at a fixed period, so a
  // thinly interbedded sequence reads as laminae and a thick unit as massive beds. Derived from
  // the modelled layer thicknesses in terrainVolume.js; see geoLithology.js for the column profile.
  const seamFrequency = 2 * Math.PI / Math.max(0.05, Number(beddingSpacingM) || 1.571);
  material.userData.beddingSpacingM = Number(beddingSpacingM) || 1.571;
  material.userData.stratumProfile = profile;
  if (profile) material.addEventListener("dispose", () => profile.texture.dispose());
  material.customProgramCacheKey = () => `geolab-continuous-strata-v4:${inspectionFill}:${seamFrequency.toFixed(4)}:${profile?.layerCount || 0}:${JSON.stringify(cave)}`;
  material.onBeforeCompile = shader => {
    if (profile) {
      shader.uniforms.rockProfile = { value: profile.texture };
      shader.uniforms.rockProfileSize = { value: new THREE.Vector2(profile.width, profile.height) };
      shader.uniforms.rockUnknownColor = { value: new THREE.Color(...profile.unknownColor) };
    }
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
      attribute float stratumDepth; varying vec3 rockCoord; varying vec3 rockPosition;
      ${profile ? "attribute vec2 stratumUv; varying vec2 rockProfileUv;" : ""}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        rockPosition = position; rockCoord = vec3(position.x*1000.0,-stratumDepth,position.z*1000.0);
        ${profile ? "rockProfileUv = stratumUv;" : ""}`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
      varying vec3 rockCoord; varying vec3 rockPosition;
      ${profile ? `
      varying vec2 rockProfileUv;
      uniform sampler2D rockProfile;
      uniform vec2 rockProfileSize;
      uniform vec3 rockUnknownColor;
      vec4 rockProfileTexel(float column, float row) {
        return texture2D(rockProfile, vec2((clamp(column, 0.0, rockProfileSize.x-1.0)+0.5)/rockProfileSize.x,
          (row+0.5)/rockProfileSize.y));
      }
      vec4 rockContact(float layer) {
        float x = clamp(rockProfileUv.x,0.0,1.0)*(rockProfileSize.x-1.0);
        float i = floor(x), t = fract(x), s = 1.0-t;
        float row = rockProfileUv.y*${profile.layerCount.toFixed(1)}+layer;
        vec4 a=rockProfileTexel(i-1.0,row), b=rockProfileTexel(i,row);
        vec4 c=rockProfileTexel(i+1.0,row), d=rockProfileTexel(i+2.0,row);
        vec4 smoothValue=(a*s*s*s+b*(3.0*t*t*t-6.0*t*t+4.0)+c*(-3.0*t*t*t+3.0*t*t+3.0*t+1.0)+d*t*t*t)/6.0;
        // Preserve shared corner values instead of averaging each face toward a different neighbour.
        return mix(mix(b,c,t),smoothValue,smoothstep(0.0,1.0,min(x,rockProfileSize.x-1.0-x)));
      }
      vec3 rockStrataColor() {
        vec4 contact=rockContact(0.0);
        vec3 tone=contact.rgb;
        for(int layer=1;layer<=${profile.layerCount};layer++) {
          vec4 nextContact;
          if(layer==${profile.layerCount}) nextContact=vec4(rockUnknownColor,contact.a);
          else nextContact=rockContact(float(layer));
          float distanceToContact=-rockCoord.y-contact.a;
          float aa=max(fwidth(distanceToContact),0.015);
          tone=mix(tone,nextContact.rgb,smoothstep(-aa,aa,distanceToContact));
          contact=nextContact;
        }
        return tone;
      }` : ""}
      ${cave?caveFieldGLSL(cave):""}
      float rockHash(vec3 p){p=fract(p*0.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
      float rockNoise(vec3 p){vec3 a=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(mix(rockHash(a),rockHash(a+vec3(1,0,0)),f.x),mix(rockHash(a+vec3(0,1,0)),rockHash(a+vec3(1,1,0)),f.x),f.y),
          mix(mix(rockHash(a+vec3(0,0,1)),rockHash(a+vec3(1,0,1)),f.x),mix(rockHash(a+vec3(0,1,1)),rockHash(a+1.0),f.x),f.y),f.z);}
      float rockDetail(vec3 p,float scale,float footprint){float fade=1.0-smoothstep(scale*0.2,scale,footprint);if(fade<0.001)return 0.5;return mix(0.5,rockNoise(p/scale),fade);}
      vec3 rockNormal(vec3 n,float h){vec3 dx=dFdx(-vViewPosition)*1000.0,dy=dFdy(-vViewPosition)*1000.0;
        vec3 rx=cross(dy,n),ry=cross(n,dx);float det=dot(dx,rx);
        if(abs(det)<1e-12)return n;
        return normalize(abs(det)*n-sign(det)*(dFdx(h)*rx+dFdy(h)*ry));}
      `)
      .replace("#include <color_fragment>", `#include <color_fragment>
        ${cave?"if(caveVoid(rockPosition)<0.0)discard;":""}
        ${profile ? "if(rockProfileUv.y>=0.0)diffuseColor.rgb*=rockStrataColor();" : ""}
        // Grain uses display-space metres so underground exaggeration cannot stretch it into stripes.
        // Contacts and bedding still use the model's true depth coordinate.
        vec3 grainCoord=rockPosition*1000.0;
        float footprint=max(length(dFdx(grainCoord)),length(dFdy(grainCoord)));
        float weather=rockDetail(grainCoord,90.0,footprint)*0.65+rockDetail(grainCoord,17.0,footprint)*0.35;
        float mineral=rockDetail(grainCoord,0.34,footprint);
        float grain=rockDetail(grainCoord,0.07,footprint);
        vec3 beddingCoord=vec3(grainCoord.x*0.006,rockCoord.y*${(seamFrequency / (2 * Math.PI)).toFixed(8)},grainCoord.z*0.006);
        float beddingFootprint=max(length(dFdx(beddingCoord)),length(dFdy(beddingCoord)));
        float bedding=rockDetail(beddingCoord,1.0,beddingFootprint);
        float micrograin=rockDetail(grainCoord,0.009,footprint);
        float seamPhase=rockCoord.y*${seamFrequency.toFixed(8)}+(weather-0.5)*0.7;
        float lamina=(0.5+0.5*sin(seamPhase))*(1.0-smoothstep(1.0,3.14,fwidth(seamPhase)));
        float rockHeight=mineral*0.005+grain*0.001+micrograin*0.0003+lamina*0.003;
        diffuseColor.rgb *= 0.83+weather*0.20+(bedding-0.5)*0.08+(grain-0.5)*0.14;
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
