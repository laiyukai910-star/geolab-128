const STORAGE_KEY = "geolab.locale";
const DEFAULT_LOCALE = "en";

const EXACT = Object.freeze({
  "立体观察": "Volume view",
  "完整地块": "Solid terrain",
  "地下剖面": "Geological section",
  "水下观察": "Underwater",
  "剖切位置 %": "Section position %",
  "地下显示夸张倍数": "Underground exaggeration",
  "天空环境": "Sky environment",
  "海面与水体": "Sea surface and water",
  "当前海平面下没有可进入的水域。": "No submerged terrain at the current sea level.",
  "自然地表（示意）": "Natural surface (illustrative)",
  "GeoLab 128 | 地理演算程序": "GeoLab 128 | Geographic Simulation",
  "DEM 演算中": "DEM processing",
  "初始化": "Initializing",
  "参数工作区": "Simulation workspace",
  "关闭参数抽屉": "Close parameter drawer",
  "关闭抽屉": "Close drawer",
  "演算工具": "Simulation tools",
  "随机种子": "Random seed",
  "三维地形视图": "3D terrain view",
  "GPU 兼容 · WebGL2": "3D runtime · WebGL2 fallback",
  "GPU 硬件 · WebGL2": "3D runtime · WebGL2 hardware",
  "选择文件": "Choose files",
  "未选择文件": "No files selected",
  "边长 km": "Extent (km)",
  "可选": "Optional",
  "可选 Cloudflare Worker": "Optional Cloudflare Worker",
  "土壤 HSG/属性，可多选": "Soil HSG / attributes · multiple files",
  "钻孔/地下水位/岩性，可多选": "Boreholes / water table / lithology · multiple files",
  "土地覆盖/植被，可多选": "Land cover / vegetation · multiple files",
  "气象边界场，可多选": "Meteorological boundary fields · multiple files",
  "河网 Flowlines，可多选": "River-network flowlines · multiple files",
  "城镇/乡村/水利设施，可多选": "Urban / rural / water infrastructure · multiple files",
  "校准数据，可多选": "Calibration data · multiple files",
  "校准强度": "Calibration strength",
  "情景类型": "Scenario type",
  "几何": "Geometry",
  "坐标": "Coordinates",
  "半径 km": "Radius (km)",
  "NLCD 编码": "NLCD code",
  "植被增量": "Vegetation change",
  "冠层 m": "Canopy height (m)",
  "根深 m": "Root depth (m)",
  "不透水率": "Impervious fraction",
  "不透水增量": "Impervious-fraction change",
  "降水增量 mm": "Precipitation change (mm)",
  "降水倍率": "Precipitation multiplier",
  "温度增量 °C": "Temperature change (°C)",
  "风速增量 m/s": "Wind-speed change (m/s)",
  "粗糙增量": "Roughness change",
  "类型": "Type",
  "硬化率": "Sealed-surface fraction",
  "径流变化": "Runoff change",
  "粗糙变化": "Roughness change",
  "热岛 °C": "Heat-island effect (°C)",
  "调蓄 mm": "Storage capacity (mm)",
  "滞留率": "Retention fraction",
  "灌溉 mm": "Irrigation (mm)",
  "植被变化": "Vegetation change",
  "用水 mm": "Water demand (mm)",
  "建筑密度": "Building density",
  "平均高度 m": "Mean height (m)",
  "层数": "Floor count",
  "水文与地下": "Hydrology & subsurface",
  "图层与编辑": "Layers & editing",
  "三维场景显示": "3D scene visibility",
  "地表构件": "Terrain surface detail",
  "地下剖切": "Subsurface cutaway",
  "风场箭头": "Wind vectors",
  "空间网格": "Spatial grid",
  "动物生态": "Wildlife ecology",
  "动物丰度": "Wildlife abundance",
  "迁徙联动": "Migration coupling",
  "栖息地敏感度": "Habitat sensitivity",
  "可见动物上限": "Visible wildlife limit",
  "动物3D层": "3D wildlife layer",
  "动物显示尺度": "Wildlife display scale",
  "生物种类": "Species",
  "单批数量": "Individuals per batch",
  "目标生境": "Target habitat",
  "指定区块编号": "Specific block ID",
  "留空则自动": "Leave blank for automatic selection",
  "生态3D层": "3D ecosystem layer",
  "角色聚焦": "Role focus",
  "连线模式": "Link mode",
  "节点尺度": "Node scale",
  "区块3D层": "3D block layer",
  "区块模式": "Block mode",
  "聚焦类型": "Focus category",
  "区块尺度": "Block display scale",
  "推荐阶数": "Recommendation ranks",
  "最低适配": "Minimum suitability score",
  "方案容量": "Plan capacity",
  "时序阶段": "Timeline phase",
  "时序模式": "Timeline mode",
  "半径": "Radius",
  "地形编辑模式": "Terrain editing mode",
  "情景综合": "Scenario synthesis",
  "八系统联动": "Eight-system coupling",
  "情景名称": "Scenario name",
  "探索目的": "Exploration purpose",
  "系统教学": "Systems learning",
  "假设探索": "Hypothesis exploration",
  "干预对比": "Intervention comparison",
  "风险沟通": "Risk communication",
  "验证设计": "Validation design",
  "情景备注": "Scenario notes",
  "记录本轮假设、干预和比较基线": "Record this run's assumptions, interventions, and comparison baseline",
  "系统覆盖": "System coverage",
  "证据覆盖": "Evidence coverage",
  "覆盖度衡量系统表达与证据约束，不代表预测准确率。": "Coverage measures system representation and evidence constraints, not predictive accuracy.",
  "当前耦合链路": "Active coupling pathways",
  "优先后续行动": "Priority follow-up actions",
  "情景综合分数": "Scenario synthesis scores",
  "模型就绪后生成跨系统综合。": "Cross-system synthesis will be generated when the model is ready.",
  "优先事项将在演算后生成。": "Priorities will be generated after simulation.",
  "情景综合 JSON": "Scenario synthesis JSON",
  "情景简报 Markdown": "Scenario brief Markdown",
  "物理联动与引擎互操作": "Physical coupling & engine interoperability",
  "守恒门控 · 原生地形": "Conservation gates · native terrain",
  "物理联动将在演算后进行门控。": "Physical coupling gates will be evaluated after simulation.",
  "物理联动 JSON": "Physical coupling JSON",
  "门控账本 CSV": "Gate ledger CSV",
  "Rust 演算核心": "Rust computation core",
  "独立复核 · 本地 API": "Independent verification · local API",
  "正在连接 Rust 演算核心。": "Connecting to the Rust computation core.",
  "运行后端复核": "Run backend verification",
  "导出后端报告": "Export backend report",
  "Rust 后端复核中": "Rust backend verification running",
  "Rust 后端复核完成": "Rust backend verification complete",
  "Rust 后端复核失败": "Rust backend verification failed",
  "Rust 后端报告已导出": "Rust backend report exported",
  "Unity 场景包": "Unity scene package",
  "Unreal 场景包": "Unreal scene package",
  "情景综合已导出": "Scenario synthesis exported",
  "情景简报已导出": "Scenario brief exported",
  "物理联动报告已导出": "Physical coupling report exported",
  "物理联动 CSV 已导出": "Physical coupling CSV exported",
  "Unity 场景交换包生成中": "Building Unity scene interchange package",
  "Unity 场景交换包已导出": "Unity scene interchange package exported",
  "Unity 场景交换包生成失败": "Unity scene interchange package failed",
  "Unreal 场景交换包生成中": "Building Unreal scene interchange package",
  "Unreal 场景交换包已导出": "Unreal scene interchange package exported",
  "Unreal 场景交换包生成失败": "Unreal scene interchange package failed",
  "生态与地理一致性将在演算后诊断": "Ecological and geographic consistency will be diagnosed after simulation.",
  "生态完整性 JSON": "Ecological integrity JSON",
  "物种诊断 CSV": "Species diagnostics CSV",
  "生态完整性报告已导出": "Ecological integrity report exported",
  "物种诊断 CSV 已导出": "Species diagnostics CSV exported",
  "全球自定义 · 保留当前自然条件": "Global custom · keep current environmental conditions",
  "全球自定义 · 保留当前自然条件与物种区系": "Global custom · keep current environmental conditions and fauna",
  "地貌：自定义地形": "Landform: custom terrain",
  "地貌：自定义地形 · 参照: 用户手动参数": "Landform: custom terrain · reference: user parameters",
  "自定义地形": "Custom terrain",
  "不复现景区": "No scenic reproduction",
  "用户手动参数": "user parameters",
  "全球自定义 · 全球": "Global custom · Global",
  "东亚季风山地与盆地 · 亚洲 · 东亚": "East Asian monsoon mountains and basins · Asia · East Asia",
  "中亚高原草原与山间盆地 · 亚洲 · 中亚": "Central Asian plateau steppe and intermontane basins · Asia · Central Asia",
  "南亚季风前陆与高山弧 · 亚洲 · 南亚": "South Asian monsoon foreland and alpine arc · Asia · South Asia",
  "东南亚热带群岛与喀斯特 · 亚洲 · 东南亚": "Southeast Asian tropical archipelago and karst · Asia · Southeast Asia",
  "欧洲温带平原与阿尔卑斯山系 · 欧洲": "European temperate plains and Alpine ranges · Europe",
  "北美科迪勒拉与大平原 · 北美洲": "North American Cordillera and Great Plains · North America",
  "南美安第斯与亚马孙前缘 · 南美洲": "South American Andes and Amazon fringe · South America",
  "非洲裂谷、台地与稀树草原 · 非洲": "African Rift, plateaus, and savanna · Africa",
  "澳洲内陆高原与湿润东岸 · 大洋洲 · 澳大利亚": "Australian interior plateau and humid east coast · Oceania · Australia",
  "南极冰盖高原与冰蚀海岸 · 南极洲": "Antarctic ice-sheet plateau and glacial coast · Antarctica",
  "北极冻原、冰缘河流与群岛 · 北极环域": "Arctic tundra, proglacial rivers, and archipelagos · Arctic",
  "大洋洲火山岛弧与珊瑚海岸 · 大洋洲 · 岛弧": "Oceanian volcanic island arc and coral coast · Oceania · Island arc",
  "西亚干旱高原与裂谷绿洲 · 亚洲 · 西亚": "West Asian arid plateau and rift oases · Asia · West Asia",
  "巴塔哥尼亚山地、冰原与草原 · 南美洲 · 南部": "Patagonian mountains, ice fields, and steppe · South America · South",
  "地貌：自定义地形": "Landform: custom terrain",
  "程序生成数据": "Procedural data",
  "手工地表/气候情景": "Manual surface / climate scenario",
  "未添加手工地表情景": "No manual surface scenario added",
  "手工人造设施": "Manual infrastructure",
  "未添加手工设施": "No manual infrastructure added",
  "设施位置：未选区": "Facility location: no area selected",
  "时间与灾害": "Time and hazards",
  "分析图层": "Analysis layers",
  "批量释放生物": "Batch wildlife release",
  "自动选择最适区块": "Automatically choose the most suitable block",
  "生态功能将在演算后汇总": "Ecosystem functions are summarized after a run",
  "尚未加入投放批次": "No release batch queued",
  "模型就绪": "Model ready",
  "生成 DEM 与地貌细节": "Generating DEM and landform detail",
  "重建地形": "Rebuild terrain",
  "应用侵蚀": "Apply erosion",
  "重新演算": "Run simulation",
  "重置视角": "Reset view",
  "播放": "Play",
  "暂停": "Pause",
  "河流显示": "Rivers visible",
  "河流隐藏": "Rivers hidden",
  "植被显示": "Vegetation visible",
  "植被隐藏": "Vegetation hidden",
  "应用大洲模板": "Apply continental template",
  "应用地貌预设": "Apply landform preset",
  "加载数据层": "Load data layers",
  "清除数据层": "Clear data layers",
  "生成采集计划": "Build acquisition plan",
  "导出采集计划": "Export acquisition plan",
  "在线检查源": "Check online sources",
  "导出源清单": "Export source manifest",
  "查找 DEM 产品": "Find DEM products",
  "加载 Daymet 气象": "Load Daymet weather",
  "加载 OSM 设施": "Load OSM infrastructure",
  "查找 USGS 水文站": "Find USGS gages",
  "获取 USGS 校准": "Fetch USGS calibration",
  "应用流量尺度建议": "Apply discharge-scale advice",
  "应用分摊尺度建议": "Apply split-scale advice",
  "添加地表情景": "Add surface scenario",
  "清除地表情景": "Clear surface scenarios",
  "导出地表 GeoJSON": "Export surface GeoJSON",
  "设施选区": "Select facility area",
  "选区中": "Selecting area",
  "添加设施": "Add facility",
  "清除手工设施": "Clear manual infrastructure",
  "导出设施 GeoJSON": "Export infrastructure GeoJSON",
  "加入投放批次": "Add release batch",
  "执行全部批次": "Execute all batches",
  "清空批次": "Clear batches",
  "数据模板": "Data template",
  "质量报告": "Quality report",
  "不确定性集合": "Uncertainty ensemble",
  "点": "Point",
  "线": "Line",
  "面": "Polygon",
  "无": "None",
  "自定义": "Custom",
  "森林": "Forest",
  "湿地": "Wetland",
  "草地": "Grassland",
  "耕地": "Cropland",
  "灌丛": "Shrubland",
  "高精": "High",
  "研究级细节": "Research detail",
  "电影级全量细节": "Cinematic exhaustive detail",
  "抬升": "Raise",
  "削低": "Lower",
  "平滑": "Smooth",
  "粗糙化": "Roughen",
  "D∞ 连续流向": "D∞ continuous flow",
  "D8 单流向": "D8 single flow",
  "MFD 多流向": "MFD multi-flow",
  "暴雨洪水": "Storm flood",
  "干旱": "Drought",
  "野火": "Wildfire",
  "地震/滑坡": "Earthquake / landslide",
  "复合灾害": "Compound hazards",
  "高程": "Elevation",
  "气候": "Climate",
  "降水": "Precipitation",
  "温度": "Temperature",
  "汇流": "Flow accumulation",
  "流速": "Flow velocity",
  "剪切应力": "Shear stress",
  "输沙能力": "Sediment capacity",
  "侵蚀风险": "Erosion risk",
  "淤积风险": "Deposition risk",
  "综合灾害": "Composite hazards",
  "洪水风险": "Flood risk",
  "干旱胁迫": "Drought stress",
  "野火风险": "Wildfire risk",
  "滑坡风险": "Landslide risk",
  "坡度": "Slope",
  "植被覆盖": "Vegetation cover",
  "局地风场": "Local wind field",
  "水量平衡": "Water balance",
  "土地覆盖": "Land cover",
  "土壤": "Soil",
  "地下岩性": "Subsurface lithology",
  "地下含水层": "Aquifer",
  "数据可信度": "Data confidence",
  "生态连通度": "Ecological connectivity",
  "动物丰富度": "Wildlife richness",
  "河网 GeoJSON": "River network GeoJSON",
  "格网 CSV": "Grid CSV",
  "参数 JSON": "Parameters JSON",
  "时间序列 CSV": "Time-series CSV",
  "灾害事件 JSON": "Hazard event JSON",
  "局部精细 CSV": "Local refinement CSV",
  "科研审计 JSON": "Research audit JSON",
  "科研验证门控 JSON": "Research validation gate JSON",
  "峡谷台地": "Canyon plateau",
  "喀斯特峰林": "Karst peak forest",
  "高山冰川谷": "Alpine glacial valley",
  "火山岛弧": "Volcanic island arc",
  "三角洲湿地": "Delta wetland",
  "沙漠沙丘": "Desert dunes",
  "峡湾海岸": "Fjord coast",
  "丹霞方山": "Danxia mesa",
  "黄土高原": "Loess Plateau",
  "恶地沟壑": "Badlands gullies",
  "辫状冲洪积扇": "Braided outwash fan",
  "海蚀崖岸": "Wave-cut cliff coast",
  "复活火山口台地": "Resurgent caldera plateau",
  "安第斯山脊梯田": "Andean ridge terraces",
  "石灰华台地": "Travertine terrace",
  "玄武岩柱状节理海岸": "Basalt columnar-joint coast",
  "寒冻石林圆形剧场": "Frozen stone-forest amphitheater",
  "石灰岩海蚀柱海岸": "Limestone sea-stack coast",
  "石英砂岩峰林": "Quartz-sandstone peak forest",
  "蒸发盐沼盆地": "Evaporite salt-marsh basin",
  "张家界/武陵源": "Zhangjiajie / Wulingyuan",
  "大峡谷": "Grand Canyon",
  "桂林漓江": "Guilin Li River",
  "约塞米蒂冰川谷": "Yosemite glacial valley",
  "黄山": "Huangshan",
  "张掖丹霞": "Zhangye Danxia",
  "冰岛峡湾": "Icelandic fjord",
  "下龙湾": "Ha Long Bay",
  "纪念碑谷": "Monument Valley",
  "纳米布索苏斯盐沼": "Namib Sossus salt pan",
  "富士山": "Mount Fuji",
  "羚羊峡谷": "Antelope Canyon",
  "帕穆克卡莱石灰华": "Pamukkale travertine",
  "黄石火山口": "Yellowstone caldera",
  "黄龙钙华彩池": "Huanglong travertine pools",
  "马丘比丘山脊梯田": "Machu Picchu ridge terraces",
  "巨人之路玄武岩柱": "Giant's Causeway basalt columns",
  "乌尤尼盐沼": "Salar de Uyuni",
  "盖朗厄尔峡湾": "Geirangerfjord",
  "布莱斯峡谷石林": "Bryce Canyon hoodoos",
  "十二门徒石灰岩海蚀柱": "Twelve Apostles limestone stacks",
  "武陵源石英砂岩峰林": "Wulingyuan quartz-sandstone peak forest",
  "当前使用程序生成数据 · 演示级 2%": "Using procedural data · demonstration grade 2%",
  "尚未生成真实样区采集计划": "No real-area acquisition plan generated",
  "建筑灾害损伤": "Built-environment hazard damage",
  "时间植被变化": "Time vegetation change",
  "植被功能型": "Vegetation functional type",
  "植被碳储量": "Vegetation carbon stock",
  "冠层高度": "Canopy height",
  "叶面积指数": "Leaf area index",
  "实际蒸散": "Actual evapotranspiration",
  "地应力/液化": "Geostress / liquefaction",
  "地下可信度": "Subsurface confidence",
  "地下工程风险": "Subsurface engineering risk",
  "径流系数": "Runoff coefficient",
  "湿润指数": "Wetness index",
  "入渗能力": "Infiltration capacity",
  "土壤水": "Soil water",
  "根系深度": "Root depth",
  "不透水面": "Impervious surface",
  "马鹿": "Red deer", "野猪": "Wild boar", "岩羊": "Blue sheep", "灰狼": "Gray wolf",
  "棕熊": "Brown bear", "赤狐": "Red fox", "水獭": "River otter", "湿地鹤": "Wetland crane",
  "金雕": "Golden eagle", "山兔": "Mountain hare", "东北虎": "Siberian tiger", "大熊猫": "Giant panda",
  "雪豹": "Snow leopard", "野牦牛": "Wild yak", "赛加羚羊": "Saiga antelope", "亚洲象": "Asian elephant",
  "大犀鸟": "Great hornbill", "欧洲野牛": "European bison", "欧亚猞猁": "Eurasian lynx", "河狸": "Beaver",
  "驼鹿": "Moose", "美洲野牛": "American bison", "水豚": "Capybara", "美洲豹": "Jaguar",
  "安第斯神鹫": "Andean condor", "非洲狮": "African lion", "非洲象": "African elephant", "平原斑马": "Plains zebra",
  "长颈鹿": "Giraffe", "红大袋鼠": "Red kangaroo", "食火鸡": "Cassowary", "帝企鹅": "Emperor penguin",
  "环斑海豹": "Ringed seal", "驯鹿": "Reindeer", "北极熊": "Polar bear", "信天翁": "Albatross"
});

