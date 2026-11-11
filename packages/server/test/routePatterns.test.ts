import { describe, it, expect } from "vitest";
import {
  bestMatch,
  matchPattern,
  parseUrlSegments,
  toPatternSegment,
  type PatternSegment,
} from "../src/routePatterns";

interface Candidate {
  dir: string;
  pattern: PatternSegment[];
}

function best(url: string, candidates: Candidate[]) {
  const segments = parseUrlSegments(url);
  return segments ? bestMatch(candidates, segments) : null;
}

function dynamic(name = "id"): PatternSegment {
  return { kind: "dynamic", name };
}

function catchAll(name = "rest"): PatternSegment {
  return { kind: "catchAll", name };
}

function optional(name = "slug"): PatternSegment {
  return { kind: "optionalCatchAll", name };
}

function staticSegment(value: string): PatternSegment {
  return { kind: "static", value };
}

describe("matchPattern", () => {
  it("matches static segments", () => {
    expect(matchPattern([staticSegment("blog")], ["blog"])?.params).toEqual({});
    expect(matchPattern([staticSegment("blog")], ["docs"])).toBeNull();
  });

  it("captures dynamic params as strings", () => {
    expect(matchPattern([dynamic("slug")], ["hello"])?.params).toEqual({
      slug: "hello",
    });
    expect(matchPattern([dynamic("slug")], [])).toBeNull();
  });

  it("captures catch-all params as arrays", () => {
    expect(
      matchPattern([staticSegment("docs"), catchAll("rest")], [
        "docs",
        "a",
        "b",
      ])?.params
    ).toEqual({ rest: ["a", "b"] });
    expect(matchPattern([staticSegment("docs"), catchAll("rest")], ["docs"]))
      .toBeNull();
  });

  it("captures optional catch-all params as arrays or undefined", () => {
    expect(
      matchPattern([staticSegment("docs"), optional("slug")], ["docs"])
        ?.params
    ).toHaveProperty("slug", undefined);
    expect(
      matchPattern([staticSegment("docs"), optional("slug")], [
        "docs",
        "a",
        "b",
      ])?.params
    ).toEqual({ slug: ["a", "b"] });
  });

  it("rejects trailing segments", () => {
    expect(matchPattern([staticSegment("blog")], ["blog", "extra"])).toBeNull();
  });
});

describe("rankMatches", () => {
  it("prefers a static route over a dynamic route", () => {
    const winner = best("/blog/archive", [
      { dir: "blog/[slug]", pattern: [staticSegment("blog"), dynamic("slug")] },
      {
        dir: "blog/archive",
        pattern: [staticSegment("blog"), staticSegment("archive")],
      },
    ]);
    expect(winner?.dir).toBe("blog/archive");
  });

  it("prefers a dynamic route over a catch-all route", () => {
    const winner = best("/files/a", [
      { dir: "files/[id]", pattern: [staticSegment("files"), dynamic("id")] },
      { dir: "files/[...path]", pattern: [staticSegment("files"), catchAll()] },
    ]);
    expect(winner?.dir).toBe("files/[id]");
  });

  it("prefers a catch-all route over an optional catch-all route", () => {
    const winner = best("/x/y", [
      { dir: "x/[...a]", pattern: [staticSegment("x"), catchAll("a")] },
      { dir: "x/[[...b]]", pattern: [staticSegment("x"), optional("b")] },
    ]);
    expect(winner?.dir).toBe("x/[...a]");
  });

  it("lets an optional catch-all match zero segments", () => {
    const winner = best("/shop", [
      { dir: "shop", pattern: [staticSegment("shop")] },
      {
        dir: "shop/[[...slug]]",
        pattern: [staticSegment("shop"), optional("slug")],
      },
    ]);
    expect(winner?.dir).toBe("shop");
    expect(
      best("/shop", [
        {
          dir: "shop/[[...slug]]",
          pattern: [staticSegment("shop"), optional("slug")],
        },
      ])?.params
    ).toHaveProperty("slug", undefined);
  });

  it("breaks equal specificity ties by pattern order", () => {
    const winner = best("/value", [
      { dir: "[slug]", pattern: [dynamic("slug")] },
      { dir: "[id]", pattern: [dynamic("id")] },
    ]);
    expect(winner?.dir).toBe("[id]");
  });
});

describe("parseUrlSegments", () => {
  it("strips query strings and fragments", () => {
    expect(parseUrlSegments("/blog?x=1")).toEqual(["blog"]);
    expect(parseUrlSegments("/blog#top")).toEqual(["blog"]);
    expect(parseUrlSegments("")).toEqual([]);
  });

  it("decodes each segment once", () => {
    expect(parseUrlSegments("/hello%20world")).toEqual(["hello world"]);
    expect(parseUrlSegments("/blog/%5Bslug%5D")).toEqual(["blog", "[slug]"]);
  });

  it("rejects malformed encodings, traversal, and separators", () => {
    expect(parseUrlSegments("/%E0%A4%A")).toBeNull();
    expect(parseUrlSegments("/%2e%2e/secret")).toBeNull();
    expect(parseUrlSegments("/./secret")).toBeNull();
    expect(parseUrlSegments("/a%2Fb")).toBeNull();
    expect(parseUrlSegments("/a%5Cb")).toBeNull();
  });
});

describe("toPatternSegment", () => {
  it("classifies route directories into pattern segments", () => {
    expect(toPatternSegment("blog")).toEqual({
      kind: "static",
      value: "blog",
    });
    expect(toPatternSegment("[id]")).toEqual({ kind: "dynamic", name: "id" });
    expect(toPatternSegment("[...path]")).toEqual({
      kind: "catchAll",
      name: "path",
    });
    expect(toPatternSegment("[[...slug]]")).toEqual({
      kind: "optionalCatchAll",
      name: "slug",
    });
  });

  it("returns null for route groups", () => {
    expect(toPatternSegment("(marketing)")).toBeNull();
    expect(toPatternSegment("(a)")).toBeNull();
  });
});
