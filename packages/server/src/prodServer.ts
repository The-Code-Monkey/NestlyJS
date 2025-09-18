import cluster from "cluster";
import os from "os";

/**
 * Start a clustered production server: master forks and supervises worker processes, workers load the appropriate entry module.
 *
 * When run in the master process, forks a pool of worker processes (minimum 4) and divides them into API workers (~1/4) and SSR workers (~3/4). The master tracks each worker's role and restarts a replacement of the same role if a worker exits. When run in a worker process, loads either the API or SSR worker module based on the WORKER_TYPE environment variable.
 *
 * Side effects: forks child processes, sets WORKER_TYPE and PORT in worker environments, and writes lifecycle logs to stdout.
 *
 * @param port - TCP port forwarded to worker processes via the PORT environment variable (defaults to 3000)
 */
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
