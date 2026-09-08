// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import PracticeTendenciesSection from "@features/report/ui/sections/PracticeTendenciesSection";

afterEach(cleanup);

/**
 * 21 dead clicks on `.report-practice-table__info-button` across just three
 * sessions — ~7 taps each — all Mobile iOS at 430px, and all from readers who
 * had PAID (the button only renders interactive on an unlocked section).
 *
 * The click handler only ever OPENS: `handleOpenFromAnchor` calls
 * `onOpen(rowId)`, and `handleOpen` does `setOpenRowId(rowId)`. Tapping the ⓘ
 * of an already-open row therefore sets state to the value it already holds —
 * no re-render, no DOM mutation, which is exactly what PostHog scores as a dead
 * click. For the reader the ⓘ has no way to dismiss what it opened: on a phone
 * there is no hover to leave and no Escape key, so the only exit is tapping
 * somewhere else entirely. Hence the repeat-tap bursts.
 */
const CONTENT = {
  groups: [
    {
      title: "Touch & Closeness",
      rows: [
        {
          practice: "Sensual massage",
          description: "What sensual massage tends to organize for you.",
          fantasyPull: 4,
          actualPleasure: 3,
        },
        {
          practice: "Extended eye contact",
          description: "What extended eye contact tends to organize for you.",
          fantasyPull: 2,
          actualPleasure: 5,
        },
      ],
    },
  ],
};

function renderUnlocked() {
  return render(
    <PracticeTendenciesSection
      archetype="Spiritual Lover"
      content={CONTENT as never}
      isPremium
      isUnlocked
      sectionTitle="Typical Sexual Fantasy & Practice Tendencies of the Spiritual Lover"
    />
  );
}

const popoverOpen = () =>
  !!document.querySelector(
    ".report-practice-table__inline-popover, .report-practice-table__popover"
  );

describe("practice table ⓘ", () => {
  it("opens the popover on the first tap", async () => {
    renderUnlocked();
    const btn = document.querySelector(".report-practice-table__info-button") as HTMLElement;
    expect(btn).not.toBeNull();
    expect(popoverOpen()).toBe(false);
    await userEvent.click(btn);
    expect(popoverOpen()).toBe(true);
  });

  it("CLOSES it on a second tap instead of doing nothing", async () => {
    // The defect: without a toggle this second tap is a no-op, which is both
    // the dead click and a popover the reader cannot dismiss.
    renderUnlocked();
    const btn = document.querySelector(".report-practice-table__info-button") as HTMLElement;
    await userEvent.click(btn);
    expect(popoverOpen()).toBe(true);
    await userEvent.click(btn);
    expect(popoverOpen()).toBe(false);
  });

  it("switching to another row's ⓘ still opens that row", async () => {
    // A toggle must not break the ordinary open-the-next-one path.
    renderUnlocked();
    const [first, second] = [
      ...document.querySelectorAll(".report-practice-table__info-button"),
    ] as HTMLElement[];
    expect(second).toBeDefined();
    await userEvent.click(first!);
    expect(popoverOpen()).toBe(true);
    await userEvent.click(second!);
    expect(popoverOpen()).toBe(true);
    expect(document.body.textContent).toContain("extended eye contact tends to organize");
  });
});

describe("practice table ⓘ — keyboard still reaches it", () => {
  it("opens and closes with Enter, so removing focus-to-open costs nothing", async () => {
    renderUnlocked();
    const btn = document.querySelector(".report-practice-table__info-button") as HTMLElement;
    btn.focus();
    expect(document.activeElement).toBe(btn);
    // Focus alone must NOT open — that is what swallowed the first tap.
    expect(popoverOpen()).toBe(false);
    await userEvent.keyboard("{Enter}");
    expect(popoverOpen()).toBe(true);
    await userEvent.keyboard("{Enter}");
    expect(popoverOpen()).toBe(false);
  });

  it("reports its state through aria-expanded", async () => {
    renderUnlocked();
    const btn = document.querySelector(".report-practice-table__info-button") as HTMLElement;
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    await userEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("practice table ⓘ — hover-capable pointers keep hover-to-open", () => {
  /**
   * jsdom's matchMedia answers `false` to everything, so every test above
   * exercised only the TOUCH path. Without stubbing hover on, the desktop
   * behaviour this fix deliberately preserves would be untested — and a guard
   * nobody tests in both states is a guard that only half works.
   */
  function withHover(matches: boolean) {
    const real = window.matchMedia;
    window.matchMedia = ((q: string) =>
      ({
        matches: q.includes("hover") ? matches : false,
        media: q,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        onchange: null,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList) as typeof window.matchMedia;
    return () => {
      window.matchMedia = real;
    };
  }

  it("opens on hover when the pointer can hover", async () => {
    const restore = withHover(true);
    try {
      renderUnlocked();
      const btn = document.querySelector(".report-practice-table__info-button") as HTMLElement;
      expect(popoverOpen()).toBe(false);
      await userEvent.hover(btn);
      expect(popoverOpen()).toBe(true);
    } finally {
      restore();
    }
  });

  it("ignores the synthetic hover a tap produces when the pointer cannot", async () => {
    // This is the whole point: a touch browser fires mouseenter after a tap,
    // and if that opened the row the click would toggle it straight back shut —
    // reinstating the dead click this change removes.
    const restore = withHover(false);
    try {
      renderUnlocked();
      const btn = document.querySelector(".report-practice-table__info-button") as HTMLElement;
      await userEvent.hover(btn);
      expect(popoverOpen()).toBe(false);
      await userEvent.click(btn);
      expect(popoverOpen()).toBe(true);
    } finally {
      restore();
    }
  });
});
