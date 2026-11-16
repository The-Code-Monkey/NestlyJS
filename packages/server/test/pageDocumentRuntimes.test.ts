import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import path from "path";
import React from "react";
import { executeProdDecision } from "../src/prodServer";

let root: string;
const originalCwd = process.cwd();

beforeEach(() => {
  root = fs.mkdtempSync(path.join(__dirname, "tmp-document-"));
  process.chdir(root);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(root, { recursive: true, force: true });
});

function write(relative: string, contents: string) {
  const filePath = path.join(root, relative);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
  return filePath;
}

const pageSource = `import Button from "./button";
export default function Page() { return <main><Button label="go" /></main>; }`;

function writeApp() {
  write(
    "routes/layout.tsx",
    `export default function Layout({ children }: any) {
  return <html><head><title>shared</title></head><body>{children}</body></html>;
}`
  );
  write(
    "routes/button.tsx",
    `"use client";
export default function Button({ label }: { label: string }) {
  return <button>{label}</button>;
}`
  );
  return write("routes/page.tsx", pageSource);
}

function prodFixture() {
  const Button = (props: { label: string }) =>
    React.createElement("button", null, props.label);
  (Button as any).__clientId = "routes/button.tsx";

  const Page = () =>
    React.createElement("main", null, React.createElement(Button, { label: "go" }));
  const Layout = ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      "html",
      null,
      React.createElement("head", null, React.createElement("title", null, "shared")),
      React.createElement("body", null, children)
    );

  return { page: Page, layouts: [Layout] };
}

describe("Page Document runtimes", () => {
  it("renders the same page skeleton in development and production", async () => {
    const pageFile = writeApp();

    vi.resetModules();
    const devChild = await import("../src/devChildWorker");
    const devHtml = await devChild.renderPage(pageFile, "/");

    const res = { writeHead: vi.fn(), end: vi.fn() };
    await executeProdDecision(
      { url: "/", method: "GET" } as any,
      res as any,
      {
        kind: "page",
        url: "/",
        path: "/",
        segments: [],
        method: "GET",
        route: { pattern: [], page: { entry: "page.js" } },
        params: {},
      },
      root,
      prodFixture as any
    );
    const productionHtml = res.end.mock.calls[0][0];

    for (const html of [devHtml, productionHtml]) {
      expect(html).toContain("<main>");
      expect(html).toContain("<button>go</button>");
      expect(html.match(/id="hydrate-/g)).toHaveLength(1);
      expect(html).toContain("hydrate-routes-button.tsx-0");
    }

    expect(devHtml).toContain("_nestly/hmr");
    expect(productionHtml).not.toContain("_nestly/hmr");
  });
});
