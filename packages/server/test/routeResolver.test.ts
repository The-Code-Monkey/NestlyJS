import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  resolveRoute,
  hasPageForGET,
  getAPIRoute,
  getAPIMethod,
} from "../src/routeResolver";

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "nestly-routes-"));
  process.chdir(root);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(relative: string, contents = "") {
  const filePath = path.join(root, relative);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
  return filePath;
}

function routeDir(relative: string) {
  return path.join(root, "routes", relative);
}

describe("resolveRoute", () => {
  it("resolves the root route", () => {
    write("routes/page.tsx");
    expect(resolveRoute("/")).toEqual({
      routeDir: routeDir(""),
      pageFile: path.join(root, "routes", "page.tsx"),
      apiFile: path.join(root, "routes", "api.ts"),
      params: {},
    });
  });

  it("resolves nested static routes", () => {
    write("routes/blog/post/page.tsx");
    expect(resolveRoute("/blog/post").routeDir).toBe(routeDir("blog/post"));
  });

  it("treats an empty path as the root route", () => {
    write("routes/page.tsx");
    expect(resolveRoute("")?.routeDir).toBe(routeDir(""));
  });

  it("strips query strings and fragments", () => {
    write("routes/blog/page.tsx");
    expect(resolveRoute("/blog?x=1").routeDir).toBe(routeDir("blog"));
    expect(resolveRoute("/blog#top").routeDir).toBe(routeDir("blog"));
    expect(resolveRoute("/blog/?x=1").routeDir).toBe(routeDir("blog"));
  });

  it("resolves a single dynamic segment", () => {
    write("routes/blog/[slug]/page.tsx");
    const route = resolveRoute("/blog/hello");
    expect(route?.routeDir).toBe(routeDir("blog/[slug]"));
    expect(route?.params).toEqual({ slug: "hello" });
  });

  it("resolves a dynamic segment in the middle", () => {
    write("routes/users/[id]/posts/page.tsx");
    const route = resolveRoute("/users/42/posts");
    expect(route?.params).toEqual({ id: "42" });
  });

  it("decodes params", () => {
    write("routes/blog/[slug]/page.tsx");
    expect(resolveRoute("/blog/hello%20world")?.params).toEqual({
      slug: "hello world",
    });
  });

  it("prefers a static route over a dynamic sibling", () => {
    write("routes/blog/[slug]/page.tsx");
    write("routes/blog/archive/page.tsx");
    expect(resolveRoute("/blog/archive").routeDir).toBe(routeDir("blog/archive"));
    expect(resolveRoute("/blog/other").routeDir).toBe(routeDir("blog/[slug]"));
  });

  it("falls back to a dynamic sibling when the static tree has no route", () => {
    write("routes/blog/[slug]/page.tsx");
    write("routes/blog/archive/notes.txt");
    expect(resolveRoute("/blog/archive").routeDir).toBe(routeDir("blog/[slug]"));
  });

  it("matches API-only dynamic routes", () => {
    write("routes/hooks/[id]/api.ts");
    const route = resolveRoute("/hooks/abc");
    expect(route?.routeDir).toBe(routeDir("hooks/[id]"));
    expect(route?.params).toEqual({ id: "abc" });
  });

  it("matches catch-all routes with one or more segments", () => {
    write("routes/docs/[...slug]/page.tsx");
    expect(resolveRoute("/docs/a/b")?.params).toEqual({
      slug: ["a", "b"],
    });
    expect(resolveRoute("/docs/a%20b/c")?.params).toEqual({
      slug: ["a b", "c"],
    });
    expect(resolveRoute("/docs")).toBeNull();
  });

  it("matches optional catch-all routes with zero or more segments", () => {
    write("routes/shop/[[...slug]]/page.tsx");
    const empty = resolveRoute("/shop");
    expect(empty?.routeDir).toBe(routeDir("shop/[[...slug]]"));
    expect(empty?.params).toHaveProperty("slug", undefined);
    expect(resolveRoute("/shop/a/b")?.params).toEqual({
      slug: ["a", "b"],
    });
  });

  it("prefers dynamic over catch-all", () => {
    write("routes/files/[id]/page.tsx");
    write("routes/files/[...path]/page.tsx");
    expect(resolveRoute("/files/a")?.routeDir).toBe(routeDir("files/[id]"));
    expect(resolveRoute("/files/a/b")?.routeDir).toBe(
      routeDir("files/[...path]")
    );
  });

  it("prefers catch-all over optional catch-all", () => {
    write("routes/x/[...a]/page.tsx");
    write("routes/x/[[...b]]/page.tsx");
    expect(resolveRoute("/x/y")?.routeDir).toBe(routeDir("x/[...a]"));
    expect(resolveRoute("/x")?.routeDir).toBe(routeDir("x/[[...b]]"));
  });

  it("prefers a static route over catch-all", () => {
    write("routes/docs/page.tsx");
    write("routes/docs/[...slug]/page.tsx");
    expect(resolveRoute("/docs")?.routeDir).toBe(routeDir("docs"));
    expect(resolveRoute("/docs/a")?.routeDir).toBe(
      routeDir("docs/[...slug]")
    );
  });

  it("prefers a root page over an optional catch-all", () => {
    write("routes/page.tsx");
    write("routes/[[...slug]]/page.tsx");
    expect(resolveRoute("/")?.routeDir).toBe(routeDir(""));
    expect(resolveRoute("/a")?.routeDir).toBe(routeDir("[[...slug]]"));
  });

  it("resolves routes inside route groups", () => {
    write("routes/(marketing)/about/page.tsx");
    const route = resolveRoute("/about");
    expect(route?.routeDir).toBe(routeDir("(marketing)/about"));
    expect(route?.params).toEqual({});
  });

  it("does not treat a group name as a URL segment", () => {
    write("routes/(marketing)/page.tsx");
    expect(resolveRoute("/")?.routeDir).toBe(routeDir("(marketing)"));
    expect(resolveRoute("/marketing")).toBeNull();
  });

  it("allows nested route groups", () => {
    write("routes/(a)/(b)/[id]/page.tsx");
    const route = resolveRoute("/value");
    expect(route?.routeDir).toBe(routeDir("(a)/(b)/[id]"));
    expect(route?.params).toEqual({ id: "value" });
  });

  it("prefers a static route in a group over a root dynamic route", () => {
    write("routes/(group)/archive/page.tsx");
    write("routes/[slug]/page.tsx");
    expect(resolveRoute("/archive")?.routeDir).toBe(
      routeDir("(group)/archive")
    );
  });

  it("prefers a root static route over a dynamic route in a group", () => {
    write("routes/(group)/[slug]/page.tsx");
    write("routes/archive/page.tsx");
    expect(resolveRoute("/archive")?.routeDir).toBe(routeDir("archive"));
  });

  it("treats a literal bracket segment as a param", () => {
    write("routes/blog/[slug]/page.tsx");
    expect(resolveRoute("/blog/%5Bslug%5D")?.params).toEqual({
      slug: "[slug]",
    });
  });

  it("uses the first dynamic sibling in sorted order", () => {
    write("routes/[id]/page.tsx");
    write("routes/[slug]/page.tsx");
    expect(resolveRoute("/value")?.params).toEqual({ id: "value" });
  });

  it("returns null when no route matches", () => {
    expect(resolveRoute("/")).toBeNull();
    write("routes/page.tsx");
    expect(resolveRoute("/missing")).toBeNull();
  });

  it("rejects malformed encodings", () => {
    write("routes/page.tsx");
    expect(resolveRoute("/%E0%A4%A")).toBeNull();
  });

  it("rejects traversal and encoded separators", () => {
    write("routes/page.tsx");
    expect(resolveRoute("/%2e%2e/secret")).toBeNull();
    expect(resolveRoute("/a%2Fb")).toBeNull();
    expect(resolveRoute("/a%5Cb")).toBeNull();
  });
});

