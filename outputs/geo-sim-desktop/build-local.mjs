import { build } from "esbuild";
import { packager } from "@electron/packager";
import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..", "geo-sim");
const vendorRoot = path.join(webRoot, "vendor");
const outputRoot = path.resolve(here, "..", "GeoLab-128-Local");

await mkdir(path.join(vendorRoot, "three", "addons", "controls"), { recursive: true });
await cp(
  path.join(here, "node_modules", "three", "build", "three.module.js"),
  path.join(vendorRoot, "three", "three.module.js")
);
await cp(
  path.join(here, "node_modules", "three", "examples", "jsm", "controls", "OrbitControls.js"),
  path.join(vendorRoot, "three", "addons", "controls", "OrbitControls.js")
);
await cp(
  path.join(here, "node_modules", "three", "LICENSE"),
  path.join(vendorRoot, "three", "LICENSE")
);
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

if (process.argv.includes("--vendor-only")) {
  console.log(JSON.stringify({ vendorRoot, status: "ready" }, null, 2));
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
  extraResource: [webRoot],
  appCopyright: "GeoLab 128 local geographic simulation"
});
console.log(JSON.stringify({ vendorRoot, appPaths, status: "packaged" }, null, 2));
