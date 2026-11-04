import { describe, it, expect, beforeEach, vi } from "vitest";

const m = vi.hoisted(() => {
  const state: any = {
    children: [] as any[],
    watcherCb: null as any,
    getRouteFiles: vi.fn(() => ({
      pageFile: "/tmp/page.tsx",
      apiFile: "/tmp/api.ts",
    })),
    hasPage: vi.fn(),
  };

  state.watch = vi.fn(() => {
    const watcher: any = {
      on: vi.fn((event: string, cb: any) => {
        state.watcherCb = cb;
        return watcher;
      }),
    };
    return watcher;
  });

  state.fork = vi.fn(() => {
    const handlers: any = {};
    const child: any = {
      handlers,
      send: vi.fn(),
      kill: vi.fn(),
      on: vi.fn((event: string, cb: any) => {
        handlers[event] = cb;
      }),
    };
    state.children.push(child);
    return child;
  });

  return state;
});

vi.mock("chokidar", () => ({ default: { watch: m.watch } }));
vi.mock("child_process", () => ({ fork: m.fork }));
vi.mock("../src/routeResolver", () => ({
  getRouteFiles: m.getRouteFiles,
  hasPageForGET: m.hasPage,
}));

import { devSSRHandler } from "../src/devSSRWorker";

function response() {
  return { writeHead: vi.fn(), end: vi.fn() };
}

let counter = 0;
function nextUrl() {
  return `/page-${counter++}`;
}

describe("devSSRHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.children.length = 0;
    m.hasPage.mockReturnValue(true);
  });

  it("returns 404 for non-GET requests", async () => {
    const res = response();
    await devSSRHandler({ url: "/", method: "POST" } as any, res as any);
    expect(res.writeHead).toHaveBeenCalledWith(404);
    expect(res.end).toHaveBeenCalledWith("Page not found");
  });

  it("returns 404 when no page exists", async () => {
    m.hasPage.mockReturnValue(false);
    const res = response();
    await devSSRHandler({ url: "/", method: "GET" } as any, res as any);
    expect(res.writeHead).toHaveBeenCalledWith(404);
  });

  it("forks a child and responds with rendered HTML", async () => {
    const url = nextUrl();
    const res = response();
    await devSSRHandler({ url, method: "GET" } as any, res as any);

    expect(m.fork).toHaveBeenCalledTimes(1);
    const child = m.children[0];
    expect(child.send).toHaveBeenCalledWith({
      file: "/tmp/page.tsx",
      url,
    });

    child.handlers.message({ type: "render", url, html: "<h1>ok</h1>" });

    expect(res.writeHead).toHaveBeenCalledWith(200, {
      "Content-Type": "text/html",
    });
    expect(res.end).toHaveBeenCalledWith("<h1>ok</h1>");
  });

  it("reuses an existing child for the same URL", async () => {
    const url = nextUrl();
    await devSSRHandler(
      { url, method: "GET" } as any,
      response() as any
    );
    const child = m.children[0];
    child.handlers.message({ type: "render", url, html: "one" });

    const res = response();
    await devSSRHandler({ url, method: "GET" } as any, res as any);

    expect(m.fork).toHaveBeenCalledTimes(1);
    expect(child.send).toHaveBeenCalledTimes(2);
  });

  it("returns 500 when the child exits with pending requests", async () => {
    const url = nextUrl();
    const res = response();
    await devSSRHandler({ url, method: "GET" } as any, res as any);

    m.children[0].handlers.exit(1, null);

    expect(res.writeHead).toHaveBeenCalledWith(500);
    expect(res.end).toHaveBeenCalledWith("SSR Worker crashed");
  });

  it("kills all page children when a route file changes", async () => {
    await devSSRHandler(
      { url: nextUrl(), method: "GET" } as any,
      response() as any
    );
    const child = m.children[0];

    m.watcherCb();

    expect(child.kill).toHaveBeenCalled();
  });
});
