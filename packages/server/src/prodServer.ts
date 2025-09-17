import cluster from "cluster";
import os from "os";

export function start({ port = 3000 }: { port?: number }) {
  if (cluster.isMaster) {
    const numCPUs = os.cpus().length;
    const totalWorkers = Math.max(4, numCPUs); // minimum 4
    const apiWorkersCount = Math.ceil(totalWorkers / 4); // 1/4 API workers
    const ssrWorkersCount = totalWorkers - apiWorkersCount;

    console.log(`Prod Master ${process.pid} running`);
    console.log(`Starting ${ssrWorkersCount} SSR workers and ${apiWorkersCount} API workers`);

    // Map worker ID to type
    const workerTypes: Record<number, "ssr" | "api"> = {};

    const forkWorker = (type: "ssr" | "api") => {
      const worker = cluster.fork({
        ...process.env,
        WORKER_TYPE: type,
        PORT: port.toString(),
      });
      workerTypes[worker.id] = type;
      return worker;
    };

    // Fork SSR workers
    for (let i = 0; i < ssrWorkersCount; i++) forkWorker("ssr");

    // Fork API workers
    for (let i = 0; i < apiWorkersCount; i++) forkWorker("api");

    cluster.on("exit", (worker) => {
      console.log(`Worker ${worker.process?.pid} died. Restarting...`);

      const type = workerTypes[worker.id] || "ssr"; // default to SSR if unknown
      forkWorker(type);

      delete workerTypes[worker.id];
    });
  } else {
    // Worker code
    const type = process.env.WORKER_TYPE;
    if (type === "api") require("./prodAPIWorker");
    else require("./prodSSRWorker");
  }
}
