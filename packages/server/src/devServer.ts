// devServer.ts
import cluster from "cluster";
import fs from "fs";
import http from "http";
import os from "os";
import { devSSRHandler } from "./devSSRWorker";
import { devAPIHandler } from "./devAPIWorker";
import { resolveRouteSegments, type ResolvedRoute } from "./routeResolver";
import { serveClientAsset, serveStaticAsset } from "./staticAssets";
import {
  HMR_PATH,
  closeHmrClients,
  hmrHandler,
  startHmrWatcher,
} from "./hmr";
import {
  decideRequest,
  notFoundResponse,
  type RequestDecision,
  type RouteResolution,
} from "./requestPipeline";
import type { ParsedRequestPath } from "./requestPath";

function lookupDevRoute(
  request: ParsedRequestPath
): RouteResolution<ResolvedRoute> | null {
  const route = resolveRouteSegments(request.segments);
  if (!route) return null;

  return {
    route,
    params: route.params,
    hasPage: fs.existsSync(route.pageFile),
    hasApi: fs.existsSync(route.apiFile),
  };
}

export async function executeDevDecision(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  decision: RequestDecision<ResolvedRoute>
) {
  switch (decision.kind) {
    case "clientAsset":
      serveClientAsset(req, res, decision.assetSegments);
      return;

    case "staticAsset":
      serveStaticAsset(req, res, decision.segments);
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
}

export function start({
  port = 3000,
  host,
  totalWorkers,
}: { port?: number; host?: string; totalWorkers?: number } = {}) {
  const numWorkers = totalWorkers || os.cpus().length;

  if (cluster.isPrimary) {
    console.log(`[MASTER] Dev Master ${process.pid} running`);

    const forkWorker = () => {
      const worker = cluster.fork({ PORT: port.toString() });
      // A worker can lose its IPC channel before shutdown reaches it. Ignore
      // the resulting EPIPE instead of crashing the primary.
      worker?.on?.("error", (err: NodeJS.ErrnoException) => {
        if (err.code !== "EPIPE") {
          console.error(`[MASTER] Worker error:`, err);
        }
      });
      return worker;
    };

    // Fork workers
    for (let i = 0; i < numWorkers; i++) {
      forkWorker();
    }

    cluster.on("exit", (worker) => {
      console.log(`[MASTER] Worker ${worker.process?.pid} died. Restarting...`);
      forkWorker();
    });

    let shuttingDown = false;
    const shutdown = () => {
      if (shuttingDown) return;
      shuttingDown = true;
      cluster.removeAllListeners("exit");

      // Start worker cleanup before disconnect so that open HMR streams are
      // closed instead of holding the worker server open.
      for (const worker of Object.values(cluster.workers ?? {})) {
        try {
          worker?.send?.({ type: "shutdown" });
        } catch {
          // The worker may have lost its IPC channel already.
        }
      }

      cluster.disconnect(() => process.exit(0));
      setTimeout(() => process.exit(1), 5000).unref();
    };
    process.once("SIGTERM", shutdown);
    process.once("SIGINT", shutdown);
    return;
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

        const decision = decideRequest(urlPath, method, lookupDevRoute);
        await executeDevDecision(req, res, decision);
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

    let shuttingDown = false;
    const shutdown = () => {
      if (shuttingDown) return;
      shuttingDown = true;
      closeHmrClients();
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 5000).unref();
    };
    process.once("SIGTERM", shutdown);
    process.once("SIGINT", shutdown);
    process.once("disconnect", shutdown);
    process.once("message", (message: unknown) => {
      if ((message as { type?: string })?.type === "shutdown") shutdown();
    });
  }
}
