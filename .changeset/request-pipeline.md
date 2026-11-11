---
"@nestlyjs/server": patch
---

Resolve each request once through one Request Pipeline decision. Development and production executors now consume the same client-asset, static-asset, Page, API, or not-found decision, so the dev server no longer resolves twice, the API module is not loaded for routing checks, and 404 policy and path validation live in one place.
