process.on("message", async (msg) => {
  const { url } = msg;
  const { renderPage } = require("./devRenderer");
  const html = await renderPage(url);

  process.send({ html });
});
