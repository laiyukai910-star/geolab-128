# GeoLab 128

![GeoLab 128 preview](outputs/geo-sim/preview.png)

GeoLab 128 is a local, GPU-accelerated 3D geographic simulation sandbox. It brings terrain, climate, wind, hydrology, vegetation, ecological blocks, built infrastructure, and wildlife communities into one interactive scene for regional scenario exploration and visualization.

The default scene covers `128 km × 128 km`. You can switch to a smaller local sandbox or a `256 km × 256 km` regional extent. Core rendering and modeling run offline, while the application provides data import, surface editing, ecology releases, diagnostics, and exports.

> [!IMPORTANT]
> GeoLab 128 is intended for teaching, option comparison, and exploratory scenarios. For research or engineering decisions, import quality-controlled DEM, river-network, land-cover, soil, and meteorological data, then perform independent calibration and professional review. Procedural terrain is not a measured dataset.

## Capabilities

| Area | What it provides |
| --- | --- |
| Terrain and subsurface | Square areas from 8 to 256 km; elevations up to 10,000 m; local refinement up to 4096 × 4096 cells; surface, transect, subsurface-solid, and volume-ledger views. |
| Climate and wind | Temperature, humidity, latitude, lapse rate, wind direction, wind speed, and terrain exposure are coupled through orographic and rain-shadow approximations. |
| Hydrology and landforms | Priority-Flood depression handling, D8/MFD/D∞ flow routing, river extraction, runoff, erosion, deposition, flood, drought, and landslide-risk layers. |
| Built infrastructure | Add high-rises, apartments, villas, industry, civic buildings, landmarks, transport, and water infrastructure at selected blocks or map positions. Environmental suitability and land-surface feedback are evaluated automatically. |
| Ecosystems | 36 regional wildlife species, 7 ecological functional guilds, carrying capacity, habitat suitability, migration corridors, food webs, and batch wildlife release scenarios. |
| 3D assets | 109 internal semantic procedural asset types for rock, vegetation, building facades, water infrastructure, energy, transport, and animal anatomy. No online model service is required. |
| Templates and source data | 15 global and regional templates couple terrain, climate, wind, hydrology, vegetation, and regional fauna. External DEM, soil, land-cover, vegetation, weather, and river-network data are supported. |
| Export and audit | Export GeoJSON, CSV, parameters, quality reports, sensitivity analysis, and block, infrastructure, or subsurface diagnostics. |

## Quick Start

### Run the web application

Prerequisite: Python 3 or any static HTTP server.

```powershell
cd outputs/geo-sim
python -m http.server 4174
```

Open <http://127.0.0.1:4174/>. The first load generates the default scene. A desktop browser with WebGL2 and a discrete GPU is recommended.

### Run the desktop application

Prerequisite: Node.js 20+ and npm.

```powershell
cd outputs/geo-sim-desktop
npm install
npm run start
```

The Electron build starts a local server and prefers a high-performance GPU, hardware WebGL, GPU rasterization, and local offline resources.

## Your First Scenario in Five Steps

The interface defaults to English and includes an English / Simplified Chinese selector at the top of the right-side drawer. The Chinese labels below remain as a cross-reference for existing local users.

### 1. Set the study extent and terrain baseline

1. Open the **Terrain** drawer (`地形`) on the right rail.
2. Select an extent from 8 to 256 km. The default 128 km extent is useful for watershed- or metropolitan-scale scenarios.
3. Choose a DEM resolution. Start with 256² for exploration, then use local refinement when a smaller area needs closer inspection.
4. Select a geomorphology preset, scenic preset, or continental template, then apply it to rebuild the scene.
5. Use the terrain brush to add ridges, valleys, or engineered disturbance. Brush radius and strength use sliders; all other model conditions are direct numeric fields.

### 2. Configure natural conditions

Enter temperature, humidity, wind direction, wind speed, precipitation, permeability, and hydrologic thresholds in the **Weather** (`气象`) and **Hydrology** (`水文`) drawers. A rerun updates:

- windward and leeward precipitation differences;
- local wind fields, terrain exposure, and canopy roughness;
- runoff, accumulation, channels, wetness, and erosion risk;
- time-dependent flood, drought, wildfire, and landslide layers.

The 15 templates are useful starting points, including East Asian monsoon, Alpine Europe, Andes-Amazon, African Rift savanna, Australian interior/coast, and Antarctic plateau. A template is a parameter set, not a ready-made real-world dataset.

### 3. Add infrastructure and assess its fit

