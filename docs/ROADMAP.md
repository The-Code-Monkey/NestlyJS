# Roadmap

## Version 1 — development only

- File routes: `page.tsx`, `layout.tsx`, `api.ts` under `routes/`.
- Dynamic routes: `[param]`, catch-all `[...param]`, and optional catch-all `[[...param]]`, with route params.
- Route groups `(name)` organize routes and layouts without adding URL segments.
- Route precedence: static, dynamic, catch-all, then optional catch-all.
- Server-rendered pages with nested layouts.
- Client components with `"use client"` and hydration.
- One page bundle per page; shared dependencies such as React included once.
- Plain CSS imports from pages, layouts, and client components.
- Static assets served from `public/` by extension-addressed paths, streamed with `GET` and `HEAD`.
- HTML, JavaScript, and CSS cached per page; any route file change triggers a full reload.
- API handlers return `{ status, body }` with a JSON body.
- Query strings and fragments are ignored during route lookup.

## Version 2

- Hot module replacement (HMR). Version 1 uses full page reloads.
- Production build and `nestly start`.

## Deferred

- React Server Components.
- CSS modules and PostCSS pipelines.
- Middleware, edge runtime, and ISR.
- Static export.
- Plugin system.
