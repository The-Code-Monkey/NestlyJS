# Page-level Fast Refresh with global React

Fast Refresh rebuilds a page's client bundle and re-evaluates it in the browser. React is supplied as a single global instance from a cached dev preamble, and app modules are transformed with `react-refresh/babel` so component registrations use stable file-based IDs. The HMR client installs the update, then calls `performReactRefresh()`.

Module-level ESM HMR would be more granular but requires a module graph and per-module boundaries. This page-level approach keeps the existing inline dev bundle model and was proven to preserve state with a jsdom regression test. Consequence: a client-file change re-evaluates the page's whole client bundle, and page, layout, API, and public asset changes still fall back to a full reload.
