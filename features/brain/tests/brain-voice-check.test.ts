import { describe, expect, it } from "vitest";
import {
  allChapters,
  chapterBaseline,
  checkDraft,
  registerOutliers,
  withoutQuotedSpans,
} from "@features/brain/server/voice";
// The regex is private; re-declared here so the test asserts the same shape the module uses.
const SECOND_PERSON_FOR_TEST = /\b(you|your|yours|yourself)\b/i;

const THIRD = "core_archetype";
const SECOND = "insecurities";
/**
 * A chapter the shipped copy genuinely has not settled: `love_language` is 11 of 14
 * second person.
 *
 * This was `beliefs` — "9 of 14, half-converted" — until the checker stopped counting
 * quoted "you" on 2026-09-17. All nine of its breaks were reported speech, and the chapter
 * turned out to be 0 of 14: cleanly third person all along. Worth keeping in the comment,
 * because it is the same trap this fixture exists to guard: a baseline inferred from a
 * miscount is a guess dressed as a measurement.
 */
const MIXED = "love_language";

const secondPersonDraft =
  "You often find that your desire builds slowly. Your partner may notice that you need time. " +
  "You should not read this as a problem, because your system simply works differently from theirs.";
// Chapter-length rather than a fragment: absence of second person only means something in a
// draft long enough for the writer to have reached for it.
const thirdPersonDraft =
  "The Sensual Connector finds that desire builds slowly. A partner may notice the need for time. " +
  "This is not a problem, because the system simply works differently from others. " +
  "Arousal here is emotion-led and depends on a sense of safety rather than novelty. " +
  "Where that safety is missing, the whole system quietly closes down. " +
  "Growth for this archetype lies in naming the conditions that help, rather than waiting for them.";

describe("voice baselines are counted, not assumed", () => {
  it("finds a register per chapter, and they genuinely differ", () => {
    // The whole point: there is no global rule. A draft correct in one chapter is wrong
    // in another, which is why this is checked per chapter.
    expect(chapterBaseline(THIRD)!.register).toBe("third");
    expect(chapterBaseline(SECOND)!.register).toBe("second");
  });

  it("records how many shipped versions back the register", () => {
    const third = chapterBaseline(THIRD)!;
    expect(third.secondPersonVersions).toBe(0);
    expect(third.archetypes).toBeGreaterThanOrEqual(14);
    expect(chapterBaseline(SECOND)!.secondPersonVersions).toBe(chapterBaseline(SECOND)!.archetypes);
  });

  it("keeps a heading skeleton ONLY when every archetype shares it", () => {
    // Four chapters have headings that are archetype-specific content. Checking a draft
    // against one archetype's headings would reject correct work.
    const withSkeleton = allChapters().filter((c) => chapterBaseline(c)?.headingSequence);
    expect(withSkeleton).toContain("practices");
    for (const c of withSkeleton) {
      expect(chapterBaseline(c)!.headingSequence!.length).toBeGreaterThan(0);
    }
    // And most chapters have no skeleton at all — 19 of 24 carry no headings.
    expect(withSkeleton.length).toBeLessThan(allChapters().length / 2);

    /**
     * The precise guard, because the loose one above is not enough: these chapters DO have
     * headings, and a DIFFERENT set in each of the 14 archetypes, because the headings are
     * content rather than structure. Treating the first archetype's headings as a skeleton
     * would flag every correct draft for the other thirteen as missing them.
     */
    for (const perArchetype of ["challenges_enjoy", "growth", "recommendations"]) {
      const b = chapterBaseline(perArchetype);
      expect(b, `${perArchetype} should exist`).not.toBeNull();
      expect(
        b!.headingSequence,
        `${perArchetype} headings differ per archetype, so there is no skeleton to check against`
      ).toBeNull();
    }
    // …while the one chapter that genuinely repeats its headings keeps them.
    expect(chapterBaseline("practices")!.headingSequence!.length).toBeGreaterThan(5);
  });

  it("measures sentence length per chapter, not corpus-wide", () => {
    const lens = allChapters()
      .map((c) => chapterBaseline(c)?.medianSentenceWords ?? 0)
      .filter(Boolean);
    // If these were all the same number the per-chapter check would be pointless.
    expect(new Set(lens).size).toBeGreaterThan(3);
  });
});

