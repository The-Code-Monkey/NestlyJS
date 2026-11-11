import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { bundleCssFiles, bundlePageClient } from "../src/bundler";

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(__dirname, "tmp-bundle-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(name: string, contents: string) {
  const filePath = path.join(root, name);
  fs.writeFileSync(filePath, contents);
  return filePath;
}

describe("bundlePageClient", () => {
  it("returns empty output for no components", async () => {
    await expect(bundlePageClient([])).resolves.toEqual({
      js: "",
      runtime: "",
    });
  });

  it("bundles a client component", async () => {
    const filePath = write(
      "Button.tsx",
      `"use client";
import React from "react";
export default function Button() {
  return <button>hi</button>;
}`
    );

    const bundle = await bundlePageClient([
      { id: "button-0", filePath },
    ]);

    expect(bundle.js).toContain("button-0");
    expect(bundle.js).toContain("window.__components");
  });

  it("bundles client components that import CSS", async () => {
    write("button.css", "button { color: red; }");
    const filePath = write(
      "Styled.tsx",
      `"use client";
import React from "react";
import "./button.css";
export default function Styled() {
  return <button>styled</button>;
}`
    );

    const bundle = await bundlePageClient([
      { id: "styled-0", filePath },
    ]);

    expect(bundle.js).toContain("styled-0");
    expect(bundle.runtime).toContain("ReactJSXRuntime");
  });
});

describe("bundleCssFiles", () => {
  it("returns no stylesheet for no files", async () => {
    await expect(bundleCssFiles([])).resolves.toBe("");
  });

  it("bundles CSS in order and resolves imports", async () => {
    const first = write(
      "first.css",
      `@import "./nested.css";
.first { color: red; }`
    );
    write("nested.css", ".nested { color: blue; }");
    const second = write("second.css", ".second { color: green; }");

    const css = await bundleCssFiles([first, second]);

    expect(css).toContain("color: blue");
    expect(css).toContain("color: red");
    expect(css).toContain("color: green");
    expect(css.indexOf("red")).toBeLessThan(css.indexOf("green"));
  });
});
