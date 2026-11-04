import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { bundlePageClient } from "../src/bundler";

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
    await expect(bundlePageClient([])).resolves.toEqual({ js: "", css: "" });
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
      { filePath, instanceKey: "button-0" },
    ]);

    expect(bundle.js).toContain("button-0");
    expect(bundle.js).toContain("window.__components");
    expect(bundle.css).toBe("");
  });

  it("collects CSS imports from client components", async () => {
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
      { filePath, instanceKey: "styled-0" },
    ]);

    expect(bundle.css).toContain("color: red");
    expect(bundle.js).toContain("styled-0");
  });
});
