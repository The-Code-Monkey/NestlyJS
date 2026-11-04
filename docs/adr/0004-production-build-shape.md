# Production build compiles routes and serves hashed assets

`nestly build` compiles each page and API entry with esbuild to CommonJS, bundles client components with ESM code splitting, and writes a manifest to `.nestly/`. React stays external on the server and resolves from the app root. Client assets are content-hashed under `/_nestly/client/`, with shared chunks for React and common dependencies. `nestly start` loads the manifest and renders in-process in cluster workers instead of forking a child per route.

The alternative of shipping `ts-node` and reading route source at runtime would keep dev and production closer, but it makes production startup slower and depends on TypeScript at runtime. Runtime filesystem matching was also rejected because hashed client filenames and build-time layout discovery need an explicit manifest. Consequence: the build output contract is now explicit, and changing it requires rebuilding apps.
