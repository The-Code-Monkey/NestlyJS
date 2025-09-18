import React from "react";
import { renderToString } from "react-dom/server";

console.log(`[CHILD ${process.pid}] Booting SSR child worker`);

// Signal ready immediately
setImmediate(() => {
  console.log(`[CHILD ${process.pid}] READY to handle requests`);
  process.send?.({ type: "ready" });
});

process.on("message", async ({ file, url }: { file: string; url: string }) => {
  try {
    console.log(`[CHILD ${process.pid}] Rendering page: ${file}`);
    const Page = (await import(file)).default;

    const html = renderToString(React.createElement(Page)); // <-- JSX fix
    process.send?.({ type: "render", html, url }); // <-- include url in render
    console.log(`[CHILD ${process.pid}] Rendered page for ${url}`);
  } catch (err) {
    console.error(`[CHILD ${process.pid}] Error rendering page:`, err);
    process.send?.({
      type: "render",
      html: "<h1>Error rendering page</h1>",
      url, // <-- always include url
    });
  }
});
