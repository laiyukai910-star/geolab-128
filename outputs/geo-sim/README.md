# GeoLab 128 地理演算程序

GeoLab 128 是一个用于 4-512 km 区域情景的交互式地理系统实验室。它把三维地形、二维分析、气候、水文、地下结构、生态、动物、人造设施、时间灾害和数据证据放在同一个可编辑状态中，并通过浏览器演算引擎与 Rust 独立复核核心提供两条计算路径。

## 运行

开发环境推荐从 `outputs/geo-sim-desktop` 执行 `npm start`。该命令会构建 Rust sidecar 并启动 Electron；发布包则由 `npm run package:win` 或 `npm run package:portable` 生成。桌面运行时内置 Chromium、Three.js、GeoTIFF 解析器和本地 Rust API，核心演算不依赖外部网页。在线数据检查仅在使用者主动调用时联网。

需要调试源码时，也可以在本目录启动静态服务器：

```powershell
python -m http.server 5179 --bind 127.0.0.1
```

然后访问 `http://127.0.0.1:5179/`。

如需在静态模式连接 Rust 核心，可单独运行 `geolab-server`，并在页面 URL 后附加 `?backend=http://127.0.0.1:48129`。Rust 核心使用严格类型输入、独立点间距/支撑面积、Priority-Flood、D8 拓扑汇流、蒸散与水量分配，并输出单独的物理门禁报告。

## 已实现能力

- 可变沙盘边长：4、8、16、32、64、128、256、512 km；默认 128 km × 128 km、256² DEM，约 502 m 单元。
- 网格精度独立于沙盘面积，可切换 128² 到 4096²；单元大小会随沙盘边长实时重算。
- 程序化地形生成：分形噪声、脊状噪声、构造抬升带、边缘陆架与坡面预处理。
- 真实数据接入：支持 DEM GeoTIFF/CSV/JSON、土壤 HSG、土地覆盖、植被覆盖/冠层高度、气象边界场、真实河网 flowlines、城镇/乡村/水利设施 GeoJSON、校准 JSON/CSV；每个入口可多文件批量加载。
- 真实样区采集计划：可输入中心经纬度、边长、气象年份和 USGS 站号，生成 DEM、土壤、土地覆盖、气象和校准数据的源 URL 与导入 pipeline。
- 在线源检查：可对采集计划中的 TNM DEM、Daymet 单点和 USGS 水文服务做可用性探测，生成产品候选 manifest。
- 范围感知重采样：导入图层的 `boundsKm` / GeoTIFF bounding box 会参与采样，目标范围优先跟随真实 DEM，图层范围外会作为 NoData 或未知类别处理。
- 用户自定义：种子、沙盘边长、网格精度、最高 10,000 m 的地形起伏、山脊权重、构造抬升、海平面、亚格细节、真实数据权重、风向、风速、温度、湿度、纬度、温度递减率、渗透率、河流阈值、侵蚀强度、植被反馈、校准强度、垂直夸张。
- 地形编辑：二维分析图上用笔刷抬升、削低、平滑、粗糙化。
- 水文逻辑：Priority-Flood 洼地填平、D8 最陡降流向、MFD 多流向汇流、D∞ 连续坡向双接收格分流、汇流面积、基于土壤-土地覆盖-植被和人造下垫面的径流系数、真实 flowline 河道约束、近似 Strahler 河流阶数、河网 GeoJSON 导出，以及按出口反向追踪的流域圈定 JSON/CSV。
- 校准诊断：支持降水偏差、温度偏差、径流倍率、流量尺度和观测流量；统计中输出模拟出口年径流量、观测年体积和偏差百分比。
- 时变气象边界：日尺度或网格气象时序会生成逐年降水、极端日降水、最长干旱连续日、热/冻日比例和风暴分位数，并驱动当前年气候、洪水、干旱、野火与滑坡风险。
- 科研数据适配审计：逐层检查真实 DEM、土壤、土地覆盖、植被、气象、河网、人造设施和校准数据的覆盖率、源像元、重采样、NoData/填补、限制因子、推荐模型分辨率和下一步补数建议。
- 科研验证门控：把数据就绪度、必需输入、校准顾问、日尺度水文过程、水量平衡、真实河网、人造设施反馈、灾害时间状态和不确定性要求整理成 pass/warning/block 门控清单。
- 物理时间进程：逐年更新土壤水库、蒸散、补给、产流、人造设施滞留/取水、植被恢复/损失、灾害暴露和侵蚀累积，输出过程状态 JSON/CSV。
- 人造设施影响图谱：按城镇、高层、住宅、水库、渠道、道路、工业、绿地等类型汇总不透水面、热环境、径流增量、蓄滞、供需、建筑体量和灾害暴露，并给出中文后续校准建议。
- 气象逻辑：按气象风向解释“风来自某角度”，用迎风坡抬升、背风雨影、下沉增温、纬度修正和海拔温度递减率估算降水/温度。
- 气候分区：基于年均温、合成年温差、年降水和干燥阈值的 Köppen-Geiger 风格分类。
- 可视化图层：高程、气候、降水、温度、汇流、坡度、植被覆盖、冠层高度、叶面积指数、局地风场、实际蒸散、水量平衡、土地覆盖、土壤、径流系数。
- 派生诊断：坡向、地形湿润指数、逐栅格局地风速/风向、LAI、根系抗蚀、冠层截留、实际蒸散、水量平衡、外部图层覆盖率和校准偏差会写入统计/导出。
- 精细检查：二维分析图支持亚像元双线性读数、WGS84 近似经纬度读数和可配置 17/33/65 源格局部放大窗，用于检查高分辨率栅格的局部差异。
- 三维细节：相机焦点跟随地图中心地表高程并限制穿地缩放，支持亚格细节控制、精细地表构件层、多类型 3D 植被群落，以及可开关的植被实例层。
- GPU 精细渲染：高性能 GPU 请求、WebGL2、高精度着色器、对数深度、ACES 色调映射，以及“高/超精细/穷尽精细”三级实例预算与曲面细分。
- GPU 调度增强：桌面版启用 GPU 合成、GPU/OOP 光栅化、零拷贝、原生 GPU 内存缓冲和 4-8 个光栅线程；超精细与穷尽精细模式分别使用 1.2 倍和 1.5 倍超采样，并行预热首屏与完整场景着色器管线。
- 桌面高优先级：Browser、Renderer 和 GPU 进程持续请求高优先级，其他 Electron 服务请求高于普通优先级，同时阻止演算期间系统挂起和后台计时降频。
- 加载加速：Worker 使用 Transferable 零复制返回大型栅格缓冲；首屏仅构建地形、河流和默认植被，地下、风场、灾害、动物及诊断层按需创建。区块微模型复用同一次环境状态，延迟图层使用 Chromium 高优先级任务队列，本地模块通过固定端口和 ETag 复用缓存。
- 动物精细模型：马鹿、岩羊、野猪、狼、棕熊、赤狐、水獭、湿地鹤、金雕和山兔拥有独立生态位、迁徙状态与多部件动画模型，并细分角、耳、吻、喙、爪、翼和尾部。
- 人造设施精细建模：高层使用多级退台放样，居民楼使用围合平面，小洋房使用 L 形体量和四坡脊屋顶，工业设施使用锯齿屋面，公建使用多翼平面，地标使用曲面旋转体；窗格、阳台、屋顶机电、天线及设施微构件继续按类型联动生成。
- 工作区布局：桌面端使用右侧工具轨和单抽屉，移动端使用底部工具栏和底部抽屉；默认只展示清晰基础场景，分析层由使用者在“图层”抽屉中明确开启。
- 语义三维资产：109 类内部程序化资产以曲线、挤压、旋转体、桁架、肋板、非规则多面体和多部件装配构造植被、岩体、建筑、交通、水利、能源与动物解剖，不依赖在线模型服务。
- 全球生态模板：提供 15 套全球与区域模板，联动地貌、温度、降水、风、水文、植被、区域物种和随机种子；生态系统包含 36 类动物、7 个功能群、食物网与区块迁徙。
- 生物投放：可在右侧分析抽屉中编排多个物种、数量、目标栖息地和可选区块，批量执行后保留适生度、存活率和生态功能结果。
- 自然条件表单：除地形笔刷半径与力度外，气候、水文、地形和生态公式参数均以完整展开的数值表单呈现，不使用折叠式滑动面板。
- 界面汉化：主要按钮、下拉项、实时状态、校准顾问、时间灾害控制、局部精细化导出和质量报告审计提示已切换为中文；CSV/JSON 字段名仍保留英文以便 GIS、脚本和既有测试兼容。
- 高分辨率执行：模型演算通过 Web Worker 后台执行，网格选项已扩展到 1536²、2048²、3072² 和 4096²。
- 导出：生态完整性 JSON、物种诊断 CSV、跨系统情景综合 JSON、情景简报 Markdown、河网 GeoJSON、流域圈定 JSON、流域格网 CSV、科研数据适配审计 JSON/CSV、科研验证门控 JSON/CSV、人造设施影响图谱 JSON/CSV、格网 CSV、局部精细 CSV、灾害事件 JSON、时间序列 CSV、物理时间进程 JSON/CSV、参数 JSON 和质量报告。

