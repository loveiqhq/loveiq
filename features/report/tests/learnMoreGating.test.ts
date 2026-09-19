import { describe, expect, it } from "vitest";
import {
  LOCKED_ARTICLE_MAX_GATED_BLOCKS,
  LOCKED_ARTICLE_WINDOW_PX,
  estimateBlockContentPx,
  estimateBlocksPx,
  isLearnMoreArticleLocked,
  splitArticleForReader,
} from "@features/report/server/contentGating";
import { REPORT_V4_LEARN_MORE } from "@/data/report3-learn-more";
import type { Report3Block } from "@/data/report3-learn-more";

/**
 * The paywall on the "Go deeper & learn more" articles — Figma 153:2280,
 * 235:317 and 244:320.
 *
 * These are the tests that decide whether the gate is real. The component can
 * blur whatever it likes; what matters is what leaves the server.
 *
 * Table-driven over the whole registry on purpose. The budget it exercises was
 * once a constant tuned against a single article, and that constant was wrong
 * the moment a second one arrived — Fantasy vs. Reality's paragraphs are short
 * enough that the same 580px window holds eight blocks rather than four. A new
 * article must be covered without anyone remembering to add a test.
 */

const ARTICLES = Object.entries(REPORT_V4_LEARN_MORE);

/** Every character a block renders. */
const textOf = (block: Report3Block): string =>
  block.kind === "heading"
    ? block.text
    : block.kind === "para"
      ? block.runs.map((r) => r.text).join("")
      : block.items.map((runs) => runs.map((r) => r.text).join("")).join(" ");

describe("splitArticleForReader", () => {
  describe.each(ARTICLES)("%s", (_id, article) => {
    const unlocked = splitArticleForReader(article, false);
    const locked = splitArticleForReader(article, true);

    it("gives an unlocked reader every word the expanded frame draws", () => {
      // A mid-paragraph cut (Fantasy vs. Reality) divides one block in two, so the
      // COUNT can be one higher. What must never change is the copy itself.
      const split = article.paywallCharOffset === undefined ? 0 : 1;
      expect(unlocked.free.length + unlocked.gated!.length).toBe(article.blocks.length + split);

      const strip = (parts: readonly Report3Block[]) =>
        parts.map(textOf).join("").replace(/\s+/g, "");
      expect(strip([...unlocked.free, ...unlocked.gated!])).toBe(strip(article.blocks));
    });

    it("leaves the free portion byte-identical either way", () => {
      expect(locked.free).toEqual(unlocked.free);
    });

    it("still reports the ORIGINAL paid length, so nothing has to infer it", () => {
      expect(locked.gatedBlockCount).toBe(unlocked.gated!.length);
      expect(locked.gated!.length).toBeLessThanOrEqual(locked.gatedBlockCount);
    });

    it("FILLS the 580px window — the regression that motivated the budget", () => {
      expect(estimateBlocksPx(locked.gated!)).toBeGreaterThanOrEqual(LOCKED_ARTICLE_WINDOW_PX);
    });

    it("ships as little as possible: one block fewer would under-fill", () => {
      const oneFewer = locked.gated!.slice(0, -1);
      expect(estimateBlocksPx(oneFewer)).toBeLessThan(LOCKED_ARTICLE_WINDOW_PX);
    });

    it("clips only the block that straddles the fold", () => {
      const source = article.blocks.slice(article.paywallAt);
      const untouched = locked.gated!.slice(0, -1);
      // Compare by text so the mid-paragraph split in Fantasy vs. Reality — whose
      // first paid block is the tail of a free one — is still exercised.
      untouched.forEach((block, i) => {
        expect(textOf(block)).toBe(textOf(unlocked.gated![i]!));
      });
      expect(source.length).toBeGreaterThan(untouched.length);
    });

    it("stays under the hard leak ceiling", () => {
      expect(locked.gated!.length).toBeLessThanOrEqual(LOCKED_ARTICLE_MAX_GATED_BLOCKS);
    });

    it("word-clips the last block without an ellipsis", () => {
      const last = locked.gated![locked.gated!.length - 1]!;
      if (last.kind !== "para") return; // a heading or list is kept whole
      const text = textOf(last);
      expect(text).not.toMatch(/[.…]{3}$/);
      expect(text).toBe(text.trimEnd());
    });

    it("puts NO withheld word on the wire — the leak test", () => {
      const wire = JSON.stringify(locked);
      const withheld = unlocked.gated!.slice(locked.gated!.length);
      expect(withheld.length).toBeGreaterThan(0);
      for (const block of withheld) {
        expect(wire).not.toContain(textOf(block).slice(0, 60));
      }
    });
  });

  it("returns the article untouched for an unlocked reader", () => {
    const [, article] = ARTICLES[0]!;
    const out = splitArticleForReader(article, false);
    expect(out.gated).toHaveLength(article.blocks.length - article.paywallAt);
  });
});

