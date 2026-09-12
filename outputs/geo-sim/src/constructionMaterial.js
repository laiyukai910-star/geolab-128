// Local coordinates keep construction finishes attached to rotated instances.
export function applyConstructionFinish(material, materialClass, authoredResponse = false) {
  if (!["masonry", "metal", "glass", "technical", "mineral"].includes(materialClass)) return material;
  const metallic = materialClass === "metal", glazed = materialClass === "glass";
  const grainStrength = glazed ? 0.008 : metallic ? 0.035 : 0.10;
  material.customProgramCacheKey = () => `geolab-construction-v1:${materialClass}:${authoredResponse}`;
  material.userData.constructionFinish = {version:1,materialClass};
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\nvarying vec3 constructionPoint;\n${authoredResponse?"attribute vec2 constructionResponse; varying vec2 finishResponse;":""}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\nconstructionPoint = position;\n${authoredResponse?"finishResponse=constructionResponse;":""}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec3 constructionPoint;
        ${authoredResponse?"varying vec2 finishResponse;":""}
        float constructionHash(vec3 p){p=fract(p*0.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
        float constructionNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
          return mix(mix(mix(constructionHash(i),constructionHash(i+vec3(1,0,0)),f.x),mix(constructionHash(i+vec3(0,1,0)),constructionHash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(constructionHash(i+vec3(0,0,1)),constructionHash(i+vec3(1,0,1)),f.x),mix(constructionHash(i+vec3(0,1,1)),constructionHash(i+1.0),f.x),f.y),f.z);}
      `)
      .replace("#include <color_fragment>", `#include <color_fragment>
        float constructionFootprint=max(length(dFdx(constructionPoint)),length(dFdy(constructionPoint)));
        float finishFade=1.0-smoothstep(0.0015,0.009,constructionFootprint);
        float finishGrain=mix(0.5,constructionNoise(constructionPoint*180.0),finishFade);
        float finishLarge=constructionNoise(constructionPoint*12.0);
        diffuseColor.rgb*=1.0+(finishGrain-0.5)*${grainStrength.toFixed(4)}+(finishLarge-0.5)*${glazed?"0.015":"0.06"};
      `)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        ${authoredResponse?"roughnessFactor=finishResponse.x;":""}
        roughnessFactor=clamp(roughnessFactor+(finishGrain-0.5)*${metallic?"0.16":"0.06"},0.08,0.98);
      `)
      .replace("#include <metalnessmap_fragment>", `#include <metalnessmap_fragment>\n${authoredResponse?"metalnessFactor=finishResponse.y;":""}`);
  };
  return material;
}
