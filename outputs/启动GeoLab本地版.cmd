@echo off
setlocal
chcp 65001 >nul
set "ROOT=%~dp0"
set "PORTABLE=%ROOT%GeoLab-128-Portable\GeoLab-128-Local-GPU-1.0.0.exe"
set "APP=%ROOT%GeoLab-128-Local\GeoLab 128-win32-x64\GeoLab 128.exe"
if exist "%PORTABLE%" (
  start "" "%PORTABLE%"
  exit /b 0
)
if exist "%APP%" (
  start "" "%APP%"
  exit /b 0
)
echo 未找到桌面程序，正在使用本地开发运行时启动。
where node >nul 2>nul || (
  echo 需要安装 Node.js，或先构建 GeoLab 128 桌面程序。
  pause
  exit /b 1
)
start "GeoLab 128 本地服务" /min node "%ROOT%..\work\static-server.mjs" "%ROOT%geo-sim" 5179
timeout /t 1 /nobreak >nul
start "" msedge.exe --app=http://127.0.0.1:5179/ --enable-gpu-rasterization --ignore-gpu-blocklist