const TERMS = Object.entries({
  "地形": "Terrain", "数据": "Data", "气象": "Weather", "水文": "Hydrology", "时灾": "Time & hazards",
  "图层": "Layers", "导出": "Export", "真实数据": "Observed data", "参数": "Parameters",
  "种子": "Seed", "沙盘": "Sandbox", "边长": "extent", "大洲": "continental", "区域": "regional",
  "地貌": "Landform", "景区": "scenic", "网格": "Grid", "细节": "detail", "质量": "quality",
  "起伏": "Relief", "山脊": "Ridge weight", "构造抬升": "Tectonic uplift", "海平面": "Sea level",
  "亚格细节": "Sub-grid detail", "复杂度": "complexity", "丰富度": "diversity", "区块": "block",
  "权重": "weight", "全球": "Global", "亚洲": "Asia", "欧洲": "Europe", "非洲": "Africa",
  "北美洲": "North America", "南美洲": "South America", "大洋洲": "Oceania", "南极洲": "Antarctica",
  "高度": "height", "尺度": "scale", "强度": "strength", "方向": "direction", "速度": "speed",
  "湿度": "humidity", "纬度": "latitude", "渗透率": "permeability", "阈值": "threshold",
  "时间": "Time", "灾害": "hazards", "分析": "Analysis", "显示": "visible", "隐藏": "hidden",
  "河流": "Rivers", "植被": "Vegetation", "动物": "Wildlife", "生态": "Ecological",
  "大洲与区域环境模板": "Continental and regional environmental template",
  "地形复杂度": "Terrain complexity", "地貌丰富度": "Landform diversity",
  "生态区块网格": "Ecological block grid", "真实数据权重": "Observed data weight",
  "经典景区": "Scenic preset", "地貌预设": "Landform preset", "自然条件": "environmental conditions",
  "沙盘边长": "Sandbox extent", "网格": "Grid", "种子": "Seed", "GPU细节质量": "GPU detail quality",
  "真实数据": "Observed data", "数据层": "data layers", "采集计划": "Acquisition plan",
  "手工": "Manual", "地表": "surface", "气候情景": "climate scenario", "人造设施": "infrastructure",
  "城镇基底": "Urban base", "高层/塔楼": "High-rise / tower", "居民楼/公寓组团": "Apartments",
  "住宅片区": "Residential district", "小洋房/联排": "Villas / townhouses", "商业/办公": "Commercial / office",
  "公共建筑": "Civic building", "地标": "Landmark", "医院": "Hospital", "学校/园区": "School / campus",
  "体育场": "Stadium", "机场": "Airport", "铁路": "Rail", "桥梁": "Bridge", "港口": "Port",
  "电厂": "Power plant", "污水处理厂": "Wastewater plant", "排涝泵站": "Flood-pump station",
  "海水淡化厂": "Desalination plant", "光伏场": "Solar farm", "风电场": "Wind farm",
  "公园/绿地": "Park / green space", "物流园": "Logistics park", "温室": "Greenhouse", "采石场/矿区": "Quarry / mine",
  "办公塔楼": "Office tower", "酒店/旅馆": "Hotel", "市场/商贸": "Market / retail", "消防站": "Fire station",
  "警署": "Police station", "数据中心": "Data center", "变电站": "Substation", "地铁站": "Metro station",
  "索道站/缆车站": "Cable-car station", "隧道口": "Tunnel portal", "天文台/观测站": "Observatory",
  "科研站": "Research station", "农庄": "Farmstead", "梯田农业": "Terrace farming", "乡村": "Village",
  "道路/交通": "Road / transport", "工业": "Industry", "水库": "Reservoir", "大坝/闸": "Dam / gate",
  "渠道/灌溉": "Canal / irrigation", "堤防": "Levee", "设施位置": "Facility location",
  "风来自": "Wind from", "成河阈值": "Channel threshold", "年": "yr", "最高点": "Highest point",
  "地下风险": "Subsurface risk", "自定义地形": "Custom terrain", "用户手动参数": "user-defined parameters", "参照": "Reference", "自定义": "Custom", "用户手动": "user-defined", "无": "None", "草原": "Grassland", "全部": "All", "条": "links",
  "校准顾问": "Calibration advisor ", "等待": " awaits ", "观测流量": "observed discharge", "流域面积": "basin area", "站点经纬度": "station coordinates",
  "汇流": "Flow accumulation", "平均降水": "Mean precipitation", "粗糙": "Roughness", "韧性": "resilience",
  "生态完整性": "Ecological integrity", "有效物种": "Effective species", "面积闭合": "Area closure", "核心生境": "Core habitat",
  "边缘压力": "Edge pressure", "干湿区": "Aridity zone", "气植一致": "Climate-vegetation agreement",
  "连通": "connectivity", "种": "species", "种群估算": "Population estimate", "迁徙廊道": "Migration corridors",
  "硬件": "hardware", "碳储量": "Carbon stock", "可信": "confidence", "入渗": "Infiltration", "蒸散": "Evapotranspiration",
  "河道流速": "Channel velocity", "强侵蚀": "High erosion", "风": "Wind", "径流": "Runoff", "模型出口": "Model outputs",
  "水量余项": "Water balance residual", "地下": "Subsurface", "层": "layers", "水位埋深": "Water-table depth",
  "含水潜势": "Aquifer potential", "裂隙风险": "Fracture risk", "主气候": "Primary climate", "湿润大陆性": "Humid continental",
  "脉冲": "Pulses", "洪": "flood", "干": "drought", "火": "fire", "坡": "slope", "自定义Terrain": "custom terrain",
  "校准顾问等待观测流量、流域面积和站点经纬度.": "Calibration advisor awaits observed discharge, basin area, and station coordinates.",
  "裸地/暴露地表": "Bare / exposed ground", "火烧迹地": "Burn scar", "干旱区": "Arid zone", "热浪区": "Heatwave zone",
  "城市绿地": "Urban green space", "开放水面": "Open water", "诊所/急诊点": "Clinic / emergency point", "图书馆": "Library",
  "社区中心": "Community center", "水塔/高位水池": "Water tower / elevated tank", "水电站": "Hydropower station",
  "地热电站": "Geothermal plant", "净水厂": "Water treatment plant", "渡轮码头": "Ferry terminal", "山地避难所": "Mountain shelter",
  "森林火情瞭望塔": "Forest fire lookout", "游客中心": "Visitor center", "观景台/瞭望点": "Viewing platform / lookout",
  "登山口/步道入口": "Trailhead", "护林/景区管理站": "Ranger / park-management station", "水文测站": "Hydrology station",
  "公交枢纽": "Transit hub", "表单坐标": "form coordinates", "按坐标添加": "Add by coordinates", "适配生成设施": "Generate suitable infrastructure",
  "适配设施 JSON": "Suitable infrastructure JSON", "适配设施 CSV": "Suitable infrastructure CSV", "曲率": "Curvature", "地表粗糙度": "Surface roughness",
  "营养级": "Trophic level", "湿地与滨岸": "Wetland and riparian", "山地": "Mountain", "海岸": "Coast", "城镇边缘": "Urban fringe",
  "水生与滨岸群落": "Aquatic and riparian communities", "全部角色": "All roles", "访客枢纽": "Visitor hub", "景观点": "Viewpoint",
  "步道入口": "Trailhead", "保育管理": "Conservation management", "水文监测": "Hydrology monitoring", "全部连线": "All links",
  "专业链路": "Specialist links", "近邻辅助": "Nearby support", "关闭连线": "Close links", "微分区": "Microzones",
  "服务缺口": "Service gaps", "环境分区": "Environmental zones", "联动状态": "Linked status", "推荐预览": "Recommendation preview",
  "方案落位": "Plan placement", "一期关键网络": "Phase I core network", "二期服务补齐": "Phase II service completion",
  "三期适应缓冲": "Phase III adaptation buffer", "四期监测补点": "Phase IV monitoring infill", "网络骨架依赖": "Network-spine dependency",
  "服务缺口依赖": "Service-gap dependency", "工程适应依赖": "Engineering-adaptation dependency", "监测反馈依赖": "Monitoring-feedback dependency",
  "蓝绿廊道": "Blue-green corridor", "生态缓冲": "Ecological buffer", "稳定台地": "Stable terrace", "蓝廊微区": "Blue-corridor microzone",
  "山脊微区": "Ridge microzone", "风险缓冲": "Risk buffer", "高适应需求": "High adaptation demand", "候选受限": "Constrained candidates",
  "交通达性": "Transport access", "蓝绿服务": "Blue-green services", "水利控制": "Water-control infrastructure", "公共机构": "Public institutions",
  "应急服务": "Emergency services", "研究监测": "Research monitoring", "可再生能源": "Renewable energy", "居住设施": "Residential infrastructure",
  "商业服务": "Commercial services", "一期": "Phase I", "二期": "Phase II", "三期": "Phase III", "四期": "Phase IV",
  "单期": "Single phase", "累计建成": "Cumulative build", "局部放大": "Local zoom", "指针悬停后显示单元格数据": "Hover to show cell data",
  "地下体素 CSV": "Subsurface voxel CSV", "地下立方账本 CSV": "Subsurface cube ledger CSV", "地下柱体推理 CSV": "Subsurface column inference CSV",
  "流域圈定 JSON": "Watershed delineation JSON", "流域格网 CSV": "Watershed grid CSV", "科研审计 CSV": "Research audit CSV",
  "空间对齐 CSV": "Spatial alignment CSV", "地貌过程 JSON": "Landform process JSON", "地貌过程 CSV": "Landform process CSV",
  "科研门控 JSON": "Research gate JSON", "科研门控 CSV": "Research gate CSV", "设施影响 JSON": "Infrastructure impact JSON",
  "设施影响 CSV": "Infrastructure impact CSV", "设施区块 JSON": "Infrastructure block JSON", "设施区块 CSV": "Infrastructure block CSV",
  "设施单元 JSON": "Infrastructure cell JSON", "设施单元 CSV": "Infrastructure cell CSV", "建筑韧性 JSON": "Building resilience JSON",
  "建筑韧性 CSV": "Building resilience CSV", "建筑恢复 JSON": "Building recovery JSON", "建筑恢复 CSV": "Building recovery CSV",
  "物理时间 JSON": "Physical time JSON", "物理时间 CSV": "Physical time CSV",
  "马鹿": "Red deer", "野牦牛": "Wild yak", "欧洲野牛": "European bison", "驼鹿": "Moose", "驯鹿": "Reindeer",
  "野猪": "Wild boar", "岩羊": "Blue sheep", "灰狼": "Gray wolf", "东北虎": "Siberian tiger", "雪豹": "Snow leopard",
  "美洲豹": "Jaguar", "非洲狮": "African lion", "北极熊": "Polar bear", "棕熊": "Brown bear", "赤狐": "Red fox",
  "欧亚猞猁": "Eurasian lynx", "水獭": "River otter", "湿地鹤": "Wetland crane", "金雕": "Golden eagle", "山兔": "Mountain hare",
  "大熊猫": "Giant panda", "赛加羚羊": "Saiga antelope", "美洲野牛": "American bison", "平原斑马": "Plains zebra",
  "红大袋鼠": "Red kangaroo", "亚洲象": "Asian elephant", "非洲象": "African elephant", "大犀鸟": "Great hornbill",
  "食火鸡": "Cassowary", "河狸": "Beaver", "水豚": "Capybara", "安第斯神鹫": "Andean condor", "长颈鹿": "Giraffe",
  "帝企鹅": "Emperor penguin", "环斑海豹": "Ringed seal", "信天翁": "Albatross",
  "中心纬度": "Center latitude", "中心经度": "Center longitude", "起始年": "Start year", "结束年": "End year",
  "USGS 站号": "USGS gage ID", "数据代理 URL": "Data proxy URL", "可多选": "multiple files", "个文件": "files", "已选择": "Selected",
  "风向": "Wind direction", "风速": "Wind speed", "海平面温度": "Sea-level temperature", "递减率": "Lapse rate",
  "地下层数": "Subsurface layers", "地下深度": "Subsurface depth", "地质复杂度": "Geologic complexity",
  "含水补给": "Aquifer recharge", "汇流模式": "Flow-routing mode", "垂直夸张": "Vertical exaggeration", "植被反馈": "Vegetation feedback",
  "模拟年限": "Simulation years", "当前年份": "Current year", "日序": "Day of year", "灾害模式": "Hazard mode",
  "积雪": "Snow cover", "当年事件": "Current-year event", "干旱脉冲": "Drought pulse",
  "后台线程": "Background worker", "设施适配 JSON": "Infrastructure suitability JSON", "设施适配 CSV": "Infrastructure suitability CSV",
  "精细窗口": "Refinement window", "源格": "source cells", "亚格倍率": "Sub-grid multiplier", "地下剖面": "Subsurface transect",
  "西东中心线": "West-east centerline", "南北中心线": "South-north centerline", "西北-东南": "Northwest-southeast",
  "西南-东北": "Southwest-northeast", "剖面采样": "Transect samples", "列": "columns",
  "主河道": "Main channel", "气候带": "Climate zone", "演算中": "processing", "单元": "cell",
  "读取真实数据层": "Loading observed data layers", "未选择数据文件": "No data file selected",
  "数据读取失败": "Data load failed", "正在": "Loading", "已加载": "Loaded", "已应用": "Applied",
  "已清除": "Cleared", "已加入": "Added", "已导出": "Exported", "完成": "complete", "失败": "failed",
  "投放队列": "Release queue", "投放批次": "release batch", "个体": "individuals", "存活": "survived",
  "生态功能": "Ecosystem function", "食物网": "Food web", "活跃物种": "Active species",
  "营养平衡": "Trophic balance", "限制环节": "Limiting function", "未识别": "unidentified",
  "应用区域模板": "Apply regional template", "区域模板": "regional template", "请先": "Please", "至少一个": "at least one",
  "按当前坐标添加": "Add at current coordinates: ", "投放到当前选区": " in the selected area", "把": "Place ",
  "启动失败": "Startup failed", "重建": "Rebuild", "侵蚀": "erosion", "地形已编辑": "Terrain edited", "快算": "quick run"
}).sort((a, b) => b[0].length - a[0].length);

