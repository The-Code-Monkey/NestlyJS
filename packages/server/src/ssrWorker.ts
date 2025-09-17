import http from "http";
import { fork } from "child_process";
import path from "path";

const server = http.createServer((req, res) => {
  const child = fork(path.join(__dirname, "childWorker.js"));
  child.send({ url: req.url });

  child.on("message", (data) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(data.html);
  });

  child.on("error", (err) => {
    console.error("SSR child process error:", err);
    res.writeHead(500);
    res.end("Internal Server Error");
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`SSR Worker ${process.pid} listening on port ${PORT}`));
