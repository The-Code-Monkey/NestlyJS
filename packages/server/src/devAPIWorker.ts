import http from "http";
import { fork } from "child_process";
import { getAPIMethod } from "./routeResolver";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

const server = http.createServer((req, res) => {
  const urlPath = req.url || "/";
  const method = req.method || "GET";

  const apiFunc = getAPIMethod(urlPath, method);

  if (apiFunc) {
    const child = fork(require.resolve("./devAPIChild.js"));
    child.send({ file: null, method, url: req.url, headers: req.headers });

    child.on("message", (data) => {
      res.writeHead(data.status || 200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data.body));
    });

    child.on("error", (err) => {
      console.error("API child error:", err);
      res.writeHead(500);
      res.end("Internal Server Error");
    });
  } else {
    res.writeHead(404);
    res.end("API route not found");
  }
});

server.listen(PORT, () => console.log(`Dev API Worker ${process.pid} listening on port ${PORT}`));
