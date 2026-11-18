// devSSRWorker.ts
import http from "http";
import fs from "fs";
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
  status: number;
}

const DEV_TSCONFIG = path.resolve(__dirname, "..", "tsconfig.devServer.json");
const TSX_CJS = require.resolve("tsx/cjs");
/**
 * tsx transpiles route source with esbuild, so the development child does not
 * depend on the TypeScript compiler API. The shipped tsconfig supplies the JSX
 * and module settings for apps that do not have their own.
 */
function forkPageChild(): ChildLike {
  return fork(path.resolve(__dirname, "devChildWorker.js"), {
    execArgv: ["-r", TSX_CJS],
    env: {
      ...process.env,
      TSX_TSCONFIG_PATH: DEV_TSCONFIG,
    },
  }) as ChildLike;
}

const supervisor = createSupervisor<http.ServerResponse, RenderReply>({
  fork: forkPageChild,
  failure: "SSR Worker crashed",
  interpret(_key, message: any) {
    if (message?.type === "render" && message.url) {
      return {
        html: message.html,
        url: message.url,
        status: typeof message.status === "number" ? message.status : 200,
      };
    }
    return null;
  },
  complete(res, reply) {
    res.writeHead(reply.status, { "Content-Type": "text/html" });
    res.end(reply.html);
    console.log(`[SSR WORKER] Responded for ${reply.url}`);
  },
  fail(res, reason) {
    // The client gets a generic message; the reason stays in the server log.
    console.error(`[SSR WORKER] Failing a response: ${reason}`);
    res.writeHead(500);
    res.end("Internal server error");
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
