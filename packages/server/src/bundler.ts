import { build } from "esbuild";
import path from "path";

export async function bundleClientDynamic(
  filePath: string,
  instanceKey: string // unique instance key for hydration
): Promise<string> {
  const absPath = path.resolve(filePath);
  const shimPath = path.resolve(__dirname, "shim.js");

  const result = await build({
    entryPoints: [absPath],
    bundle: true,
    platform: "browser",
    format: "iife",
    globalName: "defaultExport",
    target: ["es2022"],
    jsx: "automatic",
    write: false,
    logLevel: "silent",
    inject: [shimPath],
  });

  if (result.outputFiles && result.outputFiles.length > 0) {
    const bundleCode = result.outputFiles[0].text;

    return (
      bundleCode +
      `\n(function() {
        window.__components = window.__components || {};
        // Handle ES module default export if wrapped
        window.__components["${instanceKey}"] = { default: defaultExport?.default || defaultExport };
      })();`
    );
  }

  return "";
}
