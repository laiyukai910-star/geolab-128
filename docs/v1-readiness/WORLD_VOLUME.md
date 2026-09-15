# Terrain, Water And Underground Views

## Solid Terrain

The rendered terrain now forms a closed boundary: the existing heightfield,
elevation-following perimeter walls, and a bottom surface. Walls sample the
existing subsurface columns for lithology and groundwater-saturation colors.
The natural display reconstructs these colors continuously and blends local
tones toward the regional mean of each layer to suppress coarse checkerboard
patterns. It is not a fine-scale lithology map. Categorical analysis layers,
column IDs, and scientific arrays are preserved.
Extensions beneath modeled columns use an unclassified base color; they are
geometric closure, not additional geological evidence.

The camera is kept outside opaque terrain, including when orbiting below the
surface. If a zoom or terrain edit places it inside rock, it rises just above
the local surface without changing its map coordinates or orbit target. Use Geological section to inspect
the interior; the removed half remains accessible. This is a camera guard, not
a collision or excavation solver.

Geological faces receive a display-only inspection fill so shaded walls and the
underside remain readable. The unclassified base is neutral gray. Neither this
fill nor its color represents subsurface light, temperature, or a new rock type.

![Solid regional terrain, coast and sky](media/volume-solid.png)

## Surface Rock And Cover

Which parts of the surface read as bare rock, scree, soil or vegetation is derived from the
lithology under each cell rather than from one slope curve. `src/geoLithology.js` computes a rock
mass resistance in the manner of Selby's geomorphic classification, a joint spacing that scales
with bed thickness, a columnar spacing for cooling units, and a weathered-cover thickness from the
balance between weathering production and slope-driven removal. Its inputs are the model's own
porosity, permeability and dry density; the published relations and the constants chosen by the
author are both marked in that file.

Timing matters as much as strength. Joint spacing is only meaningful for a fractured rock mass, so
soil, weathered cover and alluvium are given an aggregate scale instead and the shader draws them
granularly; a loose material never renders as a larger block than the rock it sits on. Placed rock
and scree detail likewise take their block size from the joint spacing and the slope they need to
move from the rock mass strength, so weak material sheds on gentler ground than strong rock.

Weathered cover is two layers, not one. Soil is the mobile layer that bioturbation and colluvial
mixing keep churning and stays thin even on stable humid ground; saprolite beneath it is weathered
rock that has lost its fabric, is what the landscape stores water in, and is what dissolution and
roots reach down through. Cover retention saturates on the soil layer, because saprolite does not by
itself hold a vegetation mat, while the landform classification uses the whole profile — so a gentle
slope carrying metres of saprolite reads regolith-mantled rather than soil-mantled.

The terrain surface shader receives the resulting spacings through the packed `terrainStructure`
vertex attribute, so procedural joint cells and bedding banding follow the actual rock rather than
one fixed wavelength.

A scenario without a subsurface model has no lithology to read, so the previous
slope/cover/wetness proxy is used unchanged in that case, and its structure is marked unclassified
so the shader does not invent bedding or blocky joints for it.

### Lithology Classes And Public Models

The class set is meant to be able to represent real rock, and it is checked against the public
reference global lithology model rather than against intuition. The Global Lithological Map
(GLiM v1.1, Hartmann and Moosdorf 2012, doi:10.1029/2012GC004370) reports the emerged surface as
64 percent sediments — roughly a third of that carbonate — 13 percent metamorphics, 7 percent
plutonics and 6 percent volcanics. Its carbonate class is the one this table was missing, and its
absence had a concrete consequence: a limestone interval imported as generic competent bedrock, so
the karst assessment could never report a carbonate host at all. Carbonate is now its own class,
limestone, dolomite, dolostone, chalk and marble import to it, and solubility is decided by that
class rather than by a porosity threshold — an earlier score weighed only porosity and bulk density,
which ranked a clay aquitard above limestone.

The remaining ground-truth target is the published global thickness of soil, regolith and
sedimentary deposits (Pelletier et al., 1 km grid, ORNL DAAC dataset 1304, doi 10.3334/ORNLDAAC/1304).
This repository does not consume that grid, and its numeric range was not verifiable from this
environment, so it is named as the comparison a future calibration should be made against rather
than cited as a fitted constraint. The soil and saprolite production scales are marked CALIBRATED
for exactly that reason.

### Subsurface And Caves

