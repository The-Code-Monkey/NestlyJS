import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { buildApp } from "../src/build";

let root: string;
const originalCwd = process.cwd();

beforeEach(() => {
  root = fs.mkdtempSync(path.join(__dirname, "tmp-page-parity-"));
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

describe("page graph parity", () => {
  it("build and the dev child agree on client files and CSS", async () => {
    write("routes/global.css", "body { color: black; }");
    write("routes/button.css", "button { color: red; }");
    write(
      "routes/layout.tsx",
      `import "./global.css";
export default function Layout({ children }: any) {
  return <html><head></head><body>{children}</body></html>;
}`
    );
    write(
      "routes/button.tsx",
      `"use client";
import "./button.css";
export default function Button() { return <button>go</button>; }`
    );
    const pageFile = write(
      "routes/page.tsx",
      `import Button from "./button";
export default function Page() { return <Button />; }`
    );

    const manifest = await buildApp();
    const route = manifest.routes.find((entry) => entry.pattern.length === 0)!;
    const styleFile = route.page!.style!.split("/").pop()!;
    const scriptFile = route.page!.script!.split("/").pop()!;
    const builtCss = fs.readFileSync(
      path.join(root, ".nestly", "client", styleFile),
      "utf8"
    );
    const builtJs = fs.readFileSync(
      path.join(root, ".nestly", "client", scriptFile),
      "utf8"
    );

    vi.resetModules();
    const devChild = await import("../src/devChildWorker");
    const html = await devChild.renderPage(pageFile, "/");

    expect(builtJs).toContain("routes/button.tsx");
    expect(html).toContain("routes/button.tsx");

    expect(builtCss).toContain("color: black");
    expect(builtCss).toContain("color: red");
    expect(html).toContain("color: black");
    expect(html).toContain("color: red");

    expect(builtCss.indexOf("black")).toBeLessThan(builtCss.indexOf("red"));
    expect(html.indexOf("black")).toBeLessThan(html.indexOf("red"));
  });
});
