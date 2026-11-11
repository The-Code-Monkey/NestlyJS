import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  attachFilePaths,
  renderAndWrap,
  serializeProps,
} from "../src/renderer";

let root: string;
const originalCwd = process.cwd();

beforeEach(() => {
  root = fs.mkdtempSync(path.join(__dirname, "tmp-child-"));
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

async function load() {
  vi.resetModules();
  return import("../src/devChildWorker");
}

function writePageApp() {
  write("routes/global.css", "body { color: black; }");
  write("routes/button.css", "button { color: red; }");
  write(
    "routes/layout.tsx",
    `import React from "react";
import "./global.css";
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html><head><title>x</title></head><body>{children}</body></html>;
}`
  );
  write(
    "routes/button.tsx",
    `"use client";
import React, { useState } from "react";
import "./button.css";
export default function Button({ label }: { label: string }) {
  const [count] = useState(0);
  return <button>{label}{count}</button>;
}`
  );
  return write(
    "routes/page.tsx",
    `import React from "react";
import Button from "./button";
export default function Page() {
  return <div><h2>home</h2><Button label="a" /><Button label="b" /></div>;
}`
  );
}

describe("devChildWorker", () => {
  it("renders client components, CSS, and caches the page", async () => {
    const pageFile = writePageApp();
    const mod = await load();

    const html = await mod.renderPage(pageFile, "/");

    expect(html).toContain("home");
    expect(html).toContain("color: black");
    expect(html).toContain("color: red");
    expect(html.match(/<script type="module">/g)).toHaveLength(1);
    expect(html.match(/data-client-component/g)).toHaveLength(2);
    expect(html).toContain("data-nestly-style");
    expect(html).toContain("/_nestly/hmr");

    await expect(mod.renderPage(pageFile, "/")).resolves.toBe(html);
  });

  it("applies nested layouts from outermost to innermost", async () => {
    write(
      "routes/layout.tsx",
      `export default function Layout({ children }: any) {
  return <html><body><div id="outer">{children}</div></body></html>;
}`
    );
    write(
      "routes/nested/layout.tsx",
      `export default function Layout({ children }: any) {
  return <section id="inner">{children}</section>;
}`
    );
    const pageFile = write(
      "routes/nested/page.tsx",
      `export default function Page() { return <h2>deep</h2>; }`
    );
    const mod = await load();

    const html = await mod.renderPage(pageFile, "/nested");

    expect(html.indexOf('id="outer"')).toBeLessThan(
      html.indexOf('id="inner"')
    );
    expect(html.indexOf('id="inner"')).toBeLessThan(html.indexOf("deep"));
  });

  it("bundles conditional client components that do not render", async () => {
    write(
      "routes/conditional.tsx",
      `"use client";
export default function Conditional() { return <span>conditional</span>; }`
    );
    const pageFile = write(
      "routes/page.tsx",
      `import Conditional from "./conditional";
export default function Page() {
  const show = false;
  return <div><h2>home</h2>{show && <Conditional />}</div>;
}`
    );
    const mod = await load();

    const html = await mod.renderPage(pageFile, "/");

    expect(html).toContain("home");
    expect(html).not.toContain("conditional</span>");
    expect(html).not.toContain("data-client-component");
    expect(html).toContain("routes/conditional.tsx");
  });

  it("renders async server components and prepends CSS without a head", async () => {
    write("routes/async.css", "span { color: blue; }");
    write(
      "routes/layout.tsx",
      `import React from "react";
import "./async.css";
export default function Layout({ children }: { children: React.ReactNode }) {
  return <section>{children}</section>;
}`
    );
    write(
      "routes/asyncChild.tsx",
      `import React from "react";
export default async function Async() {
  return <span>async</span>;
}`
    );
    const pageFile = write(
      "routes/page.tsx",
      `import React from "react";
import Async from "./asyncChild";
export default async function Page() {
  return <div><h2>later</h2><Async /></div>;
}`
    );
    const mod = await load();

    const html = await mod.renderPage(pageFile, "/");

    expect(html).toContain("later");
    expect(html).toContain("async");
    expect(html.startsWith("<style data-nestly-style>")).toBe(true);
    expect(html).not.toContain("<script type=\"module\">");
  });

  it("renders a page without CSS or client components", async () => {
    write(
      "routes/layout.tsx",
      `import React from "react";
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html><body>{children}</body></html>;
}`
    );
    const pageFile = write(
      "routes/page.tsx",
      `import React from "react";
export default function Page() {
  return <h2>plain</h2>;
}`
    );
    const mod = await load();

    const html = await mod.renderPage(pageFile, "/");

    expect(html).toContain("plain");
    expect(html).not.toContain("<style");
  });

  it("passes route params to the page", async () => {
    const pageFile = write(
      "routes/[slug]/page.tsx",
      `import React from "react";
export default function Page({ params }: { params: { slug: string } }) {
  return <h2>slug:{params.slug}</h2>;
}`
    );
    const mod = await load();

    const html = await mod.renderPage(pageFile, "/hello", { slug: "hello" });

    expect(html).toContain("slug:hello");
  });

  it("passes catch-all params to the page", async () => {
    const pageFile = write(
      "routes/docs/[...slug]/page.tsx",
      `import React from "react";
export default function Page({ params }: { params: { slug: string[] } }) {
  return <h2>docs:{params.slug.join("/")}</h2>;
}`
    );
    const mod = await load();

    const html = await mod.renderPage(pageFile, "/docs/a/b", {
      slug: ["a", "b"],
    });

    expect(html).toContain("docs:a/b");
  });

  it("returns an error page when rendering throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    write(
      "routes/layout.tsx",
      `import React from "react";
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html><body>{children}</body></html>;
}`
    );
    const pageFile = write(
      "routes/page.tsx",
      `export default function Page() {
  throw new Error("boom");
}`
    );
    const mod = await load();

    await expect(mod.renderPage(pageFile, "/")).resolves.toBe(
      "<h1>Error rendering page</h1>"
    );
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("sends rendered HTML through handleMessage", async () => {
    const pageFile = writePageApp();
    const mod = await load();
    const send = vi.fn();

    await mod.handleMessage({ file: pageFile, url: "/" }, send);

    expect(send).toHaveBeenCalledWith({
      type: "render",
      html: expect.stringContaining("home"),
      url: "/",
    });
  });

  it("uses a no-op sender when process.send is unavailable", async () => {
    const pageFile = writePageApp();
    const mod = await load();
    const original = process.send;
    (process as any).send = undefined;

    await expect(
      mod.handleMessage({ file: pageFile, url: "/" })
    ).resolves.toBeUndefined();

    (process as any).send = original;
  });

  it("serializes props safely", () => {
    expect(serializeProps(null)).toBe("{}");
    expect(serializeProps({ html: "</script>" })).toContain("\\u003c");
  });

  it("preloads modules with file paths", async () => {
    const client = write(
      "client.tsx",
      '"use client";\nexport default function Client() { return null; }'
    );
    const mod = await load();

    expect(mod.preloadModule(path.join(root, "x.css"))).toBeNull();
    expect(mod.preloadModule(path.join(root, "missing.tsx"))).toBeNull();
    const loaded = mod.preloadModule(client);
    expect(loaded.default.__filePath).toBe(client);
    expect(mod.preloadModule(client)).toBe(loaded);
  });

  it("attaches file paths to functions and objects", () => {
    expect(attachFilePaths(null, "/x")).toBeNull();
    const fn: any = () => null;
    expect(attachFilePaths(fn, "/fn")).toBe(fn);
    expect(fn.__filePath).toBe("/fn");

    const tagged: any = () => null;
    tagged.__filePath = "/kept";
    const obj = { a: tagged, b: () => null, c: 1 };
    attachFilePaths(obj, "/obj");
    expect(tagged.__filePath).toBe("/kept");
    expect(obj.b.__filePath).toBe("/obj");
  });

  it("wraps arrays, primitives, and host elements", async () => {
    expect(await renderAndWrap(null)).toBeNull();
    expect(await renderAndWrap("text")).toBe("text");
    expect(
      renderToStaticMarkup(await renderAndWrap(React.createElement("br")))
    ).toBe("<br/>");

    const unkeyed = await renderAndWrap([
      React.createElement("div", null, "a"),
      React.createElement("div", null, "b"),
    ]);
    expect(unkeyed.map((el: any) => el.key)).toEqual(["0", "1"]);

    const keyed = await renderAndWrap([
      React.createElement("div", { key: "keep" }, "a"),
    ]);
    expect(keyed[0].key).toBe("keep");
  });

  it("wraps client components outside a routes directory", async () => {
    const client = write(
      "client.tsx",
      '"use client";\nexport default function Client() { return null; }'
    );
    const mod = await load();
    const component = mod.preloadModule(client).default;

    const wrapped = await renderAndWrap(React.createElement(component, {}));

    expect(wrapped.props["data-client-component"]).toBe("client.tsx-0");
  });

  it("renders sync and async server components", async () => {
    function Sync() {
      return React.createElement("b", null, "sync");
    }
    async function Async() {
      return React.createElement("i", null, "async");
    }

    const sync = await renderAndWrap(React.createElement(Sync));
    const asyncEl = await renderAndWrap(React.createElement(Async));

    expect(renderToStaticMarkup(sync)).toBe("<b>sync</b>");
    expect(renderToStaticMarkup(asyncEl)).toBe("<i>async</i>");
  });
});
