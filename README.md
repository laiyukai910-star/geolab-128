# GeoLab 128

![GeoLab 128 preview](outputs/geo-sim/preview.png)

> An interactive geographic systems laboratory for authoring, running, inspecting, and documenting coupled regional scenarios.

[![CI](https://github.com/laiyukai910-star/geolab-128/actions/workflows/ci.yml/badge.svg)](https://github.com/laiyukai910-star/geolab-128/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/github/v/tag/laiyukai910-star/geolab-128?label=version)](https://github.com/laiyukai910-star/geolab-128/tags)

GeoLab 128 is built around a simple question: **when terrain, weather, water, ecosystems, the subsurface, and human interventions are changed together, how should their spatial relationships be explored and made legible?**

The project provides a local, editable regional sandbox in which a user can construct a scenario, alter its conditions, trace coupled effects across multiple spatial representations, and export the assumptions and diagnostics with the result. Real-time 3D rendering and GPU acceleration support that experience; they are implementation details, not the purpose of the project.

## Core Idea

GeoLab 128 treats a study area as a connected geographic system rather than a display of separate layers.

- **Author a state:** define extent, terrain, climate boundary conditions, soils, water-routing rules, vegetation, subsurface structure, facilities, and species.
- **Run coupled rules:** let terrain exposure, runoff, routing, erosion, inundation proxies, habitat conditions, infrastructure effects, and time-dependent pressures respond together.
- **Inspect at several representations:** move between raster terrain, ecological blocks, facility footprints, 3D scene elements, cross-sections, and subsurface volumes.
- **Keep the scenario accountable:** preserve parameters, imported-data provenance, quality gates, diagnostics, and exports alongside the visualization.

This makes GeoLab 128 a geographic reasoning environment: useful for teaching systems thinking, comparing design options, communicating hypotheses, and exposing which assumptions drive a result.

## Scope and Professional Boundary

**GeoLab 128 is currently a teaching and exploratory prototype. It is not a validated predictive system.** Its procedural surfaces and model responses may support visualization, hypothesis formation, and workflow design; they are not observations, site surveys, engineering designs, hazard forecasts, ecological assessments, or professional advice.

The project is intentionally moving toward a stronger validation framework. That work will be explicit and incremental: documented input provenance, reproducible benchmarks, calibration workflows, holdout tests, uncertainty reporting, regression coverage, and domain review. A component should be considered exploratory until it is documented as validated for a specific domain, scale, data regime, and decision context.

For research, planning, or engineering work, use quality-controlled source data, calibrate against an appropriate reference period, assess uncertainty, and obtain qualified domain review. GeoLab 128 must not be the sole basis for emergency response, safety-critical design, land-use approval, investment, legal determination, or wildlife-management decisions.

## System Capabilities

| System | Current exploratory capability |
| --- | --- |
| Spatial domain | Square study areas from 8 to 256 km; terrain refinement to 4096 × 4096 cells; surface, transect, solid-subsurface, and volume-ledger representations. |
| Terrain and geomorphology | Procedural terrain, editable landform operations, continental templates, elevation up to 10,000 m, and terrain-derived exposure and roughness. |
| Climate and wind | Editable temperature, humidity, latitude, lapse rate, wind direction, wind speed, and terrain-exposure conditions with orographic and rain-shadow approximations. |
| Water and landform response | Priority-Flood handling, D8/MFD/D∞ routing, river extraction, runoff, erosion, deposition, and screening-level flood, drought, wildfire, and slope-risk indicators. |
| Ecology | Habitat and block conditions, functional guilds, carrying-capacity proxies, movement corridors, food-web relationships, and batch wildlife-release scenarios. |
| Built environment | Area-aware placement of buildings, transport, utilities, water infrastructure, civic facilities, and landmarks with environmental-suitability and land-surface feedback. |
| Evidence and interchange | Selected data imports plus GeoJSON, CSV, parameters, source audits, quality gates, diagnostics, and scenario exports. |

## What Has Been Demonstrated

- The offline Three.js scene and Electron desktop runtime operate without an online model service.
- `109/109` internal procedural-asset factories build successfully.
- Browser checks cover source loading, language switching, and desktop/mobile horizontal overflow.
- Source audits and quality gates record when important data constraints or calibration inputs are absent.

## What Remains Unvalidated

- A procedural DEM is not a surveyed landscape.
- Climate, hydrology, erosion, ecology, and hazard responses are not calibrated forecasts.
- D∞ routing is a continuous-slope approximation, not a complete two-dimensional hydraulic model.
- Facility suitability and wildlife dynamics are scenario heuristics, not approvals, population assessments, or management recommendations.

Detailed algorithms, input formats, and quality-gate behavior are documented in the [technical guide](outputs/geo-sim/README.md).

## Quick Start

### Web application

Prerequisite: Python 3 or another static HTTP server.

```powershell
cd outputs/geo-sim
python -m http.server 4174
```

Open <http://127.0.0.1:4174/>. The interface defaults to English; the top of the right-side drawer includes a Simplified Chinese language switch.

### Desktop application

Prerequisite: Node.js 20+ and npm.

```powershell
cd outputs/geo-sim-desktop
npm ci
npm run start
```

The desktop runtime is local-first and can use hardware-accelerated WebGL where the host system provides it.

## Working With a Scenario

1. Establish the spatial domain, terrain baseline, and regional template in **Terrain**.
2. Define weather, climate, hydrogeologic, and routing conditions in **Weather** and **Hydrology**.
3. Add, import, or remove surface and built-environment interventions in **Data**.
4. Inspect terrain, water, ecosystem, infrastructure, and hazard representations in **Layers**.
5. Export the result with its parameters, input provenance, diagnostics, and quality report.

For comparisons, change one major condition at a time. A visually compelling result is not enough: record what was assumed, what data constrained it, and what remained unconstrained.

## Validation Roadmap

The long-term aim is not to imply certainty before it exists. It is to make model behavior inspectable, testable, and progressively more defensible.

1. Establish benchmark study cases and expected diagnostic ranges for each system.
2. Add reproducible input manifests, spatial-reference checks, unit validation, and data-quality assertions.
3. Publish calibration and holdout-validation workflows for hydrology and climate-dependent components.
4. Report sensitivity and uncertainty with every scenario export.
5. Expand automated numerical, visual, interaction, and performance regression coverage.
6. Document the domain, evidence, and validity range of each feature that reaches a validated state.

The current technical handoff list is in [NEXT_STEPS.md](outputs/geo-sim/NEXT_STEPS.md).

## Development

```powershell
cd outputs/geo-sim-desktop
npm ci
npm run vendor
```

The base CI workflow installs the desktop dependencies, checks JavaScript syntax, and verifies application entry points. It intentionally does not package every pull request because desktop packaging is platform-specific and substantially heavier.

For local offline packages:

```powershell
npm run package:win
npm run package:portable
```

Artifacts are written beneath `outputs/GeoLab-128-Local` and `outputs/GeoLab-128-Portable`; they are excluded from Git.

## Contributing

Contributions that improve geographic reasoning, reproducibility, validation, accessibility, performance, or documentation are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening an issue or pull request.

## Versioning and License

GeoLab 128 follows semantic versioning while pre-1.0. `v0.1.0` establishes the public exploratory-prototype baseline; see [CHANGELOG.md](CHANGELOG.md) for release notes. The project is released under the [MIT License](LICENSE).
