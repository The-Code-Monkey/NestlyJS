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