1. Open the **Data** drawer (`数据`) and locate **Manual infrastructure** (`手工人造设施`).
2. Select a map area or enter a location, influence radius, and facility type.
3. Set building height, floors, density, and landmark height, then add the feature.
4. Inspect feedback to imperviousness, roughness, retention, urban heat, water demand, vegetation, and hazard layers.

Facilities are not rendered as a single colored block. High-rises, apartment buildings, villas, industry, civic facilities, and landmarks use distinct procedural components such as podiums, roofs, facade bands, window grids, balconies, railings, mechanical equipment, service yards, and flood-, slope-, or drainage-adaptation details.

### 4. Build an ecological scenario and release wildlife

1. Open the **Layers** drawer (`图层`) and enable the ecology and wildlife 3D layers.
2. Choose a species, batch size, and target habitat. You may also target a specific block ID.
3. Use **Add release batch** (`加入投放批次`) to queue multiple batches, then choose **Execute all batches** (`执行全部批次`).
4. Review survival rate, active species, food-web links, trophic balance, and limiting ecological functions.

Wildlife is rendered in anatomy-part batches: torso, head, neck, legs, wings, horns, tusks, tails, and related parts share instanced meshes. This preserves visible species differences without duplicating a complete mesh set for every individual.

### 5. Inspect, compare, and export

Use the **Layers** drawer to switch between elevation, slope, hydrology, rivers, wind, ecological connectivity, infrastructure impact, and hazard views. The **Export** drawer (`导出`) can produce:

- GeoJSON river networks, watershed boundaries, and infrastructure geometry;
- CSV grids, subsurface volumes, time series, infrastructure suitability, and ecological diagnostics;
- current parameters, quality gates, source-data audits, and uncertainty reports.

For clean scenario comparison, change one major condition at a time and export the parameters and report before beginning the next run.

## Data Import and Model Confidence

The application accepts DEM, soil HSG, land cover, vegetation cover/canopy height, weather boundary fields, observed river networks, infrastructure GeoJSON, and calibration CSV/JSON. Imported data takes priority as a constraint for the corresponding model layer.

Runs without DEM, soil, weather, river-network, or calibration data are explicitly treated as demonstration-grade scenarios. This is intentional: it prevents procedural output from being presented as a validated research or engineering result.

See the [web application technical documentation](outputs/geo-sim/README.md) for detailed formats, algorithms, and quality gates.

## Performance and Display Guidance

- For general exploration, use a 128 km extent, 256² DEM, and the default 3D detail level.
- To inspect building appearance, switch to a 16 or 32 km extent and move the camera closer.
- For high-detail inspection, use local refinement instead of starting with the largest grid across the entire map.
- The wildlife 3D layer is on demand. You can tune ecological rules first, then enable animal meshes when you want to inspect the visual result.
- The desktop build was validated on an NVIDIA RTX GPU through WebGL2/D3D11. Actual frame rate depends on extent, resolution, visible instances, and available graphics hardware.

## Build Offline Applications

```powershell
cd outputs/geo-sim-desktop
npm run package:win
npm run package:portable
```

Directory and portable builds are written to `outputs/GeoLab-128-Local` and `outputs/GeoLab-128-Portable`. They are local build artifacts and are intentionally excluded from Git.

## Repository Layout

| Path | Purpose |
| --- | --- |
| `outputs/geo-sim` | Three.js web application, offline resources, and technical documentation |
| `outputs/geo-sim/src/geoEngine.js` | Terrain, hydrology, climate, hazards, export, and source-data quality logic |
| `outputs/geo-sim/src/terrainRenderer.js` | Three.js scene, instanced rendering, 3D layers, and GPU diagnostics |
| `outputs/geo-sim/src/proceduralAssets.js` | Factory for 109 semantic procedural asset types |
| `outputs/geo-sim/src/landscapeEcology.js` | Wildlife, ecological blocks, food webs, migration, and release simulation |
| `outputs/geo-sim/src/continentTemplates.js` | Continental and regional parameter templates |
| `outputs/geo-sim-desktop` | Electron desktop wrapper and packaging scripts |
| `outputs/本地运行说明.txt` | Windows local-run notes in Simplified Chinese |

## Validation Status

The current version has passed the following checks:

- all `109/109` procedural asset factories build successfully;
- desktop and mobile browser regression checks report no script errors or mobile horizontal overflow;
- batch release, regional species filtering, instanced wildlife rendering, and continental-template coupling passed interaction tests;
- both directory and single-file portable desktop builds passed offline smoke tests with no external resource requests.
