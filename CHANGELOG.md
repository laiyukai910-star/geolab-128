# Changelog

This is the **single canonical changelog** for GeoLab 128. Application, renderer, desktop-runtime, documentation, and validation changes are consolidated here; subsystem changelogs are not maintained separately.

All notable changes to GeoLab 128 are documented here. The project follows semantic versioning while pre-1.0. The latest consolidation was completed on **2026-08-13**.

## [Unreleased] - Updated 2026-08-13

### Added

- Added a cross-system physical-coupling ledger with eight conservation/process gates, eight directional coupling scores, limiting-link detection, method references, JSON export, and CSV export.
- Added Unity Terrain scene packages with supported `2^n+1` 16-bit RAW heightfields, TGA surface masks, local ENU vectors, scale/elevation metadata, provenance, and import instructions.
- Added Unreal Landscape scene packages with recommended 16-bit R16 dimensions, R8 weight layers, RAW JSON sidecars, calculated XY/Z scale, actor elevation, local vectors, provenance, and import instructions.
- Added deterministic CI coverage for water-partition closure, FAO-56 diagnostics, gate/report structure, engine resolution selection, binary payload sizes, manifests, and ZIP signatures.
- Added area-closed ecological blocks with UNEP / UNCCD `P/PET` aridity zones, climate-vegetation consistency, edge pressure, effective habitat, and core-habitat proxies.
- Added limiting-factor species niches, functional-connectivity carrying capacity, bounded disturbance-aware population dynamics, representative adult body-mass traits, and prey-biomass support.
- Added transparent ecological-integrity diagnostics with Shannon diversity, Hill numbers, Pielou evenness, functional-guild representation, trophic biomass, component weights, interpretation boundaries, JSON export, and species-level CSV.
- Added hard screening gates that assign zero survival to wildlife releases outside the selected regional template or without viable habitat, with explicit professional review requirements.
- Added a purpose-aware cross-system scenario synthesis spanning terrain, climate, water, ecology, subsurface, infrastructure, hazards, and evidence.
- Added separate system-coverage and evidence-coverage diagnostics, explicit coupling pathways, prioritized follow-up actions, and visible interpretation boundaries.
- Added portable scenario-synthesis JSON and Markdown brief exports plus deterministic CI tests for report structure, evidence scoring, intervention feedback, and failure handling.
- Added terrain and infrastructure-region camera focus so local selections can be inspected in context instead of remaining disconnected from the 3D scene.
- Added renderer lifecycle diagnostics, WebGL context-loss recovery, visibility-aware animation, and deferred shader warm-up reporting.
- Added accessible application-owned file pickers whose labels and selection states follow the English / Simplified Chinese interface setting.

### Changed

- Updated the CI checkout and Node setup actions to their Node 24-based v7 releases, removing the deprecated Node 20 action-runtime warning.
- Replaced the temperature-only potential-evapotranspiration proxy with a FAO-56 Penman-Monteith structure using bounded radiation, humidity, wind, elevation-pressure, vapor-pressure, and terrain-exposure terms.
- Reworked annual runoff into an explicit mass-conserving partition of precipitation and irrigation across demand, actual ET, runoff, groundwater recharge, and soil-storage change, with an NRCS curve-number event-response constraint.
- Separated requested, allocated, and unmet infrastructure demand so the conservation ledger deducts only water that the scenario can actually supply.
- Expanded scenario synthesis and quality reports with physical-gate scores, coupling integrity, recharge, storage change, unresolved residual, and physical-review priorities.
- Area and volume accounting now uses map area divided by grid-point count while terrain derivatives and distances continue to use point spacing, removing resolution-dependent area inflation from water, hazard, infrastructure, ecology, and time-series totals.
- Replaced raw-count trophic balance with standing-biomass and accessible-prey support diagnostics while retaining a compatibility alias for existing views.
- Reframed and expanded the project documentation around GeoLab 128 as a local-first geographic systems laboratory, with explicit modeling vocabulary, coupled scenario workflow, design principles, repository map, and professional boundaries.
- Consolidated project-wide release notes into this root changelog and established it as the only maintained changelog in the repository.
- Rebalanced 3D vegetation, wildlife, and built-asset proportions using meter-based visual scales, shared geometry reuse, frustum culling, and bounded animation updates.
- Aligned the documented study-area range and observed-data controls with the application's supported 4–512 km square domains.
- Bound recovery controls before the first terrain build so startup failures remain visible and diagnosable.

### Fixed

- Fixed local retention being applied to cumulative upstream discharge at every affected downstream cell; retention now removes only the newly generated local runoff volume before routing.
- Fixed infrastructure storage capacity being counted as annual water supply even when no irrigation inflow is present.
- Fixed physical water-closure gates to recompute the partition independently from raw raster terms, and extended accumulation checks to MFD receiver fractions.
- Fixed engine-scene row-order metadata and added explicit local extents plus Unity and Unreal terrain origins.
- Fixed browser-native file controls leaking operating-system language into the English interface.
- Fixed duplicate and unreachable infrastructure-selection status branches.
- Fixed null WebGL shader diagnostics, hidden-drawer keyboard focus, page-lifecycle resource cleanup, and incomplete startup error reporting.
- Updated vulnerable transitive desktop-build dependencies within their compatible release ranges; the locked toolchain now reports zero known npm audit findings.

### Planned

- Reproducible benchmark cases, calibration workflows, uncertainty reporting, and broader regression coverage.

## [0.1.0] - 2026-08-11

This section is the preserved release history for the `v0.1.0` tag. It is not a second or stale changelog.

### Added

- Public English-first documentation and English / Simplified Chinese application interface.
- Local GPU-oriented Three.js and Electron simulation runtime.
- Exploratory terrain, climate, hydrology, ecology, infrastructure, data-import, and export workflows.

### Notes

- This release establishes the public **teaching and exploratory prototype** baseline.
- It does not claim calibrated or validated predictive performance.

[Unreleased]: https://github.com/laiyukai910-star/geolab-128/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/laiyukai910-star/geolab-128/releases/tag/v0.1.0
