---
"@nestlyjs/server": patch
---

Run the development runtime with `tsx` and update TypeScript to 7. TypeScript 7 no longer exposes the compiler API `ts-node` depends on, so the development children and test setup use the esbuild-based `tsx` loader instead.
