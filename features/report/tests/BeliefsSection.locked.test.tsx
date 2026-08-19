// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import BeliefsSection, { type BeliefsCopy } from "@features/report/ui/sections/BeliefsSection";

/**
 * The locked state has been through four shapes, and this is the one Figma
 * actually draws:
 *
 *  1. one column of two rows behind an ~890px card — the paywall floated over
 *     blank white and the section read as though nothing was behind it;
 *  2. a hand-written two-column stand-in — right shape, invented words;
 *  3. a pre-blurred raster of the real chapter — real content, but blurred, and
 *     Figma's locked frame does not blur this chapter at all;
 *  4. the real beliefs, sharp and readable at the top of each column, fading
 *     black -> grey -> transparent toward the paywall card.
 *
 * The security boundary moved with it. It is no longer "the pixels are destroyed";
 * it is "the server only sent the first six rows per column" (BELIEFS_TEASER_ROWS
 * in app/api/report/route.ts — three until 2026-08-19, when three made the chapter
 * look as though it held almost nothing). These tests pin the client half: the
 * tease renders the rows it was given, sharp at the top with the fade below — and
 * it renders nothing it was not given.
 */
const lockedCopy: BeliefsCopy = {
  "learn.eyebrow": "What you will learn",
  "learn.body": "In this chapter you will learn where your beliefs came from.",
  // What a locked client now receives: the first six rows of each column (two
  // shown here — the count itself is asserted against the route below).
  keep: ["Sex is a way we care for each other", "Closeness makes me want to give"],
  loosen: [
    { belief: "My needs should come second", shift: "My pleasure matters too" },
    { belief: "If I say no, I'll hurt them", shift: "A no can hold love" },
  ],
  locked: true,
};

function renderLocked(overrides: Partial<BeliefsCopy> = {}) {
  return render(
    <BeliefsSection
      archetype="Relational Nurturer"
      copy={{ ...lockedCopy, ...overrides }}
      isUnlocked={false}
      onUnlock={() => {}}
      sectionTitle="Typical Beliefs"
    />
  );
}

afterEach(cleanup);

describe("BeliefsSection — locked tease", () => {
  it("renders the real rows it was given, in both columns", () => {
    const { container } = renderLocked();
    const fade = container.querySelector(".report-beliefs__preview-fade--tease");
    expect(fade, "locked tease is missing").not.toBeNull();
    expect(fade!.querySelectorAll(".report-beliefs__col")).toHaveLength(2);
    expect(fade!.textContent).toContain("Sex is a way we care for each other");
    expect(fade!.textContent).toContain("My needs should come second");
  });

  it("is not blurred and carries no raster image", () => {
    // Figma's locked frame keeps this chapter sharp; the fade does the work.
    const { container } = renderLocked();
    const fade = container.querySelector(".report-beliefs__preview-fade--tease")!;
    expect(fade.querySelector("img"), "the blurred raster should be gone").toBeNull();
    expect(fade.className).not.toContain("report-preview-fade--image");
  });

  it("labels both columns", () => {
    renderLocked();
    expect(screen.getAllByText(/Serve you/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Box you in/i).length).toBeGreaterThan(0);
  });

  it("renders only the rows the server sent, never a padded list", () => {
    // The withheld rows are absent from the payload, so the tease cannot show
    // more than it was given — that is where the paywall boundary lives now.
    const { container } = renderLocked({ keep: ["Only one belief"], loosen: [] });
    const fade = container.querySelector(".report-beliefs__preview-fade--tease")!;
    expect(fade.querySelectorAll(".report-beliefs__list > *")).toHaveLength(1);
    expect(fade.querySelectorAll(".report-beliefs__col")).toHaveLength(1);
  });

  it("still withholds the per-archetype body paragraph", () => {
    const { container } = renderLocked();
    expect(container.querySelector(".report-beliefs__note")).toBeNull();
  });

  it("still renders the paywall overlay over the tease", () => {
    const { container } = renderLocked();
    expect(container.querySelector('[class*="premium-overlay"]')).not.toBeNull();
  });
});

describe("BeliefsSection — how much the server ships", () => {
  it("sends six rows per column to a locked client, and all of them to a paid one", () => {
    // Three rows cleared the paywall card by so little that the chapter read as
    // empty. Six shows the volume; the mask (percentages of each column's own
    // height) keeps the READABLE band at the first two rows either way.
    const route = readFileSync(join(process.cwd(), "app/api/report/route.ts"), "utf8");
    expect(route).toMatch(/const BELIEFS_TEASER_ROWS = 6;/);
    // The withheld rows still never leave the server: 9 keeps and 10 loosens only
    // when unlocked.
    expect(route).toMatch(/length: beliefsUnlocked \? 9 : BELIEFS_TEASER_ROWS/);
    expect(route).toMatch(/length: beliefsUnlocked \? 10 : BELIEFS_TEASER_ROWS/);
  });

  it("recedes behind blur rather than fading to white", () => {
    // The alpha ramp used to reach zero two thirds of the way down, so the bottom
    // of both columns was blank — the chapter looked empty exactly where it should
    // look full. The rows stay present and go out of focus instead.
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    const SCOPE = ".report-beliefs__preview-fade--tease .report-beliefs__list";
    const ruleBody = (selector: string) => {
      const at = css.indexOf(selector);
      expect(at, `missing rule: ${selector}`).toBeGreaterThan(-1);
      const rest = css.slice(at);
      return rest.slice(0, rest.indexOf("}"));
    };

    // The mask survives only as a feather over the last stretch, because the loosen
    // column is taller than the preview box and `overflow: hidden` would otherwise
    // cut it with a razor line.
    const mask = ruleBody(`${SCOPE} {`);
    expect(mask).toContain("rgba(0, 0, 0, 1) 88%");
    expect(mask).not.toContain("rgba(0, 0, 0, 0.3)");

    // Rows one and two are the tease; three onward blur, ending on the shared token.
    expect(css).not.toContain(`${SCOPE} > *:nth-child(1)`);
    expect(css).not.toContain(`${SCOPE} > *:nth-child(2)`);
    expect(ruleBody(`${SCOPE} > *:nth-child(3)`)).toContain("filter: blur(1.1px)");
    expect(ruleBody(`${SCOPE} > *:nth-child(4)`)).toContain("filter: blur(2.2px)");
    expect(ruleBody(`${SCOPE} > *:nth-child(5)`)).toContain("filter: blur(3.2px)");
    expect(ruleBody(`${SCOPE} > *:nth-child(n + 6)`)).toContain(
      "filter: blur(var(--report-lock-blur))"
    );
  });
});
