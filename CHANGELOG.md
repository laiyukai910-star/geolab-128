# Changelog

Notable user-visible, model, compatibility, and reliability changes are recorded here. Detailed implementation history remains available in Git.

## [Unreleased]

### Changed

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
