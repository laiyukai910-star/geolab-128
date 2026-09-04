const { app, BrowserWindow, dialog, powerSaveBlocker } = require("electron");
const { spawn } = require("node:child_process");
const { createServer } = require("node:http");
const { createReadStream, existsSync, statSync, writeFileSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const smokeTestArgument = process.argv.find((argument) => argument.startsWith("--smoke-test="));
const smokeTestPath = smokeTestArgument ? path.resolve(smokeTestArgument.slice("--smoke-test=".length)) : null;
const disableNativeBackend = process.argv.includes("--disable-native-backend");
const PREFERRED_LOCAL_PORT = 48128;
const LOCAL_CACHE_MODE = "etag-revalidate";

const rasterThreadCount = Math.max(4, Math.min(8, os.cpus().length - 2));
const PERFORMANCE_SWITCHES = [
  ["ignore-gpu-blocklist"],
  ["enable-gpu-rasterization"],
  ["enable-oop-rasterization"],
  ["enable-zero-copy"],
  ["enable-native-gpu-memory-buffers"],
  ["enable-accelerated-2d-canvas"],
  ["enable-gpu-compositing"],
  ["disable-renderer-backgrounding"],
  ["disable-background-timer-throttling"],
  ["disable-backgrounding-occluded-windows"],
  ["use-angle", "d3d11"],
  ["num-raster-threads", String(rasterThreadCount)],
  ["enable-features", "CanvasOopRasterization,UseSkiaRenderer"]
];
for (const [name, value] of PERFORMANCE_SWITCHES) app.commandLine.appendSwitch(name, value);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".csv": "text/csv; charset=utf-8"
};

let localServer = null;
let priorityTimer = null;
let powerSaveBlockerId = null;
let latestPriorityReport = null;
let computeBackend = null;

function applyProcessPriority(pid, type, requestedPriority) {
  try {
    os.setPriority(pid, requestedPriority);
    return {
      pid,
      type,
      requestedPriority,
      actualPriority: os.getPriority(pid),
      status: "applied"
    };
  } catch (error) {
    return {
      pid,
      type,
      requestedPriority,
      actualPriority: null,
      status: "unavailable",
      error: error?.message || String(error)
    };
  }
}

function boostElectronProcessPriorities(window) {
  const processTargets = new Map();
  processTargets.set(process.pid, { type: "Browser", priority: os.constants.priority.PRIORITY_HIGH });
  const rendererPid = window?.webContents?.getOSProcessId?.();
  if (rendererPid) processTargets.set(rendererPid, { type: "Tab", priority: os.constants.priority.PRIORITY_HIGH });
  if (computeBackend?.process?.pid) {
    processTargets.set(computeBackend.process.pid, { type: "GeoLabRustCore", priority: os.constants.priority.PRIORITY_ABOVE_NORMAL });
  }
  for (const metric of app.getAppMetrics()) {
    const highPriority = ["Browser", "Tab", "GPU"].includes(metric.type);
    processTargets.set(metric.pid, {
      type: metric.type,
      name: metric.name || metric.serviceName || "",
      priority: highPriority ? os.constants.priority.PRIORITY_HIGH : os.constants.priority.PRIORITY_ABOVE_NORMAL
    });
  }
  const processes = Array.from(processTargets, ([pid, target]) => ({
    ...applyProcessPriority(pid, target.type, target.priority),
    name: target.name || ""
  }));
  return {
    mode: "persistent-high-performance",
    checkedAt: new Date().toISOString(),
    rasterThreadCount,
    powerSaveBlockerActive: powerSaveBlockerId !== null && powerSaveBlocker.isStarted(powerSaveBlockerId),
    appliedProcessCount: processes.filter((item) => item.status === "applied").length,
    highPriorityProcessCount: processes.filter((item) => item.status === "applied" && item.actualPriority <= os.constants.priority.PRIORITY_HIGH).length,
    performanceSwitches: PERFORMANCE_SWITCHES.map(([name, value]) => value ? `${name}=${value}` : name),
    processes
  };
}