## 生态与地理严谨性

- 面积与体积统计使用“地图面积 / 栅格点数”的支撑面积，坡度、流向和距离仍使用真实点间距，避免分辨率改变时总面积系统性偏大。
- 生态区块增加 `P/PET` 干湿度分区、气候—植被一致性、边缘压力、有效生境面积和核心生境代理。
- 物种生态位改为限制因子主导的加权几何响应，承载力同时受可用面积、区域亲和力、功能连通性、人造干扰和灾害压力约束。
- 食物网按代表性成年体重换算站立生物量，捕食者承载力受猎物生物量支持限制，不再直接比较跨体型物种的个体数。
- 生态完整性报告输出 Shannon 多样性、Hill 数 q1/q2、Pielou 均匀度、功能群代表性、营养资源支持和全部分项权重，可导出 JSON 与物种级 CSV。
- 区域模板不匹配或缺少可用生境的投放批次会被零存活拦截；报告仍明确要求疾病、遗传、法律、利益相关者、现场生境和投放后监测审查。

这些指标属于教学与情景筛查，不等同于现场生物多样性调查、种群生存力分析、保护等级判定或投放许可。

## Cross-System Scenario Synthesis

The Export drawer now begins with a live synthesis of the current run rather than presenting only a long list of disconnected files. It combines eight domains: terrain, climate and wind, water and sediment, ecology and wildlife, subsurface, built environment, time and hazards, and evidence and validation.

The synthesis keeps two concepts separate:

- `coveragePct` records whether a system is actively represented by the current model state.
- `evidencePct` records the degree to which imported or observed sources constrain that system.

These values are completeness and provenance diagnostics. They are **not** accuracy, calibration, certification, or professional-fitness scores. A fully represented procedural domain can therefore show high coverage and low evidence at the same time.

The report also records explicit coupling pathways and purpose-aware priorities. Selecting systems learning, hypothesis exploration, intervention comparison, risk communication, or validation design changes which gaps are emphasized. JSON export preserves structured metrics and bilingual labels; Markdown export produces a concise handoff brief with the prototype boundary and assumptions included.

