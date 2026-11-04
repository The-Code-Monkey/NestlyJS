import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  buildClientScriptForUrl,
  bundleClientScript,
} from "../src/devRefresh";

let root: string;
const originalCwd = process.cwd();

beforeEach(() => {
  root = fs.mkdtempSync(
    path.join(originalCwd, "packages/server/test", "tmp-dev-refresh-")
  );
  process.chdir(root);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(root, { recursive: true, force: true });
});

function write(relative: string, contents = "") {
  const filePath = path.join(root, relative);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
  return filePath;
}

describe("buildClientScriptForUrl", () => {
  it("returns the page client script", async () => {
    write("routes/layout.tsx", `export default function Layout({ children }: any) { return children; }`);
    write(
      "routes/button.tsx",
      `"use client";
import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import Runtime from "react-refresh/runtime";
export default function Button() {
  return React.createElement("button", null, "hi");
}
void createRoot;
void flushSync;
void Runtime;`
    );
    write(
      "routes/page.tsx",
      `import Button from "./button";
export default function Page() { return Button; }`
    );

    const script = await buildClientScriptForUrl("/");

    expect(script).toContain("routes/button.tsx");
    expect(script).toContain("window.__components");
    expect(script).toContain("$RefreshReg$");
  });

  it("returns null when the page is missing", async () => {
    expect(await buildClientScriptForUrl("/missing")).toBeNull();
  });

  it("returns an empty script when the page has no client components", async () => {
    write("routes/page.tsx", `export default function Page() { return null; }`);
    expect(await buildClientScriptForUrl("/")).toBe("");
  });

  it("returns an empty script for no components", async () => {
    await expect(bundleClientScript([])).resolves.toEqual({ js: "", css: "" });
  });

  it("deduplicates components by id", async () => {
    const file = write(
      "button.tsx",
      `"use client";
import React from "react";
export default function Button() { return React.createElement("button"); }`
    );

    const result = await bundleClientScript([
      { id: "button", filePath: file },
      { id: "button", filePath: file },
    ]);

    expect(
      (result.js.match(/window\.__components\["button"\]/g) ?? []).length
    ).toBe(1);
  });
});