function hasHan(value) {
  return /[\u3400-\u9fff]/.test(value);
}

function preserveWhitespace(source, translated) {
  const leading = source.match(/^\s*/)?.[0] || "";
  const trailing = source.match(/\s*$/)?.[0] || "";
  return `${leading}${translated.trim()}${trailing}`;
}

function translate(source) {
  if (!hasHan(source)) return source;
  const trimmed = source.trim();
  if (EXACT[trimmed]) return preserveWhitespace(source, EXACT[trimmed]);
  let value = source;
  for (const [zh, en] of TERMS) value = value.replaceAll(zh, en);
  return value
    .replaceAll("，", ", ")
    .replaceAll("、", ", ")
    .replaceAll("和", " and ")
    .replaceAll("。", ".")
    .replaceAll("：", ": ")
    .replace(/\s{2,}/g, " ");
}

function readStoredLocale() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "zh-CN" ? "zh-CN" : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function setupLocalization() {
  let locale = readStoredLocale();
  let applying = false;
  const textSources = new WeakMap();
  const attributeSources = new WeakMap();
  const attributeNames = ["title", "aria-label", "placeholder"];

  const isSkipped = (node) => node?.parentElement?.closest?.("[data-i18n-skip]");

  function renderText(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE || isSkipped(node)) return;
    let source = textSources.get(node);
    const current = node.nodeValue || "";
    const translated = source === undefined ? null : translate(source);
    if (source === undefined || (current !== source && current !== translated)) {
      source = current;
      textSources.set(node, source);
    }
    const next = locale === "en" ? translate(source) : source;
    if (current !== next) node.nodeValue = next;
  }

  function renderAttribute(element, name) {
    if (!element?.hasAttribute?.(name) || element.closest("[data-i18n-skip]")) return;
    let sources = attributeSources.get(element);
    if (!sources) {
      sources = new Map();
      attributeSources.set(element, sources);
    }
    let source = sources.get(name);
    const current = element.getAttribute(name) || "";
    const translated = source === undefined ? null : translate(source);
    if (source === undefined || (current !== source && current !== translated)) {
      source = current;
      sources.set(name, source);
    }
    const next = locale === "en" ? translate(source) : source;
    if (current !== next) element.setAttribute(name, next);
  }

  function renderTree(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      renderText(root);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(renderText);
    const elements = root.nodeType === Node.ELEMENT_NODE ? [root, ...root.querySelectorAll("*")] : [...root.querySelectorAll("*")];
    elements.forEach((element) => attributeNames.forEach((name) => renderAttribute(element, name)));
  }

  function applyLocale(nextLocale = locale) {
    locale = nextLocale === "zh-CN" ? "zh-CN" : "en";
    document.documentElement.lang = locale;
    document.title = locale === "en" ? "GeoLab 128 | Geographic Simulation" : "GeoLab 128 | 地理演算程序";
    applying = true;
    renderTree(document.body);
    applying = false;
    const selector = document.getElementById("localeSelect");
    if (selector) selector.value = locale;
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Local storage is optional in restricted browser contexts.
    }
    globalThis.__geoLabLocale = { locale, defaultLocale: DEFAULT_LOCALE };
    window.dispatchEvent(new CustomEvent("geolab:localechange", { detail: { locale } }));
  }

  const observer = new MutationObserver((records) => {
    if (applying) return;
    for (const record of records) {
      if (record.type === "characterData") renderText(record.target);
      if (record.type === "childList") record.addedNodes.forEach(renderTree);
      if (record.type === "attributes") renderAttribute(record.target, record.attributeName);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: attributeNames });

  document.getElementById("localeSelect")?.addEventListener("change", (event) => applyLocale(event.currentTarget.value));
  applyLocale(locale);
  return { applyLocale, getLocale: () => locale, translate };
}
