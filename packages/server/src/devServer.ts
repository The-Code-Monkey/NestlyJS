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

    // ----------------------------
    // MASTER NET SERVER SIMPLIFIED
    // ----------------------------
    const server = net.createServer((socket) => {
      // Forward socket immediately to SSR worker
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

    // ----------------------------
    // WORKER HTTP SERVER
    // ----------------------------
    const server = require("http").createServer();

    if (type === "api") {
      require("./devAPIWorker").default(server);
    } else {
      require("./devSSRWorker").default(server);
    }

    // ----------------------------
    // SOCKET HANDLING
    // ----------------------------
    process.on("message", (msg, socket: any) => {
      if (msg === "socket" && socket) {
        console.log(
          `[WORKER ${process.pid}] Received socket, attaching HTTP server`
        );

        // Ensure HTTP parser reads and attach to server
        socket.resume();
        server.emit("connection", socket);
        console.log(`[WORKER ${process.pid}] Connection attached`);
      }
    });

    // ----------------------------
    // LISTENING
    // ----------------------------
    server.listen(0, () =>
      console.log(`[WORKER ${process.pid}] HTTP server listening`)
    ); // use ephemeral port, master forwards sockets
  }
}
