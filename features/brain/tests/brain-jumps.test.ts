import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...a: unknown[]) => mockSupabaseFetch(...(a as [])),
}));
const mockRollup = vi.fn();
vi.mock("@features/brain/server/ingest/analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@features/brain/server/ingest/analytics")>()),
  brainDailyRollup: (...a: unknown[]) => mockRollup(...(a as [])),
}));
const mockFetchShipped = vi.fn();
vi.mock("@features/brain/server/shipped", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@features/brain/server/shipped")>()),
  fetchShipped: (...a: unknown[]) => mockFetchShipped(...(a as [])),
}));

import {
  explainDay,
  explainMetric,
  isJump,
  jumpsOn,
  loadSeries,
  METRICS,
  noticeJumps,
  parseGa4Day,
  readMetric,
  renderDay,
  type Around,
  type DaySeries,
  type Ga4Day,
} from "@features/brain/server/jumps";

const metric = (id: string) => METRICS.find((m) => m.id === id)!;
const dayN = (i: number) =>
  new Date(Date.UTC(2026, 7, 1) + i * 86_400_000).toISOString().slice(0, 10);

interface Day {
  visitors?: number;
  starts?: number;
  submissions?: number;
  opens?: number;
  paid?: number;
  sources?: Record<string, number>;
  ga4?: Partial<Ga4Day>;
}

/** 30 days, the last one the day under test. `f(i)` shapes day i. */
function build(f: (i: number) => Day, n = 30): DaySeries[] {
  return Array.from({ length: n }, (_, i) => {
    const d = f(i);
    const visitors = d.visitors ?? 200;
    return {
      day: dayN(i),
      rollup: {
        day: dayN(i),
        unique_visitors: visitors,
        survey_starts: d.starts ?? 28,
        intro_completed: 0,
        submissions: d.submissions ?? 10,
        reports_created: 0,
        reports_paid: d.paid ?? 0,
        revenue: 0,
        report_opens: d.opens ?? 12,
        invites_sent: 0,
        top_sources: d.sources ?? { direct: visitors - 40, google: 40 },
      },
      ga4: {
        day: dayN(i),
        sessions: 150,
        users: 150,
        newUsers: 140,
        engaged: 36,
        adCost: 40,
        channels: { Direct: 100, "Paid Search": 50 },
        campaigns: { "Performance Max": 40 },
        ...d.ga4,
      },
    };
  });
}
const LAST = dayN(29);
const NONE: Around = { shipped: [], decisions: [] };

describe("parseGa4Day", () => {
  it("reads the day record the Google ingester writes, campaign names with symbols included", () => {
    const body = [
      "Period: Thursday 24 September 2026 (2026-09-24) — TODAY SO FAR, still accruing",
      "Sessions: 558 · Users: 553 · New users: 546",
      "Page views: 518 · Engaged sessions: 24",
      "Channels: Direct 415, Unassigned 229, Cross-network 34, Paid Search 9, Organic Search 3",
      "Google Ads spend: EUR 37.29 · 59 ad clicks · 1007 ad impressions",
      "Ad campaigns: Price + Time Test EUR 19.35, Performance Max EUR 17.94",
    ].join("\n");
    expect(
      parseGa4Day("2026-09-24", body, { sessions: 558, users: 553, ad_cost: 37.291459 })
    ).toEqual({
      day: "2026-09-24",
      sessions: 558,
      users: 553,
      newUsers: 546,
      engaged: 24,
      adCost: 37.291459,
      channels: {
        Direct: 415,
        Unassigned: 229,
        "Cross-network": 34,
        "Paid Search": 9,
        "Organic Search": 3,
      },
      campaigns: { "Price + Time Test": 19.35, "Performance Max": 17.94 },
    });
  });

  it("leaves spend unknown, not zero, on a day with no ad lines", () => {
    const g = parseGa4Day("2026-05-01", "Sessions: 3 · Users: 3 · New users: 3", { sessions: 3 });
    expect(g.adCost).toBeNull();
    expect(g.campaigns).toEqual({});
  });
});

