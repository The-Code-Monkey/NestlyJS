import { build } from "esbuild";
import path from "path";

/**
 * Bundle a React component file for browser delivery and return the bundled ESM code as a string.
 *
 * The produced bundle uses the React automatic JSX runtime, targets ES2022, and includes an injected shim.
 * After the compiled code it appends a registration snippet that, when the bundle runs in the browser, ensures
 * window.__components exists and registers the component's default export under a route-derived key.
 *
 * The route key is computed by taking the part of `filePath` after `/routes` (if present) or the file's basename,
 * with path separators converted to dashes.
 *
 * @param filePath - Absolute or relative path to the entry component file to bundle.
 * @returns The bundled JavaScript (ESM) as a string including the registration snippet, or an empty string if no output was produced.
 * @throws Any errors raised by esbuild during the build process are propagated.
 */
export async function bundleClientDynamic(filePath: string): Promise<string> {
  const absPath = path.resolve(filePath);

  const routeMatch = filePath.match(/\/routes(.*)$/);
  let routeKey = routeMatch ? routeMatch[1] : path.basename(filePath);
  routeKey = routeKey.replace(/\//g, "-"); // convert slashes to dashes

  const shimPath = path.resolve(__dirname, "shim.js");

  const result = await build({
    entryPoints: [absPath],
    bundle: true, // include all dependencies
    platform: "browser", // target browser
    format: "esm", // ES module
    target: ["es2022"], // modern JS
    jsx: "automatic", // React automatic runtime
    write: false, // return code in memory
    logLevel: "silent",
    inject: [shimPath],
  });

  if (result.outputFiles && result.outputFiles.length > 0) {
    let bundleCode = result.outputFiles[0].text;

    // Append window.__components registration
    const registrationSnippet = `
       window.__components = window.__components || {};
       window.__components["${routeKey}"] = { default: page_default };
     `;

    bundleCode += "\n" + registrationSnippet;

    return bundleCode;
  }

  return "";
}
