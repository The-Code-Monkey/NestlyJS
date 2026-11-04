import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { buildApp } from "../src/build";

let root: string;
const originalCwd = process.cwd();

beforeEach(() => {
  root = fs.mkdtempSync(path.join(__dirname, "tmp-build-"));
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

function writeFullApp() {
  write("routes/global.css", "body { color: black; }");
  write("routes/button.css", "button { color: red; }");
  write(
    "routes/layout.tsx",
    `import React from "react";
import "./global.css";
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html><head><title>app</title></head><body>{children}</body></html>;
}`
  );
  write(
    "routes/button.tsx",
    `"use client";
import React from "react";
import "./button.css";
export default function Button({ label }: { label: string }) {
  return <button>{label}</button>;
}`
  );
  write(
    "routes/page.tsx",
    `"use client";
import React from "react";
import Button from "./button";
export default function Page() {
  return <main><h1>home</h1><Button label="go" /></main>;
}`
  );
  write(
    "routes/api.ts",
    `export async function POST() { return { status: 200, body: { ok: true } }; }`
  );
  write(
    "routes/plain/page.tsx",
    `import React from "react";
export default function Plain() { return <h1>plain</h1>; }`
  );
  write(
    "routes/(marketing)/about/page.tsx",
    `import React from "react";
import Button from "../../button";
export default function About() {
  return <main><h1>about</h1><Button label="about" /></main>;
}`
  );
  write(
    "routes/blog/[slug]/layout.tsx",
    `import React from "react";
export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <article>{children}</article>;
}`
  );
  write(
    "routes/blog/[slug]/page.tsx",
    `import React from "react";
export default function Post({ params }: { params: { slug: string } }) {
  return <h1>{params.slug}</h1>;
}`
  );
  write(
    "routes/files/[...path]/api.ts",
    `export async function POST(req: any) { return { status: 200, body: req.params }; }`
  );
  write(
    "routes/docs/[[...slug]]/page.tsx",
    `import React from "react";
export default function Docs({ params }: { params: { slug?: string[] } }) {
  return <h1>{params.slug?.join("/") ?? "home"}</h1>;
}`
  );
}

describe("buildApp", () => {
  it("builds server entries, client assets, and a manifest", async () => {
    writeFullApp();
    const manifest = await buildApp();

    expect(manifest.routes.length).toBeGreaterThanOrEqual(6);

    const rootRoute = manifest.routes.find(
      (route) => route.pattern.length === 0
    );
    expect(rootRoute?.page?.script).toMatch(
      /^\/_nestly\/client\/client-\d+-.+\.js$/
    );
    expect(rootRoute?.page?.style).toMatch(
      /^\/_nestly\/client\/style-\d+-.+\.css$/
    );
    expect(rootRoute?.api?.entry).toMatch(/^server\/api-\d+\.js$/);

    const about = manifest.routes.find(
      (route) =>
        route.pattern.length === 1 &&
        route.pattern[0].kind === "static" &&
        route.pattern[0].value === "about"
    );
    expect(about?.page?.script).toBeDefined();

    const dynamic = manifest.routes.find(
      (route) =>
        route.pattern.length === 2 && route.pattern[1].kind === "dynamic"
    );
    expect(dynamic?.pattern[1]).toEqual({ kind: "dynamic", name: "slug" });

    const catchAll = manifest.routes.find(
      (route) =>
        route.pattern.length === 2 && route.pattern[1].kind === "catchAll"
    );
    expect(catchAll?.api?.entry).toBeDefined();
    expect(catchAll?.page).toBeUndefined();

    const optional = manifest.routes.find(
      (route) =>
        route.pattern.length === 2 &&
        route.pattern[1].kind === "optionalCatchAll"
    );
    expect(optional?.page?.entry).toBeDefined();

    const plain = manifest.routes.find(
      (route) =>
        route.pattern.length === 1 &&
        route.pattern[0].kind === "static" &&
        route.pattern[0].value === "plain"
    );
    expect(plain?.page?.script).toBeUndefined();
    expect(plain?.page?.style).toBeDefined();

    const pageEntry = path.join(root, ".nestly", rootRoute!.page!.entry);
    const loaded = require(pageEntry);
    expect(typeof loaded.page).toBe("function");
    expect(loaded.layouts).toHaveLength(1);

    const clientFiles = fs.readdirSync(path.join(root, ".nestly", "client"));
    expect(clientFiles.some((file) => file.startsWith("client-"))).toBe(true);
    expect(clientFiles.some((file) => file.startsWith("common-"))).toBe(true);
    expect(clientFiles.some((file) => file.endsWith(".css"))).toBe(true);

    const cssFile = clientFiles.find((file) => file.endsWith(".css"))!;
    const css = fs.readFileSync(
      path.join(root, ".nestly", "client", cssFile),
      "utf8"
    );
    expect(css).toContain("color: red");
  });

  it("cleans the output directory before building", async () => {
    writeFullApp();
    await buildApp();
    write(".nestly/junk.txt", "junk");

    await buildApp();

    expect(fs.existsSync(path.join(root, ".nestly", "junk.txt"))).toBe(false);
  });

  it("builds pages without client assets or CSS", async () => {
    write(
      "routes/page.tsx",
      `import React from "react";
export default function Page() { return <h1>plain</h1>; }`
    );

    const manifest = await buildApp();
    const route = manifest.routes[0];

    expect(route.page?.script).toBeUndefined();
    expect(route.page?.style).toBeUndefined();
    expect(fs.existsSync(path.join(root, ".nestly", route.page!.entry))).toBe(
      true
    );
    expect(fs.readdirSync(path.join(root, ".nestly", "client"))).toEqual([]);
  });

  it("builds an empty app", async () => {
    const manifest = await buildApp();
    expect(manifest.routes).toEqual([]);
    expect(fs.existsSync(path.join(root, ".nestly", "server"))).toBe(true);
  });

  it("fails when a route cannot be bundled", async () => {
    write("routes/page.tsx", "export default {");
    await expect(buildApp()).rejects.toThrow();
  });
});
