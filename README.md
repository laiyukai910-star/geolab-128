# GeoLab 128

![GeoLab 128 preview](outputs/geo-sim/preview.png)

> A local-first geographic systems laboratory for authoring, running, inspecting, and documenting coupled regional scenarios.

[![CI](https://github.com/laiyukai910-star/geolab-128/actions/workflows/ci.yml/badge.svg)](https://github.com/laiyukai910-star/geolab-128/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/github/v/tag/laiyukai910-star/geolab-128?label=version)](https://github.com/laiyukai910-star/geolab-128/tags)

GeoLab 128 is built around a simple question: **when terrain, weather, water, ecosystems, the subsurface, and human interventions are changed together, how should their spatial relationships be explored, compared, and made legible?**

The project provides a local, editable regional sandbox in which a user can construct a scenario, alter its boundary conditions, trace coupled effects across multiple spatial representations, and export assumptions and diagnostics with the result. It sits between a classroom systems model, a scenario-authoring workbench, and an inspectable simulation prototype. Real-time 3D rendering and hardware acceleration support that experience; they are implementation details, not the purpose of the project.

GeoLab 128 is not intended to be another terrain viewer or decorative world generator. Its central object is the **scenario**: a bounded geographic state whose terrain, atmosphere, water, ecology, subsurface, built environment, time, evidence, and uncertainty can be examined together.

## Project Identity

| Dimension | GeoLab 128 |
| --- | --- |
| Product form | Local-first interactive geographic systems laboratory and scenario workbench. |
| Primary use | Teaching coupled geographic processes, exploring hypotheses, comparing interventions, and prototyping transparent model workflows. |
| Core unit | A reproducible regional scenario, not an isolated map layer or a single 3D asset. |
| Spatial language | Cells, ecological blocks, networks, footprints, surfaces, transects, subsurface solids, and mobile agents. |
| Defining principle | Every visible result should remain connected to editable conditions, model rules, source provenance, and diagnostics. |
| Current maturity | Continuously developed teaching and exploratory prototype; not a validated forecasting or engineering system. |

## Core Idea

GeoLab 128 treats a study area as a connected geographic system rather than a display of separate layers.

- **Author a state:** define extent, terrain, climate boundary conditions, soils, water-routing rules, vegetation, subsurface structure, facilities, and species.
- **Run coupled rules:** let terrain exposure, runoff, routing, erosion, inundation proxies, habitat conditions, infrastructure effects, and time-dependent pressures respond together.
- **Inspect at several representations:** move between raster terrain, ecological blocks, facility footprints, 3D scene elements, cross-sections, and subsurface volumes.
- **Keep the scenario accountable:** preserve parameters, imported-data provenance, quality gates, diagnostics, and exports alongside the visualization.

This makes GeoLab 128 a geographic reasoning environment: useful for teaching systems thinking, comparing design options, communicating hypotheses, and exposing which assumptions drive a result.

## Modeling Vocabulary

GeoLab 128 deliberately uses several representations because geographic systems are not adequately described by one grid alone.

| Representation | What it carries |
| --- | --- |
| Regional domain | Extent, resolution, coordinate context, terrain baseline, and scenario-wide boundary conditions. |
| Surface cell | Elevation, slope, climate response, runoff, soil, vegetation, hazards, and local evidence quality. |
| Ecological block | Neighborhood state, habitat capacity, connectivity, service gaps, and cross-cell coordination. |
| Network | Rivers, flow direction, movement corridors, transport links, utilities, and dependencies. |
| Footprint and structure | Facility siting, geometry, environmental suitability, adaptation requirements, and local feedback. |
| Subsurface column and solid | Layered material, groundwater, aquifer potential, depth-dependent reasoning, and underground constraints. |
| Wildlife agent and guild | Habitat preference, abundance, movement pressure, trophic role, and release scenarios. |
| Evidence record | Imported sources, procedural assumptions, calibration inputs, quality gates, and uncertainty notes. |

## Coupled Scenario Loop

1. **Author conditions:** select the study extent and resolution, then define terrain, climate, hydrology, ecology, subsurface, infrastructure, species, and time-dependent pressures.
2. **Resolve spatial response:** derive exposure, routing, accumulation, erosion, habitat, suitability, connectivity, and hazard indicators across linked cells, blocks, networks, and volumes.
3. **Inspect consequences:** compare analytical layers with the 3D scene, local cell readouts, ecological summaries, infrastructure state, cross-sections, and exported ledgers.
4. **Revise transparently:** change a condition or intervention, rerun the scenario, and retain enough provenance and diagnostics to explain why the result changed.

The objective is not to collapse every discipline into one opaque score. It is to make cross-system assumptions visible enough to challenge, teach, test, and progressively validate.

## Design Principles

- **Coupling before spectacle:** terrain, climate, water, ecology, subsurface, and infrastructure should influence a shared state rather than appear as unrelated decorations.
- **Inspectability before certainty:** model rules, input gaps, data quality, and unvalidated behavior must remain visible to the user.
- **Multiple scales and forms:** regional patterns, local cells, linked blocks, networks, structures, organisms, and underground volumes each need an appropriate representation.
- **Local-first operation:** the core application and vendored runtime can operate without an online model service; external sources are optional evidence inputs, not the foundation of the experience.
- **Progressive validation:** capability can expand quickly, but predictive claims must advance only through documented benchmarks, calibration, uncertainty analysis, and domain review.

## Scope and Professional Boundary

**GeoLab 128 is currently a teaching and exploratory prototype. It is not a validated predictive system.** Its procedural surfaces and model responses may support visualization, hypothesis formation, and workflow design; they are not observations, site surveys, engineering designs, hazard forecasts, ecological assessments, or professional advice.

The project is intentionally moving toward a stronger validation framework. That work will be explicit and incremental: documented input provenance, reproducible benchmarks, calibration workflows, holdout tests, uncertainty reporting, regression coverage, and domain review. A component should be considered exploratory until it is documented as validated for a specific domain, scale, data regime, and decision context.

For research, planning, or engineering work, use quality-controlled source data, calibrate against an appropriate reference period, assess uncertainty, and obtain qualified domain review. GeoLab 128 must not be the sole basis for emergency response, safety-critical design, land-use approval, investment, legal determination, or wildlife-management decisions.

## System Capabilities

| System | Current exploratory capability |
| --- | --- |
| Spatial domain | Square study areas from 4 to 512 km; terrain resolution options up to 4096 × 4096 cells; surface, transect, solid-subsurface, and volume-ledger representations. |
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

## Repository Map

| Path | Purpose |
| --- | --- |
| `outputs/geo-sim/` | Offline-capable browser application, geographic engines, renderers, adapters, and technical documentation. |
| `outputs/geo-sim-desktop/` | Electron runtime and local packaging workflow. |
| `.github/workflows/ci.yml` | Static integrity checks for source syntax, dependencies, and required entry points. |
| `CONTRIBUTING.md` | Contribution expectations, validation boundaries, and development workflow. |
| `CHANGELOG.md` | User-visible additions, behavior changes, fixes, and planned validation work. |

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
