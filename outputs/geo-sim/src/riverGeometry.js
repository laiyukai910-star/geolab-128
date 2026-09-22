import * as THREE from "three";
import { sampleTerrainHeight } from "./terrainVolume.js";
import { buildRiverNetwork } from "./riverNetwork.js";

export function buildRiverGeometry(model,params) {
  const network=buildRiverNetwork(model),positions=[],colors=[],indices=[],flow=[],directions=[],metrics=[];
  const sea=Number(params.seaLevel)||0,vertical=Number(params.verticalScale)||1;
  const quality=params.renderDetailQuality;
  const subdivisions=quality==="exhaustive"?12:quality==="high"?4:8;
  const columns=quality==="exhaustive"?13:quality==="high"?5:9;
  const hydraulic=(field,id,fallback)=>Number.isFinite(field?.[id])&&field[id]>=0?field[id]:fallback;
  const point=id=>new THREE.Vector3((id%model.n)/(model.n-1)*model.sizeKm-model.sizeKm/2,0,Math.floor(id/model.n)/(model.n-1)*model.sizeKm-model.sizeKm/2);
  const centerColor=new THREE.Color(0x417e86),edgeColor=new THREE.Color(0x668d88),nodeRows=new Map(),states=new Map(),junctions=new Map();
  const priority=e=>hydraulic(model.discharge,e.from,0);
  const main=edges=>edges.slice().sort((a,b)=>priority(b)-priority(a)||a.from-b.from||a.to-b.to)[0];
  for(const node of network.nodes.values()){
    const p=point(node.id),incoming=main(node.incoming),outgoing=main(node.outgoing);
    const before=incoming?point(incoming.from):p,after=outgoing?point(outgoing.to):p;
    const tangent=after.clone().sub(before).normalize();if(tangent.lengthSq()<1e-9)tangent.set(1,0,0);
    states.set(node.id,{p,tangent,width:Math.min(model.sizeKm,Math.max(0.1,hydraulic(model.hydraulics?.channelWidthM,node.id,2))/1000),
      depth:hydraulic(model.hydraulics?.channelDepthM,node.id,0.1),speed:hydraulic(model.hydraulics?.flowVelocity,node.id,0),distance:node.distanceM});
  }
  for(const [id,state] of states)state.level=Math.max(sea,model.height[id]+state.depth);
  for(const node of network.nodes.values())if(node.incoming.length+node.outgoing.length>2){
    const center=states.get(node.id).p;
    const arms=[...node.incoming.map(e=>e.from),...node.outgoing.map(e=>e.to)].map(id=>point(id).sub(center));
    const radius=Math.min(...arms.map(a=>a.length()*0.28),states.get(node.id).width*1.5);
    let angle=Math.PI;
    for(let a=0;a<arms.length;a++)for(let b=a+1;b<arms.length;b++)angle=Math.min(angle,arms[a].angleTo(arms[b]));
    junctions.set(node.id,{radius,widthLimit:1.8*radius*Math.tan(Math.max(0.01,angle)*0.5),rows:[]});
  }
  let bankClippedSections=0,terrainConflictSections=0,straightenedEdges=0;
  function row(p,tangent,width,depth,speed,distance,level){
    const start=positions.length/3,normal=new THREE.Vector3(-tangent.z,0,tangent.x);
    const stage=Math.max(sea,level),centerBed=sampleTerrainHeight(model,p.x,p.z);
    if(centerBed!==null && centerBed>stage+0.02)terrainConflictSections++;
    // Stop at the first dry bank, not a farther low spot across a levee or ridge.
    const bank=sign=>{
      let wet=0;
      for(let step=1;step<=8;step++) {
        const offset=width*0.5*step/8;
        const height=sampleTerrainHeight(model,p.x+normal.x*offset*sign,p.z+normal.z*offset*sign);
        if(height===null || height>stage) {
          let dry=offset;
          for(let iteration=0;iteration<10;iteration++) {
            const mid=(wet+dry)/2,h=sampleTerrainHeight(model,p.x+normal.x*mid*sign,p.z+normal.z*mid*sign);
            if(h===null || h>stage)dry=mid;else wet=mid;
          }
          return wet;
        }
        wet=offset;
      }
      return wet;
    };
    const left=bank(-1),right=bank(1);
    if(left+right<width*0.999)bankClippedSections++;
    for(let k=0;k<columns;k++){
      const side=Math.sin((k/(columns-1)-0.5)*Math.PI),color=centerColor.clone().lerp(edgeColor,Math.abs(side));
      const offset=side*(side<0?left:right);
      positions.push(p.x+normal.x*offset,(stage+0.02)*vertical/1000,p.z+normal.z*offset);
      colors.push(color.r,color.g,color.b);flow.push(side,depth,speed);directions.push(tangent.x,tangent.z);metrics.push(distance,width*500);
    }
    return start;
  }
  function endpoint(id,other,outgoing){
    const s=states.get(id),junction=junctions.get(id);
    if(!junction)return s;
    const arm=states.get(other).p.clone().sub(s.p).normalize();
    return {...s,p:s.p.clone().addScaledVector(arm,junction.radius),tangent:arm.multiplyScalar(outgoing?1:-1),
      level:THREE.MathUtils.lerp(s.level,states.get(other).level,junction.radius/s.p.distanceTo(states.get(other).p)),
      width:Math.min(s.width,junction.widthLimit),distance:s.distance+(outgoing?1:-1)*junction.radius*1000};
  }
  function nodeRow(id,s,other){
    const key=junctions.has(id)?`${id}:${other}`:id;
    if(!nodeRows.has(key)){
      const start=row(s.p,s.tangent,s.width,s.depth,s.speed,s.distance,s.level);
      nodeRows.set(key,start);junctions.get(id)?.rows.push(start);
    }
    return nodeRows.get(key);
  }
  let dryEdges=0,submergedEdges=0,omittedCurves=0,risingHeadEdges=0,risingWaterSurfaceEdges=0,terrainBlockedEdges=0;
  for(const edge of network.edges){
    const a=endpoint(edge.from,edge.to,true),b=endpoint(edge.to,edge.from,false);
    if(a.depth===0&&b.depth===0){dryEdges++;continue;}
    if(model.height[edge.from]<=sea&&model.height[edge.to]<=sea){submergedEdges++;continue;}
    const waterA=Math.max(sea,model.height[edge.from]+a.depth),waterB=Math.max(sea,model.height[edge.to]+b.depth);
    if(waterB>waterA+0.01)risingWaterSurfaceEdges++;
    // With alpha=1, total head includes velocity head: a rising stage alone is not an energy violation.
    if(waterB+b.speed*b.speed/(2*9.80665)>waterA+a.speed*a.speed/(2*9.80665)+0.01)risingHeadEdges++;
    const direction=b.p.clone().sub(a.p).normalize(),distance=a.p.distanceTo(b.p);
    const ta=a.tangent.dot(direction)>0.15?a.tangent:direction,tb=b.tangent.dot(direction)>0.15?b.tangent:direction;
    const curve=new THREE.CubicBezierCurve3(a.p,a.p.clone().addScaledVector(ta,distance/3),b.p.clone().addScaledVector(tb,-distance/3),b.p);
    const stageA=a.level,stageB=b.level;
    const samplePath=straight=>{
      const result=[];
      for(let j=1;j<subdivisions;j++){
        const t=j/subdivisions,p=straight?a.p.clone().lerp(b.p,t):curve.getPoint(t),bed=sampleTerrainHeight(model,p.x,p.z);
        if(!Number.isFinite(bed))break;
        result.push({t,p,bed,level:THREE.MathUtils.lerp(stageA,stageB,t),direction:straight?direction:curve.getTangent(t)});
      }
      return result;
    };
    let samples=samplePath(false);
    if(samples.length!==subdivisions-1 || samples.some(s=>s.bed>s.level+0.02)) {
      samples=samplePath(true);straightenedEdges++;
    }
    if(samples.length!==subdivisions-1){omittedCurves++;continue;}
    const blocked=samples.some(s=>s.bed>s.level+0.02) || [[a,stageA],[b,stageB]].some(([s,level])=>{
      const bed=sampleTerrainHeight(model,s.p.x,s.p.z);
      return bed===null || bed>level+0.02;
    });
    if(blocked){terrainBlockedEdges++;continue;}
    const rows=[nodeRow(edge.from,a,edge.to)];
    for(const s of samples)rows.push(row(s.p,s.direction,THREE.MathUtils.lerp(a.width,b.width,s.t),
      THREE.MathUtils.lerp(a.depth,b.depth,s.t),THREE.MathUtils.lerp(a.speed,b.speed,s.t),THREE.MathUtils.lerp(a.distance,b.distance,s.t),s.level));
    rows.push(nodeRow(edge.to,b,edge.from));
    for(let j=0;j<rows.length-1;j++)for(let k=0;k<columns-1;k++){
      const x=rows[j]+k,y=rows[j+1]+k;indices.push(x,x+1,y,y,x+1,y+1);
    }
  }
  // Separate branch mouths surround a star-shaped junction patch. Sharing one
  // cross-section among three reaches would create non-manifold triangle edges.
  let junctionPatches=0;
  for(const [id,junction] of junctions){
    if(junction.rows.length<2)continue;
    const s=states.get(id),center=positions.length/3;
    positions.push(s.p.x,(Math.max(sea,model.height[id]+s.depth)+0.02)*vertical/1000,s.p.z);
    colors.push(centerColor.r,centerColor.g,centerColor.b);flow.push(0,s.depth,s.speed);directions.push(s.tangent.x,s.tangent.z);metrics.push(s.distance,s.width*500);
    const boundary=junction.rows.flatMap(start=>Array.from({length:columns},(_,k)=>start+k));
    boundary.sort((a,b)=>Math.atan2(positions[b*3+2]-s.p.z,positions[b*3]-s.p.x)-Math.atan2(positions[a*3+2]-s.p.z,positions[a*3]-s.p.x));
    for(let k=0;k<boundary.length;k++)indices.push(center,boundary[k],boundary[(k+1)%boundary.length]);
    junctionPatches++;
  }
  const geometry=new THREE.BufferGeometry();
  for(const [name,array,size] of [["position",positions,3],["color",colors,3],["riverData",flow,3],["riverDirection",directions,2],["riverMetric",metrics,2]])geometry.setAttribute(name,new THREE.Float32BufferAttribute(array,size));
  geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
  geometry.userData.representation="Connected hydraulic display sections, not surveyed bathymetry or a backwater solution";
  geometry.userData.riverNetwork={...network.diagnostics,nodes:network.nodes.size,edges:network.edges.length,sharedSections:nodeRows.size,junctionPatches,columns,dryEdges,submergedEdges,omittedCurves,risingHeadEdges,risingWaterSurfaceEdges,bankClippedSections,terrainConflictSections,straightenedEdges,terrainBlockedEdges};
  return geometry;
}
