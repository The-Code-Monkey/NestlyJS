import { build } from "esbuild";
import path from "path";

export interface ClientComponentEntry {
  filePath: string;
  instanceKey: string;
}

export interface PageBundle {
  js: string;
  css: string;
}

/**
 * Bundles every client component on a page into one script, so React and other
 * dependencies are included once per page instead of once per component.
 */
export async function bundlePageClient(
  components: ClientComponentEntry[]
): Promise<PageBundle> {
  if (components.length === 0) return { js: "", css: "" };

  const shimPath = path.resolve(__dirname, "shim.js");

  const imports = components
    .map((comp, index) => `import __component${index} from ${JSON.stringify(comp.filePath)};`)
    .join("\n");

  const registrations = components
    .map(
      (comp, index) =>
        `window.__components[${JSON.stringify(comp.instanceKey)}] = { default: __component${index}?.default ?? __component${index} };`
    )
    .join("\n");

  const result = await build({
    stdin: {
      contents: `
import ${JSON.stringify(shimPath)};
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
    target: ["es2022"],
    jsx: "automatic",
    outdir: path.join(process.cwd(), ".nestly"),
    write: false,
    logLevel: "silent",
  });

  const files = result.outputFiles ?? [];
  const js = files.find((file) => file.path.endsWith(".js"))?.text ?? "";
  const css = files.find((file) => file.path.endsWith(".css"))?.text ?? "";

  return { js, css };
}
