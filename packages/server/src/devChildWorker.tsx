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

// Attach filePath metadata to all exports of a module
function attachFilePaths(mod: any, filePath: string) {
  if (!mod) return mod;

  const maybeTag = (comp: any) => {
    if (typeof comp === "function" && !comp.__filePath) {
      comp.__filePath = filePath;
    }
  };

  if (typeof mod === "function") {
    maybeTag(mod);
  } else if (typeof mod === "object") {
    for (const key of Object.keys(mod)) {
      maybeTag(mod[key]);
    }
  }

  return mod;
}

// ----------------------------
// Recursively find layout paths for a given URL
// ----------------------------
async function findLayoutComponents(urlPath: string) {
  const layoutPaths: string[] = [];
  let pathParts = urlPath.split("/").filter(Boolean);
  const routesIndex = pathParts.findIndex((part) => part === "routes");

  if (routesIndex === -1) return layoutPaths;

  pathParts = pathParts.slice(routesIndex + 1);

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
// Recursive import parsing
// ----------------------------
function getImports(filePath: string): string[] {
  try {
    const src = fs.readFileSync(filePath, "utf8");
    const importRegex = /import\s+(?:[\s\S]+?)\s+from\s+['"](.+)['"]/g;
    const imports: string[] = [];

    let match;
    while ((match = importRegex.exec(src))) {
      const raw = match[1];
      if (raw.startsWith(".")) {
        const resolved = path.resolve(path.dirname(filePath), raw);
        const extResolved =
          fs.existsSync(resolved) && fs.statSync(resolved).isFile()
            ? resolved
            : [".tsx", ".ts", ".jsx", ".js"]
                .map((ext) => resolved + ext)
                .find((p) => fs.existsSync(p));
        if (extResolved) imports.push(extResolved);
      }
    }

    return imports;
  } catch {
    return [];
  }
}

// ----------------------------
// Check recursively if a file or its imports is a client component
// ----------------------------
function fileContainsClientComponent(
  filePath: string,
  seen = new Set<string>()
): boolean {
  if (!filePath || seen.has(filePath)) return false;
  seen.add(filePath);

  if (isClientComponent(filePath)) return true;

  const imports = getImports(filePath);
  for (const imp of imports) {
    if (fileContainsClientComponent(imp, seen)) return true;
  }

  return false;
}

// ----------------------------
// Recursively preload modules and attach filePaths
// ----------------------------
const preloadedModules = new Map<string, any>();

function preloadModule(filePath: string) {
  if (preloadedModules.has(filePath)) return preloadedModules.get(filePath);

  if (!fs.existsSync(filePath)) return null;

  const mod = attachFilePaths(require(filePath), filePath);
  preloadedModules.set(filePath, mod);

  for (const imp of getImports(filePath)) {
    preloadModule(imp);
  }

  return mod;
}

// ----------------------------
// Resolve async or sync component
// ----------------------------
async function resolveComponent(Component: any, props: any = {}) {
  if (!Component) return null;

  let element;
  if (Component.constructor.name === "AsyncFunction") {
    element = await Component(props); // await async page/layout
  } else {
    element = React.createElement(Component, props);
  }

  return element;
}

// ----------------------------
// Recursively wrap client components for hydration
// ----------------------------
function wrapClientComponents(
  element: any,
  allClientComponents: any[] = []
): any {
  if (!element || typeof element !== "object") return element;

  const type = element.type;
  const filePath = type?.__filePath;

  if (
    filePath &&
    (isClientComponent(filePath) || fileContainsClientComponent(filePath))
  ) {
    const routeMatch = filePath.match(/\/routes(.*)$/);
    const routePath = routeMatch ? routeMatch[1] : filePath;

    if (!allClientComponents.find((c) => c.filePath === filePath)) {
      allClientComponents.push({ filePath, routePath });
    }

    return React.createElement(
      "div",
      {
        id: `hydrate-${routePath.replace(/\//g, "-")}`,
        "data-client-component": routePath.replace(/\//g, "-"),
        suppressHydrationWarning: true,
      },
      React.createElement(
        type,
        element.props,
        element.props?.children
          ? React.Children.map(element.props.children, (child) =>
              wrapClientComponents(child, allClientComponents)
            )
          : null
      )
    );
  }

  if (element.props?.children) {
    return React.cloneElement(
      element,
      element.props,
      React.Children.map(element.props.children, (child) =>
        wrapClientComponents(child, allClientComponents)
      )
    );
  }

  return element;
}

// ----------------------------
// Main render handler
// ----------------------------
process.on("message", async ({ file, url }: { file: string; url: string }) => {
  try {
    const allClientComponents: { filePath: string; routePath: string }[] = [];

    // ---------------- Phase 0: preload all modules ----------------
    preloadModule(file);
    const layoutPaths = await findLayoutComponents(
      file.replace("page.tsx", "")
    );
    for (const layoutPath of layoutPaths) {
      preloadModule(layoutPath);
    }

    // ---------------- Phase 1: load page ----------------
    const pageModule = preloadedModules.get(file);
    const pageComponent = pageModule.default;
    let pageElement = await resolveComponent(pageComponent, {});

    // ---------------- Phase 2: layouts ----------------
    for (const layoutPath of layoutPaths) {
      const LayoutModule = preloadedModules.get(layoutPath);
      const LayoutComp = LayoutModule.default;

      pageElement = await resolveComponent(LayoutComp, {
        children: pageElement,
      });
    }

    // ---------------- Phase 3: wrap client components ----------------
    pageElement = wrapClientComponents(pageElement, allClientComponents);

    // ---------------- Phase 4: render to HTML ----------------
    const renderedHTML = renderToStaticMarkup(pageElement);

    // ---------------- Phase 5: inject hydration bundles ----------------
    let finalHTML = renderedHTML;

    for (const comp of allClientComponents) {
      const bundle = await bundleClient(comp.filePath);
      const hydrationKey = comp.routePath.replace(/\//g, "-");

      finalHTML += `
      <script type="module">
      ${bundle}
      (function() {
        const hydrationKey = "${hydrationKey}";
        document.addEventListener("DOMContentLoaded", () => {
          const el = document.getElementById("hydrate-" + hydrationKey);
          const Comp = window.__components?.[hydrationKey]?.default;
          if (el && Comp) {
            window.ReactDOMClient.hydrateRoot(el, React.createElement(Comp, {}));
          } else {
            console.warn("Hydration skipped: element or component not found for", hydrationKey);
          }
        });
      })();
      </script>`;
    }

    // ---------------- Phase 6: send back ----------------
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
