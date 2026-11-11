import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { buildApp } from "../src/build";
import { resolveRoute } from "../src/routeResolver";
import { matchManifestRoute } from "../src/prodRouter";
import type { PatternSegment, RouteParams } from "../src/routePatterns";

let root: string;
const originalCwd = process.cwd();

beforeEach(() => {
  root = fs.mkdtempSync(path.join(__dirname, "tmp-route-parity-"));
  process.chdir(root);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(root, { recursive: true, force: true });
});

function write(relative: string, contents = "") {
  const filePath = path.join(root, relative);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
  return filePath;
}

function writeFixture() {
  const page = `export default function Page() { return null; }`;
  write("routes/page.tsx", page);
  write("routes/blog/page.tsx", page);
  write("routes/blog/[slug]/page.tsx", page);
  write("routes/blog/[...rest]/page.tsx", page);
  write("routes/docs/[[...slug]]/page.tsx", page);
  write("routes/(marketing)/about/page.tsx", page);
  write("routes/(group)/archive/page.tsx", page);
  write("routes/[id]/page.tsx", page);
  write("routes/[slug]/page.tsx", page);
  write(
    "routes/files/[...path]/api.ts",
    `export async function POST() { return { status: 200, body: {} }; }`
  );
}

interface Case {
  url: string;
  dir: string;
  params: RouteParams;
  pattern: PatternSegment[];
}

const cases: Case[] = [
  { url: "/", dir: "", params: {}, pattern: [] },
  {
    url: "/blog",
    dir: "blog",
    params: {},
    pattern: [{ kind: "static", value: "blog" }],
  },
  {
    url: "/blog/hello",
    dir: "blog/[slug]",
    params: { slug: "hello" },
    pattern: [
      { kind: "static", value: "blog" },
      { kind: "dynamic", name: "slug" },
    ],
  },
  {
    url: "/blog/a/b",
    dir: "blog/[...rest]",
    params: { rest: ["a", "b"] },
    pattern: [
      { kind: "static", value: "blog" },
      { kind: "catchAll", name: "rest" },
    ],
  },
  {
    url: "/docs",
    dir: "docs/[[...slug]]",
    params: { slug: undefined },
    pattern: [
      { kind: "static", value: "docs" },
      { kind: "optionalCatchAll", name: "slug" },
    ],
  },
  {
    url: "/docs/guides/setup",
    dir: "docs/[[...slug]]",
    params: { slug: ["guides", "setup"] },
    pattern: [
      { kind: "static", value: "docs" },
      { kind: "optionalCatchAll", name: "slug" },
    ],
  },
  {
    url: "/about",
    dir: "(marketing)/about",
    params: {},
    pattern: [{ kind: "static", value: "about" }],
  },
  {
    url: "/archive",
    dir: "(group)/archive",
    params: {},
    pattern: [{ kind: "static", value: "archive" }],
  },
  {
    url: "/value",
    dir: "[id]",
    params: { id: "value" },
    pattern: [{ kind: "dynamic", name: "id" }],
  },
  {
    url: "/blog/hello?x=1",
    dir: "blog/[slug]",
    params: { slug: "hello" },
    pattern: [
      { kind: "static", value: "blog" },
      { kind: "dynamic", name: "slug" },
    ],
  },
  {
    url: "/files/a/b",
    dir: "files/[...path]",
    params: { path: ["a", "b"] },
    pattern: [
      { kind: "static", value: "files" },
      { kind: "catchAll", name: "path" },
    ],
  },
];

describe("route pattern parity", () => {
  it("builds patterns the production matcher ranks like the dev resolver", async () => {
    writeFixture();
    const manifest = await buildApp();

    for (const expected of cases) {
      const dev = resolveRoute(expected.url);
      const prod = matchManifestRoute(manifest, expected.url);

      expect(dev, `dev match for ${expected.url}`).not.toBeNull();
      expect(prod, `production match for ${expected.url}`).not.toBeNull();
      expect(dev!.routeDir, `dev dir for ${expected.url}`).toBe(
        path.join(root, "routes", expected.dir)
      );
      expect(dev!.params, `dev params for ${expected.url}`).toEqual(
        expected.params
      );
      expect(prod!.params, `production params for ${expected.url}`).toEqual(
        expected.params
      );
      expect(prod!.route.pattern, `pattern for ${expected.url}`).toEqual(
        expected.pattern
      );
    }
  });

  it("rejects malformed and traversal URLs in both adapters", async () => {
    writeFixture();
    const manifest = await buildApp();

    for (const url of ["/%E0%A4%A", "/%2e%2e/blog", "/a%2Fb"]) {
      expect(resolveRoute(url), `dev ${url}`).toBeNull();
      expect(matchManifestRoute(manifest, url), `production ${url}`).toBeNull();
    }
  });
});
