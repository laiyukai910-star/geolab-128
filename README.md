# GeoLab 128

[![CI](https://github.com/laiyukai910-star/geolab-128/actions/workflows/ci.yml/badge.svg)](https://github.com/laiyukai910-star/geolab-128/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-2f855a.svg)](LICENSE)
[![Version](https://img.shields.io/github/v/tag/laiyukai910-star/geolab-128?label=release)](https://github.com/laiyukai910-star/geolab-128/releases)

![Generated 32 km canyon reference terrain in GeoLab 128](media/workspace-terrain.jpg)

GeoLab 128 builds a 3D map of a square region. Set the map size and grid, generate terrain or
import elevation data, then change the weather, rivers, land cover and facilities. The map can be
viewed as terrain, a geological section or a solid block. Calculated layers and reports can be
exported for inspection outside the app.

This is a teaching and exploratory project. Its maps are not surveyed terrain and its hazard
results are not site-specific forecasts.

## Contents

- [Features](#features)
- [Feature Gallery](#feature-gallery)
- [Example Workflow](#example-workflow)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Scientific Scope](#scientific-scope)
- [Repository Map](#repository-map)

## Features

- **Map:** Choose a 4-512 km square area and a 128²-4096² grid. Start with a continental or
  landform preset, or import a DEM. Change relief, uplift and sea level; compare elevation,
  slope, curvature and roughness maps. The default 128 km / 256² grid has about 502 m between
  samples.
- **Weather:** Set temperature, precipitation, humidity and wind, or import meteorological data.
  View temperature, rainfall, wind, evapotranspiration and water-balance layers.
- **Rivers:** Change the channel threshold and hydrological settings. Inspect flow accumulation,
  watersheds, runoff, discharge, erosion and deposition. Soil data, bathymetry and flow lines can
  be imported.
- **Underground:** Import lithology and groundwater-depth data. Inspect strata, geological
  sections, aquifer indicators, stress and confidence. The cave view is illustrative geometry;
  it does not solve cave flow.
- **Ecology:** Edit land-cover patches, vegetation and habitat settings. View canopy, biomass,
  habitat and connectivity layers. Configure wildlife releases and inspect freshwater and marine
  habitat separately.
- **Facilities:** Select an area and place housing, transport, public-service, industrial,
  energy or water facilities. Search, edit and remove individual placements; inspect suitability,
  footprints and demand indicators.
- **Hazards and time:** Examine flood, drought, wildfire and landslide screening at selected
  simulation times. Export hazard events and time-series data.
- **Files:** Import GeoTIFF, CSV, JSON and GeoJSON where supported by each data layer. Export
  scenario settings, grid and vector data, quality reports, and terrain packages for Unity and
  Unreal. Those packages are not complete engine scenes.

## Feature Gallery

Browser screenshots: 32 km × 32 km, 256² grid, Grand Canyon preset. The preset now uses an inland
plateau, incised river corridor and dry climate informed by [National Park Service park
statistics](https://home.nps.gov/grca/learn/management/statistics.htm). It does not contain a
georeferenced Grand Canyon DEM. River lines come from simulated local runoff, not a traced Colorado
River or prescribed upstream inflow. The opening image shows the 3D map; below is the same scenario
with flow accumulation selected.

![Flow accumulation selected in the analysis drawer](media/workspace-flow.jpg)

## Example Workflow

1. In **Terrain**, choose an extent and grid. Apply a continental or landform preset, or import a DEM in **Data**.
2. In **Weather** and **Hydrology**, change precipitation, wind, soil behaviour and channel threshold; rebuild or run the model.
3. In **Layers**, compare elevation, flow accumulation, flood screening, land cover and subsurface views. Open a section or volume view to inspect the vertical representation.
4. In **Data**, select an area and add facilities. Check the placement list and suitability output before keeping or editing each feature.
5. In **Export**, save the scenario, selected grid/vector layers and quality reports. Treat reports as model diagnostics, not as field validation.

## Architecture

```text
scenario controls and imported evidence
              |
   terrain and climate
              |
   routing, water and sediment
              |
   subsurface and ecology
              |
   wildlife and infrastructure
              |
   checks, analytical views and exports
```

`engine/geolab-core` holds the typed Rust calculations shared by the native service and the
WebAssembly worker. The browser owns interaction and rendering; a compatible working layer can be
replaced atomically by a validated Rust result, and a failed process gate leaves the existing
scenario state intact.

Water-connected habitat classification, including boundary-connected seawater and river-node
detection, runs as a Rust raster kernel up to 4096 × 4096 cells, reading binary elevation and
river arrays inside the model worker. TypeScript defines the habitat contracts and supplies a
diagnosed fallback when the kernel is unavailable.

Terrain surface, solid volume, geological sections and caves reuse modelled lithology and
landform data where available. Materials and object geometry also contain procedural display
choices; they are not measurements of real rock faces, cave passages or buildings.

## Getting Started

**Try it without installing anything:** <https://laiyukai910-star.github.io/geolab-128/>

The hosted browser build is published by [`.github/workflows/pages.yml`](.github/workflows/pages.yml).
It loads application files from GitHub Pages, then runs model calculations in the browser. The
desktop path adds the local Rust service.

### Desktop

```powershell
cd outputs/geo-sim-desktop
npm ci
npm start
```

The desktop runtime starts the loopback-only Rust service and the Electron workspace.

### Browser

```powershell
cd outputs/geo-sim
python -m http.server 4174 --bind 127.0.0.1
```

Open <http://127.0.0.1:4174/>. Static mode uses the bundled WebAssembly worker. The interface
defaults to English and includes Simplified Chinese.

### Verification

```powershell
cargo test --manifest-path engine/Cargo.toml --workspace
node outputs/geo-sim/tests/<name>.test.mjs
npm run typecheck --prefix outputs/geo-sim-desktop
```

The test suite is deterministic and runs without a browser. CI runs the Rust workspace, the
TypeScript type check, the JavaScript syntax check, every model test and every entry-point
assertion on each push to `main`.

## Scientific Scope

GeoLab makes its assumptions visible and keeps imported evidence distinct from modelled fields.
Its structure draws on established hydrology, geomorphology, groundwater, rock mechanics and
connectivity formulations, including FAO-56 reference evapotranspiration, NRCS runoff
constraints, multiple-flow-direction routing, Manning normal-depth inversion for finite-width
channels, groundwater-reservoir concepts, RUSLE-structured erosion accounting, Selby-style
rock-mass strength classification, joint-spacing and bed-thickness relations, and
resistance-based landscape connectivity.

The lithology class set is checked against the Global Lithological Map (GLiM v1.1). The repository
does not currently consume a global measured weathered-cover thickness grid.

It is **not** a calibrated forecast, a hydraulic CFD model, a geological survey, a
species-distribution model, or an engineering approval tool. Procedural terrain, organisms,
caves and materials are visual representations; cave geometry does not modify groundwater
conductance or storage. Real-world decisions require quality-controlled inputs, a
scale-appropriate model, calibration and validation data, uncertainty analysis, and domain
review.

Detailed method boundaries and checked behaviour:

- [Terrain materials](docs/v1-readiness/TERRAIN_MATERIALS.md)
- [Terrain, water and underground views](docs/v1-readiness/WORLD_VOLUME.md)
- [Organisms, aquatic habitat and cave controls](docs/v1-readiness/BIOMES_AND_CAVES.md)
- [River reconstruction](docs/v1-readiness/RIVER_RECONSTRUCTION.md)
- [Asset construction notes](docs/v1-readiness/ASSET_REBUILD.md)

## Repository Map

| Path | Contents |
| --- | --- |
| `engine/geolab-core/` | Shared Rust model library |
| `engine/geolab-server/` | Loopback-only native service |
| `engine/geolab-wasm/` | WebAssembly interface |
| `outputs/geo-sim/` | Browser workspace, renderer, adapters and exports |
| `outputs/geo-sim/src-ts/` | TypeScript computation and transport boundaries |
| `outputs/geo-sim-desktop/` | Electron runtime and local build orchestration |
| `outputs/geo-sim/tests/` | Deterministic model, renderer, geology and interoperability tests |
| `media/` | Documentation images |

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidance, [CHANGELOG.md](CHANGELOG.md)
for release history, and [LICENSE](LICENSE) for licensing.
