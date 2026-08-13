# Changelog

This is the **single canonical changelog** for GeoLab 128. Application, renderer, desktop-runtime, documentation, and validation changes are consolidated here; subsystem changelogs are not maintained separately.

All notable changes to GeoLab 128 are documented here. The project follows semantic versioning while pre-1.0. The latest consolidation was completed on **2026-08-13**.

## [Unreleased] - Updated 2026-08-13

### Added

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

- Area and volume accounting now uses map area divided by grid-point count while terrain derivatives and distances continue to use point spacing, removing resolution-dependent area inflation from water, hazard, infrastructure, ecology, and time-series totals.
- Replaced raw-count trophic balance with standing-biomass and accessible-prey support diagnostics while retaining a compatibility alias for existing views.
- Reframed and expanded the project documentation around GeoLab 128 as a local-first geographic systems laboratory, with explicit modeling vocabulary, coupled scenario workflow, design principles, repository map, and professional boundaries.
- Consolidated project-wide release notes into this root changelog and established it as the only maintained changelog in the repository.
- Rebalanced 3D vegetation, wildlife, and built-asset proportions using meter-based visual scales, shared geometry reuse, frustum culling, and bounded animation updates.
- Aligned the documented study-area range and observed-data controls with the application's supported 4–512 km square domains.
- Bound recovery controls before the first terrain build so startup failures remain visible and diagnosable.

### Fixed

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
