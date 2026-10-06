import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DaySeries } from "@features/brain/server/jumps";

type Day = { rollup?: Record<string, unknown>; ga4?: Record<string, unknown> };

/**
 * loadSeries(until, extra) returns every day from `until - (29 + extra)` to `until`, oldest
 * first. The fake honours exactly that, so the slice to `days` is exercised for real.
 */
let dayOf: (day: string) => Day = () => ({});
const mockLoad = vi.fn(async (until: string, extra = 0): Promise<DaySeries[]> => {
  const out: DaySeries[] = [];
  const end = Date.parse(`${until}T00:00:00Z`);
  for (let i = 29 + extra; i >= 0; i -= 1) {
    const day = new Date(end - i * 86_400_000).toISOString().slice(0, 10);
    out.push({ day, ...(dayOf(day) as object) } as DaySeries);
  }
  return out;
});
vi.mock("@features/brain/server/jumps", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@features/brain/server/jumps")>()),
  loadSeries: (until: string, extra?: number) => mockLoad(until, extra),
}));
const mockAd = vi.fn();
vi.mock("@features/brain/server/ingest/analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@features/brain/server/ingest/analytics")>()),
  adCostByDay: () => mockAd(),
}));
const mockFetch = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...a: unknown[]) => mockFetch(...(a as [])),
}));

import { CHART_METRICS, chartPng, drawChart } from "@features/brain/server/chart";
import { METRICS } from "@features/brain/server/jumps";
import { verifyImagePayload } from "@shared/url/signed-image-url";

const NOW = Date.parse("2026-09-26T09:00:00Z");
const payloadOf = async (url: string) => {
  const u = new URL(url);
  return (await verifyImagePayload<Record<string, unknown>>(
    u.searchParams.get("d"),
    u.searchParams.get("s")
  ))!;
};
const draw = async (req: Record<string, unknown>) => {
  const r = await drawChart(req as never, NOW);
  if (!r.ok) throw new Error(`refused: ${r.message}`);
  return { ...r, payload: await payloadOf(r.url) };
};
const refusal = async (req: Record<string, unknown>) => {
  const r = await drawChart(req as never, NOW);
  if (r.ok) throw new Error("drew a chart it should have refused");
  return r.message;
};

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://loveiq.example";
  process.env.STRATEGY_DIGEST_SIGNING_SECRET = "a-test-secret-of-some-length";
  dayOf = () => ({});
});
afterEach(() => {
  mockLoad.mockClear();
  mockFetch.mockReset();
  mockAd.mockReset();
});