describe("readMetric and isJump", () => {
  it("flags a day far outside the usual range and leaves an ordinary one alone", () => {
    const wobble = (i: number) => 190 + (i % 5) * 5;
    const spike = build((i) => ({ visitors: i === 29 ? 600 : wobble(i) }));
    const r = readMetric(metric("visitors"), spike, LAST)!;
    expect(r.usual).toBe(200);
    expect(isJump(r)).toBe(true);
    const calm = build((i) => ({ visitors: i === 29 ? 230 : wobble(i) }));
    expect(isJump(readMetric(metric("visitors"), calm, LAST)!)).toBe(false);
  });

  it("does not treat one sale on a day that usually has none as a jump, but four is", () => {
    expect(
      isJump(
        readMetric(
          metric("reports_paid"),
          build((i) => ({ paid: i === 29 ? 1 : 0 })),
          LAST
        )!
      )
    ).toBe(false);
    expect(
      isJump(
        readMetric(
          metric("reports_paid"),
          build((i) => ({ paid: i === 29 ? 4 : 0 })),
          LAST
        )!
      )
    ).toBe(true);
  });

  it("needs a move big enough to matter, not just an unusual one", () => {
    // Flat at 200: 255 is 3.9 spreads out, but a 28% rise is under the 30% bar.
    const r = readMetric(
      metric("visitors"),
      build((i) => ({ visitors: i === 29 ? 255 : 200 })),
      LAST
    )!;
    expect(r.z).toBeGreaterThan(3.5);
    expect(isJump(r)).toBe(false);
    // Four surveys a day: eleven is 3.5 spreads out, but seven more is under the floor of 8.
    const small = readMetric(
      metric("submissions"),
      build((i) => ({ submissions: i === 29 ? 11 : 4 })),
      LAST
    )!;
    expect(small.z).toBeGreaterThanOrEqual(3.5);
    expect(isJump(small)).toBe(false);
  });

  /**
   * The 2026-09-24 case: a month of spikes widened one shared spread until a bot day read as
   * ordinary. A move up is measured against the quiet days, so the next spike still shows.
   */
  it("measures a move up against the quiet days, so a spiky month does not hide the next spike", () => {
    // Shaped like September: traffic climbing from 250 to 400, with a spike every few days.
    const month = [
      250, 260, 240, 300, 280, 900, 270, 265, 610, 255, 300, 720, 290, 310, 915, 320, 300, 914, 330,
      310, 340, 600, 350, 360, 599, 370, 380, 400,
    ];
    // One shared spread puts 600 at z 3.4, inside the range; the quiet side puts it at 4.6.
    const s = build((i) => ({ visitors: i === 29 ? 600 : (month[i - 1] ?? 250) }));
    const r = readMetric(metric("visitors"), s, LAST)!;
    expect(isJump(r)).toBe(true);
    expect(r.low).toBeLessThan(r.usual);
  });

  it("keeps a noisy metric's big-looking move inside its range", () => {
    // Swinging 100/300 every day: 300 today is +50%, and entirely ordinary for it.
    const s = build((i) => ({ visitors: i === 29 ? 300 : i % 2 ? 100 : 300 }));
    const r = readMetric(metric("visitors"), s, LAST)!;
    expect(r.value - r.usual).toBeGreaterThanOrEqual(60);
    expect(isJump(r)).toBe(false);
  });

  it("does not let a dead-flat count turn a small rise into a jump", () => {
    // Twenty surveys every day: thirty is a real share and over the floor, but within the
    // day-to-day noise of twenty.
    const s = build((i) => ({ submissions: i === 29 ? 30 : 20 }));
    expect(isJump(readMetric(metric("submissions"), s, LAST)!)).toBe(false);
  });

  it("does not let a dead-flat rate turn a small wobble into a jump", () => {
    // 14% every day; 20% on 200 visitors is within the noise of 200 visitors.
    const s = build((i) => ({ starts: i === 29 ? 40 : 28 }));
    expect(isJump(readMetric(metric("start_rate"), s, LAST)!)).toBe(false);
  });

  it("needs a rate to move by a real share, however many visitors there were", () => {
    // 5,000 visitors a day makes 14% to 16% very unusual, but a seventh is not worth a word.
    const s = build((i) => ({ visitors: 5000, starts: i === 29 ? 800 : 700 }));
    const r = readMetric(metric("start_rate"), s, LAST)!;
    expect(Math.abs(r.z)).toBeGreaterThan(3.5);
    expect(isJump(r)).toBe(false);
  });

  it("is not thrown off by one earlier spike, which widens nothing", () => {
    const s = build((i) => ({ visitors: i === 10 ? 3000 : i === 29 ? 600 : 200 }));
    const r = readMetric(metric("visitors"), s, LAST)!;
    expect(r.usual).toBe(200);
    expect(isJump(r)).toBe(true);
  });

  it("has no reading without two weeks of comparable days", () => {
    expect(
      readMetric(
        metric("visitors"),
        build(() => ({}), 10),
        dayN(9)
      )
    ).toBeNull();
  });

  it("reads a rate only when its denominator is big enough", () => {
    const low = build((i) => ({ visitors: i === 29 ? 30 : 200 }));
    expect(readMetric(metric("start_rate"), low, LAST)).toBeNull();
    const diluted = build((i) => ({ visitors: i === 29 ? 550 : 200, starts: i === 29 ? 29 : 28 }));
    const r = readMetric(metric("start_rate"), diluted, LAST)!;
    expect(r.value).toBeCloseTo(29 / 550);
    expect(r.usual).toBeCloseTo(0.14);
    expect(isJump(r)).toBe(true);
  });
});