describe("registerOutliers — inconsistencies in the SHIPPED copy", () => {
  it("names the few blocks that break their own chapter, not the ones genuinely split", () => {
    /**
     * A chapter split 6/14 is an unresolved decision and nobody should be told it is a
     * slip. A chapter split 1/14 is one block someone forgot to convert. Naming the
     * archetype turns "the copy is inconsistent" into a task.
     */
    // NOTE: deliberately NOT asserting found.length > 0. The shipped copy is clean as of
    // 2026-09-18, and a test that requires a defect to exist is a test that punishes fixing
    // it. The detector's arithmetic is proven on the synthetic corpus below instead.
    const found = registerOutliers();
    for (const o of found) {
      expect(o.archetypes.length).toBeLessThanOrEqual(2);
      expect(o.archetypes.length).toBeGreaterThan(0);
      expect(o.total).toBeGreaterThanOrEqual(14);
      // The minority must genuinely be the minority.
      expect(o.archetypes.length).toBeLessThan(o.total / 2);
    }
  });

  it("does not report a chapter that is consistent either way", () => {
    const reported = new Set(registerOutliers().map((o) => o.chapter));
    // These are 0/14 and 14/14 — nothing to reconcile.
    expect(reported.has("core_archetype")).toBe(false);
    expect(reported.has("insecurities")).toBe(false);
  });

  /** 14 archetypes, `second` of them written in second person. */
  const corpus = (second: number) =>
    Object.fromEntries([
      [
        "ch",
        Object.fromEntries(
          Array.from({ length: 14 }, (_, i) => [
            `A${i}`,
            i < second ? "<p>you should know this.</p>" : "<p>they tend to know this.</p>",
          ])
        ),
      ],
    ]);

  it("reports a 1-of-14 slip and names the archetype", () => {
    const found = registerOutliers(2, corpus(1));
    expect(found).toHaveLength(1);
    expect(found[0].archetypes).toEqual(["A0"]);
    expect(found[0].majority).toBe("third");
    expect(found[0].total).toBe(14);
    expect(found[0].offendingSentences["A0"].join(" ")).toContain("you should know");
  });

  it("reports the inverse: 1-of-14 stuck in THIRD person among a second-person chapter", () => {
    const found = registerOutliers(2, corpus(13));
    expect(found).toHaveLength(1);
    expect(found[0].archetypes).toEqual(["A13"]);
    expect(found[0].majority).toBe("second");
  });

  it("stays silent on a genuine split and on unanimity", () => {
    expect(registerOutliers(2, corpus(6))).toHaveLength(0); // a decision, not a slip
    expect(registerOutliers(2, corpus(0))).toHaveLength(0); // 0/14
    expect(registerOutliers(2, corpus(14))).toHaveLength(0); // 14/14
    expect(registerOutliers(2, corpus(3))).toHaveLength(0); // 3 > maxOutliers
  });

  it("does not report a genuinely split chapter as a slip", () => {
    // `initiation` sits at 6/14 — that is a decision nobody has made, not a typo.
    const b = chapterBaseline("initiation");
    if (b && b.register === "mixed" && b.secondPersonVersions > 2 && b.secondPersonVersions < 12) {
      expect(registerOutliers().map((o) => o.chapter)).not.toContain("initiation");
    }
  });
});

describe("checkDraft", () => {
  it("flags second person in a chapter that never uses it", () => {
    const f = checkDraft(THIRD, secondPersonDraft);
    const reg = f.find((x) => x.kind === "register");
    expect(reg?.severity).toBe("error");
    expect(reg?.message).toMatch(/third person in all 14/);
    // The offending sentences travel with the finding, so a writer can judge it.
    expect(reg?.evidence?.length).toBeGreaterThan(0);
  });

  it("accepts the SAME text in a chapter that always uses it", () => {
    // This is the test that proves the rule is per-chapter rather than a global preference.
    expect(checkDraft(SECOND, secondPersonDraft).filter((f) => f.kind === "register")).toEqual([]);
  });

  it("flags third person in a chapter that always addresses the reader", () => {
    const f = checkDraft(SECOND, thirdPersonDraft).find((x) => x.kind === "register");
    expect(f?.severity).toBe("error");
    expect(f?.message).toMatch(/never does/);
  });

  it("says when the SHIPPED copy has no consistent register to check against", () => {
    // 11 of 14 is a real unresolved split. Inventing a baseline there would be a guess.
    const f = checkDraft(MIXED, secondPersonDraft).find((x) => x.kind === "register");
    expect(f?.severity).toBe("warn");
    expect(f?.message).toMatch(/inconsistent in the SHIPPED copy/);
  });

  it("flags sentences far outside the chapter's own band, and not inside it", () => {
    const long = Array.from(
      { length: 6 },
      () =>
        "The archetype experiences a slow and gradual unfolding of desire that depends on " +
        "context, safety, emotional attunement, and the accumulated history of a relationship " +
        "over many months and sometimes years of shared life together."
    ).join(" ");
    expect(checkDraft(THIRD, long).some((f) => f.kind === "sentence-length")).toBe(true);
    expect(checkDraft(THIRD, thirdPersonDraft).some((f) => f.kind === "sentence-length")).toBe(
      false
    );
  });

  it("refuses an unknown chapter instead of inventing a baseline", () => {
    const f = checkDraft("no_such_chapter", thirdPersonDraft);
    expect(f[0]!.severity).toBe("error");
    expect(f[0]!.message).toMatch(/nothing to compare against/);
  });

  it("reads HTML and plain text the same way", () => {
    const html = `<p>${secondPersonDraft}</p>`;
    expect(checkDraft(THIRD, html).some((f) => f.kind === "register")).toBe(true);
  });
});

describe("withoutQuotedSpans", () => {
  /**
   * Three of this checker's seven findings on 2026-09-16 were quoted "you" — reported
   * speech, not address. Anyone acting on them would have rewritten correct copy, which is
   * worse than no finding: the tool spends its credibility to make the writing wrong.
   */
  it.each([
    ['they avoid explicit "tell me what you want" pressure', "straight quotes"],
    ["hints, or “you should just know” signals", "curly quotes"],
  ])("drops second person inside %j (%s)", (text) => {
    expect(SECOND_PERSON_FOR_TEST.test(withoutQuotedSpans(text))).toBe(false);
  });

  it("keeps second person that is actually addressing the reader", () => {
    expect(
      SECOND_PERSON_FOR_TEST.test(
        withoutQuotedSpans(
          "That means building internal safety: you can be close and still have choice."
        )
      )
    ).toBe(true);
  });

  it("keeps the prose around a quote, so a real break beside a quote still counts", () => {
    const t = 'they say "tell me what you want" and you decide what happens next';
    expect(SECOND_PERSON_FOR_TEST.test(withoutQuotedSpans(t))).toBe(true);
  });

  it("leaves an unterminated quote alone rather than swallowing the rest", () => {
    // Greedily eating to end-of-block would hide every later sentence from the check.
    const t = 'she said "tell me what you want and then you decide';
    expect(withoutQuotedSpans(t)).toContain("you decide");
  });
});
