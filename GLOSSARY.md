# NestlyJS

A file-based full-stack framework for React sites. Routes live in the app's `routes/` directory and resolve to server-rendered pages or HTTP API handlers. The development server is the only implemented runtime.

## Language

**Route**:
A URL path owned by a directory under the app's `routes/` root.
_Avoid_: Endpoint, path (when referring to the directory contract)

**Page**:
A route's default-rendered React view, defined by `page.tsx` in the route directory.
_Avoid_: Screen, view

**Layout**:
A React wrapper declared by `layout.tsx` in a route directory. Layouts apply to pages in that directory and its descendants.
_Avoid_: Shell, template

**API Route**:
A route handler defined by `api.ts`, exposing named exports that match HTTP methods.
_Avoid_: Endpoint, REST route

**Server Component**:
A React component that renders only on the server and sends no JavaScript to the browser.
_Avoid_: Server-side component, static component

**Client Component**:
A component marked with a `"use client"` directive. It renders on the server and hydrates in the browser.
_Avoid_: Client-side component, interactive component

**Hydration**:
The browser process that attaches React event handlers to server-rendered markup for a client component.
_Avoid_: Re-render, bootstrapping

**Page Bundle**:
The JavaScript sent for one page, containing all of that page's client components and their shared dependencies exactly once.
_Avoid_: Chunk, vendor bundle, client bundle

**Development Server**:
The clustered runtime started by `nestly dev`. It is the only implemented server mode.
_Avoid_: Dev mode, local server
