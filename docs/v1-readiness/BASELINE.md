# v1 Hardening Baseline

Recorded from local checks on 2026-09-05. This is a starting-point record,
not a v1 readiness decision. Existing tests passing does not establish
calibration, predictive accuracy, or complete cross-system coverage.

## Source and Environment

- Tested commit: `b4137c544c77e0e0402aafaea856c41c7f1f2be6`.
- Product version: `0.6.0`.
- Hardening branch: `codex/v1-content-hardening`.
- Operating system: Windows, build `10.0.26200.0`.
- Rust: `1.96.0 (ac68faa20 2026-05-25)`.
- Node.js: `24.16.0`.
- npm: `11.13.0`.
- Electron dependency: `43.1.1`.

## Build and Test Results

All commands below completed successfully against the tested commit.
Rust commands ran from the repository root; npm commands used
`--prefix outputs/geo-sim-desktop`.

| Check | Result |
| --- | --- |
| `rustup show` | Configured toolchain available |
| `cargo fmt --manifest-path engine/Cargo.toml --all -- --check` | Passed |
| `cargo clippy --manifest-path engine/Cargo.toml --workspace --all-targets -- -D warnings` | Passed |
| `cargo test --manifest-path engine/Cargo.toml --workspace` | 21 tests passed: core 14, server 5, WASM 2 |
| `npm ci` | Passed |
| `npm run typecheck` | Passed |
| `npm run browser:build` | Passed |
| `npm run wasm:build` | Passed |
| `npm run backend:build` | Passed |
| `npm audit --audit-level=high` | Zero reported vulnerabilities at check time |

Every existing `outputs/geo-sim/tests/*.test.mjs` file was invoked directly
with Node and passed:

- `assetPipeline.test.mjs`
- `backendClient.test.mjs`
- `landscapeEcology.test.mjs`
- `modelKernel.test.mjs`
- `modelWorkerClient.test.mjs`
- `physicalCouplingInterop.test.mjs`
- `scenarioSynthesis.test.mjs`
- `wasmKernel.test.mjs`

## Desktop Runtime

After the builds, Playwright launched the existing Electron application
entry point. This exercised the application directly, not the literal
`npm start` wrapper. The native Rust sidecar supplied authoritative surface
layers at startup and after each recorded rebuild.

The initial 256 x 256 scenario took approximately 5.71 seconds from the
application's page-boot timestamp to its ready timestamp. Subsequent rebuilds
used the default regional scenario with base temperature set to 19 C.

| Grid | Rebuild to ready | Reported engine time | Reported render time | Native commit | Process gates |
| --- | ---: | ---: | ---: | --- | --- |
| 128 x 128 | 1.84 s | 1.57 s | 0.19 s | Applied | 13 passed, 0 failed |
| 256 x 256 | 4.87 s | 4.06 s | 0.64 s | Applied | 13 passed, 0 failed |
| 512 x 512 | 19.55 s | 16.82 s | 2.25 s | Applied | 13 passed, 0 failed |

These are single observations, not statistical benchmarks. Engine time
includes reconciliation work; render time is the application's staged-render
measurement. They do not cover large-grid memory use or all feature settings.

The harness recorded no page errors or external requests after its listeners
were attached. Those listeners were attached after the first window became
available, so this does not certify the entire startup as offline or error-free.
The run captured the canvas and closed Electron successfully. No separate
pixel-distribution assertion or full child-process shutdown audit ran here.

## Incomplete Checks and Warnings

- Static-browser runtime verification did not start: Playwright's configured
  Chromium headless executable was absent. This is a test-environment failure,
  not evidence of an application failure. The Node-based WASM test did pass.
- Full native/browser scenario parity, failure injection, cancellation,
  persistent temporal state, import fixtures, and grids above 512 x 512 remain
  outside this baseline's runtime coverage.
- npm reported deprecated transitive packages including `inflight`, `rimraf`,
  `glob`, and `boolean`. The audit reported zero vulnerabilities; deprecation
  warnings remain distinct from that result.
- The first automation attempt referenced an Electron executable before its
  lazy installation. Resolving Electron through its package entry point
  installed the binary and allowed the desktop run above to complete.

## Next Check

Complete the remaining baseline runtime check, then build the content matrix
incrementally. The first focused P0 regression should cover a nonresponding
model Worker: bounded failure, retirement, and a successful subsequent request.
An additional audit candidate is failure during downstream rebuilding after
Rust surface layers have been applied. Neither candidate is recorded as fixed.

Local raw records remain under ignored `artifacts/`: `baseline-checks.json`,
individual `baseline-*.log` files, and `baseline-runtime.json`.
