import {
  bundleClientScript,
  getDevPreamble,
  type ClientComponentEntry,
} from "./devRefresh";

export type { ClientComponentEntry };

export interface PageBundle {
  js: string;
  css: string;
  runtime: string;
}

/**
 * Bundles every client component on a page into one script, so React and other
 * dependencies are included once per page instead of once per component.
 */
export async function bundlePageClient(
  components: ClientComponentEntry[]
): Promise<PageBundle> {
  if (components.length === 0) return { js: "", css: "", runtime: "" };

  const [bundle, runtime] = await Promise.all([
    bundleClientScript(components),
    getDevPreamble(),
  ]);

  return { js: bundle.js, css: bundle.css, runtime };
}
