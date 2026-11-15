/**
 * Assembles a rendered Page into a full HTML document. The rendered Page owns
 * the markup tree; the asset plan owns the head and body markup a runtime
 * wants; this module owns injection order and hydration markup. It is pure:
 * no filesystem, module loading, network, or cache.
 */

import type { ClientInstance } from "./renderer";

export interface RenderedPage {
  html: string;
  instances: ClientInstance[];
}

export interface PageDocumentAssets {
  /** Markup inserted before `</head>`, such as a stylesheet link or style. */
  head?: string;
  /** Markup inserted at the end of `body`, before hydration, such as a page script. */
  body?: string;
  /** Markup inserted after hydration, such as the development HMR client. */
  trailingBody?: string;
}

export function serializeProps(props: any) {
  return JSON.stringify(props || {}).replace(/</g, "\\u003c");
}

function hydrationScript(instances: ClientInstance[]) {
  return `
      <script>
      (function() {
        const instances = ${serializeProps(
          instances.map(({ id, instanceKey, props }) => ({
            id,
            key: instanceKey,
            props,
          }))
        )};
        document.addEventListener("DOMContentLoaded", () => {
          for (const { id, key, props } of instances) {
            const el = document.getElementById("hydrate-" + key);
            const Comp = window.__components[id]?.default;
            if (el && Comp) {
              window.ReactDOMClient.hydrateRoot(el, window.React.createElement(Comp, props));
            } else {
              console.warn("Hydration skipped: element or component not found for", id);
            }
          }
        });
      })();
      </script>`;
}

function injectHead(html: string, markup: string) {
  if (!markup) return html;
  return html.includes("</head>")
    ? html.replace("</head>", `${markup}</head>`)
    : markup + html;
}

function injectBody(html: string, markup: string) {
  if (!markup) return html;
  return html.includes("</body>")
    ? html.replace("</body>", `${markup}</body>`)
    : html + markup;
}

/**
 * Assembles the document. Head markup lands before `</head>`, the page script
 * lands before hydration, and hydration appears only when the rendered Page
 * produced Client Component instances. Missing `head` or `body` tags fall back
 * to prepending or appending the markup.
 */
export function renderPageDocument(
  rendered: RenderedPage,
  assets: PageDocumentAssets
): string {
  const scripts = [
    assets.body ?? "",
    rendered.instances.length > 0 ? hydrationScript(rendered.instances) : "",
    assets.trailingBody ?? "",
  ].join("");

  return injectBody(injectHead(rendered.html, assets.head ?? ""), scripts);
}
