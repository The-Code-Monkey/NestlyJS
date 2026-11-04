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
- `"use client"` components render static markup and include an inline hydration script.
- Non-GET API requests resolve to named method exports in `api.ts`.

Incomplete or stale:

- `nestly start` is incomplete. `src/prodServer.ts` requires `prodAPIWorker.ts` and `prodSSRWorker.ts`, which do not exist.
- `src/apiWorker.ts`, `src/ssrWorker.ts`, `src/childWorker.ts`, `src/apiChild.ts`, `src/renderer.ts`, `src/devRenderer.ts`, and `src/client.tsx` are stale or unwired. Treat them as historical examples, not the live architecture.
- No static asset serving.
- No production build pipeline for application routes.

## Architecture map

- `src/bin/nestly.ts` — CLI entry. `dev` calls `devServer.start`; `start` calls `prodServer.start`. Supports `--port` and `--workers`.
- `src/devServer.ts` — primary process forks one worker per CPU core. Each worker routes in this order: GET page, API handler, 404. Dead workers restart automatically.
- `src/routeResolver.ts` — maps URL paths to `process.cwd()/routes/<path>/page.tsx` and `api.ts`. A GET prefers `page.tsx` over `api.ts`.
- `src/devSSRWorker.ts` — forks one child per URL path, registers `ts-node/register`, watches the page file with chokidar, and queues pending responses.
- `src/devChildWorker.ts` — renders the page, applies layouts from the URL path, detects `"use client"`, and emits SSR or hydration HTML.
- `src/devAPIWorker.ts` — forks one child per `METHOD:URL`, watches the API file, and queues pending responses.
- `src/devAPIChild.ts` — dynamically imports the API file and invokes the named HTTP method export. The handler must return `{ status, body }`.

## Commands

```sh
yarn install --frozen-lockfile
yarn workspace @nestlyjs/server build
PORT=4000 yarn workspace test-app dev
yarn workspace test-app test:routes
yarn build
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
- No lint, formatter, or test framework is configured.

## Known gaps and warnings

- `packages/test-app/routes/api.ts` calls `res.json(...)` and returns nothing. The runtime expects handlers to return `{ status, body }`. These handlers are incompatible with the current API worker.
- `packages/test-app/test/routes.test.ts` expects `/about` and `/contact` routes that do not exist.
- CI starts the dev server but never runs `test:routes`. Passing CI does not prove routing or API behavior.
- Query strings are not stripped from `req.url`, so route lookup can fail for URLs like `/page?x=1`.
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