describe("jumpsOn", () => {
  it("with onsetOnly, says a level that stays high once, on the day it started", () => {
    const s = build((i) => ({ visitors: i >= 28 ? 700 : 200 }));
    expect(jumpsOn(s, LAST).map((r) => r.metric.id)).toContain("visitors");
    expect(jumpsOn(s, LAST, true).map((r) => r.metric.id)).not.toContain("visitors");
    expect(jumpsOn(s, dayN(28), true).map((r) => r.metric.id)).toContain("visitors");
  });
});

describe("explainMetric", () => {
  it("names the source that carried most of a move", () => {
    const s = build((i) =>
      i === 29 ? { visitors: 700, sources: { direct: 660, google: 40 } } : {}
    );
    const lines = explainMetric(readMetric(metric("visitors"), s, LAST)!, s);
    expect(lines[0]).toBe('Most of it is traffic source "direct": +500 of the +500.');
    expect(lines[1]).toMatch(
      /^By traffic source: direct 660 \(usual 160\), google 40 \(usual 40\)/
    );
  });

  it("claims no single source when the move is spread", () => {
    const s = build((i) =>
      i === 29 ? { visitors: 700, sources: { direct: 410, google: 290 } } : {}
    );
    const lines = explainMetric(readMetric(metric("visitors"), s, LAST)!, s);
    expect(lines.some((l) => l.startsWith("Most of it"))).toBe(false);
  });

  it("says when a rate moved because its denominator did: the conversion that is really traffic", () => {
    const s = build((i) => ({ visitors: i === 29 ? 550 : 200, starts: i === 29 ? 29 : 28 }));
    const lines = explainMetric(readMetric(metric("start_rate"), s, LAST)!, s);
    expect(lines[0]).toBe(
      "The rate moved because visitors rose +175% while surveys started held steady. Check visitors before reading this as a loss."
    );
  });

  it("says when a rate moved because its numerator did", () => {
    const s = build((i) => ({ starts: i === 29 ? 90 : 28 }));
    const lines = explainMetric(readMetric(metric("start_rate"), s, LAST)!, s);
    expect(lines[0]).toBe(
      "The rate moved because surveys started moved +221% against visitors +0%."
    );
  });
});

