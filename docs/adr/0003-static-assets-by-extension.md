# Static assets use extension-addressed paths

Static files live in the app-root `public/` directory and are addressed by URL paths whose last segment has a file extension, such as `/logo.png`. Application routes never use file extensions. A static-looking path with no matching file returns 404 and never falls back to a route, so catch-all routes cannot swallow asset requests. Files are streamed with `GET` and `HEAD`, with `Cache-Control: no-store` in development. Consequence: extensionless public files are not served, and route paths must stay extensionless.
