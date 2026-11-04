import { describe, it, expect, beforeEach } from "vitest";

describe("shim", () => {
  beforeEach(() => {
    (globalThis as any).window = {};
    delete (require.cache as any)[require.resolve("../src/shim")];
  });

  it("exposes React and ReactDOMClient on window", async () => {
    await import("../src/shim");
    expect((globalThis as any).window.React).toBeDefined();
    expect((globalThis as any).window.ReactDOMClient).toBeDefined();
  });
});
