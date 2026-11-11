# NestlyJS

A file-based full-stack framework for React sites. Routes live in the app's `routes/` directory and resolve to server-rendered pages or HTTP API handlers. The development server is the only implemented runtime.

## Language

**Route**:
A URL path owned by a directory under the app's `routes/` root.
_Avoid_: Endpoint, path (when referring to the directory contract)

**Page**:
A route's default-rendered React view, defined by `page.tsx` in the route directory.
_Avoid_: Screen, view

**Dynamic Route**:
A route whose directory name uses a bracketed segment to match URL segments.
_Avoid_: Wildcard route, parameterized path

**Catch-All Route**:
A dynamic route named `[...param]` that matches one or more remaining URL segments as a param array.
_Avoid_: Splat route, wildcard route

**Optional Catch-All Route**:
A dynamic route named `[[...param]]` that matches zero or more remaining URL segments. With zero segments the param is undefined.
_Avoid_: Splat route, wildcard route

**Route Group**:
A directory named `(name)` that organizes routes and layouts without adding a URL segment.
_Avoid_: Layout folder, namespace folder

**Route Params**:
The named values captured from a dynamic route's URL segments.
_Avoid_: Query params, search params, URL variables

**Static Asset**:
A file served from the Public Directory, addressed by a URL path that ends with a file extension.
_Avoid_: Resource, media file

**Public Directory**:
The app-root `public/` directory whose files are served from the URL root.
_Avoid_: Assets folder, static folder

**Build**:
The process that compiles an app's routes and client components into deployable output.
_Avoid_: Compile step, bundle step

**Build Output**:
The `.nestly/` directory produced by a build.
_Avoid_: Dist folder, artifact folder

**Manifest**:
The build index that maps route patterns to compiled server entries and client assets.
_Avoid_: Route table, asset map

**Hot Module Replacement (HMR)**:
Development updates that apply without a full page reload when possible.
_Avoid_: Live reload, fast refresh

**Live Reload**:
A development full-page reload triggered by a file change.
_Avoid_: HMR, hot reload

**CSS Hot Swap**:
Replacing the active stylesheet in place without reloading the page.
_Avoid_: Style HMR, CSS injection

**Fast Refresh**:
A development update that replaces changed client components while preserving their React state.
_Avoid_: Hot reload, live reload

**Request Body**:
The parsed payload passed to an API handler as `body`. JSON content types parse to values; others stay text.
_Avoid_: Payload, input

**HTML Cache**:
An in-memory production cache of rendered page HTML keyed by URL path.
_Avoid_: Page cache, SSR cache

**Graceful Shutdown**:
Stopping acceptance of new work, letting in-flight requests finish, then exiting.
_Avoid_: Hard stop, kill

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
