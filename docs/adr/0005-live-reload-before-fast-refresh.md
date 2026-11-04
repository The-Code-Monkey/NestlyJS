# Live reload before React Fast Refresh

The first HMR slice adds an SSE endpoint, automatic full-page reloads for route, API, and public asset changes, and CSS hot swap for stylesheets under `routes/`. React Fast Refresh is deferred.

State-preserving Fast Refresh requires switching dev client bundles from inline IIFE to ESM, adding a module graph and the `react-refresh` runtime. Shipping live reload and CSS swap first gives immediate feedback with the existing inline bundle model. Consequence: client component state is lost on code changes until Fast Refresh lands, and the dev bundle format stays as-is for now.
