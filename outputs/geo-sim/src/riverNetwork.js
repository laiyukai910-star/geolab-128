// Display connectivity preserves modeled receivers; it never reroutes scientific flow.
export function buildRiverNetwork(model, limit=120000) {
  const nodes=new Map(),edges=[],seen=new Set();
  const diagnostics={invalidEdges:0,duplicateEdges:0,cyclicEdges:0,truncatedEdges:0,confluences:0,divergences:0};
  if(!Number.isInteger(limit)||limit<0||!Number.isInteger(model.n)||model.n<2||!Number.isFinite(model.sizeKm)||model.sizeKm<=0||model.height?.length!==model.n*model.n)throw new RangeError("River graph requires a finite square terrain grid and nonnegative edge budget");
  const sources=model.riverSegments||[];
  diagnostics.truncatedEdges=Math.max(0,sources.length-limit);
  for(const edge of sources.slice(0,limit)) {
    const {from,to}=edge||{};
    if(![from,to].every(i=>Number.isInteger(i)&&i>=0&&i<model.height.length&&Number.isFinite(model.height[i]))||from===to){diagnostics.invalidEdges++;continue;}
    const key=`${from}:${to}`;
    if(seen.has(key)){diagnostics.duplicateEdges++;continue;}seen.add(key);
    for(const id of [from,to])if(!nodes.has(id))nodes.set(id,{id,incoming:[],outgoing:[],distanceM:0});
    const link={from,to};edges.push(link);nodes.get(from).outgoing.push(link);nodes.get(to).incoming.push(link);
  }
  const queue=[...nodes.values()].filter(n=>!n.incoming.length).map(n=>n.id).sort((a,b)=>a-b);
  const indegree=new Map([...nodes.values()].map(n=>[n.id,n.incoming.length])),order=[];
  const length=e=>Math.hypot(e.to%model.n-e.from%model.n,Math.floor(e.to/model.n)-Math.floor(e.from/model.n))*model.sizeKm*1000/(model.n-1);
  for(let head=0;head<queue.length;head++) {
    const node=nodes.get(queue[head]);order.push(node.id);
    for(const edge of node.outgoing){
      const next=nodes.get(edge.to);next.distanceM=Math.max(next.distanceM,node.distanceM+length(edge));
      indegree.set(edge.to,indegree.get(edge.to)-1);if(!indegree.get(edge.to))queue.push(edge.to);
    }
  }
  const accepted=new Set(order),valid=edges.filter(e=>accepted.has(e.from)&&accepted.has(e.to));
  diagnostics.cyclicEdges=edges.length-valid.length;
  for(const [id,node] of nodes){
    if(!accepted.has(id)){nodes.delete(id);continue;}
    node.incoming=node.incoming.filter(e=>accepted.has(e.from));node.outgoing=node.outgoing.filter(e=>accepted.has(e.to));
    if(node.incoming.length>1)diagnostics.confluences++;
    if(node.outgoing.length>1)diagnostics.divergences++;
  }
  valid.sort((a,b)=>a.from-b.from||a.to-b.to);
  return {nodes,edges:valid,order,diagnostics};
}
