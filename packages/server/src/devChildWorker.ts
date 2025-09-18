import React from "react";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import path from "path";
import fs from "fs";

console.log(`[CHILD ${process.pid}] Booting SSR child worker`);

// ----------------------------
// Helpers
// ----------------------------

// Detect "use client"
function isClientComponent(filePath: string) {
  try {
    const buf = fs.readFileSync(filePath, "utf8");
    const firstStmt = buf
      .split(/\r?\n/)
      .slice(0, 10)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("//") && !l.startsWith("/*"))[0];
    return /^['"]use client['"]\s*;?$/.test(firstStmt ?? "");
  } catch {
    return false;
  }
}

// Render either SSR or static+hydrate
function renderComponent(filePath: string, props: any = {}) {
  const importPath =
    "/" + path.relative(process.cwd(), filePath).replace(/\\/g, "/");

  if (isClientComponent(filePath)) {
    const Comp = require(filePath).default;
    const staticHTML = renderToStaticMarkup(React.createElement(Comp, props));

    return `
      <div>${staticHTML}</div>
      <script type="module">
        import React from "react";
        import { hydrateRoot } from "react-dom/client";
        import Comp from "${importPath}";
        const scriptEl = document.currentScript;
        const el = scriptEl?.previousElementSibling;
        if (el) {
          hydrateRoot(el, React.createElement(Comp, ${JSON.stringify(props)}));
        }
        // Clean up script tag after running
        scriptEl?.remove();
      </script>
    `;
  } else {
    const Comp = require(filePath).default;
    return renderToStaticMarkup(React.createElement(Comp, props));
  }
}

// Find all layouts for a given url path
const findLayoutComponents = async (urlPath: string) => {
  const layoutComponents: string[] = [];
  let pathParts = urlPath.split("/").filter(Boolean);
  const routesIndex = pathParts.findIndex((part) => part === "routes");
  pathParts = pathParts.slice(routesIndex, pathParts.length);
  for (let i = pathParts.length - 1; i >= 0; i--) {
    const layoutPath = path.resolve(
      process.cwd(),
      `${pathParts.slice(0, i + 1).join("/")}/layout.tsx`
    );
    layoutComponents.push(layoutPath);
  }
  return layoutComponents;
};

// ----------------------------
// Render messages
// ----------------------------
process.on("message", async ({ file, url }: { file: string; url: string }) => {
  try {
    // Render page (server or client)
    let renderedPage = renderComponent(file, {});

    const urlPathParts = url.split("/").filter(Boolean);

    // Handle root layout
    if (urlPathParts.length === 0) {
      const layoutPath = file.replace("page.tsx", "layout.tsx");
      renderedPage = renderComponent(layoutPath, { children: renderedPage });

      process.send?.({
        type: "render",
        html: renderedPage,
        url,
      });
      console.log(`[CHILD ${process.pid}] Rendered page for ${url}`);
      return;
    }

    // Handle nested layouts
    if (urlPathParts.length >= 1) {
      const layoutPaths = await findLayoutComponents(
        file.replace("page.tsx", "")
      );

      let renderedLayout = renderedPage;
      for (const layoutPath of layoutPaths) {
        renderedLayout = renderComponent(layoutPath, {
          children: renderedLayout,
        });
      }

      process.send?.({
        type: "render",
        html: renderedLayout,
        url,
      });
      console.log(`[CHILD ${process.pid}] Rendered page for ${url}`);
      return;
    }

    // Fallback: send just the page
    process.send?.({ type: "render", html: renderedPage, url });
    console.log(`[CHILD ${process.pid}] Rendered page for ${url}`);
  } catch (err) {
    console.error(`[CHILD ${process.pid}] Error rendering page:`, err);
    process.send?.({
      type: "render",
      html: "<h1>Error rendering page</h1>",
      url,
    });
  }
});