## 真实数据格式

## 真实样区采集计划

在“真实数据”面板填写 AOI 后点击“生成采集计划”，程序会导出 `geolab-128-acquisition-plan.json`。计划包含：

- WGS84 bbox 和当前沙盘边长对应的样区范围。
- USGS TNM Access DEM 产品查询 URL，包括 1 m DEM、1/3 arc-second fallback，以及可由 Cloudflare `/tnm/dem-products` 标准化返回的排序候选清单。
- USDA-NRCS gSSURGO/SSURGO 土壤字段建议。
- MRLC NLCD / Tree Canopy Cover 土地覆盖与冠层数据入口。
- Daymet 单像元快速筛查 URL，以及 gridded NCSS 子集入口说明。
- Cloudflare `/daymet/grid-sample` 可把 Daymet 单点日尺度 API 采样成 AOI 气象栅格，并输出与 USGS 日流量可重叠的 daily forcing。
- PRISM 气象数据备选入口。
- USGS NHDPlus HR flowline 查询入口，用于真实河网约束。
- OpenStreetMap / Overpass 城镇、乡村、道路、渠道、水库、大坝等人造设施入口，用于下垫面和水利反馈。
- USGS Water Data APIs 与 legacy WaterServices 校准入口，legacy 服务会标注迁移风险。
- 下载、裁剪、投影、转换、导入和质量报告检查步骤。

这份计划是“可追溯数据管线”的前置产物，质量报告会把计划摘要一起写入，便于之后复现实验。

点击“在线检查源”会生成 `geolab-128-source-manifest.json`。manifest 会记录：

- TNM DEM 查询或 Cloudflare DEM discovery 的 HTTP 状态、总产品数和最多 8 个候选产品的标题、格式、估算原生像元、下载 URL 和元数据 URL。
- Daymet 单点接口的响应状态和前几行预览，用于快速确认中心点气象数据是否可访问。
- USGS legacy WaterServices 的校准数据状态；小 AOI 没有站点时会标成 warning，而不是静默失败。
- 需要手工 GIS 下载/裁剪的源，例如 gSSURGO、NLCD、PRISM，会保留为 manual 条目并写明导入期望。

浏览器 CORS 可能阻止某些 live check；这种情况 manifest 会写明错误，导出的 URL 仍可用于 GIS、Python 或命令行工作流。

## 可选 Cloudflare 数据代理

`cloudflare/` 目录新增了一个 Workers 数据代理骨架，用于部署后给浏览器提供受限 CORS 代理和后端采集计划：

- `GET /plan`：按 `lat`、`lon`、`sizeKm`、`startYear`、`endYear`、`gageSite` 生成 DEM、Daymet、USGS 校准、NHDPlus flowline 和 OSM/Overpass 人造设施 URL。
- `GET /proxy?url=<encoded source URL>`：只允许代理 TNM、NHD、Daymet、USGS Water Data / WaterServices、Overpass 等白名单主机，并以流式响应返回，避免把大数据一次性读入内存。
- `GET /tnm/dem-products`：按 AOI 查找 USGS 3DEP DEM GeoTIFF 候选，优先 1 m DEM，缺失时保留 1/3 arc-second fallback，并返回可审计的下载 URL、元数据 URL 和排序分数。
- `GET /daymet/grid-sample`：按 AOI 采样 Daymet 1 km 日尺度气象点，输出可直接导入的降水/温度 GeoLab 栅格和 `metSummary.dailySeries`，用于日尺度水文校准诊断。
- `wrangler.jsonc` 已设置 `compatibility_date` 和 observability，后续可直接用 Wrangler 接入部署流程。

这个代理不是开放代理；允许主机列表写在 `cloudflare/worker.js` 顶部，便于审计真实数据来源。
部署后，把 Worker 根 URL 填到界面的“数据代理 URL”字段，生成采集计划和在线检查源时会把每个可代理源写入 `proxyUrl`，浏览器端检查也会优先走代理。

界面中的“数据模板”按钮会导出 `geolab-128-data-schema.json`。JSON 栅格推荐格式如下：

```json
{
  "type": "geolab-grid",
  "width": 2,
  "height": 2,
  "boundsKm": [0, 0, 128, 128],
  "crs": "EPSG:4326 or projected CRS note",
  "nativeCellSizeM": { "x": 500, "y": 500, "unit": "metre" },
  "verticalUnit": "metre",
  "valueUnit": "mixed by layer",
  "dem": [124, 130, 142, 151],
  "landCover": [41, 41, 71, 82],
  "soilGroup": ["B", "B", "C", "D"],
  "vegetation": [0.82, 0.78, 0.46, 0.32],
  "leafAreaIndex": [4.8, 4.2, 1.2, 0.8],
  "canopyHeight": [18, 16, 1.2, 0.6],
  "precipitation": [980, 1010, 760, 690],
  "temperature": [12.4, 12.2, 13.1, 13.4],
  "windSpeed": [8.2, 8.1, 7.9, 8.0],
  "windDirection": [270, 270, 268, 269],
  "metTimeSeriesCsvColumns": ["date", "prcp_mm", "tmax", "tmin", "wind_speed", "wind_direction"],
  "griddedMetTimeSeriesCsvColumns": ["x_km", "y_km", "date", "prcp_mm", "tmax", "tmin", "wind_speed", "wind_direction"],
  "metVectorCsvColumns": ["x_km", "y_km", "date", "prcp_mm", "tmean", "u10", "v10"],
  "geoJsonPolygonProperties": ["NLCD", "HYDGRP", "vegetation_fraction", "lai", "canopy_height_m", "ksat_mm_hr", "awc_mm", "root_depth_m"],
  "flowlineGeoJsonGeometry": ["LineString", "MultiLineString"],
  "flowlineGeoJsonProperties": ["COMID", "GNIS_NAME", "stream_order", "length_km"],
  "infrastructureGeoJsonGeometry": ["Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon"],
  "infrastructureGeoJsonProperties": ["infrastructure_type", "radius_km", "impervious_fraction", "runoff_delta", "roughness_delta", "temperature_delta_c", "storage_mm", "flow_retention", "irrigation_mm", "vegetation_delta", "water_demand_mm", "building_density", "building_height_m", "floor_count", "landmark_height_m"],
  "calibrationTimeSeriesCsvColumns": ["date", "discharge_cfs"],
  "calibration": {
    "precipBias": 0.04,
    "tempBias": -0.3,
    "runoffMultiplier": 1.08,
    "dischargeScale": 0.96,
    "drainageAreaKm2": 6600,
    "contributingDrainageAreaKm2": 6400,
    "siteCode": "11266500",
    "siteName": "Example River near Test",
    "siteLatitude": 37.84,
    "siteLongitude": -119.55,
    "observedDischargeM3s": 2.4,
    "observedSeries": {
      "recordCount": 365,
      "unit": "m3/s",
      "meanDischargeM3s": 2.4,
      "p10DischargeM3s": 0.8,
      "p90DischargeM3s": 7.1
    }
  }
}
```

