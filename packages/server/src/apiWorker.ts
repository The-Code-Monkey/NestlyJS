import http from "http";
import { fork } from "child_process";
import path from "path";

const server = http.createServer((req, res) => {
  const child = fork(path.join(__dirname, "apiChild.js"));
  child.send({ url: req.url, method: req.method, headers: req.headers });

  child.on("message", (data: { status: number; body: any }) => {
    res.writeHead(data.status || 200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data.body));
  });

  child.on("error", (err) => {
    console.error("API child process error:", err);
    res.writeHead(500);
    res.end("Internal Server Error");
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
  console.log(`API Worker ${process.pid} listening on port ${PORT}`)
);
