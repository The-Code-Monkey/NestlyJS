import React from "react";

export default function Layout({ children }) {
  return (
    <html>
      <head>
        <title>Test App</title>
      </head>
      <body>
        <header>
          <h1>Test App Header</h1>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
