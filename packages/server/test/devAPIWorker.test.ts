import { describe, it, expect, beforeEach, vi } from "vitest";

const m = vi.hoisted(() => {
  const state: any = {
    children: [] as any[],
    watchCb: null as any,
    exists: vi.fn(() => true),
    readBody: vi.fn(),
  };

  state.watch = vi.fn((_file: string, cb: any) => {
    state.watchCb = cb;
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

vi.mock("child_process", () => ({ fork: m.fork }));
vi.mock("fs", () => ({
  default: { existsSync: m.exists, watch: m.watch },
}));
vi.mock("../src/requestBody", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/requestBody")>();
  return { ...actual, readRequestBody: m.readBody };
});

import { devAPIHandler } from "../src/devAPIWorker";
import { RequestBodyError } from "../src/requestBody";

function response() {
  return { writeHead: vi.fn(), end: vi.fn() };
}

let counter = 0;
function request(url: string, method = "POST") {
  return {
    apiFile: "/tmp/api.ts",
    method,
    url,
    params: { slug: "hello" },
  };
}

function nextUrl() {
  return `/api-${counter++}`;
}

describe("devAPIHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.readBody.mockResolvedValue({ ok: true });
    m.children.length = 0;
    m.exists.mockReturnValue(true);
  });

  it("returns 500 when the API file is missing", async () => {
    m.exists.mockReturnValue(false);
    const url = nextUrl();
    const res = response();
    await devAPIHandler(
      { url, method: "POST" } as any,
      res as any,
      request(url)
    );
    expect(res.writeHead).toHaveBeenCalledWith(500);
    expect(res.end).toHaveBeenCalledWith("API file not found");
  });

  it("forks a child and returns the API response", async () => {
    const url = nextUrl();
    const res = response();
    await devAPIHandler(
      { url, method: "POST" } as any,
      res as any,
      request(url)
    );

    expect(m.fork).toHaveBeenCalledTimes(1);
    const child = m.children[0];
    expect(child.send).toHaveBeenCalledWith({
      file: "/tmp/api.ts",
      method: "POST",
      url,
      headers: undefined,
      body: { ok: true },
      params: { slug: "hello" },
    });

    child.handlers.message({
      type: "apiResponse",
      status: 201,
      body: { ok: true },
    });

    expect(res.writeHead).toHaveBeenCalledWith(201, {
      "Content-Type": "application/json",
    });
    expect(res.end).toHaveBeenCalledWith('{"ok":true}');
  });

  it("returns 404 when the child reports a missing API method", async () => {
    const url = nextUrl();
    const res = response();
    await devAPIHandler(
      { url, method: "POST" } as any,
      res as any,
      request(url)
    );

    m.children[0].handlers.message({ type: "apiNotFound" });

    expect(res.writeHead).toHaveBeenCalledWith(404);
    expect(res.end).toHaveBeenCalledWith("API route not found");
  });

  it("defaults the status to 200", async () => {
    const url = nextUrl();
    const res = response();
    await devAPIHandler(
      { url, method: "PUT" } as any,
      res as any,
      request(url, "PUT")
    );
    m.children[0].handlers.message({
      type: "apiResponse",
      status: 0,
      body: "ok",
    });
    expect(res.writeHead).toHaveBeenCalledWith(200, {
      "Content-Type": "application/json",
    });
  });

  it("ignores unrelated messages", async () => {
    const url = nextUrl();
    await devAPIHandler(
      { url, method: "POST" } as any,
      response() as any,
      request(url)
    );
    m.children[0].handlers.message({ type: "ready" });
    expect(m.children[0].send).toHaveBeenCalledTimes(1);
  });

  it("reuses an existing child for the same method and URL", async () => {
    const url = nextUrl();
    await devAPIHandler(
      { url, method: "POST" } as any,
      response() as any,
      request(url)
    );
    const child = m.children[0];
    child.handlers.message({
      type: "apiResponse",
      status: 200,
      body: "one",
    });

    await devAPIHandler(
      { url, method: "POST" } as any,
      response() as any,
      request(url)
    );

    expect(m.fork).toHaveBeenCalledTimes(1);
    expect(child.send).toHaveBeenCalledTimes(2);
  });

  it("returns a body parsing error", async () => {
    m.readBody.mockRejectedValue(
      new RequestBodyError(400, "Invalid JSON")
    );
    const url = nextUrl();
    const res = response();

    await devAPIHandler(
      { url, method: "POST" } as any,
      res as any,
      request(url)
    );

    expect(res.writeHead).toHaveBeenCalledWith(400, {
      "Content-Type": "application/json",
    });
    expect(res.end).toHaveBeenCalledWith('{"error":"Invalid JSON"}');
  });

  it("rethrows unexpected body errors", async () => {
    m.readBody.mockRejectedValue(new Error("boom"));
    const url = nextUrl();

    await expect(
      devAPIHandler(
        { url, method: "POST" } as any,
        response() as any,
        request(url)
      )
    ).rejects.toThrow("boom");
  });

  it("kills the child when the API file changes", async () => {
    const url = nextUrl();
    await devAPIHandler(
      { url, method: "POST" } as any,
      response() as any,
      request(url)
    );
    const child = m.children[0];

    m.watchCb("change");

    expect(child.kill).toHaveBeenCalled();
  });

  it("returns 500 when the child exits with pending requests", async () => {
    const url = nextUrl();
    const res = response();
    await devAPIHandler(
      { url, method: "POST" } as any,
      res as any,
      request(url)
    );

    m.children[0].handlers.exit(1, null);

    expect(res.writeHead).toHaveBeenCalledWith(500);
    expect(res.end).toHaveBeenCalledWith("API Worker crashed");
  });
});
