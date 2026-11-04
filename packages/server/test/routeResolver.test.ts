import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  getRouteFiles,
  hasPageForGET,
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

describe("getRouteFiles", () => {
  it("resolves the root route", () => {
    expect(getRouteFiles("/")).toEqual({
      routeDir: path.join(root, "routes"),
      pageFile: path.join(root, "routes", "page.tsx"),
      apiFile: path.join(root, "routes", "api.ts"),
    });
  });

  it("resolves nested routes", () => {
    expect(getRouteFiles("/blog/post").routeDir).toBe(
      path.join(root, "routes", "blog", "post")
    );
  });

  it("strips query strings and fragments", () => {
    expect(getRouteFiles("/blog?x=1").routeDir).toBe(
      path.join(root, "routes", "blog")
    );
    expect(getRouteFiles("/blog#top").routeDir).toBe(
      path.join(root, "routes", "blog")
    );
  });
});

describe("hasPageForGET", () => {
  it("returns true when page.tsx exists", () => {
    write("routes/page.tsx");
    expect(hasPageForGET("/")).toBe(true);
  });

  it("returns false when page.tsx is missing", () => {
    expect(hasPageForGET("/missing")).toBe(false);
  });

  it("ignores the query string", () => {
    write("routes/page.tsx");
    expect(hasPageForGET("/?x=1")).toBe(true);
  });
});

describe("getAPIMethod", () => {
  it("returns null when api.ts is missing", () => {
    expect(getAPIMethod("/", "GET")).toBeNull();
  });

  it("returns the named method export", () => {
    write("routes/api.ts", "exports.POST = () => 'ok';");
    expect(getAPIMethod("/", "POST")?.()).toBe("ok");
  });

  it("returns null for a missing method", () => {
    write("routes/api.ts", "exports.POST = () => 'ok';");
    expect(getAPIMethod("/", "GET")).toBeNull();
  });

  it("prefers page.tsx for GET when both exist", () => {
    write("routes/api.ts", "exports.GET = () => 'ok';");
    write("routes/page.tsx");
    expect(getAPIMethod("/", "GET")).toBeNull();
  });

  it("allows GET when only api.ts exists", () => {
    write("routes/api.ts", "exports.GET = () => 'ok';");
    expect(getAPIMethod("/", "GET")?.()).toBe("ok");
  });

  it("returns null when the export is not a function", () => {
    write("routes/api.ts", "exports.GET = 'nope';");
    expect(getAPIMethod("/", "GET")).toBeNull();
  });
});
