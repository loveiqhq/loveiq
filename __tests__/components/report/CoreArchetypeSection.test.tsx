// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CoreArchetypeSection from "@/components/report/sections/CoreArchetypeSection";
import { reportThemes } from "@/components/report/reportTheme";

function stubMatchMedia(reduceMotion = false) {
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

describe("CoreArchetypeSection", () => {
  beforeEach(() => {
    stubMatchMedia();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it("renders the archetype-specific theme content", () => {
    const { container } = render(
      <CoreArchetypeSection
        archetypeHtml="<p>Power-specific narrative.</p>"
        matchScore={88}
        theme={reportThemes["Power Orchestrator"]}
      />
    );

    const motto = container.querySelector(".report-hero-card__motto");

    expect(screen.getByRole("heading", { name: /power orchestrator/i })).toBeInTheDocument();
    expect(motto).toBeInTheDocument();
    expect(motto).toHaveTextContent('Motto: "I set the frame—and we play inside it."');
    expect(screen.getByText(/^power$/i)).toBeInTheDocument();
    expect(screen.getByText(/commanding/i)).toBeInTheDocument();
    expect(screen.getByText(/dominant/i)).toBeInTheDocument();
    expect(screen.getByText(/power-specific narrative/i)).toBeInTheDocument();
  });

  it("groups long mottos at the dash so wrap points stay phrase-safe", () => {
    for (const theme of Object.values(reportThemes)) {
      const { container, unmount } = render(
        <CoreArchetypeSection archetypeHtml={null} matchScore={80} theme={theme} />
      );

      const motto = container.querySelector(".report-hero-card__motto");
      const chunks = container.querySelectorAll(".report-hero-card__motto-chunk");

      expect(motto).toBeInTheDocument();
      expect(motto).toHaveTextContent(`Motto: ${theme.motto}`);

      if (theme.motto.includes("—")) {
        const [lead, trailing] = theme.motto.split("—");

        expect(chunks).toHaveLength(2);
        expect(chunks[0]).toHaveTextContent(`Motto: ${lead}—`);
        expect(chunks[1]).toHaveTextContent(trailing.trim());
      } else {
        expect(chunks).toHaveLength(1);
        expect(chunks[0]).toHaveTextContent(`Motto: ${theme.motto}`);
      }

      unmount();
    }
  });

  it("renders the motto as its own header row instead of inside the title column", () => {
    const { container } = render(
      <CoreArchetypeSection
        archetypeHtml={null}
        matchScore={91}
        theme={reportThemes["Power Orchestrator"]}
      />
    );

    const header = container.querySelector(".report-hero-card__header");
    const headerCopy = container.querySelector(".report-hero-card__header-copy");
    const motto = container.querySelector(".report-hero-card__motto");
    const match = container.querySelector(".report-hero-card__match");

    expect(header).toBeInTheDocument();
    expect(headerCopy).toBeInTheDocument();
    expect(motto).toBeInTheDocument();
    expect(match).toBeInTheDocument();
    expect(headerCopy?.contains(motto)).toBe(false);
    expect(Array.from(header?.children ?? [])).toEqual([headerCopy, motto, match]);
  });

  it("uses the dedicated 16x14 attachment heart icon footprint", () => {
    render(
      <CoreArchetypeSection
        archetypeHtml={null}
        matchScore={76}
        theme={reportThemes["Explorer of Edges"]}
      />
    );

    const attachmentLabel = screen
      .getAllByText(/^attachment$/i)
      .find((node) => node.closest(".report-trait__label"))
      ?.closest(".report-trait__label");
    const icon = attachmentLabel?.querySelector("svg");

    expect(icon).toBeInTheDocument();
    expect(icon).toHaveClass("report-trait__icon", "report-trait__icon--attachment");
    expect(icon).toHaveAttribute("viewBox", "0 0 16 14");
  });
});

describe("CoreArchetypeSection match strength animation", () => {
  const rafTimers = new Map<number, ReturnType<typeof setTimeout>>();
  let rafId = 0;
  let frameTime = 0;

  beforeEach(() => {
    vi.useFakeTimers();
    rafTimers.clear();
    rafId = 0;
    frameTime = 0;

    vi.spyOn(performance, "now").mockImplementation(() => frameTime);

    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      rafId += 1;
      const id = rafId;
      const timer = setTimeout(() => {
        rafTimers.delete(id);
        frameTime += 100;
        callback(frameTime);
      }, 0);
      rafTimers.set(id, timer);
      return id;
    });

    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      const timer = rafTimers.get(id);
      if (timer !== undefined) {
        clearTimeout(timer);
        rafTimers.delete(id);
      }
    });

    stubMatchMedia(false);
  });

  afterEach(() => {
    rafTimers.forEach((timer) => clearTimeout(timer));
    rafTimers.clear();
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    cleanup();
  });

  it("starts match value at 0 and counts up to final value on mount", async () => {
    const { container } = render(
      <CoreArchetypeSection
        archetypeHtml={null}
        matchScore={88}
        theme={reportThemes["Power Orchestrator"]}
      />
    );

    const matchValue = container.querySelector(".report-hero-card__match-value");
    const matchFill = container.querySelector(
      ".report-hero-card__match-fill"
    ) as HTMLElement | null;

    expect(matchValue).toHaveTextContent("0%");
    expect(matchFill?.style.width).toBe("0%");

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(matchValue).toHaveTextContent("88%");
    expect(matchFill?.style.width).toBe("88%");
  });

  it("jumps to final value immediately when prefers-reduced-motion is set", async () => {
    stubMatchMedia(true);

    const { container } = render(
      <CoreArchetypeSection
        archetypeHtml={null}
        matchScore={72}
        theme={reportThemes["Power Orchestrator"]}
      />
    );

    const matchValue = container.querySelector(".report-hero-card__match-value");

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(matchValue).toHaveTextContent("72%");
  });
});