describe("explainDay", () => {
  it("calls extra traffic that barely engages what it looks like", () => {
    const s = build((i) =>
      i === 29
        ? { visitors: 700, ga4: { sessions: 600, engaged: 30, users: 600, newUsers: 590 } }
        : {}
    );
    const { likely, evidence } = explainDay(s, LAST, NONE);
    expect(likely).toContain(
      "The extra traffic barely engages: 5% of GA4 sessions were engaged against a usual 24%, which fits bots or a misfiring tag better than real interest."
    );
    expect(evidence[0]).toBe("Engaged GA4 sessions 5% (usual 24%), new users 98% (usual 93%)");
  });

  it("says nothing is likely on a day where nothing moved", () => {
    expect(
      explainDay(
        build(() => ({})),
        LAST,
        NONE
      ).likely
    ).toEqual([]);
  });

  it("does not call extra traffic bots when it engages as usual", () => {
    const s = build((i) =>
      i === 29
        ? { visitors: 700, ga4: { sessions: 600, engaged: 150, users: 600, newUsers: 560 } }
        : {}
    );
    expect(explainDay(s, LAST, NONE).likely.join(" ")).not.toMatch(/barely engages/);
  });

  it("says nothing about one system when both saw the jump", () => {
    const s = build((i) =>
      i === 29 ? { visitors: 700, ga4: { sessions: 600, engaged: 150 } } : {}
    );
    expect(explainDay(s, LAST, NONE).likely.join(" ")).not.toMatch(/Only/);
  });

  it("does not blame engagement when traffic did not go up", () => {
    const s = build((i) => (i === 29 ? { ga4: { engaged: 5 } } : {}));
    expect(explainDay(s, LAST, NONE).likely.join(" ")).not.toMatch(/barely engages/);
  });

  it("says when only GA4 saw a jump, and when only our own count did", () => {
    const ga4Only = build((i) => (i === 29 ? { ga4: { sessions: 700 } } : {}));
    expect(
      explainDay(ga4Only, LAST, NONE).likely.some((l) => l.startsWith("Only GA4 saw it"))
    ).toBe(true);
    const oursOnly = build((i) => (i === 29 ? { visitors: 700 } : {}));
    expect(
      explainDay(oursOnly, LAST, NONE).likely.some((l) => l.startsWith("Only our own count saw it"))
    ).toBe(true);
  });

  it("notes a move in ad spend and a campaign that started or stopped", () => {
    const s = build((i) =>
      i === 29 ? { ga4: { adCost: 120, campaigns: { "Price + Time Test": 120 } } } : {}
    );
    const { likely, evidence } = explainDay(s, LAST, NONE);
    expect(likely).toContain("Ad spend moved: EUR 120 against a usual EUR 40.");
    expect(likely).toContain("A campaign started that day: Price + Time Test.");
    expect(evidence).toContain(
      "Google Ads spend EUR 120 (usual EUR 40); new campaign Price + Time Test; stopped Performance Max"
    );
  });

  it("lists what shipped with the changes that could touch the numbers first", () => {
    const shipped = [
      { date: "2026-08-30", pr: 1, text: "Docs tidied." },
      { date: "2026-08-30", pr: 2, text: "Ad clicks are now credited to Google Ads in analytics." },
      { date: "2026-08-29", pr: 3, text: "A." },
      { date: "2026-08-29", pr: 4, text: "B." },
      { date: "2026-08-28", pr: 5, text: "C." },
    ];
    const { evidence } = explainDay(
      build(() => ({})),
      LAST,
      { shipped, decisions: [] }
    );
    const lines = evidence.filter((l) => l.startsWith("Shipped") || l.startsWith("("));
    expect(lines[0]).toBe(
      "Shipped 2026-08-30 (#2): Ad clicks are now credited to Google Ads in analytics."
    );
    expect(lines).toHaveLength(5);
    expect(lines[4]).toBe("(1 more changes shipped those days: what_shipped lists them.)");
  });

  it("says GitHub could not be read rather than implying nothing shipped", () => {
    const { evidence } = explainDay(
      build(() => ({})),
      LAST,
      { shipped: null, decisions: [] }
    );
    expect(evidence).toContain("What shipped could not be read from GitHub.");
  });
});

