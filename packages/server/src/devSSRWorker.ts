import http from "http";
import { fork, ChildProcess } from "child_process";
import { getRouteFiles, hasPageForGET } from "./routeResolver";
import fs from "fs";
import path from "path";

const activeChildren: Map<string, ChildProcess> = new Map();

export default function createSSRWorker(server: http.Server) {
  console.log(`[SSR WORKER ${process.pid}] Initializing`);

  const childPath = path.resolve(__dirname, "devChildWorker.js");

  // ----------------------------
  // PERSISTENT CHILD SETUP
  // ----------------------------
  const persistentChild: ChildProcess = fork(childPath, {
    execArgv: ["-r", "ts-node/register"],
    env: {
      ...process.env,
      TS_NODE_PROJECT: path.resolve(__dirname, "..", "tsconfig.devServer.json"),
    },
  });

  let persistentReady = false;

  // <--- QUEUE REQUESTS BEFORE PERSISTENT CHILD READY
  const requestQueue: {
    req: http.IncomingMessage;
    res: http.ServerResponse;
    url: string;
  }[] = [];

  persistentChild.on("message", (msg: any) => {
    if (msg.type === "ready") {
      console.log(`[SSR WORKER ${process.pid}] Persistent child READY`);
      persistentReady = true;

      // <--- FLUSH QUEUED REQUESTS
      requestQueue.forEach(({ req, res, url }) => handleRequest(req, res, url));
      requestQueue.length = 0;
    }

    // Handle render messages from persistent child
    if (msg.type === "render" && msg.url) {
      const queued = requestQueue.find((r) => r.url === msg.url);
      if (queued) {
        queued.res.writeHead(200, { "Content-Type": "text/html" });
        queued.res.end(msg.html);
        console.log(
          `[SSR WORKER ${process.pid}] Responded (queued) for ${msg.url}`
        );
        requestQueue.splice(requestQueue.indexOf(queued), 1);
      }
    }
  });

  // ----------------------------
  // REQUEST HANDLING
  // ----------------------------
  server.on("request", (req, res) => {
    const urlPath = req.url || "/";

    if (!persistentReady) {
      console.log(
        `[SSR WORKER ${process.pid}] Persistent child not ready, queueing request for ${urlPath}`
      );
      requestQueue.push({ req, res, url: urlPath });
      return;
    }

    handleRequest(req, res, urlPath);
  });

  // ----------------------------
  // SINGLE REQUEST HANDLER
  // ----------------------------
  function handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    urlPath: string
  ) {
    const method = req.method?.toUpperCase() || "GET";

    console.log(`[SSR WORKER ${process.pid}] Request: ${method} ${urlPath}`);

    if (method !== "GET" || !hasPageForGET(urlPath)) {
      res.writeHead(404);
      res.end("Page not found or handled by API worker");
      return;
    }

    const { pageFile } = getRouteFiles(urlPath);

    // ----------------------------
    // TEMP CHILD FOR HOT RELOAD
    // ----------------------------
    if (!activeChildren.has(urlPath)) {
      console.log(
        `[SSR WORKER ${process.pid}] No child for ${urlPath}, forking temp child`
      );

      const tempChild = fork(childPath, {
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
      activeChildren.set(urlPath, tempChild);

      fs.watch(pageFile, (event) => {
        if (event === "change") {
          console.log(
            `[SSR WORKER ${process.pid}] Detected change in ${pageFile}, restarting child`
          );
          tempChild.kill();
          activeChildren.delete(urlPath);
        }
      });

      tempChild.on("message", (msg: any) => {
        if (msg.type === "render") {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(msg.html);
          console.log(`[SSR WORKER ${process.pid}] Responded for ${urlPath}`);
        }
      });

      tempChild.send({ file: pageFile, url: urlPath });
      return;
    }

    // ----------------------------
    // USE PERSISTENT CHILD
    // ----------------------------
    persistentChild.send({ file: pageFile, url: urlPath });

    const onRender = (msg: any) => {
      if (msg.type === "render" && msg.url === urlPath) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(msg.html);
        console.log(`[SSR WORKER ${process.pid}] Responded for ${urlPath}`);
        persistentChild.off("message", onRender);
      }
    };

    persistentChild.on("message", onRender);
  }
}
