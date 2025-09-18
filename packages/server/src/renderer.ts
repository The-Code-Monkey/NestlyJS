/**
 * Renders a minimal server-side HTML document for a given URL.
 *
 * The function returns a small HTML page (doctype, head, body) with the provided
 * `url` interpolated into an `<h1>` as "Page for {url}".
 *
 * Note: `url` is inserted verbatim and is not escaped or validated by this function.
 *
 * @param url - The requested URL or path to display in the page header.
 * @returns A Promise that resolves to the generated HTML string.
 */
export async function renderPage(url: string) {
  // Example SSR logic
  return `
    <!DOCTYPE html>
    <html>
      <head><title>NestlyJS SSR</title></head>
      <body>
        <h1>Page for ${url}</h1>
      </body>
    </html>
  `;
}