`boundsKm` 表示当前栅格覆盖的目标坐标范围；多个图层范围不一致时，程序会按各自范围重采样到模型目标范围。可选的 `nativeCellSizeM`、`verticalUnit` 和 `valueUnit` 会写入质量报告，用于判断真实源数据是否比当前模型网格更细或更粗。CSV 支持列名：`x/y` 或 `x_km/y_km`，以及 `elevation_m`、`landcover`、`soil_group`、`vegetation_fraction`、`lai`、`leaf_area_index`、`canopy_height_m`、`precip_mm_yr`、`temp_c`、`wind_speed`、`wind_direction`。只有一个 `value` 或 `data` 列时，会按上传入口角色解释。

GeoJSON FeatureCollection now supports Polygon and MultiPolygon rasterization, not only table-like point features. Local-grid polygons can include `bbox` and `crs: local-grid`; WGS84 polygons can use `crs: EPSG:4326` plus a geographic `bbox`, and the quality report will convert that bbox to local km when the AOI center is known. Useful polygon properties include `NLCD`, `gridcode`, `classvalue`, `HYDGRP`, `hsg`, `hydgrp`, `vegetation_fraction`, `lai`, `canopy_height_m`, `ksat_mm_hr`, `awc_mm`, and `root_depth_m`. Smaller polygons are painted after larger polygons so detailed inclusions override broad background classes.

Raster resampling is now layer-aware. Fine categorical rasters such as land cover and hydrologic soil group use target-cell majority resampling, continuous rasters such as DEM derivatives, NDVI, canopy, soil hydraulic fields, precipitation, temperature, and wind speed use target-cell window averaging when downsampled, and wind direction uses circular averaging so values near 0/360 degrees are handled physically. The quality report writes the actual resampling method for each imported layer.

Continuous raster values are normalized before they enter the model. `scaleFactor` / `addOffset` metadata is applied when present; DEM, canopy height, and root depth are converted to meters from feet, centimeters, or millimeters; precipitation and available water capacity are converted to millimeters; saturated hydraulic conductivity is converted to `mm/hr`; temperature is converted to Celsius; wind speed is converted to `m/s`; vegetation and impervious layers accept either fractions or percent. The quality report records the raw unit, normalized unit, applied scale/offset, conversion factor, and any normalization warnings.

Raster gaps are handled explicitly. After resampling, isolated NoData or out-of-bounds cells can be filled from the nearest valid target cell within an eight-cell limit, but the quality report preserves raw observed coverage separately from effective coverage and records the fill method, filled count, unfilled count, filled fraction, and maximum fill distance. Gap-filled cells should be treated as lower-confidence modeled support rather than directly observed source data.

Flowline GeoJSON supports `LineString` and `MultiLineString` in local-grid km coordinates or WGS84. Imported lines are projected onto the current `mapSizeKm` model grid, used to promote/expose river segments, and preserved in river GeoJSON with `source`, `flowline_constrained`, `flowline_name`, and `flowline_source_id` properties.

Infrastructure GeoJSON supports point, line, and polygon features for `urban`, `village`, `transport`, `industrial`, `dam`, `reservoir`, `canal`, `levee`, or `custom` classes. Optional physical feedback fields include `radius_km`, `impervious_fraction`, `runoff_delta`, `roughness_delta`, `temperature_delta_c`, `storage_mm`, `flow_retention`, `irrigation_mm`, `vegetation_delta`, and `water_demand_mm`. These feed the surface model as hardened cover, local heat-island change, water storage/retention, irrigation supply, vegetation change, water demand, and runoff response.

Infrastructure typologies now also include `highrise`, `apartment`, `residential`, `villa`, `commercial`, `civic`, `landmark`, `hospital`, `school`, `stadium`, `airport`, `rail`, `bridge`, `port`, `powerplant`, `wastewater`, `solar_farm`, `wind_farm`, `park`, `logistics`, `greenhouse`, and `quarry`. Optional 3D morphology fields are `building_density`, `building_height_m`, `floor_count`, and `landmark_height_m`; these are preserved in `externalInfrastructure` statistics and drive the procedural Three.js built-environment layer.

