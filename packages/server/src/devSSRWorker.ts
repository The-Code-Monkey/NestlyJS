// devSSRWorker.ts
import http from "http";
import { fork } from "child_process";
import path from "path";
import chokidar from "chokidar";
import type { RouteParams } from "./routePatterns";
import { createSupervisor, type ChildLike } from "./supervisedChild";

export interface PageRequest {
  pageFile: string;
  url: string;
  params: RouteParams;
}

interface RenderReply {
  html: string;
  url: string;
}

function forkPageChild(): ChildLike {
  return fork(path.resolve(__dirname, "devChildWorker.js"), {
    execArgv: ["-r", "ts-node/register"],
    env: {
      ...process.env,
      TS_NODE_PROJECT: path.resolve(__dirname, "..", "tsconfig.devServer.json"),
    },
  }) as ChildLike;
}

const supervisor = createSupervisor<http.ServerResponse, RenderReply>({
  fork: forkPageChild,
  failure: "SSR Worker crashed",
  interpret(_key, message: any) {
    if (message?.type === "render" && message.url) {
      return { html: message.html, url: message.url };
    }
    return null;
  },
  complete(res, reply) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(reply.html);
    console.log(`[SSR WORKER] Responded for ${reply.url}`);
  },
  fail(res, reason) {
    res.writeHead(500);
    res.end(reason);
  },
  onExit(key, code, signal) {
    console.warn(
      `[SSR WORKER] Child for ${key} exited (code=${code}, signal=${signal})`
    );
  },
});

// Full reload: any route file change restarts page children, invalidating caches.
const ROUTES_DIR = path.join(process.cwd(), "routes");
chokidar.watch(ROUTES_DIR, { ignoreInitial: true }).on("all", () => {
  supervisor.killAll();
});

export async function devSSRHandler(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  request: PageRequest
) {
  supervisor.request(
    request.url,
    {
      file: request.pageFile,
      url: request.url,
      params: request.params,
    },
    res
  );
}