describe("the height estimator", () => {
  /**
   * The calibration test. reportV3.css records that the whole Typical Beliefs
   * article measures 11,582px in a real browser at a 358px column; if the
   * estimator drifts from that, every budget above it is guesswork.
   */
  it("predicts the measured 11,582px article within 2%", () => {
    const article = REPORT_V4_LEARN_MORE.typical_beliefs!;
    const predicted = estimateBlocksPx(article.blocks);
    expect(Math.abs(predicted - 11582) / 11582).toBeLessThan(0.02);
  });

  it("counts a short paragraph as one line and a long one as two", () => {
    const short: Report3Block = { kind: "para", runs: [{ text: "x".repeat(40) }] };
    const long: Report3Block = { kind: "para", runs: [{ text: "x".repeat(51) }] };
    expect(estimateBlockContentPx(short)).toBeCloseTo(22.4);
    expect(estimateBlockContentPx(long)).toBeCloseTo(44.8);
  });

  it("drops the trailing margin, which no block renders", () => {
    const one: Report3Block = { kind: "para", runs: [{ text: "x" }] };
    expect(estimateBlocksPx([one])).toBeCloseTo(22.4);
    // Two blocks add exactly one 16px rule between them.
    expect(estimateBlocksPx([one, one])).toBeCloseTo(22.4 * 2 + 16);
  });

  it("uses the frame's wider rule before a heading and narrower after it", () => {
    const para: Report3Block = { kind: "para", runs: [{ text: "x" }] };
    const head: Report3Block = { kind: "heading", text: "H" };
    expect(estimateBlocksPx([para, head])).toBeCloseTo(22.4 + 26 + 19.2);
    expect(estimateBlocksPx([head, para])).toBeCloseTo(19.2 + 14 + 22.4);
  });

  it("gives a tight paragraph no rule at all", () => {
    const tight: Report3Block = { kind: "para", runs: [{ text: "x" }], tight: true };
    const para: Report3Block = { kind: "para", runs: [{ text: "x" }] };
    expect(estimateBlocksPx([tight, para])).toBeCloseTo(22.4 * 2);
  });
});

describe("isLearnMoreArticleLocked — who actually meets the paywall", () => {
  const forPlan = (
    id: string,
    accessPlan: Parameters<typeof isLearnMoreArticleLocked>[0]["accessPlan"]
  ) => isLearnMoreArticleLocked({ article: REPORT_V4_LEARN_MORE[id]!, accessPlan });

  it.each(Object.keys(REPORT_V4_LEARN_MORE))("locks %s for a reader with no purchase", (id) => {
    expect(forPlan(id, null)).toBe(true);
  });

  /**
   * The three articles do NOT gate alike, and that is a product decision rather
   * than an accident of which section id each chapter carries. Typical Beliefs
   * and Accelerator & Brakes are both in ESSENTIALS_SECTION_IDS, so every paid
   * plan opens them; Fantasy vs. Reality is not, so an essentials holder is still
   * walled out of it while the card says "Unlock full report" on all three.
   * Pinned here so the split is visible rather than discovered.
   */
  it("opens the two essentials chapters for an essentials holder", () => {
    expect(forPlan("typical_beliefs", "essentials")).toBe(false);
    if (REPORT_V4_LEARN_MORE.typical_arousal_accelerators_turn_ons_of_the_core_archetype) {
      expect(
        forPlan("typical_arousal_accelerators_turn_ons_of_the_core_archetype", "essentials")
      ).toBe(false);
    }
  });

  it("still walls Fantasy vs. Reality off from an essentials holder", () => {
    if (!REPORT_V4_LEARN_MORE.typical_sexual_fantasy_amp_practice_tendencies) return;
    expect(forPlan("typical_sexual_fantasy_amp_practice_tendencies", "essentials")).toBe(true);
    expect(forPlan("typical_sexual_fantasy_amp_practice_tendencies", "full_report")).toBe(false);
  });

  it.each(["full_report", "core", "all_reports"] as const)("opens every article for %s", (plan) => {
    for (const id of Object.keys(REPORT_V4_LEARN_MORE)) {
      expect(forPlan(id, plan)).toBe(false);
    }
  });

  it("treats a chapter with no section row as free by construction", () => {
    expect(
      isLearnMoreArticleLocked({ article: { chapterId: "constellation" }, accessPlan: null })
    ).toBe(false);
  });

  it("honours gateSectionId over the chapter's own id", () => {
    expect(
      isLearnMoreArticleLocked({
        article: {
          chapterId: "typical_beliefs",
          gateSectionId: "biochemical_reward_system_dynamics",
        },
        accessPlan: "essentials",
      })
    ).toBe(true);
  });
});
