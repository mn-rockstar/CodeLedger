import * as esbuild from "esbuild";
import {
  mkdirSync,
  copyFileSync,
  existsSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "dist");

// Store builds ship no source maps: they roughly triple the package size and
// publish your original TypeScript alongside it.
const production = process.argv.includes("--production");

// Start clean so a stale file (e.g. a sourcemap from a previous dev build)
// can't end up inside the uploaded ZIP.
if (production && existsSync(dist)) rmSync(dist, { recursive: true, force: true });
if (!existsSync(dist)) mkdirSync(dist, { recursive: true });

const entries = [
  { in: "src/background.ts", out: "background.js" },
  { in: "src/leetcode/content-entry.ts", out: "content-leetcode.js" },
  { in: "src/popup/popup.ts", out: "popup.js" },
];

const staticFiles = [
  "manifest.json",
  "popup.html",
  "welcome.html",
  "guide.html",
  "theme.css",
];

for (const entry of entries) {
  await esbuild.build({
    entryPoints: [path.join(root, entry.in)],
    outfile: path.join(dist, entry.out),
    bundle: true,
    format: "iife",
    target: "chrome110",
    sourcemap: !production,
    minify: production,
    logLevel: "info",
  });
}

for (const file of staticFiles) {
  copyFileSync(path.join(root, file), path.join(dist, file));
}

const iconsSrc = path.join(root, "icons");
const iconsDist = path.join(dist, "icons");
mkdirSync(iconsDist, { recursive: true });
for (const icon of readdirSync(iconsSrc)) {
  copyFileSync(path.join(iconsSrc, icon), path.join(iconsDist, icon));
}

console.log(
  production
    ? "Production build complete -> dist/ (no source maps, minified)"
    : "Build complete -> dist/"
);
