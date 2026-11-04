import path from "path";

process.env.TS_NODE_PROJECT = path.resolve(
  __dirname,
  "../tsconfig.devServer.json"
);
process.env.TS_NODE_TRANSPILE_ONLY = "true";
require("ts-node/register");
