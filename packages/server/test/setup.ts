import path from "path";

process.env.TSX_TSCONFIG_PATH = path.resolve(
  __dirname,
  "../tsconfig.devServer.json"
);
require("tsx/cjs");
