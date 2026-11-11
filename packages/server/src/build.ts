import fs from "fs";
import path from "path";
import crypto from "crypto";
import { build } from "esbuild";
import { bundleCssFiles } from "./bundler";
import { clientIdFor, getPageGraph } from "./pageGraph";
import { classifySegment } from "./routePatterns";
import type {
  ApiAssets,
  Manifest,
  ManifestRoute,
  PageAssets,
  PatternSegment,
} from "./manifest";

interface RouteDir {
  dir: string;
  pattern: PatternSegment[];
  pageFile?: string;
  apiFile?: string;
}

function collectRouteDirs(
  dir: string,
  pattern: PatternSegment[],
  routes: RouteDir[] = []
): RouteDir[] {
  if (!fs.existsSync(dir)) return routes;

  const pageFile = path.join(dir, "page.tsx");
  const apiFile = path.join(dir, "api.ts");
  const hasPage = fs.existsSync(pageFile);
  const hasApi = fs.existsSync(apiFile);

  if (hasPage || hasApi) {
    routes.push({
      dir,
      pattern,
      pageFile: hasPage ? pageFile : undefined,
      apiFile: hasApi ? apiFile : undefined,
    });
  }

  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const child = path.join(dir, entry.name);
    const info = classifySegment(entry.name);

    if (info.kind === "group") {
      collectRouteDirs(child, pattern, routes);
    } else if (info.kind === "static") {
      collectRouteDirs(
        child,
        [...pattern, { kind: "static", value: entry.name }],
        routes
      );
    } else if (info.kind === "dynamic") {
      collectRouteDirs(
        child,
        [...pattern, { kind: "dynamic", name: info.name! }],
        routes
      );
    } else if (info.kind === "catchAll") {
      collectRouteDirs(
        child,
        [...pattern, { kind: "catchAll", name: info.name! }],
        routes
      );
    } else {
      collectRouteDirs(
        child,
        [...pattern, { kind: "optionalCatchAll", name: info.name! }],
        routes
      );
    }
  }

  return routes;
}

function generateServerEntry(
  pageFile: string,
  layoutFiles: string[],
  clientFiles: string[]
) {
  const imports = [
    `import * as __page from ${JSON.stringify(pageFile)};`,
    ...layoutFiles.map(
      (file, index) => `import * as __layout${index} from ${JSON.stringify(file)};`
    ),
    ...clientFiles.map(
      (file, index) => `import * as __client${index} from ${JSON.stringify(file)};`
    ),
  ].join("\n");

  const tags = clientFiles
    .map(
      (file, index) =>
        `__tag(__client${index}, ${JSON.stringify(clientIdFor(file))});`
    )
    .join("\n");

  return `${imports}
type AnyModule = Record<string, any>;
const __tag = (mod: AnyModule, id: string) => {
  for (const value of Object.values(mod)) {
    if (typeof value === "function") (value as any).__clientId = id;
  }
};
${tags}
export const page = (__page as AnyModule).default;
export const layouts = [${layoutFiles
    .map((_file, index) => `(__layout${index} as AnyModule).default`)
    .join(", ")}];
`;
}

function generateClientEntry(clientFiles: string[], shimPath: string) {
  const imports = clientFiles
    .map(
      (file, index) => `import * as __client${index} from ${JSON.stringify(file)};`
    )
    .join("\n");

  const registrations = clientFiles
    .map(
      (file, index) =>
        `(window as any).__components[${JSON.stringify(clientIdFor(file))}] = { default: (__client${index} as any)?.default ?? __client${index} };`
    )
    .join("\n");

  return `import ${JSON.stringify(shimPath)};
${imports}
(window as any).__components = (window as any).__components || {};
${registrations}
`;
}

function hashContent(content: string) {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 10);
}

