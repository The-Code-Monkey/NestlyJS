import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import path from "path";
import fs from "fs";

export interface ClientInstance {
  id: string;
  instanceKey: string;
  props: any;
}

export function isClientComponent(filePath: string) {
  try {
    const buf = fs.readFileSync(filePath, "utf8");
    const firstStmt = buf
      .split(/\r?\n/)
      .slice(0, 10)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("//") && !line.startsWith("/*"))[0];
    return /^['"]use client['"]\s*;?$/.test(firstStmt ?? "");
  } catch {
    return false;
  }
}

export function serializeProps(props: any) {
  return JSON.stringify(props || {}).replace(/</g, "\\u003c");
}

export function clientIdFor(filePath: string) {
  return path.relative(process.cwd(), filePath).split(path.sep).join("/");
}

export function attachFilePaths(mod: any, filePath: string) {
  if (!mod) return mod;
  const maybeTag = (comp: any) => {
    if (typeof comp === "function" && !comp.__filePath) {
      comp.__filePath = filePath;
    }
  };
  if (typeof mod === "function") maybeTag(mod);
  else if (typeof mod === "object") {
    for (const key of Object.keys(mod)) maybeTag(mod[key]);
  }
  return mod;
}

export function getImports(filePath: string): string[] {
  try {
    const src = fs.readFileSync(filePath, "utf8");
    const importRegex =
      /import\s+(?:[\s\S]+?\s+from\s+)?['"]([^'"]+)['"]/g;
    const imports: string[] = [];
    let match;
    while ((match = importRegex.exec(src))) {
      const raw = match[1];
      if (raw.startsWith(".")) {
        const resolved = path.resolve(path.dirname(filePath), raw);
        const extResolved =
          fs.existsSync(resolved) && fs.statSync(resolved).isFile()
            ? resolved
            : [".tsx", ".ts", ".jsx", ".js", ".css"]
                .map((ext) => resolved + ext)
                .find((candidate) => fs.existsSync(candidate));
        if (extResolved) imports.push(extResolved);
      }
    }
    return imports;
  } catch {
    return [];
  }
}

export function collectCss(
  filePath: string,
  seen = new Set<string>(),
  skipClient = true
): string[] {
  if (!filePath || seen.has(filePath)) return [];
  seen.add(filePath);
  if (filePath.endsWith(".css")) return [filePath];
  if (skipClient && isClientComponent(filePath)) return [];
  return getImports(filePath).flatMap((imp) =>
    collectCss(imp, seen, skipClient)
  );
}

export function collectClientComponents(
  filePath: string,
  seen = new Set<string>(),
  found = new Set<string>()
): Set<string> {
  if (!filePath || seen.has(filePath) || !fs.existsSync(filePath)) return found;
  seen.add(filePath);
  if (isClientComponent(filePath)) found.add(filePath);
  for (const imp of getImports(filePath)) {
    collectClientComponents(imp, seen, found);
  }
  return found;
}

export async function findLayoutComponents(urlPath: string) {
  const layoutPaths: string[] = [];
  let pathParts = urlPath.split("/").filter(Boolean);
  const routesIndex = pathParts.findIndex((part) => part === "routes");
  if (routesIndex === -1) return layoutPaths;
  pathParts = pathParts.slice(routesIndex + 1);

  for (let i = 0; i <= pathParts.length; i++) {
    const layoutPath = path.resolve(
      process.cwd(),
      "routes",
      ...pathParts.slice(0, i),
      "layout.tsx"
    );
    if (fs.existsSync(layoutPath)) layoutPaths.push(layoutPath);
  }

  return layoutPaths.reverse();
}

export async function renderAndWrap(
  element: any,
  instances: ClientInstance[] = [],
  counter = { value: 0 }
): Promise<any> {
  if (!element || typeof element !== "object") return element;
  if (Array.isArray(element)) {
    return Promise.all(
      element.map(async (child, index) => {
        const output = await renderAndWrap(child, instances, counter);
        if (React.isValidElement(output) && output.key == null) {
          return React.cloneElement(output, { key: index });
        }
        return output;
      })
    );
  }

  const type = element.type;
  const filePath = type?.__filePath;
  const clientId =
    type?.__clientId ??
    (filePath && isClientComponent(filePath) ? clientIdFor(filePath) : null);

  if (typeof type === "function" && clientId) {
    const instanceKey = `${clientId.replace(/\//g, "-")}-${counter.value++}`;

    instances.push({
      id: clientId,
      instanceKey,
      props: element.props,
    });

    return React.createElement(
      "div",
      {
        key: element.key,
        id: `hydrate-${instanceKey}`,
        "data-client-component": instanceKey,
        suppressHydrationWarning: true,
      },
      element
    );
  }

  if (typeof type === "function") {
    const isAsync = type.constructor?.name === "AsyncFunction";
    const output = isAsync ? await type(element.props) : type(element.props);
    return renderAndWrap(output, instances, counter);
  }

  if (element.props?.children) {
    const children = await renderAndWrap(
      React.Children.toArray(element.props.children),
      instances,
      counter
    );
    return React.cloneElement(element, element.props, children);
  }

  return element;
}

export async function renderPageTree(
  page: any,
  layouts: any[],
  params: Record<string, string | string[] | undefined>
) {
  let element: any = React.createElement(page, { params });
  for (const Layout of layouts) {
    element = React.createElement(Layout, { children: element });
  }

  const instances: ClientInstance[] = [];
  const wrapped = await renderAndWrap(element, instances, { value: 0 });
  return {
    html: renderToStaticMarkup(wrapped),
    instances,
  };
}

export function hydrationScript(instances: ClientInstance[]) {
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

export function injectHead(html: string, markup: string) {
  if (!markup) return html;
  return html.includes("</head>")
    ? html.replace("</head>", `${markup}</head>`)
    : markup + html;
}

export function injectBody(html: string, markup: string) {
  if (!markup) return html;
  return html.includes("</body>")
    ? html.replace("</body>", `${markup}</body>`)
    : html + markup;
}
