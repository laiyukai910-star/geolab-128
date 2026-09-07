const clamp = (v,a,b) => Math.max(a,Math.min(b,v));

export function aquaticContext(model, params={}) {
  const n=model.n, count=n*n, seaLevel=Number(params.seaLevel)||0;
  const marine=new Uint8Array(count), queue=new Uint32Array(count);
  let head=0,tail=0;
  const visit=i=>{if(!marine[i] && model.height[i]<seaLevel){marine[i]=1;queue[tail++]=i;}};
  for(let i=0;i<n;i++){visit(i);visit((n-1)*n+i);visit(i*n);visit(i*n+n-1);}
  // Four-connected boundary inundation is a sea-connectivity screen, not an estuarine salinity solver.
  while(head<tail){const i=queue[head++],x=i%n;
    if(x)visit(i-1);if(x<n-1)visit(i+1);if(i>=n)visit(i-n);if(i<count-n)visit(i+n);
  }
  const rivers=new Set();
  for(const s of model.riverSegments||[]){rivers.add(s.from);rivers.add(s.to);}
  return {marine,rivers,seaLevel,seaSalinity:clamp(Number(params.seaSalinityPSU??35),0,45)};
}

export function aquaticSite(model, context, index) {
  const bed=Number(model.height[index]), isSea=context.marine[index]===1;
  const river=context.rivers.has(index) && bed>context.seaLevel;
  if(!isSea && !river)return null;
  const depthM=isSea ? context.seaLevel-bed : Number(model.hydraulics?.channelDepthM?.[index]||0);
  const widthM=isSea ? model.cellSizeKm*1000 : Number(model.hydraulics?.channelWidthM?.[index]||0);
  if(!(depthM>0.08) || !(widthM>0))return null;
  return {index,environment:isSea?"marine":"freshwater",depthM,widthM,bedM:bed,
    waterSurfaceM:bed+depthM,salinityPSU:isSea?context.seaSalinity:0.3,
    temperatureC:Number(model.temperature?.[index]??12),
    areaFraction:isSea?1:clamp(widthM/(model.cellSizeKm*1000),0,1)};
}

export function aquaticFit(species, site) {
  if(!site || species.aquaticEnvironment!==site.environment)return 0;
  const [minSalinity,maxSalinity]=species.salinityRange;
  const [minDepth,maxDepth]=species.depthRangeM;
  if(site.salinityPSU<minSalinity || site.salinityPSU>maxSalinity || site.depthM<minDepth || site.depthM>maxDepth)return 0;
  return clamp(1-Math.abs(site.temperatureC-species.temperature[0])/species.temperature[1],0,1);
}

export const AQUATIC_PROFILES = Object.freeze([
  {id:"river_trout",labelZh:"溪流鳟鱼型",geometryClass:"fish-trout",colorHex:0xffffff,bodyScale:0.45,adultBodyMassKg:1.2,
    aquaticEnvironment:"freshwater",guild:"aquatic-predator",temperature:[12,12],depthRangeM:[0.3,30],salinityRange:[0,1],density:65,growth:0.22},
  {id:"river_perch",labelZh:"淡水鲈鱼型",geometryClass:"fish-perch",colorHex:0xffffff,bodyScale:0.4,adultBodyMassKg:0.8,
    aquaticEnvironment:"freshwater",guild:"aquatic-predator",temperature:[19,15],depthRangeM:[0.3,40],salinityRange:[0,1],density:70,growth:0.25},
  {id:"reef_fish",labelZh:"珊瑚礁鱼型",geometryClass:"fish-reef",colorHex:0xffffff,bodyScale:0.28,adultBodyMassKg:0.2,
    aquaticEnvironment:"marine",guild:"aquatic-omnivore",temperature:[26,8],depthRangeM:[0.5,40],salinityRange:[28,40],density:180,growth:0.28},
  {id:"coastal_ray",labelZh:"近岸鳐鱼型",geometryClass:"ray",colorHex:0xffffff,bodyScale:0.85,adultBodyMassKg:12,
    aquaticEnvironment:"marine",guild:"benthic-predator",temperature:[22,14],depthRangeM:[1,150],salinityRange:[28,40],density:4,growth:0.12},
  {id:"reef_octopus",labelZh:"礁栖章鱼型",geometryClass:"octopus",colorHex:0xffffff,bodyScale:0.5,adultBodyMassKg:3,
    aquaticEnvironment:"marine",guild:"benthic-predator",temperature:[22,12],depthRangeM:[0.8,100],salinityRange:[28,40],density:12,growth:0.3},
  {id:"moon_jelly",labelZh:"钵水母型",geometryClass:"jelly",colorHex:0xffffff,bodyScale:0.4,adultBodyMassKg:0.4,
    aquaticEnvironment:"marine",guild:"plankton-predator",temperature:[18,15],depthRangeM:[0.8,100],salinityRange:[15,40],density:95,growth:0.4},
  {id:"shore_crab",labelZh:"近岸蟹型",geometryClass:"crab",colorHex:0xffffff,bodyScale:0.22,adultBodyMassKg:0.15,
    aquaticEnvironment:"marine",guild:"benthic-omnivore",temperature:[20,16],depthRangeM:[0.1,50],salinityRange:[20,40],density:130,growth:0.3},
  {id:"freshwater_mussel",labelZh:"淡水蚌型",geometryClass:"mussel",colorHex:0xffffff,bodyScale:0.16,adultBodyMassKg:0.08,
    aquaticEnvironment:"freshwater",guild:"filter-feeder",temperature:[18,16],depthRangeM:[0.2,20],salinityRange:[0,0.8],density:250,growth:0.1}
].map(p=>Object.freeze({...p,aquaticAffinity:1,humanTolerance:0.08,movementKmPerDay:p.geometryClass==="mussel"?0:1.2,
  trophicLevel:p.guild==="filter-feeder"?2:3,profileBasis:"illustrative functional morphotype; not a species distribution or abundance estimate"})));
