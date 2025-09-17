import cluster from "cluster";
import path from "path";

export function start({ port = 3000 }: { port?: number }) {
  if (cluster.isMaster) {
    console.log(`Dev Master ${process.pid} is running`);

    cluster.fork({ ...process.env, WORKER_TYPE: "ssr", PORT: port });
    cluster.fork({ ...process.env, WORKER_TYPE: "api", PORT: port });

    cluster.on("exit", (worker) => {
      console.log(`Worker ${worker.process.pid} died. Restarting...`);
      cluster.fork({ ...process.env, WORKER_TYPE: worker.process.env.WORKER_TYPE, PORT: port });
    });
  } else {
    const type = process.env.WORKER_TYPE;
    if (type === "api") require("./devAPIWorker");
    else require("./devSSRWorker");
  }
}