describe("show_chart: what gets drawn", () => {
  it("charts one count over the days asked for, oldest first, with the window's total", async () => {
    const values: Record<string, number> = {};
    dayOf = (day) => {
      values[day] = 100 + Number(day.slice(8));
      return { rollup: { unique_visitors: values[day] } };
    };
    const { payload, text, url } = await draw({ metrics: ["visitors"], days: 7 });
    // Yesterday is the default last day: today is still going.
    expect(mockLoad).toHaveBeenCalledWith("2026-09-25", 0);
    expect(payload.kind).toBe("metric-trend");
    expect(payload.labels).toEqual([
      "19 Sep",
      "20 Sep",
      "21 Sep",
      "22 Sep",
      "23 Sep",
      "24 Sep",
      "25 Sep",
    ]);
    expect(payload.first).toEqual([119, 120, 121, 122, 123, 124, 125]);
    // Single-series mode is the ABSENCE of `last`, not an empty one.
    expect("last" in payload).toBe(false);
    expect(payload.unit).toBe("");
    expect(payload.title).toBe("Visitors (our own count)");
    expect(payload.headline).toBe("Over the 7 days: 854, 122 a day");
    // No gap on the chart, so no sentence explaining gaps under it.
    expect(payload.footnote).toBe("daily, UTC");
    expect(url.startsWith("https://loveiq.example/api/admin/digest-image/metric-trend?d=")).toBe(
      true
    );
    expect(text).toContain(`Picture: ${url}`);
    expect(text).toContain("- Visitors: 19 Sep 119 · 20 Sep 120");
  });

  it("loads enough days for a long window and keeps exactly the days asked for", async () => {
    const { payload } = await draw({ metrics: ["visitors"], days: 90, until: "2026-09-10" });
    expect(mockLoad).toHaveBeenCalledWith("2026-09-10", 90 - 28 - 1);
    expect((payload.labels as string[]).length).toBe(90);
    expect((payload.labels as string[]).at(-1)).toBe("10 Sep");
    expect((payload.labels as string[])[0]).toBe("13 Jun");
  });

  it("leaves a thin day as a gap and pools the window's share instead of averaging days", async () => {
    // start → finish: 50 of 100, then 10 of 10 (under the 20-start floor), then 30 of 300.
    const pattern = [
      { survey_starts: 100, submissions: 50 },
      { survey_starts: 10, submissions: 10 },
      { survey_starts: 300, submissions: 30 },
    ];
    let i = 0;
    const byDay: Record<string, (typeof pattern)[number]> = {};
    dayOf = (day) => ({ rollup: (byDay[day] ??= pattern[i++ % 3]!) });
    const { payload, text } = await draw({ metrics: ["finish_rate"], days: 7 });
    expect(payload.unit).toBe("%");
    const first = payload.first as Array<number | null>;
    expect(first).toContain(50);
    expect(first).toContain(10);
    expect(first).toContain(null);
    // The pooled share counts every start, thin days included: sum finishes / sum starts.
    const days = Object.keys(byDay)
      .sort()
      .slice(-7)
      .map((d) => byDay[d]!);
    const n = days.reduce((a, d) => a + d.submissions, 0);
    const k = days.reduce((a, d) => a + d.survey_starts, 0);
    expect(payload.headline).toBe(
      `Over the 7 days: ${Math.round((1000 * n) / k) / 10}% (${n.toLocaleString("en-GB")} of ${k.toLocaleString("en-GB")} surveys started)`
    );
    // An average of the daily shares would not be this number.
    const drawn = first.filter((v): v is number => v !== null);
    expect(Math.round((10 * drawn.reduce((a, v) => a + v, 0)) / drawn.length) / 10).not.toBe(
      Math.round((1000 * n) / k) / 10
    );
    expect(payload.footnote).toContain("a gap is a day with fewer than 20 surveys started");
    expect(text).toMatch(/\d+ \w{3} – \(10\/10\)/);
  });

  it("puts two shares on one axis, the second in its own ink, named in the reader's words", async () => {
    dayOf = () => ({ rollup: { unique_visitors: 500, survey_starts: 100, submissions: 40 } });
    const { payload, text } = await draw({ metrics: ["start_rate", "finish_rate"] });
    expect(payload.first).toHaveLength(30);
    expect((payload.first as number[]).every((v) => v === 20)).toBe(true);
    expect((payload.last as number[]).every((v) => v === 40)).toBe(true);
    expect(payload.title).toBe("Visitors who start and starters who finish");
    expect(payload.legendFirst).toBe("Visitors who start");
    expect(payload.legendLast).toBe("Starters who finish");
    expect(payload.colorFirst).toBe("#334155");
    expect(payload.colorLast).toBe("#9333ea");
    expect(payload.headline).toBe("Over the 30 days: 20% · 40%");
    expect(payload.footnote).toBe("daily, UTC");
    expect(text).toContain("Visitors who start: 20% (3,000 of 15,000 visitors).");
    expect(text).toContain("Starters who finish: 40% (1,200 of 3,000 surveys started).");
  });

  it("refuses a count beside a share, because they cannot share an axis", async () => {
    expect(await refusal({ metrics: ["visitors", "finish_rate"] })).toMatch(
      /cannot share one axis/
    );
    expect(await refusal({ metrics: ["revenue", "reports_paid"] })).toMatch(/different kinds/);
  });

  it("charts revenue from the rollup, and ad spend only on days the ad data covers", async () => {
    dayOf = (day) => ({ rollup: { revenue: day === "2026-09-24" ? "19.90" : 0 } });
    mockAd.mockResolvedValue({
      byDay: new Map([
        ["2026-09-21", 4.5],
        ["2026-09-22", 6],
      ]),
      from: "2026-09-20",
      to: "2026-09-24",
    });
    const both = await draw({ metrics: ["revenue", "ad_spend"], days: 7 });
    expect(both.payload.unit).toBe("");
    expect(both.payload.first).toEqual([0, 0, 0, 0, 0, 19.9, 0]);
    // 19 Sep is before the window and 25 Sep after it: unknown, so gaps. 20, 23 and 24 are
    // covered with nothing spent: zero. A zero outside the window is how a loss became a profit.
    expect(both.payload.last).toEqual([null, 0, 4.5, 6, 0, 0, null]);
    expect(both.text).toContain("Revenue: EUR 19.90.");
    expect(both.text).toContain("Google Ads spend: EUR 10.50 on the 5 days with a record.");
    expect(both.text).toContain("19 Sep –");
    expect(both.text).not.toContain("GA4 misses");
    expect(both.payload.title).toBe("Revenue and Google Ads spend");
    expect(both.payload.footnote).toBe(
      "daily, UTC · a gap is a day with no record · amounts in EUR"
    );
  });

  it("groups thousands in an amount, as the reader would write it", async () => {
    dayOf = () => ({ rollup: { revenue: "250" } });
    const { payload, text } = await draw({ metrics: ["revenue"], days: 7 });
    expect(payload.headline).toBe("Over the 7 days: EUR 1,750.00");
    expect(text).toContain("- Revenue: 19 Sep 250.00 · 20 Sep 250.00");
  });

  it("leaves ad spend blank, and says why, when it cannot be read", async () => {
    mockAd.mockRejectedValue(new Error("down"));
    const { payload, text } = await draw({ metrics: ["ad_spend"], days: 7 });
    expect(payload.first).toEqual([null, null, null, null, null, null, null]);
    expect(text).toContain("Google Ads spend could not be read just now");
  });

  it("does not read ad spend for a chart that does not show it", async () => {
    await draw({ metrics: ["revenue"], days: 7 });
    expect(mockAd).not.toHaveBeenCalled();
  });

  it("says so when nothing was recorded, rather than drawing a flat zero", async () => {
    const { payload, text } = await draw({ metrics: ["sessions"], days: 7 });
    expect(payload.first).toEqual([null, null, null, null, null, null, null]);
    expect(payload.headline).toBe("Nothing recorded on these days");
    expect(text).toContain("Nothing recorded on these days.");
    // Sessions come from GA4, and the reader is told what GA4 cannot see.
    expect(text).toContain("GA4 misses visitors who decline cookies");
    expect(payload.footnote).toContain("GA4 misses visitors who decline cookies");
  });

  it("averages a count over the days that have a record, not over the gaps", async () => {
    dayOf = (day) => (day >= "2026-09-22" ? { ga4: { sessions: 100 } } : {});
    const { payload } = await draw({ metrics: ["sessions"], days: 7 });
    expect(payload.first).toEqual([null, null, null, 100, 100, 100, 100]);
    expect(payload.headline).toBe("Over the 7 days: 400 on the 4 days with a record, 100 a day");
  });

  it("warns that today's numbers are partial when the chart runs to today", async () => {
    const { text } = await draw({ metrics: ["visitors"], until: "2026-09-26" });
    expect(text).toContain("Today is still going, so its numbers are partial.");
    const { text: past } = await draw({ metrics: ["visitors"] });
    expect(past).not.toContain("partial");
  });
});

