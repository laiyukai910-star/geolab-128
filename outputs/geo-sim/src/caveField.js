// The fixed outline is the fallback for a cave with no derived plan. A plan anchored to real
// bedding contacts supersedes it, and the same passage list is handed to the distance function, to
// the geometry and to the shader, so the clipped void and the rendered wall cannot describe
// different passages.
export const CAVE_PASSAGES = Object.freeze([
  [[-0.82,0.12,-0.12],[-0.25,0,0],0.18],
  [[-0.25,0,0],[0.36,-0.06,0.12],0.24],
  [[0.36,-0.06,0.12],[0.82,0.1,0.06],0.18],
  [[-0.28,0,0],[-0.42,-0.12,0.72],0.14],
  [[0.23,-0.06,0.1],[0.08,0.24,-0.68],0.13]
]);

/** The passages a plan calls for: its own derived skeleton when it has one, the outline otherwise. */
export function cavePlanPassages(plan) {
  const passages = plan?.passagePlan?.passages;
  if (!Array.isArray(passages) || !passages.length) return CAVE_PASSAGES;
  return passages.map(({ from, to, radius }) => [from, to, radius]);
}

export function caveDistance(x,y,z,passages=CAVE_PASSAGES) {
  let distance=Infinity;
  for(const [a,b,r] of passages){
    const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2];
    const t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy+(z-a[2])*dz)/(dx*dx+dy*dy+dz*dz)));
    distance=Math.min(distance,Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy,z-a[2]-t*dz)-r);
  }
  return distance;
}

export function caveContains(plan,point,clearance=0) {
  return Boolean(plan) && caveDistance((point.x-plan.center[0])/plan.halfSize[0],(point.y-plan.center[1])/plan.halfSize[1],(point.z-plan.center[2])/plan.halfSize[2],cavePlanPassages(plan)) < -clearance;
}

export function caveFieldGLSL(plan) {
  const v=p=>`vec3(${p.map(x=>Number(x).toFixed(8)).join(",")})`;
  return `float caveCapsule(vec3 p,vec3 a,vec3 b,float r){vec3 d=b-a;float t=clamp(dot(p-a,d)/dot(d,d),0.0,1.0);return length(p-a-t*d)-r;}
    float caveVoid(vec3 point){vec3 p=(point-${v(plan.center)})/${v(plan.halfSize)};float d=100.0;
    ${cavePlanPassages(plan).map(([a,b,r])=>`d=min(d,caveCapsule(p,${v(a)},${v(b)},${r.toFixed(4)}));`).join("\n")}
    return d;}`;
}
