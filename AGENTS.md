# AGENTS.md

Onboarding guide for agents working on NestlyJS.

## What this project is

NestlyJS is an experimental full-stack framework for React websites, inspired by Next.js and NestJS but intended to stay simple. It provides file-based SSR pages and API routes, served by a cluster of Node.js workers.

The repository is a Yarn 1 workspace monorepo:

- `packages/server` — publishable `@nestlyjs/server` package and `nestly` CLI.
- `packages/test-app` — private integration fixture used by CI.

The project is early-stage. The development server is the only functional runtime path. Do not describe or treat it as production-ready.

## Current state

Working:

- `nestly dev` starts a clustered development server.
- `nestly build` compiles app routes and client assets into `.nestly/`.
- `nestly start` serves the production build with clustered SSR workers.
- `GET` requests resolve to `page.tsx` files and render through React SSR.
- Nested `layout.tsx` files are applied.
- `"use client"` components render static markup and hydrate from one page bundle.
- Plain CSS imports from pages, layouts, and client components are inlined per page.
- Pages cache HTML, JavaScript, and CSS until a file under `routes/` changes.
- Non-GET API requests resolve to named method exports in `api.ts`.
- Dynamic routes (`[param]`, `[...param]`, `[[...param]]`) capture route params; route groups `(name)` group files without affecting the URL.
- Static assets in `public/` are served by extension-addressed paths with `GET` and `HEAD`.
- API handlers receive parsed JSON or text request bodies, limited to 1 MB.
- Production renders pass through an in-memory HTML cache (`NESTLY_HTML_CACHE_SIZE`, default 100, 0 disables).
- `nestly dev` and `nestly start` accept `--host` or `HOST` and shut down gracefully on SIGTERM/SIGINT.
- Query strings and fragments are ignored during route lookup.
- Dev changes trigger live reload over SSE; route CSS changes hot swap without reload.
- Client component changes Fast Refresh while preserving React state.

## Architecture map

- `src/bin/nestly.ts` — CLI entry. `dev` calls `devServer.start`; `build` calls `buildApp`; `start` calls `prodServer.start`. Supports `--port` for dev and start.
- `src/devServer.ts` — primary process forks one worker per CPU core. Each worker routes in this order: static asset, GET page, API handler, 404. Dead workers restart automatically.
- `src/staticAssets.ts` — streams files from `process.cwd()/public` and `.nestly/client`, maps extensions to content types, and rejects traversal and symlink escapes.
- `src/routeResolver.ts` — maps URL paths to `process.cwd()/routes/<path>/page.tsx` and `api.ts`. Supports `[param]`, `[...param]`, `[[...param]]`, and `(group)` directories. Precedence: static, dynamic, catch-all, optional catch-all. Groups consume no URL segment. A GET prefers `page.tsx` over `api.ts`.
- `src/devSSRWorker.ts` — forks one child per URL path, passes route params, registers `ts-node/register`, watches all of `routes/`, and queues pending responses. Any route change restarts page children.
- `src/renderer.tsx` — shared SSR helpers: client detection, layout discovery, element walking, client wrapping, hydration markup, and asset injection.
- `src/devChildWorker.tsx` — renders the page with route params, caches HTML, JavaScript, and CSS per child, and inlines assets and the HMR client in development.
- `src/hmr.ts` — dev SSE endpoint, file watcher, live reload, CSS hot-swap, and Fast Refresh payloads.
- `src/devRefresh.ts` — dev bundler plugins: esbuild global React mapping, `react-refresh` Babel transforms, runtime preamble, and page client bundles.
- `src/bundler.ts` — bundles all client components on a page into a single dev bundle; `src/shim.ts` exposes React globals in the browser.
- `src/build.ts` — production build: compiles route entries, emits hashed client bundles and CSS, writes `.nestly/manifest.json`.
- `src/manifest.ts` — internal manifest types shared by build and runtime.
- `src/prodRouter.ts` — matches URL paths against manifest route patterns with the same precedence as the dev resolver.
- `src/prodServer.ts` — clustered production server: static assets, built client assets, cached SSR pages, API handlers, graceful shutdown, 404s.
- `src/requestBody.ts` — reads and parses API request bodies with a 1 MB limit.
- `src/htmlCache.ts` — small LRU cache for production page HTML.
- `src/devAPIWorker.ts` — forks one child per `METHOD:URL`, watches the API file, and queues pending responses.
- `src/devAPIChild.ts` — dynamically imports the API file and invokes the named HTTP method export with `method`, `url`, `headers`, `body`, and `params`. The handler must return `{ status, body }`.

## Commands

```sh
yarn install --frozen-lockfile
yarn workspace @nestlyjs/server build
PORT=4000 yarn workspace test-app dev
PORT=4000 yarn workspace test-app start
yarn workspace test-app test:routes
yarn build
yarn test
node scripts/check-pack.mjs
yarn changeset
```

## Conventions

- TypeScript with `strict: true`.
- CommonJS modules. Dev child processes rely on `ts-node/register`.
- React 19.
- Yarn 1.22.22, pinned through `.yarnrc`.
- Node 26 in `.nvmrc`; root `engines` allows `>=20`.
- Route app root is `process.cwd()`.
- Pages and layouts use a default export.
- API routes use named exports matching HTTP methods, such as `GET`, `POST`, `PUT`.
- Changes to `@nestlyjs/server` need a `.changeset` entry.
- Renovate automerge is enabled.
- Vitest with v8 coverage. Run `yarn test` from the repo root.
- The server package ships only `dist/` and `tsconfig.devServer.json`. Verify with `node scripts/check-pack.mjs` after building.

## Known gaps and warnings

- Unit tests cover `packages/server/src` at 100% lines, statements, and functions. Branch coverage is not at 100%.
- Fast Refresh applies to client components. Page, layout, API, and public asset changes still reload. State resets when hook order changes.
- Nested layout resolution relies on string replacement and cwd-relative paths.
- Worker failures are surfaced as generic 500 responses. Custom 404/500 pages are not implemented.

## Rules for agents

- Read `src/routeResolver.ts` before changing routing.
- Keep the CommonJS and `ts-node/register` development model unless the task explicitly changes it.
- Do not add dependencies without a clear need.
- Add a changeset when modifying `packages/server`.
- Run the server build, unit tests, and a dev-server smoke test after behavior changes. Run the production build/start suite for runtime changes.
- Do not assume the production path works.
- Prefer fixing the existing architecture over layering new abstractions on stale files.

## Agent skills

### Issue tracker

GitHub Issues in `The-Code-Monkey/NestlyJS`, via `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five roles, label strings unchanged. See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context: root `GLOSSARY-MAP.md` points to per-context glossaries; system-wide ADRs in `docs/adr/`. See `docs/agents/domain.md`.