Subsurface lamination is drawn at the modelled column's own bed thickness, using the same
thickness-weighted harmonic mean the surface uses, so the section and the surface agree about how
thick the beds are. The lithology palette lives in one place, `src/lithologyTable.js`, and both the
volume view and the section derive from it; it holds the display tones the application was tuned
against, which are lighter than raw material colours because the subsurface material adds a
display-only inspection fill.

The karst cave's passage skeleton is anchored to real bedding contacts: one conduit per soluble
host bed at that bed's own contact depth, a vadose shaft from the top contact and a phreatic outlet
along the base of the host, with conduit reach scaling with the host's joint spacing. A column with
no soluble-looking host yields no plan and the volume view keeps its generic cavity rather than
inventing contacts. It remains illustrative geometry: it infers no cave from observations and
changes no groundwater calculation.

### Lateral Sediment Thickness

The volume stores one reference depth-edge array, and every column used to be read against it, so a
128 km region gave all 4096 columns the same layer boundaries and the layer thickness that the
surface derives its joint spacing from was a single constant. Measured before this change: one
distinct layer-boundary set, one top-layer thickness, one joint spacing across the whole region.

The model already computed a per-column sediment thickness. `computeSubsurfaceVolume` derives
`columnBedrockDepthM` per column from root depth, valley fill, slope, complexity and terrain noise,
and `inferSubsurfaceLithology` already uses it to place the sediment-bedrock contact; on a default
128 km model it holds 10880 distinct values from 14.0 m to 59.5 m. That field is what varies the
layer geometry.

An earlier attempt derived the variation from the surface elevation rank instead and was withdrawn
after review. It was wrong in four measured ways: it returned a uniform 7.9 percent thinning on
perfectly flat terrain, where the surface carries no lateral information at all, and never returned
the neutral value; it scaled every interface including the bedrock layers the engine had already
placed below the bedrock contact, so the whole remainder landed in a layer that is bedrock or
fractured rock in every column; it computed a region-wide elevation quantile per column, which is
quadratic; and it left the display publishing the reference geometry while the geology used a
per-column one.

The factor is now the column's sediment thickness over the region median, centred on 1 and producing
both thicker and thinner columns. It is exactly 1 for a model with no bedrock-depth field and for a
column at the median, so no information produces no change rather than a silent thinning. The median
is memoised per field array, so a profile costs about four microseconds per column rather than being
quadratic.

The absolute thickness of the sediment package is still not claimed: that remains the scenario's own
`subsurfaceDepthM`. Only the thickness relative to the region's own bedrock-depth field varies.

The exposed section face and the 3-D voxel slabs both place each column at that column's own
interfaces, so the display, the stratigraphic profile and the cave anchoring all read the same
geometry and an anchored cave cannot render in a differently banded slice.

The exported layers are deliberately left on the reference geometry. The stored voxel arrays are
indexed by layer and column and the cube-coordinate and column CSV exports publish one depth range
per layer, which is a reference-depth contract; moving those to per-column values would change the
meaning of a published column set rather than the appearance of a view. The reference array itself is
never rewritten, so that contract is intact, and the per-column values are what the display and the
stratigraphic derivation read.

## Geological Section

The Layers drawer provides a Volume view selector. Geological section removes
the part of the region beyond a movable grid-aligned plane and closes the exposed
face. Terrain, vegetation, infrastructure, wildlife, river surfaces, and diagnostic
objects share the same clipping plane. Selecting an underground analysis layer
also opens the section view.

![Geological section of the same region](media/volume-section.png)

Section position ranges from 5% to 95% of the east-west extent. Underground
exaggeration defaults to 20 and can be set to 1 for the same vertical factor as
the terrain. This is an additional display multiplier on depth below the local
surface, not a change to geological thickness, hydraulic pressure, storage,
or any exported depth values. The ordinary terrain vertical scale still applies.
At a regional extent, actual shallow geological layers otherwise occupy only a
few screen pixels.

