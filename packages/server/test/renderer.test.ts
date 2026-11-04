import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  collectClientComponents,
  injectBody,
  injectHead,
  isClientComponent,
} from "../src/renderer";

let root: string;
const originalCwd = process.cwd();

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "nestly-renderer-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  process.chdir(originalCwd);
});

function write(name: string, contents: string) {
  const file = path.join(root, name);
  fs.writeFileSync(file, contents);
  return file;
}

describe("renderer helpers", () => {
  it("returns no client components for an invalid path", () => {
    expect(collectClientComponents("").size).toBe(0);
    expect(
      collectClientComponents(path.join(root, "missing.tsx")).size
    ).toBe(0);
  });

  it("treats an empty file as a server component", () => {
    const file = write("empty.tsx", "");
    expect(isClientComponent(file)).toBe(false);
  });

  it("collects nested client components", () => {
    write(
      "button.tsx",
      '"use client";\nexport default function Button() { return null; }'
    );
    const entry = write(
      "page.tsx",
      'import Button from "./button";\nexport default Button;'
    );

    const found = collectClientComponents(entry);
    expect(found.has(path.join(root, "button.tsx"))).toBe(true);
  });

  it("ignores empty injected markup", () => {
    expect(injectHead("<html></html>", "")).toBe("<html></html>");
    expect(injectBody("<html></html>", "")).toBe("<html></html>");
  });
});
