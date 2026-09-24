# Changelog

Notable user-visible, model, compatibility, and reliability changes are recorded here. Detailed implementation history remains available in Git.

## [Unreleased]

- Nearby trees and grass now form uneven patches with varied height and color; park trees grow in small groves. Close trees use a more detailed mesh.
- Ground color blends across source-grid cells. Removed raised green slabs and generic buildings from parks. These rendering changes do not alter elevation or biomass data.
- The placed-facility list can now be searched by localized name or type code and filtered by manual versus generated origin, including large adaptive plans.
- Added a per-facility list in the data drawer. Placed facilities can be located in the 3D scene or removed individually; manually added features can be reopened, edited and saved without clearing the scenario. Point, line and polygon focus uses each feature's GeoJSON bounds. The new controls follow the English/Chinese language setting.
- Added dedicated 3D assemblies for three existing facilities: a water-treatment works with open clarifiers and pipework, a ferry terminal with a covered boarding deck and berth, and a braced fire-watch tower with an observation cabin. These replace generic building shapes in the sand table; the generic fallback remains available when the facility detail budget is exhausted.
- Rebuilt the greenhouse bay, bridge pier, observatory shutter and crane boom: curved glazed roof with crop beds, tapered cutwater shafts with exposed bearings, a shell-aligned slit and shutter, and a fixed-panel boom with pulley rigging. Corrected the dome slit facing away from its telescope.
- Rebuilt the industrial hall's nominal sawtooth roof as four asymmetric solid roof bays with continuous glazed clerestories, frames, gutters and tiered standing seams. Detail quality no longer changes the structural bay count.
- Corrected shelter and hatchery scene scale and preserved their authored vertex colors; hatcheries now use their 9 m visual height instead of the generic 10 m fallback.
- Added evacuation shelters and river hatcheries as selectable, environment-screened facilities with separate 3D assemblies, ecosystem roles, and site-impact defaults. Added dedicated presets for six existing specialized facilities whose UI previously used generic values.
- Added local bathymetry and groundwater-depth raster inputs. Bathymetry informs seabed geometry, groundwater depth constrains the subsurface water table, and both are traceable in cell inspection, coverage reports, and grid exports. Fixed missing NoData metadata incorrectly masking valid zero-valued raster cells.
- Fixed artificial terrain ridges blocking diagonal drainage: terrain meshes, river sampling and camera collision now share the same lower-saddle triangulation, including after terrain edits.
- Fixed pinched sea outlets and water ribbons extending above the sea. River mouths retain incoming width, meet the shoreline at sea level and blend over a width-based distance. Shallow-bank appearance now uses local terrain depth.
- Corrected atmospheric water-deficit sign to PET minus precipitation, so dry scenarios report a positive deficit and wet scenarios a negative surplus. Corrected the dimensional flood-marker height conversion by removing an erroneous 40x multiplier.

- Rebuilt river display profiles around endpoint stages instead of draping water over intermediate terrain. Added first-dry-bank clipping, terrain-checked bend fallback and explicit blocked-reach diagnostics without changing modeled routing or discharge.
- Separated rising water-surface and rising total-head diagnostics, including velocity head. Documented the boundary between Manning normal-depth estimates and an unimplemented backwater solution in `docs/RIVER_RECONSTRUCTION.md`.

- Fixed anatomy dispatch ignoring bird morphotype indices, missing the lion mane option, and making the African elephant body inaccessible. Regression tests now compare selected bird/elephant meshes against their intended anatomy builders rather than only checking that a mesh exists.

- Migrated wildlife morphotype selection to strict TypeScript with a single generated browser module. Removed duplicate classification keys while preserving their previously effective values, and made empty/null indices report missing assignments instead of silently becoming zero.

- Added recessed perimeter window frames and lintels to five building families, plus open roof-edge collection channels, downpipes and wall brackets. These are visual construction details and do not add simulated drainage capacity.

### Rendering and Asset Lifecycle Repairs

