# Model Construction and Surface Rendering

Rendering geometry is separate from terrain elevation, hydraulic state, ecological
abundance, and facility placement. All assets below are generated locally and ship
with the desktop application.

## Facility Geometry

The construction factory replaces 21 body/component templates. Facility types
reuse these components; this is not a claim that every facility has a new,
individually authored model.

| Templates | Geometry |
| --- | --- |
| Setback tower, courtyard midrise, L-plan lowrise, civic building | Fitted windows, mullions, raised sills, roof cornices, closed building bodies |
| Industrial building, hipped roof | Recessed loading doors, roof courses, capped ridges, service exhaust |
| Tapered landmark | Revolved shell, continuous floor rings and roof cap |
| Process tank, water-tower tank | Domed lid, seam rings, inspection ladder and service pipe |
| Dam, spillway, bridge pier | Buttresses, gate ribs, stepped chute, bearing pads and foundations |
| Road, solar panel | Crowned pavement, curbs, cell divisions and busbars |
| Turbine blade | Spanwise tapered, twisted closed section; not an aerodynamic design |
| Greenhouse, stadium, observatory | Roof ribs and panels, continuous terraced bowl, slotted dome |
| Crane boom | Longitudinal chords, diagonal bracing and hoist cable |
| Tunnel portal, utility gallery | Open arch, lining ribs, invert slab, ceiling fixtures and service pipes |

All templates retain normalized placement bounds, finite vertex colors, indexed
buffers and quality tiers. Per-vertex roughness and metalness distinguish glazing,
metal fittings and masonry within the same instanced assembly. Existing site-specific colors still tint the assemblies.
Generic facade grids and extra roofs are suppressed on integrated envelopes to
avoid detached or intersecting details. Service yards and facility-specific
equipment remain separate.

Other registered components retain their existing geometry. Classified masonry,
metal, glass, technical and constructed-mineral finishes add filtered material
variation; a material update alone is not counted as a geometry rebuild.

## Underground Structures

Tunnel and metro facility types use open entrance/gallery assemblies rather than
solid building blocks. Their passages have geometric holes, checked with raycasts.
These are entrance-scale display structures. They do not carve the terrain,
generate a connected underground transport network, or alter groundwater flow.
Natural cave display and geological cutaway controls remain separate.

## Terrain and Water

Soil aggregates, mineral grain and damp pore shading use continuous local
coordinates. Screen-footprint filtering suppresses detail too small to resolve.
Procedural millimetre-scale shading is not millimetre-resolution terrain data.

River geometry carries modeled channel depth, local downstream direction and mean
velocity. The renderer uses these for depth tint, fading banks and directional
ripples. It does not recompute discharge or simulate turbulent fluid motion.
Width remains bounded for the regional display grid; smoothed centerlines are
not surveyed channel geometry.

Real streamflow assessment depends on cross-section and velocity measurements,
not on the appearance of animated water. See the
[USGS streamflow measurement overview](https://www.usgs.gov/water-science-school/science/how-streamflow-measured).

Geological surfaces add filtered lamination and mineral micrograin while retaining
existing cave clipping and inspection lighting. They do not infer observed strata.

## Desktop Verification

- All registered templates: finite position/color buffers and valid indices.
- All 21 rebuilt templates: increasing geometry detail across quality tiers and stable bounds.
- Tunnel/gallery openings: unobstructed central ray in all three quality tiers.
- River buffers: direction/depth/velocity attributes, malformed-input checks and scientific data isolation.
- Local inspection fixture: 1920 x 1080 and 2560 x 1440 rendering, pixel checks, orbit interaction and moving river shading.
- Full application: startup, terrain rebuild, analytical views, underwater and geological sections.
- Desktop EXE: bundled local modules and Three.js addon; no remote model or texture downloads.

The inspection scene is `outputs/geo-sim/tests/fixtures/facility-rebuild.html`.
It uses normalized construction parts with representative display proportions,
not a surveyed settlement. Mobile adaptation is paused.

The implementation uses Three.js
[extruded shapes](https://threejs.org/docs/pages/ExtrudeGeometry.html),
indexed geometry utilities and
[physical materials](https://threejs.org/docs/pages/MeshPhysicalMaterial.html).
