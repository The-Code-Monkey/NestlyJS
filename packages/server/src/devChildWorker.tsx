import React from "react";
import { renderToString } from "react-dom/server";

console.log(`[CHILD ${process.pid}] Booting child worker`);

setImmediate(() => {
  console.log(`[CHILD ${process.pid}] READY to handle requests`);
  process.send?.({ type: "ready" });
});

process.on("message", async ({ file, url }: { file: string; url: string }) => {
  try {
    console.log(`[CHILD ${process.pid}] Rendering page: ${file}`);
    const Page = (await import(file)).default;
    const html = renderToString(<Page />);
    process.send?.({ type: "render", html });
    console.log(`[CHILD ${process.pid}] Rendered page for ${url}`);
  } catch (err) {
    console.error(`[CHILD ${process.pid}] Error rendering page:`, err);
    process.send?.({ type: "render", html: "<h1>Error rendering page</h1>" });
  }
});
