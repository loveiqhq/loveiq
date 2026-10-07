// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { FC, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRevealOnView } from "@features/report/ui/hooks/useRevealOnView";
import GrowthSection from "@features/report/ui/sections/GrowthSection";
import PracticeTendenciesSection from "@features/report/ui/sections/PracticeTendenciesSection";
import V3Chapter, { V3ModeProvider, V4ModeProvider } from "@features/report/ui/v3/V3Chapter";
import type { ReportV3Chapter } from "@features/report/ui/v3/reportV3Nav";
import { reportPracticeTendencies } from "@/data/report-practice-tendencies";
import { RevealObserver, installRevealObserver, mockRect } from "./v4RevealTestKit";

/**
 * Notion, "Review Round 01.10 - Desktop": "Bring back the animations of the V2 report"
 * in the chapters V4 draws with Report 2.0's sections.
 *
 * A V4 chapter starts closed, and its body only clips (V3's 0fr collapse), so every box
 * in it keeps its size. Report 2.0's reveals fired as the reader scrolled past the closed
 * chapter, inside the freeze that holds a closed chapter's transitions (27.09, for lag),
 * so each chart snapped to its end state unseen and opened finished. They now wait for
 * the chapter: nothing in it reveals while it is closed, or while its body is still
 * expanding; once it is drawn they check again, the scroll band as ever.
 */

const V3_CSS = readFileSync(join(process.cwd(), "features/report/ui/v3/reportV3.css"), "utf8");
const V2_CSS = readFileSync(join(process.cwd(), "features/report/ui/report.css"), "utf8");
const CONFIDENCE: ReportV3Chapter = {
  id: "confidence_level",
  number: "2.4",
  title: "Confidence Level",
};

/** A Report 2.0 chart: its reveal flag as a class, as the sections set it. */
const Chart: FC = () => {
  const [ref, revealed] = useRevealOnView<HTMLDivElement>();
  return <div ref={ref} data-chart className={revealed ? "is-animated" : undefined} />;
};

const inChapter = (children: ReactNode, v4 = true) =>
  render(
    <V3ModeProvider>
      {v4 ? (
        <V4ModeProvider>
          <V3Chapter chapter={CONFIDENCE} sectionId={CONFIDENCE.id} archetype="Spark Seeker">
            {children}
          </V3Chapter>
        </V4ModeProvider>
      ) : (
        <V3Chapter chapter={CONFIDENCE} sectionId={CONFIDENCE.id} archetype="Spark Seeker">
          {children}
        </V3Chapter>
      )}
    </V3ModeProvider>
  );

const revealed = (container: HTMLElement) =>
  container.querySelector("[data-chart]")!.classList.contains("is-animated");
const toggle = (container: HTMLElement) =>
  fireEvent.click(container.querySelector(".rv4-chapter__button")!);
/** The body's own 320ms expansion ends (reportV3.css 604). */
const expanded = (container: HTMLElement) =>
  fireEvent(container.querySelector(".rv3-chapter__body")!, new Event("transitionend"));
/** The box mockRect draws, at another height. */
const box = (top: number) =>
  ({ top, bottom: top + 61, left: 0, right: 329, width: 329, height: 61, x: 0, y: top }) as DOMRect;
const watched = () => RevealObserver.instances.filter((o) => o.elements.size > 0);

beforeEach(() => {
  installRevealObserver();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Report 2.0's reveals inside a V4 chapter (desktop review 01.10)", () => {
  it("hold while the chapter is closed, however far the reader scrolls", () => {
    mockRect({ top: 100 });
    const { container } = inChapter(<Chart />);
    fireEvent.scroll(window);
    expect(revealed(container)).toBe(false);
    expect(watched()).toHaveLength(0);
  });

  it("play once the chapter is open and its body has finished expanding", () => {
    mockRect({ top: 100 });
    const { container } = inChapter(<Chart />);
    toggle(container);
    // Still expanding: the reader would see the first third of the choreography clipped.
    expect(revealed(container)).toBe(false);
    expanded(container);
    expect(revealed(container)).toBe(true);
  });

  it("ignore the end of a transition inside the body, the chart's own included", () => {
    mockRect({ top: 100 });
    const { container } = inChapter(<Chart />);
    toggle(container);
    fireEvent(
      container.querySelector("[data-chart]")!,
      new Event("transitionend", { bubbles: true })
    );
    expect(revealed(container)).toBe(false);
  });

  it("still play where the body runs no transition to end", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    mockRect({ top: 100 });
    const { container } = inChapter(<Chart />);
    toggle(container);
    act(() => vi.advanceTimersByTime(300));
    expect(revealed(container)).toBe(false);
    act(() => vi.advanceTimersByTime(100));
    expect(revealed(container)).toBe(true);
  });

  it("wait for the scroll band once drawn, as on Report 2.0", () => {
    const rect = mockRect({ top: 2000 });
    const { container } = inChapter(<Chart />);
    toggle(container);
    expanded(container);
    expect(revealed(container)).toBe(false);
    rect.mockReturnValue(box(100));
    fireEvent.scroll(window);
    expect(revealed(container)).toBe(true);
  });

  it("hold again when the reader closes the chapter before reaching the chart", () => {
    const rect = mockRect({ top: 2000 });
    const { container } = inChapter(<Chart />);
    toggle(container);
    expanded(container);
    toggle(container);
    rect.mockReturnValue(box(100));
    fireEvent.scroll(window);
    expect(revealed(container)).toBe(false);
    expect(watched()).toHaveLength(0);
    // Reopened, it waits for the expansion again.
    toggle(container);
    expect(revealed(container)).toBe(false);
    expanded(container);
    expect(revealed(container)).toBe(true);
  });

  it("leave Report 2.0 itself alone: no chapter, the chart reveals in the band at once", () => {
    mockRect({ top: 100 });
    const { container } = render(<Chart />);
    expect(revealed(container)).toBe(true);
  });

  it("leave ?v3=1 alone: its chapters start open, and reveal as before", () => {
    mockRect({ top: 100 });
    const { container } = inChapter(<Chart />, false);
    expect(revealed(container)).toBe(true);
  });
});

