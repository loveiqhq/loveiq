import { afterEach, describe, expect, it, vi } from "vitest";

type Row = {
  day: string;
  unique_visitors: number;
  submissions: number;
  reports_paid: number;
  revenue: string | number;
};
let rows: Row[] = [];
let ad: { byDay: Map<string, number>; from: string | null; to: string | null } = {
  byDay: new Map(),
  from: null,
  to: null,
};
const mockRollup = vi.fn(async () => rows);
vi.mock("@features/brain/server/ingest/analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@features/brain/server/ingest/analytics")>()),
  brainDailyRollup: (...a: unknown[]) => mockRollup(...(a as [])),
  adCostByDay: async () => ad,
}));

import { breakEven } from "@features/brain/server/break-even";

const NOW = Date.parse("2026-09-26T09:00:00Z");
/** Days from 180 back to yesterday, newest first as the database returns them. */
function history(on: (day: string) => Partial<Row>): Row[] {
  const out: Row[] = [];
  for (let i = 1; i <= 181; i += 1) {
    const day = new Date(Date.parse("2026-09-26T00:00:00Z") - i * 86_400_000)
      .toISOString()
      .slice(0, 10);
    out.push({ day, unique_visitors: 0, submissions: 0, reports_paid: 0, revenue: 0, ...on(day) });
  }
  return out;
}
/** Spend of 50 a day on every day from `from` to `to`, all of it covered. */
function spend(from: string, to: string, perDay = 50) {
  const byDay = new Map<string, number>();
  for (
    let t = Date.parse(`${from}T00:00:00Z`);
    t <= Date.parse(`${to}T00:00:00Z`);
    t += 86_400_000
  ) {
    byDay.set(new Date(t).toISOString().slice(0, 10), perDay);
  }
  return { byDay, from, to };
}
/**
 * Ten days, 16 to 25 Sep: 1,000 visitors and 50 finishers a day, one purchase of EUR 25 on
 * the 18th and one on the 22nd. So a visitor costs 0.05, 5% finish, 0.4% of finishers pay,
 * the average order is 25, revenue per visitor is 0.005 and it has to grow ten times.
 */
const standard = () => {
  rows = history((day) =>
    day >= "2026-09-16"
      ? {
          unique_visitors: 1000,
          submissions: 50,
          ...(day === "2026-09-18" || day === "2026-09-22"
            ? { reports_paid: 1, revenue: "25.00" }
            : {}),
        }
      : {}
  );
  ad = spend("2026-09-01", "2026-09-25");
};
const text = async (req: Record<string, unknown>) => {
  const r = await breakEven(req, NOW);
  if (!r.ok) throw new Error(`refused: ${r.message}`);
  return r.text;
};
const refusal = async (req: Record<string, unknown>) => {
  const r = await breakEven(req, NOW);
  if (r.ok) throw new Error("answered where it should have refused");
  return r.message;
};

afterEach(() => {
  mockRollup.mockClear();
  rows = [];
  ad = { byDay: new Map(), from: null, to: null };
});

