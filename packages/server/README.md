# @nestlyjs/server

The NestlyJS CLI and runtime. File-based full-stack rendering for React.

```sh
npm install @nestlyjs/server react react-dom
```

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
- `start` serves the production build and requires a prior build. Set `NESTLY_HTML_CACHE_SIZE` to change the page HTML cache size (`0` disables).

Static files live in `public/` and are served by extension-addressed paths.

## Development

- Dev child processes use `ts-node/register`.
- Production routes are compiled with esbuild and served by clustered workers.
- The package ships `dist/` and `tsconfig.devServer.json`. Verify with `node scripts/check-pack.mjs` in the repo.

See the repository README for the full route and configuration guide.

## License

MIT
