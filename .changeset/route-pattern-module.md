---
"@nestlyjs/server": patch
---

Unify route classification, matching, scoring, and ranking behind one Route Pattern module. The development filesystem resolver, the production manifest router, and the Build route collector now share one precedence scale, so a pattern emitted by the Build ranks the same at runtime.