Time and hazard controls now separate the target simulation horizon from the displayed current year. Flood, drought, wildfire, landslide, cumulative erosion, and vegetation succession all expose current-year arrays for map colors, CSV export, cell readouts, quality reports, and the Three.js hazard overlay layer.

`geolab-128-hazard-event-scenario.json` adds event-scale screening for flood, drought, wildfire, and landslide scenarios. Each event reports affected/high/extreme severity area, primary event metric, built-environment exposure area, exposure by infrastructure type, water-control mitigation for floods, and the highest-severity hotspot cells. The report is explicit that this is a screening layer derived from the current model fields, not a certified 2-D hydraulic, fire-behavior, or geotechnical stability solver.

`geolab-128-time-progression.csv` exports the same time logic as an annual trajectory: cumulative flood/drought/wildfire/landslide/composite exposure, high-hazard area, erosion depth and volume, vegetation succession, generated runoff, outlet runoff, retained flow, evapotranspiration, and built-environment demand/supply volumes. The quality report includes a compact `timeProgressionSeries` summary with first/current/final years and method assumptions.

The export panel can now write `geolab-128-local-refinement.csv`, a nested local refinement tile centered on the current inspector pointer. The UI supports 17/33/65 source-cell windows and 8/16/32/64 subcell factors, with engine-side tile resolution capped at 4096 x 4096. It downscales the model fields with bilinear interpolation, deterministic subcell microrelief, local finite-difference slope/aspect, vegetation, hydraulic, and current-year hazard fields; the quality report records the same tile summary with source/refined cell sizes plus whether the refined cell size is observed DEM supported or model-downscaled.

The data panel also includes a manual infrastructure scenario editor. It can create local-grid point, line, and polygon GeoJSON features directly in the browser with the same feedback fields, then merges them with uploaded infrastructure layers for live simulation. Points use the X/Y center and influence radius; lines and polygons use semicolon-separated local-km coordinate pairs, allowing roads, canals, levees, reservoirs, industrial areas, towns, and villages to be sketched without leaving the app. The manual scenario can be exported as `geolab-128-manual-infrastructure.geojson` for reuse or GIS inspection.

Manual surface and climate patches can now be drawn as local-grid point, line, or polygon GeoJSON features without replacing imported rasters. Existing patch GeoJSON can also be uploaded through the Surface/climate patches input. A patch can override or adjust NLCD land cover, hydrologic soil group, vegetation fraction, LAI, canopy height, root depth, Ksat, AWC, imperviousness, roughness, local precipitation, temperature, wind speed, and wind direction. These patches are applied as a separate `surfacePatches` influence layer, so quality reports can show affected cells, affected area, patch classes, and whether the edits changed vegetation/soil/climate fields while preserving the provenance of real DEM, soil, land-cover, and meteorology inputs.

Quality reports now include an annual water-budget audit. `waterBudget` records precipitation volume, infrastructure water supply, actual evapotranspiration, infrastructure demand, generated runoff, outlet runoff, retained flow, storage capacity, outlet catchment fraction, and the residual storage/deep-loss term. `infrastructureBudget` separately summarizes affected area, equivalent impervious area, heat-modified area, storage capacity, water demand, water supply, and retained flow for built or water-control scenarios.

The water audit now has an explicit conservation form: precipitation plus irrigation is partitioned into allocated demand, actual evapotranspiration, generated runoff, groundwater recharge, soil-storage change, and an unresolved residual. Requested, allocated, and unmet infrastructure demand remain separate. Reference ET follows a FAO-56 Penman-Monteith structure using temperature, wind, humidity, pressure/elevation, extraterrestrial radiation, cloud screening, and bounded terrain-radiation adjustment. Where measured radiation and daily temperature extrema are absent, those terms are derived and the output remains screening-level. A representative NRCS curve-number event response constrains runoff tendency without treating the curve-number equation as a continuous infiltration model. Facility retention applies only to locally generated runoff, preventing repeated removal of the same routed upstream volume.

`physicalCoupling` adds eight gates for water closure, ET availability, energy terms, downslope routing, flow-accumulation continuity, raster-area closure, orographic response, and wildlife carrying capacity. It also reports eight directional system links and the limiting link. `geolab-128-physical-coupling.json` preserves the complete ledger and method references; `geolab-128-physical-coupling.csv` provides one row per gate or coupling.

The export drawer can also create `geolab-<size>km-unity-scene.zip` and `geolab-<size>km-unreal-scene.zip`. Each package includes an engine-valid 16-bit heightfield, five 8-bit surface masks, a local east/north/up vector set, a physical-coupling report, a machine-readable scene manifest, and import instructions. Unity packages use supported `2^n+1` RAW resolutions and TGA masks. Unreal packages use recommended Landscape R16 resolutions, R8 masks, and a RAW JSON sidecar. The manifest records byte order, south-to-north row order, PixelIsPoint semantics, local extent and engine origin, elevation quantization, axis conversion, scale, source provenance, and the absence or presence of a geographic anchor.

Hydraulic diagnostics now add a Manning-style physical layer on top of the runoff network. The model estimates channel/overland velocity, hydraulic width/depth, boundary shear stress, unit stream power, sediment-transport index, erosion risk, and deposition risk using discharge, slope, roughness, vegetation, root cohesion, infiltration, imperviousness, and real flowline constraints. These values are available as analysis layers, in river GeoJSON properties, in grid CSV columns, and in `hydraulicDiagnostics` inside the quality report.

The export panel now includes `geolab-128-uncertainty-report.json`. It runs a deterministic local ensemble that perturbs precipitation, temperature, soil hydraulic conductivity, available water capacity, permeability, river extraction threshold, vegetation feedback, and built-environment retention/runoff assumptions. The report records the baseline run, every perturbation run, P10/P50/P90 metric ranges, sensitivity scores, warnings, and an uncertainty class so calibration and water-budget claims are not treated as single-number truth.

