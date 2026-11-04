import { describe, it, expect } from "vitest";
import { matchManifestRoute } from "../src/prodRouter";
import type { Manifest } from "../src/manifest";

const manifest: Manifest = {
  routes: [
    { pattern: [], page: { entry: "root.js", script: "/root.js" } },
    {
      pattern: [{ kind: "static", value: "blog" }],
      page: { entry: "blog.js", script: "/blog.js" },
    },
    {
      pattern: [
        { kind: "static", value: "blog" },
        { kind: "dynamic", name: "slug" },
      ],
      page: { entry: "dynamic.js", script: "/dynamic.js" },
    },
    {
      pattern: [
        { kind: "static", value: "blog" },
        { kind: "catchAll", name: "rest" },
      ],
      page: { entry: "catchall.js", script: "/catchall.js" },
    },
    {
      pattern: [
        { kind: "static", value: "docs" },
        { kind: "optionalCatchAll", name: "slug" },
      ],
      page: { entry: "optional.js", script: "/optional.js" },
    },
  ],
};

describe("matchManifestRoute", () => {
  it("matches the root route", () => {
    expect(matchManifestRoute(manifest, "/")?.route.page?.entry).toBe(
      "root.js"
    );
  });

  it("matches static routes", () => {
    expect(matchManifestRoute(manifest, "/blog")?.route.page?.entry).toBe(
      "blog.js"
    );
  });

  it("extracts dynamic params", () => {
    const matched = matchManifestRoute(manifest, "/blog/hello");
    expect(matched?.route.page?.entry).toBe("dynamic.js");
    expect(matched?.params).toEqual({ slug: "hello" });
  });

  it("collects catch-all params", () => {
    const matched = matchManifestRoute(manifest, "/blog/a/b");
    expect(matched?.route.page?.entry).toBe("catchall.js");
    expect(matched?.params).toEqual({ rest: ["a", "b"] });
  });

  it("matches optional catch-all with zero segments", () => {
    const matched = matchManifestRoute(manifest, "/docs");
    expect(matched?.route.page?.entry).toBe("optional.js");
    expect(matched?.params).toHaveProperty("slug", undefined);
  });

  it("matches optional catch-all with nested segments", () => {
    const matched = matchManifestRoute(manifest, "/docs/a/b");
    expect(matched?.params).toEqual({ slug: ["a", "b"] });
  });

  it("decodes params and ignores query strings", () => {
    expect(
      matchManifestRoute(manifest, "/blog/hello%20world?x=1")?.params
    ).toEqual({ slug: "hello world" });
  });

  it("returns null when nothing matches", () => {
    expect(matchManifestRoute(manifest, "/missing")).toBeNull();
    expect(matchManifestRoute(manifest, "/docs/").route.page?.entry).toBe(
      "optional.js"
    );
  });

  it("rejects malformed and traversal paths", () => {
    expect(matchManifestRoute(manifest, "/%E0%A4%A")).toBeNull();
    expect(matchManifestRoute(manifest, "/%2e%2e/blog")).toBeNull();
  });
});
