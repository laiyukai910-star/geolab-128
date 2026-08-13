const { app, BrowserWindow, dialog, powerSaveBlocker } = require("electron");
const { spawn } = require("node:child_process");
const { createServer } = require("node:http");
const { createReadStream, existsSync, statSync, writeFileSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const smokeTestArgument = process.argv.find((argument) => argument.startsWith("--smoke-test="));
const smokeTestPath = smokeTestArgument ? path.resolve(smokeTestArgument.slice("--smoke-test=".length)) : null;
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
      model: globalThis.__geoLabModelStats || null,
      gpu: globalThis.__geoLabGpuStats || null,
      gpuPipelineWarmup: globalThis.__geoLabGpuPipelineWarmupStats || null,
      systemPriority: globalThis.__geoLabSystemPriorityStats || null,
      rustBackend: globalThis.__geoLabRustBackend ? {
        requestId: globalThis.__geoLabRustBackend.requestId || null,
        engine: globalThis.__geoLabRustBackend.report?.engine || null,
        processIntegrityIndex: globalThis.__geoLabRustBackend.report?.summary?.processIntegrityIndex ?? null,
        failedGateCount: globalThis.__geoLabRustBackend.report?.summary?.failedGateCount ?? null,
        auditResolution: globalThis.__geoLabRustBackend.sample?.auditResolution || null
      } : null,
      render: globalThis.__geoLabRenderLoadStats || null,
      infrastructure: globalThis.__geoLabInfrastructure3DStats ? {
        buildingInstanceCount: globalThis.__geoLabInfrastructure3DStats.buildingInstanceCount || 0,
        blockMicrozoneDetailPlan: globalThis.__geoLabInfrastructure3DStats.blockMicrozoneDetailPlan || null
      } : null,
      wildlife: globalThis.__geoLabWildlife3DStats || null,
      title: document.title
    }))()`);
    const rustReady = computeBackend?.status !== "ready" || pageState?.rustBackend?.engine === "geolab-core-rust";
    if (pageState?.ready && pageState?.render?.completed && pageState?.gpuPipelineWarmup?.status === "ready" && pageState?.systemPriority?.highPriorityProcessCount >= 3 && rustReady) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const priorityReady = Boolean(
    latestPriorityReport?.highPriorityProcessCount >= 3 &&
    latestPriorityReport?.processes?.some((item) => item.type === "GPU" && item.status === "applied")
  );
  const report = {
    passed: Boolean(
      pageState?.ready &&
      pageState?.render?.completed &&
      pageState?.gpuPipelineWarmup?.status === "ready" &&
      (computeBackend?.status !== "ready" || pageState?.rustBackend?.engine === "geolab-core-rust") &&
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
    page: pageState
  };
  writeFileSync(smokeTestPath, JSON.stringify(report, null, 2), "utf8");
  await window.webContents.executeJavaScript(`(() => {
    const canvas = document.querySelector("#scene canvas");
    const gl = canvas?.getContext("webgl2") || canvas?.getContext("webgl");
    gl?.finish();
    return true;
  })()`).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 100));
  window.destroy();
  app.quit();
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
