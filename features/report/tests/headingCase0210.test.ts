import { describe, expect, it } from "vitest";
import { REPORT_V4_PARTS } from "@/data/report3-archetype-page";
import { titleCase } from "@features/report/logic/titleCase";
import { REPORT_V4_NAV_PARTS } from "@features/report/ui/v3/reportV3Nav";
import { WIZARD_DRAWER } from "@features/survey/ui/wizard/wizardContent";

/**
 * Review 02.10, the sync: the report's titles and headings follow ChatGPT's Title Case
 * (titleCase0210.test.ts holds the rule). Mark: "And so I don't need to do it." Fatih:
 * "Yeah, you don't." So the Figma texts keep their old case, and these hold the source
 * strings to the rule, so a heading added or re-imported later cannot slip back.
 */
const follows = (heading: string) => expect(heading).toBe(titleCase(heading));

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
