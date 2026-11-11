// devSSRWorker.ts
import http from "http";
import { fork, ChildProcess } from "child_process";
import path from "path";
import chokidar from "chokidar";
import type { RouteParams } from "./routePatterns";

export interface PageRequest {
  pageFile: string;
  url: string;
  params: RouteParams;
}

const PAGE_CHILDREN: Map<string, ChildProcess> = new Map();
const PENDING_REQUESTS: Map<string, http.ServerResponse[]> = new Map();

// Full reload: any route file change restarts page children, invalidating caches.
const ROUTES_DIR = path.join(process.cwd(), "routes");
chokidar.watch(ROUTES_DIR, { ignoreInitial: true }).on("all", () => {
  for (const child of PAGE_CHILDREN.values()) child.kill();
});

export async function devSSRHandler(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  request: PageRequest
) {
  const urlPath = request.url;
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
  PAGE_CHILDREN.get(urlPath)!.send({
    file: request.pageFile,
    url: urlPath,
    params: request.params,
  });
}
