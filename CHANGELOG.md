# Changelog

All notable changes to GeoLab 128 are documented here. The project follows semantic versioning while pre-1.0.

## [Unreleased]

### Added

- Added terrain and infrastructure-region camera focus so local selections can be inspected in context instead of remaining disconnected from the 3D scene.
- Added renderer lifecycle diagnostics, WebGL context-loss recovery, visibility-aware animation, and deferred shader warm-up reporting.
- Added accessible application-owned file pickers whose labels and selection states follow the English / Simplified Chinese interface setting.

### Changed

- Reframed and expanded the project documentation around GeoLab 128 as a local-first geographic systems laboratory, with explicit modeling vocabulary, coupled scenario workflow, design principles, repository map, and professional boundaries.
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

### Added

- Public English-first documentation and English / Simplified Chinese application interface.
- Local GPU-oriented Three.js and Electron simulation runtime.
- Exploratory terrain, climate, hydrology, ecology, infrastructure, data-import, and export workflows.

### Notes

- This release establishes the public **teaching and exploratory prototype** baseline.
- It does not claim calibrated or validated predictive performance.

[Unreleased]: https://github.com/laiyukai910-star/geolab-128/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/laiyukai910-star/geolab-128/releases/tag/v0.1.0
