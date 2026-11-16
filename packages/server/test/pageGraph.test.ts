import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  clientIdFor,
  getImports,
  getPageGraph,
  isClientComponent,
} from "../src/pageGraph";
import { resolveRoute } from "../src/routeResolver";

let root: string;
const originalCwd = process.cwd();

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "nestly-page-graph-"));
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

function writeBasicApp() {
  const globalCss = write("routes/global.css", "body { color: black; }");
  const buttonCss = write("routes/button.css", "button { color: red; }");
  const layout = write(
    "routes/layout.tsx",
    `import "./global.css";
export default function Layout({ children }: any) { return children; }`
  );
  const button = write(
    "routes/button.tsx",
    `"use client";
import "./button.css";
export default function Button() { return null; }`
  );
  const page = write(
    "routes/page.tsx",
    `import Button from "./button";
export default function Page() { return Button; }`
  );
  return { globalCss, buttonCss, layout, button, page };
}

describe("getPageGraph", () => {
  it("returns layouts, client files, and CSS for a page", () => {
    const { globalCss, buttonCss, layout, button, page } = writeBasicApp();

    expect(getPageGraph(page)).toEqual({
      pageFile: page,
      layouts: [layout],
      clientFiles: [button],
      pageCss: [globalCss],
      clientCss: [buttonCss],
      cssFiles: [globalCss, buttonCss],
    });
  });

  it("orders nested layouts and CSS from outermost to innermost to page", () => {
    const baseCss = write("routes/base.css", "html {}");
    const blogCss = write("routes/blog/blog.css", ".blog {}");
    const pageCss = write("routes/blog/page.css", ".page {}");
    const rootLayout = write(
      "routes/layout.tsx",
      `import "./base.css";
export default function Layout({ children }: any) { return children; }`
    );
    const blogLayout = write(
      "routes/blog/layout.tsx",
      `import "./blog.css";
export default function Layout({ children }: any) { return children; }`
    );
    const page = write(
      "routes/blog/page.tsx",
      `import "./page.css";
export default function Page() { return null; }`
    );

    const graph = getPageGraph(page);

    expect(graph.layouts).toEqual([rootLayout, blogLayout]);
    expect(graph.pageCss).toEqual([baseCss, blogCss, pageCss]);
  });

  it("resolves the same graph through query and fragment variants", () => {
    const css = write("routes/page.css", ".page {}");
    const page = write(
      "routes/page.tsx",
      `import "./page.css";
export default function Page() { return null; }`
    );
    const withQuery = resolveRoute("/?tab=a");
    const withFragment = resolveRoute("/#section");

    expect(withQuery?.pageFile).toBe(page);
    expect(withFragment?.pageFile).toBe(page);
    expect(getPageGraph(withQuery!.pageFile)).toEqual(
      getPageGraph(withFragment!.pageFile)
    );
    expect(getPageGraph(page).pageCss).toEqual([css]);
  });

  it("discovers layouts across route groups", () => {
    const rootLayout = write(
      "routes/layout.tsx",
      `export default function Layout({ children }: any) { return children; }`
    );
    const groupLayout = write(
      "routes/(marketing)/layout.tsx",
      `export default function Layout({ children }: any) { return children; }`
    );
    const page = write(
      "routes/(marketing)/about/page.tsx",
      `export default function Page() { return null; }`
    );

    expect(getPageGraph(page).layouts).toEqual([rootLayout, groupLayout]);
  });

  it("discovers layouts for a dynamic route from the page file", () => {
    const blogLayout = write(
      "routes/blog/[slug]/layout.tsx",
      `export default function Layout({ children }: any) { return children; }`
    );
    const page = write(
      "routes/blog/[slug]/page.tsx",
      `export default function Page() { return null; }`
    );

    expect(getPageGraph(page).layouts).toEqual([blogLayout]);
  });

  it("discovers client components and CSS through route groups", () => {
    const groupLayout = write(
      "routes/(marketing)/layout.tsx",
      `export default function Layout({ children }: any) { return children; }`
    );
    const pageCss = write("routes/(marketing)/about/page.css", ".about {}");
    const clientCss = write("routes/(marketing)/about/button.css", ".button {}");
    const button = write(
      "routes/(marketing)/about/button.tsx",
      `"use client";
import "./button.css";
export default function Button() { return null; }`
    );
    const page = write(
      "routes/(marketing)/about/page.tsx",
      `import "./page.css";
import Button from "./button";
export default function Page() { return Button; }`
    );

    const graph = getPageGraph(page);

    expect(graph.layouts).toEqual([groupLayout]);
    expect(graph.clientFiles).toEqual([button]);
    expect(graph.pageCss).toEqual([pageCss]);
    expect(graph.clientCss).toEqual([clientCss]);
  });

  it("discovers client components and CSS for a dynamic route", () => {
    const layout = write(
      "routes/blog/[slug]/layout.tsx",
      `export default function Layout({ children }: any) { return children; }`
    );
    const pageCss = write("routes/blog/[slug]/page.css", ".post {}");
    const clientCss = write("routes/blog/[slug]/section.css", ".section {}");
    const section = write(
      "routes/blog/[slug]/section.tsx",
      `"use client";
import "./section.css";
export default function Section() { return null; }`
    );
    const page = write(
      "routes/blog/[slug]/page.tsx",
      `import "./page.css";
import Section from "./section";
export default function Page() { return Section; }`
    );

    const graph = getPageGraph(page);

    expect(graph.layouts).toEqual([layout]);
    expect(graph.clientFiles).toEqual([section]);
    expect(graph.pageCss).toEqual([pageCss]);
    expect(graph.clientCss).toEqual([clientCss]);
  });

  it("includes a client page in the client file set and client CSS", () => {
    const pageCss = write("routes/client/page.css", ".client {}");
    const page = write(
      "routes/client/page.tsx",
      `"use client";
import "./page.css";
export default function Page() { return null; }`
    );

    const graph = getPageGraph(page);

    expect(graph.clientFiles).toEqual([page]);
    expect(graph.pageCss).toEqual([]);
    expect(graph.clientCss).toEqual([pageCss]);
    expect(graph.cssFiles).toEqual([pageCss]);
  });

  it("collects client components from layouts", () => {
    const button = write(
      "routes/nav.tsx",
      `"use client";\nexport default function Nav() { return null; }`
    );
    write(
      "routes/layout.tsx",
      `import Nav from "./nav";
export default function Layout({ children }: any) { return children; }`
    );
    const page = write(
      "routes/page.tsx",
      `export default function Page() { return null; }`
    );

    expect(getPageGraph(page).clientFiles).toEqual([button]);
  });

  it("deduplicates CSS, with the first occurrence winning", () => {
    const shared = write("routes/shared.css", "body {}");
    write(
      "routes/layout.tsx",
      `import "./shared.css";
export default function Layout({ children }: any) { return children; }`
    );
    write(
      "routes/button.tsx",
      `"use client";
import "./shared.css";
export default function Button() { return null; }`
    );
    const page = write(
      "routes/page.tsx",
      `import "./shared.css";
import Button from "./button";
export default function Page() { return Button; }`
    );

    const graph = getPageGraph(page);

    expect(graph.pageCss).toEqual([shared]);
    expect(graph.clientCss).toEqual([]);
    expect(graph.cssFiles).toEqual([shared]);
  });

  it("filters out unreadable CSS files", () => {
    const locked = write("routes/locked.css", "body {}");
    const page = write(
      "routes/page.tsx",
      `import "./locked.css";
export default function Page() { return null; }`
    );
    const realAccess = fs.accessSync;
    const spy = vi
      .spyOn(fs, "accessSync")
      .mockImplementation(((file: fs.PathLike, mode?: number) => {
        if (file === locked) throw new Error("EACCES");
        return realAccess(file, mode);
      }) as typeof fs.accessSync);

    expect(getPageGraph(page).cssFiles).toEqual([]);

    spy.mockRestore();
  });

  it("filters out unreadable source files", () => {
    const button = write(
      "routes/button.tsx",
      `"use client";
export default function Button() { return null; }`
    );
    const page = write(
      "routes/page.tsx",
      `import Button from "./button";
export default function Page() { return Button; }`
    );
    const realRead = fs.readFileSync;
    const spy = vi
      .spyOn(fs, "readFileSync")
      .mockImplementation(((file: fs.PathLike, options?: any) => {
        if (file === button) throw new Error("EACCES");
        return realRead(file, options);
      }) as typeof fs.readFileSync);

    expect(getPageGraph(page).clientFiles).toEqual([]);

    spy.mockRestore();
  });

  it("ignores missing relative imports", () => {
    const page = write(
      "routes/page.tsx",
      `import "./missing.css";
import Missing from "./missing";
export default function Page() { return Missing; }`
    );

    expect(getPageGraph(page)).toEqual({
      pageFile: page,
      layouts: [],
      clientFiles: [],
      pageCss: [],
      clientCss: [],
      cssFiles: [],
    });
  });

  it("returns an empty graph for a missing page file", () => {
    const page = path.join(root, "routes", "missing", "page.tsx");

    expect(getPageGraph(page)).toEqual({
      pageFile: page,
      layouts: [],
      clientFiles: [],
      pageCss: [],
      clientCss: [],
      cssFiles: [],
    });
  });

  it("discovers no layouts for a page outside the routes root", () => {
    const page = write(
      "elsewhere/page.tsx",
      `import "./page.css";
export default function Page() { return null; }`
    );
    const pageCss = path.join(root, "elsewhere", "page.css");
    fs.writeFileSync(pageCss, ".page {}");

    const graph = getPageGraph(page);

    expect(graph.layouts).toEqual([]);
    expect(graph.pageCss).toEqual([pageCss]);
  });

  it("discovers CSS imported before a from import", () => {
    const css = write("routes/global.css", "body { color: black; }");
    const layout = write(
      "routes/layout.tsx",
      `import "./global.css";
import React from "react";
export default function Layout({ children }: any) { return <html><body>{children}</body></html>; }`
    );
    const page = write(
      "routes/page.tsx",
      `export default function Page() { return null; }`
    );

    expect(getPageGraph(page).pageCss).toEqual([css]);
    expect(getPageGraph(page).layouts).toEqual([layout]);
  });

  it("sorts the client file set deterministically", () => {
    const zebra = write(
      "routes/zebra.tsx",
      `"use client";\nexport default function Zebra() { return null; }`
    );
    const alpha = write(
      "routes/alpha.tsx",
      `"use client";\nexport default function Alpha() { return null; }`
    );
    const page = write(
      "routes/page.tsx",
      `import Zebra from "./zebra";
import Alpha from "./alpha";
export default function Page() { return [Zebra, Alpha]; }`
    );

    expect(getPageGraph(page).clientFiles).toEqual([alpha, zebra]);
  });
});

