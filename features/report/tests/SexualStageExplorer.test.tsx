// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SexualStageExplorer from "@features/report/ui/sections/SexualStageExplorer";

beforeEach(() => {
  // Stub IntersectionObserver so the component reveals immediately and the
  // mobile-carousel observer can be installed without throwing in jsdom.
  class StubIntersectionObserver {
    constructor(public callback: IntersectionObserverCallback) {}
    observe(_el: Element) {
      this.callback(
        [
          {
            isIntersecting: true,
            intersectionRatio: 1,
            target: _el,
            time: 0,
            boundingClientRect: {} as DOMRectReadOnly,
            intersectionRect: {} as DOMRectReadOnly,
            rootBounds: null,
          } as IntersectionObserverEntry,
        ],
        this as unknown as IntersectionObserver
      );
    }
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  vi.stubGlobal("IntersectionObserver", StubIntersectionObserver);
});

afterEach(() => {
  cleanup();
});

describe("SexualStageExplorer", () => {
  it("renders all six stages on desktop and mobile", () => {
    const { container } = render(<SexualStageExplorer userStageLabel={null} />);
    // Each stage appears twice — once as desktop chip, once as mobile card.
    const chips = container.querySelectorAll(".stage-explorer__chip");
    const cards = container.querySelectorAll(".stage-card");
    expect(chips).toHaveLength(6);
    expect(cards).toHaveLength(6);
  });

  it("defaults to the user's stage when provided", () => {
    const { container } = render(<SexualStageExplorer userStageLabel="Grounded / Integrated" />);
    expect(container.querySelector(".stage-explorer")?.getAttribute("data-user-stage-id")).toBe(
      "grounded"
    );
    const userChip = container.querySelector('[data-chip-id="grounded"]');
    expect(userChip).toHaveAttribute("aria-pressed", "true");
    expect(userChip?.classList.contains("is-user-stage")).toBe(true);
  });

  it("falls back to awakening when userStageLabel is null", () => {
    const { container } = render(<SexualStageExplorer userStageLabel={null} />);
    expect(container.querySelector(".stage-explorer")?.getAttribute("data-user-stage-id")).toBe("");
    const awakeningChip = container.querySelector('[data-chip-id="awakening"]');
    expect(awakeningChip).toHaveAttribute("aria-pressed", "true");
  });

  it("matches truncated stage labels via shortLabel prefix", () => {
    const { container } = render(<SexualStageExplorer userStageLabel="Awakening" />);
    expect(container.querySelector(".stage-explorer")?.getAttribute("data-user-stage-id")).toBe(
      "awakening"
    );
  });

  it("anchors the user's stage and expands ring chips in place on hover", async () => {
    const user = userEvent.setup();
    const { container } = render(<SexualStageExplorer userStageLabel="Awakening / Exploring" />);

    // The anchor chip always renders the user's stage, flagged as their current
    // stage. (The old locked desktop detail card was removed in the Report 2.0
    // orbit redesign — the "Your Likely Stage" card above the orbit replaces it.)
    const anchorChip = container.querySelector('[data-chip-id="awakening"]');
    expect(anchorChip).toBeTruthy();
    expect(anchorChip).toHaveClass("stage-explorer__chip--anchor", "is-user-stage");
    expect(anchorChip).toHaveTextContent("Awakening / Exploring");
    expect(anchorChip).toHaveTextContent("YOUR LIKELY CURRENT STAGE");

    // A ring chip starts collapsed and expands in place on hover — aria-expanded
    // flips and its detail rows + need block become visible, without mutating
    // the anchor chip.
    const evolvingChip = container.querySelector<HTMLButtonElement>('[data-chip-id="evolving"]')!;
    expect(evolvingChip).toHaveAttribute("aria-expanded", "false");

    await user.hover(evolvingChip);

    expect(evolvingChip).toHaveAttribute("aria-expanded", "true");
    expect(evolvingChip).toHaveTextContent("Evolving / Transcending");
    expect(evolvingChip).toHaveTextContent("Integration + grounding + devotion");

    // The anchor chip stays the user's stage.
    expect(anchorChip).toHaveTextContent("Awakening / Exploring");
  });

  it("renders the user's stage in the mobile pill header", () => {
    const { container } = render(<SexualStageExplorer userStageLabel="Repairing / Reconnecting" />);
    const pill = container.querySelector(".stage-explorer__mobile-pill");
    expect(pill).toBeTruthy();
    expect(within(pill as HTMLElement).getByText("YOUR CURRENT STAGE")).toBeInTheDocument();
    expect(within(pill as HTMLElement).getByText("Repairing / Reconnecting")).toBeInTheDocument();
  });

  it("falls back to a generic mobile pill when stage is unknown", () => {
    render(<SexualStageExplorer userStageLabel={null} />);
    expect(screen.queryByText("Your likely current stage")).not.toBeInTheDocument();
    expect(screen.getByText("Explore the 6 sexual stages")).toBeInTheDocument();
  });

  it("attaches a CURRENT badge only to the user's mobile card", () => {
    const { container } = render(<SexualStageExplorer userStageLabel="Grounded / Integrated" />);
    const currentBadges = container.querySelectorAll(".stage-card__current");
    expect(currentBadges).toHaveLength(1);
    const userCard = container.querySelector(".stage-card.is-user-stage");
    expect(userCard).toHaveTextContent("Grounded / Integrated");
  });

  it("supports arrow-key navigation between orbit chips", async () => {
    const user = userEvent.setup();
    const { container } = render(<SexualStageExplorer userStageLabel="Awakening / Exploring" />);

    // Anchor (user's stage) is rendered first; ArrowRight from the anchor
    // advances to the first non-anchor stage in array order — Recharging.
    const awakeningChip = container.querySelector<HTMLButtonElement>('[data-chip-id="awakening"]')!;
    awakeningChip.focus();
    await user.keyboard("{ArrowRight}");

    const rechargingChip = container.querySelector<HTMLButtonElement>(
      '[data-chip-id="recharging"]'
    )!;
    expect(rechargingChip).toHaveAttribute("aria-pressed", "true");
  });
});
