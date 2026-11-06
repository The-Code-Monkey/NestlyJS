import cluster from "cluster";
import http from "http";
import os from "os";
import fs from "fs";
import path from "path";
import { matchManifestRoute } from "./prodRouter";
import {
  isStaticAssetPath,
  serveClientAsset,
  serveStaticAsset,
} from "./staticAssets";
import {
  hydrationScript,
  injectBody,
  injectHead,
  renderPageTree,
} from "./renderer";
import type { Manifest } from "./manifest";
import { HtmlCache } from "./htmlCache";
import { RequestBodyError, readRequestBody } from "./requestBody";

const CLIENT_PREFIX = "/_nestly/client/";

export function loadManifest(filePath: string): Manifest {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as Manifest;
}

export function createModuleLoader() {
  const cache = new Map<string, any>();
  return (filePath: string) => {
    if (!cache.has(filePath)) cache.set(filePath, require(filePath));
    return cache.get(filePath);
  };
}

type ModuleLoader = ReturnType<typeof createModuleLoader>;

export async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  manifest: Manifest,
  outDir: string,
  loadModule: ModuleLoader,
  htmlCache = new HtmlCache(0)
) {
  const urlPath = req.url || "/";
  const method = (req.method || "GET").toUpperCase();

  try {
    if (
      (method === "GET" || method === "HEAD") &&
      urlPath.startsWith(CLIENT_PREFIX)
    ) {
      serveClientAsset(req, res, urlPath.slice(CLIENT_PREFIX.length));
      return;
    }

    if (
      (method === "GET" || method === "HEAD") &&
      isStaticAssetPath(urlPath)
    ) {
      serveStaticAsset(req, res, urlPath);
      return;
    }

    const matched = matchManifestRoute(manifest, urlPath);

    if (method === "GET" && matched?.route.page) {
      const cacheKey = urlPath.split(/[?#]/)[0] || "/";
      const cached = htmlCache.get(cacheKey);
      if (cached !== undefined) {
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(cached);
        return;
      }

      const serverModule = loadModule(
        path.join(outDir, matched.route.page.entry)
      );
      const { html, instances } = await renderPageTree(
        serverModule.page,
        serverModule.layouts,
        matched.params
      );

      let document = html;
      if (matched.route.page.style) {
        document = injectHead(
          document,
          `<link rel="stylesheet" href="${matched.route.page.style}">`
        );
      }

      if (matched.route.page.script) {
        let scripts = `<script type="module" src="${matched.route.page.script}"></script>`;
        if (instances.length > 0) scripts += hydrationScript(instances);
        document = injectBody(document, scripts);
      }

      htmlCache.set(cacheKey, document);
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(document);
      return;
    }

    if (matched?.route.api) {
      const apiModule = loadModule(
        path.join(outDir, matched.route.api.entry)
      );
      const handler = apiModule[method];

      if (typeof handler === "function") {
        const body = await readRequestBody(req);
        const result = await handler({
          method,
          url: urlPath,
          headers: req.headers,
          body,
          params: matched.params,
        });
        if (!result) throw new Error("API handler did not return a result");

        res.writeHead(result.status || 200, {
          "Content-Type": "application/json",
        });
        res.end(JSON.stringify(result.body));
        return;
      }
    }

    res.writeHead(404);
    res.end(method === "GET" ? "Page not found" : "API route not found");
  } catch (err) {
    if (err instanceof RequestBodyError) {
      res.writeHead(err.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
      return;
    }
    console.error(`[PROD WORKER ${process.pid}] Error handling request:`, err);
    res.writeHead(500);
    res.end("Internal server error");
  }
}

export function start({
  port = 3000,
  host,
  totalWorkers,
}: { port?: number; host?: string; totalWorkers?: number } = {}) {
  const numWorkers = totalWorkers || os.cpus().length;

  if (cluster.isPrimary) {
    console.log(`[PROD MASTER] Master ${process.pid} running`);

    for (let index = 0; index < numWorkers; index++) {
      cluster.fork({ PORT: port.toString() });
    }

    cluster.on("exit", (worker) => {
      console.log(
        `[PROD MASTER] Worker ${worker.process?.pid} died. Restarting...`
      );
      cluster.fork({ PORT: port.toString() });
    });

    let shuttingDown = false;
    const shutdown = () => {
      if (shuttingDown) return;
      shuttingDown = true;
      cluster.removeAllListeners("exit");
      cluster.disconnect(() => process.exit(0));
      setTimeout(() => process.exit(1), 5000).unref();
    };
    process.once("SIGTERM", shutdown);
    process.once("SIGINT", shutdown);
    return;
  }

  const outDir = path.join(process.cwd(), ".nestly");
  let manifest: Manifest;
  try {
    manifest = loadManifest(path.join(outDir, "manifest.json"));
  } catch {
    console.error(
      `[PROD WORKER ${process.pid}] No build found in ${outDir}. Run "nestly build" first.`
    );
    process.exit(1);
    return;
  }
  const loadModule = createModuleLoader();
  const cacheSize = Number.parseInt(
    process.env.NESTLY_HTML_CACHE_SIZE ?? "100",
    10
  );
  const htmlCache = new HtmlCache(
    Number.isFinite(cacheSize) ? cacheSize : 100
  );

  const server = http.createServer((req, res) => {
    void handleRequest(req, res, manifest, outDir, loadModule, htmlCache);
  });

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

  server.listen(port, host, () => {
    console.log(
      `[PROD WORKER ${process.pid}] Listening on http://${host || "localhost"}:${port}`
    );
  });
}