describe("break_even: where it stands", () => {
  it("reads the window's numbers and the level each lever alone must reach", async () => {
    standard();
    const t = await text({ days: 10 });
    expect(t).toContain(
      "Break-even on Google Ads, 10 days to 25 Sep 2026 (every day covered by the ad data)."
    );
    expect(t).toContain("- Spent EUR 500.00 on Google Ads, EUR 50.00 a day.");
    expect(t).toContain("- 10,000 visitors (each person once a day), so each cost EUR 0.050.");
    expect(t).toContain("- 500 finished the survey: 5.0% of visitors.");
    expect(t).toContain("- 2 paid: 0.40% of finishers.");
    expect(t).toContain("- They paid EUR 25.00 on average, EUR 50.00 in all.");
    expect(t).toContain("- Net after ad spend: EUR -450.00. Revenue covered 10.0% of the spend.");
    expect(t).toContain("- each visitor costs at most EUR 0.005 (now EUR 0.050), or");
    expect(t).toContain("- 50.0% of visitors finish the survey (now 5.0%), or");
    expect(t).toContain("- 4.0% of finishers pay (now 0.40%), or");
    expect(t).toContain("- the average order is EUR 250.00 (now EUR 25.00).");
    expect(t).toContain(
      "Revenue per visitor has to grow 10 times, however that is split between the levers."
    );
    // Enough history for the fallback average order is read in the same call.
    expect(mockRollup).toHaveBeenCalledWith(181);
  });

  it("counts spend AND revenue only on the days the ad data covers, never one without the other", async () => {
    standard();
    // The ad data starts on the 20th, so the 18th's purchase and the 16th-19th's visitors drop out.
    ad = spend("2026-09-20", "2026-09-25");
    const t = await text({ days: 10 });
    expect(t).toContain("(the 6 of them the ad data covers)");
    expect(t).toContain("- Spent EUR 300.00 on Google Ads, EUR 50.00 a day.");
    expect(t).toContain("- 6,000 visitors");
    expect(t).toContain("- 1 paid:");
    expect(t).toContain("- Net after ad spend: EUR -275.00.");
  });

  it("says when purchases are too few to trust, and not when there are enough", async () => {
    standard();
    expect(await text({ days: 10 })).toContain("Read with care: 2 purchases are too few to trust");
    rows = history((day) =>
      day >= "2026-09-16"
        ? { unique_visitors: 1000, submissions: 50, reports_paid: 1, revenue: 25 }
        : {}
    );
    expect(await text({ days: 10 })).not.toContain("Read with care");
    rows = history((day) =>
      day >= "2026-09-16"
        ? {
            unique_visitors: 1000,
            submissions: 50,
            ...(day === "2026-09-20" ? { reports_paid: 1, revenue: 25 } : {}),
          }
        : {}
    );
    const one = await text({ days: 10 });
    expect(one).toContain("Read with care: 1 purchase is too few to trust");
    // One purchase is its own average: nothing props the divisor up.
    expect(one).toContain("- They paid EUR 25.00 on average, EUR 25.00 in all.");
  });

  it("borrows the average order from 180 days when nobody paid in the window, and says so", async () => {
    rows = history((day) =>
      day >= "2026-09-16"
        ? { unique_visitors: 1000, submissions: 50 }
        : day === "2026-08-01"
          ? { reports_paid: 2, revenue: "40.00" }
          : {}
    );
    ad = spend("2026-09-01", "2026-09-25");
    const t = await text({ days: 10 });
    expect(t).toContain(
      "Nobody paid in the window, so the average order is from the last 180 days (EUR 20.00 over 2 purchases)."
    );
    expect(t).toContain("- Revenue EUR 0.00.");
    // With nobody paying, finishing more cannot help, and the answer says so plainly.
    expect(t).toContain(
      "- Visitors who finish: no level is enough while another lever is zero, or"
    );
    expect(t).toContain("- 5.0% of finishers pay (now 0.0%), or");
    expect(t).toContain(
      "Revenue per visitor is zero now, so only the lever at zero can close the gap on its own."
    );
  });

  it("says there is no average order at all when nobody paid in 180 days", async () => {
    rows = history((day) =>
      day >= "2026-09-16" ? { unique_visitors: 1000, submissions: 50 } : {}
    );
    ad = spend("2026-09-01", "2026-09-25");
    const t = await text({ days: 10 });
    expect(t).toContain("pass average_order to model one");
    // Nobody pays AND there is no average order: two levers at zero, so none can do it alone.
    expect(t).toContain("more than one lever is at zero, so no single lever can close the gap");
  });
});

describe("break_even: what if", () => {
  it("puts the given levers in place of today's and prices the difference", async () => {
    standard();
    const t = await text({ days: 10, finish_to_paid: 6 });
    expect(t).toContain("What if 6.0% of finishers pay, with the rest as now:");
    expect(t).toContain(
      "- Revenue per visitor EUR 0.075 against a cost of EUR 0.050: EUR 0.025 profit per visitor, EUR 25.00 per 1,000 visitors."
    );
    expect(t).toContain("- Over the same 10,000 visitors: EUR 250.00.");
    expect(t).toContain(
      "Already above break-even: revenue per visitor (EUR 0.075) covers its cost 1.5 times over."
    );
    // "now" is today; the what-if's own value is labelled as such, never as "now".
    expect(t).toContain("- each visitor costs at most EUR 0.075 (EUR 0.050 in the what-if), or");
    expect(t).toContain("- 4.0% of finishers pay (6.0% in the what-if), or");
    expect(t).toContain("- the average order is EUR 16.67 (EUR 25.00 in the what-if).");
    expect(t).not.toContain("(now 6.0%)");
    // Today's real numbers are still shown above the what-if, unchanged.
    expect(t).toContain("- 2 paid: 0.40% of finishers.");
  });

  it("calls a share above 100% impossible rather than printing it as a target", async () => {
    standard();
    // A visitor at EUR 2.105 would need 2,105% of visitors to finish: no such share exists.
    const t = await text({ days: 10, cost_per_visitor: 2.105 });
    expect(t).toMatch(
      /- 2,105\.0% of visitors finish the survey \(5\.0% in the what-if\), impossible alone, or/
    );
    expect(t).toContain("EUR 2.10 loss per visitor");
  });
});

describe("break_even: what it refuses", () => {
  it("holds days to whole numbers from 7 to 180", async () => {
    standard();
    for (const days of [6, 181, 7.5, "x"]) {
      expect(await refusal({ days })).toMatch(/whole number from 7 to 180/);
    }
  });

  it("holds shares to 0 to 100 and amounts to 0 or more", async () => {
    standard();
    expect(await refusal({ finish_to_paid: 101 })).toMatch(/percentage from 0 to 100/);
    expect(await refusal({ visitor_to_finish: -1 })).toMatch(/percentage from 0 to 100/);
    expect(await refusal({ average_order: "abc" })).toMatch(/amount in EUR of 0 or more/);
    expect(await refusal({ cost_per_visitor: -0.1 })).toMatch(/amount in EUR of 0 or more/);
    expect(mockRollup).not.toHaveBeenCalled();
  });

  it("calls a window the ad data never covered missing data, not zero spend", async () => {
    standard();
    ad = { byDay: new Map(), from: null, to: null };
    expect(await refusal({ days: 10 })).toMatch(
      /covers none of the 10 days to 25 Sep 2026.*missing data, not zero spend/s
    );
  });
});