function publishPriorityReport(window, report) {
  if (!window || window.isDestroyed()) return;
  const serialized = JSON.stringify(report).replaceAll("<", "\\u003c");
  window.webContents.executeJavaScript(`globalThis.__geoLabSystemPriorityStats = ${serialized}`).catch(() => {});
}

function startPriorityManagement(window) {
  const refresh = () => {
    latestPriorityReport = boostElectronProcessPriorities(window);
    publishPriorityReport(window, latestPriorityReport);
  };
  refresh();
  clearInterval(priorityTimer);
  priorityTimer = setInterval(refresh, 5000);
  window.once("closed", () => {
    clearInterval(priorityTimer);
    priorityTimer = null;
  });
}

function applicationRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "geo-sim")
    : path.resolve(__dirname, "..", "geo-sim");
}

function computeBackendExecutable() {
  const executableName = process.platform === "win32" ? "geolab-server.exe" : "geolab-server";
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, "backend", executableName)]
    : [
        path.join(__dirname, "backend", executableName),
        path.resolve(__dirname, "..", "..", "engine", "target", "release", executableName)
      ];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

function startComputeBackend() {
  if (disableNativeBackend) {
    return Promise.resolve({ status: "disabled", process: null, url: null, executable: null });
  }
  const executable = computeBackendExecutable();
  if (!executable) return Promise.resolve({ status: "unavailable", process: null, url: null, executable: null });
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ["--port", "0"], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, RUST_LOG: process.env.RUST_LOG || "geolab_server=warn,tower_http=warn" }
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => finish(new Error("Rust computation service did not become ready within 15 seconds")), 15000);
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) {
        child.kill();
        reject(error);
      } else {
        resolve(value);
      }
    };
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      const lines = stdout.split(/\r?\n/);
      stdout = lines.pop() || "";
      for (const line of lines) {
        try {
          const message = JSON.parse(line);
          if (message.event === "ready" && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(message.url)) {
            finish(null, { status: "ready", process: child, url: message.url, executable, pid: child.pid });
            return;
          }
        } catch {
          // Ignore non-protocol stdout until the ready record arrives.
        }
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk.toString("utf8")}`.slice(-8000);
    });
    child.once("error", (error) => finish(error));
    child.once("exit", (code) => {
      if (!settled) finish(new Error(`Rust computation service exited before readiness (${code}): ${stderr}`));
    });
  });
}

function startLocalServer(root) {
  const resolvedRoot = path.resolve(root);
  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      try {
        const url = new URL(request.url || "/", "http://127.0.0.1");
        const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
        const filePath = path.resolve(resolvedRoot, `.${pathname}`);
        if (filePath !== resolvedRoot && !filePath.startsWith(`${resolvedRoot}${path.sep}`)) {
          response.writeHead(403).end("forbidden");
          return;
        }
        const stat = statSync(filePath);
        if (!stat.isFile()) throw new Error("not a file");
        const etag = `"${stat.size.toString(16)}-${Math.round(stat.mtimeMs).toString(16)}"`;
        const headers = {
          "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
          "Cache-Control": "public, max-age=0, must-revalidate",
          "ETag": etag,
          "Cross-Origin-Resource-Policy": "same-origin"
        };
        if (request.headers["if-none-match"] === etag) {
          response.writeHead(304, headers).end();
          return;
        }
        response.writeHead(200, headers);
        createReadStream(filePath).pipe(response);
      } catch {
        response.writeHead(404).end("not found");
      }
    });
    const listen = (port, allowFallback) => {
      const onError = (error) => {
        if (allowFallback && error?.code === "EADDRINUSE") {
          listen(0, false);
          return;
        }
        reject(error);
      };
      server.once("error", onError);
      server.listen(port, "127.0.0.1", () => {
        server.off("error", onError);
        const address = server.address();
        resolve({ server, url: `http://127.0.0.1:${address.port}/`, port: address.port });
      });
    };
    listen(PREFERRED_LOCAL_PORT, true);
  });
}

