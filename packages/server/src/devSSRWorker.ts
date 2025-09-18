import http from "http";
import { fork, ChildProcess } from "child_process";
import { getRouteFiles, hasPageForGET } from "./routeResolver";
import fs from "fs";
import path from "path";

const activeChildren: Map<string, ChildProcess> = new Map();

export default function createSSRWorker(server: http.Server) {
  console.log(`[SSR WORKER ${process.pid}] Initializing`);

  const startChildForRoute = (urlPath: string): ChildProcess | null => {
    const { pageFile } = getRouteFiles(urlPath);

    if (!fs.existsSync(pageFile)) {
      console.log(
        `[SSR WORKER ${process.pid}] Page file does not exist: ${pageFile}`
      );
      return null;
    }

    if (activeChildren.has(urlPath)) {
      const oldChild = activeChildren.get(urlPath)!;
      oldChild.kill();
      activeChildren.delete(urlPath);
    }

    const childPath = path.resolve(__dirname, "devChildWorker.js");
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

    activeChildren.set(urlPath, child);
    console.log(
      `[SSR WORKER ${process.pid}] Forked child PID: ${child.pid} for route ${urlPath}`
    );

    // Hot reload
    fs.watch(pageFile, (event) => {
      if (event === "change") {
        console.log(
          `[SSR WORKER ${process.pid}] Detected change in ${pageFile}, restarting child`
        );
        startChildForRoute(urlPath);
      }
    });

    return child;
  };

  server.on("connection", (socket) => {
    console.log(`[SSR WORKER ${process.pid}] Connection established`);
  });

  server.on("close", () => {
    console.log(`[SSR WORKER ${process.pid}] Server closed`);
  });

  server.on("request", async (req, res) => {
    const urlPath = req.url || "/";
    const method = req.method?.toUpperCase() || "GET";

    console.log(`[SSR WORKER ${process.pid}] Request: ${method} ${urlPath}`);

    if (method !== "GET" || !hasPageForGET(urlPath)) {
      res.writeHead(404);
      res.end("Page Not Found or handled by API worker");
      return;
    }

    let child = activeChildren.get(urlPath);
    if (!child) {
      child = startChildForRoute(urlPath)!;

      // Wait for child ready
      await new Promise<void>((resolve) => {
        const onReady = (msg: any) => {
          if (msg?.type === "ready") {
            console.log(
              `[SSR WORKER ${process.pid}] Child READY for ${urlPath}`
            );
            child!.off("message", onReady);
            resolve();
          }
        };
        child!.on("message", onReady);
      });
    }

    // Send render request
    child.send({ file: getRouteFiles(urlPath).pageFile, url: req.url });

    // Listen for render response
    const onRender = (msg: any) => {
      if (msg?.type === "render") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(msg.html);
        console.log(`[SSR WORKER ${process.pid}] Responded for ${urlPath}`);
        child!.off("message", onRender);
      }
    };

    child.on("message", onRender);
  });
}