describe("renderDay", () => {
  it("gives each metric its line, then the day's likely causes and evidence once", () => {
    const s = build((i) =>
      i === 29
        ? {
            visitors: 700,
            sources: { direct: 660, google: 40 },
            ga4: { sessions: 600, engaged: 30 },
          }
        : {}
    );
    const out = renderDay(LAST, jumpsOn(s, LAST), s, {
      shipped: [{ date: LAST, pr: 9, text: "Something." }],
      decisions: [{ date: LAST, title: "Decision: x", id: "decision/decision:1" }],
    });
    expect(out).toMatch(/^Visitors \(our own count\): 700 against a usual 200 \(normal range/);
    expect(out).toContain("Likely, from the whole day:\n- The extra traffic barely engages");
    expect(out).toContain("Around Sunday 30 August 2026:\n- Engaged GA4 sessions");
    expect(out.match(/Shipped 2026-08-30 \(#9\)/g)).toHaveLength(1);
    expect(out).toContain("Decided 2026-08-30: Decision: x (decision/decision:1)");
  });
});

describe("loadSeries", () => {
  beforeEach(() => {
    mockSupabaseFetch.mockReset();
    mockRollup.mockReset();
  });

  it("merges the rollup with the GA4 days, oldest first, and survives GA4 being unreadable", async () => {
    mockRollup.mockResolvedValue([
      { day: "2026-09-10", unique_visitors: 300, top_sources: {} },
      { day: "2026-09-09", unique_visitors: 250, top_sources: {} },
    ]);
    mockSupabaseFetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    const s = await loadSeries("2026-09-10");
    // The day before `until` needs its own 28 days, so the series starts 29 days back.
    expect(s[0]!.day).toBe("2026-08-12");
    expect(s.at(-1)!.day).toBe("2026-09-10");
    expect(s).toHaveLength(30);
    expect(s.at(-1)!.rollup?.unique_visitors).toBe(300);
    expect(s.at(-1)!.ga4).toBeUndefined();
  });
});

describe("noticeJumps", () => {
  beforeEach(() => {
    mockSupabaseFetch
      .mockReset()
      .mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    mockFetchShipped.mockReset().mockResolvedValue({ ok: true, commits: [], truncated: false });
    // Newest first, as the database function returns it; the day under test is 2026-09-23.
    mockRollup.mockReset().mockResolvedValue(
      Array.from({ length: 60 }, (_, i) => {
        const day = new Date(Date.UTC(2026, 8, 24) - i * 86_400_000).toISOString().slice(0, 10);
        return {
          day,
          unique_visitors: day === "2026-09-23" ? 900 : 200,
          survey_starts: 28,
          submissions: 10,
          report_opens: 12,
          reports_paid: 0,
          top_sources: { direct: day === "2026-09-23" ? 860 : 160, google: 40 },
        };
      })
    );
  });

  it("writes one notice for yesterday's unusual numbers, with a headline that carries no numbers", async () => {
    const record = vi.fn().mockResolvedValue(true);
    expect(await noticeJumps(new Date("2026-09-24T08:05:00Z"), record)).toBeGreaterThan(0);
    expect(record).toHaveBeenCalledTimes(1);
    const input = record.mock.calls[0]![0];
    expect(input.headline).toBe("Unusual numbers on Wednesday 23 September 2026");
    expect(input.kind).toBe("number-watch");
    expect(input.detail).toContain('Most of it is traffic source "direct"');
    expect(input.detail).toMatch(/None of this proves a cause/);
  });

  it("does not repeat a level that was already unusual the day before", async () => {
    mockRollup.mockResolvedValue(
      Array.from({ length: 60 }, (_, i) => {
        const day = new Date(Date.UTC(2026, 8, 24) - i * 86_400_000).toISOString().slice(0, 10);
        const high = day === "2026-09-23" || day === "2026-09-22";
        return {
          day,
          unique_visitors: high ? 900 : 200,
          survey_starts: 28,
          submissions: 10,
          report_opens: 12,
          reports_paid: 0,
          top_sources: {},
        };
      })
    );
    const record = vi.fn();
    expect(await noticeJumps(new Date("2026-09-24T08:05:00Z"), record)).toBe(0);
    expect(record).not.toHaveBeenCalled();
  });

  it("stays quiet outside the morning window, before GA4 has settled on yesterday", async () => {
    const record = vi.fn();
    expect(await noticeJumps(new Date("2026-09-24T05:00:00Z"), record)).toBe(0);
    expect(await noticeJumps(new Date("2026-09-24T11:00:00Z"), record)).toBe(0);
    expect(record).not.toHaveBeenCalled();
    expect(mockRollup).not.toHaveBeenCalled();
  });

  it("writes nothing on a day with nothing unusual", async () => {
    mockRollup.mockResolvedValue(
      Array.from({ length: 60 }, (_, i) => ({
        day: new Date(Date.UTC(2026, 8, 24) - i * 86_400_000).toISOString().slice(0, 10),
        unique_visitors: 200,
        survey_starts: 28,
        submissions: 10,
        report_opens: 12,
        reports_paid: 0,
        top_sources: {},
      }))
    );
    const record = vi.fn();
    expect(await noticeJumps(new Date("2026-09-24T08:05:00Z"), record)).toBe(0);
    expect(record).not.toHaveBeenCalled();
  });
});
