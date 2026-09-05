// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import AcceleratorsSection, {
  type AccelCopy,
} from "@features/report/ui/sections/AcceleratorsSection";
import V3Chapter from "@features/report/ui/v3/V3Chapter";
import { REPORT_V3_CHAPTERS } from "@features/report/ui/v3/reportV3Nav";


/**
 * V3 hides each section's own title heading with a depth-based CSS selector,
 * because the chapter button already carries the title and Figma's chapter body
 * opens straight into prose.
 *
 * The selector depends on the DOM shape `body-inner > sectionRoot > heading`.
 * These assertions fail if a section is restructured so its heading moves, or
 * if the rule is dropped — either of which would put the title on screen twice.
 */

afterEach(cleanup);

// Read directly rather than via readAppCss(), which concatenates only
// globals.css + report.css; adding a file there would change what every other
// contract test sees.
const V3_CSS = readFileSync(join(process.cwd(), "features/report/ui/v3/reportV3.css"), "utf8");

const copy: AccelCopy = {
  "edu.eyebrow": "The dual-control model",
  "edu.teaser": "Arousal runs on two independent pedals.",
  "learn.eyebrow": "What you will learn",
  "learn.body": "In this chapter you will learn which conditions open you.",
  takeaway: "Remove the brake first.",
  locked: false,
};

describe("V3 chapter headings", () => {
  it("ships the rule that hides a section's duplicated title heading", () => {
    expect(V3_CSS).toContain('.rv3 .rv3-chapter__body-inner > * > [class$="__heading"]');
  });

  it("keeps a representative section's heading at the depth the selector needs", () => {
    const chapter = REPORT_V3_CHAPTERS.find((c) => c.number === "2.1");
    expect(chapter).toBeTruthy();

    const { container } = render(
      <V3Chapter chapter={chapter!} sectionId={chapter!.id}>
        <AcceleratorsSection
          archetype="Spark Seeker"
          copy={copy}
          onUnlock={() => {}}
          sectionTitle={chapter!.title}
        />
      </V3Chapter>
    );

    const inner = container.querySelector(".rv3-chapter__body-inner");
    expect(inner).toBeTruthy();

    const heading = inner!.querySelector('[class$="__heading"]');
    expect(heading, "AcceleratorsSection no longer renders a *__heading").toBeTruthy();

    // The rule is `body-inner > * > [class$="__heading"]`: exactly two levels.
    expect(heading!.parentElement!.parentElement).toBe(inner);
    // …and the heading text is the very thing the chapter button already shows.
    expect(heading!.textContent?.trim()).toBe(chapter!.title);
    expect(container.querySelector(".rv3-chapter__title")?.textContent?.trim()).toBe(
      chapter!.title
    );
  });

  it("numbers all 21 chapters uniquely and in part order", () => {
    const numbers = REPORT_V3_CHAPTERS.map((c) => c.number);
    expect(numbers).toHaveLength(21);
    expect(new Set(numbers).size).toBe(21);
    expect(new Set(REPORT_V3_CHAPTERS.map((c) => c.id)).size).toBe(21);
    // Sorted ascending as (part, index) pairs — a reordering typo shows up here.
    const asPairs = numbers.map((n) => n.split(".").map(Number) as [number, number]);
    for (let i = 1; i < asPairs.length; i += 1) {
      const [pPart, pIdx] = asPairs[i - 1]!;
      const [cPart, cIdx] = asPairs[i]!;
      expect(cPart > pPart || (cPart === pPart && cIdx === pIdx + 1)).toBe(true);
    }
  });
});
