// devSSRWorker.ts
import http from "http";
import { fork, ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import { getRouteFiles, hasPageForGET } from "./routeResolver";
import chokidar from "chokidar";

const PAGE_CHILDREN: Map<string, ChildProcess> = new Map();
const PENDING_REQUESTS: Map<string, http.ServerResponse[]> = new Map();

export async function devSSRHandler(
  req: http.IncomingMessage,
  res: http.ServerResponse
) {
  const urlPath = req.url || "/";
  const method = req.method?.toUpperCase() || "GET";

  if (method !== "GET" || !hasPageForGET(urlPath)) {
    res.writeHead(404);
    res.end("Page not found");
    return;
  }

  const { pageFile } = getRouteFiles(urlPath);
  const childPath = path.resolve(__dirname, "devChildWorker.js");

  // ----------------------------
  // Ensure page child exists
  // ----------------------------
  if (!PAGE_CHILDREN.has(urlPath)) {
    const child = fork(childPath, {
      execArgv: ["-r", "ts-node/register"],
      env: {
        ...process.env,
        TS_NODE_PROJECT: path.resolve(
          __dirname,
          "..",
          "tsconfig.devServer.json"
        ),
      },
    });

    PAGE_CHILDREN.set(urlPath, child);
    PENDING_REQUESTS.set(urlPath, []);

    // Watch page for hot reload
    chokidar.watch(pageFile).on("change", () => {
      console.log(`[SSR WORKER] Hot reload triggered for ${pageFile}`);
      child.kill();
      PAGE_CHILDREN.delete(urlPath);
    });

    child.on("message", (msg: any) => {
      if (msg.type === "render" && msg.url) {
        const pending = PENDING_REQUESTS.get(msg.url) || [];
        pending.forEach((r) => {
          r.writeHead(200, { "Content-Type": "text/html" });
          r.end(msg.html);
        });
        PENDING_REQUESTS.set(msg.url, []);
        console.log(`[SSR WORKER] Responded for ${msg.url}`);
      }
    });

    child.on("exit", (code, signal) => {
      console.warn(
        `[SSR WORKER] Child for ${urlPath} exited (code=${code}, signal=${signal})`
      );
      const pending = PENDING_REQUESTS.get(urlPath) || [];
      pending.forEach((r) => {
        r.writeHead(500);
        r.end("SSR Worker crashed");
      });
      PENDING_REQUESTS.set(urlPath, []);
      PAGE_CHILDREN.delete(urlPath);
    });
  }

  // ----------------------------
  // Queue request and send to child
  // ----------------------------
  PENDING_REQUESTS.get(urlPath)!.push(res);
  PAGE_CHILDREN.get(urlPath)!.send({ file: pageFile, url: urlPath });
}
