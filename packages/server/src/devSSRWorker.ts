import http from "http";
import { fork, ChildProcess } from "child_process";
import { getRouteFiles, hasPageForGET } from "./routeResolver";
import fs from "fs";
import path from "path";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

const activeChildren: Map<string, ChildProcess> = new Map();

const server = http.createServer((req, res) => {
  if (req.method?.toUpperCase() !== "GET") {
    res.writeHead(404);
    res.end("Non-GET requests handled by API worker");
    return;
  }

  const urlPath = req.url || "/";
  if (!hasPageForGET(urlPath)) {
    res.writeHead(404);
    res.end("Page Not Found");
    return;
  }

  const { pageFile } = getRouteFiles(urlPath);

  // Kill old child if exists
  if (activeChildren.has(urlPath)) {
    const oldChild = activeChildren.get(urlPath)!;
    oldChild.kill();
    activeChildren.delete(urlPath);
  }

  // Spawn new child for this route
  const child = fork(require.resolve("./devChildWorker.js"));
  activeChildren.set(urlPath, child);

  child.send({ file: pageFile, url: req.url });

  child.on("message", (data) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(data.html);
  });

  child.on("error", (err) => {
    console.error("SSR child error:", err);
    res.writeHead(500);
    res.end("Internal Server Error");
  });

  // Watch file for hot reload
  fs.watch(pageFile, (event) => {
    if (event === "change") {
      console.log(`Detected change in ${pageFile}, reloading...`);
      if (activeChildren.has(urlPath)) {
        const old = activeChildren.get(urlPath)!;
        old.kill();
        activeChildren.delete(urlPath);
      }
    }
  });
});

server.listen(PORT, () =>
  console.log(`Dev SSR Worker ${process.pid} listening on port ${PORT}`)
);
