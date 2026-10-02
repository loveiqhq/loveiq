// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RELATIONSHIP_FIT_BY_SLUG } from "@/data/report2-relationship-fit";
import CuriositySection, { fitSegments } from "@features/report/ui/sections/CuriositySection";

// Review 02.10, Mark (Notion, mobile unlocked, "Same for Desktop"): "Left whats live. Right
// what was in report 2.0. The indicators are only red if it they are 1 out of 3. (tiny
// mistake in report 2.0 on Monogamish, which should be purple)". Each segment used to be
// coloured on its own — a whole step violet, a half step peach — so a 1.5 drew violet +
// peach (2.0's Monogamish) and a 1 drew a lone violet. A row now fills ceil(score) of its
// three segments: violet, and peach only when a single one is filled.
afterEach(() => cleanup());

describe("Fit by relationship form — a row is one colour", () => {
  it.each([
    [3, ["full", "full", "full"]],
    [2.5, ["full", "full", "full"]],
    [2, ["full", "full", "empty"]],
    [1.5, ["full", "full", "empty"]],
    [1, ["low", "empty", "empty"]],
    [0.5, ["low", "empty", "empty"]],
    [0, ["empty", "empty", "empty"]],
  ])("a score of %s draws %j", (score, segments) => {
    expect(fitSegments(score)).toEqual(segments);
  });

  it("never mixes violet and peach in a row, for any of the 14 archetypes", () => {
    const slugs = Object.keys(RELATIONSHIP_FIT_BY_SLUG);
    expect(slugs).toHaveLength(14);
    for (const slug of slugs) {
      for (const [form, score] of Object.entries(RELATIONSHIP_FIT_BY_SLUG[slug]!)) {
        const segments = fitSegments(score);
        const low = segments.filter((s) => s === "low").length;
        const full = segments.filter((s) => s === "full").length;
        expect(low * full, `${slug} ${form} ${score}`).toBe(0);
        expect(low, `${slug} ${form} ${score}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("renders Monogamish's 1.5 violet, violet, empty and a 1 as a lone peach", () => {
    const { container } = render(
      <CuriositySection
        archetype="Spiritual Lover"
        copy={{ locked: false }}
        relationshipFit={{ monogamish: 1.5, dadt: 1 }}
        onUnlock={() => {}}
        sectionTitle="Curiosity & Relationship Form"
      />
    );
    const rows = [...container.querySelectorAll(".report-curiosity__fit-row")];
    const dots = (label: string) =>
      [
        ...rows
          .find((r) => r.textContent?.startsWith(label))!
          .querySelectorAll(".report-curiosity__fit-dot"),
      ].map((d) =>
        d.className.replace("report-curiosity__fit-dot report-curiosity__fit-dot--", "")
      );
    expect(dots("Monogamish")).toEqual(["full", "full", "empty"]);
    expect(dots("Don't-ask")).toEqual(["low", "empty", "empty"]);
  });
});
