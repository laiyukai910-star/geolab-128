# Changelog

This is the **single canonical changelog** for GeoLab 128. Application, renderer, desktop-runtime, documentation, and validation changes are consolidated here; subsystem changelogs are not maintained separately.

All notable changes to GeoLab 128 are documented here. The project follows semantic versioning while pre-1.0. The latest consolidation was completed on **2026-08-13**.

## [Unreleased]

## [0.5.0] - 2026-08-13

### Added

- Added a focused `authoritativeSurfaceLayers` Rust output profile for filled terrain, slope, sparse MFD routing, contributing area, annual discharge, reference/actual ET, runoff, managed retention, recharge, storage change, and cell residual without serializing unrelated diagnostic rasters.
- Added explicit per-cell managed runoff-retention input, retained-runoff layers, a separate retained volume in the water ledger, and a thirteenth gate proving that outlet surface runoff equals generated runoff minus managed retention.
- Added a strict TypeScript two-phase commit module that validates engine/API identity, exact grid shape, physical layer ranges, sparse-flow offsets, local and unique D8-neighbor targets, positive fractions, fraction closure, dominant receiver membership, downhill routing, acyclic topology, process gates, and water/groundwater/sediment residuals before mutation.
- Added bounded JS/Rust comparison metrics for slope, log contributing area, log discharge, runoff, recharge, and dominant-receiver agreement.
- Added an authoritative model-integration test using the real Rust WASM binary, including successful dependency rebuild plus forced failed-gate and cyclic-graph cases that prove the original model arrays remain untouched.

### Changed

- Migrated `modelWorker` to reviewed strict TypeScript with serialized job execution, native/WASM transport selection, Rust runtime accounting, and transferable-buffer return diagnostics.
- Working grids up to 512 x 512 now use Rust results for thirteen live model layers before rebuilding rivers, hydraulics, wetness, subsurface state, hazards, infrastructure feedback, ecology, wildlife, statistics, physical gates, and the Three.js scene.
- Expanded the Rust-core readout to distinguish same-resolution working-layer commits from the independent 96 x 96 audit and to expose dominant-routing agreement.
- Updated native and WASM desktop smoke tests to require an applied authoritative commit in addition to successful MFD audit gates, GPU warm-up, completed rendering, and zero external requests.

### Fixed

- Preserved facility, reservoir, and landscape runoff-retention effects when Rust becomes authoritative instead of silently dropping retention at the browser-to-core boundary.
- Rebuilt stream order, river segments, hydraulic diagnostics, groundwater volumes, hazards, ecosystem state, and statistics after an authoritative commit so no dependent layer remains tied to the discarded JS routing candidate.
- Replaced height-only river reconstruction order with the validated MFD graph's topological order, preserving correct upstream-to-downstream propagation across depression-filled equal-elevation cells.
- Included Rust transport and execution time in the displayed full-model runtime instead of reporting only browser candidate and dependency-rebuild time.

## [0.4.0] - 2026-08-13

### Added

- Added `geolab-wasm`, a browser WebAssembly transport that executes the existing Rust terrain, routing, water, groundwater, sediment, ecology, and process-gate core without duplicating formulas.
- Added an explicit allocation/simulation/capabilities/deallocation ABI with structured Rust validation errors and shared capability metadata for native and WASM transports.
- Added a dedicated module Worker so static-browser Rust verification runs off the Three.js/UI thread.
- Added strict TypeScript sources for scenario construction, transport selection, request lifecycle, WASM memory handling, and Worker messages, with generated ES modules kept as browser artifacts.
- Added a cross-runtime test that instantiates the compiled WASM binary, transfers a real scenario, runs MFD and coupled process gates, and validates the resulting Rust report.

### Changed

- Static-browser mode now loads the bundled Rust kernel automatically; Electron continues to prefer its managed native Rust sidecar.
- Desktop runtime preparation now builds TypeScript browser modules, Rust WASM, the native Rust service, and local vendor dependencies in one reproducible command.
- Centralized routing, process, and output-layer capability declarations in `geolab-core` so native and browser transports cannot silently advertise different models.
- Expanded CI to type-check TypeScript, compile the pinned WASM target, execute ABI tests, and verify both reviewed sources and generated runtime assets.
- Documented a capability-driven migration policy: numerical kernels move to Rust, browser contracts move to TypeScript, and stable rendering/UI modules migrate only after their boundaries are isolated and tested.

### Fixed

- Removed the static-mode gap where Rust verification controls were disabled whenever no native HTTP endpoint was configured.
- Corrected the verification comparison description to identify the active MFD routing path instead of the legacy D8-only wording.
- Added the WebAssembly MIME type to the local Electron server so the kernel loads consistently without external hosting.
- Preserved the project's null-safe Three.js shader diagnostics during local vendor refreshes so runtime preparation cannot reintroduce driver-dependent startup failures.

## [0.3.0] - 2026-08-13

### Added

