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
