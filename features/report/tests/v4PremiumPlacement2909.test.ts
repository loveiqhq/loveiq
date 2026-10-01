import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPORT_V4_LEARN_MORE } from "@/data/report3-learn-more";

/**
 * Where each gate floats Mark's 29.09 paywall card (1015:*, "We have updated the paywall
 * CTAs"). The new cards are taller (205 / 363) and Mark placed each one anew; nothing
 * else in any gate moved (Sanjin's 11:57 save against the live file, 29.09).
 *
 * Chapter bodies, measured on the page at 393 from the paragraph each card is set on:
 * - Typical Beliefs, 1015:1004: 45 into "The problem is not the preference…" (348:334),
 *   which the page sets 339.1 into its gate — 384. (The old 87 had drifted: the frame's
 *   own card sat over copy above the gate.)
 * - A&B, 1015:1163: 408 into 314:284, where the gate starts — 408.
 * - CiP, 1015:1257: 303 into 305:462, where the gate starts — 303.
 * - FvR, 1015:1379: 258.27 into 305:228, the gate — 258.3.
 * Practice and article gates, whose values matched the frames before the swap, move by
 * as much as their cards did: TB's practice 88 → 48.5 into its rest, A&B's 155 → 205.5,
 * CiP's 147.5 → 219.5 and FvR's 238 → 167.3 from theirs; the articles 67 → 176.5
 * (Typical Beliefs), 88 → 78.5 (A&B) and 161.5 → 112.3 (FvR's own gate), which now sits
 * centred like the rest (its old card stood 6px right; the new one, 0.5).
 */

const V3_CSS = readFileSync(join(__dirname, "..", "ui", "v3", "reportV3.css"), "utf8");
const src = (file: string) => readFileSync(join(__dirname, "..", "ui", "v3", file), "utf8");
const rule = (selector: string) => {
  const at = V3_CSS.indexOf(`${selector} {`);
  expect(at, selector).toBeGreaterThan(-1);
  return V3_CSS.slice(at, V3_CSS.indexOf("}", at));
};

describe("the 29.09 paywall cards, where the frames set them", () => {
  // Final review, 29.09: a gate is as tall as its copy, which shortens as the column
  // widens — A&B's is 1104px at 393 but 515 from 1024, so a card 408 down ran 256px past
  // it and under the practice card, its pill out of reach. Each card now sits where its
  // frame sets it, or as low as its gate still holds it.
  it("floats each chapter-body card on its paragraph, never past the gate's foot", () => {
    expect(rule(".rv3 .rv4-tb__gate .rv4-premium")).toContain(
      "top: clamp(0px, 100% - 363px, 384px);"
    );
    expect(rule(".rv3 .rv4-ab__gate .rv4-premium")).toContain(
      "top: clamp(0px, 100% - 363px, 408px);"
    );
    expect(rule(".rv3 .rv4-cip__gate .rv4-premium")).toContain(
      "top: clamp(0px, 100% - 363px, 303px);"
    );
    expect(rule(".rv3 .rv4-fvr__gate .rv4-premium")).toContain(
      "top: clamp(0px, 100% - 363px, 258.3px);"
    );
  });

  it("moves each practice card as far as its frame moved it, never past the gate's foot", () => {
    expect(rule(".rv3 .rv4-try__rest .rv4-premium")).toContain(
      "top: clamp(0px, 100% - 205px, 48.5px);"
    );
    expect(rule(".rv3 .rv4-try__gate > .rv4-premium")).toContain(
      "top: clamp(0px, 100% - 205px, var(--rv4-try-premium-top, 148px));"
    );
    expect(src("V4Accelerators.tsx")).toContain("premiumTopPx={205.5}");
    expect(src("V4Partnership.tsx")).toContain("premiumTopPx={219.5}");
    expect(src("V4Fantasy.tsx")).toContain("premiumTopPx={167.3}");
  });

  it("moves each article card as far as its frame moved it, and centres FvR's", () => {
    expect(rule(".rv3 .rv4-learn__gate > .rv4-premium")).toContain(
      "top: var(--rv4-learn-premium-top, 176.5px);"
    );
    const accel = REPORT_V4_LEARN_MORE.typical_arousal_accelerators_turn_ons_of_the_core_archetype;
    expect(accel?.premiumTopPx).toBe(78.5);
    const fantasy = REPORT_V4_LEARN_MORE.typical_sexual_fantasy_amp_practice_tendencies;
    expect(fantasy?.gate?.premiumTopPx).toBe(112.3);
    // Typical Beliefs' article takes the CSS default above.
    expect(REPORT_V4_LEARN_MORE.typical_beliefs?.premiumTopPx).toBeUndefined();
    expect(V3_CSS).not.toContain("left: calc(50% + 6px);");
  });
});

// Mark, desktop review 30.09 (Notion, "Locked CTA.png"): "Locked CTA box more centrally
// into the blurred text. not so close to the try this element". A gate is as tall as its
// copy, which shortens as the column widens, so from 1024 A&B's card sat at its 515px
// gate's foot, 16px over "Try this" (152 down, the frame's 408 out of reach). From 700px
// each chapter body's card sits in the middle of its gate, or at its top when the gate is
// shorter than the card. Four whole selectors, as the 30.09 block writes every rule. The
// practice and article gates keep their windows (above).
describe("the chapter-body cards, centred in their gates on desktop (review 30.09)", () => {
  const MARK = "Desktop review — 30.09 (Notion)";
  const block = () => {
    const at = V3_CSS.indexOf(MARK);
    expect(at, "the 30.09 desktop review block").toBeGreaterThan(-1);
    return V3_CSS.slice(at).replace(/\/\*[\s\S]*?\*\//g, "");
  };

  it("centres the card in each of the four chapter bodies' gates from 700px", () => {
    const css = block();
    for (const gate of ["tb", "ab", "cip", "fvr"]) {
      const selector = `.rv3.rv4 .rv4-${gate}__gate .rv4-premium`;
      const at = css.indexOf(`${selector} {`);
      expect(at, selector).toBeGreaterThan(-1);
      expect(css.slice(at, css.indexOf("}", at)), selector).toContain(
        "top: max(0px, (100% - 363px) / 2);"
      );
    }
  });

  // Measured on the page: A&B's card lands 76 into its 515 gate from 1024 (165.5 into
  // 694 at 700), Typical Beliefs' 233.5 into its 830 (was 384), CiP's about where its
  // frame's 303 had it, and FvR's 35-47 lower than its 258.
  it("leaves the practice and article cards to their windows", () => {
    const css = block();
    expect(css).not.toContain(".rv4-try__rest .rv4-premium");
    expect(css).not.toContain(".rv4-try__gate > .rv4-premium");
    expect(css).not.toContain(".rv4-learn__gate > .rv4-premium");
  });
});
