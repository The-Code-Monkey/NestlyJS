#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
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

function listBuiltFiles(dir, prefix) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relative = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      found.push(...listBuiltFiles(path.join(dir, entry.name), relative));
    } else {
      found.push(relative);
    }
  }
  return found;
}

const errors = [];
const distDir = path.join(packageDir, "dist");

// Every built module ships. Reading `dist` instead of a hand-written module
// list means a new module cannot be added to the build and forgotten here.
let builtFiles = [];
if (!fs.existsSync(distDir)) {
  errors.push("dist/ is missing; run the server build first");
} else {
  builtFiles = listBuiltFiles(distDir, "dist");
  if (builtFiles.length === 0) errors.push("dist/ is empty");
}

const required = [
  "package.json",
  "README.md",
  "LICENSE",
  "tsconfig.devServer.json",
  ...builtFiles,
];

const packageJson = JSON.parse(
  fs.readFileSync(path.join(packageDir, "package.json"), "utf8")
);
const binTarget = packageJson.bin?.nestly;
if (!binTarget) {
  errors.push("package.json declares no nestly bin");
} else if (!files.has(binTarget)) {
  errors.push(`missing bin target: ${binTarget}`);
}

const forbiddenPrefixes = ["src/", "test/", "routes/"];
const forbiddenFiles = [
  "dist/apiChild.js",
  "dist/apiWorker.js",
  "dist/childWorker.js",
  "dist/client.js",
  "dist/devRenderer.js",
  "dist/ssrWorker.js",
];

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
