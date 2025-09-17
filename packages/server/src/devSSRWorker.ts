import http from "http";
import { fork } from "child_process";
import { getRouteFiles, hasPageForGET } from "./routeResolver";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

const server = http.createServer((req, res) => {
  if (req.method?.toUpperCase() !== "GET") {
    res.writeHead(404);
    res.end("Non-GET requests handled by API worker");
    return;
  }

  const urlPath = req.url || "/";
  if (hasPageForGET(urlPath)) {
    const { pageFile } = getRouteFiles(urlPath);

    // Spawn child process for SSR
    const child = fork(require.resolve("./devChildWorker.js"));
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
  } else {
    res.writeHead(404);
    res.end("Page Not Found");
  }
});

server.listen(PORT, () => console.log(`Dev SSR Worker ${process.pid} listening on port ${PORT}`));
