import path from "path";
import { build } from "esbuild";
import {
  bundleClientScript,
  getDevPreamble,
  type ClientComponentEntry,
} from "./devRefresh";

export type { ClientComponentEntry };

export interface PageBundle {
  js: string;
  runtime: string;
}

/**
 * Bundles every client component on a page into one script, so React and other
 * dependencies are included once per page instead of once per component.
 */
export async function bundlePageClient(
  components: ClientComponentEntry[]
): Promise<PageBundle> {
  if (components.length === 0) return { js: "", runtime: "" };

  const [bundle, runtime] = await Promise.all([
    bundleClientScript(components),
    getDevPreamble(),
  ]);

  return { js: bundle.js, runtime };
}

/**
 * Bundles Page CSS files in order, resolving imports exactly like a Build.
 */
export async function bundleCssFiles(cssFiles: string[]): Promise<string> {
  if (cssFiles.length === 0) return "";

  const result = await build({
    stdin: {
      contents: cssFiles
        .map((file) => `import ${JSON.stringify(file)};`)
        .join("\n"),
      resolveDir: process.cwd(),
      sourcefile: "nestly-page-style.ts",
      loader: "ts",
    },
    outdir: path.join(process.cwd(), ".nestly"),
    bundle: true,
    write: false,
    logLevel: "silent",
  });

  const css = result.outputFiles?.find((file) => file.path.endsWith(".css"));
  return css?.text ?? "";
}
