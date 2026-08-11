# GeoLab 128

GeoLab 128 是一个可本地运行、支持 GPU 加速的三维地理演算沙盘。它面向 128 km x 128 km 区域尺度，结合地形、水文、风场、气候、生态区块、人造设施和动物群落，用于交互式情景推演。

## 主要能力

- 最高 10,000 m 高程、最高 4096 x 4096 网格和多种地图面积预设。
- 地形、河流、风向、温湿条件、土壤、灾害和地下实体内容的联动演算。
- 109 类内部语义程序化资产，覆盖自然物、人造设施、交通水利能源和动物解剖部件。
- 36 类动物、7 个生态功能群、食物网、迁徙廊道、承载力和批量投放存活推演。
- 15 套全球及区域模板，联动地貌、气候、风场、水文、植被与区域物种。
- 单一右侧工具抽屉和完整展开的自然条件数值表单；左下角运行信息条保持独立。

## 本地运行

### 网页端

在 `outputs/geo-sim` 中启动任意静态 HTTP 服务，例如：

```powershell
python -m http.server 4174
```

然后打开 `http://127.0.0.1:4174/`。

### 桌面端

```powershell
cd outputs/geo-sim-desktop
npm install
npm run start
```

桌面端会启用高性能 GPU 偏好、本地服务、渲染进程优先级管理和离线资源加载。

## 构建离线程序

```powershell
cd outputs/geo-sim-desktop
npm run package:win
npm run package:portable
```

生成的目录版与便携版位于 `outputs/GeoLab-128-Local` 和 `outputs/GeoLab-128-Portable`，这两个目录为构建产物，默认不提交到 Git。

## 项目结构

| 路径 | 用途 |
| --- | --- |
| `outputs/geo-sim` | Three.js 网页端、地理引擎与离线资源 |
| `outputs/geo-sim/src` | 地形、水文、生态、程序化资产与渲染模块 |
| `outputs/geo-sim-desktop` | Electron 本地桌面包装器与构建脚本 |
| `outputs/本地运行说明.txt` | Windows 本地运行说明 |

## 验证状态

当前版本已经过网页端桌面/移动端回归、程序化资产工厂检查和离线桌面程序烟雾测试。测试环境确认 WebGL2、D3D11 与 NVIDIA GPU 加速可用。
