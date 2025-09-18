import React from "react";

/**
 * Root layout component that renders a complete HTML document skeleton for the app.
 *
 * Renders a <head> with the title "Test App", a header with "Test App Header", and places
 * the provided `children` inside the page's main content area.
 *
 * @param children - Content to render inside the `<main>` element.
 * @returns The layout as a JSX element representing the full HTML document.
 */
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
