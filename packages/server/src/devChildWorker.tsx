import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import path from "path";
import fs from "fs";
import { bundleClientDynamic as bundleClient } from "./bundler";

console.log(`[CHILD ${process.pid}] Booting SSR child worker`);

// ----------------------------
// Helpers
// ----------------------------

// Detect "use client"
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

// Recursively find layout paths for a given URL
async function findLayoutComponents(urlPath: string) {
  const layoutPaths: string[] = [];
  let pathParts = urlPath.split("/").filter(Boolean);
  const routesIndex = pathParts.findIndex((part) => part === "routes");
  pathParts = pathParts.slice(routesIndex);

  for (let i = pathParts.length - 1; i >= 0; i--) {
    const layoutPath = path.resolve(
      process.cwd(),
      `${pathParts.slice(0, i + 1).join("/")}/layout.tsx`
    );
    if (fs.existsSync(layoutPath)) {
      layoutPaths.push(layoutPath);
    }
  }
  return layoutPaths;
}

// Get React element + CSR info
async function getComponentElement(filePath: string, props: any = {}) {
  const isCSR = isClientComponent(filePath);
  const Comp = require(filePath).default;

  return {
    element: React.createElement(Comp, props),
    isCSR,
    filePath,
  };
}

// ----------------------------
// Main render handler
// ----------------------------
process.on("message", async ({ file, url }: { file: string; url: string }) => {
  try {
    // ----------------------------
    // Phase 1: Create base element & detect CSR
    // ----------------------------
    const elementInfo = await getComponentElement(file, {});
    let csrComponent: { filePath: string; element: React.ReactElement } | null =
      elementInfo.isCSR
        ? { filePath: elementInfo.filePath, element: elementInfo.element }
        : null;

    // ----------------------------
    // Phase 2: Find layout hierarchy
    // ----------------------------
    const layoutPaths = await findLayoutComponents(
      file.replace("page.tsx", "")
    );

    // ----------------------------
    // Phase 3: Wrap elements with layouts
    // ----------------------------
    let elementTree = elementInfo.element;

    if (csrComponent) {
      // Wrap only the CSR component in a hydration div
      // Extract route path after "/routes"
      const routeMatch = csrComponent.filePath.match(/\/routes(.*)$/);
      let routePath = routeMatch ? routeMatch[1] : csrComponent.filePath;

      // Normalize for HTML ID
      routePath = routePath.replace(/\//g, "-");

      // Create the wrapper
      const csrWrapper = React.createElement(
        "div",
        { id: `hydrate-${routePath}` },
        csrComponent.element
      );

      // Wrap layouts around the csrWrapper
      // @ts-ignore
      elementTree = csrWrapper;
      for (const layoutPath of layoutPaths.reverse()) {
        const LayoutComp = require(layoutPath).default;
        elementTree = React.createElement(LayoutComp, {
          children: elementTree,
        });
      }
    } else {
      // Non-CSR: just wrap original element in layouts
      for (const layoutPath of layoutPaths) {
        const LayoutComp = require(layoutPath).default;
        elementTree = React.createElement(LayoutComp, {
          children: elementTree,
        });
      }
    }

    // ----------------------------
    // Phase 4: Render to HTML
    // ----------------------------
    const renderedHTML = renderToStaticMarkup(elementTree);

    // ----------------------------
    // Phase 5: Inject hydration script if CSR
    // ----------------------------
    let finalHTML = renderedHTML;
    if (csrComponent) {
      const bundle = await bundleClient(csrComponent.filePath);

      // Extract route path after "/routes"
      const routeMatch = csrComponent.filePath.match(/\/routes(.*)$/);
      let routePath = routeMatch ? routeMatch[1] : csrComponent.filePath;

      // Normalize for HTML ID (replace slashes with dashes)
      routePath = routePath.replace(/\//g, "-");

      finalHTML += `
      <script type="module">
      ${bundle}
      (function(){
      document.addEventListener("DOMContentLoaded", () => {
        const el = document.getElementById("hydrate-${routePath}");
        const Comp = window.__components?.["${routePath}"]?.default;
console.log(el, Comp)
        if (el && Comp) {
          window.ReactDOMClient.hydrateRoot(el, window.React.createElement(Comp, {}));
        } else {
          console.warn("Hydration skipped: element or component not found");
        }
      });
      })();
      </script>`;
    }

    // ----------------------------
    // Phase 6: Send back
    // ----------------------------
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
