import { describe, it, expect } from "vitest";
import { injectBody, injectHead } from "../src/renderer";

describe("renderer injection", () => {
  it("ignores empty injected markup", () => {
    expect(injectHead("<html></html>", "")).toBe("<html></html>");
    expect(injectBody("<html></html>", "")).toBe("<html></html>");
  });

  it("injects before closing head and body tags", () => {
    expect(injectHead("<html><head></head></html>", "<meta>")).toBe(
      "<html><head><meta></head></html>"
    );
    expect(injectBody("<html><body></body></html>", "<script>")).toBe(
      "<html><body><script></body></html>"
    );
  });

  it("falls back when the tags are missing", () => {
    expect(injectHead("<p>page</p>", "<meta>")).toBe("<meta><p>page</p>");
    expect(injectBody("<p>page</p>", "<script>")).toBe("<p>page</p><script>");
  });
});
