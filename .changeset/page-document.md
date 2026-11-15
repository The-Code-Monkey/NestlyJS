---
"@nestlyjs/server": patch
---

Assemble every Page through one pure Page Document module. Development and production now differ only in their asset plan and cache, so head and body injection order, hydration markup, and empty-asset behavior cannot drift between `nestly dev` and `nestly start`.
