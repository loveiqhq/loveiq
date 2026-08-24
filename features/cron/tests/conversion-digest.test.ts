import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockNotifySlack = vi.fn();
const mockTryClaim = vi.fn();
const mockMarkDelivered = vi.fn();
const mockRecordCronRun = vi.fn();
const mockStartCronTimer = vi.fn();
const mockIsProdCronHost = vi.fn();
const mockFetchLandingArmFunnel = vi.fn();
const mockFetchArmCohorts = vi.fn();
const mockFetchLandingStartFunnel = vi.fn();

vi.mock("@shared/observability/logger", () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("@shared/observability/slack", async (importActual) => {
  const actual = await importActual<typeof import("@shared/observability/slack")>();
  return { ...actual, notifySlack: (...args: unknown[]) => mockNotifySlack(...args) };
});

vi.mock("@shared/observability/slack-alert-dedup", () => ({
  verifyCronAuth: (request: Request) =>
    (request.headers.get("authorization") ?? "") === "Bearer test-cron-secret",
  tryClaimSlackAlert: (...args: unknown[]) => mockTryClaim(...args),
  markSlackAlertDelivered: (...args: unknown[]) => mockMarkDelivered(...args),
  recordCronRun: (...args: unknown[]) => mockRecordCronRun(...args),
  startCronTimer: (...args: unknown[]) => {
    mockStartCronTimer(...args);
    return async () => {};
  },
}));

vi.mock("@shared/http/is-prod-cron-host", () => ({
  isProdCronHost: () => mockIsProdCronHost(),
}));

vi.mock("@features/admin/server/conversion-digest", async (importActual) => {
  const actual = await importActual<typeof import("@features/admin/server/conversion-digest")>();
  return {
    ...actual,
    fetchLandingArmFunnel: (...args: unknown[]) => mockFetchLandingArmFunnel(...args),
    fetchArmCohorts: (...args: unknown[]) => mockFetchArmCohorts(...args),
    fetchLandingStartFunnel: (...args: unknown[]) => mockFetchLandingStartFunnel(...args),
  };
});

import {
  GET,
  buildConversionDigest,
  buildArmSeries,
  buildStartSeries,
} from "@/app/api/cron/conversion-digest/route";
import {
  buildAlerts,
  buildArmVerdict,
  buildFunnel,
  biggestLeak,
  TINY_ARM,
} from "@features/admin/server/conversion-digest";
import type { SlackBlock } from "@shared/observability/slack";

/** Two arms, 30 days, shaped like the real RPC response. */
function makeFunnel(overrides: Partial<{ visitorArms: Record<string, number> }> = {}) {
  const days: string[] = [];
  for (let i = 30; i >= 1; i -= 1) {
    const d = new Date("2026-08-24T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const visitorArms = overrides.visitorArms ?? { white: 400, white_prev: 120 };
  return {
    visitors: days.flatMap((day) =>
      Object.entries(visitorArms).map(([arm, total]) => ({
        day,
        arm,
        n: Math.round(total / days.length),
      }))
    ),
    daily: days.flatMap((day, i) => [
      {
        day,
        arm: "white",
        completions: 10,
        reportOpens: 9,
        checkout: 2,
        paid: i % 3 === 0 ? 1 : 0,
        charges: i % 3 === 0 ? 1 : 0,
        freeUnlocks: 0,
        revenue: i % 3 === 0 ? 19.99 : 0,
      },
      {
        day,
        arm: "white_prev",
        completions: 8,
        reportOpens: 7,
        checkout: 1,
        paid: i % 5 === 0 ? 1 : 0,
        charges: i % 5 === 0 ? 1 : 0,
        freeUnlocks: 0,
        revenue: i % 5 === 0 ? 19.99 : 0,
      },
    ]),
    cohort: [
      { arm: "white", completions: 300, reportOpens: 290, checkout: 60, paid: 10, revenue: 199.9 },
      {
        arm: "white_prev",
        completions: 240,
        reportOpens: 230,
        checkout: 48,
        paid: 6,
        revenue: 119.94,
      },
    ],
  };
}

/** Landing -> survey-start, with the second arm launching part-way through. */
function makeStartFunnel(opts: { prevFromDay?: number } = {}) {
  const prevFrom = opts.prevFromDay ?? 27;
  const days: string[] = [];
  for (let i = 30; i >= 1; i -= 1) {
    const d = new Date("2026-08-24T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const daily = days.flatMap((day, i) => [
    { day, arm: "white", visits: 300 + (i % 5) * 20, starts: 22 + (i % 4) },
    ...(i >= prevFrom ? [{ day, arm: "white_prev", visits: 90, starts: 5 }] : []),
  ]);
  const sum = (arm: string, k: "visits" | "starts") =>
    daily.filter((r) => r.arm === arm).reduce((t, r) => t + r[k], 0);
  return {
    daily,
    totals: [
      { arm: "white", visits: sum("white", "visits"), starts: sum("white", "starts") },
      {
        arm: "white_prev",
        visits: sum("white_prev", "visits"),
        starts: sum("white_prev", "starts"),
      },
    ],
  };
}

function blockText(blocks: SlackBlock[]): string {
  return JSON.stringify(blocks);
}

describe("conversion-digest handler", () => {
  beforeAll(() => {
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.loveiq.org";
    process.env.STRATEGY_DIGEST_SIGNING_SECRET = "test-digest-signing-secret-value";
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Pin the clock INSIDE the scheduled window. Only the scheduled run consumes
    // the day, so without this these tests would pass or fail depending on what
    // time of day the suite happened to run.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T09:05:00.000Z"));
    mockIsProdCronHost.mockReturnValue(true);
    mockTryClaim.mockResolvedValue(true);
    mockFetchLandingArmFunnel.mockResolvedValue(makeFunnel());
    mockFetchLandingStartFunnel.mockResolvedValue(makeStartFunnel());
    mockFetchArmCohorts.mockResolvedValue([
      { axis: "landing", arm: "white", n: 300, conversions: 10 },
      { axis: "landing", arm: "white_prev", n: 240, conversions: 6 },
      { axis: "survey", arm: "white", n: 187, conversions: 5 },
      { axis: "survey", arm: "dark", n: 144, conversions: 5 },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function request(auth = "Bearer test-cron-secret") {
    return new Request("https://www.loveiq.org/api/cron/conversion-digest", {
      headers: { authorization: auth },
    });
  }

  it("401s without the cron secret", async () => {
    const res = await GET(request("Bearer wrong"));
    expect(res.status).toBe(401);
    expect(mockNotifySlack).not.toHaveBeenCalled();
  });

  it("skips on the staging host without claiming or posting", async () => {
    mockIsProdCronHost.mockReturnValue(false);
    const res = await GET(request());
    expect(await res.json()).toMatchObject({ skipped: true, reason: "non-prod-cron-host" });
    expect(mockTryClaim).not.toHaveBeenCalled();
    expect(mockNotifySlack).not.toHaveBeenCalled();
  });

  it("posts nothing when the day is already claimed", async () => {
    mockTryClaim.mockResolvedValue(false);
    const res = await GET(request());
    expect(await res.json()).toMatchObject({ sent: false, reason: "already-claimed" });
    expect(mockNotifySlack).not.toHaveBeenCalled();
    expect(mockMarkDelivered).not.toHaveBeenCalled();
  });

  it("posts exactly one ops message and marks it delivered", async () => {
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(mockNotifySlack).toHaveBeenCalledTimes(1);
    const arg = mockNotifySlack.mock.calls[0]![0] as {
      channel: string;
      kind: string;
      text: string;
      blocks: SlackBlock[];
    };
    expect(arg.channel).toBe("ops");
    expect(arg.kind).toBe("conversion_digest");
    // Fallback text is the only thing dead-lettered, so it must stand alone.
    expect(arg.text).toContain("Conversion");
    expect(arg.blocks.length).toBeGreaterThan(3);
    expect(mockMarkDelivered).toHaveBeenCalledWith("conversion_digest", "day", expect.any(String));
  });

  it("embeds a signed chart URL for the arm comparison", async () => {
    await GET(request());
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    const image = arg.blocks.find((b) => (b as { type?: string }).type === "image") as
      | { image_url?: string }
      | undefined;
    expect(image?.image_url).toMatch(
      /^https:\/\/www\.loveiq\.org\/api\/admin\/digest-image\/conversion-by-arm\?d=[\w-]+&s=[\w-]+$/
    );
  });

  it("outside the scheduled hour a bare run behaves as a preview", async () => {
    // Vercel's "Run" button hits the bare path and cannot pass ?preview=1, so a
    // manual look must not consume the day.
    vi.setSystemTime(new Date("2026-08-24T20:00:00.000Z"));
    const res = await GET(request());
    expect(await res.json()).toMatchObject({ sent: true, preview: true });
    expect(mockNotifySlack).toHaveBeenCalledTimes(1);
    expect(mockTryClaim).not.toHaveBeenCalled();
    expect(mockMarkDelivered).not.toHaveBeenCalled();
  });

  it("inside the scheduled hour a bare run DOES consume the day", async () => {
    const res = await GET(request());
    expect(await res.json()).toMatchObject({ sent: true, preview: false });
    expect(mockTryClaim).toHaveBeenCalledWith("conversion_digest", "day", expect.any(String));
    expect(mockMarkDelivered).toHaveBeenCalled();
  });

  it("absorbs cron drift into the next hour rather than double-claiming", async () => {
    vi.setSystemTime(new Date("2026-08-24T10:04:00.000Z"));
    const res = await GET(request());
    expect(await res.json()).toMatchObject({ preview: false });
    expect(mockTryClaim).toHaveBeenCalled();
  });

  it("preview mode re-sends without claiming or consuming the day", async () => {
    // So the message can be looked at and tweaked without waiting for tomorrow.
    const res = await GET(
      new Request("https://www.loveiq.org/api/cron/conversion-digest?preview=1", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    );
    expect(await res.json()).toMatchObject({ sent: true, preview: true });
    expect(mockNotifySlack).toHaveBeenCalledTimes(1);
    // Neither half of the idempotency handshake runs, so the real 09:00 send is
    // still pending and still fires exactly once.
    expect(mockTryClaim).not.toHaveBeenCalled();
    expect(mockMarkDelivered).not.toHaveBeenCalled();
  });

  it("preview still sends when the day is already claimed", async () => {
    mockTryClaim.mockResolvedValue(false);
    const res = await GET(
      new Request("https://www.loveiq.org/api/cron/conversion-digest?preview=1", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    );
    expect(await res.json()).toMatchObject({ sent: true });
    expect(mockNotifySlack).toHaveBeenCalledTimes(1);
  });

  it("preview uses a unique kind so the 60s dedup cannot swallow a repeat", async () => {
    const req = () =>
      new Request("https://www.loveiq.org/api/cron/conversion-digest?preview=1", {
        headers: { authorization: "Bearer test-cron-secret" },
      });
    await GET(req());
    await GET(req());
    const kinds = mockNotifySlack.mock.calls.map((c) => (c[0] as { kind: string }).kind);
    expect(kinds).toHaveLength(2);
    expect(kinds[0]).not.toBe(kinds[1]);
    expect(kinds.every((k) => k.startsWith("conversion_digest_preview_"))).toBe(true);
  });

  it("preview still refuses without the cron secret, and off the prod host", async () => {
    const bad = await GET(
      new Request("https://www.loveiq.org/api/cron/conversion-digest?preview=1", {
        headers: { authorization: "Bearer wrong" },
      })
    );
    expect(bad.status).toBe(401);

    mockIsProdCronHost.mockReturnValue(false);
    const staging = await GET(
      new Request("https://www.loveiq.org/api/cron/conversion-digest?preview=1", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    );
    expect(await staging.json()).toMatchObject({ skipped: true });
    expect(mockNotifySlack).not.toHaveBeenCalled();
  });

  it("ships the reached-survey chart flagged as NOT arm-comparable", async () => {
    // It was briefly titled "Visits → survey started, by homepage" and framed as
    // the primary metric. An audit found the two arms are not measuring the same
    // step: the current homepage's inline question writes the survey's
    // localStorage, and SurveyPage then skips straight to the engine — so
    // `survey_engine_mount` means "tapped the homepage question" for one arm and
    // "survived four wizard slides plus consent" for the other. Until the
    // instrumentation is symmetric the chart must not read as a verdict.
    await GET(request());
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    const images = arg.blocks.filter((b) => (b as { type?: string }).type === "image");
    expect(images).toHaveLength(2);
    const alt = JSON.stringify(images);
    expect(alt).toContain("Not comparable between arms yet");
    expect(alt).not.toContain("survey%20started%2C%20by%20homepage");
  });

  it("does not claim the reached-survey number is consent-free", async () => {
    // The denominator is server-side and consent-free; the numerator needs
    // __liq_vid, which is minted only under analytics consent. The definitions
    // line used to assert "no analytics-consent gap" over both.
    await GET(request());
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    const flat = blockText(arg.blocks);
    expect(flat).toContain("NOT arm-comparable yet");
    expect(flat).not.toMatch(/counted server-side, no analytics-consent gap/);
  });

  it("says so plainly when the landing→start migration is not applied yet", async () => {
    mockFetchLandingStartFunnel.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(200);
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    // Degrades to a stated absence, never to a silent omission or a zero.
    expect(blockText(arg.blocks)).toContain("migration has not been applied");
    // The secondary chart still ships.
    expect(arg.blocks.filter((b) => (b as { type?: string }).type === "image")).toHaveLength(1);
  });

  it("records the run and 500s when a source throws", async () => {
    mockFetchArmCohorts.mockRejectedValue(new Error("boom"));
    const res = await GET(request());
    expect(res.status).toBe(500);
    expect(mockRecordCronRun).toHaveBeenCalledWith(
      "conversion-digest",
      expect.any(Number),
      "error",
      expect.stringContaining("boom")
    );
  });

  it("says the read FAILED rather than reporting zeros, when both sources are null", async () => {
    // A Supabase hiccup used to ship "0 finished, 0 paid yesterday; 0 paid in 30
    // days" as the notification text — the line that lands in push previews and
    // the dead-letter table. Asserting zero where the truth is "we could not
    // read it" is the same falsehood as plotting a missing day as a zero.
    mockFetchLandingArmFunnel.mockResolvedValue(null);
    mockFetchArmCohorts.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(mockNotifySlack).toHaveBeenCalledTimes(1);
    const arg = mockNotifySlack.mock.calls[0]![0] as { text: string; blocks: SlackBlock[] };
    expect(arg.text).toContain("data unavailable");
    expect(arg.text).not.toContain("0 finished");
    expect(blockText(arg.blocks)).toContain("measurement failure, not a result");
  });

  it("distinguishes an empty window from a failed read", async () => {
    mockFetchArmCohorts.mockResolvedValue([]);
    const res = await GET(request());
    expect(res.status).toBe(200);
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    expect(blockText(arg.blocks)).toContain("No experiment data in this window");
    expect(blockText(arg.blocks)).not.toContain("measurement failure");
  });

  it("keeps the definitions at the top, where trimming cannot reach them", async () => {
    await GET(request());
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    // fitBlocks keeps from the front, so as the LAST block this was the first
    // thing dropped — leaving every number and no statement of what it meant.
    const idx = arg.blocks.findIndex((b) => JSON.stringify(b).includes("visitor-days"));
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(3);
  });
});

describe("conversion-digest verdicts", () => {
  it("calls a real winner and quotes the confidence interval", () => {
    // 60/500 vs 20/500 — a wide, unambiguous gap.
    const verdict = buildArmVerdict("survey", [
      { arm: "white", n: 500, conversions: 60 },
      { arm: "dark", n: 500, conversions: 20 },
    ]);
    expect(verdict.state).toBe("winner");
    expect(verdict.sentence).toContain("genuinely ahead");
    expect(verdict.sentence).toContain("95% CI");
    // Plain-English arm names only — never a raw stored value.
    expect(verdict.sentence).toContain("White survey");
    expect(verdict.sentence).not.toContain("white_prev");
  });

  it("refuses to call the real 308-vs-13 landing split, however tempting the rates", () => {
    // The live shape as measured in production: one arm is 24x the other, and the
    // big arm alone satisfies twoProportionSignal's combined n>=50 rule.
    const verdict = buildArmVerdict("landing", [
      { arm: "white", n: 308, conversions: 10 },
      { arm: "white_prev", n: 13, conversions: 0 },
    ]);
    expect(verdict.state).toBe("too-early");
    expect(verdict.sentence).toContain("too early");
    expect(verdict.sentence).toContain("13");
    expect(verdict.sentence).toContain(String(TINY_ARM));
    // The thing that must never appear: a declared winner.
    expect(verdict.sentence).not.toContain("ahead");
  });

  it("says insufficient data below a combined 50, and how many more are needed", () => {
    const verdict = buildArmVerdict("survey", [
      { arm: "white", n: 12, conversions: 1 },
      { arm: "dark", n: 10, conversions: 0 },
    ]);
    expect(verdict.state).toBe("insufficient-data");
    expect(verdict.sentence).toContain("not enough data");
    expect(verdict.sentence).toContain("28 more");
  });

  it("reports a close race as no winner rather than picking the leader", () => {
    const verdict = buildArmVerdict("pricing", [
      { arm: "A", n: 165, conversions: 3 },
      { arm: "B", n: 163, conversions: 7 },
    ]);
    expect(verdict.state).toBe("no-winner");
    expect(verdict.sentence).toContain("no clear winner");
  });

  it("drops a retired arm instead of comparing a live design against a dead one", () => {
    const verdict = buildArmVerdict("landing", [
      { arm: "white", n: 300, conversions: 10 },
      // `control` is the retired dark landing — nobody has been served it for months.
      { arm: "control", n: 800, conversions: 40 },
    ]);
    expect(verdict.arms.map((a) => a.label)).toEqual(["Current homepage"]);
    expect(verdict.state).toBe("single-arm");
    expect(verdict.sentence).toContain("nothing to compare");
  });

  it("never lets conversions exceed the denominator", () => {
    const verdict = buildArmVerdict("survey", [
      { arm: "white", n: 10, conversions: 999 },
      { arm: "dark", n: 10, conversions: 0 },
    ]);
    expect(verdict.arms[0]!.rate).toBeLessThanOrEqual(100);
  });
});

describe("conversion-digest funnel", () => {
  it("clamps every step to its predecessor so the funnel cannot go up", () => {
    // report_session counts opens on the day they happen, so a cohort can show
    // more opens than completions. A funnel that RISES reads as a product bug.
    const steps = buildFunnel(
      [{ arm: "white", completions: 100, reportOpens: 140, checkout: 20, paid: 5, revenue: 0 }],
      1000
    );
    const counts = steps.map((s) => s.count);
    expect(counts).toEqual([1000, 100, 100, 20, 5]);
    for (let i = 1; i < counts.length; i += 1) {
      expect(counts[i]!).toBeLessThanOrEqual(counts[i - 1]!);
    }
    expect(steps.every((s) => s.dropFromPrev >= 0)).toBe(true);
  });

  it("finds the biggest proportional leak", () => {
    const steps = buildFunnel(
      [{ arm: "white", completions: 100, reportOpens: 95, checkout: 10, paid: 5, revenue: 0 }],
      1000
    );
    const leak = biggestLeak(steps);
    // 1000 -> 100 is a 90% loss, the worst step.
    expect(leak).toMatchObject({ from: "Visits to the site", to: "Finished the survey", pct: 90 });
  });

  it("returns no leak for a flat funnel", () => {
    const steps = buildFunnel(
      [{ arm: "white", completions: 10, reportOpens: 10, checkout: 10, paid: 10, revenue: 0 }],
      10
    );
    expect(biggestLeak(steps)).toBeNull();
  });
});

describe("conversion-digest alerts", () => {
  const base = {
    verdicts: [],
    visitorArms: [],
    yesterday: { visitors: 100, completions: 10, paid: 1 },
    baseline: { visitors: 100, completions: 10, paid: 1 },
    now: new Date("2026-08-24T09:00:00Z"),
  };

  it("says nothing happened rather than listing green ticks", () => {
    const alerts = buildAlerts(base);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.message).toContain("Nothing crossed a threshold");
  });

  it("flags the ambiguous visitor bucket without claiming it was excluded", () => {
    const alerts = buildAlerts({ ...base, visitorArms: [{ arm: "control", n: 269 }] });
    const message = alerts.map((a) => a.message).join(" ");
    expect(message).toContain("269");
    expect(message).toContain("retired homepage label");
    // It used to say these visits were "left out of the comparison above" — they
    // are in fact COUNTED in the visits totals; only the per-arm comparison
    // ignores them, and that is built from finished surveys, not visit rows.
    expect(message).toContain("ARE counted");
    expect(message).not.toContain("left out of the comparison");
    // A standing caveat must not sort above genuinely actionable alerts.
    expect(alerts.find((a) => a.message.includes("269"))?.severity).toBe("info");
  });

  it("warns that the homepage arms are not a fair split", () => {
    const alerts = buildAlerts({
      ...base,
      verdicts: [
        buildArmVerdict("landing", [
          { arm: "white", n: 300, conversions: 10 },
          { arm: "white_prev", n: 240, conversions: 6 },
        ]),
      ],
    });
    expect(alerts.some((a) => a.message.includes("not a fair split"))).toBe(true);
  });

  it("warns on a traffic collapse but only off a meaningful baseline", () => {
    const collapsed = buildAlerts({
      ...base,
      yesterday: { visitors: 10, completions: 1, paid: 0 },
      baseline: { visitors: 100, completions: 10, paid: 1 },
    });
    expect(collapsed.some((a) => a.message.includes("below the usual"))).toBe(true);

    // Same 90% fall, tiny baseline — a percentage off 4 visits means nothing.
    const tiny = buildAlerts({
      ...base,
      yesterday: { visitors: 0, completions: 0, paid: 0 },
      baseline: { visitors: 4, completions: 1, paid: 0 },
    });
    expect(tiny.some((a) => a.message.includes("below the usual"))).toBe(false);
  });

  it("admits the pricing comparison still pools both price levels", () => {
    // It used to claim the comparison "restarts from that date". Nothing in the
    // code splits the cohort at the cutover — the value never reaches the RPC —
    // so the sentence promised a filter that does not exist. On the day of the
    // change it was maximally wrong: the window closes at 00:00 UTC and the
    // change landed at 02:46, so every day shown was pre-change.
    const alerts = buildAlerts({ ...base, pricingCutoverIso: "2026-08-24T02:46:49Z" });
    const msg = alerts.map((a) => a.message).join(" ");
    expect(msg).toContain("POOLS both price levels");
    expect(msg).not.toContain("restarts");
    expect(msg).not.toContain("are not pooled in");
  });

  it("stops mentioning the price change once it is old news", () => {
    const alerts = buildAlerts({ ...base, pricingCutoverIso: "2026-07-01T00:00:00Z" });
    expect(alerts.some((a) => a.message.includes("POOLS"))).toBe(false);
  });

  it("escalates a regression to a warning", () => {
    const alerts = buildAlerts({
      ...base,
      verdicts: [
        {
          axis: "survey",
          axisTitle: "Survey design",
          state: "regression",
          sentence: "Survey design: Dark survey is genuinely behind — 1% vs 9%.",
          arms: [],
        },
      ],
    });
    expect(alerts.some((a) => a.severity === "warn" && a.message.includes("behind"))).toBe(true);
  });
});

describe("conversion-digest chart series", () => {
  it("smooths daily rates over 7 days so one sale cannot dominate the y-scale", () => {
    const funnel = makeFunnel();
    const series = buildArmSeries(funnel, ["white", "white_prev"]);
    expect(series.labels).toHaveLength(30);
    expect(series.first).toHaveLength(30);
    expect(series.last).toHaveLength(30);
    // Every point is a real percentage.
    for (const v of [...series.first, ...series.last]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    // A trailing window cannot produce the 100% spikes a single-day rate would:
    // 1 paid / 10 completions on its own day would be 10%, but across 7 days of
    // 70 completions it is ~3%.
    expect(Math.max(...series.first)).toBeLessThan(20);
  });

  it("returns null, not zero, for days an arm had no traffic", () => {
    // This test previously asserted zeros — encoding the bug. 0% and "not running"
    // are different facts: the second homepage arm launched mid-window, and
    // filling its earlier days with 0 drew a flat line back to the start of the
    // window and claimed weeks of zero conversion for an arm that did not exist.
    const series = buildArmSeries(makeFunnel(), ["white", "does_not_exist"]);
    expect(series.last.every((v) => v === null)).toBe(true);
    expect(series.last.some((v) => v === 0)).toBe(false);
  });

  it("keeps a real zero distinct from a gap", () => {
    // An arm WITH finishers and no sales is a genuine 0% and must still plot.
    const funnel = makeFunnel();
    funnel.daily = funnel.daily.map((r) =>
      r.arm === "white_prev" ? { ...r, paid: 0, charges: 0, revenue: 0 } : r
    );
    const series = buildArmSeries(funnel, ["white", "white_prev"]);
    expect(series.last.some((v) => v === 0)).toBe(true);
    expect(series.last.every((v) => v === null)).toBe(false);
  });

  it("gaps the start series for days an arm had no visits", () => {
    // The second arm launched part-way through the window. Its earlier days must
    // be absent, not a plotted 0% — that is the falsehood the paid chart carried.
    const series = buildStartSeries(makeStartFunnel({ prevFromDay: 27 }), ["white", "white_prev"]);
    expect(series.first.every((v) => v != null)).toBe(true);
    expect(series.last.slice(0, 20).every((v) => v === null)).toBe(true);
    expect(series.last.some((v) => v != null)).toBe(true);
    expect(series.last.some((v) => v === 0)).toBe(false);
  });

  it("computes the start rate off visits, not off finishers", () => {
    const series = buildStartSeries(
      {
        daily: [
          { day: "2026-08-20", arm: "white", visits: 100, starts: 10 },
          { day: "2026-08-21", arm: "white", visits: 100, starts: 20 },
        ],
        totals: [{ arm: "white", visits: 200, starts: 30 }],
      },
      ["white", "white_prev"]
    );
    // Trailing window covers both days: 30/200 = 15%.
    expect(series.first[1]).toBe(15);
  });

  it("keeps the signed chart URL under Slack's image_url cap at a full 30 days", async () => {
    // The whole payload rides in the URL because Slack's image proxy is anonymous,
    // and Slack rejects an image_url over ~3000 chars. 30 day-labels plus two
    // 30-point series is the largest this chart ever gets, so measure it rather
    // than assume — a silently dropped image is the failure mode.
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.loveiq.org";
    process.env.STRATEGY_DIGEST_SIGNING_SECRET = "test-digest-signing-secret-value";
    mockFetchLandingArmFunnel.mockResolvedValue(makeFunnel());
    mockIsProdCronHost.mockReturnValue(true);
    mockTryClaim.mockResolvedValue(true);
    await GET(
      new Request("https://www.loveiq.org/api/cron/conversion-digest", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    );
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    const image = arg.blocks.find((b) => (b as { type?: string }).type === "image") as
      | { image_url?: string }
      | undefined;
    expect(image?.image_url).toBeDefined();
    expect(image!.image_url!.length).toBeLessThan(2800);
  });
});

afterEach(() => {
  vi.clearAllMocks();
});
