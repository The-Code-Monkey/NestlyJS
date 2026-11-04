# Roadmap

## Version 1 — development only

- File routes: `page.tsx`, `layout.tsx`, `api.ts` under `routes/`.
- Server-rendered pages with nested layouts.
- Client components with `"use client"` and hydration.
- One page bundle per page; shared dependencies such as React included once.
- Plain CSS imports from pages, layouts, and client components.
- HTML, JavaScript, and CSS cached per page; any route file change triggers a full reload.
- API handlers return `{ status, body }` with a JSON body.
- Query strings and fragments are ignored during route lookup.

## Version 2

- Hot module replacement (HMR). Version 1 uses full page reloads.
- Dynamic routes such as `routes/blog/[slug]/page.tsx`, with route params.
- Static asset serving, including `/public`.
- Production build and `nestly start`.

## Deferred

- React Server Components.
- CSS modules and PostCSS pipelines.
- Middleware, edge runtime, and ISR.
- Static export.
- Plugin system.
