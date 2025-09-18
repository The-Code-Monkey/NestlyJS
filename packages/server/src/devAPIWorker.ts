import http from "http";
import { fork, ChildProcess } from "child_process";
import { getAPIMethod, getRouteFiles } from "./routeResolver";
import fs from "fs";
import path from "path";

const activeChildren: Map<string, ChildProcess> = new Map();

export default function createAPIWorker(server: http.Server) {
  console.log(`[API WORKER ${process.pid}] Initializing`);

  const forkChild = (urlPath: string, method: string) => {
    const { apiFile } = getRouteFiles(urlPath);
    if (!fs.existsSync(apiFile)) return;

    const key = `${method}:${urlPath}`;
    if (activeChildren.has(key)) {
      const old = activeChildren.get(key)!;
      old.kill();
      activeChildren.delete(key);
    }

    const childPath = path.resolve(__dirname, "devAPIChild.js");
    const child = fork(childPath, { execArgv: ["-r", "ts-node/register"] });
    activeChildren.set(key, child);
    console.log(
      `[API WORKER ${process.pid}] Forked child PID: ${child.pid} for ${method} ${urlPath}`
    );

    child.on("error", (err) =>
      console.error(`[API WORKER ${process.pid}] Child error`, err)
    );

    fs.watch(apiFile, (event) => {
      if (event === "change") {
        console.log(
          `[API WORKER ${process.pid}] Detected change in ${apiFile}`
        );
        forkChild(urlPath, method);
      }
    });

    return child;
  };

  server.on("request", (req, res) => {
    const urlPath = req.url || "/";
    const method = req.method?.toUpperCase() || "GET";
    console.log(`[API WORKER ${process.pid}] Request: ${method} ${urlPath}`);

    const apiFunc = getAPIMethod(urlPath, method);
    if (!apiFunc) {
      res.writeHead(404);
      res.end("API route not found");
      return;
    }

    const key = `${method}:${urlPath}`;
    if (!activeChildren.has(key)) forkChild(urlPath, method);
    const child = activeChildren.get(key)!;

    const onReady = (msg: any) => {
      if (msg?.type === "ready") {
        child.send({
          file: getRouteFiles(urlPath).apiFile,
          method,
          url: req.url,
        });
        child.off("message", onReady);
      }
    };

    child.on("message", onReady);

    child.on("message", (msg: any) => {
      if (msg?.type === "apiResponse") {
        res.writeHead(msg.status || 200, {
          "Content-Type": "application/json",
        });
        res.end(JSON.stringify(msg.body));
        console.log(
          `[API WORKER ${process.pid}] Responded for ${method} ${urlPath}`
        );
      }
    });
  });
}