Calibration advisor is now included in the live data panel and `geolab-128-quality-report.json`. It chooses whether observed discharge should be compared against the nearest modeled channel at the gage or against the model outlet, grades drainage-area comparability, station-to-channel distance, record length, flow-duration mismatch, discharge bias, and water-budget closure, then returns `advisor.qualityClass`, `advisor.overallScore`, `advisor.componentScores`, blocking warnings, and guarded parameter suggestions for `dischargeScale` and `runoffMultiplier`. The data panel can apply either the conservative discharge-scale suggestion or a split runoff/routing suggestion back into the scenario; the report records `appliedCalibrationAdvisor` so that calibration edits remain auditable. This is a diagnostic calibration assistant, not a substitute for a routed event hydrograph or professional watershed delineation.

Daily hydrograph diagnostics are available when a dated calibration discharge series overlaps a dated meteorology CSV. The importer preserves compact daily `observedSeries.samples` and meteorology `dailySeries`; the model runs a conceptual daily reservoir response using precipitation, temperature, soil storage, infiltration, imperviousness, vegetation, LAI, runoff coefficient, and the selected comparison discharge scale. The quality report writes `calibration.hydrograph.metrics.kge`, `nse`, correlation, variability ratio, bias ratio, RMSE, P10/P50/P90 flow-duration values, warnings, and a short paired-sample preview. If dated forcing does not overlap the gage record, the report marks the hydrograph diagnostic as unavailable instead of pretending a steady annual model is enough.

真实 GeoTIFF/COG 若带有 WGS84 / EPSG:4326 bbox，程序会用当前 AOI 中心点和沙盘边长把经纬度范围转换到本地 `0-mapSizeKm` 模型坐标，而不是把经纬度误当作 km。质量报告会输出 `crsInterpretation`、`sourceBoundsWgs84`、转换后的 `sourceBoundsKm`、GeoTIFF 原生像元标签、边界推导像元大小、源/目标重采样比例和单位提示；如果某个图层没有明确 CRS、范围不像本地 km、DEM 垂向单位缺失，或源数据相对模型网格过粗/过细，都会写入警告。

无坐标 CSV 现在会按入口角色识别为时间序列：

- 气象入口：包含 `date`/`year` 和 `prcp_mm`、`ppt_mm`、`rain_mm`、`tmax`、`tmin`、`tmean`、`temp_c`、`wind_speed`、`wind_direction` 等列时，会聚合成年降水、平均温度、平均风速和圆周平均风向，并作为 1×1 边界场重采样到整个 AOI。
- Gridded meteorology CSV can also include `x/y` or `x_km/y_km` with `date`/`year`. The importer aggregates each grid cell independently into annual precipitation, mean temperature, mean wind speed, and circular mean wind direction before resampling to the current AOI.
- Meteorology aliases include `tmax_c`, `tmin_c`, `wind_speed_ms`, `ws`, `ws_ms`, `wind_from_deg`, and `wdir`.
- Wind vector columns such as `u10/v10`, `wind_u/wind_v`, `u_wind/v_wind`, `uas/vas` are converted to wind speed and meteorological wind-from direction.
- 校准入口：包含 `date`/`year` 和 `discharge_m3s`、`flow_m3s`、`discharge_cfs`、`flow_cfs` 或 USGS `00060` 列时，会换算为 m³/s，计算均值、P10/P50/P90 和年度均值，并写入 `stats.calibration.observedSeries`。
Calibration CSV/JSON may also include `drainage_area_km2`, `drainage_area_sqmi`, `contributing_drainage_area_km2`, `site_code`, `site_name`, `site_latitude`, and `site_longitude`. The model compares the gage drainage area against the modeled outlet catchment area, not blindly against the full 16,384 km² AOI.
USGS WaterServices 日值 JSON 也可直接导入校准入口；程序会读取 `value.timeSeries[].values[].value[]`，识别 `00060` / `ft3/s` / `cfs` 并自动换算为 m³/s，生成观测流量序列、年度均值和 P10/P50/P90 流量统计。

GeoTIFF 支持按上传入口解释：

- DEM 入口：单波段高程。
- 土壤入口：单波段 Hydrologic Soil Group，使用 1-4 对应 A-D。
- 土地覆盖/植被入口：默认当作 NLCD/土地覆盖编码；文件名包含 `ndvi`、`vegetation`、`veg` 时解释为植被覆盖；包含 `lai`、`leaf_area` 时解释为叶面积指数；包含 `canopy`、`tree_height`、`chm` 时解释为冠层高度。多波段时按土地覆盖、植被、冠层高度、LAI 解释前四个波段。
- 气象入口：文件名包含 `ppt`、`prcp`、`precip`、`rain` 时解释为降水；包含 `temp`、`tmean`、`tas` 时解释为温度；包含 `wind`、`speed`、`direction` 等关键词时解释为风速或风向。未命名的多波段气象 GeoTIFF 按降水、温度、风速、风向解释前四个波段。

## 推荐真实数据源

- DEM：美国区域优先使用 USGS 3DEP / The National Map；3DEP 的目标是提供一致的高分辨率高程数据。
- 土壤：美国区域使用 USDA-NRCS gSSURGO 或 SSURGO，重点字段可导出 Hydrologic Soil Group、可用水容量、根区深度等。
- 土地覆盖/植被：美国区域使用 MRLC Annual NLCD、Legacy NLCD、RCMAP 或 Tree Canopy Cover；本程序按 NLCD 常用类别编码解释土地覆盖。
- 气象边界场：北美可使用 Daymet 1 km 日尺度数据，或 PRISM 4 km/800 m 时间序列；全球/再分析场可使用 Copernicus ERA5。
- 校准：河流流量和站点元数据优先使用 USGS Water Data APIs；流域统计和自动化流域数据可参考 USGS StreamStats，但其结果仍需人工专业校核。