describe("page graph helpers", () => {
  it("detects client component directives", () => {
    expect(isClientComponent("")).toBe(false);
    expect(isClientComponent(path.join(root, "missing.tsx"))).toBe(false);
    expect(isClientComponent(write("empty.tsx", ""))).toBe(false);
    expect(
      isClientComponent(
        write("client.tsx", '"use client";\nexport default 1;')
      )
    ).toBe(true);
    expect(isClientComponent(write("server.tsx", "export default 1;"))).toBe(
      false
    );
  });

  it("keeps a side-effect import before a from import", () => {
    const css = write("global.css", "body {}");
    const entry = write(
      "entry.tsx",
      `import "./global.css";
import React from "react";`
    );

    expect(getImports(entry)).toEqual([css]);
  });

  it("resolves relative imports and ignores bare or missing ones", () => {
    write("styles.css", "a {}");
    write("nested.ts", "export default 1;");
    const entry = write(
      "entry.tsx",
      `import "./styles.css";
import "./nested";
import "./missing";
import "react";`
    );

    expect(getImports(entry)).toEqual([
      path.join(root, "styles.css"),
      path.join(root, "nested.ts"),
    ]);
    expect(getImports(path.join(root, "missing.tsx"))).toEqual([]);
  });

  it("derives a stable client id from the app root", () => {
    expect(clientIdFor(path.join(root, "routes", "button.tsx"))).toBe(
      "routes/button.tsx"
    );
  });
});
