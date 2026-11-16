---
"@nestlyjs/server": patch
---

Close the remaining gaps between the specification issues and the runtime.

- Page Graph import scanning now keeps a side-effect import that precedes a `from` import, so CSS imported before React reaches the Page, the Build, and HMR.
- Development render failures return a 500 response instead of an error page with a 200 status.
- `nestly start` fails before forking when no build exists instead of restarting workers forever.
- HMR reloads changes to non-client route files instead of sending a Fast Refresh payload that cannot update server HTML.
- `nestly dev` shuts down gracefully on SIGTERM, SIGINT, or cluster disconnect, closing HMR streams and the HTTP server.
- Equal-specificity routes keep the adapter's directory order, matching ADR 0002.
- Development API requests with an invalid body now return the missing-method 404 before the body error, matching production.
- Request dispatch uses one URL path policy and one not-found policy; the development and production executors consume a single decision without resolving or decoding again.
- Hydration root ids are owned by the Page Document module instead of being reconstructed by the renderer.
