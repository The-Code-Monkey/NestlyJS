import React from "react";
import { renderToString } from "react-dom/server";
import path from "path";

console.log(`[CHILD ${process.pid}] Booting SSR child worker`);

// create a function that from a url part array will find all the corresponding layout components in reverse order to be able to render them within each other.
const findLayoutComponents = async (urlPath: string) => {
  const layoutComponents = [];
  let pathParts = urlPath.split("/").filter(Boolean);
  const routesIndex = pathParts.findIndex((part) => part === "routes");
  pathParts = pathParts.slice(routesIndex, pathParts.length);
  for (let i = pathParts.length - 1; i >= 0; i--) {
    const layoutComponent = (
      await import(
        path.resolve(
          process.cwd(),
          `${pathParts.slice(0, i + 1).join("/")}/layout.tsx`
        )
      )
    ).default;
    layoutComponents.push(layoutComponent);
  }
  return layoutComponents;
};

// ----------------------------
// Render messages
// ----------------------------
process.on("message", async ({ file, url }: { file: string; url: string }) => {
  try {
    const Page = (await import(file)).default;

    // ----------------------------
    // Wrap in timeout (5s)
    // ----------------------------
    const renderedPage = await Promise.race([
      Promise.resolve(React.createElement(Page)),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject("Render timeout"), 5000)
      ),
    ]);

    const urlPathParts = url.split("/").filter(Boolean);

    if (urlPathParts.length === 0) {
      const Layout = (await import(file.replace("page.tsx", "layout.tsx")))
        .default;
      const renderedLayout = await Promise.race([
        Promise.resolve(
          React.createElement(Layout, { children: renderedPage })
        ),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject("Render timeout"), 5000)
        ),
      ]);

      process.send?.({
        type: "render",
        html: renderToString(renderedLayout),
        url,
      });
      console.log(`[CHILD ${process.pid}] Rendered page for ${url}`);
      return;
    } else if (urlPathParts.length >= 1) {
      const layoutComponents = await findLayoutComponents(
        file.replace("page.tsx", "")
      );

      console.log(layoutComponents[0]);
      // for each layout make sure it is within the previous layout using a for loop after the for loop then we can return the rendered layout with the page within it.
      let renderedLayout = await Promise.race([
        Promise.resolve(
          React.createElement(layoutComponents[0], {
            children: renderedPage,
          })
        ),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject("Render timeout"), 5000)
        ),
      ]);

      for (let i = 1; i < layoutComponents.length; i++) {
        const Layout = layoutComponents[i];
        renderedLayout = (await Promise.race([
          Promise.resolve(
            React.createElement(Layout, { children: renderedLayout })
          ),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject("Render timeout"), 5000)
          ),
        ])) as any;
      }
      process.send?.({
        type: "render",
        html: renderToString(renderedLayout),
        url,
      });
      console.log(`[CHILD ${process.pid}] Rendered page for ${url}`);
    }

    process.send?.({ type: "render", html: renderToString(renderedPage), url });
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
