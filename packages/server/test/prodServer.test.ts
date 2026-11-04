import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import React from "react";

const m = vi.hoisted(() => ({
  state: { isPrimary: true },
  fork: vi.fn(),
  on: vi.fn(),
  createServer: vi.fn(),
  listen: vi.fn((_port: number, cb?: () => void) => cb?.()),
  cpus: vi.fn(() => [{}, {}]),
  isStatic: vi.fn(),
  serveStatic: vi.fn(),
  serveClient: vi.fn(),
}));

vi.mock("cluster", () => ({
  default: {
    get isPrimary() {
      return m.state.isPrimary;
    },
    fork: m.fork,
    on: m.on,
  },
}));

vi.mock("http", () => ({
  default: {
    createServer: (handler: any) => {
      m.createServer(handler);
      return { listen: m.listen };
    },
  },
}));

vi.mock("os", () => ({ default: { cpus: m.cpus } }));
vi.mock("../src/staticAssets", () => ({
  isStaticAssetPath: m.isStatic,
  serveStaticAsset: m.serveStatic,
  serveClientAsset: m.serveClient,
}));

import {
  createModuleLoader,
  handleRequest,
  loadManifest,
  start,
} from "../src/prodServer";
import type { Manifest } from "../src/manifest";

let root: string;
const originalCwd = process.cwd();