## 校准输出

参数 JSON 导出中会包含：

- `stats.calibration.observedDischargeM3s`
- `stats.calibration.observedAnnualM3`
- `stats.calibration.simulatedOutletAnnualM3`
- `stats.calibration.biasPct`
- `stats.calibration.flowDurationBias`，当导入完整观测序列时包含相对 P10/P50/P90 和均值流量的偏差诊断。
- `stats.calibration.drainageArea`，包含 `gageDrainageAreaKm2`、`contributingDrainageAreaKm2`、`modelOutletCatchmentKm2`、`areaBiasPct` 和 `comparability`，用于判断站点流域面积是否适合当前模型出口。

河网 GeoJSON 中每段河流包含 `source`、`flowline_constrained`、`discharge_m3_yr`、`runoff_coefficient`、`wind_speed_ms`、`lai`、`water_balance_mm_yr`、`landcover`、`soil_hsg`，便于在 QGIS 或后续脚本中排查误差来源。

`质量报告` 导出会包含每个外部图层的源范围、目标范围、CRS 字段、CRS 解释、WGS84 到本地 km 的转换结果、源分辨率、目标分辨率、源/目标像元大小、重采样比例、源覆盖面积、模型内覆盖率、GeoJSON 是否由矢量栅格化而来、矢量要素数量、执行位置、处理步骤、核心算法和警告列表。格网 CSV 现在包含 `aspect_deg`、`wetness_index`、`wind_speed_ms`、`wind_from_deg`、`lai`、`actual_et_mm_yr`、`water_balance_mm_yr` 和 `curve_number`，便于检查坡向、局地风、汇流湿润区和植被分布是否一致。

## 专业模型说明

此版本是面向交互演示和早期设计的高拟真原型，不是经过实测校准的工程级水文、WRF 气象或 GIS 产品。要达到严格科研或工程精度，需要接入真实 DEM、土壤/土地覆盖、地质、植被、边界气象场、降雨历时曲线、蒸散发模型、观测站校准和不确定性分析。

当前实现采用以下专业地理/水文原则的浏览器近似：

- DEM 水文处理参考常见 GIS 流程：先进行洼地填平，再计算流向和流量累积。
- 流向可采用 D8、MFD 或 D∞：D8 给出可审查主河道骨架，MFD 用所有下坡邻域分配片流，D∞ 用连续坡向在相邻两个接收格之间分流。
- 河网按贡献面积阈值提取，并用近似 Strahler 阶数表达干支流等级。
- 降水采用迎风坡强迫抬升增加、背风坡雨影减少的地形降水逻辑。
- 局地风场由外部风速/风向或用户参数作为边界场，再按地形暴露、背风遮蔽、坡面偏转、冠层高度和地表粗糙度逐栅格修正。
- 植被层从土地覆盖、NDVI/植被覆盖、冠层高度和可选 LAI 推导叶面积指数、根系抗蚀、冠层截留、实际蒸散和水量平衡，并参与径流与侵蚀计算。
- 温度采用海拔递减率，默认接近环境大气常用递减量级，并加入纬度和焚风式背风增温修正。
- 干旱/半干旱判别采用 Köppen-Geiger 风格的年温年雨阈值近似。

## 参考资料

