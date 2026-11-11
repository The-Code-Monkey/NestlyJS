// devServer.ts
import cluster from "cluster";
import fs from "fs";
import http from "http";
import os from "os";
import { devSSRHandler } from "./devSSRWorker";
import { devAPIHandler } from "./devAPIWorker";
import { resolveRoute, type ResolvedRoute } from "./routeResolver";
import { serveClientAsset, serveStaticAsset } from "./staticAssets";
import { HMR_PATH, hmrHandler, startHmrWatcher } from "./hmr";
import {
  decideRequest,
  notFoundResponse,
  type RouteResolution,
} from "./requestPipeline";

function lookupDevRoute(
  path: string
): RouteResolution<ResolvedRoute> | null {
  const route = resolveRoute(path);
  if (!route) return null;

  return {
    route,
    params: route.params,
    hasPage: fs.existsSync(route.pageFile),
    hasApi: fs.existsSync(route.apiFile),
  };
}

export function start({
  port = 3000,
  host,
  totalWorkers,
}: { port?: number; host?: string; totalWorkers?: number } = {}) {
  const numWorkers = totalWorkers || os.cpus().length;

  if (cluster.isPrimary) {
    console.log(`[MASTER] Dev Master ${process.pid} running`);

    // Fork workers
    for (let i = 0; i < numWorkers; i++) {
      cluster.fork({ PORT: port.toString() });
    }

    cluster.on("exit", (worker) => {
      console.log(`[MASTER] Worker ${worker.process?.pid} died. Restarting...`);
      cluster.fork({ PORT: port.toString() });
    });
  } else {
    startHmrWatcher();

    const server = http.createServer(async (req, res) => {
      const urlPath = req.url || "/";
      const method = (req.method || "GET").toUpperCase();

      try {
        // Dev live-reload event stream
        if (method === "GET" && urlPath.split("?")[0] === HMR_PATH) {
          hmrHandler(req, res);
          return;
        }

        const decision = decideRequest(
          urlPath,
          method,
          lookupDevRoute
        );

        switch (decision.kind) {
          case "clientAsset":
            serveClientAsset(req, res, decision.assetPath);
            return;

          case "staticAsset":
            serveStaticAsset(req, res, decision.path);
            return;

          case "page":
            await devSSRHandler(req, res, {
              pageFile: decision.route.pageFile,
              url: decision.url,
              params: decision.params,
            });
            return;

          case "api":
            await devAPIHandler(req, res, {
              apiFile: decision.route.apiFile,
              method: decision.method,
              url: decision.url,
              params: decision.params,
            });
            return;

          case "notFound": {
            const notFound = notFoundResponse(decision.method);
            res.writeHead(notFound.status);
            res.end(notFound.body);
            return;
          }
        }
      } catch (err) {
        console.error(`[WORKER ${process.pid}] Error handling request:`, err);
        res.writeHead(500);
        res.end("Internal server error");
      }
    });

    server.listen(port, host, () => {
      console.log(
        `[WORKER ${process.pid}] Listening on http://${host || "localhost"}:${port}`
      );
    });
  }
}
