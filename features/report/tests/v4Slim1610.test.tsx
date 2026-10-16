// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import V3ArchetypeCard from "@features/report/ui/v3/V3ArchetypeCard";
import V3Methodology from "@features/report/ui/v3/V3Methodology";
import V4Part1 from "@features/report/ui/v3/V4Part1";
import V4PremiumCard from "@features/report/ui/v3/V4PremiumCard";
import V4SummaryChapter from "@features/report/ui/v3/V4SummaryChapter";
import V4TopThreeSection from "@features/report/ui/v3/V4TopThreeSection";
import { reportThemes } from "@features/report/ui/reportTheme";
import { FIRST_PAYWALL_SELECTOR } from "@features/report/logic/leaveIntent";
import { KNOWN_ARCHETYPES } from "@features/report/server/archetypeSlug";
import { report4ArchetypeBlurbs } from "@/data/report3-archetype-blurbs";
import { buildArchetypeCard } from "@/data/report3-archetype-card";
import { REPORT_V4_SUMMARY, SUMMARY_FREE_PARAGRAPHS, buildSummary } from "@/data/report3-summary";
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

describe("Part II's half-locked Summary (1665:3796)", () => {
  it.each(KNOWN_ARCHETYPES)(
    "%s's: two paragraphs and the third's first sentence, the rest veiled, nothing after",
    (name) => {
      const whole = REPORT_V4_SUMMARY[name]!.paragraphs;
      const locked = buildSummary(name, { locked: true })!;
      expect(locked.locked).toBe(true);
      expect(locked.paragraphs).toEqual(whole.slice(0, SUMMARY_FREE_PARAGRAPHS));
      const third = whole[SUMMARY_FREE_PARAGRAPHS]!.map((r) => r.text).join("");
      const lead = locked.ramp!.lead.map((r) => r.text).join("");
      expect(lead).toMatch(/[.!?]["”’]?$/);
      expect(third.startsWith(lead)).toBe(true);
      expect(locked.ramp!.veiled.every((r) => r.veiled)).toBe(true);
      // Nothing past the third paragraph leaves the server for a locked reader.
      const sent = JSON.stringify(locked);
      for (const later of whole.slice(SUMMARY_FREE_PARAGRAPHS + 1)) {
        expect(sent).not.toContain(
          later
            .map((r) => r.text)
            .join("")
            .slice(0, 40)
        );
      }
      expect(buildSummary(name)!).toMatchObject({ locked: false, ramp: null, paragraphs: whole });
    }
  );

  it("draws the copy, the veil and its own gate card, which opens the paywall", () => {
    const onUnlock = vi.fn();
    const { container } = render(
      <V4SummaryChapter
        archetype="Spark Seeker"
        summary={buildSummary("Spark Seeker", { locked: true })!}
        onUnlock={onUnlock}
      />
    );
    expect(container.querySelector(".rv4-summary")).toHaveClass("is-locked");
    expect(container.querySelector(".rv4-summary")).not.toHaveClass("is-collapsed");
    expect(container.querySelectorAll(".rv4-summary__copy p")).toHaveLength(3);
    const veil = container.querySelector(".rv4-summary__veil")!;
    expect(veil.getAttribute("aria-hidden")).toBe("true");
    expect(veil.hasAttribute("inert")).toBe(true);
    expect(screen.queryByRole("button", { name: "Show all of the summary" })).toBeNull();
    const card = container.querySelector(".rv4-premium")!;
    expect(card).toHaveClass("rv4-premium--summary");
    fireEvent.click(screen.getByRole("button", { name: /Unlock Report/ }));
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it("is not the first paywall the founder-call offer and 'paywall reached' wait for", () => {
    const { container } = render(
      <>
        <V4PremiumCard placement="summary" />
        <V4PremiumCard variant="body" />
      </>
    );
    const [summaryCard, chapterCard] = container.querySelectorAll(".rv4-premium");
    expect(summaryCard).toHaveClass("rv4-premium--summary");
    expect(document.querySelector(FIRST_PAYWALL_SELECTOR)).toBe(chapterCard);
  });
});

describe("Part II's half-locked archetype card (1665:9806 / 9830 / 9853 / 9876)", () => {
  it("shows each dimension's first sentence, and locks the rest behind one button", () => {
    const onUnlock = vi.fn();
    const copy = buildArchetypeCard("Spark Seeker", { locked: true })!;
    const { container } = render(
      <V3ArchetypeCard
        archetype="Spark Seeker"
        matchStrength={43}
        copy={copy}
        onUnlock={onUnlock}
      />
    );
    const focused = container.querySelectorAll(".rv3-deck__card.is-focused");
    expect(focused).toHaveLength(4);
    focused.forEach((face, i) => {
      expect(face.querySelector(".rv3-deck__body")!.textContent).toBe(copy.dimensions[i]!.body);
      expect(face.querySelector(".rv3-deck__body")).toHaveClass("is-lead");
      expect(face.querySelector(".rv3-deck__veil")!.getAttribute("aria-hidden")).toBe("true");
    });
    // The peeking designs draw the same lock, inert: only live locks are buttons.
    const locks = screen.getAllByRole("button", { name: "Unlock Report" });
    expect(locks.length).toBeGreaterThan(0);
    fireEvent.click(locks[0]!);
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it("draws no lock for a reader who has the Summary's gate", () => {
    const { container } = render(
      <V3ArchetypeCard
        archetype="Spark Seeker"
        matchStrength={43}
        copy={buildArchetypeCard("Spark Seeker")!}
      />
    );
    expect(container.querySelector(".rv3-deck__lock")).toBeNull();
    expect(container.querySelector(".rv3-deck__body.is-lead")).toBeNull();
  });
});
