import { describe, expect, it } from "vitest";
import {
  cleanUrlPath,
  isStaticAssetPath,
  parseRequestPath,
} from "../src/requestPath";

describe("cleanUrlPath", () => {
  it("strips query strings and fragments", () => {
    expect(cleanUrlPath("/blog?x=1")).toBe("/blog");
    expect(cleanUrlPath("/blog#top")).toBe("/blog");
    expect(cleanUrlPath("")).toBe("/");
  });
});

describe("parseRequestPath", () => {
  it("decodes segments once", () => {
    expect(parseRequestPath("/blog/hello%20world")?.segments).toEqual([
      "blog",
      "hello world",
    ]);
  });

  it("rejects malformed encodings, traversal, and separators", () => {
    for (const url of [
      "/%E0%A4%A",
      "/%2e%2e/secret",
      "/./secret",
      "/a%2Fb",
      "/a%5Cb",
    ]) {
      expect(parseRequestPath(url), url).toBeNull();
    }
  });

  it("classifies client assets separately from static assets", () => {
    expect(parseRequestPath("/_nestly/client/app.js")).toMatchObject({
      clientAssetSegments: ["app.js"],
      isStaticAsset: false,
    });
    expect(parseRequestPath("/logo.png")).toMatchObject({
      isStaticAsset: true,
    });
    expect(parseRequestPath("/blog/post")?.isStaticAsset).toBe(false);
  });

  it("exposes the static asset rule", () => {
    expect(isStaticAssetPath("/logo.png")).toBe(true);
    expect(isStaticAssetPath("/logo%2Epng")).toBe(true);
    expect(isStaticAssetPath("/blog")).toBe(false);
    expect(isStaticAssetPath("/%E0%A4%A")).toBe(false);
  });
});
