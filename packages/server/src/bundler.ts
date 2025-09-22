import { build } from "esbuild";
import path from "path";

/**
 * Bundles a React component file dynamically and returns the JS code as a string.
 * @param filePath Absolute or relative path to the component file.
 * @returns Fully bundled browser-ready JS string.
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
