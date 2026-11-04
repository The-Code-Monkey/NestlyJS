#!/usr/bin/env node
import path from "path";

export function defaultLoad(modulePath: string) {
  return require(modulePath);
}

export function run(
  argv: string[] = process.argv.slice(2),
  load: (modulePath: string) => any = defaultLoad
) {
  const command = argv[0];

  // Simple flag parser for --port
  const flags: Record<string, string> = {};
  argv.slice(1).forEach((arg) => {
    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=");
      flags[key] = value;
    }
  });

  const port = flags.port ? parseInt(flags.port) : undefined;

  switch (command) {
    case "dev":
      load(path.join(__dirname, "../devServer")).start({
        port: port || 3000,
      });
      break;

    case "start":
      console.error("nestly start is not implemented yet. Use `nestly dev`.");
      process.exit(1);
      break;

    default:
      console.log("Usage: nestly dev [--port=PORT]");
      process.exit(1);
  }
}

/* v8 ignore start */
if (require.main === module) {
  run();
}
/* v8 ignore stop */
