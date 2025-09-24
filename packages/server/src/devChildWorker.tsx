// frontend.child.worker.ts
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import path from "path";
import fs from "fs";
import { bundleClientDynamic as bundleClient } from "./bundler";

console.log(`[CHILD ${process.pid}] Booting SSR child worker`);

// ---------------- Helpers ----------------
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

function attachFilePaths(mod: any, filePath: string) {
  if (!mod) return mod;
  const maybeTag = (comp: any) => {
    if (typeof comp === "function" && !comp.__filePath)
      comp.__filePath = filePath;
  };
  if (typeof mod === "function") maybeTag(mod);
  else if (typeof mod === "object")
    for (const key of Object.keys(mod)) maybeTag(mod[key]);
  return mod;
}

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

function fileContainsClientComponent(
  filePath: string,
  seen = new Set<string>()
): boolean {
  if (!filePath || seen.has(filePath)) return false;
  seen.add(filePath);
  if (isClientComponent(filePath)) return true;
  const imports = getImports(filePath);
  for (const imp of imports)
    if (fileContainsClientComponent(imp, seen)) return true;
  return false;
}

const preloadedModules = new Map<string, any>();
function preloadModule(filePath: string) {
  if (preloadedModules.has(filePath)) return preloadedModules.get(filePath);
  if (!fs.existsSync(filePath)) return null;
  const mod = attachFilePaths(require(filePath), filePath);
  preloadedModules.set(filePath, mod);
  for (const imp of getImports(filePath)) preloadModule(imp);
  return mod;
}

// ---------------- Layout discovery ----------------
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
    if (fs.existsSync(layoutPath)) layoutPaths.push(layoutPath);
  }

  return layoutPaths.reverse(); // outer layouts wrap inner layouts
}

// ---------------- Component resolver ----------------
async function resolveComponent(Component: any, props: any = {}) {
  if (!Component) return null;
  if (Component.constructor.name === "AsyncFunction")
    return await Component(props);
  return React.createElement(Component, props);
}

// ---------------- Wrap client components ----------------
let hydrationCounter = 0;
function wrapClientComponents(
  element: any,
  allClientComponents: any[] = []
): any {
  if (!element || typeof element !== "object") return element;
  const type = element.type;
  const filePath = type?.__filePath;
  const isClient =
    filePath &&
    (isClientComponent(filePath) || fileContainsClientComponent(filePath));

  if (isClient) {
    const routeMatch = filePath.match(/\/routes(.*)$/);
    const routePath = routeMatch ? routeMatch[1] : filePath;
    const instanceKey = `${routePath.replace(
      /\//g,
      "-"
    )}-${hydrationCounter++}`;

    allClientComponents.push({
      filePath,
      instanceKey,
      props: element.props,
    });

    return React.createElement(
      "div",
      {
        id: `hydrate-${instanceKey}`,
        "data-client-component": instanceKey,
        suppressHydrationWarning: true,
      },
      element
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

// ---------------- Main render handler ----------------
process.on("message", async ({ file, url }: { file: string; url: string }) => {
  try {
    const allClientComponents: {
      filePath: string;
      instanceKey: string;
      props: any;
    }[] = [];

    // preload page module
    preloadModule(file);

    // discover layouts
    const layoutPaths = await findLayoutComponents(
      file.replace("page.tsx", "")
    );
    for (const layoutPath of layoutPaths) preloadModule(layoutPath);

    // resolve page
    const pageModule = preloadedModules.get(file);
    const pageComponent = pageModule.default;
    let pageElement = await resolveComponent(pageComponent, {});

    // wrap with layouts
    for (const layoutPath of layoutPaths) {
      const LayoutModule = preloadedModules.get(layoutPath);
      const LayoutComp = LayoutModule.default;
      pageElement = await resolveComponent(LayoutComp, {
        children: pageElement,
      });
    }

    // wrap client components
    pageElement = wrapClientComponents(pageElement, allClientComponents);

    // render HTML
    const renderedHTML = renderToStaticMarkup(pageElement);
    let finalHTML = renderedHTML;

    // inject hydration bundles
    for (const comp of allClientComponents) {
      const bundle = await bundleClient(comp.filePath, comp.instanceKey);
      const propsJSON = JSON.stringify(comp.props || {});

      finalHTML += `
      <script type="module">
      ${bundle}
      (function() {
        const hydrationKey = "${comp.instanceKey}";
        const props = ${propsJSON};
        document.addEventListener("DOMContentLoaded", () => {
          const el = document.getElementById("hydrate-" + hydrationKey);
          const Comp = window.__components[hydrationKey]?.default;
          if (el && Comp) {
            window.ReactDOMClient.hydrateRoot(el, React.createElement(Comp, props));
          } else {
            console.warn("Hydration skipped: element or component not found for", hydrationKey);
          }
        });
      })();
      </script>`;
    }

    process.send?.({ type: "render", html: finalHTML, url });
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
