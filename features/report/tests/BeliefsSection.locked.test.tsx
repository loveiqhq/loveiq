// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import BeliefsSection, { type BeliefsCopy } from "@features/report/ui/sections/BeliefsSection";

/**
 * The locked state has been through three shapes. It started as a single column
 * of two rows behind an overlay card ~890px tall, so the paywall floated over
 * blank white and the section read as though nothing was behind it. Then it
 * became a hand-written two-column stand-in: right shape, invented words. It is
 * now a pre-rasterised render of the REAL chapter whose pixels were blurred and
 * downsampled at build time.
 *
 * That last step is a security boundary, not a style choice. Real chapter DOM
 * under `filter: blur()` is readable the moment someone deletes one line in
 * DevTools; an image whose pixels were destroyed before it shipped is not. These
 * tests pin both halves: something real is behind the overlay, and no
 * per-archetype copy reaches a locked client.
 */
const lockedCopy: BeliefsCopy = {
  "gate.hook": "See which beliefs still serve you",
  "learn.eyebrow": "What you will learn",
  "learn.body": "In this chapter you will learn where your beliefs came from.",
  // What a locked client actually receives: the per-archetype payload withheld.
  keep: [],
  loosen: [],
  locked: true,
};

const REAL_BELIEF = "Sex is a way we care for each other";

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

describe("BeliefsSection — locked preview", () => {
  it("renders the pre-blurred chapter image behind the overlay", () => {
    const { container } = renderLocked();
    const fade = container.querySelector(".report-beliefs__preview-fade");
    expect(fade, "locked preview is missing").not.toBeNull();

    const img = fade!.querySelector("img");
    expect(img, "no preview image behind the paywall").not.toBeNull();
    expect(img!.getAttribute("src")).toBe("/report-previews/beliefs-desktop.jpg");
  });

  it("ships a mobile source so the phone layout is not the desktop crop", () => {
    const { container } = renderLocked();
    const source = container.querySelector(".report-beliefs__preview-fade source");
    expect(source?.getAttribute("srcSet") ?? source?.getAttribute("srcset")).toBe(
      "/report-previews/beliefs-mobile.jpg"
    );
  });

  it("drops the CSS lock blur so the pre-blurred pixels are not blurred twice", () => {
    const { container } = renderLocked();
    const fade = container.querySelector(".report-beliefs__preview-fade");
    expect(fade!.className).toContain("report-preview-fade--image");
  });

  it("leaks no per-archetype belief copy into a locked render", () => {
    // Even if the server ever sent them, a locked client must not paint them.
    const { container } = renderLocked({
      keep: [REAL_BELIEF],
      loosen: [{ belief: "My needs should come second", shift: "My pleasure matters too" }],
    });
    const fade = container.querySelector(".report-beliefs__preview-fade")!;
    expect(fade.textContent).not.toContain(REAL_BELIEF);
    expect(fade.textContent).not.toContain("My needs should come second");
  });

  it("puts no readable chapter text in the locked DOM at all", () => {
    // The point of rasterising: the preview carries no text nodes to read.
    const { container } = renderLocked();
    const fade = container.querySelector(".report-beliefs__preview-fade")!;
    expect(fade.textContent?.trim()).toBe("");
  });

  it("still renders the paywall overlay over the preview", () => {
    const { container } = renderLocked();
    expect(container.querySelector('[class*="premium-overlay"]')).not.toBeNull();
  });
});
