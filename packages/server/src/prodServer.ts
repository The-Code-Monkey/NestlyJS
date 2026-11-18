import cluster from "cluster";
import http from "http";
import os from "os";
import fs from "fs";
import path from "path";
import { matchManifestSegments } from "./prodRouter";
import { serveClientAsset, serveStaticAsset } from "./staticAssets";
import { renderPageTree } from "./renderer";
import { renderPageDocument } from "./pageDocument";
import type { Manifest, ManifestRoute } from "./manifest";
import { HtmlCache } from "./htmlCache";
import { RequestBodyError, readRequestBody } from "./requestBody";
import {
  decideRequest,
  notFoundResponse,
  type RequestDecision,
} from "./requestPipeline";

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
    const decision = decideRequest(urlPath, method, (request) => {
      const matched = matchManifestSegments(manifest, request.segments);
      if (!matched) return null;
      return {
        route: matched.route,
        params: matched.params,
        hasPage: !!matched.route.page,
        hasApi: !!matched.route.api,
      };
    });

    await executeProdDecision(
      req,
      res,
      decision,
      outDir,
      loadModule,
      htmlCache
    );
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

export async function executeProdDecision(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  decision: RequestDecision<ManifestRoute>,
  outDir: string,
  loadModule: ModuleLoader,
  htmlCache = new HtmlCache(0)
) {
  switch (decision.kind) {
    case "clientAsset":
      serveClientAsset(req, res, decision.assetSegments);
      return;

    case "staticAsset":
      serveStaticAsset(req, res, decision.segments);
      return;

    case "page": {
      const route = decision.route;
      const cacheKey = decision.path;
      const cached = htmlCache.get(cacheKey);
      if (cached !== undefined) {
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(cached);
        return;
      }

      const serverModule = loadModule(path.join(outDir, route.page!.entry));
      const { html, instances } = await renderPageTree(
        serverModule.page,
        serverModule.layouts,
        decision.params
      );

      const document = renderPageDocument(
        { html, instances },
        {
          head: route.page!.style
            ? `<link rel="stylesheet" href="${route.page!.style}">`
            : "",
          body: route.page!.script
            ? `<script type="module" src="${route.page!.script}"></script>`
            : "",
        }
      );

      htmlCache.set(cacheKey, document);
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(document);
      return;
    }

    case "api": {
      const route = decision.route;
      const apiModule = loadModule(path.join(outDir, route.api!.entry));
      const handler = apiModule[decision.method];

      if (typeof handler !== "function") {
        const notFound = notFoundResponse(decision.method);
        res.writeHead(notFound.status);
        res.end(notFound.body);
        return;
      }

      const body = await readRequestBody(req);
      const result = await handler({
        method: decision.method,
        url: decision.url,
        headers: req.headers,
        body,
        params: decision.params,
      });
      if (!result) throw new Error("API handler did not return a result");

      res.writeHead(result.status || 200, {
        "Content-Type": "application/json",
      });
      res.end(JSON.stringify(result.body));
      return;
    }

    case "notFound": {
      const notFound = notFoundResponse(decision.method);
      res.writeHead(notFound.status);
      res.end(notFound.body);
      return;
    }
  }
}

export function start({
  port = 3000,
  host,
  totalWorkers,
}: { port?: number; host?: string; totalWorkers?: number } = {}) {
  const numWorkers = totalWorkers || os.cpus().length;
  const outDir = path.join(process.cwd(), ".nestly");

  if (cluster.isPrimary) {
    if (!fs.existsSync(path.join(outDir, "manifest.json"))) {
      console.error(
        `[PROD MASTER] No build found in ${outDir}. Run "nestly build" first.`
      );
      process.exit(1);
      return;
    }

    console.log(`[PROD MASTER] Master ${process.pid} running`);

    const forkWorker = () => {
      const worker = cluster.fork({ PORT: port.toString() });
      worker?.on?.("error", (err: NodeJS.ErrnoException) => {
        if (err.code !== "EPIPE") {
          console.error(`[PROD MASTER] Worker error:`, err);
        }
      });
      return worker;
    };

    for (let index = 0; index < numWorkers; index++) {
      forkWorker();
    }

    cluster.on("exit", (worker) => {
      console.log(
        `[PROD MASTER] Worker ${worker.process?.pid} died. Restarting...`
      );
      forkWorker();
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
