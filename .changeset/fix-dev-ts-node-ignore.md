---
"@nestlyjs/server": patch
---

Fix `nestly dev` for apps installed from the registry. The development children let ts-node ignore application dependencies against the shipped `tsconfig.devServer.json`, which lives inside `node_modules` once installed, so no dependency matched the ignore and ESM-only dependencies such as `chokidar` and `@babel/core` were required as CommonJS. The children now receive the same compiler options directly and let Node's loader handle `node_modules`.

`engines.node` is now `>=22.22`, which the shipped `chokidar` already required, and the installed-package smoke test now starts `nestly dev` and renders a Client Component.
