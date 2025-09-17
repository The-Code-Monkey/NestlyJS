process.on("message", async (msg) => {
  const { url } = msg;

  // Example SSR logic
  const { renderPage } = require("./renderer");
  const html = await renderPage(url);

  process.send?.({ html });
});