- USGS publication: [Jenson and Domingue, 1988, Extracting topographic structure from digital elevation data for GIS analysis](https://pubs.usgs.gov/publication/70142175)
- NOAA/NWS Office of Water Prediction: [GIS hydrologic data notes on D8 flow direction](https://www.weather.gov/owp/oh_hrl_gis_data)
- Britannica: [Climate classification, including Köppen references](https://www.britannica.com/topic/classification-1703397)
- Peel, Finlayson, and McMahon, 2007: [Updated world map of the Köppen-Geiger climate classification](https://hess.copernicus.org/articles/11/1633/2007/)
- USGS: [3D Elevation Program](https://www.usgs.gov/3d-elevation-program/3dep-numbers)
- USDA-NRCS: [Gridded Soil Survey Geographic Database](https://www.nrcs.usda.gov/resources/data-and-reports/gridded-soil-survey-geographic-gssurgo-database)
- MRLC: [Multi-Resolution Land Characteristics Consortium](https://www.mrlc.gov/)
- NASA: [Daymet Daily Surface Weather Data](https://data.nasa.gov/dataset/daymet-daily-surface-weather-data-on-a-1-km-grid-for-north-america-version-4-r1-b1d6b)
- Copernicus CDS: [ERA5 hourly time-series data](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels-timeseries)
- PRISM Climate Group: [PRISM Data](https://prism.oregonstate.edu/)
- USGS: [Water Data APIs](https://www.usgs.gov/tools/usgs-water-data-apis)
- USGS: [StreamStats Service API](https://streamstats.usgs.gov/docs/streamstatsservices/Views/about/about.html)

## 后续升级路径

- 使用真实 DEM GeoTIFF/COG 输入，并加入 CRS、投影和地理坐标导出。
- 在现有 D8 / MFD / D∞ 之外继续加入二维浅水方程、洪峰过程线和更完整的水动力校准。
- 增加土壤入渗、土地覆盖、潜在蒸散发和洪峰过程线。
- 继续用 Web Worker / WebGPU 将 2048² 到 4096² 网格从高精演示提升到分块瓦片和流式计算。
- 用 Cloudflare Pages/Workers 部署，或把导出的数据接入后端任务队列做长时段模拟。

## MFD / D∞ 汇流更新

当前版本可切换 D8 / MFD / D∞ 汇流。D8 保留为主河道骨架、侵蚀接收器和 Strahler 阶数来源；MFD 使用所有下坡邻域的坡降权重分流，适合低坡、坡麓和片流地貌；D∞ 由局部连续坡向计算主/次接收格，并按角度权重分流，用于减少格网方向性偏差。CSV、河网 GeoJSON、参数 JSON 与质量报告会写入 `flowRouting` / `flow_routing` 和 `flow_divergence`，便于复现实验配置。

## Soil Hydrology Update

真实土壤和土地覆盖导入现在可额外包含 `ksat_mm_hr`、`awc_mm`、`root_depth_m`、`impervious_fraction`。这些字段会被重采样为导水率、有效持水量、根区深度、硬化率和综合入渗能力，并进入曲线数、径流系数、AET、水量平衡、根系抗蚀和河网导出。若没有这些字段，程序会按 HSG、NLCD/土地覆盖、坡度、植被、LAI 和气候水分条件推断。

## DEM Detail Diagnostics

真实 DEM 和手工编辑地形现在会派生曲率、TPI（地形位置指数）和局部粗糙度。分析图层可切换 `Curvature`、`TPI`、`Roughness`，鼠标读数与网格 CSV 会输出 `curvature_1km`、`tpi_m`、`roughness_m`，用于检查脊线、沟谷、坡麓、微地形噪声和重采样细节。

## Precision Zoom

The 2D inspector now uses a configurable local magnifier centered on the pointer's fractional grid coordinate rather than a rounded cell. It shows the selected source-cell window with subcell offsets and cell-grid crosshairs, while the 3D camera can zoom much closer to the terrain for inspecting DEM, river, canopy, and vector-rasterized polygon boundaries.

The magnifier is paired with a real local refinement export. On the default 256 grid and 128 km sandbox the source cell is about 502 m; with the default 16x refinement this is about 31.4 m per refined cell. Larger windows and factors can produce up to 4096 x 4096 local tiles. This is explicitly reported as model-field refinement unless imported DEM evidence supports the refined cell size, so provenance remains auditable.

## Cloudflare USGS Calibration Import

When a deployed Worker URL is entered in the data proxy field and a USGS gage site is provided, the UI can fetch `GET /usgs/daily-values` directly from the Worker. The Worker calls USGS WaterServices daily values for parameter `00060`, converts cfs to m3/s, preserves station metadata and drainage-area fields where available, and returns a GeoLab calibration JSON layer that is merged into the model without manual CSV cleanup. The source plan records this URL as `normalizedProxyUrl` so calibration provenance remains auditable in exported reports.

The same Worker now exposes `GET /tnm/dem-products`. The browser's `Find DEM products` control calls it to rank USGS 3DEP GeoTIFF candidates for the AOI, including estimated native DEM cell size, download URL, metadata URL, and notes about overlap or missing product metadata. This gives the user a concrete DEM acquisition shortlist before importing or mosaicking tiles.

`GET /daymet/grid-sample` is available from the browser through `Load Daymet met`. It samples the Daymet single-pixel daily weather API across a small AOI grid, imports annual precipitation and mean temperature as meteorology rasters, and keeps spatially averaged daily precipitation/temperature rows for hydrograph KGE/NSE diagnostics when USGS discharge dates overlap. This is a stronger forcing path than a single center pixel, while still documenting that full Daymet/PRISM/ERA5 gridded processing is the preferred final research workflow.

The Worker also exposes `GET /usgs/gages`, which searches the AOI for streamgages with daily discharge records, ranks station candidates by distance and drainage-area metadata, and returns a normalized calibration URL for each candidate. The browser's `Find USGS gages` control can use that endpoint to populate the gage-site field before fetching calibration data. Candidate ranking is a screening aid; the calibration advisor still checks station-to-channel distance and modeled catchment comparability before treating a station as defensible.

`GET /osm/infrastructure` is available from the browser through `Load OSM infra`. It queries Overpass for settlements, roads, rail, buildings, landuse, civic amenities, energy/water utilities, reservoirs, dams, canals, and related built features inside the AOI. The Worker converts Overpass JSON to WGS84 GeoJSON and maps OSM tags to GeoLab infrastructure classes such as `urban`, `village`, `transport`, `rail`, `apartment`, `residential`, `commercial`, `hospital`, `school`, `powerplant`, `reservoir`, `dam`, and `canal`, including hydrologic/thermal feedback fields plus building height and floor metadata when OSM provides it.

The interface now includes a `Time & hazards` scenario control. It computes flood hazard, flood depth proxy, drought stress, wildfire risk, landslide/earthquake-trigger risk, composite hazard, cumulative erosion, and projected vegetation state over the selected year span. These layers are exportable in the grid CSV and quality report, and can be inspected through the analysis view modes.

## Data Readiness Audit

Quality reports now include `dataReadiness`, a weighted audit of whether the current run has enough real DEM, soil hydraulic properties, land cover, vegetation, meteorological boundary fields, flowlines, infrastructure, and calibration evidence to support research-grade claims. Each item records coverage, effective coverage, CRS interpretation, source and target cell sizes, resampling method, gap-fill evidence, status, score, and next actions. A run is only marked `research-ready-data` when required inputs clear the ready threshold; otherwise blockers explain exactly which missing or weak layers keep the run in calibration-grade, screening-grade, or demonstration-only territory.
