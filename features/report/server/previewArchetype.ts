import { KNOWN_ARCHETYPES } from "./archetypeSlug";

/**
 * STAGING ONLY — render an existing report AS ANOTHER ARCHETYPE.
 *
 * `?preview_archetype=Spark%20Seeker` on a report URL makes every per-archetype
 * chapter resolve for that archetype instead of the one the submission actually
 * scored. It exists because there is no other way to review an archetype's report
 * end to end: the four staff tokens are all Relational Nurturer, real reports for
 * other archetypes belong to real people and are paywalled, and browsing to
 * another archetype inside a report deliberately renders no per-archetype copy
 * (`isPrimaryView` in `ReportPage`).
 *
 * Returning the overridden name is enough for the whole report to follow:
 * `primaryArchetype` is what every copy lookup, the unlock resolution and
 * `isPrimaryView` are keyed to.
 *
 * WHAT IT DOES NOT CHANGE: the submission's own scoring. The archetype
 * PERCENTAGES, the constellation and the snapshot answers still come from the
 * underlying response, so the probability chapter will not agree with the
 * archetype named above it. That is fine for reviewing chapter copy and wrong for
 * anything else.
 *
 * It also does not touch the access plan. An override on a locked report stays
 * locked — it changes WHICH archetype's chapters are resolved, never whether the
 * reader is entitled to them.
 *
 * GUARDS. Two, both required:
 *   - never on production (`NEXT_PUBLIC_SITE_URL`, the same test
 *     `app/practice-preview` uses). Without this the parameter would hand anyone
 *     holding one paid report the paid copy of all fourteen.
 *   - the value must be exactly one of `KNOWN_ARCHETYPES`, so it cannot be used
 *     to probe for arbitrary copy keys.
 */
export function resolvePreviewArchetype(
  requested: string | null,
  scored: string,
  siteUrl: string | undefined = process.env.NEXT_PUBLIC_SITE_URL
): string {
  if (!requested) return scored;

  const site = siteUrl ?? "";
  const isProduction = /\/\/(www\.)?loveiq\.org\b/.test(site) && !site.includes("staging");
  if (isProduction) return scored;

  const match = KNOWN_ARCHETYPES.find((name) => name === requested);
  return match ?? scored;
}