- Use a lightweight branched whole-tree proxy at distance instead of switching detailed foliage to a solid crown block; retain a hysteresis band around the detail threshold.
- Avoid redundant instance-buffer uploads while retaining mandatory refreshes after asynchronous scanned-asset replacement.
- Coalesce concurrent requests for the same bundled model and prevent late requests from resurrecting disposed caches; cancelled requests remain retryable.
- Keep building-foundation bearing planes flat-shaded independently of retaining faces, and reject invalid placement dimensions/scales.

- Added bounded close-range whole-tree geometry with individual curved leaves, branching, bark relief and root flares. Distant trees retain lightweight bundled meshes; both representations share the same normalized placement envelope. Procedural detail is illustrative, not measured species anatomy.

### Asset Loading Repairs

- Resolve bundled model URLs relative to their module, not the active page, and allow manifest requests to recover after failure.
- Correct broadleaf/conifer selection, preserve source material colours, and fit complete tree models to grounded full-tree transforms without adding a second trunk.
- Keep bundled tree geometry consistent across camera distances rather than replacing a complete tree with a procedural canopy at the same transform.

### Added

- Detailed the facility models. An audit of the 21-kind library counted every primitive per kind and found seven that could not read as what they claim: four had no body or defining member at all — a house that was only a roof, a turbine blade that was a single lofted shell, a road that was a bare pavement plane, and a dome with a slit but no shutter and no telescope — and three had plenty of primitives but were missing the one that defines them, including an elevated water tank with no supports and a tunnel that was equal-section lining with no portal. Three new modules contribute the missing construction members through the library's own helpers, so they carry the same colour and construction response and pass through the same merge and normalisation: storey bands, terraces, cores, masts and entrances on the buildings; structural bays, dock doors, gantries, tank foundations, spiral stairs, tilted racks and blade root flanges on the industrial kinds; and crest parapets, gallery portals, gate gantries, stilling basins, tower legs and bracing, stadium vomitories and floodlights, truss bracing and road kerbs on the civil works. Also corrected: the observatory telescope pointed about 90 degrees away from its own slit and sat entirely inside the shell.
- Added the soluble carbonate lithology class the table was missing, so the class set can represent the rock type that matters most for karst. Limestone, dolomite, dolostone, chalk and marble now import to it instead of to generic competent bedrock, and the karst assessment can finally report a carbonate host rather than only a "soluble-looking" one. The class set is checked against the public reference global lithology model, GLiM v1.1, and its provenance is recorded in the table. Karst solubility is also decided by mineralogy rather than by a porosity threshold: the previous score weighed only porosity and bulk density and ranked a clay aquitard above limestone.
- Split weathered cover into soil and saprolite, which are different quantities and were sharing one calibrated number. A stable humid tropical slope reported 0.34 m of weathered profile instead of the tens of metres such a profile reaches, while that value was about right for the mobile soil layer. Cover retention now saturates on soil, because saprolite is weathered rock and does not hold a vegetation mat by itself, while the landform classification uses the whole profile — so gentle ground carrying metres of saprolite reads regolith-mantled rather than soil-mantled.
- Made the cave passages actually the derived ones. The skeleton computed from real bedding contacts was being discarded: the distance field, the geometry and the clipped void all still read the fixed outline, so the anchoring changed nothing on screen. One passage list now drives all three, and the cavity wall takes its tone and bedding from the host rock instead of one fixed ochre.
- Rebuilt facade envelopes for towers, courtyard residences, L-plan homes, industrial halls and civic buildings with actual window openings, recessed glazing, transoms and ground-floor entrances.
- Refined broadleaf surfaces with curved cross-sections and geometric vein relief, and added longitudinal branch detail. These remain procedural visual models, not measured botanical specimens.
- Added a strict TypeScript normal-depth solver for finite-width rectangular channels, with discharge residuals, dry-flow handling and explicit depth-limit diagnostics.
- Bundled one CC0 Poly Haven rock reference with photographed PBR textures, a Blender preparation script, and a full-canvas inspection view. Nearby terrain rocks can load the shared asset on demand; overview startup does not fetch it.
- Added detailed and distant reference meshes (12,416 and 2,730 triangles), embedded textures, source attribution, and asset lifecycle tests. This is a reference asset pipeline, not a replacement of every facility model.
- Added 13 locally generated organism models with a full-canvas specimen viewer: three fish forms, ray, octopus, jellyfish, crab, mussel, bat, fern, fungus, branching coral, and kelp.
- Added eight aquatic functional profiles with freshwater/marine separation, depth and salinity screening, water-site placement, and water-connected block migration.
- Added an adjustable illustrative karst cavity with connected passages, interior rock surfaces, speleothems, and cave-life exemplars. It does not infer caves from geological observations or alter groundwater calculations.

