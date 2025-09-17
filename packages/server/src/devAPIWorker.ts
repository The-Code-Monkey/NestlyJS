import http from "http";
import { fork } from "child_process";
import path from "path";

const server = http.createServer((req, res) => {
  if (!req.url?.startsWith("/api")) {
    res.writeHead(404);
    res.end("Non-API requests handled by SSR worker");
    return;
  }

  const child = fork(path.join(__dirname, "devAPIChild.js"));
  child.send({ url: req.url, method: req.method, headers: req.headers });

  child.on("message", (data) => {
    res.writeHead(data.status || 200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data.body));
  });

  child.on("error", (err) => {
    console.error("API child error:", err);
    res.writeHead(500);
    res.end("Internal Server Error");
  });
});

const PORT = 3000; // same port, cluster handles routing
server.listen(PORT, () => console.log(`Dev API Worker ${process.pid} listening on port ${PORT}`));
