#!/usr/bin/env node
import path from "path";

const args = process.argv.slice(2);
const command = args[0];

// Simple flag parser for --port and --workers
const flags: Record<string, string> = {};
args.slice(1).forEach((arg) => {
  if (arg.startsWith("--")) {
    const [key, value] = arg.slice(2).split("=");
    flags[key] = value;
  }
});

const port = flags.port ? parseInt(flags.port) : undefined;
const workersFlag = flags.workers ? parseInt(flags.workers) : undefined;

switch (command) {
  case "dev":
    // Always 2 workers for dev
    require(path.join(__dirname, "../devServer")).start({
      port: port || 3000,
    });
    break;

  case "start":
    // Prod: configurable number of workers, default to CPU cores
    require(path.join(__dirname, "../prodServer")).start({
      port: port || 3000,
      totalWorkers: workersFlag || undefined, // default handled in prodServer
    });
    break;

  default:
    console.log("Usage: nestly [dev|start] [--port=PORT] [--workers=NUM]");
    process.exit(1);
}
