// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ArchetypeBreakdownListSection, {
  computeReferenceSample,
  countDrivingDimensions,
} from "@features/report/ui/sections/ArchetypeBreakdownListSection";

function stubObservers(options: { reducedMotion?: boolean } = {}) {
  // IntersectionObserver mock fires `isIntersecting: true` immediately so the
  // section flips `isInView` and runs the percentage count-up effect.
  class MockIntersectionObserver {
    private cb: IntersectionObserverCallback;
    constructor(cb: IntersectionObserverCallback) {
      this.cb = cb;
    }
    observe = (target: Element) => {
      this.cb(
        [
          {
            isIntersecting: true,
            target,
            intersectionRatio: 1,
            time: 0,
            boundingClientRect: target.getBoundingClientRect(),
            intersectionRect: target.getBoundingClientRect(),
            rootBounds: null,
          } as IntersectionObserverEntry,
        ],
        this as unknown as IntersectionObserver
      );
    };
    unobserve = vi.fn();
    disconnect = vi.fn();
    takeRecords = vi.fn(() => []);
    root = null;
    rootMargin = "";
    thresholds: ReadonlyArray<number> = [];
  }
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

  // Default to prefers-reduced-motion = true so AnimatedPercentage short-
  // circuits to the target value and tests can assert on final text without
  // pumping the RAF loop. Individual tests opt out via { reducedMotion: false }.
  const reduceMotion = options.reducedMotion ?? true;
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: reduceMotion && query.includes("reduce"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
}

const basePercentages: Record<string, number> = {
  "Authority Conductor": 89,
  "Loyal Ritualist": 74,
  "Explorer of Edges": 55,
  "Spark Seeker": 44,
  "Radiant Performer": 40.5,
  "Spiritual Lover": 36,
  "Curious Apprentice": 33.5,
  "Relational Nurturer": 29,
  "Tender Devotee": 24,
  "Sensual Connector": 18.5,
  "Analytical Sexualist": 16,
  "Emotional Voyeur": 12.5,
  "Minimalist Companion": 8,
  "Quiet Withdrawer": 6.5,
};

const baseRanking = [
  "Authority Conductor",
  "Loyal Ritualist",
  "Explorer of Edges",
  "Spark Seeker",
  "Radiant Performer",
  "Spiritual Lover",
  "Curious Apprentice",
  "Relational Nurturer",
  "Tender Devotee",
  "Sensual Connector",
  "Analytical Sexualist",
  "Emotional Voyeur",
  "Minimalist Companion",
  "Quiet Withdrawer",
];

describe("ArchetypeBreakdownListSection", () => {
  beforeEach(() => {
    stubObservers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it("renders all 14 archetype rows in ranking order, including the primary", () => {
    render(
      <ArchetypeBreakdownListSection
        percentages={basePercentages}
        primaryArchetype="Authority Conductor"
        ranking={baseRanking}
        unlockedArchetypes={new Set()}
        accessPlan={null}
        onUnlock={vi.fn()}
        onPurchaseFullReport={vi.fn()}
      />
    );

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(14);

    // First row is the highest-ranked archetype overall (the primary)
    expect(within(rows[0]!).getByRole("heading", { level: 3 })).toHaveTextContent(
      "Authority Conductor"
    );
    // Second row is the next-highest
    expect(within(rows[1]!).getByRole("heading", { level: 3 })).toHaveTextContent(
      "Loyal Ritualist"
    );
  });

  it("formats percentages to one decimal place", () => {
    render(
      <ArchetypeBreakdownListSection
        percentages={basePercentages}
        primaryArchetype="Authority Conductor"
        ranking={baseRanking}
        unlockedArchetypes={new Set()}
        accessPlan={null}
        onUnlock={vi.fn()}
        onPurchaseFullReport={vi.fn()}
      />
    );

    expect(screen.getByText("74.0%")).toBeInTheDocument();
    expect(screen.getByText("40.5%")).toBeInTheDocument();
    expect(screen.getByText("6.5%")).toBeInTheDocument();
  });

  it("shows Unlock report on locked rows and View report on unlocked rows", () => {
    // Each row renders two pills (desktop + mobile) — one visible at each
    // breakpoint. Both share the same aria-label, so we expect a pair.
    render(
      <ArchetypeBreakdownListSection
        percentages={basePercentages}
        primaryArchetype="Authority Conductor"
        ranking={baseRanking}
        unlockedArchetypes={new Set(["Loyal Ritualist"])}
        accessPlan="essentials"
        onUnlock={vi.fn()}
        onPurchaseFullReport={vi.fn()}
      />
    );

    expect(screen.getAllByRole("button", { name: /view loyal ritualist report/i })).toHaveLength(2);
    expect(
      screen.getAllByRole("button", { name: /unlock explorer of edges report/i })
    ).toHaveLength(2);
  });

  it("treats every archetype as unlocked when accessPlan is all_reports", () => {
    render(
      <ArchetypeBreakdownListSection
        percentages={basePercentages}
        primaryArchetype="Authority Conductor"
        ranking={baseRanking}
        unlockedArchetypes={new Set()}
        accessPlan="all_reports"
        onUnlock={vi.fn()}
        onPurchaseFullReport={vi.fn()}
      />
    );

    expect(screen.queryAllByRole("button", { name: /unlock .* report/i })).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /unlock the full report/i })).toBeNull();
  });

  it("hides the footer CTA when accessPlan is all_reports", () => {
    const { rerender } = render(
      <ArchetypeBreakdownListSection
        percentages={basePercentages}
        primaryArchetype="Authority Conductor"
        ranking={baseRanking}
        unlockedArchetypes={new Set()}
        accessPlan={null}
        onUnlock={vi.fn()}
        onPurchaseFullReport={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /unlock the full report/i })).toBeInTheDocument();

    rerender(
      <ArchetypeBreakdownListSection
        percentages={basePercentages}
        primaryArchetype="Authority Conductor"
        ranking={baseRanking}
        unlockedArchetypes={new Set()}
        accessPlan="all_reports"
        onUnlock={vi.fn()}
        onPurchaseFullReport={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: /unlock the full report/i })).toBeNull();
  });

  it("invokes onUnlock with the row archetype when its pill is clicked", () => {
    const onUnlock = vi.fn();
    render(
      <ArchetypeBreakdownListSection
        percentages={basePercentages}
        primaryArchetype="Authority Conductor"
        ranking={baseRanking}
        unlockedArchetypes={new Set()}
        accessPlan={null}
        onUnlock={onUnlock}
        onPurchaseFullReport={vi.fn()}
      />
    );

    // Two pills per row (desktop + mobile in DOM) — click the first (desktop).
    const pills = screen.getAllByRole("button", { name: /unlock explorer of edges report/i });
    expect(pills).toHaveLength(2);
    fireEvent.click(pills[0]!);
    expect(onUnlock).toHaveBeenCalledWith("Explorer of Edges");
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it("invokes onPurchaseFullReport (not onUnlock) when the footer CTA is clicked", () => {
    const onUnlock = vi.fn();
    const onPurchaseFullReport = vi.fn();
    render(
      <ArchetypeBreakdownListSection
        percentages={basePercentages}
        primaryArchetype="Authority Conductor"
        ranking={baseRanking}
        unlockedArchetypes={new Set()}
        accessPlan="essentials"
        onUnlock={onUnlock}
        onPurchaseFullReport={onPurchaseFullReport}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /unlock the full report/i }));
    expect(onPurchaseFullReport).toHaveBeenCalledTimes(1);
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it("relabels the footer CTA to 'Unlock All Reports' once full_report is owned", () => {
    const onPurchaseFullReport = vi.fn();
    render(
      <ArchetypeBreakdownListSection
        percentages={basePercentages}
        primaryArchetype="Authority Conductor"
        ranking={baseRanking}
        unlockedArchetypes={new Set(["Authority Conductor"])}
        accessPlan="full_report"
        onUnlock={vi.fn()}
        onPurchaseFullReport={onPurchaseFullReport}
      />
    );

    // The owner already has the full report for their primary archetype, so the
    // footer upsells the OTHER archetypes (all_reports) instead of re-selling a
    // plan they own. The old label must be gone.
    expect(screen.queryByRole("button", { name: /unlock the full report/i })).toBeNull();
    const cta = screen.getByRole("button", { name: /unlock all reports/i });
    fireEvent.click(cta);
    // The parent handler (ReportPage) routes full_report owners to all_reports.
    expect(onPurchaseFullReport).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when ranking is empty", () => {
    const { container } = render(
      <ArchetypeBreakdownListSection
        percentages={{}}
        primaryArchetype="Authority Conductor"
        ranking={[]}
        unlockedArchetypes={new Set()}
        accessPlan={null}
        onUnlock={vi.fn()}
        onPurchaseFullReport={vi.fn()}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it("short-circuits the count-up to the final value under reduced motion", () => {
    // Default beforeEach uses reducedMotion=true. Final values should appear
    // immediately without any RAF pumping.
    render(
      <ArchetypeBreakdownListSection
        percentages={basePercentages}
        primaryArchetype="Authority Conductor"
        ranking={baseRanking}
        unlockedArchetypes={new Set()}
        accessPlan={null}
        onUnlock={vi.fn()}
        onPurchaseFullReport={vi.fn()}
      />
    );

    expect(screen.getByText("89.0%")).toBeInTheDocument();
    expect(screen.getByText("6.5%")).toBeInTheDocument();
  });

  it("counts the percentage up from 0.0% to the target over the animation window", async () => {
    // Opt out of reduced motion + drive the RAF clock manually.
    vi.unstubAllGlobals();
    stubObservers({ reducedMotion: false });
    vi.useFakeTimers();

    let rafCallbacks: Array<{ id: number; fn: FrameRequestCallback }> = [];
    let nextRafId = 1;
    vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
      const id = nextRafId++;
      rafCallbacks.push({ id, fn });
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      rafCallbacks = rafCallbacks.filter((c) => c.id !== id);
    });

    const pumpRaf = (timestamp: number) => {
      const pending = rafCallbacks;
      rafCallbacks = [];
      pending.forEach(({ fn }) => fn(timestamp));
    };

    const { container } = render(
      <ArchetypeBreakdownListSection
        percentages={{ "Spark Seeker": 44 }}
        primaryArchetype="Spark Seeker"
        ranking={["Spark Seeker"]}
        unlockedArchetypes={new Set()}
        accessPlan={null}
        onUnlock={vi.fn()}
        onPurchaseFullReport={vi.fn()}
      />
    );

    const readout = container.querySelector('[data-testid="archetype-pct"]');
    expect(readout).not.toBeNull();
    // Initial render: server-paint shows 0.0%; effect has not started yet
    // because the row 0 stagger delay is 200ms.
    expect(readout!.textContent).toBe("0.0%");

    // Advance past the start delay so the setTimeout fires + the first RAF
    // schedules.
    vi.advanceTimersByTime(250);
    // Start the RAF chain at t=0.
    pumpRaf(0);
    // Halfway through the 1500ms count-up.
    pumpRaf(750);
    // parseFloat ignores the trailing "%" so we don't need to strip it.
    const mid = parseFloat(readout!.textContent ?? "0");
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(44);
    // Finish past the animation window — must settle exactly on 44.0%.
    pumpRaf(1500);
    expect(readout!.textContent).toBe("44.0%");

    vi.useRealTimers();
  });
});

describe("computeReferenceSample", () => {
  const BASE = 124_638;
  const RANGE = 600;

  it("is deterministic for the same seed", () => {
    expect(computeReferenceSample("submission-42")).toBe(computeReferenceSample("submission-42"));
    expect(computeReferenceSample(42)).toBe(computeReferenceSample(42));
  });

  it("returns different values for different seeds", () => {
    const a = computeReferenceSample("alpha");
    const b = computeReferenceSample("bravo");
    const c = computeReferenceSample("charlie");
    // At least two of three must differ — collisions are theoretically
    // possible but vanishingly rare for short seeds with FNV-1a.
    expect(new Set([a, b, c]).size).toBeGreaterThanOrEqual(2);
  });

  it("stays inside the [BASE - RANGE, BASE + RANGE] window", () => {
    const seeds: Array<string | number> = ["a", "z", 0, 1, 999, "submission-42", "rpt_abc123xyz"];
    for (const s of seeds) {
      const n = computeReferenceSample(s);
      expect(n).toBeGreaterThanOrEqual(BASE - RANGE);
      expect(n).toBeLessThanOrEqual(BASE + RANGE);
    }
  });

  it("falls back to the base when seed is null / undefined / empty string", () => {
    expect(computeReferenceSample(null)).toBe(BASE);
    expect(computeReferenceSample(undefined)).toBe(BASE);
    expect(computeReferenceSample("")).toBe(BASE);
  });

  it("treats numeric and stringified-numeric seeds as equivalent", () => {
    expect(computeReferenceSample(123)).toBe(computeReferenceSample("123"));
  });
});

describe("countDrivingDimensions", () => {
  it("counts dimensions with |value - 0.5| >= 0.15", () => {
    const u = {
      DIM_A: 0.5, // exactly neutral → excluded
      DIM_B: 0.6, // delta 0.10 → excluded
      DIM_C: 0.65, // delta 0.15 → included (>=)
      DIM_D: 0.9, // delta 0.40 → included
      DIM_E: 0.2, // delta 0.30 → included
      DIM_F: 0.49, // delta 0.01 → excluded
      DIM_G: 0.0, // delta 0.50 → included
    };
    const result = countDrivingDimensions(u);
    expect(result).not.toBeNull();
    expect(result!.count).toBe(4);
    expect(result!.total).toBe(7);
  });

  it("returns null for missing / empty diagnostics", () => {
    expect(countDrivingDimensions(undefined)).toBeNull();
    expect(countDrivingDimensions(null)).toBeNull();
    expect(countDrivingDimensions({})).toBeNull();
  });

  it("ignores NaN and non-numeric values without crashing", () => {
    const u = {
      DIM_A: Number.NaN,
      DIM_B: 0.8, // included
      DIM_C: 0.5, // excluded
    } as Record<string, number>;
    const result = countDrivingDimensions(u);
    expect(result).not.toBeNull();
    expect(result!.count).toBe(1);
    expect(result!.total).toBe(3);
  });

  it("returns 0 count when every value sits at neutral", () => {
    const u = { DIM_A: 0.5, DIM_B: 0.5, DIM_C: 0.5 };
    const result = countDrivingDimensions(u);
    expect(result!.count).toBe(0);
    expect(result!.total).toBe(3);
  });
});
