import cluster from "cluster";

const numWorkers = 2; // 1 SSR + 1 API

if (cluster.isMaster) {
  console.log(`Dev Master ${process.pid} is running`);

  cluster.fork({ WORKER_TYPE: "ssr" });
  cluster.fork({ WORKER_TYPE: "api" });

  cluster.on("exit", (worker) => {
    console.log(`Worker ${worker.process.pid} died. Restarting...`);
    const type = worker.process.env.WORKER_TYPE;
    cluster.fork({ WORKER_TYPE: type });
  });
} else {
  const type = process.env.WORKER_TYPE;
  if (type === "api") require("./devAPIWorker");
  else require("./devSSRWorker");
}
