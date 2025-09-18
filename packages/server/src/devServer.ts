import cluster from "cluster";

/**
 * Starts a development server orchestrator that runs in cluster mode.
 *
 * In the master process this spawns one "ssr" and one "api" worker, tracks their
 * types, and automatically restarts a worker of the same type if it exits.
 * Workers receive WORKER_TYPE and PORT via their environment. In worker
 * processes this loads the appropriate entry module (`./devAPIWorker` for
 * "api", otherwise `./devSSRWorker`).
 *
 * @param port - TCP port forwarded to workers (defaults to 3000)
 */
export function start({ port = 3000 }: { port?: number }) {
  if (cluster.isMaster) {
    console.log(`Dev Master ${process.pid} is running`);

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

    // Fork workers
    forkWorker("ssr");
    forkWorker("api");

    cluster.on("exit", (worker) => {
      console.log(`Worker ${worker.process?.pid} died. Restarting...`);

      const type = workerTypes[worker.id] || "ssr"; // get type from our map
      forkWorker(type);

      // Remove old worker from map
      delete workerTypes[worker.id];
    });
  } else {
    const type = process.env.WORKER_TYPE;
    if (type === "api") require("./devAPIWorker");
    else require("./devSSRWorker");
  }
}
