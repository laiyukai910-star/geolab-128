# Contributing to GeoLab 128

Thanks for improving GeoLab 128. This project values transparent assumptions, reproducible behavior, and careful communication of model limits.

## Before You Start

- Search existing issues and pull requests before opening a new one.
- Describe whether a proposal affects visualization, exploratory simulation, data import, validation, or documentation.
- Do not present an exploratory output as a measured, calibrated, or operational result unless the supporting evidence is included.

## Development Setup

```powershell
cd outputs/geo-sim-desktop
npm ci
npm run vendor
npm run start
```

The browser application lives in `outputs/geo-sim`; the Electron wrapper is in `outputs/geo-sim-desktop`.

## Pull Requests

1. Create a focused branch from `main`.
2. Keep each pull request limited to one coherent change.
3. Explain the user-facing effect and any model, data, or validation implication.
4. Add or update checks when behavior changes.
5. Run the relevant local verification before requesting review.

At minimum, validate changed JavaScript files with `node --check <file>`. For UI changes, also check desktop and mobile layouts, interactions, and console errors.

## Model and Data Changes

For changes involving terrain, climate, hydrology, hazards, ecology, or data adapters, include:

- the intended domain and scale;
- the assumptions and known limitations;
- input units, coordinate-reference expectations, and provenance where relevant;
- an update to documentation or quality-gate behavior when the interpretation changes;
- a benchmark, regression case, or a clear reason it cannot yet be supplied.

Avoid adding claims of accuracy without a documented validation method and representative evidence.

## Documentation Style

Use direct English. Distinguish clearly among `implemented`, `demonstrated`, `calibrated`, and `validated`. Keep teaching examples marked as examples rather than real-world predictions.

## Security and Safety

Do not commit secrets, private source data, personally identifiable information, or restricted datasets. Report security concerns privately to the repository owner rather than opening a public issue.