### Fixed

- Made the lithology table the single display source of truth. The subsurface volume, the geological section and the terrain surface each carried their own hand-copied lithology palette, and they had drifted apart. The table now holds the display tones the rendered application was tuned against, and both renderers derive from it, so a new lithology entry can no longer look different in two views.
- Stopped drawing loose ground as a jointed rock mass. Rock-mass joint spacing was being applied to soil, weathered cover and alluvium as well, which gave them wider "joints" than competent bedrock and made the weakest materials render as the largest blocks. Unconsolidated material now carries an aggregate scale instead, and the shader distinguishes the two scales explicitly, so bedding and blocky joints appear only on actual rock.
- Corrected the surface rock and scree apportioning. Deep weathered cover now suppresses bare rock instead of failing to, a channel cell is no longer treated as a bare rock face, and scree competes with vegetation for depositing ground rather than being cancelled wherever rock appears. On a flat, soil-mantled scenario this removes a spurious 81 percent bare-rock reading. An unresolved lithology code is also reported as one the table can colour, rather than as an id no consumer can resolve.
- Anchored the illustrative karst cave to real bedding contacts. Passage conduits are built from the column's own layer boundaries — one per soluble host bed at that bed's contact depth, a vadose shaft from the top contact and a phreatic outlet along the host base — with conduit reach scaling with the host's joint spacing. A column with no soluble-looking host yields no plan and the volume view keeps its generic cavity. It infers no cave from observations and changes no groundwater calculation.
- Draws subsurface lamination at the modelled bed thickness. The strata shader banded at a fixed period of about 1.6 m while modelled beds are 20 m and thicker, and the surface shader already banded at one cycle per bed. The subsurface now uses the same thickness-weighted harmonic mean the surface does, so the section view and the surface agree about bed thickness. A model with no subsurface keeps its previous period.
- Places outcrop and scree detail from rock mass strength. Block size now follows the joint spacing and the slope a mass needs before it sheds anything follows its strength, replacing fixed 28 and 18 degree thresholds and a hashed size unrelated to the rock.
- Grounded individual building envelopes using 25 samples over their rotated footprint, with level foundation tops and terrain-following skirts. Building-specific attachments move with their envelope; terrain and hydrological arrays remain unchanged. This does not yet reconstruct road connections or shoreline transitions.
- Removed a fixed 12-metre vegetation placement lift and sampled terrain elevation at the displaced planting position.
- Hid infrastructure diagnostic envelopes, pressure beacons and ecological role markers in the natural landscape view while retaining them in analytical views.
- Removed independent channel depth/velocity clipping that broke discharge consistency; channel shear stress now uses hydraulic radius rather than water depth. Reported slope regularization and supercritical conditions remain limitations of the uniform-flow approximation.
- Replaced the sky's cloud field so it no longer shimmers while the camera turns. Cloud coordinates now come from a view-direction dome folded into a bounded ring by `r/(1+0.3r)`, a map that is linear to first order, monotone, never stretching, and bounded in the far field, instead of a projected ray. Each octave is now faded by an analytic footprint derived from the view ray and split into the fold's angular and radial parts, rather than by screen derivatives of the projected coordinate whose per-pixel rate swings by orders of magnitude across one frame. Measured against a supersampled reference, cloud aliasing over a slow pan fell by 2.3x to 2.5x at the horizon and 2.3x across the sun disc, and frame-to-frame shimmer fell by about 2x. The sky shader now lives in `src/skyEnvironment.js` with its own tests.
- Grounded scanned rocks using their actual thickness and the local terrain normal, preventing the previous block-shaped placement offset from leaving thin scans suspended above slopes. Cached placement transforms are reused during camera motion.
- Removed the map-size-dependent minimum orbit distance that prevented close inspection on large maps. Terrain collision correction remains enabled.
- Supplied neutral vertex colors for unpainted procedural and fallback geometry, preventing black instanced objects when vertex-color materials are enabled.
- Grounded surface details at their displaced terrain positions and bounded their display dimensions instead of scaling them indefinitely with regional grid cells.
- Kept accidental underground camera correction at the same map location instead of retreating along the viewing ray to a distant boundary.
- Rejected malformed water grids, non-finite inputs, and out-of-range river endpoints; excluded aquatic sites with invalid channel dimensions.
- Updated the desktop build's indirect `js-yaml` dependency to 4.3.2 to address [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh).
- Removed checkerboard underground presentation by reconstructing continuous display colors and filtering rock detail; categorical scientific layers remain unchanged.
- Closed cave branch endpoints, bounded cavity size in shallow columns, and shared the cavity field between clipping, mesh extraction, and camera access.
- Deferred nearby coral and kelp geometry until underwater entry; regional overviews no longer preload or draw meter-scale benthic models.
- Cleared residual orbit inertia when switching volume views and focused underwater inspection on compatible seabed sites.
- Stabilized the sky during camera rotation with a full-screen background, current-frame camera rays, and filtered cloud detail.
- Prevented the camera from entering opaque terrain and exposing culled interior faces; geological cutaways and water remain navigable.
- Added geological inspection lighting and a lighter unclassified base color so underground faces remain visible from below.

