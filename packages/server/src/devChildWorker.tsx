// frontend.child.worker.ts
import fs from "fs";
import { bundleCssFiles, bundlePageClient } from "./bundler";
import { hmrClientScript } from "./hmr";
import {
  attachFilePaths,
  hydrationScript,
  injectBody,
  injectHead,
  renderPageTree,
} from "./renderer";
import {
  clientIdFor,
  getImports,
  getPageGraph,
  type PageGraph,
} from "./pageGraph";
import type { RouteParams } from "./routeResolver";

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
let cachedGraph: PageGraph | null = null;

export async function renderPage(
  file: string,
  url: string,
  params: RouteParams = {}
): Promise<string> {
  try {
    if (cachedHtml !== null) return cachedHtml;

    preloadModule(file);

    const graph = (cachedGraph ??= getPageGraph(file));
    for (const layoutPath of graph.layouts) preloadModule(layoutPath);

    const pageModule = preloadedModules.get(file);
    const layoutModules = graph.layouts.map(
      (layoutPath) => preloadedModules.get(layoutPath).default
    );

    const { html, instances } = await renderPageTree(
      pageModule.default,
      layoutModules,
      params
    );
    let finalHTML = html;

    if (cachedBundle === null) {
      cachedBundle = await bundlePageClient(
        graph.clientFiles.map((filePath) => ({
          id: clientIdFor(filePath),
          filePath,
        }))
      );
    }
    const bundle = cachedBundle;

    if (cachedStyle === null) {
      cachedStyle = await bundleCssFiles(graph.cssFiles);
    }

    finalHTML = injectHead(
      finalHTML,
      cachedStyle ? `<style data-nestly-style>${cachedStyle}</style>` : ""
    );

    const scripts =
      (bundle.js
        ? `<script type="module">${bundle.runtime}${bundle.js}</script>` +
          hydrationScript(instances)
        : "") + hmrClientScript;
    finalHTML = injectBody(finalHTML, scripts);

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
