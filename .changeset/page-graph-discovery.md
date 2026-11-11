---
"@nestlyjs/server": patch
---

Unify page asset discovery behind one Page Graph module. Client Components, Layouts, and CSS now follow one rule in `nestly dev`, Fast Refresh, and `nestly build`, so conditional Client Components join the Page Bundle and unreached render-time instances no longer decide what ships. CSS emits base-to-specific: Layouts outermost to innermost, then Page, then Client CSS. Equal-specificity cascade order may shift where nested Layouts styled the same selector.
