/**
 * The cost watch (features/brain/server/cost-watch.ts): what we pay for tools and services,
 * read from the Business Case cost sheet. The promises are that people's pay never appears,
 * that a month is called settled only once the filing has run, and that a hand-typed line
 * nobody updated is called out rather than read as a real figure.
 */
import { describe, expect, it } from "vitest";
import {
  adsForMonth,
  lastBilledMonth,
  parseCosts,
  renderCostWatch,
} from "@features/brain/server/cost-watch";

const serial = (month: string) =>
  (Date.parse(`${month}-01T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86_400_000;
const MONTHS = ["2026-06", "2026-07", "2026-08", "2026-09"];
/** A sheet row: costs are negative there, and "N/A" where a line does not apply. */
const line = (name: string, category: string, ...eur: Array<number | "N/A">) => [
  name,
  "",
  category,
  ...eur.map((v) => (typeof v === "number" ? -v : v)),
];
const sheet = (lines: unknown[][]) => [
  ["", "", "", ...MONTHS.map(serial), "a note"],
  ["", "", "", ...MONTHS.map(() => "Act.")],
  ["Total costs (line-based) €", "", "", -1, -1, -1, -1],
  ["Name", "Description", "Category"],
  ...lines,
];

describe("parseCosts", () => {
  it("reads month columns from the date serials and lines from under the Name header", () => {
    const parsed = parseCosts(
      sheet([
        line("Slack", "Software", 30, 33.27, "N/A", 0),
        ["Refund", "", "Software", 5],
        ["", "", "Software", -99],
      ])
    );
    expect(parsed.months).toEqual(MONTHS);
    // The total row above the header is not a line, and a row without a name is skipped.
    expect(parsed.lines.map((l) => l.name)).toEqual(["Slack", "Refund"]);
    const slack = parsed.lines[0]!.months;
    expect([...slack.values()]).toEqual([30, 33.27, null, 0]);
    // A positive figure in the sheet is a credit.
    expect(parsed.lines[1]!.months.get("2026-06")).toBe(-5);
  });

  it("finds no lines when the header is gone, rather than reading the wrong rows", () => {
    expect(parseCosts([[serial("2026-08")], ["Slack", "", "Software", -30]]).lines).toEqual([]);
  });
});

describe("lastBilledMonth", () => {
  it("moves on only once the filing has run, at 06:40 UTC on the 3rd", () => {
    expect(lastBilledMonth(new Date("2026-09-03T06:59:00Z"))).toBe("2026-07");
    expect(lastBilledMonth(new Date("2026-09-03T07:00:00Z"))).toBe("2026-08");
    expect(lastBilledMonth(new Date("2026-09-27T12:00:00Z"))).toBe("2026-08");
    expect(lastBilledMonth(new Date("2026-01-02T12:00:00Z"))).toBe("2025-11");
    expect(lastBilledMonth(new Date("2026-01-10T12:00:00Z"))).toBe("2025-12");
  });
});

describe("adsForMonth", () => {
  it("sums only the days GA4's ad data covers, and counts them", () => {
    const ad = {
      byDay: new Map([
        ["2026-08-09", 100],
        ["2026-08-10", 10],
        ["2026-08-20", 20],
        ["2026-08-21", 100],
      ]),
      from: "2026-08-10",
      to: "2026-08-20",
    };
    expect(adsForMonth(ad, "2026-08")).toEqual({ eur: 30, covered: 11, days: 31 });
    expect(adsForMonth({ ...ad, from: null }, "2026-08")).toEqual({ eur: 0, covered: 0, days: 31 });
    expect(adsForMonth(ad, "2026-02").days).toBe(28);
  });
});

describe("renderCostWatch", () => {
  const now = new Date("2026-09-27T12:00:00Z");
  const parsed = parseCosts(
    sheet([
      line("Claude", "Software", 400, 476.77, 537.88, 576.01),
      line("Adwords", "Marketing", 909.54, 1129, 1129, 1129),
      line("Slack", "Software", 33.27, 33.27, 44.44, 78.77),
      line("Jira", "Software", 66.29, 66.29, 55.5, 55.5),
      line("Small", "Software", 3, 3, 4, 4),
      line("NewTool", "Software", "N/A", "N/A", 20, 20),
      line("OldTool", "Software", 15, 15, "N/A", "N/A"),
      line("Figma", "Software", 107.1, 95.59, 89.25, 89.25),
      line("Jane Doe", "FTE - Freelance", 2468.13, 2468.13, 2468.13, 2468.13),
      line("An Intern", "Intern - full time", 555, 555, 555, 555),
    ])
  );
  const text = renderCostWatch(parsed, now, { eur: 1252.99, covered: 31, days: 31 });

  it("compares the latest settled month with the one before, without anyone's pay", () => {
    expect(text).toContain(
      "August 2026, the latest month the invoice filing has settled: EUR 1,880.07, " +
        "against EUR 1,818.92 in July 2026 (+3.4%)."
    );
    expect(text).not.toMatch(/Jane|Intern|2,468|555/);
  });

  it("lists what moved largest first, and what started and stopped", () => {
    const claude = text.indexOf("- Claude EUR 476.77 → EUR 537.88 (+EUR 61.11)");
    const slack = text.indexOf("- Slack EUR 33.27 → EUR 44.44 (+EUR 11.17)");
    const jira = text.indexOf("- Jira EUR 66.29 → EUR 55.50 (-EUR 10.79)");
    expect(claude).toBeGreaterThan(-1);
    expect(slack).toBeGreaterThan(claude);
    expect(jira).toBeGreaterThan(slack);
    // A one-euro change is not news, and neither is Figma's six against its 96.
    expect(text).not.toMatch(/- Small EUR|- Figma EUR/);
    expect(text).toContain("New in August 2026: NewTool EUR 20.00.");
    expect(text).toContain("Stopped in August 2026: OldTool.");
  });

  it("gives the trend up to the settled month and calls the month after it open", () => {
    expect(text).toContain(
      "Trend: June 2026 EUR 1,534.20 · July 2026 EUR 1,818.92 · August 2026 EUR 1,880.07."
    );
    expect(text).toContain(
      "September 2026 is not settled yet: EUR 1,952.53 on the sheet so far, the invoices " +
        "filed to date plus each other vendor's last figure. The filing on 3 October 2026 settles it."
    );
  });

  it("calls out a hand-typed line nobody updated, and sets Google Ads beside GA4", () => {
    expect(text).toContain(
      "Typed in by hand, since no invoice PDF reaches our mailboxes: Adwords, Figma."
    );
    expect(text).toContain(
      "- Adwords: EUR 1,129.00 for August 2026. The same as July 2026, so August 2026 may " +
        "never have been entered. GA4 recorded EUR 1,252.99 of Google Ads spend that month."
    );
    // Figma was typed in (it moved), and GA4 knows nothing about it.
    expect(text).not.toContain("- Figma:");
    expect(renderCostWatch(parsed, now, { eur: 900, covered: 27, days: 31 })).toContain(
      "GA4 recorded EUR 900.00 of Google Ads spend that month, over the 27 of 31 days its data covers."
    );
    const noGa4 = renderCostWatch(parsed, now);
    expect(noGa4).not.toContain("GA4");
    expect(noGa4).toContain("so August 2026 may never have been entered.");
    expect(renderCostWatch(parsed, now, { eur: 0, covered: 0, days: 31 })).not.toContain("GA4");
  });

  it("says so when the sheet has no column for the settled month", () => {
    expect(renderCostWatch(parsed, new Date("2027-06-10T00:00:00Z"))).toBe(
      "The cost sheet has no column for May 2027, so there is nothing to compare yet."
    );
  });
});
