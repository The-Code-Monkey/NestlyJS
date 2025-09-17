import tsNode from "ts-node";
import React from "react";
import ReactDOMServer from "react-dom/server";

// Enable ts-node to run TSX directly
tsNode.register({ transpileOnly: true, compilerOptions: { module: "commonjs", jsx: "react-jsx" } });

process.on("message", async (msg) => {
  const { file, url } = msg;

  try {
    // Dynamically import page component
    const Page = require(file).default;

    // Render React component to HTML
    const html = ReactDOMServer.renderToString(React.createElement(Page, { url }));

    process.send({ html });
  } catch (err) {
    console.error("SSR Child error:", err);
    process.send({ html: "<h1>Error rendering page</h1>" });
  }
});
