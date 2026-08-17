import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Report 2.0 section copy is keyed to the PRIMARY archetype server-side
 * (`getReport2Section(primaryArchetype, …)` in app/api/report/route.ts). An
 * `all_reports` reader can browse the other 13 via `?archetype=<slug>`, and the
 * established handoff is to pass `null` for that copy so the section renders
 * nothing rather than presenting the primary archetype's content as the browsed
 * archetype's.
 *
 * Fifteen sections did this; `beliefsCopy` was missed, so browsing Spark Seeker
 * showed Relational Nurturer's keep/loosen beliefs verbatim. Rendering ReportPage
 * here would need the full ~1.3MB report payload as a fixture, so this pins the
 * invariant at the source level instead — cheap, and it fails loudly when a new
 * Report 2.0 section is wired up without the guard.
 */
const SOURCE = readFileSync(join(process.cwd(), "features/report/ui/ReportPage.tsx"), "utf8");

/**
 * Copies deliberately NOT guarded, with the reason. These are Part I sections
 * describing the reader (their findings, their insight map, their sexual stage,
 * their comparison stats) rather than a Part II archetype chapter. Their copy is
 * still primary-keyed, so browsing another archetype shows the reader's own
 * values — a product decision, not an oversight. Revisit together if the browse
 * view should describe the browsed archetype throughout.
 */
const KNOWN_UNGUARDED = new Set(["snapshotCopy", "findingsCopy", "mapCopy", "stageCopy"]);

describe("ReportPage — cross-archetype copy handoff", () => {
  it("passes every Report 2.0 section copy through the primary-view guard", () => {
    // Matches `copy={xxxCopy}` — i.e. handed straight through, unguarded.
    const unguarded = Array.from(SOURCE.matchAll(/copy=\{(\w+Copy)\}/g))
      .map((m) => m[1])
      .filter((name) => !KNOWN_UNGUARDED.has(name));

    expect(
      unguarded,
      `These Report 2.0 copies are passed unguarded, so browsing another archetype ` +
        `renders the PRIMARY archetype's content as if it were theirs. Wrap them as ` +
        `\`copy={isPrimaryView ? xCopy : null}\` (see attachmentCopy), or add to ` +
        `KNOWN_UNGUARDED with a reason.`
    ).toEqual([]);
  });

  it("keeps beliefs guarded specifically", () => {
    // The regression that prompted this test.
    expect(SOURCE).toContain("copy={isPrimaryView ? beliefsCopy : null}");
  });

  it("strips the accelerators takeaway — its only per-archetype slot — off-primary", () => {
    // Accelerator ROWS come from `archetypeContent` and already switch correctly,
    // so nulling the whole copy would needlessly blank the universal educational
    // header. Only `takeaway` is primary-keyed.
    expect(SOURCE).toMatch(/accelCopyForView[\s\S]{0,200}takeaway: null/);
    expect(SOURCE).toContain("copy={accelCopyForView}");
  });
});
