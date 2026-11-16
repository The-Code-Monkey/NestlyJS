#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const packageDir = path.join(repoRoot, "packages/server");
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "nestly-install-"));
const appDir = path.join(workDir, "app");
const port = 4300 + Math.floor(Math.random() * 500);

function write(relative, contents) {
  const filePath = path.join(appDir, relative);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

async function waitForServer(url, attempts = 30) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      // not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`server did not become ready at ${url}`);
}

function stop(child) {
  if (!child || child.killed) return;
  try {
    if (process.platform === "win32") child.kill();
    else process.kill(-child.pid, "SIGTERM");
  } catch {
    // already gone
  }
}

let server = null;

try {
  const packed = JSON.parse(
    execFileSync(
      "npm",
      ["pack", "--json", "--ignore-scripts", "--pack-destination", workDir],
      { cwd: packageDir, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }
    )
  );
  const tarball = path.join(workDir, packed[0].filename);

  fs.mkdirSync(appDir, { recursive: true });
  write(
    "package.json",
    JSON.stringify({ name: "nestly-install-smoke", private: true }, null, 2)
  );

  execFileSync(
    "npm",
    [
      "install",
      "--no-audit",
      "--no-fund",
      "--ignore-scripts",
      tarball,
      "react@19.3.1",
      "react-dom@19.3.1",
      "@types/react@19.3.0",
      "@types/react-dom@19.3.0",
    ],
    { cwd: appDir, stdio: "inherit" }
  );

  write(
    "routes/layout.tsx",
    `import React from "react";
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html><head><title>Smoke</title></head><body>{children}</body></html>;
}`
  );
  write(
    "routes/page.tsx",
    `import React from "react";
import Counter from "./counter";
export default function Page() {
  return <main><h1>Installed App</h1><Counter /></main>;
}`
  );
  write(
    "routes/counter.tsx",
    `"use client";
import React, { useState } from "react";
export default function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>Client Counter {count}</button>;
}`
  );
  write("public/hello.txt", "installed static\n");

  const nestly = path.join(appDir, "node_modules", ".bin", "nestly");
  execFileSync(nestly, ["build"], { cwd: appDir, stdio: "inherit" });

  if (!fs.existsSync(path.join(appDir, ".nestly", "manifest.json"))) {
    throw new Error("build did not write .nestly/manifest.json");
  }

  server = spawn(nestly, ["start", `--port=${port}`], {
    cwd: appDir,
    detached: true,
    stdio: ["ignore", "ignore", "inherit"],
  });

  const page = await waitForServer(`http://127.0.0.1:${port}/`);
  const html = await page.text();
  if (!html.includes("Installed App")) {
    throw new Error("installed app did not render its page");
  }

  const asset = await fetch(`http://127.0.0.1:${port}/hello.txt`);
  if (!asset.ok || (await asset.text()).trim() !== "installed static") {
    throw new Error("installed app did not serve public assets");
  }

  stop(server);
  server = null;

  // Development path: routes compile through ts-node and the SSR child loads
  // the client bundler, so a dev-only dependency problem fails here instead of
  // in a user's app.
  const devPort = port + 1;
  server = spawn(nestly, ["dev", `--port=${devPort}`], {
    cwd: appDir,
    detached: true,
    stdio: ["ignore", "ignore", "inherit"],
  });

  const devPage = await waitForServer(`http://127.0.0.1:${devPort}/`, 60);
  const devHtml = await devPage.text();
  if (!devHtml.includes("Installed App")) {
    throw new Error("dev server did not render its page");
  }
  if (!devHtml.includes("Client Counter")) {
    throw new Error("dev server did not render the client component");
  }

  console.log("installed dev smoke test ok");
  console.log("installed package smoke test ok");
} finally {
  stop(server);
  fs.rmSync(workDir, { recursive: true, force: true });
}
