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

/**
 * Terms removed with no replacement (3 Nov 2026): features LoveIQ doesn't have, and two
 * entries whose definition was a placeholder. They answer 404, which search engines
 * treat like 410 and drop. A redirect would be wrong here: sending a removed page to an
 * unrelated one (say, the index) gets treated as a "soft 404" anyway.
 */
const GLOSSARY_REMOVED = [
  "deep-survey",
  "soft-survey",
  "micro-quiz",
  "match-iq",
  "growth-report",
  "growth-report-your-intimacy-journey",
  "growth-potentials",
  "longitudinal-deltas",
  "targeted-boosts",
  "progressive-precision",
  "reflective-prompts",
  "pattern-libraries-by-modality",
  "research-grade-dataset",
  "context-sensitive-assessments",
  "anonymized-research-access",
  "controlled-research-environments",
  "tiered-access-approach",
  "gates-guardrails",
  // Placeholder definitions ("A glossary entry for …"):
  "interpretive-depth",
  "privacy-constraints",
];

/** The redirect rules next.config.js serves for GLOSSARY_MERGED. */
function glossaryRedirects() {
  return Object.entries(GLOSSARY_MERGED).map(([from, to]) => ({
    source: `/glossary/${from}`,
    destination: `/glossary/${to}`,
    permanent: true,
  }));
}

module.exports = { GLOSSARY_MERGED, GLOSSARY_REMOVED, glossaryRedirects };
