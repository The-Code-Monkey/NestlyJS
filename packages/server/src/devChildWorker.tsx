// frontend.child.worker.ts

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import path from "path";
import fs from "fs";
import { bundleClientDynamic as bundleClient } from "./bundler";

console.log(`[CHILD ${process.pid}] Booting SSR child worker`);

// ----------------------------
// Helpers
// ----------------------------

/**
 * Check whether a source file declares the `"use client"` directive.
 *
 * Reads up to the first 10 lines of the file, finds the first non-empty,
 * non-comment line, and returns true if that line is a `"use client"` directive.
 *
 * @param filePath - Path to the source file to inspect (absolute or relative).
 * @returns `true` if the file's first meaningful statement is `"use client"`, otherwise `false`.
 *          Also returns `false` if the file cannot be read.
 */
function isClientComponent(filePath: string) {
  try {
    const buf = fs.readFileSync(filePath, "utf8");
    const firstStmt = buf
      .split(/\r?\n/)
      .slice(0, 10)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("//") && !l.startsWith("/*"))[0];
    return /^['"]use client['"]\s*;?$/.test(firstStmt ?? "");
  } catch {
    return false;
  }
}

/**
 * Find layout.tsx files for a given route path, ordered from outermost to innermost.
 *
 * Given a file system URL path that includes a "routes" segment, this function walks
 * down the route segments from the repository's "routes" directory and collects any
 * layout.tsx files found at each level. If the provided path does not contain a
 * "routes" segment, an empty array is returned.
 *
 * @param urlPath - A file-system-style path (e.g., "/src/routes/blog/post/page.tsx") that includes a "routes" segment.
 * @returns A promise that resolves to an array of absolute file paths to `layout.tsx` files, ordered outermost → innermost.
 */
async function findLayoutComponents(urlPath: string) {
  const layoutPaths: string[] = [];
  let pathParts = urlPath.split("/").filter(Boolean);
  const routesIndex = pathParts.findIndex((part) => part === "routes");

  if (routesIndex === -1) {
    return layoutPaths;
  }
  pathParts = pathParts.slice(routesIndex + 1); // Start from the root directory ("routes") and go down to the current directory

  for (let i = 0; i <= pathParts.length; i++) {
    const layoutPath = path.resolve(
      process.cwd(),
      "routes",
      ...pathParts.slice(0, i),
      "layout.tsx"
    );
    if (fs.existsSync(layoutPath)) {
      layoutPaths.push(layoutPath);
    }
  }
  return layoutPaths.reverse();
}

// ----------------------------
// Main render handler
// ----------------------------
process.on("message", async ({ file, url }: { file: string; url: string }) => {
  try {
    const allClientComponents: { filePath: string; routePath: string }[] = [];

    const originalCreateElement = React.createElement;
    // @ts-ignore
    React.createElement = (type: any, props: any, ...children: any[]) => {
      const filePath = type?.__source?.fileName;
      if (filePath && isClientComponent(filePath)) {
        const routeMatch = filePath.match(/\/routes(.*)$/);
        const routePath = routeMatch ? routeMatch[1] : filePath;
        allClientComponents.push({ filePath, routePath });

        const hydratableElement = originalCreateElement(
          "div",
          {
            id: `hydrate-${routePath.replace(/\//g, "-")}`,
            "data-client-component": routePath.replace(/\//g, "-"),
            suppressHydrationWarning: true,
          },
          originalCreateElement(type, props, ...children)
        );
        return hydratableElement;
      }
      return originalCreateElement(type, props, ...children);
    };

    // Phase 1: Create the base page element, checking if it's a client component
    const pageComponent = require(file).default;
    let elementTree: any = React.createElement(pageComponent, {});
    const layoutPaths = await findLayoutComponents(
      file.replace("page.tsx", "")
    );

    // --- FIX APPLIED HERE ---
    // Correctly wrap the element tree with layouts in the correct order
    console.log(layoutPaths);
    for (const layoutPath of layoutPaths) {
      const LayoutComp = require(layoutPath).default;
      elementTree = React.createElement(LayoutComp, { children: elementTree });
    }

    // Phase 2: Render to HTML
    const renderedHTML = renderToStaticMarkup(elementTree);

    // Phase 3: Restore original createElement
    // @ts-ignore
    React.createElement = originalCreateElement;

    // Phase 4: Inject hydration scripts for all collected client components
    let finalHTML = renderedHTML;
    for (const comp of allClientComponents) {
      const bundle = await bundleClient(comp.filePath);
      const hydrationKey = comp.routePath.replace(/\//g, "-");

      finalHTML += `
      <script type="module">
      ${bundle}
      (function(){
      document.addEventListener("DOMContentLoaded", () => {
        const el = document.getElementById("hydrate-${hydrationKey}");
        const Comp = window.__components?.["${hydrationKey}"]?.default;
        if (el && Comp) {
          window.ReactDOMClient.hydrateRoot(el, window.React.createElement(Comp, {}));
        } else {
          console.warn("Hydration skipped: element or component not found for ${hydrationKey}");
        }
      });
      })();
      </script>`;
    }

    // Phase 5: Send back
    process.send?.({
      type: "render",
      html: finalHTML,
      url,
    });

    console.log(`[CHILD ${process.pid}] Rendered page for ${url}`);
  } catch (err) {
    console.error(`[CHILD ${process.pid}] Error rendering page:`, err);
    process.send?.({
      type: "render",
      html: "<h1>Error rendering page</h1>",
      url,
    });
  }
});
