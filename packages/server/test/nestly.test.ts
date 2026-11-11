import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import { run, defaultLoad } from "../src/bin/nestly";

describe("nestly cli", () => {
  let exit: any;
  let error: any;
  let log: any;
  let originalPort: string | undefined;

  beforeEach(() => {
    originalPort = process.env.PORT;
    delete process.env.PORT;
    exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as any);
    error = vi.spyOn(console, "error").mockImplementation(() => {});
    log = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalPort === undefined) delete process.env.PORT;
    else process.env.PORT = originalPort;
    vi.restoreAllMocks();
  });

  it("starts the dev server with the default port", () => {
    const start = vi.fn();
    const load = vi.fn(() => ({ start }));

    run(["dev"], load);

    expect(load).toHaveBeenCalledWith(
      path.resolve(__dirname, "../src/devServer")
    );
    expect(start).toHaveBeenCalledWith({ port: 3000, host: undefined });
  });

  it("uses the PORT environment variable", () => {
    const start = vi.fn();
    process.env.PORT = "5000";

    run(["dev"], () => ({ start }));

    expect(start).toHaveBeenCalledWith({ port: 5000, host: undefined });
  });

  it("parses --host", () => {
    const start = vi.fn();
    run(["dev", "--host=0.0.0.0"], () => ({ start }));
    expect(start).toHaveBeenCalledWith({
      port: 3000,
      host: "0.0.0.0",
    });
  });

  it("uses the HOST environment variable", () => {
    const start = vi.fn();
    const original = process.env.HOST;
    process.env.HOST = "127.0.0.1";

    run(["dev"], () => ({ start }));

    expect(start).toHaveBeenCalledWith({
      port: 3000,
      host: "127.0.0.1",
    });

    if (original === undefined) delete process.env.HOST;
    else process.env.HOST = original;
  });

  it("prefers --port over PORT", () => {
    const start = vi.fn();
    process.env.PORT = "5000";

    run(["dev", "--port=6000"], () => ({ start }));

    expect(start).toHaveBeenCalledWith({ port: 6000, host: undefined });
  });

  it("falls back to 3000 for an invalid PORT", () => {
    const start = vi.fn();
    process.env.PORT = "nope";

    run(["dev"], () => ({ start }));

    expect(start).toHaveBeenCalledWith({ port: 3000, host: undefined });
  });

  it("parses --port", () => {
    const start = vi.fn();
    run(["dev", "--port=4444"], () => ({ start }));
    expect(start).toHaveBeenCalledWith({ port: 4444, host: undefined });
  });

  it("ignores malformed flags", () => {
    const start = vi.fn();
    run(["dev", "--port"], () => ({ start }));
    expect(start).toHaveBeenCalledWith({ port: 3000, host: undefined });
  });

  it("starts the production server", () => {
    const start = vi.fn();
    const load = vi.fn(() => ({ start }));

    run(["start", "--port=7000"], load);

    expect(load).toHaveBeenCalledWith(
      path.resolve(__dirname, "../src/prodServer")
    );
    expect(start).toHaveBeenCalledWith({ port: 7000, host: undefined });
  });

  it("starts the production server on the default port", () => {
    const start = vi.fn();
    run(["start"], () => ({ start }));
    expect(start).toHaveBeenCalledWith({ port: 3000, host: undefined });
  });

  it("builds the app", async () => {
    const buildApp = vi.fn(async () => {});
    const load = vi.fn(() => ({ buildApp }));

    run(["build"], load);

    expect(load).toHaveBeenCalledWith(path.resolve(__dirname, "../src/build"));
    await vi.waitFor(() => expect(buildApp).toHaveBeenCalled());
  });

  it("exits when the build fails", async () => {
    const buildApp = vi.fn(async () => {
      throw new Error("boom");
    });

    run(["build"], () => ({ buildApp }));

    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
    expect(error).toHaveBeenCalled();
  });

  it("prints usage for unknown commands", () => {
    run(["wat"], vi.fn());
    expect(log).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("loads modules through the default loader", () => {
    expect(defaultLoad(require.resolve("path"))).toBeDefined();
  });
});
