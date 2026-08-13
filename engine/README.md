# GeoLab Rust Engine

The Rust workspace is an independent computation and verification path for GeoLab 128. It does not mirror every browser feature. It owns a smaller, stricter contract that can reject malformed inputs, resolve terrain drainage, partition water, route discharge, and report its own process gates without depending on the Three.js interface.

## Workspace

- `geolab-core` contains typed inputs, validation, numerical methods, reports, and deterministic tests.
- `geolab-server` exposes the core through a loopback-only HTTP service with bounded concurrency, a 64 MiB body limit, a 30-second execution timeout, and a 512 × 512 API grid limit.

The core accepts up to 1,048,576 cells when embedded directly. API requests are intentionally smaller so one desktop request cannot monopolize the machine.

## Grid Semantics

`pointSpacingM` controls terrain derivatives and receiver distance. `cellSupportAreaM2` controls area and volume accounting. They are deliberately separate:

- a 128 km domain sampled at 96 × 96 points has a spacing of `128000 / 95` meters;
- each sample supports `128000² / (96 × 96)` square meters;
- multiplying support area by sample count closes exactly to the declared map area.

All raster arrays use row-major order and must have exactly `width × height` finite values.

## Simulation Contract

```json
{
  "apiVersion": "1.0",
  "scenarioId": "example",
  "grid": {
    "width": 3,
    "height": 3,
    "pointSpacingM": 100,
    "cellSupportAreaM2": 10000,
    "elevationM": [120, 118, 116, 119, 110, 114, 117, 115, 112]
  },
  "climate": {
    "annualPrecipitationMm": [900, 900, 900, 900, 900, 900, 900, 900, 900],
    "meanTemperatureC": [16, 16, 16, 16, 16, 16, 16, 16, 16],
    "relativeHumidityFraction": 0.65,
    "windSpeedMS": 3,
    "latitudeDegrees": 32,
    "dayOfYear": 183
  },
  "surface": {
    "curveNumber": [72, 72, 72, 72, 72, 72, 72, 72, 72],
    "hydraulicConductivityMmH": [18, 18, 18, 18, 18, 18, 18, 18, 18],
    "availableWaterCapacityMm": [150, 150, 150, 150, 150, 150, 150, 150, 150],
    "imperviousFraction": [0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05],
    "vegetationFraction": [0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7]
  },
  "management": {
    "irrigationMm": [],
    "requestedDemandMm": []
  },
  "includeLayers": false
}
```

Empty management arrays mean zero everywhere. Set `includeLayers` to `true` to return resolved terrain, flow receivers, contributing area, discharge, ET, runoff, recharge, and storage arrays.

## Numerical Sequence

1. Validate API version, shape, units, finite values, and documented ranges.
2. Resolve depressions with Priority-Flood while preserving a deterministic drainage parent for flats.
3. Derive Horn slope and acyclic D8 receivers.
4. Accumulate contributing area and discharge with a topological queue rather than elevation-order assumptions.
5. Estimate FAO-56 structured reference ET from available climate inputs.
6. Partition precipitation and irrigation across allocated demand, actual ET, event-constrained runoff, recharge, and storage.
7. Recompute local residuals and evaluate independent process gates.

The NRCS curve-number term represents a characteristic event response. It is not used as a continuous infiltration equation.

## Development

```powershell
cargo fmt --manifest-path engine/Cargo.toml --all -- --check
cargo clippy --manifest-path engine/Cargo.toml --workspace --all-targets -- -D warnings
cargo test --manifest-path engine/Cargo.toml --workspace
cargo run --release --manifest-path engine/Cargo.toml --package geolab-server -- --port 48129
```
