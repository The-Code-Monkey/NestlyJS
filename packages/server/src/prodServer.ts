import cluster from "cluster";
import os from "os";

const numCPUs = Math.min(os.cpus().length, 4);

if (cluster.isMaster) {
  console.log(`Master ${process.pid} is running`);

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork({ WORKER_TYPE: i === numCPUs - 1 ? "api" : "ssr" });
  }

  cluster.on("exit", (worker) => {
    console.log(`Worker ${worker.process.pid} died. Restarting...`);
    const type = worker.process.env.WORKER_TYPE || "ssr";
    cluster.fork({ WORKER_TYPE: type });
  });
} else {
  const workerType = process.env.WORKER_TYPE;
  if (workerType === "api") {
    require("./apiWorker");
  } else {
    require("./ssrWorker");
  }
}
