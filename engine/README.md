# GeoLab Rust Engine

The Rust workspace is GeoLab 128's independent computation and verification path. It accepts a smaller, stricter scenario than the browser authoring engine and returns auditable terrain, water, groundwater, sediment, and habitat results without depending on Three.js or the interface state.

## Workspace

| Crate | Responsibility |
| --- | --- |
| `geolab-core` | Typed contracts, validation, terrain processing, process models, conservation ledgers, output layers, and deterministic tests. |
| `geolab-server` | Loopback-only Axum API with bounded concurrency, a 64 MiB body limit, a 30-second timeout, structured errors, and a 512 x 512 request limit. |
| `geolab-wasm` | Minimal 32-bit memory ABI that executes the same core in a browser Worker without duplicating process formulas. |

Embedded callers may use up to 1,048,576 cells. API requests are limited to 262,144 cells so one desktop audit cannot monopolize the host.

## Grid Contract

`pointSpacingM` controls distances and terrain derivatives. `cellSupportAreaM2` controls represented area, depth-to-volume conversion, habitat area, and sediment mass. These values are deliberately independent.

For a 128 km domain sampled at 96 x 96 points:

- point spacing is `128000 / 95` m;
- each point supports `128000^2 / (96 * 96)` m2;
- support area multiplied by point count equals the declared domain area exactly.

All raster fields use row-major order and contain exactly `width * height` finite values. Optional raster fields are either empty, meaning "derive a documented default," or complete. Partial optional layers are rejected.

## Request

The API contract remains `1.0`; the new process groups are optional and therefore input-compatible. Requests without a `routing` group retain D8 behavior, while the GeoLab browser explicitly requests MFD for its independent audit.

```json
{
  "apiVersion": "1.0",
  "scenarioId": "example-catchment",
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
  "routing": {
    "method": "multiple-flow-direction",
    "mfdExponent": 1.1
  },
  "subsurface": {
    "soilDepthM": [],
    "aquiferThicknessM": [],
    "specificYieldFraction": [],
    "initialStorageFraction": [],
    "annualBaseflowRecessionFraction": 0.22
  },
  "geomorphology": {
    "soilErodibilityFactor": [],
    "supportPracticeFactor": [],
    "rainfallErosivityMjMmHaHYear": null,
    "transportCapacityCoefficient": 0.035
  },
  "ecology": {
    "barrierFraction": [],
    "preferredTemperatureC": 15,
    "temperatureToleranceC": 16,
    "preferredMoistureIndex": 0.85,
    "moistureTolerance": 0.7,
    "maximumSlopeDegrees": 38,
    "habitatThreshold": 0.55
  },
  "control": {
    "durationDays": 365,
    "timestepDays": 30
  },
  "includeLayers": false
}
```

## Process Sequence

1. Validate API version, shape, units, finite values, parameter ranges, duration, and timestep.
2. Resolve depressions with Priority-Flood and preserve deterministic flat-drainage parents.
3. Derive Horn slope and construct either acyclic D8 routing or Freeman-style slope-weighted MFD routing.
4. Accumulate contributing area and fluxes in graph-topological order. MFD target fractions close independently at every routed cell.
5. Estimate FAO-56 structured reference evapotranspiration and partition period-scaled precipitation and irrigation across demand, actual ET, runoff, recharge, and soil storage.
6. Advance a distributed linear groundwater reservoir with the analytical constant-inflow solution inside each bounded timestep. Initial storage plus recharge is partitioned into baseflow, capacity overflow, final storage, and residual.
7. Route surface runoff and baseflow separately, then combine them for period discharge and annualized discharge layers.
8. Estimate RUSLE-structured gross detachment and route sediment subject to a runoff, slope, cover, and roughness-sensitive transport capacity. Deposition plus outlet export closes to detachment.
9. Build climate, moisture, slope, vegetation, imperviousness, and barrier-constrained habitat suitability; label patches; and calculate resistance-weighted local connectivity and bottlenecks.
10. Recompute twelve independent gates. The report does not hide a failed process inside a single average score.

## Ledgers And Layers

The response contains separate `waterBudget`, `subsurfaceBudget`, and `sedimentBudget` objects plus an `ecology` outcome summary. With `includeLayers: true`, the response adds:

- depression-resolved elevation, fill depth, and slope;
- a dominant receiver plus sparse MFD offsets, target indices, and fractions;
- contributing area, period discharge, and annualized discharge;
- reference ET, actual ET, runoff, recharge, and soil storage;
- groundwater storage, saturation, baseflow, water-table depth, and residual;
- gross detachment, deposition, sediment outflow, and transport capacity;
- habitat suitability, local connectivity, and patch identifiers.

`flowReceiver` remains available as the dominant target for renderer and river-network compatibility. Fractional routing consumers should use the sparse target arrays.

## Interpretation Boundary

- MFD represents divergent terrain routing; it is not a two-dimensional hydraulic solution.
- The groundwater module is a distributed linear reservoir; it does not solve three-dimensional saturated flow or boundary heads.
- The sediment module uses RUSLE structure and transport-limited mass accounting; it is not the USDA RUSLE2 program and is not calibrated sediment yield.
- Habitat connectivity is a resistance-weighted raster graph diagnostic; it is not a population-genetic estimate or a full circuit-network solve.
- Derived radiation, rainfall erosivity, soil erodibility, aquifer properties, or habitat preferences must be replaced with defensible site inputs before real-world interpretation.

Method structure follows [FAO-56](https://www.fao.org/4/X0490E/x0490e00.htm), the [NRCS direct-runoff handbook](https://directives.nrcs.usda.gov/sites/default/files2/1754923466/Subpart%20H%20%E2%80%93%20Estimation%20of%20Direct%20Runoff%20from%20Storm%20Rainfall.pdf), [Freeman's MFD formulation](https://doi.org/10.1016/0098-3004(91)90048-I), the [USGS PRMS groundwater reservoir](https://pubs.usgs.gov/of/2002/ofr02362/htdocs/gwflow/gwflow_prms_min.htm), [USDA RUSLE2 process documentation](https://www.ars.usda.gov/southeast-area/oxford-ms/national-sedimentation-laboratory/watershed-physical-processes-research/research/rusle2/revised-universal-soil-loss-equation-2-how-rusle2-computes-rill-and-interrill-erosion/), and [McRae's isolation-by-resistance framework](https://doi.org/10.1111/j.0014-3820.2006.tb00500.x). GeoLab implements bounded screening formulations informed by these sources, not drop-in replicas of their complete models.

## API And Development

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Engine and API readiness. |
| `GET /v1/capabilities` | Limits, routing methods, processes, and output layers. |
| `POST /v1/validate` | Validate a request without simulating. |
| `POST /v1/simulate` | Run the complete bounded process chain. |

```powershell
cargo fmt --manifest-path engine/Cargo.toml --all -- --check
cargo clippy --manifest-path engine/Cargo.toml --workspace --all-targets -- -D warnings
cargo test --manifest-path engine/Cargo.toml --workspace
cargo build --release --target wasm32-unknown-unknown --manifest-path engine/Cargo.toml --package geolab-wasm
cargo run --release --manifest-path engine/Cargo.toml --package geolab-server -- --port 48129
```

The WebAssembly boundary exchanges UTF-8 JSON through explicit allocation, simulation, capability, and deallocation exports. `outputs/geo-sim/src-ts/wasmAbi.ts` owns memory validation and decoding; `rustKernelWorker.ts` keeps numerical execution off the rendering thread. CI instantiates the produced module and runs a complete scenario through this ABI.