beforeEach(() => {
  root = fs.mkdtempSync(path.join(originalCwd, "packages/server/test", "tmp-prod-"));
  process.chdir(root);
  vi.clearAllMocks();
  m.state.isPrimary = true;
  m.isStatic.mockReturnValue(false);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function response() {
  return {
    writeHead: vi.fn(),
    end: vi.fn(),
  };
}

function manifestWith(overrides: Partial<Manifest> = {}): Manifest {
  return { routes: [], ...overrides };
}

describe("loadManifest", () => {
  it("reads a manifest", () => {
    const file = path.join(root, "manifest.json");
    fs.writeFileSync(file, JSON.stringify({ routes: [] }));
    expect(loadManifest(file)).toEqual({ routes: [] });
  });

  it("throws when the manifest is missing", () => {
    expect(() => loadManifest(path.join(root, "missing.json"))).toThrow();
  });
});

describe("createModuleLoader", () => {
  it("loads each module once", () => {
    const file = path.join(root, "module.js");
    fs.writeFileSync(file, "module.exports = { value: 1 };");
    const load = createModuleLoader();

    const first = load(file);
    const second = load(file);

    expect(first.value).toBe(1);
    expect(second).toBe(first);
  });
});

describe("handleRequest", () => {
  const client = () => React.createElement("button", null, "click");
  (client as any).__clientId = "routes/client.tsx";

  it("serves built client assets", async () => {
    const res = response();
    await handleRequest(
      { url: "/_nestly/client/a.js", method: "GET" } as any,
      res as any,
      manifestWith(),
      root,
      vi.fn()
    );

    expect(m.serveClient).toHaveBeenCalledWith(expect.anything(), res, "a.js");
  });

  it("serves public static assets", async () => {
    m.isStatic.mockReturnValue(true);
    const req = { url: "/logo.png", method: "GET" };
    const res = response();
    await handleRequest(
      req as any,
      res as any,
      manifestWith(),
      root,
      vi.fn()
    );

    expect(m.serveStatic).toHaveBeenCalledWith(req, res, "/logo.png");
  });

  it("renders a page with client assets", async () => {
    const page = () => React.createElement("main", null, React.createElement(client));
    const res = response();
    const manifest = manifestWith({
      routes: [
        {
          pattern: [],
          page: {
            entry: "page.js",
            script: "/_nestly/client/page.js",
            style: "/_nestly/client/page.css",
          },
        },
      ],
    });

    await handleRequest(
      { url: "/", method: "GET" } as any,
      res as any,
      manifest,
      root,
      () => ({ page, layouts: [] })
    );

    expect(res.writeHead).toHaveBeenCalledWith(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    const html = res.end.mock.calls[0][0];
    expect(html).toContain("<main>");
    expect(html).toContain('<link rel="stylesheet" href="/_nestly/client/page.css">');
    expect(html).toContain('<script type="module" src="/_nestly/client/page.js">');
    expect(html).toContain("hydrate-");
  });

  it("renders a page without client assets", async () => {
    const page = () => React.createElement("h1", null, "plain");
    const res = response();
    const manifest = manifestWith({
      routes: [{ pattern: [], page: { entry: "page.js" } }],
    });

    await handleRequest(
      { url: "/", method: "GET" } as any,
      res as any,
      manifest,
      root,
      () => ({ page, layouts: [] })
    );

    const html = res.end.mock.calls[0][0];
    expect(html).toContain("plain");
    expect(html).not.toContain("<link");
    expect(html).not.toContain('type="module"');
  });

  it("returns 404 for an unknown page", async () => {
    const res = response();
    await handleRequest(
      { url: "/missing", method: "GET" } as any,
      res as any,
      manifestWith(),
      root,
      vi.fn()
    );

    expect(res.writeHead).toHaveBeenCalledWith(404);
    expect(res.end).toHaveBeenCalledWith("Page not found");
  });

  it("returns 404 for an unknown API route", async () => {
    const res = response();
    await handleRequest(
      { url: "/missing", method: "POST" } as any,
      res as any,
      manifestWith(),
      root,
      vi.fn()
    );

    expect(res.writeHead).toHaveBeenCalledWith(404);
    expect(res.end).toHaveBeenCalledWith("API route not found");
  });

  it("runs an API handler", async () => {
    const res = response();
    const manifest = manifestWith({
      routes: [{ pattern: [], api: { entry: "api.js" } }],
    });

    await handleRequest(
      { url: "/", method: "POST" } as any,
      res as any,
      manifest,
      root,
      () => ({
        POST: async () => ({ status: 201, body: { ok: true } }),
      })
    );

    expect(res.writeHead).toHaveBeenCalledWith(201, {
      "Content-Type": "application/json",
    });
    expect(res.end).toHaveBeenCalledWith('{"ok":true}');
  });

  it("defaults the API status to 200", async () => {
    const res = response();
    const manifest = manifestWith({
      routes: [{ pattern: [], api: { entry: "api.js" } }],
    });

    await handleRequest(
      { url: "/", method: "POST" } as any,
      res as any,
      manifest,
      root,
      () => ({
        POST: async () => ({ status: 0, body: "ok" }),
      })
    );

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
  });

  it("returns 404 when the API method is missing", async () => {
    const res = response();
    const manifest = manifestWith({
      routes: [{ pattern: [], api: { entry: "api.js" } }],
    });

    await handleRequest(
      { url: "/", method: "POST" } as any,
      res as any,
      manifest,
      root,
      () => ({})
    );

    expect(res.writeHead).toHaveBeenCalledWith(404);
  });

  it("returns 500 when an API handler returns nothing", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = response();
    const manifest = manifestWith({
      routes: [{ pattern: [], api: { entry: "api.js" } }],
    });

    await handleRequest(
      { url: "/", method: "POST" } as any,
      res as any,
      manifest,
      root,
      () => ({ POST: async () => undefined })
    );

    expect(errorSpy).toHaveBeenCalled();
    expect(res.writeHead).toHaveBeenCalledWith(500);
  });

  it("returns 500 when rendering throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = response();
    const manifest = manifestWith({
      routes: [{ pattern: [], page: { entry: "page.js" } }],
    });

    await handleRequest(
      { url: "/", method: "GET" } as any,
      res as any,
      manifest,
      root,
      () => ({
        page: () => {
          throw new Error("boom");
        },
        layouts: [],
      })
    );

    expect(res.writeHead).toHaveBeenCalledWith(500);
    expect(res.end).toHaveBeenCalledWith("Internal server error");
  });
});

describe("start", () => {
  beforeEach(() => {
    fs.mkdirSync(path.join(root, ".nestly"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".nestly", "manifest.json"),
      JSON.stringify({ routes: [] })
    );
  });

  it("forks workers from the primary process", () => {
    start({ port: 3000, totalWorkers: 2 });

    expect(m.fork).toHaveBeenCalledTimes(2);
    expect(m.on).toHaveBeenCalledWith("exit", expect.any(Function));

    const onExit = m.on.mock.calls[0][1];
    onExit({ process: { pid: 1 } });
    expect(m.fork).toHaveBeenCalledTimes(3);
  });

  it("exits when no build output exists", () => {
    m.state.isPrimary = false;
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as any);
    vi.spyOn(console, "error").mockImplementation(() => {});
    fs.rmSync(path.join(root, ".nestly"), { recursive: true, force: true });

    start({ port: 4100 });

    expect(exit).toHaveBeenCalledWith(1);
  });

  it("creates a worker server", async () => {
    m.state.isPrimary = false;
    vi.spyOn(console, "log").mockImplementation(() => {});

    start({ port: 4100 });

    expect(m.createServer).toHaveBeenCalledWith(expect.any(Function));
    expect(m.listen).toHaveBeenCalledWith(4100, expect.any(Function));

    const handler = m.createServer.mock.calls[0][0];
    const res = response();
    handler({ url: "/missing", method: "GET" }, res);
    await new Promise((resolve) => setImmediate(resolve));

    expect(res.writeHead).toHaveBeenCalledWith(404);
  });
});