### Added

- Gave every wildlife species a real body, and added the first human figure. The catalogue defines 44 species across 22 geometry classes but the anatomy library only carried meshes for the 8 aquatic ones, so the remaining 36 species fell back to assembling a body from generic parts: a red deer, a moose and a zebra were drawn from the same torso and leg pieces. Fourteen terrestrial classes now have anatomies, each split into the morphotypes that are genuinely different animals rather than one rescaled quadruped — the ungulates are a deer, a moose and a zebra, the birds a long-legged wader, a soaring raptor and a flightless penguin, the pachyderms an elephant with a ringed trunk and tusks, a giraffe whose neck is a substantial share of its height, and a bison with a shoulder hump and shaggy skirt, and the semi-aquatic class an otter, a rodent with a broad flat paddle tail, and a pinniped with swept flippers rather than legs. Species assets now resolve 44 of 44, up from 8. The morphotype is a property of the species rather than of where an individual stands, because the renderer's generic rule derives an instance variant from its position, which for an animal would draw one species as a deer in one place and a moose in another and change which animal it is as the herd moves. `humanAnatomy` is the first human geometry in the repository, in standing, walking and seated poses; a figure drawn at regional scale is a stand-in for people and not a depiction of any individual or group, and the proportions are a generic adult morphotype rather than anthropometric measurements.
- Added a human presence layer, the model's first human representation. "Population estimate" in the interface is a wildlife figure, and the built environment previously reported only damage and resilience indices. The layer publishes the built-up land area measured from the model's own cover and infrastructure layers, a relative density index normalised to the region's own mean, and the settlement patches those form with a size class. It deliberately does not publish a head count: absolute population is not knowable from terrain, land cover and infrastructure without a census or a gridded population product, neither of which the repository consumes, so `absolutePopulation` stays null unless a scenario supplies a real density and the field names record which basis they are on.

### Changed

