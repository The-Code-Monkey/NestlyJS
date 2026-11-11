// devAPIWorker.ts
import http from "http";
import { fork, ChildProcess } from "child_process";
import { RequestBodyError, readRequestBody } from "./requestBody";
import fs from "fs";
import path from "path";
import type { RouteParams } from "./routePatterns";
import { notFoundResponse } from "./requestPipeline";

export interface APIRequest {
  apiFile: string;
  method: string;
  url: string;
  params: RouteParams;
}

const ACTIVE_CHILDREN: Map<string, ChildProcess> = new Map();
const PENDING_REQUESTS: Map<string, http.ServerResponse[]> = new Map();

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

  // ----------------------------
  // Ensure child exists
  // ----------------------------
  if (!ACTIVE_CHILDREN.has(key)) {
    const childPath = path.resolve(__dirname, "devAPIChild.js");
    if (!fs.existsSync(apiFile)) {
      res.writeHead(500);
      res.end("API file not found");
      return;
    }

    const child = fork(childPath, { execArgv: ["-r", "ts-node/register"] });
    ACTIVE_CHILDREN.set(key, child);
    PENDING_REQUESTS.set(key, []);

    // Watch file for hot reload
    fs.watch(apiFile, (event) => {
      if (event === "change") {
        console.log(
          `[API WORKER ${process.pid}] Detected change in ${apiFile}, restarting child`
        );
        child.kill();
        ACTIVE_CHILDREN.delete(key);
      }
    });

    child.on("exit", (code, signal) => {
      console.warn(
        `[API WORKER ${process.pid}] Child for ${key} exited (code=${code}, signal=${signal})`
      );
      const pending = PENDING_REQUESTS.get(key) || [];
      pending.forEach((r) => {
        r.writeHead(500);
        r.end("API Worker crashed");
      });
      PENDING_REQUESTS.set(key, []);
      ACTIVE_CHILDREN.delete(key);
    });

    // Respond to messages from child
    child.on("message", (msg: any) => {
      if (msg?.type === "apiNotFound") {
        const pending = PENDING_REQUESTS.get(key) || [];
        const notFound = notFoundResponse(method);
        pending.forEach((r) => {
          r.writeHead(notFound.status);
          r.end(notFound.body);
        });
        PENDING_REQUESTS.set(key, []);
        return;
      }

      if (msg?.type === "apiResponse") {
        const pending = PENDING_REQUESTS.get(key) || [];
        pending.forEach((r) => {
          r.writeHead(msg.status || 200, {
            "Content-Type": "application/json",
          });
          r.end(JSON.stringify(msg.body));
        });
        PENDING_REQUESTS.set(key, []);
        console.log(
          `[API WORKER ${process.pid}] Responded for ${method} ${urlPath}`
        );
      }
    });
  }

  // ----------------------------
  // Queue request and send to child
  // ----------------------------
  PENDING_REQUESTS.get(key)!.push(res);
  ACTIVE_CHILDREN.get(key)!.send({
    file: apiFile,
    method,
    url: urlPath,
    headers: req.headers,
    body,
    params: request.params,
  });
}
