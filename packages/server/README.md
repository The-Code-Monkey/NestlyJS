# @nestlyjs/server

The NestlyJS CLI and runtime. File-based full-stack rendering for React.

> **Status: development only.** The development server, build, and production
> server work and are covered by integration tests, but NestlyJS is early-stage
> and not production-ready.

```sh
npm install @nestlyjs/server react react-dom
```

Requires Node.js 22.22 or newer.

## Routes

```text
routes/
  layout.tsx
  page.tsx
  api.ts
  blog/
    [slug]/
      page.tsx
      api.ts

public/
  logo.png
```

- Pages and layouts use default exports.
- Pages receive `{ params }`.
- API handlers use named exports matching HTTP methods and return `{ status, body }`.
- `"use client"` marks a component for browser hydration.
- Route groups `(name)` do not add a URL segment.

## Commands

```sh
nestly dev [--port=3000]
nestly build
nestly start [--port=3000]
```

`PORT` is used when `--port` is not provided. `--host` or `HOST` binds a specific interface.

- `dev` starts the clustered development server with live reload, CSS hot swap, and React Fast Refresh.
- `build` writes the production output to `.nestly/`.
- `start` serves the production build, requires a prior build, and exits with an error when `.nestly/manifest.json` is missing. Set `NESTLY_HTML_CACHE_SIZE` to change the page HTML cache size (`0` disables).

Static files live in `public/` and are served by extension-addressed paths.

## Package shape

This package installs the `nestly` command. It has no public library API: there
is no `main`, `types`, or `exports` entry point, so `import "@nestlyjs/server"`
resolves to nothing. Use the CLI.

Known gaps:

- Only `page.tsx`, `layout.tsx`, and `api.ts` are recognized; `.jsx` and `.ts`
  files with those names are ignored.
- 404 responses are plain text. There is no custom 404 or 500 page convention.
- `nestly start` requires a prior `nestly build` and caches rendered HTML per
  worker process.
- React Server Components, CSS modules, middleware, ISR, static export, and
  plugins are not implemented.

## Development

- Dev child processes use `ts-node/register`.
- Production routes are compiled with esbuild and served by clustered workers.
- The package ships `dist/` and `tsconfig.devServer.json`. Verify with `node scripts/check-pack.mjs` in the repo.

See the repository README for the full route and configuration guide.

## License

MIT
