# GeoLab 128 Browser Application

This directory contains the English-first browser authoring environment, the exploratory simulation engine, the Three.js renderer, local data adapters, export workflows, and the typed bridge to the shared Rust kernel. The interface also includes a Simplified Chinese locale.

For the public project overview, start with the repository [README](../../README.md). The independent computation contract is documented in the [Rust engine guide](../../engine/README.md).

## Run

The recommended development entry point is the desktop runtime:

```powershell
cd outputs/geo-sim-desktop
npm ci
npm start
```

`npm start` type-checks and builds the browser bridge, compiles native and WASM Rust kernels, refreshes local dependencies, and launches Electron. The application, Three.js runtime, GeoTIFF reader, and computation paths are local. Network access is only used by source-planning or source-checking workflows that the user explicitly starts.

For browser-only development:

```powershell
cd outputs/geo-sim
python -m http.server 5179 --bind 127.0.0.1
```

Open <http://127.0.0.1:5179/>. The bundled Rust WASM Worker is used automatically. To override it with a manually started native Rust service, append `?backend=http://127.0.0.1:48129`.

## Application Structure

| Path | Role |
| --- | --- |
| `index.html` | Drawer-based application shell and controls. |
| `src/main.js` | UI state, simulation lifecycle, inspection, reporting, and export commands. |
| `src/geoEngine.js` | Browser terrain, climate, hydrology, subsurface, ecology, infrastructure, time, and hazard model. |
| `src/terrainRenderer.js` | Three.js terrain, water, vegetation, wildlife, infrastructure, wind, hazard, and subsurface rendering. |
| `src-ts/backendClient.ts` | Strict scenario types, bounded resampling, native/WASM selection, request control, and comparison reporting. |
| `src-ts/wasmAbi.ts` | Validated Rust WASM memory ABI and JSON envelope decoding. |
| `src-ts/rustKernelWorker.ts` | Off-main-thread Rust kernel loading and execution. |
| `src/backendClient.js`, `src/wasmAbi.js`, `src/rustKernelWorker.js` | Generated browser modules; edit the TypeScript sources instead. |
| `src/dataAdapters.js` | GeoTIFF, CSV, JSON, and GeoJSON parsing, unit normalization, bounds interpretation, and provenance. |
| `src/physicalCoupling.js` | Cross-system conservation gates and directional coupling ledger. |
| `src/landscapeEcology.js` | Habitat blocks, ecological connectivity, biodiversity, carrying capacity, and release screening. |
| `src/engineInterop.js` | Unity Terrain and Unreal Landscape interchange packages. |
| `tests/` | Deterministic model, ecology, backend-contract, coupling, and export tests. |

## Scenario Authoring

The browser engine supports:

- 4-512 km square study areas and terrain grids from 128 x 128 through 4096 x 4096;
- procedural continental forms, ridges, basins, shelves, local terrain brushes, and elevations up to 10,000 m;
- wind exposure, orographic response, rain shadow, temperature lapse, climate classification, and FAO-56-structured reference ET;
- Priority-Flood drainage, D8, MFD, and D-infinity routing options, flowline constraints, river extraction, water partitioning, hydraulic diagnostics, and watershed tracing;
- layered subsurface volumes, groundwater state, borehole support, cross-sections, solid/pore/water volume ledgers, and engineering-risk screening;
- ecological blocks, resistance and functional connectivity, habitat capacity, trophic biomass, biodiversity diagnostics, wildlife agents, and screened batch releases;
- area-first infrastructure placement with typology-specific suitability, building morphology, imperviousness, demand, storage, retention, heat, habitat, and neighboring-block feedback;
- multi-year vegetation, water, erosion, compound hazard, damage, and recovery scenarios;
- source coverage, provenance, calibration, uncertainty, process gates, and interpretation boundaries.

The Rust verification core independently resamples the current scenario to a bounded audit grid and recomputes terrain routing, period water balance, time-stepped groundwater storage and baseflow, transport-limited sediment accounting, and resistance-weighted habitat connectivity. Electron uses a native Rust process; the static application executes the same crate as WASM in a Worker. The UI exposes gate counts and separate water, groundwater, and sediment residuals; the complete request and report can be exported as JSON.

## Data Inputs

Supported local inputs include:

- DEM GeoTIFF, CSV, or JSON;
- hydrologic soil group, saturated conductivity, available water capacity, and root depth;
- land cover, vegetation fraction, canopy height, leaf-area index, and imperviousness;
- gridded or time-series precipitation, temperature, wind speed, and wind direction;
- flowline, infrastructure, manual surface/climate patch, and subsurface observation GeoJSON;
- discharge calibration metadata and dated observations.

Raster adapters preserve source bounds, units, scale/offset metadata, NoData coverage, fill operations, and resampling method. Categorical layers use majority behavior where appropriate; continuous layers use window averaging when downsampled; wind direction uses circular averaging. Imported evidence remains distinguishable from modeled or gap-filled support.

## Exports

The export drawer provides scenario settings, model summaries, grid CSV, rivers and watersheds, ecological and wildlife reports, subsurface ledgers and transects, physical-coupling gates, Rust verification, uncertainty, time progression, local refinement tiles, and engine packages.

Unity packages contain supported `2^n+1` little-endian RAW heightfields, TGA masks, local ENU vectors, manifests, and import guidance. Unreal packages contain recommended Landscape R16 heightfields, R8 masks, RAW sidecars, scale/origin metadata, manifests, and guidance. These are transparent terrain interchange assets, not finished game-engine levels.

## Interpretation Boundary

GeoLab 128 is a teaching and exploratory prototype under active validation development. Procedural terrain is not surveyed terrain. Browser and Rust outputs are not calibrated weather, flood, groundwater, sediment, habitat, structural, or engineering forecasts. Real decisions require quality-controlled sources, a scale-appropriate model, calibration and validation data, uncertainty analysis, and qualified domain review.
