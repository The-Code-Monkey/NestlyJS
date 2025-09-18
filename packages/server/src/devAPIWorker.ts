import { fork, ChildProcess } from "child_process";
import { getAPIMethod, getRouteFiles } from "./routeResolver";
import fs from "fs";
import http from "http";

const activeChildren: Map<string, ChildProcess> = new Map();

export default function createAPIWorker(server: http.Server) {
  console.log(`[API WORKER ${process.pid}] Initializing`);

  server.on("request", (req, res) => {
    const urlPath = req.url || "/";
    const method = req.method?.toUpperCase() || "GET";

    console.log(`[API WORKER ${process.pid}] Request: ${method} ${urlPath}`);

    const apiFunc = getAPIMethod(urlPath, method);
    const { apiFile } = getRouteFiles(urlPath);

    if (!apiFunc) {
      console.log(
        `[API WORKER ${process.pid}] No API route found for ${method} ${urlPath}`
      );
      res.writeHead(404);
      res.end("API route not found");
      return;
    }

    const key = `${urlPath}-${method}`;

    if (activeChildren.has(key)) {
      const old = activeChildren.get(key)!;
      old.kill();
      activeChildren.delete(key);
    }

    const child = fork(require.resolve("./devAPIChild.js"));
    activeChildren.set(key, child);
    console.log(`[API WORKER ${process.pid}] Forked child for ${key}`);

    child.send({
      file: apiFile,
      method,
      url: req.url,
      headers: req.headers,
      body: {}, // extend to parse JSON bodies if needed
    });

    child.on("message", (data: { status: number; body: any }) => {
      console.log(`[API WORKER ${process.pid}] Child response for ${key}`);
      res.writeHead(data.status || 200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data.body));
    });

    child.on("error", (err) => {
      console.error(`[API WORKER ${process.pid}] Child error`, err);
      res.writeHead(500);
      res.end("Internal Server Error");
    });

    fs.watch(apiFile, (event) => {
      if (event === "change") {
        console.log(
          `[API WORKER ${process.pid}] Detected change in ${apiFile}, killing child`
        );
        if (activeChildren.has(key)) {
          const old = activeChildren.get(key)!;
          old.kill();
          activeChildren.delete(key);
        }
      }
    });
  });
}
