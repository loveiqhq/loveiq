/**
 * Glossary URLs that no longer have their own page, in CommonJS so `next.config.js`
 * (which loads before any TypeScript is compiled) and the tests read the same list.
 *
 * Keep entries for good: old links, bookmarks and search results keep pointing at them.
 * `__tests__/app/glossary-integrity.test.ts` checks every merged slug is gone and its
 * target is live; `e2e/glossary-crawl.spec.ts` checks the redirects and 404s served.
 */

/**
 * Duplicates merged into the page that had more to say (3 Nov 2026). next.config.js
 * turns each into a permanent (308) redirect, which search engines treat like a 301
 * and use to move the old URL's signals to the kept one.
 */
const GLOSSARY_MERGED = {
  // "Autonomic Nervous System" duplicated "Autonomic Nervous System (ANS)".
  "autonomic-nervous-system": "autonomic-nervous-system-ans",
  // "DADT" (filed under data privacy) duplicated the relationship term.
  dadt: "don-t-ask-don-t-tell-dadt",
  // The richer text now sits under the name the report chapter uses.
  "biochemical-reward-dynamics": "biochemical-reward-system-dynamics",
  // "Desire Mismatch" duplicated "Desire Discrepancy", the clinical term.
  "desire-mismatch": "desire-discrepancy",
};

/** The redirect rules next.config.js serves for GLOSSARY_MERGED. */
function glossaryRedirects() {
  return Object.entries(GLOSSARY_MERGED).map(([from, to]) => ({
    source: `/glossary/${from}`,
    destination: `/glossary/${to}`,
    permanent: true,
  }));
}

module.exports = { GLOSSARY_MERGED, glossaryRedirects };
