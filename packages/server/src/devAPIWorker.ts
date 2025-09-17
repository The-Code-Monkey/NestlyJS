import http from "http";
import { fork, ChildProcess } from "child_process";
import { getAPIMethod, getRouteFiles } from "./routeResolver";
import fs from "fs";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

const activeChildren: Map<string, ChildProcess> = new Map();

const server = http.createServer((req, res) => {
  const urlPath = req.url || "/";
  const method = req.method?.toUpperCase() || "GET";

  const { apiFile } = getRouteFiles(urlPath);
  const apiFunc = getAPIMethod(urlPath, method);

  if (!apiFunc) {
    res.writeHead(404);
    res.end("API route not found");
    return;
  }

  // Kill old child if exists
  const key = `${urlPath}-${method}`;
  if (activeChildren.has(key)) {
    const oldChild = activeChildren.get(key)!;
    oldChild.kill();
    activeChildren.delete(key);
  }

  const child = fork(require.resolve("./devAPIChild.js"));
  activeChildren.set(key, child);

  child.send({ file: apiFile, method, url: req.url, headers: req.headers, body: {} });

  child.on("message", (data) => {
    res.writeHead(data.status || 200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data.body));
  });

  child.on("error", (err) => {
    console.error("API child error:", err);
    res.writeHead(500);
    res.end("Internal Server Error");
  });

  // Watch api.ts for hot reload
  fs.watch(apiFile, (event) => {
    if (event === "change") {
      console.log(`Detected change in ${apiFile}, reloading...`);
      if (activeChildren.has(key)) {
        const old = activeChildren.get(key)!;
        old.kill();
        activeChildren.delete(key);
      }
    }
  });
});

server.listen(PORT, () =>
  console.log(`Dev API Worker ${process.pid} listening on port ${PORT}`)
);
