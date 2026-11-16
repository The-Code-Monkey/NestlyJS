// devAPIWorker.ts
import http from "http";
import { fork } from "child_process";
import { RequestBodyError, readRequestBody } from "./requestBody";
import fs from "fs";
import path from "path";
import type { RouteParams } from "./routePatterns";
import { notFoundResponse } from "./requestPipeline";
import { createSupervisor, type ChildLike } from "./supervisedChild";

export interface APIRequest {
  apiFile: string;
  method: string;
  url: string;
  params: RouteParams;
}

interface ApiReply {
  status: number;
  body: any;
  json: boolean;
}

function forkApiChild(): ChildLike {
  return fork(path.resolve(__dirname, "devAPIChild.js"), {
    execArgv: ["-r", "ts-node/register"],
  }) as ChildLike;
}

function methodFromKey(key: string) {
  return key.slice(0, key.indexOf(":"));
}

const supervisor = createSupervisor<http.ServerResponse, ApiReply>({
  fork: forkApiChild,
  failure: "API Worker crashed",
  interpret(key, message: any) {
    if (message?.type === "apiNotFound") {
      const notFound = notFoundResponse(methodFromKey(key));
      return { status: notFound.status, body: notFound.body, json: false };
    }
    if (message?.type === "apiResponse") {
      return {
        status: message.status || 200,
        body: message.body,
        json: true,
      };
    }
    return null;
  },
  complete(res, reply) {
    if (reply.json) {
      res.writeHead(reply.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(reply.body));
      return;
    }
    res.writeHead(reply.status);
    res.end(reply.body);
  },
  fail(res, reason) {
    // The client gets a generic message; the reason stays in the server log.
    console.error(`[API WORKER ${process.pid}] Failing a response: ${reason}`);
    res.writeHead(500);
    res.end("Internal server error");
  },
  onExit(key, code, signal) {
    console.warn(
      `[API WORKER ${process.pid}] Child for ${key} exited (code=${code}, signal=${signal})`
    );
  },
});

// One watcher per API file; killing the child lets the next request load it.
const WATCHED = new Set<string>();

function watchApiFile(key: string, apiFile: string) {
  if (WATCHED.has(key)) return;
  WATCHED.add(key);
  fs.watch(apiFile, (event) => {
    if (event === "change") {
      console.log(
        `[API WORKER ${process.pid}] Detected change in ${apiFile}, restarting child`
      );
      supervisor.kill(key);
    }
  });
}

export async function devAPIHandler(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  request: APIRequest
) {
  const urlPath = request.url;
  const method = request.method;

  console.log(`[API WORKER ${process.pid}] Request: ${method} ${urlPath}`);

  let body: unknown;
  try {
    body = await readRequestBody(req);
  } catch (err) {
    if (err instanceof RequestBodyError) {
      res.writeHead(err.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
      return;
    }
    throw err;
  }

  const key = `${method}:${urlPath}`;
  const apiFile = request.apiFile;

  if (!fs.existsSync(apiFile)) {
    res.writeHead(500);
    res.end("API file not found");
    return;
  }

  watchApiFile(key, apiFile);

  supervisor.request(
    key,
    {
      file: apiFile,
      method,
      url: urlPath,
      headers: req.headers,
      body,
      params: request.params,
    },
    res
  );
}
