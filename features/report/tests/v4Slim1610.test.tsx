// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import V3Methodology from "@features/report/ui/v3/V3Methodology";
import V4Part1 from "@features/report/ui/v3/V4Part1";
import V4TopThreeSection from "@features/report/ui/v3/V4TopThreeSection";
import { reportThemes } from "@features/report/ui/reportTheme";
import { report4ArchetypeBlurbs } from "@/data/report3-archetype-blurbs";
import {
  REPORT_V4_CLOSING,
  REPORT_V4_INTRODUCTION,
  type Report3Run,
} from "@/data/report3-archetype-page";

/**
 * The slimmed report — Notion "Rework the report into the slimmed version" (16.10).
 *
 * Layout: Figma "Report - Slimmed" 1665:3278, Mark's 12.10 copy of the live 4:838.
 * Copy: Sanjin's four "Slimmed_*" Google Docs (16.10), which win where the two differ.
 * Readers found V4 too long (Mark's PostHog review, 13.10; the 14.10 sync), so the
 * report says less: shorter Part I and II copy, fewer chapters, folds instead of
 * blurred walls.
 */

afterEach(cleanup);

const text = (runs: readonly Report3Run[]) => runs.map((r) => r.text).join("");

describe("Part I, slimmed (1665:3284)", () => {
  it("keeps the introduction's first and last paragraphs and drops the middle one", () => {
    expect(REPORT_V4_INTRODUCTION.map(text)).toEqual([
      "Thank you for your trust and congratulations on having the courage to look inward.",
      "This report will help you understand why certain patterns feel familiar, why certain challenges keep repeating, and what you can do, starting today, to improve.",
    ]);
  });

  it("draws What Shaped This Report as a heading with no paragraph under it", () => {
    render(<V4Part1 />);
    const chapter = document.getElementById("what_shaped_this_report")!;
    expect(chapter.querySelector(".rv4-chapter__title")!.textContent).toBe(
      "What Shaped This Report"
    );
    expect(chapter.querySelector(".rv4-chapter__body")).toBeNull();
  });

  it("ends the closing paragraph on the psychometric approximation", () => {
    expect(REPORT_V4_CLOSING).toHaveLength(2);
    expect(text(REPORT_V4_CLOSING[1]!)).toMatch(/^This report is a psychometric approximation\./);
    render(<V3Methodology chrome="deck" />);
    expect(screen.queryByText(/time to dive into your/)).toBeNull();
  });
});

describe("Part II's top three, slimmed (1665:3553)", () => {
  it("goes straight from the heading to the rows: no lede", () => {
    const { container } = render(<V4TopThreeSection />);
    expect(container.querySelector(".rv4-top3__lede")).toBeNull();
    expect(screen.queryByText(/No one fits a single/)).toBeNull();
    expect(container.querySelector(".rv4-top3__heading")!.nextElementSibling).toBe(
      container.querySelector(".rv3-top3")
    );
  });

  it("describes every archetype in one sentence", () => {
    expect(Object.keys(report4ArchetypeBlurbs).sort()).toEqual(Object.keys(reportThemes).sort());
    for (const [name, blurb] of Object.entries(report4ArchetypeBlurbs)) {
      expect(blurb, name).toMatch(/^[^.]+\.$/);
    }
  });
});