- Gave the subsurface lateral thickness variation instead of one layer stack for a whole region. The volume stores a single reference depth-edge array and every column was read against it, so a 128 km region gave all 4096 columns identical layer boundaries: measured, one distinct boundary set, one top-layer thickness and one joint spacing across the whole area, while the surface derivation claimed its joint spacing came from each column's own bed thickness. The variation now comes from the per-column sediment thickness the model already computes — `columnBedrockDepthM`, derived from root depth, valley fill, slope, complexity and terrain noise, which `inferSubsurfaceLithology` already uses to place the sediment-bedrock contact and which holds 10880 distinct values on a default model. The factor is the column's thickness over the region median, so it is centred on the neutral value and produces both thicker and thinner columns, and it is exactly neutral for a model with no bedrock-depth field rather than silently thinning one. The absolute thickness of the package is still not claimed: that remains the scenario's own depth. The exposed section face and the 3-D voxel slabs place each column at that column's own interfaces, so the display, the stratigraphic profile and the cave anchoring read one geometry and an anchored cave can no longer render in a differently banded slice. The exported layers stay on the reference geometry on purpose: the stored voxel arrays and the cube-coordinate and column CSV exports publish one depth range per layer, which is a reference-depth contract, and the reference array is never rewritten. An earlier attempt that derived the variation from the surface elevation rank was withdrawn after review: it thinned every column by 7.9 percent even on perfectly flat terrain, scaled the bedrock layers below the sediment contact, and was quadratic in the number of columns.
- Cleared the remaining hardcoded geological constants found by the audit. Rock clast shape now follows joint sets and bed thickness instead of a fixed five-plane cut, so a thick massive unit yields blocky clasts and a thinly bedded one yields flat slabs, and its weathering bands are drawn at the real bed thickness. The surface shader's block flattening is now bed thickness against joint spacing rather than a constant. The geomorphology presets draw one band per bed at a declared real bed thickness instead of a fixed count over an arbitrary elevation range. And a saturated voxel's darkening now scales with its porosity, so a saturated gravel changes appearance far more than a saturated granite.
- Derived the terrain's rock and weathered-cover appearance from the underlying lithology instead of one slope/cover/wetness heuristic. Rock mass strength, joint spacing, regolith thickness and a landform class now come from the model's own porosity, permeability and dry density, following published rock-mechanics and geomorphology relations recorded in `src/geoLithology.js`. Joint spacing scales with bed thickness, columnar spacing with cooling-unit thickness, and weathered cover with the balance between weathering production and slope-driven removal, so bare rock, scree, soil and vegetation are apportioned by process rather than by one tuned curve. Scenarios without a subsurface model keep the previous proxy.
- Taught the terrain surface shader the real joint and bed spacings through a new packed `terrainStructure` vertex attribute, replacing fixed procedural cell and bedding wavelengths. A sparsely jointed competent rock and a closely fractured weak one no longer share one cell size, and bedding banding follows the actual bed thickness. Weathered cover and scree are also drawn toward the lithology's own colour.
- Rebuilt river meshes around shared reach sections and separate confluence mouths with triangulated junction patches. Deduplicated display links, screened cycle-affected components, preserved modeled receiver directions and removed the renderer's cell-width clamp.
- Made water animation continuous along network coordinates and preserved inclined surface normals. Reduced high-contrast turf/soil mottling and increased shallow-river surface visibility.
- Conditioned exposed rock and scree display density on vegetation, wetness proxies, sealed ground and active channels. Erosion/deposition diagnostics also affect mineral exposure; these are visual rules, not observed lithology or sediment deposition geometry.
- Rebuilt 21 facility bodies and components with indexed construction geometry, including fitted glazing and reveals, hipped roofs, tank inspection ladders, dam buttresses, terraced stands, and open tunnel/gallery linings. Existing facility placement and simulation inputs are unchanged.
- Added classified construction finishes and removed generic facade/roof overlays from rebuilt building envelopes. Seventeen legacy geometry factories now delegate to the new implementation.
- Refined river ribbons across and along the channel, added depth-dependent transparency and velocity-directed surface animation, and filtered small ripples by screen footprint. Animation is illustrative, not a new fluid solver.
- Added near-view geological lamination and mineral grain, damp soil pore shading, and mineral-dependent terrain roughness. Tunnel and metro types use open entrance/gallery assemblies; they do not excavate a traversable underground network.
- Refined near-view foliage with curved leaf surfaces, raised midribs, tapered edges, and bark shading. Ultra and exhaustive settings retain up to 256 and 384 detailed trees per variant batch, respectively.
- Added filtered soil aggregates, mineral micrograin, and seabed sand detail down to a 2 mm procedural wavelength. These are illustrative shading layers, not additional terrain measurements or collision geometry. This update targets desktop rendering; mobile adaptation is paused.
- Rebuilt rock and scree surfaces with joint planes, mineral banding, and size variation; replaced snow's raised strip assemblies with a continuous wind-shaped surface.
- Consolidated sea and river visibility into one control and removed duplicate river/wetness patches from the surface-detail layer. Renamed the geological diagnostic overlay to distinguish it from the section view.
- Moved aquatic sea-connectivity traversal and river-node classification to Rust with a binary WebAssembly interface, used by the model Worker in browser and desktop runtimes up to 4096 x 4096 cells.
- Migrated aquatic habitat contracts and fallback logic to strict TypeScript. Added active-backend diagnostics, legacy-result parity tests, block/wildlife comparisons, and allocation-lifetime checks.
- Replaced bright river lines with hydraulic-width water ribbons and curved display centerlines. Routing data is unchanged; sub-grid curves are not surveyed bathymetry.
- Closed terrain into a solid display block with elevation-following sides, modeled underground layers, a base, and a movable geological section. Underground display exaggeration is independent of scientific depth.
- Added a local sky environment, sea-level water surfaces and boundary walls, seabed shading, and an underwater camera with depth-dependent fog.
- Clipped above-ground objects with geological sections, excluded hidden terrain from double-click focus, and fitted the overview to narrow viewports.
- Kept volume-view controls independent of scientific rebuilds and shared terrain geometry with sea surfaces to avoid duplicating grid buffers.
- Added a natural-surface view with locally generated rock joints, strata, soil grain, vegetation mottling, and wetness-dependent roughness; analytical palettes remain separate.
- Filtered subpixel terrain detail by viewing footprint and packed surface weights into four bytes per vertex, without additional mesh subdivisions or texture downloads.
- Matched terrain normals across tile boundaries and refreshed neighboring normals and culling bounds after height edits.
- Rebuilt broadleaf and conifer crowns with branched stems, folded leaves, and per-vertex foliage tones. These are procedural visual assets, not measured tree architecture.
- Added screen-size foliage LOD with shared distant meshes and a 128-instance close-detail limit per species variant batch.
- Preserved indices, UVs, and colors when combining procedural model parts, reducing repeated vertices and reconstructing smooth normals after deformation.
- Replaced transparent crown shells with opaque, double-sided leaves to resolve overlapping-canopy depth ordering.
- Reorganized the public documentation around project goals, functional systems, scale, computation, data, and validation boundaries.
- Replaced the outdated preview with current local Electron captures and a compact animated overview.
- Condensed historical release notes to user-visible and compatibility-relevant changes.

