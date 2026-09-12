# River Reconstruction

## Hydraulic Computation

Channel normal depth is solved in SI units using the finite rectangular section:

`A = b y`, `P = b + 2 y`, `R = A/P`, `Q = A R^(2/3) sqrt(S) / n`.

A bracketed depth search replaces the wide-channel `R ~= y` approximation.
Velocity is `Q/A`; it is not independently clipped after solving. Mean boundary
shear uses `rho g R S`. Zero discharge gives zero channel depth and velocity.
Unit tests invert 20 independently specified width/depth sections, check stored
Float32 discharge consistency, and exercise dry, invalid and limited states.

The method follows the uniform-flow definition described in the
[USBR Water Measurement Manual](https://www.usbr.gov/tsc/techreferences/mands/wmm/chap02_16.html)
and the [USACE normal-depth model](https://www.hec.usace.army.mil/confluence/hmsdocs/hmstrm/channel-flow/normal-depth-model).
GeoLab does not implement HEC-RAS or HEC-HMS.

Important assumptions remain:

- Width is an estimated regional-grid quantity, not a measured cross section.
- Roughness is estimated from surface properties.
- The representative channel flow retains the existing 2.35 multiplier on mean
  discharge. It is not a calibrated design flood or return-period estimate.
- The existing energy-slope range of 0.00003 to 0.35 is retained and counted when
  applied. A truly horizontal reach has no positive uniform normal-flow solution.
- Depths exceeding the numerical search limit are flagged, not called converged.
- Supercritical conditions are counted. Hydraulic jumps, backwater, structures,
  flood-wave propagation and turbulence require different models.
- Non-channel sheet-flow diagnostics retain their previous approximation.

`stats.hydraulicDiagnostics.normalDepth` records the method, solved/dry/limited
counts, slope regularization, supercritical counts and maximum relative residual.
The solver runs inside the existing model workflow; it is not a new Rust solver.

## Connected Mesh

The river display graph retains supplied directions and deduplicates repeated
links. Invalid endpoints and cycle-affected components are counted and omitted
from display without changing simulation arrays. The graph has an explicit edge
budget and reports truncation. Components downstream of a cycle are also excluded.

Ordinary reaches share cross-section vertices. At confluences and divergences,
each branch has its own mouth, connected by a star-shaped triangulated patch.
Tests reject edges shared by more than two triangles. Junction display widths may
narrow to prevent overlapping mouths; these are display dimensions only.

Interior cross sections follow smoothed centerlines and sampled terrain height.
Water is represented above the supplied terrain with modeled depth; this change
does not excavate channels, generate surveyed bathymetry or solve water-surface
profiles. Rising endpoint heads are recorded rather than silently rerouted.
Network coordinates keep animated wave phase continuous at shared vertices.
Wave animation and opacity are appearance models, not measured optical properties.

## Surface Detail

Vegetation, topographic wetness, impervious coverage and active channel masks
screen exposed rock and scree display density. Erosion and deposition risk affect
mineral exposure. These bounded rules do not infer lithology, grain-size sorting,
rockfall runout or actual deposited sediment thickness.

## Verification

- `outputs/geo-sim/tests/riverReconstruction.test.mjs`: numerical, graph, mesh,
  model integration and data-isolation checks.
- `outputs/geo-sim/tests/fixtures/river-reconstruction.html`: synthetic junction
  scene using the production river and terrain materials, not a surveyed location.
- Desktop browser checks at 1600 x 900 and 2560 x 1440, with orbit, animation and
  nonblank canvas checks; full-app rebuild and volume views are checked separately.