async function createWindow() {
  const root = applicationRoot();
  const backendStart = startComputeBackend().catch((error) => ({
    status: "failed",
    process: null,
    url: null,
    error: error?.message || String(error)
  }));
  const [backend, local] = await Promise.all([backendStart, startLocalServer(root)]);
  computeBackend = backend;
  localServer = local.server;
  const window = new BrowserWindow({
    title: "GeoLab 128 本地地理演算",
    width: 1600,
    height: 1000,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#101512",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webgl: true,
      backgroundThrottling: false
    }
  });
  latestPriorityReport = boostElectronProcessPriorities(window);
  if (!smokeTestPath) window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  const externalRequests = [];
  if (smokeTestPath) {
    window.webContents.session.webRequest.onBeforeRequest((details, callback) => {
      const requestUrl = String(details.url || "");
      const backendRequest = computeBackend?.url && requestUrl.startsWith(computeBackend.url);
      const localRequest = requestUrl.startsWith(local.url) || backendRequest || requestUrl.startsWith("data:") || requestUrl.startsWith("blob:");
      if (!localRequest) externalRequests.push(requestUrl);
      callback({ cancel: !localRequest });
    });
  }
  const applicationUrl = new URL(local.url);
  if (computeBackend?.url) applicationUrl.searchParams.set("backend", computeBackend.url);
  await window.loadURL(applicationUrl.toString());
  startPriorityManagement(window);
  if (smokeTestPath) await runSmokeTest(window, local.url, externalRequests);
}

