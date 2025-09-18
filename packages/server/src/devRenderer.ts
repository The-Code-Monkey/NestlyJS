/**
 * Build a simple HTML page string for development containing the provided URL.
 *
 * The returned string is a complete HTML document (including `<!DOCTYPE html>`) whose body contains
 * an `<h1>` with the text `Dev page for ${url}` where `url` is the provided parameter.
 *
 * @param url - The URL or identifier to include in the page heading.
 * @returns A Promise that resolves to the HTML document as a string.
 */
export async function renderPage(url: string) {
  return `
    <!DOCTYPE html>
    <html>
      <head><title>Dev NestlyJS SSR</title></head>
      <body>
        <h1>Dev page for ${url}</h1>
      </body>
    </html>
  `;
}
