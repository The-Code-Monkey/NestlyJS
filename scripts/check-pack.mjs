#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const packageDir = path.join(repoRoot, "packages/server");

const raw = execFileSync(
  "npm",
  ["pack", "--dry-run", "--json", "--ignore-scripts"],
  {
    cwd: packageDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }
);

const [result] = JSON.parse(raw);
const files = new Set(result.files.map((entry) => entry.path));

const required = [
  "package.json",
  "tsconfig.devServer.json",
  "dist/bin/nestly.js",
  "dist/build.js",
  "dist/bundler.js",
  "dist/devAPIChild.js",
  "dist/devAPIWorker.js",
  "dist/devChildWorker.js",
  "dist/devServer.js",
  "dist/devSSRWorker.js",
  "dist/manifest.js",
  "dist/prodRouter.js",
  "dist/routePatterns.js",
  "dist/routeResolver.js",
  "dist/shim.js",
  "dist/staticAssets.js",
];

const forbiddenPrefixes = ["src/", "test/", "routes/"];
const forbiddenFiles = [
  "dist/apiChild.js",
  "dist/apiWorker.js",
  "dist/childWorker.js",
  "dist/client.js",
  "dist/devRenderer.js",
  "dist/ssrWorker.js",
];

const errors = [];

for (const file of required) {
  if (!files.has(file)) errors.push(`missing required file: ${file}`);
}

for (const file of files) {
  if (forbiddenPrefixes.some((prefix) => file.startsWith(prefix))) {
    errors.push(`forbidden file in package: ${file}`);
  }
  if (forbiddenFiles.includes(file)) {
    errors.push(`stale build output in package: ${file}`);
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

console.log(`package contents ok (${files.size} files)`);