async function runSmokeTest(window, localUrl, externalRequests) {
  const timeoutAt = Date.now() + 120000;
  let pageState = null;
  while (Date.now() < timeoutAt) {
    pageState = await window.webContents.executeJavaScript(`(() => ({
      ready: Boolean(globalThis.__geoLabModelStats && globalThis.__geoLabGpuStats),
      startupCompleted: Boolean(globalThis.__geoLabStartupStats?.completed),
      statusText: document.querySelector("#status")?.textContent || "",
      subtitle: document.querySelector("#modelSubtitle")?.textContent || "",
      model: globalThis.__geoLabModelStats || null,
      gpu: globalThis.__geoLabGpuStats || null,
      gpuPipelineWarmup: globalThis.__geoLabGpuPipelineWarmupStats || null,
      systemPriority: globalThis.__geoLabSystemPriorityStats || null,
      rustAuthority: globalThis.__geoLabModelStats?.rustAuthoritative || null,
      rustBackend: globalThis.__geoLabRustBackend ? {
        transport: globalThis.__geoLabRustBackend.transport || null,
        requestId: globalThis.__geoLabRustBackend.requestId || null,
        engine: globalThis.__geoLabRustBackend.report?.engine || null,
        processIntegrityIndex: globalThis.__geoLabRustBackend.report?.summary?.processIntegrityIndex ?? null,
        passedGateCount: globalThis.__geoLabRustBackend.report?.summary?.passedGateCount ?? null,
        reviewGateCount: globalThis.__geoLabRustBackend.report?.summary?.reviewGateCount ?? null,
        failedGateCount: globalThis.__geoLabRustBackend.report?.summary?.failedGateCount ?? null,
        routingMethod: globalThis.__geoLabRustBackend.report?.terrain?.routingMethod || null,
        waterResidualPercent: globalThis.__geoLabRustBackend.report?.waterBudget?.residualPercentOfInput ?? null,
        groundwaterResidualPercent: globalThis.__geoLabRustBackend.report?.subsurfaceBudget?.residualPercentOfInput ?? null,
        sedimentResidualPercent: globalThis.__geoLabRustBackend.report?.sedimentBudget?.residualPercentOfDetachment ?? null,
        habitatConnectivityIndex: globalThis.__geoLabRustBackend.report?.ecology?.meanResistanceConnectivity ?? null,
        auditResolution: globalThis.__geoLabRustBackend.sample?.auditResolution || null
      } : null,
      render: globalThis.__geoLabRenderLoadStats || null,
      infrastructure: globalThis.__geoLabInfrastructure3DStats ? {
        buildingInstanceCount: globalThis.__geoLabInfrastructure3DStats.buildingInstanceCount || 0,
        blockMicrozoneDetailPlan: globalThis.__geoLabInfrastructure3DStats.blockMicrozoneDetailPlan || null
      } : null,
      wildlife: globalThis.__geoLabWildlife3DStats || null,
      scene: globalThis.__geoLabSceneComplexityStats ? {
        profile: globalThis.__geoLabSceneComplexityStats.proceduralModeling?.profile || null,
        pipeline: globalThis.__geoLabSceneComplexityStats.proceduralModeling?.pipeline || null,
        proceduralInstanceCount: globalThis.__geoLabSceneComplexityStats.proceduralModeling?.instanceCount || 0,
        proceduralVariantCount: Object.keys(globalThis.__geoLabSceneComplexityStats.proceduralModeling?.variantInstances || {}).length,
        templateGeometryCount: globalThis.__geoLabSceneComplexityStats.templateGeometryCount || 0,
        templateVertexCount: globalThis.__geoLabSceneComplexityStats.templateVertexCount || 0,
        templateTriangleCount: globalThis.__geoLabSceneComplexityStats.templateTriangleCount || 0,
        physicalMaterialCount: globalThis.__geoLabSceneComplexityStats.materialTypeCounts?.MeshPhysicalMaterial || 0
      } : null,
      title: document.title
    }))()`);
    const rustReady = (
      pageState?.rustBackend?.engine === "geolab-core-rust" &&
      pageState?.rustBackend?.routingMethod === "multiple-flow-direction" &&
      pageState?.rustBackend?.failedGateCount === 0
    );
    const authoritativeReady = pageState?.rustAuthority?.status === "applied" && pageState?.rustAuthority?.resolution <= 512;
    const assetPipelineReady = (
      pageState?.scene?.profile === "typed-multi-variant-physical-assets-v3" &&
      pageState?.scene?.pipeline?.implementation === "strict-typescript" &&
      pageState?.scene?.proceduralInstanceCount > 0 &&
      pageState?.scene?.proceduralVariantCount > 1 &&
      pageState?.scene?.templateTriangleCount > 1000 &&
      pageState?.scene?.physicalMaterialCount > 0
    );
    const uiReady = pageState?.startupCompleted && !pageState?.subtitle?.includes("演算中");
    if (pageState?.ready && uiReady && pageState?.render?.completed && pageState?.gpuPipelineWarmup?.status === "ready" && pageState?.systemPriority?.highPriorityProcessCount >= 3 && rustReady && authoritativeReady && assetPipelineReady) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const canvasVisual = await captureCanvasVisualReport(window);
  const assetGeometryAudit = await auditProceduralGeometryComplexity(window);
  const priorityReady = Boolean(
    latestPriorityReport?.highPriorityProcessCount >= 3 &&
    latestPriorityReport?.processes?.some((item) => item.type === "GPU" && item.status === "applied")
  );
  const report = {
    passed: Boolean(
      pageState?.ready &&
      pageState?.startupCompleted &&
      !pageState?.subtitle?.includes("演算中") &&
      pageState?.render?.completed &&
      pageState?.gpuPipelineWarmup?.status === "ready" &&
      (
        pageState?.rustBackend?.engine === "geolab-core-rust" &&
        pageState?.rustBackend?.routingMethod === "multiple-flow-direction" &&
        pageState?.rustBackend?.failedGateCount === 0
      ) &&
      pageState?.rustAuthority?.status === "applied" &&
      pageState?.scene?.profile === "typed-multi-variant-physical-assets-v3" &&
      pageState?.scene?.pipeline?.implementation === "strict-typescript" &&
      pageState?.scene?.proceduralInstanceCount > 0 &&
      pageState?.scene?.proceduralVariantCount > 1 &&
      pageState?.scene?.templateTriangleCount > 1000 &&
      pageState?.scene?.physicalMaterialCount > 0 &&
      canvasVisual.passed &&
      assetGeometryAudit.passed &&
      priorityReady &&
      externalRequests.length === 0
    ),
    checkedAt: new Date().toISOString(),
    localUrl,
    localRuntime: {
      preferredPort: PREFERRED_LOCAL_PORT,
      activePort: Number(new URL(localUrl).port),
      cacheMode: LOCAL_CACHE_MODE,
      rustBackend: computeBackend ? {
        status: computeBackend.status,
        url: computeBackend.url,
        pid: computeBackend.pid || null,
        executable: computeBackend.executable || null
      } : null
    },
    externalRequests,
    gpuFeatureStatus: app.getGPUFeatureStatus(),
    gpuInfo: await app.getGPUInfo("complete"),
    systemPriority: latestPriorityReport,
    canvasVisual,
    assetGeometryAudit,
    page: pageState
  };
  writeFileSync(smokeTestPath, JSON.stringify(report, null, 2), "utf8");
  await new Promise((resolve) => setTimeout(resolve, 160));
  window.destroy();
  app.quit();
}

async function auditProceduralGeometryComplexity(window) {
  return window.webContents.executeJavaScript(`(async () => {
    try {
      const assets = await import(new URL("./src/proceduralAssets.js", location.href).href);
      const kinds = ["broadleaf-canopy", "setback-tower", "wildlife-torso", "process-tank"];
      const rows = [];
      for (const kind of kinds) {
        const counts = {};
        for (const quality of ["high", "ultra", "exhaustive"]) {
          const geometry = assets.createProceduralGeometry(kind, quality, 0);
          counts[quality] = {
            vertices: geometry.getAttribute("position")?.count || 0,
            triangles: geometry.index ? geometry.index.count / 3 : (geometry.getAttribute("position")?.count || 0) / 3
          };
          geometry.dispose();
        }
        rows.push({
          kind,
          ...counts,
          monotonic: counts.high.vertices < counts.ultra.vertices && counts.ultra.vertices < counts.exhaustive.vertices
        });
      }
      const base = assets.createProceduralGeometry("broadleaf-canopy", "ultra", 0);
      const variant = assets.createProceduralGeometry("broadleaf-canopy", "ultra", 1);
      const a = base.getAttribute("position").array;
      const b = variant.getAttribute("position").array;
      let variantDifference = 0;
      for (let i = 0; i < Math.min(a.length, b.length, 512); i += 1) variantDifference += Math.abs(a[i] - b[i]);
      base.dispose();
      variant.dispose();
      return {
        passed: rows.every((row) => row.monotonic) && variantDifference > 0.01,
        rows,
        variantDifference: Number(variantDifference.toFixed(6))
      };
    } catch (error) {
      return { passed: false, error: error?.stack || String(error) };
    }
  })()`);
}

async function captureCanvasVisualReport(window) {
  try {
    const webglPixels = await window.webContents.executeJavaScript(`new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        try {
          const canvas = document.querySelector("#scene canvas");
          const gl = canvas?.getContext("webgl2") || canvas?.getContext("webgl");
          if (!canvas || !gl) return resolve({ passed: false, error: "WebGL canvas unavailable" });
          const width = gl.drawingBufferWidth;
          const height = gl.drawingBufferHeight;
          const pixels = new Uint8Array(width * height * 4);
          gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          const stride = Math.max(1, Math.floor(Math.sqrt((width * height) / 8192)));
          const colors = new Set();
          let samples = 0;
          let mean = 0;
          let m2 = 0;
          let min = 255;
          let max = 0;
          for (let y = 0; y < height; y += stride) {
            for (let x = 0; x < width; x += stride) {
              const offset = (y * width + x) * 4;
              const red = pixels[offset];
              const green = pixels[offset + 1];
              const blue = pixels[offset + 2];
              const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
              samples += 1;
              const delta = luminance - mean;
              mean += delta / samples;
              m2 += delta * (luminance - mean);
              min = Math.min(min, luminance);
              max = Math.max(max, luminance);
              colors.add(((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4));
            }
          }
          const deviation = samples > 1 ? Math.sqrt(m2 / (samples - 1)) : 0;
          resolve({
            passed: samples >= 256 && max - min >= 20 && deviation >= 8 && colors.size >= 12,
            width,
            height,
            sampledPixelCount: samples,
            luminanceRange: Number((max - min).toFixed(2)),
            luminanceStandardDeviation: Number(deviation.toFixed(2)),
            coarseColorCount: colors.size
          });
        } catch (error) {
          resolve({ passed: false, error: error?.stack || String(error) });
        }
      }));
    })`);
    const bounds = await window.webContents.executeJavaScript(`(() => {
      const rect = document.querySelector("#scene canvas")?.getBoundingClientRect();
      if (!rect) return null;
      return {
        x: Math.max(0, Math.floor(rect.left)),
        y: Math.max(0, Math.floor(rect.top)),
        width: Math.max(1, Math.floor(rect.width)),
        height: Math.max(1, Math.floor(rect.height))
      };
    })()`);
    if (!bounds) return { passed: false, error: "3D canvas bounds unavailable" };
    const image = await window.webContents.capturePage(bounds);
    const size = image.getSize();
    const pixels = image.toBitmap();
    const pixelCount = size.width * size.height;
    const stride = Math.max(1, Math.floor(Math.sqrt(pixelCount / 8192)));
    const coarseColors = new Set();
    let samples = 0;
    let mean = 0;
    let m2 = 0;
    let minLuminance = 255;
    let maxLuminance = 0;
    for (let y = 0; y < size.height; y += stride) {
      for (let x = 0; x < size.width; x += stride) {
        const offset = (y * size.width + x) * 4;
        const red = pixels[offset + 2];
        const green = pixels[offset + 1];
        const blue = pixels[offset];
        const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
        samples += 1;
        const delta = luminance - mean;
        mean += delta / samples;
        m2 += delta * (luminance - mean);
        minLuminance = Math.min(minLuminance, luminance);
        maxLuminance = Math.max(maxLuminance, luminance);
        coarseColors.add(((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4));
      }
    }
    const standardDeviation = samples > 1 ? Math.sqrt(m2 / (samples - 1)) : 0;
    const screenshotPath = /\.json$/i.test(smokeTestPath)
      ? smokeTestPath.replace(/\.json$/i, "-canvas.png")
      : `${smokeTestPath}-canvas.png`;
    writeFileSync(screenshotPath, image.toPNG());
    return {
      passed: webglPixels.passed && samples >= 256 && maxLuminance - minLuminance >= 20 && standardDeviation >= 8 && coarseColors.size >= 12,
      width: size.width,
      height: size.height,
      sampledPixelCount: samples,
      luminanceRange: Number((maxLuminance - minLuminance).toFixed(2)),
      luminanceStandardDeviation: Number(standardDeviation.toFixed(2)),
      coarseColorCount: coarseColors.size,
      webglPixels,
      screenshotPath
    };
  } catch (error) {
    return { passed: false, error: error?.stack || String(error) };
  }
}

app.whenReady().then(() => {
  powerSaveBlockerId = powerSaveBlocker.start("prevent-app-suspension");
  latestPriorityReport = boostElectronProcessPriorities(null);
  return createWindow();
}).catch((error) => {
  if (smokeTestPath) {
    writeFileSync(smokeTestPath, JSON.stringify({ passed: false, error: error?.stack || String(error) }, null, 2), "utf8");
  } else {
    dialog.showErrorBox("GeoLab 128 启动失败", error?.stack || String(error));
  }
  app.quit();
});

app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  clearInterval(priorityTimer);
  priorityTimer = null;
  if (powerSaveBlockerId !== null && powerSaveBlocker.isStarted(powerSaveBlockerId)) powerSaveBlocker.stop(powerSaveBlockerId);
  powerSaveBlockerId = null;
  localServer?.close();
  localServer = null;
  if (computeBackend?.process && !computeBackend.process.killed) computeBackend.process.kill();
  computeBackend = null;
});
