# NestlyJS

A small full-stack framework for React sites. File-based routes, server rendering, API handlers, and client components. Built to sit between Next.js and NestJS without their configuration weight.

## Status

Early development. The dev server and production server both work. APIs may change before 1.0.

Working:

- `page.tsx`, `layout.tsx`, and `api.ts` routes under `routes/`
- Static, dynamic `[param]`, catch-all `[...param]`, optional `[[...param]]`, and `(group)` routes
- Server-rendered pages with nested layouts
- `"use client"` components with hydration
- Plain CSS imports from pages, layouts, and client components
- Static files from `public/`
- Dev live reload, CSS hot swap, and React Fast Refresh
- Production build and clustered `nestly start`

See [docs/ROADMAP.md](./docs/ROADMAP.md) for the current scope and deferred features.

## Requirements

- Node.js 20 or newer
- React 19 and React DOM 19 as peer dependencies

## Install

From this workspace:

```sh
yarn install
yarn workspace @nestlyjs/server build
```

Published package, once released:

```sh
npm install @nestlyjs/server react react-dom
```

## Quick start

Create an app directory with `routes/`.

`routes/layout.tsx`:

```tsx
import React from "react";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <head>
        <title>My App</title>
      </head>
      <body>{children}</body>
    </html>
  );
}
```

`routes/page.tsx`:

```tsx
import React from "react";
import Counter from "./counter";

export default function Home() {
  return (
    <main>
      <h1>Hello</h1>
      <Counter />
    </main>
  );
}
```

`routes/counter.tsx`:

```tsx
"use client";

import React, { useState } from "react";

export default function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

`routes/api.ts`:

```ts
export async function POST() {
  return { status: 200, body: { ok: true } };
}
```

Run:

```sh
npx nestly dev --port=3000
```

Production:

```sh
npx nestly build
npx nestly start --port=3000
```

`nestly start` reads `.nestly/manifest.json`, so run `nestly build` first.

## Routes

- `routes/page.tsx` → `/`
- `routes/blog/page.tsx` → `/blog`
- `routes/blog/[slug]/page.tsx` → `/blog/:slug`
- `routes/docs/[...path]/page.tsx` → `/docs/:path*`
- `routes/shop/[[...path]]/page.tsx` → `/shop` and `/shop/:path*`
- `routes/(marketing)/about/page.tsx` → `/about`
- `routes/.../api.ts` → API methods named `GET`, `POST`, `PUT`, and so on

Precedence: static, dynamic, catch-all, optional catch-all. Route groups add no URL segment.

Pages and layouts use a default export. Pages receive `{ params }`. API handlers receive `{ method, url, headers, body, params }` and return `{ status, body }`.

## Static assets

Files in `public/` are served from the URL root by extension-addressed paths:

```text
public/logo.png → /logo.png
```

Requests that look like static assets never fall back to routes. Missing assets return 404.

## Development commands

```sh
yarn test
node scripts/check-pack.mjs
yarn changeset
```

From the repo root, run the server and test app explicitly:

```sh
yarn workspace @nestlyjs/server build
PORT=4000 yarn workspace test-app dev
yarn workspace test-app test:routes
```

## Documentation

- [Roadmap](./docs/ROADMAP.md)
- [Glossary](./GLOSSARY.md)
- [Architecture decisions](./docs/adr/)
- [Agent guide](./AGENTS.md)

## License

MIT
