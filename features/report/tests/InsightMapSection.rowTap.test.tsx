// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import InsightMapSection from "@features/report/ui/sections/InsightMapSection";

afterEach(cleanup);

/**
 * The row's title and "WHAT YOU'LL LEARN" text are siblings of the pill CTA,
 * and readers tap the text: 97 dead clicks on `.report-map-row` /
 * `.report-map-row__learn-text` across ~96 sessions in 15 days. On a locked
 * section that CTA is what opens the paywall, so every miss was a lost paywall
 * open. The whole row now activates.
 */
const copy = {
  "featured.title": "Featured",
  "featured.sub": "Featured sub",
  // Real keys, read from the component's `rows` array — not guessed.
  "tile1.sub": "What the first row teaches you",
  "tile2.sub": "What the second row teaches you",
} as Record<string, string>;

function renderMap({ open }: { open: boolean }) {
  const onOpen = vi.fn();
  render(
    <InsightMapSection
      archetype="Spiritual Lover"
      copy={copy as never}
      onOpen={onOpen}
      isSectionOpen={() => open}
    />
  );
  return { onOpen };
}

describe("InsightMapSection — the whole row activates", () => {
  it("opens the paywall when the LEARN TEXT is tapped on a locked row", async () => {
    const { onOpen } = renderMap({ open: false });
    const learn = screen.getAllByText("What the first row teaches you")[0]!;
    await userEvent.click(learn);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("opens the paywall when the row TITLE is tapped", async () => {
    const { onOpen } = renderMap({ open: false });
    const row = screen
      .getAllByText("What the first row teaches you")[0]!
      .closest(".report-map-row") as HTMLElement;
    const title = row.querySelector(".report-map-row__title") as HTMLElement;
    await userEvent.click(title);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("fires EXACTLY ONCE when the pill itself is tapped — no double-open", async () => {
    // The row owns the handler and the inner button has none, so a direct hit
    // must not run both. Two opens would flash the paywall twice.
    const { onOpen } = renderMap({ open: false });
    const row = screen
      .getAllByText("What the first row teaches you")[0]!
      .closest(".report-map-row") as HTMLElement;
    const cta = row.querySelector(".report-map-row__cta") as HTMLElement;
    await userEvent.click(cta);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("keeps the CTA a real anchor when the section is owned, and does not open the paywall", async () => {
    const { onOpen } = renderMap({ open: true });
    const row = screen
      .getAllByText("What the first row teaches you")[0]!
      .closest(".report-map-row") as HTMLElement;
    const cta = row.querySelector(".report-map-row__cta") as HTMLElement;
    expect(cta.tagName).toBe("A");
    expect(cta.getAttribute("href")).toMatch(/^#/);
    await userEvent.click(row.querySelector(".report-map-row__title") as HTMLElement);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("does NOT open the paywall when the reader was selecting text", async () => {
    // Only reachable where `.report-page--copyable` re-enables selection
    // (staging / previews / local dev), but that mode is real.
    const { onOpen } = renderMap({ open: false });
    const row = screen
      .getAllByText("What the first row teaches you")[0]!
      .closest(".report-map-row") as HTMLElement;
    const spy = vi.spyOn(window, "getSelection").mockReturnValue({
      toString: () => "the over-giving loop",
    } as unknown as Selection);
    try {
      await userEvent.click(row.querySelector(".report-map-row__title") as HTMLElement);
      expect(onOpen).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("activates by KEYBOARD on the button, bubbling to the row handler", async () => {
    // The claim in the component comment is that removing the button's own
    // onClick costs nothing for keyboard users because the click bubbles.
    // Assert it rather than assume it.
    const { onOpen } = renderMap({ open: false });
    const row = screen
      .getAllByText("What the first row teaches you")[0]!
      .closest(".report-map-row") as HTMLElement;
    const cta = row.querySelector(".report-map-row__cta") as HTMLElement;
    cta.focus();
    expect(document.activeElement).toBe(cta);
    await userEvent.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("the featured Arousal CTA is a real anchor, not a dead button", async () => {
    // It used to call `onOpen` unconditionally while `openMapTarget` returns
    // early for unlocked sections — so on the one card advertised as free it
    // did nothing at all, for every reader.
    const { onOpen } = renderMap({ open: true });
    const featured = document.querySelector(".report-map-featured__link") as HTMLElement;
    expect(featured).not.toBeNull();
    expect(featured.tagName).toBe("A");
    expect(featured.getAttribute("href")).toBe("#arousal_style");
    await userEvent.click(featured);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("the featured CTA still paywalls when Arousal is somehow locked", async () => {
    const { onOpen } = renderMap({ open: false });
    const featured = document.querySelector(".report-map-featured__link") as HTMLElement;
    expect(featured.tagName).toBe("BUTTON");
    await userEvent.click(featured);
    expect(onOpen).toHaveBeenCalledWith("arousal_style");
  });

  it("still exposes a focusable control for keyboard and screen readers", () => {
    renderMap({ open: false });
    const row = screen
      .getAllByText("What the first row teaches you")[0]!
      .closest(".report-map-row") as HTMLElement;
    const cta = row.querySelector(".report-map-row__cta") as HTMLElement;
    expect(cta.tagName).toBe("BUTTON");
    // the container must NOT itself become a competing interactive element
    expect(row.getAttribute("role")).toBeNull();
    expect(row.getAttribute("tabindex")).toBeNull();
  });

  /**
   * Fixing the featured card's LINK left its body inert, and readers tap the
   * body. Measured after that deploy: `article.report-map-featured` still dead
   * in 3 sessions, its title in 1, its sub in 1, its eyebrow in 2 — out of only
   * 16 report sessions, so roughly a third of readers tapped the card and got
   * nothing. Same defect as the rows, one element over.
   */
  describe("the featured Arousal card activates as a whole", () => {
    const featured = () => document.querySelector(".report-map-featured") as HTMLElement;

    it("navigates when the card TITLE is tapped and the section is owned", async () => {
      renderMap({ open: true });
      const title = featured().querySelector(".report-map-featured__title") as HTMLElement;
      await userEvent.click(title);
      expect(window.location.hash).toBe("#arousal_style");
    });

    it("navigates when the EYEBROW is tapped — the newest dead spot", async () => {
      window.location.hash = "";
      renderMap({ open: true });
      const eyebrow = featured().querySelector(".report-map-featured__eyebrow-text") as HTMLElement;
      await userEvent.click(eyebrow);
      expect(window.location.hash).toBe("#arousal_style");
    });

    it("opens the paywall from the card body when Arousal is somehow locked", async () => {
      const { onOpen } = renderMap({ open: false });
      const sub = featured().querySelector(".report-map-featured__sub") as HTMLElement;
      await userEvent.click(sub);
      expect(onOpen).toHaveBeenCalledWith("arousal_style");
    });

    it("fires once — not twice — when the inner link itself is tapped", async () => {
      // Both the button and the card firing would flash the paywall open twice.
      const { onOpen } = renderMap({ open: false });
      const link = featured().querySelector(".report-map-featured__link") as HTMLElement;
      await userEvent.click(link);
      expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it("still activates by KEYBOARD on the inner button", async () => {
      // Removing the button's own onClick must not cost keyboard users, since
      // Enter fires a click that bubbles to the card.
      const { onOpen } = renderMap({ open: false });
      const link = featured().querySelector(".report-map-featured__link") as HTMLElement;
      link.focus();
      expect(document.activeElement).toBe(link);
      await userEvent.keyboard("{Enter}");
      expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it("ignores a tap that carried a text selection", async () => {
      const { onOpen } = renderMap({ open: false });
      const spy = vi
        .spyOn(window, "getSelection")
        .mockReturnValue({ toString: () => "always unlocked" } as unknown as Selection);
      try {
        await userEvent.click(
          featured().querySelector(".report-map-featured__title") as HTMLElement
        );
        expect(onOpen).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });
  });
});
