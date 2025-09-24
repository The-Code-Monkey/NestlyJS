import { build } from "esbuild";
import path from "path";

export async function bundleClientDynamic(filePath: string): Promise<string> {
  const absPath = path.resolve(filePath);
  const routeMatch = filePath.match(/\/routes(.*)$/);
  let routeKey = routeMatch ? routeMatch[1] : path.basename(filePath);
  routeKey = routeKey.replace(/\//g, "-");

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
  });

  if (result.outputFiles && result.outputFiles.length > 0) {
    const bundleCode = result.outputFiles[0].text;

    // Wrap in IIFE that registers the component under the hydration key
    return (
      `
(function() {
  window.__components = window.__components || {};
  // The component is now guaranteed on window.__components
  window.__components["${routeKey}"] = defaultExport;
})();
` +
      "\n" +
      bundleCode
    );
  }

  return "";
}
