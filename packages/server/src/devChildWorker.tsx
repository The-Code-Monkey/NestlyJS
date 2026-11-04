// frontend.child.worker.ts
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import path from "path";
import fs from "fs";
import { bundlePageClient } from "./bundler";
import type { RouteParams } from "./routeResolver";

console.log(`[CHILD ${process.pid}] Booting SSR child worker`);

// CSS imports are collected separately; server require must ignore them.
(require as any).extensions[".css"] = () => {};

// ---------------- Helpers ----------------
export function isClientComponent(filePath: string) {
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

export function serializeProps(props: any) {
  return JSON.stringify(props || {}).replace(/</g, "\\u003c");
}

export function attachFilePaths(mod: any, filePath: string) {
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

export function getImports(filePath: string): string[] {
  try {
    const src = fs.readFileSync(filePath, "utf8");
    const importRegex =
      /import\s+(?:[\s\S]+?\s+from\s+)?['"]([^'"]+)['"]/g;
    const imports: string[] = [];
    let match;
    while ((match = importRegex.exec(src))) {
      const raw = match[1];
      if (raw.startsWith(".")) {
        const resolved = path.resolve(path.dirname(filePath), raw);
        const extResolved =
          fs.existsSync(resolved) && fs.statSync(resolved).isFile()
            ? resolved
            : [".tsx", ".ts", ".jsx", ".js", ".css"]
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

export const preloadedModules = new Map<string, any>();
export function preloadModule(filePath: string) {
  if (filePath.endsWith(".css")) return null;
  if (preloadedModules.has(filePath)) return preloadedModules.get(filePath);
  if (!fs.existsSync(filePath)) return null;
  const mod = attachFilePaths(require(filePath), filePath);
  preloadedModules.set(filePath, mod);
  for (const imp of getImports(filePath)) preloadModule(imp);
  return mod;
}

export function collectCss(
  filePath: string,
  seen = new Set<string>()
): string[] {
  if (!filePath || seen.has(filePath)) return [];
  seen.add(filePath);
  if (filePath.endsWith(".css")) return [filePath];
  if (isClientComponent(filePath)) return [];
  return getImports(filePath).flatMap((imp) => collectCss(imp, seen));
}

// ---------------- Layout discovery ----------------
export async function findLayoutComponents(urlPath: string) {
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

// ---------------- Render and wrap client components ----------------
let hydrationCounter = 0;

// Server components run here so client children become visible as elements.
// Client components stay as elements for renderToStaticMarkup and hydration.
export async function renderAndWrap(
  element: any,
  allClientComponents: any[] = []
): Promise<any> {
  if (!element || typeof element !== "object") return element;
  if (Array.isArray(element)) {
    return Promise.all(
      element.map(async (child, index) => {
        const output = await renderAndWrap(child, allClientComponents);
        if (React.isValidElement(output) && output.key == null) {
          return React.cloneElement(output, { key: index });
        }
        return output;
      })
    );
  }

  const type = element.type;
  const filePath = type?.__filePath;

  if (typeof type === "function" && filePath && isClientComponent(filePath)) {
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
        key: element.key,
        id: `hydrate-${instanceKey}`,
        "data-client-component": instanceKey,
        suppressHydrationWarning: true,
      },
      element
    );
  }

  if (typeof type === "function") {
    const isAsync = type.constructor?.name === "AsyncFunction";
    const output = isAsync
      ? await type(element.props)
      : type(element.props);
    return renderAndWrap(output, allClientComponents);
  }

  if (element.props?.children) {
    const children = await renderAndWrap(
      React.Children.toArray(element.props.children),
      allClientComponents
    );
    return React.cloneElement(element, element.props, children);
  }

  return element;
}

// ---------------- Caches ----------------
// One child handles one URL, so per-process caches are per-page.
let cachedHtml: string | null = null;
let cachedBundle: Awaited<ReturnType<typeof bundlePageClient>> | null = null;
let cachedStyle: string | null = null;

export async function renderPage(
  file: string,
  url: string,
  params: RouteParams = {}
): Promise<string> {
  try {
    if (cachedHtml !== null) return cachedHtml;

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

    // build element tree, then render server components and wrap client ones
    const pageModule = preloadedModules.get(file);
    let pageElement: any = React.createElement(pageModule.default, { params });

    for (const layoutPath of layoutPaths) {
      const LayoutModule = preloadedModules.get(layoutPath);
      const LayoutComp = LayoutModule.default;
      pageElement = React.createElement(LayoutComp, { children: pageElement });
    }

    pageElement = await renderAndWrap(pageElement, allClientComponents);

    // render HTML
    const renderedHTML = renderToStaticMarkup(pageElement);
    let finalHTML = renderedHTML;

    // one bundle per page, so shared dependencies load once
    if (cachedBundle === null) {
      cachedBundle = await bundlePageClient(allClientComponents);
    }
    const bundle = cachedBundle;

    if (cachedStyle === null) {
      const seenCss = new Set<string>();
      const serverCss = [
        ...layoutPaths.flatMap((layoutPath) => collectCss(layoutPath)),
        ...collectCss(file),
      ]
        .filter((cssFile) => !seenCss.has(cssFile) && seenCss.add(cssFile))
        .map((cssFile) => fs.readFileSync(cssFile, "utf8"))
        .join("\n");

      cachedStyle = [serverCss, bundle.css].filter(Boolean).join("\n");
    }

    if (cachedStyle) {
      const styleTag = `<style>${cachedStyle}</style>`;
      finalHTML = finalHTML.includes("</head>")
        ? finalHTML.replace("</head>", `${styleTag}</head>`)
        : styleTag + finalHTML;
    }

    if (bundle.js) {
      const instances = allClientComponents.map((comp) => ({
        key: comp.instanceKey,
        props: comp.props,
      }));

      finalHTML += `
      <script type="module">
      ${bundle.js}
      </script>
      <script>
      (function() {
        const instances = ${serializeProps(instances)};
        document.addEventListener("DOMContentLoaded", () => {
          for (const { key, props } of instances) {
            const el = document.getElementById("hydrate-" + key);
            const Comp = window.__components[key]?.default;
            if (el && Comp) {
              window.ReactDOMClient.hydrateRoot(el, window.React.createElement(Comp, props));
            } else {
              console.warn("Hydration skipped: element or component not found for", key);
            }
          }
        });
      })();
      </script>`;
    }

    cachedHtml = finalHTML;
    console.log(`[CHILD ${process.pid}] Rendered page for ${url}`);
    return finalHTML;
  } catch (err) {
    console.error(`[CHILD ${process.pid}] Error rendering page:`, err);
    return "<h1>Error rendering page</h1>";
  }
}

export async function handleMessage(
  {
    file,
    url,
    params,
  }: { file: string; url: string; params?: RouteParams },
  send: (msg: any) => void = process.send?.bind(process) ?? (() => {})
) {
  send({ type: "render", html: await renderPage(file, url, params), url });
}

/* v8 ignore start */
if (require.main === module) {
  process.on("message", (msg: any) => {
    void handleMessage(msg);
  });
}
/* v8 ignore stop */