describe("show_chart: what it refuses", () => {
  it("names the metrics it knows when given none, an unknown one, or three", async () => {
    expect(await refusal({ metrics: [] })).toContain("visitors, sessions");
    expect(await refusal({ metrics: ["cvr"] })).toMatch(
      /No metric called "cvr". It is one of: visitors/
    );
    expect(await refusal({ metrics: ["visitors", "sessions", "revenue"] })).toMatch(/one or two/);
  });

  it("accepts one metric given as a bare string, and the same metric twice as one", async () => {
    const { payload } = await draw({ metrics: "visitors" });
    expect(payload.title).toBe("Visitors (our own count)");
    const twice = await draw({ metrics: ["visitors", "visitors"] });
    expect("last" in twice.payload).toBe(false);
  });

  it("holds days to whole numbers from 7 to 180", async () => {
    for (const days of [6, 181, 7.5, "abc", true]) {
      expect(await refusal({ metrics: ["visitors"], days })).toMatch(/whole number from 7 to 180/);
    }
    expect((await draw({ metrics: ["visitors"], days: "14" })).payload.first).toHaveLength(14);
  });

  it("refuses a day that is not real, one that has not happened, and one that is not a string", async () => {
    expect(await refusal({ metrics: ["visitors"], until: "2026-02-30" })).toMatch(/real day/);
    expect(await refusal({ metrics: ["visitors"], until: "2026-09-27" })).toMatch(
      /not happened yet/
    );
    expect(await refusal({ metrics: ["visitors"], until: 20260925 })).toMatch(/must be a day/);
  });

  it("will not draw a link to nowhere when the site URL is unset", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(await refusal({ metrics: ["visitors"] })).toMatch(/NEXT_PUBLIC_SITE_URL/);
    expect(mockLoad).not.toHaveBeenCalled();
  });
});

describe("show_chart: the catalogue", () => {
  it("can chart every metric explain_change reads, and fits every name in the legend", () => {
    const ids = CHART_METRICS.map((m) => m.id);
    for (const m of METRICS) expect(ids).toContain(m.id);
    // The renderer clips a legend at 34 characters; a clipped name is a mislabelled line.
    for (const m of CHART_METRICS) expect(m.short.length, m.id).toBeLessThanOrEqual(34);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("show_chart: fetching the picture", () => {
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  it("returns the PNG as base64", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "image/png" }),
      arrayBuffer: async () => png.buffer,
    });
    expect(await chartPng("https://x/y")).toBe(Buffer.from(png).toString("base64"));
    expect(mockFetch).toHaveBeenCalledWith("https://x/y", { timeoutMs: 8_000 });
  });

  it("returns null for a failed render, a page that is not a PNG, or no answer at all", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      headers: new Headers({ "content-type": "image/png" }),
    });
    expect(await chartPng("https://x/y")).toBeNull();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ "content-type": "text/html" }),
      arrayBuffer: async () => png.buffer,
    });
    expect(await chartPng("https://x/y")).toBeNull();
    mockFetch.mockRejectedValueOnce(new Error("aborted"));
    expect(await chartPng("https://x/y")).toBeNull();
  });
});
