import cluster from "cluster";

export function start({ port = 3000 }: { port?: number }) {
  if (cluster.isMaster) {
    console.log(`Dev Master ${process.pid} is running`);

    const workers: Record<string, cluster.Worker> = {};

    const forkWorker = (type: "ssr" | "api") => {
      const worker = cluster.fork({
        ...process.env,
        WORKER_TYPE: type,
        PORT: port.toString(),
      });
      workers[worker.id] = worker;
      return worker;
    };

    // Fork two workers
    forkWorker("ssr");
    forkWorker("api");

    cluster.on("exit", (worker) => {
      console.log(`Worker ${worker.process?.pid} died. Restarting...`);

      // Lookup the type by id, fallback to "ssr"
      const type = Object.entries(workers).find(([, w]) => w.id === worker.id)?.[1].process?.env.WORKER_TYPE || "ssr";
      forkWorker(type);
    });
  } else {
    const type = process.env.WORKER_TYPE;
    if (type === "api") require("./devAPIWorker");
    else require("./devSSRWorker");
  }
}
