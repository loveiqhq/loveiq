# features/glossary

**Purpose:** `/glossary` index + `/glossary/[slug]` term pages.

**Entry:**

- `ui/GlossaryPage.tsx` — index listing (full-white). Renders from props: `app/glossary/page.tsx` passes the slim, sorted list from `logic/index-entries.ts`, so every term link is in the server HTML (crawlers run no JS). Never import the term data into a client component (a guard in `__tests__/app/glossary-integrity.test.ts` checks). The "View details" hover hint is CSS (`ui/glossary-index.css`).
- `ui/GlossaryTermPage.tsx` — individual term page (full-white).
- Shared chrome: white nav `@features/landing/ui/white/WNavSection` + `WFooterSection` (the glossary is full-white, matching the rest of the site — no glossary-specific nav).

**Data:** `data/glossary-data.ts` (~690KB, tracked), edited directly. The CSV source was never committed and `scripts/update-glossary.js` is retired. `__tests__/app/glossary-integrity.test.ts` checks slugs, related-term links and hard-coded term URLs.

**Belongs:** term rendering, glossary navigation.

**Does NOT belong:** other static content pages.