Clipping follows Three.js world-space material planes. The renderer enables
local clipping and excludes the removed side from double-click terrain focus.
See the [Three.js material clipping contract](https://threejs.org/docs/pages/Material.html#clippingPlanes).

## Water And Sky

Sea surfaces reuse the terrain geometry buffers, project vertices to the selected
sea level, and discard land fragments. Shoreline intersections therefore follow
the same triangular heightfield as the ground. Boundary faces extend to the
modeled seabed and remain visible at the section face.

Underwater view places the camera over submerged terrain. Seabed grain, surface
ripples, water color, transparency, and fog provide depth cues. Entering and
leaving water changes the optical environment automatically. A dry scenario
reports that no submerged terrain is available rather than inventing water.

![Local underwater view of the modeled seabed](media/volume-underwater.png)

The sky uses a full-screen background reconstructed from the current camera's
world-space rays. It does not depend on a distant sphere, camera translation,
or near/far clipping distances. A sun glow, horizon tones, and slowly moving
procedural clouds require no downloaded textures. Sky and sea display can be
switched off independently. Water is hidden on analytical surface palettes so it
does not conceal their colors.

Cloud coordinates come from a dome anchored to view directions, folded into a
bounded ring around the horizon by `r/(1+0.3r)`: linear to first order, monotone,
never stretching, with a slope that runs from 1 down to 0.3 and a bounded far
field. Each detail octave is faded out once one screen pixel spans more than its
feature size, and that footprint is derived analytically from the view ray,
split into the fold's angular and radial parts. The pattern is therefore
anchored to the world rather than to the frame, so turning the camera does not
make cloud detail crawl or jump between frames.

These are display systems, not a calibrated atmosphere, wave spectrum, or 3D
fluid solver. River surfaces use routed endpoints and hydraulic widths/depths;
curved sub-grid display ribbons do not add surveyed channel bathymetry. The
terrain top remains a heightfield, not a fully volumetric geological solver.

An explicit **Karst cave scenario** now adds a closed passage mesh and a matching
opening in the section face. It is user-authored illustrative geometry, not a
cave inferred from the subsurface columns. See [organisms and caves](BIOMES_AND_CAVES.md)
for controls, habitat constraints, source references, and remaining limitations.

## Verification

Local checks performed on 2026-09-06:

- The volume regression verifies that every nondegenerate boundary edge belongs
  to two triangles after combining the top, sides, cut face, and bottom.
- Tests cover section extents, sea-boundary geometry, interpolated terrain height,
  immersion transitions, clipping removal, and unchanged scientific arrays.
- Camera tests cover escape from opaque ground, correction settling, underwater
  clearance, and access to the cutaway half. Sky uniforms use the current camera
  projection and orientation without writing scene depth.
- The sky field test evaluates the shader's own `skyField` steps, transcribed
  literally, and checks that cloud coordinates stay finite and bounded from 22
  degrees below the horizon to the zenith, that neighbouring rays move them by a
  small uniform amount, that the ring map never stretches, and that the shader
  takes its footprint from the view ray rather than from the cloud coordinates.
  It also guards the out-parameter names, because a GLSL parameter shadows a
  same-named caller local and the shader linked while reading an uninitialized
  footprint.
- A local Playwright probe rendered the sky through the real Three.js pipeline
  and compared each frame against the average of ten frames across the same
  0.1-degree arc. Cloud aliasing over a slow pan fell from 0.0303 to 0.0121 at
  the horizon, from 0.0329 to 0.0141 just above it, and from 0.0414 to 0.0183
  across the sun disc. Frame-to-frame shimmer fell from 0.163 to 0.083 at the
  horizon and from 0.192 to 0.090 below it; the frame-to-frame change itself grew
  slightly more linear with step size (a 16-fold step increase now produces a
  15.8-fold change, against 15.4 before).
- The browser fixture `outputs/geo-sim/tests/fixtures/volume-regression.html`
  exposes `review.frame(position, target, skyOnly)` for frozen-time pixel checks.
  Local Playwright checks covered a full yaw sweep, small rotation steps,
  translation invariance, near/far changes, and mobile pitch changes without
  uncovered background pixels or shader errors. Underside and cutaway captures
  showed visible material colors; an inside camera settled outside opaque rock.
- Resource tests verify that disposing water does not release borrowed terrain
  geometry and that scene-owned geometry/materials are removed.
- Playwright exercised all three views at 1600 x 900 and 390 x 844, with canvas
  pixel checks, orbit interaction, and no recorded shader/page errors.
- Switching volume views did not start another scientific model computation.
- Browser WASM startup and a temperature rebuild passed all 13 process gates.
- A fresh Windows folder build passed its packaged Electron smoke test using the
  native Rust sidecar, including 13 process gates, canvas pixels, geometry audit,
  and zero external requests.

The synchronized local executable is under
`outputs/GeoLab-128-Local/GeoLab 128-win32-x64/GeoLab 128.exe`.
The heightfield/Unity/Unreal data exports are unchanged; these new renderer
materials and clipping controls are not exported as engine-ready scenes.
