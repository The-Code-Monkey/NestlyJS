import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

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
    expect(html).toContain("body { color: black; }");
    expect(html).toContain("color: red");
    expect(html.match(/<script type="module">/g)).toHaveLength(1);
    expect(html.match(/data-client-component/g)).toHaveLength(2);

    await expect(mod.renderPage(pageFile, "/")).resolves.toBe(html);
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
    expect(html.indexOf("<style>")).toBe(0);
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
    expect(html).not.toContain("<style>");
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

  it("serializes props safely", async () => {
    const mod = await load();
    expect(mod.serializeProps(null)).toBe("{}");
    expect(mod.serializeProps({ html: "</script>" })).toContain("\\u003c");
  });

  it("detects client component directives", async () => {
    const client = write("client.tsx", '"use client";\nexport default 1;');
    const server = write("server.tsx", "export default 1;");
    const mod = await load();

    expect(mod.isClientComponent(client)).toBe(true);
    expect(mod.isClientComponent(server)).toBe(false);
    expect(mod.isClientComponent(path.join(root, "missing.tsx"))).toBe(false);
  });

  it("collects imports and CSS", async () => {
    write("styles.css", "a { color: red; }");
    write("nested.ts", "export default 1;");
    const entry = write(
      "entry.tsx",
      `import "./styles.css";
import "./nested";
import "react";
import "./missing";`
    );
    const client = write("client.tsx", '"use client";\nimport "./styles.css";');
    const mod = await load();

    expect(mod.getImports(entry)).toEqual([
      path.join(root, "styles.css"),
      path.join(root, "nested.ts"),
    ]);
    expect(mod.getImports(path.join(root, "missing.tsx"))).toEqual([]);
    expect(mod.collectCss(entry)).toEqual([path.join(root, "styles.css")]);
    expect(mod.collectCss(client)).toEqual([]);
    expect(mod.collectCss("")).toEqual([]);
    const seen = new Set([entry]);
    expect(mod.collectCss(entry, seen)).toEqual([]);
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

  it("attaches file paths to functions and objects", async () => {
    const mod = await load();

    expect(mod.attachFilePaths(null, "/x")).toBeNull();
    const fn: any = () => null;
    expect(mod.attachFilePaths(fn, "/fn")).toBe(fn);
    expect(fn.__filePath).toBe("/fn");

    const tagged: any = () => null;
    tagged.__filePath = "/kept";
    const obj = { a: tagged, b: () => null, c: 1 };
    mod.attachFilePaths(obj, "/obj");
    expect(tagged.__filePath).toBe("/kept");
    expect(obj.b.__filePath).toBe("/obj");
  });

  it("finds no layouts when the path has no routes segment", async () => {
    const mod = await load();
    await expect(mod.findLayoutComponents("/foo/bar")).resolves.toEqual([]);
  });

  it("wraps arrays, primitives, and host elements", async () => {
    const mod = await load();

    expect(await mod.renderAndWrap(null)).toBeNull();
    expect(await mod.renderAndWrap("text")).toBe("text");
    expect(
      renderToStaticMarkup(await mod.renderAndWrap(React.createElement("br")))
    ).toBe("<br/>");

    const unkeyed = await mod.renderAndWrap([
      React.createElement("div", null, "a"),
      React.createElement("div", null, "b"),
    ]);
    expect(unkeyed.map((el: any) => el.key)).toEqual(["0", "1"]);

    const keyed = await mod.renderAndWrap([
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

    const wrapped = await mod.renderAndWrap(
      React.createElement(component, {})
    );

    expect(wrapped.props["data-client-component"]).toBe("client.tsx-0");
  });

  it("renders sync and async server components", async () => {
    const mod = await load();
    function Sync() {
      return React.createElement("b", null, "sync");
    }
    async function Async() {
      return React.createElement("i", null, "async");
    }

    const sync = await mod.renderAndWrap(React.createElement(Sync));
    const asyncEl = await mod.renderAndWrap(React.createElement(Async));

    expect(renderToStaticMarkup(sync)).toBe("<b>sync</b>");
    expect(renderToStaticMarkup(asyncEl)).toBe("<i>async</i>");
  });
});
