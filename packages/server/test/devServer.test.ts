import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const m = vi.hoisted(() => ({
  state: { isPrimary: true },
  fork: vi.fn(),
  on: vi.fn(),
  createServer: vi.fn(),
  listen: vi.fn((_port: number, _host?: string, cb?: () => void) => cb?.()),
  cpus: vi.fn(() => [{}, {}]),
  resolve: vi.fn(),
  exists: vi.fn(() => true),
  ssr: vi.fn(async () => {}),
  api: vi.fn(async () => {}),
  serveStatic: vi.fn(),
  serveClient: vi.fn(),
  hmrHandler: vi.fn(),
  startHmr: vi.fn(),
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
vi.mock("fs", () => ({ default: { existsSync: m.exists } }));
vi.mock("../src/devSSRWorker", () => ({ devSSRHandler: m.ssr }));
vi.mock("../src/devAPIWorker", () => ({ devAPIHandler: m.api }));
vi.mock("../src/routeResolver", () => ({ resolveRoute: m.resolve }));
vi.mock("../src/staticAssets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/staticAssets")>()),
  serveStaticAsset: m.serveStatic,
  serveClientAsset: m.serveClient,
}));
vi.mock("../src/hmr", () => ({
  HMR_PATH: "/_nestly/hmr",
  hmrHandler: m.hmrHandler,
  startHmrWatcher: m.startHmr,
}));

import { start } from "../src/devServer";

type Handler = (req: any, res: any) => Promise<void>;

function response() {
  return { writeHead: vi.fn(), end: vi.fn() };
}

const route = {
  routeDir: "/tmp",
  pageFile: "/tmp/page.tsx",
  apiFile: "/tmp/api.ts",
  params: { slug: "hello" },
};

describe("devServer", () => {
  let errorSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    m.state.isPrimary = true;
    m.resolve.mockReturnValue(null);
    m.exists.mockReturnValue(true);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("forks one worker per CPU core by default", () => {
    start({ port: 3000 });
    expect(m.fork).toHaveBeenCalledTimes(2);
    expect(m.on).toHaveBeenCalledWith("exit", expect.any(Function));
  });

  it("forks the requested number of workers", () => {
    start({ port: 3000, totalWorkers: 3 });
    expect(m.fork).toHaveBeenCalledTimes(3);
  });

  it("restarts a dead worker", () => {
    start({ port: 3000, totalWorkers: 1 });
    const onExit = m.on.mock.calls[0][1];
    onExit({ process: { pid: 123 } });
    expect(m.fork).toHaveBeenCalledTimes(2);
  });

  it("routes the HMR endpoint to the event stream", async () => {
    m.state.isPrimary = false;
    start({ port: 3000 });

    const handler: Handler = m.createServer.mock.calls[0][0];
    const req = { url: "/_nestly/hmr?path=%2F", method: "GET" };
    const res = response();
    await handler(req, res);

    expect(m.startHmr).toHaveBeenCalled();
    expect(m.hmrHandler).toHaveBeenCalledWith(req, res);
    expect(m.resolve).not.toHaveBeenCalled();
    expect(m.ssr).not.toHaveBeenCalled();
  });

  it("listens on the configured host", () => {
    m.state.isPrimary = false;
    start({ port: 3000, host: "127.0.0.1" });

    expect(m.listen).toHaveBeenCalledWith(
      3000,
      "127.0.0.1",
      expect.any(Function)
    );
  });

  it("serves a client asset without route lookup", async () => {
    m.state.isPrimary = false;
    start({ port: 3000 });

    const handler: Handler = m.createServer.mock.calls[0][0];
    const req = { url: "/_nestly/client/app.js", method: "GET" };
    const res = response();
    await handler(req, res);

    expect(m.serveClient).toHaveBeenCalledWith(req, res, "app.js");
    expect(m.resolve).not.toHaveBeenCalled();
  });

  it("serves a static asset decision", async () => {
    m.state.isPrimary = false;
    start({ port: 3000 });

    const handler: Handler = m.createServer.mock.calls[0][0];
    const req = { url: "/logo.png", method: "GET" };
    const res = response();
    await handler(req, res);

    expect(m.serveStatic).toHaveBeenCalledWith(req, res, "/logo.png");
    expect(m.ssr).not.toHaveBeenCalled();
  });

  it("sends a page decision to the SSR child", async () => {
    m.state.isPrimary = false;
    start({ port: 3000 });
    m.resolve.mockReturnValue(route);

    const handler: Handler = m.createServer.mock.calls[0][0];
    const req = { url: "/blog/hello?x=1", method: "GET" };
    const res = response();
    await handler(req, res);

    expect(m.ssr).toHaveBeenCalledWith(req, res, {
      pageFile: "/tmp/page.tsx",
      url: "/blog/hello?x=1",
      params: { slug: "hello" },
    });
  });

  it("sends an API decision to the API child with the original URL", async () => {
    m.state.isPrimary = false;
    start({ port: 3000 });
    m.resolve.mockReturnValue(route);
    m.exists.mockImplementation((file: string) => file.endsWith("api.ts"));

    const handler: Handler = m.createServer.mock.calls[0][0];
    const req = { url: "/hooks/1?x=1", method: "POST" };
    const res = response();
    await handler(req, res);

    expect(m.api).toHaveBeenCalledWith(req, res, {
      apiFile: "/tmp/api.ts",
      method: "POST",
      url: "/hooks/1?x=1",
      params: { slug: "hello" },
    });
  });

  it("returns 404 for a not-found GET decision", async () => {
    m.state.isPrimary = false;
    start({ port: 3000 });

    const handler: Handler = m.createServer.mock.calls[0][0];
    const res = response();
    await handler({ url: "/missing", method: "GET" }, res);

    expect(res.writeHead).toHaveBeenCalledWith(404);
    expect(res.end).toHaveBeenCalledWith("Page not found");
  });

  it("returns the API not-found message for non-GET", async () => {
    m.state.isPrimary = false;
    start({ port: 3000 });

    const handler: Handler = m.createServer.mock.calls[0][0];
    const res = response();
    await handler({ url: "/missing", method: "POST" }, res);

    expect(res.writeHead).toHaveBeenCalledWith(404);
    expect(res.end).toHaveBeenCalledWith("API route not found");
  });

  it("returns 500 when a handler throws", async () => {
    m.state.isPrimary = false;
    start({ port: 3000 });
    m.resolve.mockReturnValue(route);
    m.ssr.mockRejectedValueOnce(new Error("boom"));

    const handler: Handler = m.createServer.mock.calls[0][0];
    const res = response();
    await handler({ url: "/", method: "GET" }, res);

    expect(errorSpy).toHaveBeenCalled();
    expect(res.writeHead).toHaveBeenCalledWith(500);
    expect(res.end).toHaveBeenCalledWith("Internal server error");
  });
});
