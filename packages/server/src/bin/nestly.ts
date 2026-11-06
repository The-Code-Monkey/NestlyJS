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

  const port = flags.port
    ? parseInt(flags.port)
    : process.env.PORT
      ? parseInt(process.env.PORT)
      : undefined;
  const host = flags.host || process.env.HOST || undefined;

  switch (command) {
    case "dev":
      load(path.join(__dirname, "../devServer")).start({
        port: port || 3000,
        host,
      });
      break;

    case "build":
      load(path.join(__dirname, "../build"))
        .buildApp()
        .then(() => console.log("Build complete"))
        .catch((err: unknown) => {
          console.error("Build failed:", err);
          process.exit(1);
        });
      break;

    case "start":
      load(path.join(__dirname, "../prodServer")).start({
        port: port || 3000,
        host,
      });
      break;

    default:
      console.log("Usage: nestly [dev|build|start] [--port=PORT] [--host=HOST]");
      process.exit(1);
  }
}

/* v8 ignore start */
if (require.main === module) {
  run();
}
/* v8 ignore stop */