describe("the 2.0 sections with an observer of their own", () => {
  // Placeholder copy: the paid rungs never belong in a test file (the repo is public).
  const GROWTH = {
    locked: false,
    "rung1.from": "From one",
    "rung1.to": "To one",
    "rung2.from": "From two",
    "rung2.to": "To two",
  };

  it("Growth Potentials' climb waits for its chapter", () => {
    mockRect({ top: 100 });
    const { container } = inChapter(
      <GrowthSection
        archetype="Spark Seeker"
        copy={GROWTH}
        onUnlock={() => {}}
        sectionTitle="Growth"
      />
    );
    const growth = container.querySelector(".report-growth")!;
    expect(watched()).toHaveLength(0);
    toggle(container);
    expanded(container);
    expect(watched()).toHaveLength(1);
    watched()[0]!.fire();
    expect(growth.classList.contains("is-animated")).toBe(true);
  });

  it("Practice Tendencies' tables wait for theirs (Fantasy vs. Reality on Report 2.0)", () => {
    mockRect({ top: 100 });
    const raw = reportPracticeTendencies["Spark Seeker"]!;
    const content = {
      introBlocks: raw.introBlocks,
      groups: raw.groups.map((g) => ({
        title: g.title,
        rows: g.rows,
        totalRowCount: g.rows.length,
      })),
    };
    const { container } = inChapter(
      <PracticeTendenciesSection
        archetype="Spark Seeker"
        content={content}
        isPremium={false}
        sectionTitle="Typical Sexual Fantasy & Practice Tendencies"
      />
    );
    const panel = container.querySelector(".report-practice-panel")!;
    expect(watched()).toHaveLength(0);
    toggle(container);
    expanded(container);
    expect(watched()).toHaveLength(1);
    watched()[0]!.fire();
    expect(panel.classList.contains("is-animated")).toBe(true);
  });
});

describe("Reading Recommendations' book opens with its chapter (reportV3.css)", () => {
  // report.css 12007 holds the book shut on `.report-section:not(.is-visible)`, a class
  // no V4 chapter carries, so under V4 the book sat open and never moved.
  const V2_SHUT = ".report-section:not(.is-visible) .report-reading__book-3d {";
  const V4_SHUT = ".rv3.rv4 .rv4-chapter:not(.is-open) .report-reading__book-3d {";
  const body = (css: string, from: number) =>
    css.slice(css.indexOf("{", from) + 1, css.indexOf("}", from));

  it("holds the book in 2.0's shut pose while the chapter is closed", () => {
    const at = V3_CSS.indexOf(V4_SHUT);
    expect(at, "missing the V4 shut pose").toBeGreaterThan(-1);
    expect(V3_CSS.slice(0, at).split("\n").length).toBeGreaterThan(1884);
    expect(body(V3_CSS, at).trim()).toBe(body(V2_CSS, V2_CSS.indexOf(V2_SHUT)).trim());
  });

  it("keeps it still under reduced motion, as 2.0 does", () => {
    const reduce = V3_CSS.lastIndexOf(
      "@media (prefers-reduced-motion: reduce)",
      V3_CSS.lastIndexOf(V4_SHUT.slice(0, -2))
    );
    const block = V3_CSS.slice(reduce, V3_CSS.indexOf("\n}\n", reduce));
    expect(block).toContain(".rv3.rv4 .rv4-chapter:not(.is-open) .report-reading__book-3d {");
    expect(block).toContain("transform: rotateY(15deg) rotateX(1.5deg);");
    expect(block).toContain("opacity: 1;");
  });
});
