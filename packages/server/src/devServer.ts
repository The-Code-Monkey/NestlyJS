// devServer.ts
import cluster from "cluster";
import http from "http";
import os from "os";
import { devSSRHandler } from "./devSSRWorker";
import { devAPIHandler } from "./devAPIWorker";
import { hasPageForGET, getAPIMethod } from "./routeResolver";

export function start({
  port = 3000,
  totalWorkers,
}: { port?: number; totalWorkers?: number } = {}) {
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
    const server = http.createServer(async (req, res) => {
      const urlPath = req.url || "/";
      const method = (req.method || "GET").toUpperCase();

      try {
        // 1️⃣ GET request with page.tsx → SSR
        if (method === "GET" && hasPageForGET(urlPath)) {
          await devSSRHandler(req, res);
          return;
        }

        // 2️⃣ API check for any method
        const apiFunc = getAPIMethod(urlPath, method);
        if (apiFunc) {
          await devAPIHandler(req, res);
          return;
        }

        // 3️⃣ Not found
        if (method === "GET") {
          res.writeHead(404);
          res.end("Page not found or handled by API worker");
        } else {
          res.writeHead(404);
          res.end("API route not found");
        }
      } catch (err) {
        console.error(`[WORKER ${process.pid}] Error handling request:`, err);
        res.writeHead(500);
        res.end("Internal server error");
      }
    });

    server.listen(port, () => {
      console.log(
        `[WORKER ${process.pid}] Listening on http://localhost:${port}`
      );
    });
  }
}
