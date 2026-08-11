# GeoLab 128

![GeoLab 128 preview](outputs/geo-sim/preview.png)

> A local, GPU-accelerated 3D geographic simulation prototype for teaching, exploration, and transparent scenario discussion.

[![CI](https://github.com/laiyukai910-star/geolab-128/actions/workflows/ci.yml/badge.svg)](https://github.com/laiyukai910-star/geolab-128/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/github/v/tag/laiyukai910-star/geolab-128?label=version)](https://github.com/laiyukai910-star/geolab-128/tags)

GeoLab 128 combines terrain, climate, wind, hydrology, vegetation, ecological blocks, built infrastructure, and wildlife communities in an offline interactive scene. It is designed to help learners and practitioners ask better geographic questions, compare assumptions, and inspect scenario consequences.

## Project Position

**GeoLab 128 is a teaching and exploratory prototype, not a validated prediction system.** Procedural terrain and model outputs are useful for visualization, hypothesis formation, and workflow demonstration. They are not measured observations, engineering designs, hazard forecasts, or a substitute for professional judgment.

The project is deliberately evolving toward a stronger validation framework. That work will proceed incrementally through documented input provenance, reproducible benchmark cases, calibration workflows, uncertainty reporting, regression tests, and independent review. Until a module is explicitly validated for a stated use case, it should be treated as exploratory.

For research, planning, or engineering use, import quality-controlled DEM, hydrography, land cover, soil, meteorological, and observed-flow data; calibrate against an appropriate reference period; assess uncertainty; and obtain domain review.

## What It Can Do Today

| Area | Current capability |
| --- | --- |
| Terrain and subsurface | Square study areas from 8 to 256 km, elevations to 10,000 m, local refinement to 4096 × 4096 cells, surface and subsurface inspection views. |
| Climate and wind | Interactive temperature, humidity, latitude, lapse-rate, wind, and terrain-exposure parameters with orographic and rain-shadow approximations. |
| Hydrology and landforms | Priority-Flood handling, D8/MFD/D∞ routing, river extraction, runoff, erosion, deposition, and screening-level hazard layers. |
| Built environment | Place infrastructure in selected areas; inspect suitability, imperviousness, drainage, vegetation, heat, and hazard feedback. |
| Ecosystems | Regional wildlife sets, functional guilds, habitat suitability, carrying-capacity proxies, migration corridors, food webs, and batch releases. |
| Data and exports | Import selected data layers and export GeoJSON, CSV, parameters, quality reports, and diagnostics. |

## Validation Status

### Demonstrated

- Offline Three.js scene and Electron desktop runtime load without an online model service.
- `109/109` internal procedural-asset factories build successfully.
- Browser checks cover script loading, language switching, and desktop/mobile horizontal overflow.
- Source-data audit and quality-gate exports can record when required inputs are absent.

### Not Yet Validated

- Procedural DEMs do not represent a surveyed landscape.
- Hydrology, erosion, climate, ecology, and hazard outputs are not calibrated forecasts.
- D∞ flow routing is a continuous-slope approximation, not a complete two-dimensional hydraulic solver.
- Facility suitability and wildlife dynamics are scenario heuristics, not planning approvals or population assessments.

See the [technical documentation](outputs/geo-sim/README.md) for algorithms, supported inputs, and quality gates.

## Quick Start

### Web application

Prerequisite: Python 3 or another static HTTP server.

```powershell
cd outputs/geo-sim
python -m http.server 4174
```

Open <http://127.0.0.1:4174/>. The interface defaults to English; use the language selector at the top of the right-side drawer for Simplified Chinese.

### Desktop application

Prerequisite: Node.js 20+ and npm.

```powershell
cd outputs/geo-sim-desktop
npm ci
npm run start
```

The Electron runtime prefers a high-performance GPU, hardware WebGL, GPU rasterization, and local resources.

## Typical Workflow

1. Set study extent, seed, continental template, and terrain baseline in **Terrain**.
2. Adjust natural conditions in **Weather** and **Hydrology**, then rerun the scenario.
3. Add or import surface and infrastructure data in **Data**.
4. Inspect ecological, hydrological, infrastructure, and hazard layers in **Layers**.
5. Export parameters, source audit, diagnostics, and results together so another person can understand the scenario assumptions.

Change one major assumption at a time when comparing scenarios. Record input origin and use the quality report before presenting any result.

## Data and Responsible Use

Imported data constrains the corresponding model layer. Runs without DEM, soil, weather, river-network, or calibration data are explicitly demonstration-grade. This distinction is intentional and should remain visible in downstream work.

Do not use GeoLab 128 outputs as the sole basis for emergency response, safety-critical design, land-use approval, investment, legal determination, or wildlife-management decisions.

## Roadmap Toward Validation

The continuing goal is not to claim certainty early; it is to make every claim inspectable.

1. Define benchmark study cases and expected diagnostic ranges for each module.
2. Add reproducible input manifests, spatial-reference checks, and data-quality assertions.
3. Publish calibration and holdout-validation workflows for hydrology and climate-dependent layers.
4. Report uncertainty and sensitivity alongside each exported scenario.
5. Expand automated regression, performance, and visual tests.
6. Invite domain review and document the domain, data, and validity range for each validated feature.

Current detailed handoff priorities are in [NEXT_STEPS.md](outputs/geo-sim/NEXT_STEPS.md).

## Development

```powershell
cd outputs/geo-sim-desktop
npm ci
npm run vendor
```

The basic CI workflow performs JavaScript syntax checks and verifies the local application entry points. Packaging is intentionally not run on every pull request because it is platform-specific and significantly heavier.

For offline packages:

```powershell
npm run package:win
npm run package:portable
```

Artifacts are written beneath `outputs/GeoLab-128-Local` and `outputs/GeoLab-128-Portable` and are intentionally excluded from Git.

## Contributing

Contributions are welcome, especially improvements that make assumptions, data provenance, validation limits, or accessibility clearer. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening an issue or pull request.

## Versioning and Releases

GeoLab 128 follows semantic versioning while it is pre-1.0: minor releases may add or materially change exploratory behavior; patch releases fix documented behavior. `v0.1.0` establishes the public teaching-prototype baseline. See [CHANGELOG.md](CHANGELOG.md) for release notes.

## License

GeoLab 128 is released under the [MIT License](LICENSE).
