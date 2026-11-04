// frontend.child.worker.ts
import React from "react";
import fs from "fs";
import path from "path";
import { bundlePageClient } from "./bundler";
import {
  attachFilePaths,
  collectCss,
  findLayoutComponents,
  getImports,
  hydrationScript,
  injectBody,
  injectHead,
  isClientComponent,
  renderPageTree,
  serializeProps,
} from "./renderer";
import type { RouteParams } from "./routeResolver";

export {
  attachFilePaths,
  collectCss,
  findLayoutComponents,
  getImports,
  isClientComponent,
  renderAndWrap,
  serializeProps,
  renderPageTree,
  clientIdFor,
} from "./renderer";

console.log(`[CHILD ${process.pid}] Booting SSR child worker`);

// CSS imports are collected separately; server require must ignore them.
(require as any).extensions[".css"] = () => {};

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

    preloadModule(file);

    const layoutPaths = await findLayoutComponents(
      file.replace("page.tsx", "")
    );
    for (const layoutPath of layoutPaths) preloadModule(layoutPath);

    const pageModule = preloadedModules.get(file);
    const layoutModules = layoutPaths.map(
      (layoutPath) => preloadedModules.get(layoutPath).default
    );

    const { html, instances } = await renderPageTree(
      pageModule.default,
      layoutModules,
      params
    );
    let finalHTML = html;

    if (cachedBundle === null) {
      const components = new Map<string, string>();
      for (const instance of instances) {
        if (!components.has(instance.id)) {
          components.set(instance.id, path.resolve(process.cwd(), instance.id));
        }
      }
      cachedBundle = await bundlePageClient(
        [...components].map(([id, filePath]) => ({ id, filePath }))
      );
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

    finalHTML = injectHead(
      finalHTML,
      cachedStyle ? `<style>${cachedStyle}</style>` : ""
    );

    if (bundle.js) {
      const scripts =
        `<script type="module">${bundle.js}</script>` +
        hydrationScript(instances);
      finalHTML = injectBody(finalHTML, scripts);
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
