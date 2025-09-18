import cluster, { Worker } from "cluster";
import net from "net";

export function start({ port = 3000 }: { port?: number }) {
  if (cluster.isPrimary) {
    console.log(`[MASTER] Dev Master ${process.pid} running`);

    const workerTypes: Record<number, "ssr" | "api"> = {};
    let ssrWorker: Worker;
    let apiWorker: Worker;

    const forkWorker = (type: "ssr" | "api") => {
      console.log(`[MASTER] Forking ${type} worker`);
      const worker = cluster.fork({
        ...process.env,
        WORKER_TYPE: type,
        PORT: port.toString(),
      });
      workerTypes[worker.id] = type;
      worker.on("online", () =>
        console.log(`[MASTER] Worker ${worker.process.pid} (${type}) online`)
      );
      return worker;
    };

    ssrWorker = forkWorker("ssr");
    apiWorker = forkWorker("api");

    const server = net.createServer((socket) => {
      // Forward socket immediately to SSR worker
      // Workers will route to SSR or API internally
      ssrWorker.send("socket", socket);
    });

    server.listen(port, () =>
      console.log(`[MASTER] Listening on http://localhost:${port}`)
    );

    cluster.on("exit", (worker) => {
      console.log(`[MASTER] Worker ${worker.process?.pid} died. Restarting...`);
      const type = workerTypes[worker.id] || "ssr";
      const newWorker = forkWorker(type);

      if (type === "ssr" && ssrWorker.id === worker.id) ssrWorker = newWorker;
      if (type === "api" && apiWorker.id === worker.id) apiWorker = newWorker;

      delete workerTypes[worker.id];
    });
  } else {
    const type = process.env.WORKER_TYPE;
    console.log(`[WORKER ${process.pid}] Starting as ${type}`);

    const server = require("http").createServer();

    if (type === "api") require("./devAPIWorker").default(server);
    else require("./devSSRWorker").default(server);

    process.on("message", (msg, socket: any) => {
      if (msg === "socket" && socket) {
        console.log(
          `[WORKER ${process.pid}] Received socket, emitting 'connection'`
        );
        socket.resume(); // ensure HTTP parser reads
        server.emit("connection", socket);
      }
    });
  }
}
