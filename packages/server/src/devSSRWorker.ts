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
}

const DEV_TSCONFIG = path.resolve(__dirname, "..", "tsconfig.devServer.json");
const DEV_COMPILER_OPTIONS = JSON.parse(
  fs.readFileSync(DEV_TSCONFIG, "utf8")
).compilerOptions;

/**
 * ts-node resolves its default `node_modules` ignore against the tsconfig's
 * directory. An installed package's tsconfig lives inside node_modules, so
 * every app dependency resolves to a `../../` path that the default ignore no
 * longer matches, and ts-node then tries to require ESM-only dependencies as
 * CommonJS. Skipping the project keeps the same compiler options but makes the
 * ignore base the app root, so only the app's own files are compiled.
 */
function forkPageChild(): ChildLike {
  return fork(path.resolve(__dirname, "devChildWorker.js"), {
    execArgv: ["-r", "ts-node/register"],
    env: {
      ...process.env,
      TS_NODE_SKIP_PROJECT: "true",
      TS_NODE_COMPILER_OPTIONS: JSON.stringify(DEV_COMPILER_OPTIONS),
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
