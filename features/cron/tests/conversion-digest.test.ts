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
const mockFetchAxisFunnelDaily = vi.fn();
const mockFetchFunnelCvrSparklines = vi.fn();

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

// Partial: the digest also imports computeRate and dayString from here, and the
// site-wide trend must be able to fail independently of them.
vi.mock("@features/admin/server/digest-metrics", async (importActual) => {
  const actual = await importActual<typeof import("@features/admin/server/digest-metrics")>();
  return {
    ...actual,
    fetchFunnelCvrSparklines: (...args: unknown[]) => mockFetchFunnelCvrSparklines(...args),
  };
});

vi.mock("@features/admin/server/conversion-digest", async (importActual) => {
  const actual = await importActual<typeof import("@features/admin/server/conversion-digest")>();
  return {
    ...actual,
    fetchLandingArmFunnel: (...args: unknown[]) => mockFetchLandingArmFunnel(...args),
    fetchArmCohorts: (...args: unknown[]) => mockFetchArmCohorts(...args),
    fetchLandingStartFunnel: (...args: unknown[]) => mockFetchLandingStartFunnel(...args),
    fetchAxisFunnelDaily: (...args: unknown[]) => mockFetchAxisFunnelDaily(...args),
  };
});

import {
  GET,
  buildConversionDigest,
  buildArmSeries,
  buildSiteStartSeries,
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
/**
 * 30 days x two arms on the SURVEY axis, which has no valid-from clip — so the
 * handler tests actually exercise the per-axis chart path rather than silently
 * skipping every axis.
 */
function makeAxisRows() {
  const rows = [];
  for (let d = 0; d < 30; d += 1) {
    const day = new Date(Date.UTC(2026, 6, 26) + d * 86_400_000).toISOString().slice(0, 10);
    rows.push({ axis: "survey", arm: "white", day, completions: 10, checkouts: 2, paid: 0 });
    rows.push({ axis: "survey", arm: "dark", day, completions: 8, checkouts: 1, paid: 0 });
  }
  return rows;
}

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
    mockFetchAxisFunnelDaily.mockResolvedValue(makeAxisRows());
    // Default: no site-wide CVR source, so the existing expectations about which
    // images a digest contains stay exactly as they were.
    mockFetchFunnelCvrSparklines.mockResolvedValue(null);
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

  it("ships the landing→survey chart as a trend, never as a verdict", async () => {
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
    // One: reached-survey. The survey-theme chart went with the concluded
    // experiment (2026-08-25), and the landing axis's own purchases chart was
    // removed earlier — the per-axis section is the only place landing is charted.
    expect(images).toHaveLength(1);
    const alt = JSON.stringify(images);
    // Wording trimmed with the promotion into *The tests*: the alt text now says
    // "A trend, not a verdict" and names the reason, in place of five clauses.
    expect(alt).toContain("A trend, not a verdict");
    expect(alt).toContain("different funnel steps");
    expect(alt).not.toContain("survey%20started%2C%20by%20homepage");
    // And the caption beside it carries the counts AND the caveat, because Slack
    // can fail to load an image and the caption is the accessible text.
    const flat = blockText(arg.blocks);
    expect(flat).toContain("*Landing page → survey*");
    expect(flat).toContain("Not a like-for-like comparison");
    expect(flat).toMatch(/\d+\/\d+ started/);
  });

  it("does not claim the reached-survey number is consent-free", async () => {
    // The denominator is server-side and consent-free; the numerator needs
    // __liq_vid, which is minted only under analytics consent. The definitions
    // line used to assert "no analytics-consent gap" over both.
    await GET(request());
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    const flat = blockText(arg.blocks);
    expect(flat).not.toMatch(/counted server-side, no analytics-consent gap/);
    // The caveat rides on the chart itself — headline, footnote and alt text —
    // so it cannot outlive the chart. The header must not carry it: the chart is
    // absent for whole days at a time and the sentence would point at nothing.
    const alt = JSON.stringify(arg.blocks.filter((b) => (b as { type?: string }).type === "image"));
    // Wording trimmed with the promotion into *The tests*: the alt text now says
    // "A trend, not a verdict" and names the reason, in place of five clauses.
    expect(alt).toContain("A trend, not a verdict");
    expect(alt).toContain("different funnel steps");
    const definitions = blockText(arg.blocks.slice(0, 2));
    expect(definitions).not.toContain("arm-comparable");
  });

  it("says so plainly when the landing→start source does not answer", async () => {
    mockFetchLandingStartFunnel.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(200);
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    // Degrades to a stated absence, never to a silent omission or a zero. It no
    // longer blames an unapplied migration: the migration IS applied, and null
    // here only ever means the RPC did not answer.
    expect(blockText(arg.blocks)).toContain("did not answer");
    // No images left at all once this source is the one that failed: the fixture's
    // only other chart was the survey theme's, which retired with the experiment.
    // The rest of the digest must still ship — that is what this asserts.
    expect(blockText(arg.blocks)).toContain("*The funnel");
    expect(arg.blocks.filter((b) => (b as { type?: string }).type === "image")).toHaveLength(0);
  });

  it("says nothing at all about the reached-survey chart when it has no data", async () => {
    // The RPC floors its window at the first day BOTH arms were instrumented, so
    // it correctly answers with empty arrays for days before that. There used to
    // be a line accounting for the absence, because the header advertised the
    // chart; the header does not any more, so the correct behaviour is silence —
    // no dangling reference anywhere in the message, in either direction.
    mockFetchLandingStartFunnel.mockResolvedValue({ daily: [], totals: [] });
    await GET(request());
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    const flat = blockText(arg.blocks);
    expect(flat).not.toContain("survey-started by landing page");
    expect(flat).not.toContain("arm-comparable");
    // The rest of the digest still ships — one missing source takes nothing else.
    expect(flat).toContain("*The tests*");
    expect(arg.blocks.filter((b) => (b as { type?: string }).type === "image")).toHaveLength(0);
  });

  it("gaps the site-wide trend's warm-up instead of plotting a partial window", () => {
    // Same rule as every other trailing series here. Without it the first six
    // points are 1- to 6-day windows under a footnote promising seven days.
    const days = Array.from({ length: 10 }, (_, i) => ({
      day: new Date(Date.UTC(2026, 7, 1) + i * 86_400_000).toISOString().slice(0, 10),
      visitors: 100,
      starts: i === 9 ? 20 : 10,
    }));
    const series = buildSiteStartSeries(days);
    expect(series.values.slice(0, 6).every((v) => v === null)).toBe(true);
    expect(series.values.slice(6).every((v) => v != null)).toBe(true);
    // Index 9 trails days 3-9: six days at 10/100 plus one at 20/100 = 80/700.
    expect(series.values[9]).toBe(11.4);
    expect(series.labels).toHaveLength(10);
  });

  it("sorts the site-wide trend by day rather than trusting the RPC's order", () => {
    const shuffled = [
      { day: "2026-08-08", visitors: 100, starts: 30 },
      { day: "2026-08-01", visitors: 100, starts: 10 },
      { day: "2026-08-05", visitors: 100, starts: 10 },
      { day: "2026-08-02", visitors: 100, starts: 10 },
      { day: "2026-08-03", visitors: 100, starts: 10 },
      { day: "2026-08-07", visitors: 100, starts: 10 },
      { day: "2026-08-04", visitors: 100, starts: 10 },
      { day: "2026-08-06", visitors: 100, starts: 10 },
    ];
    const series = buildSiteStartSeries(shuffled);
    expect(series.labels[0]).toBe("1 Aug");
    expect(series.labels[7]).toBe("8 Aug");
    // Trailing window over days 2-8: 6x10 + 30 = 90/700.
    expect(series.values[7]).toBe(12.9);
  });

  it("draws the site-wide landing→survey trend, and skips it with no source", async () => {
    // The picture the digest leads with. Its per-arm sibling cannot be a trend
    // yet, so this one carries "how is it looking".
    const cvrDays = Array.from({ length: 14 }, (_, i) => ({
      day: new Date(Date.UTC(2026, 7, 10) + i * 86_400_000).toISOString().slice(0, 10),
      visitors: 200,
      starts: 20 + i,
    }));
    mockFetchFunnelCvrSparklines.mockResolvedValue({ days: cvrDays });
    await GET(request());
    let arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    const flat = blockText(arg.blocks);
    expect(flat).toContain("*Landing → survey start*");
    expect(flat).toMatch(/of visitor-days reach the survey questions/);
    const img = arg.blocks.find((b) =>
      (b as { alt_text?: string }).alt_text?.startsWith("Site-wide visitor")
    ) as { image_url: string } | undefined;
    expect(img).toBeDefined();
    // The single-line longitudinal renderer, not the two-arm one.
    expect(img!.image_url).toContain("/digest-image/cvr-visitor-start");

    // And with no source at all it is simply absent — no empty plot, no zero.
    mockNotifySlack.mockClear();
    mockFetchFunnelCvrSparklines.mockResolvedValue(null);
    await GET(request());
    arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    expect(blockText(arg.blocks)).not.toContain("*Landing → survey start*");
    expect(
      arg.blocks.filter((b) => (b as { alt_text?: string }).alt_text?.startsWith("Site-wide"))
    ).toHaveLength(0);
  });

  it("says landing→survey has no data in ONE line, not four empty ones", async () => {
    // The RPC floors its window at the first day both sides carried an arm, so
    // before then it correctly answers with empty arrays. Four lines of "no
    // visits recorded yet" every morning is the filler that teaches people to
    // skim the whole message.
    mockFetchLandingStartFunnel.mockResolvedValue({ daily: [], totals: [] });
    await GET(request());
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    const block = arg.blocks.find((b) =>
      (b as { text?: { text?: string } }).text?.text?.startsWith("*Landing page → survey*")
    ) as { text: { text: string } } | undefined;
    expect(block).toBeDefined();
    expect(block!.text.text.split("\n")).toHaveLength(1);
    expect(block!.text.text).toContain("no per-arm data in this window yet");
    expect(block!.text.text).not.toContain("no visits recorded yet");
  });

  it("counts landing→survey per arm until a trend can be drawn, and dates it", async () => {
    // One day of data: too few for a 7-day trailing rate, but the numbers exist
    // and are what a reader came for. The date must be DERIVED — the window is
    // half-open and ends yesterday, so a day only enters the series in the
    // following run, and every hardcoded version of this has been a day out.
    mockFetchLandingStartFunnel.mockResolvedValue({
      daily: [
        { day: "2026-08-20", arm: "white", visits: 80, starts: 13 },
        { day: "2026-08-20", arm: "white_prev", visits: 64, starts: 10 },
      ],
      totals: [
        { arm: "white", visits: 80, starts: 13 },
        { arm: "white_prev", visits: 64, starts: 10 },
      ],
    });
    await GET(request());
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    const text = blockText(arg.blocks);
    expect(text).toContain("*Landing page → survey* — one day of per-arm data");
    // first day + 7, not +6: 20 Aug -> 27 Aug.
    expect(text).toContain("chart from 27 Aug");
    expect(text).toContain("80 visit-days → 13 started the survey");
    expect(text).toContain("64 visit-days → 10 started the survey");
    expect(text).toContain("Not a like-for-like comparison");
    // No image while it cannot honestly draw one.
    expect(arg.blocks.filter((b) => (b as { type?: string }).type === "image")).toHaveLength(0);
  });

  it("puts a too-young test's numbers in a full-size section, not a footnote", async () => {
    // The counts ARE the content when there is no chart, so they must not render
    // as a small italic context block, which is where the eye goes last.
    const rows = [];
    for (let d = 0; d < 3; d += 1) {
      const day = new Date(Date.UTC(2026, 7, 21) + d * 86_400_000).toISOString().slice(0, 10);
      rows.push({ axis: "landing", arm: "white", day, completions: 7, checkouts: 1, paid: 0 });
      rows.push({ axis: "landing", arm: "white_prev", day, completions: 6, checkouts: 2, paid: 0 });
    }
    mockFetchAxisFunnelDaily.mockResolvedValue(rows);
    await GET(request());
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    const section = arg.blocks.find(
      (b) =>
        (b as { type?: string }).type === "section" &&
        (b as { text?: { text?: string } }).text?.text?.startsWith("*Landing page design*")
    ) as { text: { text: string } } | undefined;
    expect(section).toBeDefined();
    const text = section!.text.text;
    expect(text).toContain("since 21 Aug");
    expect(text).toContain("21 finished → 3 checkout → 0 paid");
    expect(text).toContain("18 finished → 6 checkout → 0 paid");
    expect(text).toMatch(/chart (from|once)/);
    // And no image was emitted for it — the whole point of the counts path.
    const imgs = arg.blocks.filter((b) =>
      (b as { alt_text?: string }).alt_text?.startsWith("Landing page")
    );
    expect(imgs).toHaveLength(0);
  });

  it("keeps the whole message inside Slack's block and size limits with every chart", async () => {
    // Two images plus their captions. fitBlocks caps at 50 blocks / ~38k
    // serialized and drops from the TAIL, so an overflow would silently delete
    // the alerts at the bottom rather than fail — which is why this asserts the
    // TOTAL rather than the delta from before.
    await GET(request());
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    expect(arg.blocks.length).toBeLessThanOrEqual(50);
    expect(JSON.stringify(arg.blocks).length).toBeLessThan(38_000);
    // Every chart URL independently under Slack's image_url cap.
    for (const b of arg.blocks) {
      const url = (b as { image_url?: string }).image_url;
      if (url) expect(url.length).toBeLessThan(2800);
    }
  });

  it("explains an axis it cannot chart instead of silently omitting it", async () => {
    // Only one arm has data, so nothing can be compared. The digest must say so
    // rather than leave the reader wondering where the test went.
    mockFetchAxisFunnelDaily.mockResolvedValue(makeAxisRows().filter((r) => r.arm === "white"));
    await GET(request());
    const arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    const flat = blockText(arg.blocks);
    expect(flat).toContain("nothing to compare");
    expect(flat).toContain("*The tests*");
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

  it("speaks up for a FAILED read and stays quiet for an empty one", async () => {
    // "No experiment data in this window" was removed with the 30-day verdict
    // block it headed: an empty window is already evident from the per-test
    // section. A failed READ is different — silence there would read as "no
    // tests running" rather than "we could not measure them".
    mockFetchArmCohorts.mockResolvedValue([]);
    const res = await GET(request());
    expect(res.status).toBe(200);
    let arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    expect(blockText(arg.blocks)).not.toContain("measurement failure");
    expect(blockText(arg.blocks)).not.toContain("No experiment data");

    mockNotifySlack.mockClear();
    mockFetchArmCohorts.mockResolvedValue(null);
    await GET(request());
    arg = mockNotifySlack.mock.calls[0]![0] as { blocks: SlackBlock[] };
    expect(blockText(arg.blocks)).toContain("measurement failure");
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
    // 60/500 vs 20/500 — a wide, unambiguous gap. On the LANDING axis: the survey
    // axis used to host this fixture, and its `dark` arm is retired now, so
    // buildArmVerdict correctly filters it and the pair collapses to one arm.
    const verdict = buildArmVerdict("landing", [
      { arm: "white", n: 500, conversions: 60 },
      { arm: "white_prev", n: 500, conversions: 20 },
    ]);
    expect(verdict.state).toBe("winner");
    expect(verdict.sentence).toContain("genuinely ahead");
    expect(verdict.sentence).toContain("95% CI");
    // Plain-English arm names only — never a raw stored value.
    expect(verdict.sentence).toContain("Landing page A (current design)");
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
    const verdict = buildArmVerdict("landing", [
      { arm: "white", n: 12, conversions: 1 },
      { arm: "white_prev", n: 10, conversions: 0 },
    ]);
    expect(verdict.state).toBe("insufficient-data");
    expect(verdict.sentence).toContain("not enough data");
    expect(verdict.sentence).toContain("28 more");
  });

  it("blames the conversion count, not the survey count, when purchases are the blocker", () => {
    // The real pricing split, 30 days to 2026-08-25. 328 finished surveys is
    // plenty; TEN purchases between them is not. This used to say "no clear
    // winner", which claims we measured the two arms and found them equal — but
    // the z-test's normal approximation is not even valid at 3 successes, so
    // nothing was measured. It must say which number is missing.
    const verdict = buildArmVerdict("pricing", [
      { arm: "A", n: 165, conversions: 3 },
      { arm: "B", n: 163, conversions: 7 },
    ]);
    expect(verdict.state).toBe("insufficient-data");
    expect(verdict.sentence).toContain("not enough purchases");
    expect(verdict.sentence).toContain("10");
    expect(verdict.sentence).toContain("328");
    // The two wrong answers: a winner, or a measured dead heat.
    expect(verdict.sentence).not.toContain("no clear winner");
    expect(verdict.sentence).not.toContain("ahead");
    // And it must not blame the survey count, which is not short.
    expect(verdict.sentence).not.toContain("more needed");
  });

  it("reports a close race as no winner once both arms have enough conversions", () => {
    // Same shape, but with conversions above the validity floor on both sides —
    // so the comparison genuinely runs and genuinely finds no winner. Keeps the
    // no-winner branch covered now that thin data no longer reaches it.
    const verdict = buildArmVerdict("pricing", [
      { arm: "A", n: 165, conversions: 20 },
      { arm: "B", n: 163, conversions: 24 },
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
    expect(verdict.arms.map((a) => a.label)).toEqual(["Landing page A (current design)"]);
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

  it("emits no standing daily caveats, only things that happened", () => {
    // Two alerts were removed as noise: the retired-landing-label bucket (whose
    // subject, per-arm visit counts, the message no longer prints) and the
    // pricing-cutover warning (which pointed at a pooled 30-day line that no
    // longer exists). Both were true EVERY day, which is how a digest teaches
    // people to skim its alerts. This is the guard against them coming back.
    const alerts = buildAlerts({
      ...base,
      visitorArms: [{ arm: "control", n: 269 }],
      pricingCutoverIso: "2026-08-24T02:46:49Z",
    });
    const message = alerts.map((a) => a.message).join(" ");
    expect(message).not.toContain("retired landing page label");
    expect(message).not.toContain("POOLS both price levels");
    // The one standing caveat that survives changes a decision, and stays `info`
    // so it cannot sort above something actionable.
    const unfair = alerts.find((a) => a.message.includes("not a fair split"));
    if (unfair) expect(unfair.severity).toBe("info");
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
    const series = buildArmSeries(funnel.daily, ["white", "white_prev"], (r) => r.paid);
    expect(series.labels).toHaveLength(30);
    expect(series.first).toHaveLength(30);
    expect(series.last).toHaveLength(30);
    // The first six days have no full 7-day window behind them, so they are
    // gaps. Plotting them drew 1- to 6-day rates on a chart whose footnote
    // promises a trailing one: on the real survey data day one was 7 of 12
    // finishers = 58% against a true rate of 10-17%, which set the y-scale and
    // squashed every honest value into the bottom sixth of the plot.
    expect(series.first.slice(0, 6).every((v) => v === null)).toBe(true);
    expect(series.last.slice(0, 6).every((v) => v === null)).toBe(true);
    expect(series.first[6]).not.toBeNull();
    // Every plotted point is a real percentage.
    for (const v of [...series.first, ...series.last].slice(6)) {
      if (v === null) continue;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    // A trailing window cannot produce the 100% spikes a single-day rate would:
    // 1 paid / 10 completions on its own day would be 10%, but across 7 days of
    // 70 completions it is ~3%.
    expect(Math.max(...(series.first.filter((v) => v !== null) as number[]))).toBeLessThan(20);
  });

  it("returns null, not zero, for days an arm had no traffic", () => {
    // This test previously asserted zeros — encoding the bug. 0% and "not running"
    // are different facts: the second landing page arm launched mid-window, and
    // filling its earlier days with 0 drew a flat line back to the start of the
    // window and claimed weeks of zero conversion for an arm that did not exist.
    const series = buildArmSeries(makeFunnel().daily, ["white", "does_not_exist"], (r) => r.paid);
    expect(series.last.every((v) => v === null)).toBe(true);
    expect(series.last.some((v) => v === 0)).toBe(false);
  });

  it("keeps a real zero distinct from a gap", () => {
    // An arm WITH finishers and no sales is a genuine 0% and must still plot.
    const funnel = makeFunnel();
    funnel.daily = funnel.daily.map((r) =>
      r.arm === "white_prev" ? { ...r, paid: 0, charges: 0, revenue: 0 } : r
    );
    const series = buildArmSeries(funnel.daily, ["white", "white_prev"], (r) => r.paid);
    expect(series.last.some((v) => v === 0)).toBe(true);
    expect(series.last.every((v) => v === null)).toBe(false);
  });

  it("gaps the start series for days an arm had no visits", () => {
    // The second arm launched part-way through the window. Its earlier days must
    // be absent, not a plotted 0% — that is the falsehood the paid chart carried.
    const series = buildStartSeries(makeStartFunnel({ prevFromDay: 27 }), ["white", "white_prev"]);
    // The first six days are the WARM-UP gap, not missing traffic: a window with
    // fewer than seven days behind it is not the 7-day trailing rate the footnote
    // promises. Everything after that is present for the arm that ran all window.
    expect(series.first.slice(0, 6).every((v) => v === null)).toBe(true);
    expect(series.first.slice(6).every((v) => v != null)).toBe(true);
    expect(series.last.slice(0, 20).every((v) => v === null)).toBe(true);
    expect(series.last.some((v) => v != null)).toBe(true);
    expect(series.last.some((v) => v === 0)).toBe(false);
  });

  it("computes the start rate off visits, not off finishers", () => {
    // Seven days, because a point needs a full window inside it now. Days 1-6 are
    // 10 starts per 100 visits and day 7 is 20, so the first drawable point is
    // 80/700 = 11.4%.
    const daily = Array.from({ length: 7 }, (_, i) => ({
      day: `2026-08-2${i}`,
      arm: "white",
      visits: 100,
      starts: i === 6 ? 20 : 10,
    }));
    const series = buildStartSeries(
      { daily, totals: [{ arm: "white", visits: 700, starts: 80 }] },
      ["white", "white_prev"]
    );
    expect(series.first.slice(0, 6).every((v) => v === null)).toBe(true);
    expect(series.first[6]).toBe(11.4);
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
