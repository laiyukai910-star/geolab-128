import { build } from "esbuild";
import { packager } from "@electron/packager";
import { execFile } from "node:child_process";
import { cp, mkdir } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..", "geo-sim");
const vendorRoot = path.join(webRoot, "vendor");
const outputRoot = path.resolve(here, "..", "GeoLab-128-Local");
const engineManifest = path.resolve(here, "..", "..", "engine", "Cargo.toml");
const backendRoot = path.join(here, "backend");
const execute = promisify(execFile);
const backendOnly = process.argv.includes("--backend-only");
const vendorOnly = process.argv.includes("--vendor-only");
const prepareRuntime = process.argv.includes("--prepare-runtime");

if (!backendOnly) await prepareVendorRuntime();
const backend = vendorOnly ? null : await prepareBackendRuntime();

if (vendorOnly) {
  console.log(JSON.stringify({ vendorRoot, status: "ready" }, null, 2));
  process.exit(0);
}
if (backendOnly || prepareRuntime) {
  console.log(JSON.stringify({ backend, vendorRoot: backendOnly ? null : vendorRoot, status: "ready" }, null, 2));
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
console.log(JSON.stringify({ vendorRoot, appPaths, status: "packaged" }, null, 2));

async function prepareVendorRuntime() {
  await mkdir(path.join(vendorRoot, "three", "addons", "controls"), { recursive: true });
  await cp(
    path.join(here, "node_modules", "three", "build", "three.module.js"),
    path.join(vendorRoot, "three", "three.module.js")
  );
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

async function prepareBackendRuntime() {
  await execute("cargo", ["build", "--manifest-path", engineManifest, "--release", "--package", "geolab-server"], {
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024
  });
  const metadataResult = await execute("cargo", ["metadata", "--manifest-path", engineManifest, "--format-version", "1", "--no-deps"], {
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