describe("hasPageForGET", () => {
  it("returns true for a dynamic page", () => {
    write("routes/blog/[slug]/page.tsx");
    expect(hasPageForGET("/blog/hello")).toBe(true);
  });

  it("returns false for a dynamic API-only route", () => {
    write("routes/blog/[slug]/api.ts");
    expect(hasPageForGET("/blog/hello")).toBe(false);
  });

  it("returns false when nothing matches", () => {
    expect(hasPageForGET("/missing")).toBe(false);
  });
});

describe("getAPIRoute", () => {
  it("returns null when no route matches", () => {
    expect(getAPIRoute("/missing", "POST")).toBeNull();
  });

  it("returns null when api.ts is missing", () => {
    write("routes/page.tsx");
    expect(getAPIRoute("/", "POST")).toBeNull();
  });

  it("returns the named method export for a dynamic route", () => {
    write("routes/hooks/[id]/api.ts", "exports.POST = () => 'ok';");
    const result = getAPIRoute("/hooks/abc", "POST");
    expect(result?.handler()).toBe("ok");
    expect(result?.route.params).toEqual({ id: "abc" });
  });

  it("returns catch-all params for a dynamic API route", () => {
    write("routes/files/[...path]/api.ts", "exports.POST = () => 'ok';");
    const result = getAPIRoute("/files/a/b", "POST");
    expect(result?.route.params).toEqual({ path: ["a", "b"] });
  });

  it("prefers page.tsx for GET when both exist", () => {
    write("routes/api.ts", "exports.GET = () => 'ok';");
    write("routes/page.tsx");
    expect(getAPIRoute("/", "GET")).toBeNull();
  });

  it("allows GET when only api.ts exists", () => {
    write("routes/api.ts", "exports.GET = () => 'ok';");
    expect(getAPIRoute("/", "GET")?.handler()).toBe("ok");
  });

  it("returns null when the export is not a function", () => {
    write("routes/api.ts", "exports.GET = 'nope';");
    expect(getAPIRoute("/", "GET")).toBeNull();
  });
});

describe("getAPIMethod", () => {
  it("returns the handler", () => {
    write("routes/api.ts", "exports.POST = () => 'ok';");
    expect(getAPIMethod("/", "POST")?.()).toBe("ok");
  });

  it("returns null when no handler exists", () => {
    expect(getAPIMethod("/missing", "POST")).toBeNull();
  });
});