- Added backward-compatible Rust contracts for routing method, simulation duration and timestep, subsurface state, geomorphology, and habitat preferences/barriers; omitted routing controls retain historical D8 behavior while the current browser audit explicitly selects MFD.
- Added Freeman-style multiple-flow-direction routing with sparse per-cell target fractions, a dominant-receiver compatibility layer, graph-topological area and flux accumulation, and D8 fallback.
- Added a time-stepped distributed groundwater reservoir with an analytical constant-inflow step solution, explicit initial storage, recharge, baseflow, capacity overflow, final storage, inferred saturation/water-table layers, independent mass closure, and timestep-stability tests.
- Added RUSLE-structured gross detachment, runoff/slope/cover-sensitive transport capacity, routed deposition and outlet export, sediment delivery ratio, and an independent sediment mass ledger.
- Added climate-, moisture-, slope-, vegetation-, imperviousness-, and barrier-constrained habitat suitability, connected patch labeling, resistance-weighted local connectivity, barrier-edge pressure, and corridor bottleneck diagnostics.
- Expanded the Rust report from six to twelve process gates, including flow-fraction closure, outlet-area closure, groundwater and sediment closure, transport capacity, habitat accounting, and ecology bounds.
- Added period and annualized discharge layers plus sparse flow-target, groundwater, sediment, and habitat output layers.
- Added deterministic tests for MFD fractions, D8 compatibility, period scaling, routed runoff/baseflow closure, zero initial groundwater storage, sediment closure, habitat patch accounting, and invalid process controls.

### Changed

- Expanded the desktop/browser verification request to carry MFD controls, terrain-derived subsurface state, infrastructure barriers, process defaults, and a declared one-year/30-day audit period.
- Expanded the Rust verification readout and exported comparison with groundwater residual, sediment residual, water-table depth, and habitat connectivity.
- Strengthened desktop smoke verification to require the MFD audit path and zero failed Rust gates while recording coupled-process residuals and habitat connectivity.
- Rewrote the Rust engine documentation around units, optional-layer semantics, numerical sequence, ledgers, sparse routing, and honest method boundaries.
- Replaced the browser subproject's long mixed-language development record with a concise English runtime, architecture, input, export, and interpretation guide.
- Updated public documentation to present the Rust core as an independent coupled-process verifier rather than a GPU or hydrology-only feature.

### Fixed

- Fixed duration-aware outputs by separating period discharge from annualized discharge and scaling precipitation, irrigation, demand, and evapotranspiration to the declared simulation period.
- Fixed explicit zero-valued initial groundwater storage being replaced by a derived default.
- Fixed browser-to-Rust subsurface resampling so lower-resolution subsurface columns use their own grid dimension instead of the terrain grid dimension.
- Replaced the D8-only downstream accumulation gate with MFD-valid fraction and outlet-area conservation checks.
- Fixed sediment transport capacity to use routed surface runoff rather than incorrectly including groundwater baseflow.
- Normalized floating-point closure noise inside declared tolerances so the UI no longer presents signed negative zero as a physical residual.

## [0.2.0] - 2026-08-13

### Added

- Added a Rust workspace with a typed geographic scenario contract, strict unit/range/shape validation, Priority-Flood depression resolution, Horn slope, deterministic D8 routing, topological accumulation, hydroclimate partitioning, and independent process gates.
- Added a bounded loopback-only Axum service with versioned health, capabilities, validation, and simulation endpoints; request-size, cell-count, concurrency, and execution-time limits; and structured error responses.
- Added Electron sidecar lifecycle management, automatic 96 × 96 independent scenario verification, a live Rust-core readout, and an exportable backend verification report.
- Added Rust formatting, Clippy, core/API tests, JavaScript client-contract tests, and desktop sidecar smoke coverage.
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

- Rewrote the public project page around user workflows, coupled capabilities, dual computation cores, 3D and engine interoperability, while removing handoff notes and development-residue wording.
- Separated terrain point spacing from cell support area in the Rust contract so derivatives and volume accounting retain their correct dimensions across audit resolutions.
- Updated desktop build and portable packaging workflows to compile and include the Rust service automatically.
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

- Fixed the desktop runtime boundary so backend requests remain loopback-only, participate in smoke-test request auditing, receive managed process priority, and terminate with Electron.
- Fixed local retention being applied to cumulative upstream discharge at every affected downstream cell; retention now removes only the newly generated local runoff volume before routing.
- Fixed infrastructure storage capacity being counted as annual water supply even when no irrigation inflow is present.
- Fixed physical water-closure gates to recompute the partition independently from raw raster terms, and extended accumulation checks to MFD receiver fractions.
- Fixed engine-scene row-order metadata and added explicit local extents plus Unity and Unreal terrain origins.
- Fixed browser-native file controls leaking operating-system language into the English interface.
- Fixed duplicate and unreachable infrastructure-selection status branches.
- Fixed null WebGL shader diagnostics, hidden-drawer keyboard focus, page-lifecycle resource cleanup, and incomplete startup error reporting.
- Updated vulnerable transitive desktop-build dependencies within their compatible release ranges; the locked toolchain now reports zero known npm audit findings.

## [0.1.0] - 2026-08-11

This section is the preserved release history for the `v0.1.0` tag. It is not a second or stale changelog.

### Added

- Public English-first documentation and English / Simplified Chinese application interface.
- Local GPU-oriented Three.js and Electron simulation runtime.
- Exploratory terrain, climate, hydrology, ecology, infrastructure, data-import, and export workflows.

### Notes

- This release establishes the public **teaching and exploratory prototype** baseline.
- It does not claim calibrated or validated predictive performance.

[Unreleased]: https://github.com/laiyukai910-star/geolab-128/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/laiyukai910-star/geolab-128/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/laiyukai910-star/geolab-128/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/laiyukai910-star/geolab-128/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/laiyukai910-star/geolab-128/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/laiyukai910-star/geolab-128/releases/tag/v0.1.0
