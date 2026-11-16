# @nestlyjs/server

## 0.2.1

### Patch Changes

- 42f9374: Fix `nestly dev` for apps installed from the registry. The development children let ts-node ignore application dependencies against the shipped `tsconfig.devServer.json`, which lives inside `node_modules` once installed, so no dependency matched the ignore and ESM-only dependencies such as `chokidar` and `@babel/core` were required as CommonJS. The children now receive the same compiler options directly and let Node's loader handle `node_modules`.
  
  `engines.node` is now `>=22.22`, which the shipped `chokidar` already required, and the installed-package smoke test now starts `nestly dev` and renders a Client Component.

## 0.2.0

### Minor Changes

- 4eebc72: Publish the first public release of `@nestlyjs/server`. The package installs the `nestly` command and provides the development server (`nestly dev`), the production build (`nestly build`), and the production server (`nestly start`). It is development-only and has no public library API.
  
  Release contents:
  
  - File routes (`page.tsx`, `layout.tsx`, `api.ts`) with nested layouts and React SSR.
  - Dynamic routes (`[param]`, `[...param]`, `[[...param]]`) and route groups, ranked static, dynamic, catch-all, then optional catch-all.
  - `"use client"` components that hydrate from one page bundle per page, with shared dependencies included once.
  - Plain CSS imports from pages, layouts, and client components, emitted base-to-specific.
  - API routes with named HTTP method exports, parsed JSON or text bodies, and a 1 MB limit.
  - Static assets from `public/` served by extension-addressed paths with `GET` and `HEAD`.
  - Production builds in `.nestly/` with hashed client assets, a manifest, and a clustered `nestly start`.
  - In-memory production HTML cache (`NESTLY_HTML_CACHE_SIZE`), graceful shutdown, and `--host`/`HOST` binding.
  - Development live reload over SSE, CSS hot swap, and React Fast Refresh for client components.
  - Child-process failures return a generic 500 and no longer echo internal worker state to the client.

## 0.2.0-next.0

### Minor Changes

- 4eebc72: Publish the first public release of `@nestlyjs/server`. The package installs the `nestly` command and provides the development server (`nestly dev`), the production build (`nestly build`), and the production server (`nestly start`). It is development-only and has no public library API.
  
  Release contents:
  
  - File routes (`page.tsx`, `layout.tsx`, `api.ts`) with nested layouts and React SSR.
  - Dynamic routes (`[param]`, `[...param]`, `[[...param]]`) and route groups, ranked static, dynamic, catch-all, then optional catch-all.
  - `"use client"` components that hydrate from one page bundle per page, with shared dependencies included once.
  - Plain CSS imports from pages, layouts, and client components, emitted base-to-specific.
  - API routes with named HTTP method exports, parsed JSON or text bodies, and a 1 MB limit.
  - Static assets from `public/` served by extension-addressed paths with `GET` and `HEAD`.
  - Production builds in `.nestly/` with hashed client assets, a manifest, and a clustered `nestly start`.
  - In-memory production HTML cache (`NESTLY_HTML_CACHE_SIZE`), graceful shutdown, and `--host`/`HOST` binding.
  - Development live reload over SSE, CSS hot swap, and React Fast Refresh for client components.
  - Child-process failures return a generic 500 and no longer echo internal worker state to the client.
