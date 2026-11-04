import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const m = vi.hoisted(() => ({
  state: { isPrimary: true },
  fork: vi.fn(),
  on: vi.fn(),
  createServer: vi.fn(),
  listen: vi.fn((port: number, cb?: () => void) => cb?.()),
  cpus: vi.fn(() => [{}, {}]),
  hasPage: vi.fn(),
  getAPI: vi.fn(),
  ssr: vi.fn(async () => {}),
  api: vi.fn(async () => {}),
  isStatic: vi.fn(),
  serve: vi.fn(),
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
vi.mock("../src/devSSRWorker", () => ({ devSSRHandler: m.ssr }));
vi.mock("../src/devAPIWorker", () => ({ devAPIHandler: m.api }));
vi.mock("../src/routeResolver", () => ({
  hasPageForGET: m.hasPage,
  getAPIMethod: m.getAPI,
}));
vi.mock("../src/staticAssets", () => ({
  isStaticAssetPath: m.isStatic,
  serveStaticAsset: m.serve,
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

describe("devServer", () => {
  let errorSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    m.state.isPrimary = true;
    m.isStatic.mockReturnValue(false);
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
    expect(m.ssr).not.toHaveBeenCalled();
  });

  it("serves static asset paths before routes", async () => {
    m.state.isPrimary = false;
    start({ port: 3000 });
    m.isStatic.mockReturnValue(true);

    const handler: Handler = m.createServer.mock.calls[0][0];
    const req = { url: "/logo.png", method: "GET" };
    const res = response();
    await handler(req, res);

    expect(m.serve).toHaveBeenCalledWith(req, res, "/logo.png");
    expect(m.ssr).not.toHaveBeenCalled();
    expect(m.hasPage).not.toHaveBeenCalled();
  });

  it("serves HEAD static asset paths", async () => {
    m.state.isPrimary = false;
    start({ port: 3000 });
    m.isStatic.mockReturnValue(true);

    const handler: Handler = m.createServer.mock.calls[0][0];
    const req = { url: "/logo.png", method: "HEAD" };
    const res = response();
    await handler(req, res);

    expect(m.serve).toHaveBeenCalledWith(req, res, "/logo.png");
  });

  it("routes a GET page request to the SSR handler", async () => {
    m.state.isPrimary = false;
    start({ port: 3000 });
    m.hasPage.mockReturnValue(true);

    const handler: Handler = m.createServer.mock.calls[0][0];
    const res = response();
    await handler({ url: "/", method: "GET" }, res);

    expect(m.ssr).toHaveBeenCalledWith({ url: "/", method: "GET" }, res);
    expect(m.listen).toHaveBeenCalledWith(3000, expect.any(Function));
  });

  it("routes an API request to the API handler", async () => {
    m.state.isPrimary = false;
    start({ port: 3000 });
    m.hasPage.mockReturnValue(false);
    m.getAPI.mockReturnValue(() => {});

    const handler: Handler = m.createServer.mock.calls[0][0];
    const res = response();
    await handler({ url: "/api", method: "POST" }, res);

    expect(m.api).toHaveBeenCalled();
  });

  it("returns 404 for a missing GET page", async () => {
    m.state.isPrimary = false;
    start({ port: 3000 });
    m.hasPage.mockReturnValue(false);
    m.getAPI.mockReturnValue(null);

    const handler: Handler = m.createServer.mock.calls[0][0];
    const res = response();
    await handler({ url: "/missing", method: "GET" }, res);

    expect(res.writeHead).toHaveBeenCalledWith(404);
    expect(res.end).toHaveBeenCalledWith(
      "Page not found or handled by API worker"
    );
  });

  it("returns 404 for a missing non-GET route", async () => {
    m.state.isPrimary = false;
    start({ port: 3000 });
    m.hasPage.mockReturnValue(false);
    m.getAPI.mockReturnValue(null);

    const handler: Handler = m.createServer.mock.calls[0][0];
    const res = response();
    await handler({ url: "/missing", method: "POST" }, res);

    expect(res.writeHead).toHaveBeenCalledWith(404);
    expect(res.end).toHaveBeenCalledWith("API route not found");
  });

  it("returns 500 when a handler throws", async () => {
    m.state.isPrimary = false;
    start({ port: 3000 });
    m.hasPage.mockReturnValue(true);
    m.ssr.mockRejectedValueOnce(new Error("boom"));

    const handler: Handler = m.createServer.mock.calls[0][0];
    const res = response();
    await handler({ url: "/", method: "GET" }, res);

    expect(errorSpy).toHaveBeenCalled();
    expect(res.writeHead).toHaveBeenCalledWith(500);
    expect(res.end).toHaveBeenCalledWith("Internal server error");
  });
});
