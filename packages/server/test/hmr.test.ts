import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { EventEmitter } from "events";

const m = vi.hoisted(() => {
  const state: any = {
    watch: vi.fn(),
    onChange: null as any,
    buildScript: vi.fn(),
  };
  const watcher: any = {
    on: vi.fn((_event: string, cb: any) => {
      state.onChange = cb;
      return watcher;
    }),
  };
  state.watch.mockReturnValue(watcher);
  return state;
});

vi.mock("chokidar", () => ({ default: { watch: m.watch } }));
vi.mock("../src/devRefresh", () => ({
  buildClientScriptForUrl: m.buildScript,
}));

import {
  HMR_PATH,
  collectCssForUrl,
  handleChange,
  hmrClientScript,
  hmrHandler,
  startHmrWatcher,
} from "../src/hmr";

let root: string;
const originalCwd = process.cwd();
const responses: any[] = [];

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "nestly-hmr-"));
  process.chdir(root);
  vi.clearAllMocks();
  m.buildScript.mockResolvedValue("window.__updated = true;");
});

afterEach(() => {
  for (const res of responses) res.emit("close");
  responses.length = 0;
  process.chdir(originalCwd);
  fs.rmSync(root, { recursive: true, force: true });
  vi.useRealTimers();
});

function write(relative: string, contents = "") {
  const filePath = path.join(root, relative);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
  return filePath;
}

function connection(url = HMR_PATH) {
  const req: any = new EventEmitter();
  req.url = url;
  const res: any = new EventEmitter();
  res.writeHead = vi.fn();
  res.write = vi.fn();
  res.writableEnded = false;
  responses.push(res);
  return { req, res };
}

function messages(res: any) {
  return res.write.mock.calls
    .map((call: any[]) => call[0])
    .filter((value: string) => value.startsWith("data: "))
    .map((value: string) => JSON.parse(value.slice(6)));
}

describe("hmrHandler", () => {
  it("sends keepalive pings", () => {
    vi.useFakeTimers();
    const { req, res } = connection();
    hmrHandler(req, res);
    const ended = connection();
    hmrHandler(ended.req, ended.res);
    ended.res.writableEnded = true;

    vi.advanceTimersByTime(15000);

    expect(res.write).toHaveBeenCalledWith(": ping\n\n");
    expect(ended.res.write).not.toHaveBeenCalledWith(": ping\n\n");
  });

  it("opens an event stream and registers the page", () => {
    const { req, res } = connection(
      `${HMR_PATH}?path=${encodeURIComponent("/blog/post?x=1")}`
    );

    hmrHandler(req, res);

    expect(res.writeHead).toHaveBeenCalledWith(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    expect(res.write).toHaveBeenCalledWith("retry: 1000\n\n");
  });

  it("drops closed connections", () => {
    const { req, res } = connection();
    hmrHandler(req, res);
    res.emit("close");

    handleChange(path.join(root, "routes", "page.tsx"));

    expect(messages(res)).toEqual([]);
  });

  it("drops ended connections", () => {
    const { req, res } = connection();
    hmrHandler(req, res);
    res.writableEnded = true;

    handleChange(path.join(root, "routes", "page.tsx"));

    expect(messages(res)).toEqual([]);
  });
});

describe("collectCssForUrl", () => {
  it("collects page, layout, and client CSS", async () => {
    write("routes/shared.css", "body { color: black; }");
    write("routes/button.css", "button { color: red; }");
    write(
      "routes/layout.tsx",
      `import "./shared.css";\nexport default function Layout({ children }: any) { return children; }`
    );
    write(
      "routes/button.tsx",
      `"use client";\nimport "./button.css";\nexport default function Button() { return null; }`
    );
    write(
      "routes/page.tsx",
      `import Button from "./button";\nexport default function Page() { return Button; }`
    );

    const css = await collectCssForUrl("/");

    expect(css).toContain("color: black");
    expect(css).toContain("color: red");
  });

  it("returns an empty string when no page matches", async () => {
    expect(await collectCssForUrl("/missing")).toBe("");
  });

  it("skips missing CSS files", async () => {
    write(
      "routes/page.tsx",
      `import "./missing.css";\nexport default function Page() { return null; }`
    );
    expect(await collectCssForUrl("/")).toBe("");
  });
});

describe("handleChange", () => {
  it("broadcasts CSS for route stylesheet changes", async () => {
    write("routes/style.css", "body { color: red; }");
    write(
      "routes/page.tsx",
      `import "./style.css";\nexport default function Page() { return null; }`
    );
    const { req, res } = connection();
    hmrHandler(req, res);

    handleChange(path.join(root, "routes", "style.css"));
    await new Promise((resolve) => setImmediate(resolve));

    const events = messages(res);
    expect(events[0].type).toBe("css");
    expect(events[0].css).toContain("color: red");
  });

  it("reloads for route code changes", () => {
    const { req, res } = connection();
    hmrHandler(req, res);

    handleChange(path.join(root, "routes", "page.tsx"));

    expect(messages(res)[0]).toEqual({
      type: "reload",
      path: path.join(root, "routes", "page.tsx"),
    });
  });

  it("reloads for public asset changes", async () => {
    const { req, res } = connection();
    hmrHandler(req, res);

    await handleChange(path.join(root, "public", "style.css"));

    expect(messages(res)[0].type).toBe("reload");
  });

  it("refreshes client component changes", async () => {
    const { req, res } = connection();
    hmrHandler(req, res);

    await handleChange(path.join(root, "routes", "button.tsx"));

    expect(m.buildScript).toHaveBeenCalledWith("/");
    expect(messages(res)[0]).toEqual({
      type: "refresh",
      code: "window.__updated = true;",
    });
  });

  it("reloads when no client bundle exists", async () => {
    m.buildScript.mockResolvedValue("");
    const { req, res } = connection();
    hmrHandler(req, res);

    await handleChange(path.join(root, "routes", "button.tsx"));

    expect(messages(res)[0].type).toBe("reload");
  });

  it("reloads when rebuilding the client bundle fails", async () => {
    m.buildScript.mockRejectedValue(new Error("boom"));
    const { req, res } = connection();
    hmrHandler(req, res);

    await handleChange(path.join(root, "routes", "button.tsx"));

    expect(messages(res)[0].type).toBe("reload");
  });
});

describe("startHmrWatcher", () => {
  it("watches routes and public once", () => {
    startHmrWatcher();
    startHmrWatcher();

    expect(m.watch).toHaveBeenCalledWith(
      [
        path.join(root, "routes"),
        path.join(root, "public"),
      ],
      { ignoreInitial: true }
    );
    expect(m.watch).toHaveBeenCalledTimes(1);

    const { req, res } = connection();
    hmrHandler(req, res);
    m.onChange("all", path.join(root, "routes", "page.tsx"));
    m.onChange("all", undefined);

    expect(messages(res)[0].type).toBe("reload");
    expect(hmrClientScript).toContain(HMR_PATH);
    expect(hmrClientScript).toContain("performReactRefresh");
  });
});