## [0.6.0] - 2026-09-04

### Added

- TypeScript contracts for 3D detail budgets, material classes, geometry variants, and diagnostics.
- Automated canvas-pixel checks for the Electron smoke test.

### Changed

- Added multiple deterministic forms for vegetation, terrain details, buildings, facilities, and wildlife.
- Applied separate mineral, organic, water, glass, metal, masonry, wildlife, and technical materials.
- Increased detail budgets for the three rendering quality levels while retaining grid-aware instance limits.

### Fixed

- Reduced repeated silhouettes across nearby procedural objects.
- Corrected depth writing for transparent water, glass, and vegetation surfaces.
- Prevented transient blank frames from passing desktop smoke verification.

## [0.5.1] - 2026-09-03

### Added

- Recoverable TypeScript clients for model and Rust WebAssembly workers.
- Failure and lifecycle tests for worker crashes, cancellation, malformed messages, and transient loading errors.

### Fixed

- Restored model generation after worker failures instead of leaving later requests unresponsive.
- Allowed Rust WebAssembly transport recovery after errors and timeouts.
- Prevented normal page shutdown from starting a fallback rebuild.
- Updated affected npm dependencies and added a high-severity audit to CI.

## [0.5.0] - 2026-08-13

### Added

- Rust output for terrain, slope, MFD routing, contributing area, discharge, evapotranspiration, runoff, retention, recharge, storage change, and residual layers.
- Two-phase validation and atomic working-layer commits for grids up to 512 x 512.
- JS/Rust comparison metrics and rollback tests.

