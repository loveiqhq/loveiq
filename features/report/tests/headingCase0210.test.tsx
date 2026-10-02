// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { buildAccelerators } from "@/data/report3-accelerators";
import { REPORT_V4_PARTS } from "@/data/report3-archetype-page";
import { buildFantasy } from "@/data/report3-fantasy";
import { buildPartnership } from "@/data/report3-partnership";
import { REPORT_V4_TYPICAL_BELIEFS, buildTypicalBeliefs } from "@/data/report3-typical-beliefs";
import { titleCase } from "@features/report/logic/titleCase";
import V3Methodology from "@features/report/ui/v3/V3Methodology";
import V4Accelerators from "@features/report/ui/v3/V4Accelerators";
import V4Fantasy from "@features/report/ui/v3/V4Fantasy";
import V4Partnership from "@features/report/ui/v3/V4Partnership";
import V4TypicalBeliefs from "@features/report/ui/v3/V4TypicalBeliefs";
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

afterEach(cleanup);

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
