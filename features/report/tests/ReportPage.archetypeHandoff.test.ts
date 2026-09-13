import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Report 2.0 section copy is resolved SERVER-SIDE, for one archetype at a time.
 *
 * It used to be resolved for the reader's PRIMARY archetype only
 * (`getReport2Section(primaryArchetype, …)` in app/api/report/route.ts), and the
 * client — knowing the payload could only describe the primary — passed `null`
 * for every section when the reader was browsing a different one, so the section
 * rendered nothing rather than presenting the primary's content as the browsed
 * archetype's. Correct as far as it went, but it meant a `core` buyer (top 3) or
 * an `all_reports` buyer (all 14) who opened one of the other archetype links in
 * their email got section shells, feedback widgets, and nothing in between: a
 * blank report for something they had paid for (EC, 2026-09-05).
 *
 * The route now resolves the copy for the archetype being VIEWED and echoes it
 * back as `contentArchetype`; the guard stays, asking the honest question —
 * "does this payload describe what is on screen?" — which still holds for the
 * two cases where it does not: a reader asking for an archetype they have not
 * bought (server falls back to primary), and the instant after a view switch
 * before the refetch lands.
 *
 * Rendering ReportPage here would need the full ~1.3MB report payload as a
 * fixture, so this pins the invariant at the source level instead — cheap, and it
 * fails loudly when a new Report 2.0 section is wired up without the guard, or
 * when the server quietly goes back to primary-keying the chapters.
 */
const SOURCE = readFileSync(join(process.cwd(), "features/report/ui/ReportPage.tsx"), "utf8");
const ROUTE = readFileSync(join(process.cwd(), "app/api/report/route.ts"), "utf8");
const HOOK = readFileSync(join(process.cwd(), "features/report/ui/hooks/useReportData.ts"), "utf8");

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
  it("passes every Report 2.0 section copy through the view guard", () => {
    // Matches `copy={xxxCopy}` — i.e. handed straight through, unguarded.
    const unguarded = Array.from(SOURCE.matchAll(/copy=\{(\w+Copy)\}/g))
      .map((m) => m[1])
      .filter((name) => !KNOWN_UNGUARDED.has(name));

    expect(
      unguarded,
      `These Report 2.0 copies are passed unguarded, so a payload built for a ` +
        `different archetype renders as if it were the one on screen. Wrap them as ` +
        `\`copy={hasArchetypeCopy ? xCopy : null}\` (see attachmentCopy), or add to ` +
        `KNOWN_UNGUARDED with a reason.`
    ).toEqual([]);
  });

  it("keeps beliefs guarded specifically", () => {
    // The regression that prompted this test.
    expect(SOURCE).toContain("copy={hasArchetypeCopy ? beliefsCopy : null}");
  });

  it("asks whether the payload describes the archetype on screen, not the primary", () => {
    // `viewArchetype === primaryArchetype` is the stale question: it blanks every
    // chapter for a reader browsing an archetype they legitimately own.
    expect(SOURCE).toContain("const hasArchetypeCopy = viewArchetype === contentArchetype;");
    expect(
      SOURCE,
      "the guard must not go back to comparing against the primary archetype"
    ).not.toMatch(/hasArchetypeCopy = viewArchetype === primaryArchetype/);
  });

  it("strips the accelerators takeaway — its only per-archetype slot — off-primary", () => {
    // Accelerator ROWS come from `archetypeContent` and already switch correctly,
    // so nulling the whole copy would needlessly blank the universal educational
    // header. Only `takeaway` is primary-keyed.
    expect(SOURCE).toMatch(/accelCopyForView[\s\S]{0,200}takeaway: null/);
    expect(SOURCE).toContain("copy={accelCopyForView}");
  });

  it("resolves the browsed archetype server-side, validated against what was bought", () => {
    // Trusting the query string here would hand any visitor with a report link
    // every archetype's premium copy.
    expect(ROUTE).toMatch(
      /const requestedArchetype = fromArchetypeSlug\(url\.searchParams\.get\("archetype"\)\)/
    );
    expect(ROUTE).toMatch(
      /requestedArchetype && unlockedArchetypes\.includes\(requestedArchetype\)/
    );
    // ...and it must reach the client, or the guard above can never be true.
    expect(ROUTE).toMatch(/^\s*contentArchetype,$/m);
  });

  it("keys the Part II+ archetype chapters to the browsed archetype", () => {
    // The chapters that render blank when this regresses. Sampled across parts
    // rather than exhaustively, so adding a section doesn't fail the suite
    // spuriously — the unguarded-copy test above is the exhaustive one.
    for (const section of ["beliefs", "attachment", "insecurities", "growth", "reading"]) {
      expect(ROUTE, `${section} copy must be resolved for the archetype being viewed`).toContain(
        `getReport2Section(contentArchetype, "${section}")`
      );
    }
  });

  it("keeps Part I keyed to the reader's own primary archetype", () => {
    // These describe the reader, not the archetype they are browsing.
    for (const section of ["snapshot", "findings", "map", "stage"]) {
      expect(ROUTE, `${section} describes the reader and must stay primary-keyed`).toContain(
        `getReport2Section(primaryArchetype, "${section}")`
      );
    }
  });

  it("gates the browsed chapters on the tier held for THAT archetype", () => {
    // Passing only `accessPlan` is what locked every premium section for `core`
    // buyers: the plan alone does not describe a per-archetype purchase.
    const gateCalls = ROUTE.match(/isSectionUnlockedForPlan\(\{/g)?.length ?? 0;
    const withTier = ROUTE.match(/archetypeTier: contentArchetypeTier,/g)?.length ?? 0;
    expect(gateCalls, "route should still gate the Report 2.0 chapters").toBeGreaterThan(0);
    expect(withTier, "every gate call must be told which archetype's tier applies").toBe(gateCalls);
  });

  it("refetches when the reader switches archetype", () => {
    // Without the slug in the dependencies the payload stays on the previous
    // archetype, the guard correctly reads false, and the report renders blank.
    expect(HOOK).toMatch(/params\.set\("archetype", archetypeSlug\)/);
    expect(HOOK).toMatch(/\}, \[[^\]]*archetypeSlug[^\]]*\]\);/);
    expect(SOURCE).toMatch(/archetypeSlug: searchParams\.get\("archetype"\)/);
  });
});
