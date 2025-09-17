import cluster from "cluster";
import os from "os";

export function start({
  port = 3000,
  totalWorkers = Math.max(os.cpus().length, 4),
}: { port?: number; totalWorkers?: number }) {
  if (cluster.isMaster) {
    console.log(`Prod Master ${process.pid} is running`);
    console.log(`Forking ${totalWorkers} workers...`);

    const apiWorkersCount = Math.max(1, Math.floor(totalWorkers / 4));

    for (let i = 0; i < totalWorkers; i++) {
      cluster.fork({
        WORKER_TYPE: i < apiWorkersCount ? "api" : "ssr",
        PORT: port,
      });
    }

    cluster.on("exit", (worker) => {
      console.log(`Worker ${worker.process.pid} died. Restarting...`);
      const type = worker.process.env.WORKER_TYPE || "ssr";
      cluster.fork({ WORKER_TYPE: type, PORT: port });
    });
  } else {
    const type = process.env.WORKER_TYPE;
    if (type === "api") require("./apiWorker");
    else require("./ssrWorker");
  }
}