### Changed

- Moved model-worker orchestration to TypeScript.
- Rebuilt rivers, hydraulics, groundwater, hazards, infrastructure, ecology, wildlife, statistics, and 3D state after successful Rust commits.

### Fixed

- Preserved managed runoff retention across the browser-to-Rust boundary.
- Used validated graph topology when rebuilding downstream systems.
- Included Rust execution in the displayed model runtime.

## [0.4.0] - 2026-08-13

### Added

- `geolab-wasm`, using the shared Rust core in static-browser mode.
- A dedicated Rust worker, validated memory ABI, TypeScript transport contracts, and cross-runtime tests.

### Changed

- Unified native and WebAssembly capability declarations in `geolab-core`.
- Expanded local builds and CI to cover TypeScript, native Rust, WebAssembly, and ABI execution.

### Fixed

- Enabled Rust verification without a native HTTP service.
- Added WebAssembly MIME handling to the local Electron server.

## [0.3.0] - 2026-08-13

### Added

- Freeman-style MFD routing with sparse fractions, topological accumulation, and D8 compatibility.
- Time-stepped groundwater storage, baseflow, overflow, and mass accounting.
- Sediment detachment, transport capacity, deposition, export, and a separate sediment ledger.
- Habitat suitability, patch accounting, resistance connectivity, barriers, and bottleneck diagnostics.
- Twelve independent process gates and deterministic process tests.

### Changed

- Expanded browser and desktop verification to include routing, groundwater, sediment, habitat, and declared simulation periods.

### Fixed

- Separated period discharge from annualized discharge.
- Preserved explicit zero groundwater storage.
- Corrected subsurface resampling and sediment routing inputs.
- Normalized insignificant floating-point closure noise.

## [0.2.0] - 2026-08-13

### Added

- Rust workspace with typed scenarios, validation, depression filling, slope, routing, hydroclimate partitioning, and process gates.
- Loopback-only Axum service with bounded requests, concurrency, cell counts, and execution time.
- Cross-system coupling ledger and Unity/Unreal terrain interchange packages.
- Ecological blocks, species niches, carrying capacity, trophic support, integrity diagnostics, and wildlife release screening.
- Scenario synthesis, evidence coverage, provenance, local selection focus, and lifecycle diagnostics.

### Changed

- Adopted FAO-56-structured reference evapotranspiration and an NRCS curve-number runoff constraint.
- Separated requested, supplied, and unmet infrastructure water demand.
- Corrected cell support area for volume accounting.
- Rebalanced the displayed proportions of vegetation, wildlife, and built assets.

### Fixed

- Corrected local retention so it applies to generated local runoff before routing.
- Removed unsupported infrastructure storage from annual water supply.
- Added independent water-closure and MFD receiver checks.
- Corrected engine row order, origins, English file controls, drawer focus, cleanup, and startup reporting.

## [0.1.0] - 2026-08-11

### Added

- English and Simplified Chinese interfaces.
- Local Three.js and Electron runtime.
- Initial terrain, climate, hydrology, ecology, infrastructure, import, and export workflows.

### Status

- Established the teaching and exploratory prototype baseline without predictive-performance claims.

[Unreleased]: https://github.com/laiyukai910-star/geolab-128/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/laiyukai910-star/geolab-128/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/laiyukai910-star/geolab-128/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/laiyukai910-star/geolab-128/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/laiyukai910-star/geolab-128/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/laiyukai910-star/geolab-128/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/laiyukai910-star/geolab-128/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/laiyukai910-star/geolab-128/releases/tag/v0.1.0
