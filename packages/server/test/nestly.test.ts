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
    expect(start).toHaveBeenCalledWith({ port: 3000 });
  });

  it("uses the PORT environment variable", () => {
    const start = vi.fn();
    process.env.PORT = "5000";

    run(["dev"], () => ({ start }));

    expect(start).toHaveBeenCalledWith({ port: 5000 });
  });

  it("prefers --port over PORT", () => {
    const start = vi.fn();
    process.env.PORT = "5000";

    run(["dev", "--port=6000"], () => ({ start }));

    expect(start).toHaveBeenCalledWith({ port: 6000 });
  });

  it("falls back to 3000 for an invalid PORT", () => {
    const start = vi.fn();
    process.env.PORT = "nope";

    run(["dev"], () => ({ start }));

    expect(start).toHaveBeenCalledWith({ port: 3000 });
  });

  it("parses --port", () => {
    const start = vi.fn();
    run(["dev", "--port=4444"], () => ({ start }));
    expect(start).toHaveBeenCalledWith({ port: 4444 });
  });

  it("ignores malformed flags", () => {
    const start = vi.fn();
    run(["dev", "--port"], () => ({ start }));
    expect(start).toHaveBeenCalledWith({ port: 3000 });
  });

  it("reports that start is not implemented", () => {
    run(["start"], vi.fn());
    expect(error).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
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
