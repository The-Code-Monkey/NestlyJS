import fs from "fs";
import path from "path";
import { build, type Plugin } from "esbuild";
import { clientIdFor, getPageGraph } from "./pageGraph";
import { resolveRoute } from "./routeResolver";

const { transformAsync } = require("@babel/core") as any;

export interface ClientComponentEntry {
  id: string;
  filePath: string;
}

export interface ClientScript {
  js: string;
}

function namedExports(moduleValue: any, globalExpression: string) {
  const keys = Object.keys(moduleValue).filter(
    (key) => key !== "default" && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
  );
  return `const __module = ${globalExpression};
export default __module;
${keys
  .map(
    (key) =>
      `export const ${key} = __module[${JSON.stringify(key)}];`
  )
  .join("\n")}`;
}

function globalModulesPlugin(): Plugin {
  return {
    name: "nestly-global-modules",
    setup(buildApi) {
      buildApi.onResolve(
        {
          filter: /^(react|react-dom|react-dom\/client|react\/jsx-runtime)$/,
        },
        (args) => ({ path: args.path, namespace: "nestly-global" })
      );
      buildApi.onLoad(
        { filter: /.*/, namespace: "nestly-global" },
        (args) => {
          const contents =
            args.path === "react"
              ? namedExports(require("react"), "window.React")
              : args.path === "react-dom"
                ? namedExports(require("react-dom"), "window.ReactDOM")
                : args.path === "react-dom/client"
                  ? namedExports(
                      require("react-dom/client"),
                      "window.ReactDOMClient"
                    )
                  : namedExports(
                      require("react/jsx-runtime"),
                      "window.ReactJSXRuntime"
                    );
          return { contents, loader: "js" };
        }
      );
    },
  };
}

const LOADERS: Record<string, "js" | "jsx" | "ts" | "tsx"> = {
  ".js": "js",
  ".mjs": "js",
  ".cjs": "js",
  ".jsx": "jsx",
  ".ts": "ts",
  ".tsx": "tsx",
};

function refreshPlugin(): Plugin {
  return {
    name: "nestly-react-refresh",
    setup(buildApi) {
      buildApi.onLoad(
        { filter: /\.(mjs|cjs|jsx|js|tsx|ts)$/ },
        async (args) => {
          if (args.path.includes("node_modules")) return null;

          const loader = LOADERS[path.extname(args.path)]!;
          const source = fs.readFileSync(args.path, "utf8");
          const transpiled = await buildApi.esbuild.transform(source, {
            loader,
            jsx: "automatic",
            format: "esm",
            target: "es2022",
          });
          const transformed = await transformAsync(transpiled.code, {
            filename: args.path,
            babelrc: false,
            configFile: false,
            sourceType: "module",
            plugins: [
              [require.resolve("react-refresh/babel"), { skipEnvCheck: true }],
            ],
          });

          return { contents: transformed?.code ?? "", loader: "js" };
        }
      );
    },
  };
}

async function buildIife(contents: string) {
  const result = await build({
    stdin: {
      contents,
      resolveDir: process.cwd(),
      sourcefile: "nestly-dev-runtime.js",
      loader: "js",
    },
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2022",
    logLevel: "silent",
    define: { "process.env.NODE_ENV": '"development"' },
  });
  return result.outputFiles?.[0]?.text ?? "";
}

let preamblePromise: Promise<string> | null = null;

export function getDevPreamble() {
  if (preamblePromise) return preamblePromise;

  preamblePromise = (async () => {
    const refreshRuntime = await buildIife(`
import RefreshRuntime from "react-refresh/runtime";
window.__NESTLY_REFRESH__ = RefreshRuntime;
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = (type, id) => RefreshRuntime.register(type, id);
window.$RefreshSig$ = RefreshRuntime.createSignatureFunctionForTransform;
`);

    const reactGlobals = await buildIife(`
import React from "react";
import * as ReactDOM from "react-dom";
import * as ReactDOMClient from "react-dom/client";
import * as JSXRuntime from "react/jsx-runtime";
window.React = React;
window.ReactDOM = ReactDOM;
window.ReactDOMClient = ReactDOMClient;
window.ReactJSXRuntime = JSXRuntime;
`);

    return `${refreshRuntime}\n${reactGlobals}`;
  })();

  return preamblePromise;
}

export async function bundleClientScript(
  components: ClientComponentEntry[]
): Promise<ClientScript> {
  if (components.length === 0) return { js: "" };

  const unique = new Map<string, string>();
  for (const component of components) {
    if (!unique.has(component.id)) unique.set(component.id, component.filePath);
  }
  const entries = [...unique];

  const imports = entries
    .map(
      ([, filePath], index) =>
        `import __component${index} from ${JSON.stringify(filePath)};`
    )
    .join("\n");
  const registrations = entries
    .map(
      ([id], index) =>
        `window.__components[${JSON.stringify(id)}] = { default: __component${index}?.default ?? __component${index} };`
    )
    .join("\n");

  const result = await build({
    stdin: {
      contents: `
${imports}
window.__components = window.__components || {};
${registrations}
`,
      resolveDir: process.cwd(),
      sourcefile: "nestly-client-entry.ts",
      loader: "ts",
    },
    bundle: true,
    platform: "browser",
    format: "iife",
    target: "es2022",
    jsx: "automatic",
    outdir: path.join(process.cwd(), ".nestly"),
    write: false,
    logLevel: "silent",
    plugins: [globalModulesPlugin(), refreshPlugin()],
  });

  const files = result.outputFiles ?? [];
  const js = files.find((file) => file.path.endsWith(".js"))?.text ?? "";

  return { js };
}

export async function buildClientScriptForUrl(urlPath: string) {
  const route = resolveRoute(urlPath);
  if (!route || !fs.existsSync(route.pageFile)) return null;

  const graph = getPageGraph(route.pageFile);
  if (graph.clientFiles.length === 0) return "";

  return (
    await bundleClientScript(
      graph.clientFiles.map((filePath) => ({
        id: clientIdFor(filePath),
        filePath,
      }))
    )
  ).js;
}
