// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import FindingsSection, { type FindingsCopy } from "@features/report/ui/sections/FindingsSection";

/**
 * Where the paywall falls inside "Five things this report found".
 *
 * Three findings are free and two are withheld (Eman, 2026-08-19; it was two and
 * three). Both halves have to move together: the server never ships the real f4/f5
 * head or body to a locked client, so moving the line in the component alone would
 * render a blurred universal teaser where finding 3 should be — and moving it on
 * the server alone would print a real finding inside the blurred block.
 */
const lockedCopy: FindingsCopy = {
  "f1.head": "Real one",
  "f1.body": "Real one body",
  "f2.head": "Real two",
  "f2.body": "Real two body",
  "f3.head": "Real three",
  "f3.body": "Real three body",
  "f4.head": "Teaser four",
  "f4.body": "Teaser four body",
  "f5.head": "Teaser five",
  "f5.body": "Teaser five body",
  locked: true,
};

afterEach(cleanup);

describe("Findings — free/withheld split", () => {
  it("shows three findings sharp and blurs the last two", () => {
    const { container } = render(<FindingsSection copy={lockedCopy} onUnlock={() => {}} />);

    const free = [...container.querySelectorAll(".report-findings__rows > .report-findings__row")];
    expect(free.map((r) => r.querySelector(".report-findings__num")?.textContent)).toEqual([
      "01",
      "02",
      "03",
    ]);
    for (const row of free) {
      expect(row.className).not.toContain("report-findings__row--locked");
      expect(row.querySelector(".report-findings__lock")).toBeNull();
    }

    const group = container.querySelector(".report-findings__group--locked");
    expect(group, "the withheld block is missing").not.toBeNull();
    const withheld = [...group!.querySelectorAll(".report-findings__row")];
    expect(withheld.map((r) => r.querySelector(".report-findings__num")?.textContent)).toEqual([
      "04",
      "05",
    ]);
    for (const row of withheld) {
      expect(row.className).toContain("report-findings__row--locked");
    }
    // The way past the blur still sits over the withheld rows.
    expect(group!.querySelector(".report-findings__unlock")).not.toBeNull();
  });

  it("numbers all five and blurs none once bought", () => {
    const { container } = render(
      <FindingsSection copy={{ ...lockedCopy, locked: false }} onUnlock={() => {}} />
    );
    const nums = [...container.querySelectorAll(".report-findings__num")].map((n) => n.textContent);
    expect(nums).toEqual(["01", "02", "03", "04", "05"]);
    expect(container.querySelector(".report-findings__group--locked")).toBeNull();
    expect(container.querySelector(".report-findings__lock")).toBeNull();
    expect(container.querySelector(".report-findings__unlock")).toBeNull();
  });

  it("the server ships the real finding 3 and withholds only 4 and 5", () => {
    // The client half above is worthless if the payload still teases f3: it would
    // print the universal "Your #1 desire killer is a specific, fixable pattern"
    // as though it were this reader's third finding.
    const route = readFileSync(join(process.cwd(), "app/api/report/route.ts"), "utf8");
    const block = route.slice(
      route.indexOf("const findingsCopy = {"),
      route.indexOf('"upsell.line"')
    );

    expect(block).toMatch(/"f3\.head": findingsSection\["f3\.head"\] \?\? null/);
    expect(block).toMatch(/"f3\.body": findingsSection\["f3\.body"\] \?\? null/);
    expect(block).not.toMatch(/f3\.locked\./);
    for (const n of [4, 5]) {
      expect(block).toMatch(new RegExp(`"f${n}\\.head": findingsUnlocked`));
      expect(block).toMatch(new RegExp(`f${n}\\.locked\\.head`));
    }
  });
});
