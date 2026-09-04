import { build } from "esbuild";
import { packager } from "@electron/packager";
import { execFile } from "node:child_process";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..", "geo-sim");
const vendorRoot = path.join(webRoot, "vendor");
const outputRoot = path.resolve(here, "..", "GeoLab-128-Local");
const engineManifest = path.resolve(here, "..", "..", "engine", "Cargo.toml");
const backendRoot = path.join(here, "backend");
const wasmRoot = path.join(vendorRoot, "geolab");
const rustToolchain = process.env.GEOLAB_RUST_TOOLCHAIN || "1.96.0";
const execute = promisify(execFile);
const backendOnly = process.argv.includes("--backend-only");
const vendorOnly = process.argv.includes("--vendor-only");
const browserOnly = process.argv.includes("--browser-only");
const wasmOnly = process.argv.includes("--wasm-only");
const prepareRuntime = process.argv.includes("--prepare-runtime");

if (vendorOnly) {
  await prepareVendorRuntime();
  console.log(JSON.stringify({ vendorRoot, status: "ready" }, null, 2));
  process.exit(0);
}
if (browserOnly) {
  const browser = await prepareBrowserRuntime();
  console.log(JSON.stringify({ browser, status: "ready" }, null, 2));
  process.exit(0);
}
if (wasmOnly) {
  const wasm = await prepareWasmRuntime();
  console.log(JSON.stringify({ wasm, status: "ready" }, null, 2));
  process.exit(0);
}
if (backendOnly) {
  const backend = await prepareBackendRuntime();
  console.log(JSON.stringify({ backend, status: "ready" }, null, 2));
  process.exit(0);
}

const browser = await prepareBrowserRuntime();
await prepareVendorRuntime();
const wasm = await prepareWasmRuntime();
const backend = await prepareBackendRuntime();
if (prepareRuntime) {
  console.log(JSON.stringify({ backend, browser, vendorRoot, wasm, status: "ready" }, null, 2));
  process.exit(0);
}

const appPaths = await packager({
  dir: here,
  out: outputRoot,
  name: "GeoLab 128",
  executableName: "GeoLab 128",
  platform: "win32",
  arch: "x64",
  overwrite: true,
  asar: true,
  prune: true,
  extraResource: [webRoot, backendRoot],
  appCopyright: "GeoLab 128 local geographic simulation"
});
console.log(JSON.stringify({ backend, browser, vendorRoot, wasm, appPaths, status: "packaged" }, null, 2));

async function prepareBrowserRuntime() {
  const entries = ["assetPipeline", "backendClient", "modelKernel", "modelWorkerClient", "modelWorker", "rustKernelWorker", "wasmAbi"];
  const outputs = [];
  for (const entry of entries) {
    const source = path.join(webRoot, "src-ts", `${entry}.ts`);
    const destination = path.join(webRoot, "src", `${entry}.js`);
    await build({
      entryPoints: [source],
      outfile: destination,
      bundle: false,
      format: "esm",
      platform: "browser",
      target: ["chrome120"],
      sourcemap: false,
      legalComments: "none",
      banner: { js: `// Generated from src-ts/${entry}.ts. Run npm run browser:build to regenerate.` }
    });
    outputs.push(destination);
  }
  return { sources: entries.length, outputs };
}

async function prepareVendorRuntime() {
  await mkdir(path.join(vendorRoot, "three", "addons", "controls"), { recursive: true });
  await cp(
    path.join(here, "node_modules", "three", "build", "three.module.js"),
    path.join(vendorRoot, "three", "three.module.js")
  );
  await hardenThreeShaderDiagnostics(path.join(vendorRoot, "three", "three.module.js"));
  await cp(
    path.join(here, "node_modules", "three", "examples", "jsm", "controls", "OrbitControls.js"),
    path.join(vendorRoot, "three", "addons", "controls", "OrbitControls.js")
  );
  await cp(path.join(here, "node_modules", "three", "LICENSE"), path.join(vendorRoot, "three", "LICENSE"));
  await build({
    entryPoints: [path.join(here, "node_modules", "geotiff", "dist-module", "geotiff.js")],
    outfile: path.join(vendorRoot, "geotiff.bundle.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: ["chrome120"],
    minify: true,
    sourcemap: false,
    legalComments: "linked"
  });
}

async function hardenThreeShaderDiagnostics(modulePath) {
  const source = await readFile(modulePath, "utf8");
  const replacements = [
    ["const errors = gl.getShaderInfoLog( shader ).trim();", "const errors = ( gl.getShaderInfoLog( shader ) || '' ).trim();"],
    ["const programLog = gl.getProgramInfoLog( program ).trim();", "const programLog = ( gl.getProgramInfoLog( program ) || '' ).trim();"],
    ["const vertexLog = gl.getShaderInfoLog( glVertexShader ).trim();", "const vertexLog = ( gl.getShaderInfoLog( glVertexShader ) || '' ).trim();"],
    ["const fragmentLog = gl.getShaderInfoLog( glFragmentShader ).trim();", "const fragmentLog = ( gl.getShaderInfoLog( glFragmentShader ) || '' ).trim();"]
  ];
  let hardened = source;
  for (const [unsafeExpression, safeExpression] of replacements) {
    if (hardened.includes(safeExpression)) continue;
    if (!hardened.includes(unsafeExpression)) {
      throw new Error(`Three.js shader diagnostic guard could not be applied: ${unsafeExpression}`);
    }
    hardened = hardened.replace(unsafeExpression, safeExpression);
  }
  await writeFile(modulePath, hardened, "utf8");
}

async function prepareBackendRuntime() {
  await execute("cargo", [`+${rustToolchain}`, "build", "--manifest-path", engineManifest, "--release", "--package", "geolab-server"], {
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024
  });
  const metadataResult = await execute("cargo", [`+${rustToolchain}`, "metadata", "--manifest-path", engineManifest, "--format-version", "1", "--no-deps"], {
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024
  });
  const metadata = JSON.parse(metadataResult.stdout);
  const executableName = process.platform === "win32" ? "geolab-server.exe" : "geolab-server";
  const source = path.join(metadata.target_directory, "release", executableName);
  const destination = path.join(backendRoot, executableName);
  await mkdir(backendRoot, { recursive: true });
  await cp(source, destination);
  return { source, destination };
}

async function prepareWasmRuntime() {
  const target = "wasm32-unknown-unknown";
  await execute("rustup", ["target", "add", target, "--toolchain", rustToolchain], {
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024
  });
  await execute("cargo", [`+${rustToolchain}`, "build", "--manifest-path", engineManifest, "--release", "--target", target, "--package", "geolab-wasm"], {
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024
  });
  const metadataResult = await execute("cargo", [`+${rustToolchain}`, "metadata", "--manifest-path", engineManifest, "--format-version", "1", "--no-deps"], {
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024
  });
  const metadata = JSON.parse(metadataResult.stdout);
  const source = path.join(metadata.target_directory, target, "release", "geolab_wasm.wasm");
  const destination = path.join(wasmRoot, "geolab_core.wasm");
  await mkdir(wasmRoot, { recursive: true });
  await cp(source, destination);
  return { source, destination, target, toolchain: rustToolchain };
}
