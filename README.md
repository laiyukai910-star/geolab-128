# GeoLab 128

![GeoLab 128 preview](outputs/geo-sim/preview.png)

> Build a regional scenario, change its terrain and boundary conditions, and trace the consequences through water, ecosystems, the subsurface, infrastructure, and a live 3D scene.

[![CI](https://github.com/laiyukai910-star/geolab-128/actions/workflows/ci.yml/badge.svg)](https://github.com/laiyukai910-star/geolab-128/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/github/v/tag/laiyukai910-star/geolab-128?label=version)](https://github.com/laiyukai910-star/geolab-128/tags)

GeoLab 128 is an interactive geographic systems laboratory for exploring how a region behaves as a connected whole. Raise a ridge and the wind exposure changes. Change rainfall or vegetation and the water partition shifts. Add roads, housing, reservoirs, or utilities and the model updates runoff, heat, habitat, service demand, and local suitability together.

The application combines an interactive browser authoring engine with one Rust computation core delivered through two transports. Electron uses a native loopback sidecar; static-browser mode loads the same `geolab-core` algorithms as bundled WebAssembly in the model Worker. For working grids up to 512 x 512, Rust can atomically commit terrain, MFD routing, contributing area, discharge, evapotranspiration, runoff, managed retention, recharge, storage, and residual layers back into the live model before rivers, hazards, subsurface state, ecology, statistics, and Three.js geometry are rebuilt.

## What You Can Explore

| Workspace | What changes together |
| --- | --- |
| Terrain and landforms | Continental templates, ridges, basins, valleys, local terrain editing, elevation up to 10,000 m, slope, aspect, exposure, roughness, and drainage structure. |
| Climate and wind | Temperature, humidity, latitude, lapse rate, wind speed and direction, terrain exposure, rain shadow, precipitation response, and reference evapotranspiration. |
| Water and geomorphology | Priority-Flood depression handling, D8/MFD/D∞ routing, runoff, recharge, soil storage, discharge, river extraction, stream power, erosion, deposition, and screening-level hazards. |
| Ecology and wildlife | Climate-consistent habitat blocks, functional connectivity, carrying capacity, trophic support, biodiversity diagnostics, migration links, and screened batch releases. |
| Subsurface | Layered geology, soil columns, groundwater state, aquifer potential, transects, solid volumes, and exportable voxel/cube ledgers. |
| Built environment | Select an area, place infrastructure, and let suitability, terrain, water, vegetation, service demand, impervious cover, retention, and neighboring blocks constrain the result. |
| Time and hazards | Multi-year vegetation and water response, seasonal state, drought, flood, wildfire, slope instability, compound events, recovery, and resilience summaries. |
| Evidence and exports | DEM, land cover, soils, weather, flowlines, facilities, boreholes, calibration inputs, provenance audits, uncertainty reports, GeoJSON/CSV, and engine-ready terrain packages. |

Study areas range from 4 km to 512 km per side. Interactive terrain options extend to 4096 x 4096 samples, while local refinement, ecological blocks, networks, footprints, transects, subsurface solids, and agents provide additional representations where one raster is not enough. Phase-two atomic Rust commits are capped at 512 x 512; larger working grids retain the browser candidate model and bounded Rust audit until a globally conservative binary tile protocol is available.

## A Coupled Scenario

1. Choose an extent, terrain form, climate boundary, soil behavior, and time horizon.
2. Edit the surface or select an area for infrastructure and ecological intervention.
3. Run the model to resolve wind exposure, water partitioning, flow paths, erosion pressure, habitat state, subsurface response, and facility feedback.
4. Inspect the same state as a 3D landscape, analysis layer, cell record, ecological network, cross-section, volume ledger, or scenario synthesis.
5. Inspect the gated Rust working-layer commit and independent audit, then export both the result and the assumptions that produced it.

The aim is not a single opaque score. GeoLab keeps weak links visible through separate process gates, coupling scores, evidence coverage, source records, and uncertainty notes.

## Coupled Computation Architecture

```mermaid
flowchart LR
    A["Scenario authoring"] --> B["Browser simulation engine"]
    B --> D["Typed full-resolution candidate"]
    D --> E{"Local runtime"}
    E -->|"Electron"| F["Native Rust sidecar"]
    E -->|"Static browser"| G["Rust WASM Worker"]
    F --> H["Shared geolab-core"]
    G --> H
    H --> I["Typed validation"]
    I --> J["Priority-Flood and MFD routing"]
    J --> K["Water, retention, groundwater, sediment and habitat"]
    K --> L["Independent process gates"]
    L --> N{"Atomic commit eligible"}
    N -->|"yes"| O["Commit 13 working layers"]
    N -->|"no"| P["Preserve browser candidate"]
    O --> C["Rebuild dependent systems and 3D scene"]
    P --> C
    C --> M["Reports, data and engine exports"]
```

The Rust workspace provides:

- a typed scenario contract with finite-value, range, unit, shape, and request-size validation;
- separate point spacing and cell support area, preventing resolution-dependent area inflation;
- Priority-Flood depression resolution, Horn slope, compatible D8 routing, Freeman-style MFD fractions, sparse flow targets, and topological area/flux accumulation;
- FAO-56 Penman-Monteith structured reference ET and an NRCS curve-number event-response constraint;
- period-scaled allocation across demand, actual ET, runoff, groundwater recharge, soil-storage change, and unresolved residual;
- a time-stepped groundwater reservoir that reports initial and final storage, baseflow, overflow, inferred water-table depth, and an independent mass residual;
- RUSLE-structured gross detachment followed by transport-capacity-limited deposition and export with a separate sediment ledger;
- climate, moisture, slope, vegetation, imperviousness, and barrier-constrained habitat patches with resistance-weighted connectivity and bottleneck diagnostics;
- thirteen independent gates covering water, routing fractions, outlet area, managed runoff retention, groundwater, sediment, habitat accounting, bounded ecology, and finite numerics;
- a loopback-only Axum API with bounded payloads, bounded concurrency, execution timeout, versioned endpoints, and deterministic reports;
- a dependency-free WebAssembly ABI, off-main-thread Worker transport, and an end-to-end ABI test that executes a real scenario in Node.

The desktop application starts and stops the native service automatically. Static-browser mode loads the bundled Rust WASM core automatically; a manually started native service remains an optional override.

### Language boundary

Migration is capability-driven rather than a file-extension exercise. Numerically sensitive, deterministic, and conservation-checked work moves to Rust first. Browser-to-core schemas, the queued model Worker, two-phase commit validation, rollback, and asynchronous orchestration live in strict TypeScript. Three.js rendering and stable UI modules remain JavaScript until their contracts are isolated and covered, then migrate incrementally. Generated files under `outputs/geo-sim/src/` are browser artifacts; their reviewed sources live under `outputs/geo-sim/src-ts/`.

## 3D And Engine Workflows

The Three.js scene visualizes terrain, river networks, vegetation, infrastructure, wildlife, ecological blocks, wind, and subsurface cutaways. It is a working analysis view: layer changes, selected regions, simulation time, and modeled interventions update the scene rather than living in a separate preview.

The export drawer creates self-contained packages for production engines:

| Target | Terrain data | Additional context |
| --- | --- | --- |
| Unity Terrain | Little-endian 16-bit RAW at supported `2^n+1` resolutions | TGA surface masks, ENU vectors, terrain origin and size, elevation mapping, provenance, and physical-gate report. |
| Unreal Landscape | Little-endian 16-bit R16 at recommended Landscape dimensions | R8 weight layers, RAW sidecar, calculated XY/Z scale, actor elevation, ENU vectors, provenance, and physical-gate report. |

These are transparent interchange assets, not prebuilt game levels. Their manifests state axis mapping, row order, units, local extent, geographic anchor, and unresolved production responsibilities.

## Quick Start

### Desktop application

Install current Node.js, npm, and the pinned Rust toolchain, then run:

```powershell
cd outputs/geo-sim-desktop
npm ci
npm start
```

`npm start` type-builds the browser bridge, compiles Rust to both native and WebAssembly targets, refreshes local vendor assets, and launches Electron. The application, both Rust transports, Three.js runtime, and GeoTIFF reader remain local.

### Static browser mode

```powershell
cd outputs/geo-sim
python -m http.server 4174
```

Open <http://127.0.0.1:4174/>. The interface defaults to English, includes a Simplified Chinese switch, and runs Rust verification through the bundled WASM Worker.

### Rust service

```powershell
cargo run --release --manifest-path engine/Cargo.toml --package geolab-server -- --port 48129
```

The local API exposes:

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Runtime and API-version readiness. |
| `GET /v1/capabilities` | Grid limits, processes, routing mode, and output layers. |
| `POST /v1/validate` | Validate a typed scenario without running it. |
| `POST /v1/simulate` | Run terrain, routing, water, groundwater, sediment, habitat, and process gates. |

Append `?backend=http://127.0.0.1:48129` to the static application URL to attach a manually started service. The complete contract is documented in [engine/README.md](engine/README.md).

## Method And Validation Boundary

Model structure is informed by [FAO Irrigation and Drainage Paper 56](https://www.fao.org/4/X0490E/x0490e00.htm), the [USDA NRCS direct-runoff handbook](https://directives.nrcs.usda.gov/sites/default/files2/1754923466/Subpart%20H%20%E2%80%93%20Estimation%20of%20Direct%20Runoff%20from%20Storm%20Rainfall.pdf), [Freeman's multiple-flow-direction formulation](https://doi.org/10.1016/0098-3004(91)90048-I), the [USGS PRMS groundwater reservoir](https://pubs.usgs.gov/of/2002/ofr02362/htdocs/gwflow/gwflow_prms_min.htm), [USDA RUSLE2 process documentation](https://www.ars.usda.gov/southeast-area/oxford-ms/national-sedimentation-laboratory/watershed-physical-processes-research/research/rusle2/revised-universal-soil-loss-equation-2-how-rusle2-computes-rill-and-interrill-erosion/), [McRae's isolation-by-resistance framework](https://doi.org/10.1111/j.0014-3820.2006.tb00500.x), [UNCCD aridity definitions](https://www.unccd.int/sites/default/files/sessions/documents/ICCD_CRIC6_3_Add.1/3add1eng.pdf), and [USGS stream-power guidance](https://pubs.usgs.gov/publication/sir20235145/full). Engine exports follow [Unity Terrain heightmap constraints](https://docs.unity3d.com/6000.0/Documentation/ScriptReference/TerrainData-heightmapResolution.html) and [Unreal Landscape technical guidance](https://dev.epicgames.com/documentation/unreal-engine/landscape-technical-guide-in-unreal-engine?lang=en-US).

GeoLab 128 is a teaching and exploratory prototype under active validation development. It is not a calibrated weather, flood, groundwater, erosion, ecosystem, or engineering forecast. Procedural terrain is not surveyed terrain; derived meteorological forcing is not station data; D8/MFD/D∞ routing is not a two-dimensional hydraulic solver; the Rust groundwater, sediment, and habitat modules are bounded screening formulations, not complete replicas of PRMS, RUSLE2, or Circuitscape. Use quality-controlled inputs, calibration, uncertainty analysis, and qualified domain review before applying any workflow to a real decision.

## Repository

| Path | Role |
| --- | --- |
| `engine/geolab-core/` | Rust terrain, hydroclimate, routing, conservation, and gate library. |
| `engine/geolab-server/` | Bounded local Axum service used by the desktop application. |
| `engine/geolab-wasm/` | Minimal browser ABI for the shared Rust core. |
| `outputs/geo-sim/` | Browser application, strict TypeScript kernel bridge and atomic commit layer, exploratory authoring engine, Three.js renderer, adapters, and exports. |
| `outputs/geo-sim-desktop/` | Electron runtime, native/WASM build orchestration, Rust sidecar lifecycle, and local packaging. |
| `outputs/geo-sim/tests/` | Deterministic client, model, ecology, reporting, and interchange tests. |
| `.github/workflows/ci.yml` | Rust, WebAssembly, TypeScript, JavaScript, and cross-runtime integrity pipeline. |

Contributions are welcome through [CONTRIBUTING.md](CONTRIBUTING.md). Release history is maintained in the single root [CHANGELOG.md](CHANGELOG.md). GeoLab 128 is available under the [MIT License](LICENSE).