export async function buildApp(): Promise<Manifest> {
  const appRoot = process.cwd();
  const outDir = path.join(appRoot, ".nestly");
  const serverDir = path.join(outDir, "server");
  const clientDir = path.join(outDir, "client");
  const genDir = path.join(outDir, ".gen");

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(serverDir, { recursive: true });
  fs.mkdirSync(clientDir, { recursive: true });
  fs.mkdirSync(genDir, { recursive: true });

  const routeDirs = collectRouteDirs(path.join(appRoot, "routes"), []);
  const routes: ManifestRoute[] = [];
  const serverEntries: Record<string, string> = {};
  const clientEntries: { pageIndex: number; contents: string }[] = [];
  const styleEntries: {
    pageIndex: number;
    cssFiles: string[];
  }[] = [];
  let pageIndex = 0;
  let apiIndex = 0;

  for (const route of routeDirs) {
    const manifestRoute: ManifestRoute = { pattern: route.pattern };

    if (route.pageFile) {
      const index = pageIndex++;
      const graph = getPageGraph(route.pageFile);
      const layoutFiles = graph.layouts;
      const clientList = graph.clientFiles;

      const serverEntry = path.join(genDir, `page-${index}.ts`);
      fs.writeFileSync(
        serverEntry,
        generateServerEntry(route.pageFile, layoutFiles, clientList)
      );
      serverEntries[`page-${index}`] = serverEntry;

      const page: PageAssets = { entry: `server/page-${index}.js` };
      if (clientList.length > 0) {
        const clientEntry = path.join(genDir, `client-${index}.ts`);
        fs.writeFileSync(
          clientEntry,
          generateClientEntry(
            clientList,
            path.resolve(__dirname, "shim.js")
          )
        );
        clientEntries.push({ pageIndex: index, contents: clientEntry });
      }

      if (graph.cssFiles.length > 0) {
        styleEntries.push({ pageIndex: index, cssFiles: graph.cssFiles });
      }

      manifestRoute.page = page;
      routes.push(manifestRoute);
    }

    if (route.apiFile) {
      const index = apiIndex++;
      serverEntries[`api-${index}`] = route.apiFile;
      const api: ApiAssets = { entry: `server/api-${index}.js` };
      manifestRoute.api = api;
      if (!route.pageFile) routes.push(manifestRoute);
    }
  }

  if (Object.keys(serverEntries).length > 0) {
    await build({
      entryPoints: serverEntries,
      outdir: serverDir,
      entryNames: "[name]",
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "node20",
      jsx: "automatic",
      write: true,
      logLevel: "silent",
      loader: { ".css": "empty" },
      external: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "react-dom/server",
        "react-dom/client",
      ],
    });
  }

  if (clientEntries.length > 0) {
    await build({
      entryPoints: Object.fromEntries(
        clientEntries.map((entry) => [
          `client-${entry.pageIndex}`,
          entry.contents,
        ])
      ),
      outdir: clientDir,
      entryNames: "[name]-[hash]",
      chunkNames: "common-[hash]",
      bundle: true,
      splitting: true,
      platform: "browser",
      format: "esm",
      target: "es2022",
      jsx: "automatic",
      write: true,
      logLevel: "silent",
      minify: true,
      loader: { ".css": "empty" },
    });
  }

  for (const styleEntry of styleEntries) {
    const css = await bundleCssFiles(styleEntry.cssFiles);
    const filename = `style-${styleEntry.pageIndex}-${hashContent(css)}.css`;
    fs.writeFileSync(path.join(clientDir, filename), css);

    const route = routes.find(
      (candidate) =>
        candidate.page?.entry === `server/page-${styleEntry.pageIndex}.js`
    );
    if (route?.page) route.page.style = `/_nestly/client/${filename}`;
  }

  for (const entry of clientEntries) {
    const prefix = `client-${entry.pageIndex}-`;
    const file = fs
      .readdirSync(clientDir)
      .find((name) => name.startsWith(prefix) && name.endsWith(".js"))!;
    const route = routes.find(
      (candidate) =>
        candidate.page?.entry === `server/page-${entry.pageIndex}.js`
    );
    if (route?.page) route.page.script = `/_nestly/client/${file}`;
  }

  const manifest: Manifest = { routes };
  fs.writeFileSync(
    path.join(outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
  fs.rmSync(genDir, { recursive: true, force: true });

  return manifest;
}
