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
- `GET` requests resolve to `page.tsx` files and render through React SSR.
- Nested `layout.tsx` files are applied.
- `"use client"` components render static markup and hydrate from one page bundle.
- Plain CSS imports from pages, layouts, and client components are inlined per page.
- Pages cache HTML, JavaScript, and CSS until a file under `routes/` changes.
- Non-GET API requests resolve to named method exports in `api.ts`.
- Dynamic routes (`[param]`, `[...param]`, `[[...param]]`) capture route params; route groups `(name)` group files without affecting the URL.
- Query strings and fragments are ignored during route lookup.

Incomplete or stale:

- `nestly start` is not implemented. It exits with an error.
- No static asset serving.
- No production build pipeline for application routes.

## Architecture map

- `src/bin/nestly.ts` — CLI entry. `dev` calls `devServer.start` and supports `--port`. `start` is not implemented.
- `src/devServer.ts` — primary process forks one worker per CPU core. Each worker routes in this order: GET page, API handler, 404. Dead workers restart automatically.
- `src/routeResolver.ts` — maps URL paths to `process.cwd()/routes/<path>/page.tsx` and `api.ts`. Supports `[param]`, `[...param]`, `[[...param]]`, and `(group)` directories. Precedence: static, dynamic, catch-all, optional catch-all. Groups consume no URL segment. A GET prefers `page.tsx` over `api.ts`.
- `src/devSSRWorker.ts` — forks one child per URL path, passes route params, registers `ts-node/register`, watches all of `routes/`, and queues pending responses. Any route change restarts page children.
- `src/devChildWorker.tsx` — renders the page with route params, applies layouts from the route directory, walks the element tree, wraps `"use client"` components, and emits SSR, CSS, and hydration HTML. Caches HTML, JavaScript, and CSS per child.
- `src/bundler.ts` — bundles all client components on a page into a single esbuild bundle with shared dependencies once; `src/shim.ts` exposes React globals in the browser.
- `src/devAPIWorker.ts` — forks one child per `METHOD:URL`, watches the API file, and queues pending responses.
- `src/devAPIChild.ts` — dynamically imports the API file and invokes the named HTTP method export with `method`, `url`, `headers`, `body`, and `params`. The handler must return `{ status, body }`.

## Commands

```sh
yarn install --frozen-lockfile
yarn workspace @nestlyjs/server build
PORT=4000 yarn workspace test-app dev
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
- HMR, static asset serving, and the production build are not implemented. See `docs/ROADMAP.md`.
- Nested layout resolution relies on string replacement and cwd-relative paths.
- Worker failures are surfaced as generic 500 responses.

## Rules for agents

- Read `src/routeResolver.ts` before changing routing.
- Keep the CommonJS and `ts-node/register` development model unless the task explicitly changes it.
- Do not add dependencies without a clear need.
- Add a changeset when modifying `packages/server`.
- Run the server build and a dev-server smoke test after behavior changes.
- Do not assume the production path works.
- Prefer fixing the existing architecture over layering new abstractions on stale files.
