import { describe, it, expect } from "vitest";
import { HtmlCache } from "../src/htmlCache";

describe("HtmlCache", () => {
  it("stores and reads values", () => {
    const cache = new HtmlCache(2);
    cache.set("/", "home");
    expect(cache.get("/")).toBe("home");
    expect(cache.get("/missing")).toBeUndefined();
  });

  it("evicts the least recently used entry", () => {
    const cache = new HtmlCache(2);
    cache.set("/a", "a");
    cache.set("/b", "b");
    cache.get("/a");
    cache.set("/c", "c");

    expect(cache.get("/a")).toBe("a");
    expect(cache.get("/b")).toBeUndefined();
    expect(cache.get("/c")).toBe("c");
  });

  it("disables storage at zero size", () => {
    const cache = new HtmlCache(0);
    cache.set("/", "home");
    expect(cache.get("/")).toBeUndefined();
  });
});
