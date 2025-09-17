import React from "react";

export function Layout({ children }: { children: React.ReactNode }) {
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
