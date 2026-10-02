// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAccelerators } from "@/data/report3-accelerators";
import { report3ArchetypeCard } from "@/data/report3-archetype-card";
import { REPORT_V4_PARTS } from "@/data/report3-archetype-page";
import { buildFantasy } from "@/data/report3-fantasy";
import { REPORT_V4_LEARN_MORE } from "@/data/report3-learn-more";
import { buildPartnership } from "@/data/report3-partnership";
import { REPORT_V4_TYPICAL_BELIEFS, buildTypicalBeliefs } from "@/data/report3-typical-beliefs";
import { titleCase } from "@features/report/logic/titleCase";
import { reportThemes } from "@features/report/ui/reportTheme";
import CoreArchetypeSection from "@features/report/ui/sections/CoreArchetypeSection";
import V3ArchetypeCard from "@features/report/ui/v3/V3ArchetypeCard";
import V3Methodology from "@features/report/ui/v3/V3Methodology";
import V4Accelerators from "@features/report/ui/v3/V4Accelerators";
import V4Fantasy from "@features/report/ui/v3/V4Fantasy";
import V4Partnership from "@features/report/ui/v3/V4Partnership";
import V4TypicalBeliefs from "@features/report/ui/v3/V4TypicalBeliefs";
import { V4_ARTICLE_LABEL, V4_PRACTICE_TITLE } from "@features/report/ui/v3/v4CardsFromV2";
import { REPORT_V4_NAV_PARTS } from "@features/report/ui/v3/reportV3Nav";
import { WIZARD_DRAWER } from "@features/survey/ui/wizard/wizardContent";

/**
 * Review 02.10, the sync: the report's titles and headings follow ChatGPT's Title Case
 * (titleCase0210.test.ts holds the rule). Mark: "And so I don't need to do it." Fatih:
 * "Yeah, you don't." So the Figma texts keep their old case, and these hold the source
 * strings to the rule, so a heading added or re-imported later cannot slip back.
 */
const follows = (heading: string) => expect(heading).toBe(titleCase(heading));
const texts = (root: ParentNode, selector: string) =>
  Array.from(root.querySelectorAll(selector), (el) => el.textContent ?? "");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the part names and the nav follow the 02.10 heading rule", () => {
  it("every part heading, read across its two spans", () => {
    for (const part of REPORT_V4_PARTS) follows(part.lead + part.accent);
  });

  it("every part label and row of the report's nav", () => {
    for (const part of REPORT_V4_NAV_PARTS) {
      follows(part.label);
      for (const item of part.items) follows(item.label);
    }
  });

  it("the pre-report wizard's copy of the drawer", () => {
    for (const part of WIZARD_DRAWER) {
      follows(part.label);
      for (const row of part.rows) follows(row.label);
    }
  });
});

describe("the science tiles follow the 02.10 heading rule", () => {
  it("titles all seven tiles in it, in V4's deck and ?v3=1's", () => {
    for (const chrome of ["deck", "full"] as const) {
      const { container, unmount } = render(<V3Methodology chrome={chrome} />);
      const titles = texts(container, ".rv3-sci__title");
      expect(titles).toHaveLength(7);
      titles.forEach(follows);
      unmount();
    }
  });
});

// Spark Seeker's chapters are set from Figma, the other thirteen from Sanjin's docs; both
// pass through the same components, whose every heading element is checked here.
describe.each(Object.keys(REPORT_V4_TYPICAL_BELIEFS))(
  "%s's four designed chapters follow the 02.10 heading rule",
  (name) => {
    const open = { locked: false };
    const chapters: [string, () => ReactElement][] = [
      ["Typical Beliefs", () => <V4TypicalBeliefs view={buildTypicalBeliefs(name, open)!} />],
      ["Accelerators & Brakes", () => <V4Accelerators view={buildAccelerators(name, open)!} />],
      ["Challenges in Partnerships", () => <V4Partnership view={buildPartnership(name, open)!} />],
      ["Fantasy vs. Reality", () => <V4Fantasy view={buildFantasy(name, open)!} />],
    ];
    it.each(chapters)("in every heading of %s", (_, chapter) => {
      const { container } = render(chapter());
      const headings = texts(container, "h1, h2, h3, h4, h5, h6");
      expect(headings.length).toBeGreaterThan(0);
      headings.forEach(follows);
    });
  }
);

// The practice card's title and the article card's label are set as a label, not an h
// element, so they are read from the data each card is drawn from.
describe("the Try This and Learn More cards follow the 02.10 heading rule", () => {
  it("in every archetype's four practices", () => {
    for (const name of Object.keys(REPORT_V4_TYPICAL_BELIEFS)) {
      for (const build of [
        buildTypicalBeliefs,
        buildAccelerators,
        buildPartnership,
        buildFantasy,
      ]) {
        follows(build(name, { locked: false })!.practice.title);
      }
    }
  });

  it("in every article, and in the cards Report 2.0's chapters take", () => {
    for (const article of Object.values(REPORT_V4_LEARN_MORE)) follows(article.label);
    follows(V4_PRACTICE_TITLE);
    follows(V4_ARTICLE_LABEL);
  });

  it("in every article's subheadings, free and paywalled", () => {
    for (const article of Object.values(REPORT_V4_LEARN_MORE)) {
      const headings = article.blocks.flatMap((b) => (b.kind === "heading" ? [b.text] : []));
      expect(headings.length).toBeGreaterThan(0);
      headings.forEach(follows);
    }
  });
});

describe("the archetype cards follow the 02.10 heading rule", () => {
  it("Spark Seeker's card: its labels, and the deck's titles, subtitles and verdicts", () => {
    for (const copy of Object.values(report3ArchetypeCard)) {
      follows(copy.coreMotivation.value);
      for (const d of copy.dimensions) [d.title, d.subtitle, d.value].forEach(follows);
      for (const meter of copy.meters) follows(meter.label);
    }
    const { container } = render(
      <V3ArchetypeCard
        archetype="Spark Seeker"
        matchStrength={43}
        copy={report3ArchetypeCard["Spark Seeker"]!}
      />
    );
    const labels = texts(container, ".rv3-arch__motive-label, .rv3-arch__motive-sub");
    expect(labels).toHaveLength(2);
    labels.forEach(follows);
  });

  // The thirteen archetypes without Report 3.0 card copy draw Report 2.0's card in V4.
  it.each(Object.keys(reportThemes))("%s's Report 2.0 card", (name) => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
    const { container } = render(
      <CoreArchetypeSection
        matchScore={80}
        theme={reportThemes[name as keyof typeof reportThemes]!}
      />
    );
    const labels = texts(
      container,
      [
        ".report-hero-card__badge",
        ".report-hero-card__label",
        ".report-hero-card__motivation-label",
        ".report-hero-card__match-label",
        ".report-trait__label",
        ".report-progress__header > span:first-child",
      ].join(", ")
    );
    expect(labels).toHaveLength(10);
    labels.forEach(follows);
  });
});
