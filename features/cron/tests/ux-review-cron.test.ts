import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockNotifySlack = vi.fn();
vi.mock("@shared/observability/slack", () => ({
  notifySlack: (...args: unknown[]) => mockNotifySlack(...args),
  escapeSlack: (s: string) => s,
}));

const mockTryClaim = vi.fn();
const mockMarkDelivered = vi.fn();
vi.mock("@shared/observability/slack-alert-dedup", () => ({
  tryClaimSlackAlert: (...args: unknown[]) => mockTryClaim(...args),
  markSlackAlertDelivered: (...args: unknown[]) => mockMarkDelivered(...args),
  startCronTimer: () => async () => undefined,
  verifyCronAuth: () => true,
  recordCronRun: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@shared/http/is-prod-cron-host", () => ({ isProdCronHost: () => true }));
vi.mock("@shared/flags/system-flags", () => ({ isFeatureEnabled: async () => true }));

const mockRecordNotice = vi.fn();
vi.mock("@features/brain/server/notice", () => ({
  recordNotice: (...args: unknown[]) => mockRecordNotice(...args),
}));

const mockFetchFindings = vi.fn();
const mockFetchDailyStats = vi.fn();
const mockContradiction = vi.fn();
const mockFetchSessionEvents = vi.fn();
/** Drift is read from PostHog's scanner config now, not inferred from findings. */
const mockFetchScannerDrift = vi.fn(async () => [] as Array<Record<string, unknown>>);

vi.mock("@features/ux-review/server/review", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@features/ux-review/server/review")>();
  return {
    ...actual,
    fetchFindings: (...a: unknown[]) => mockFetchFindings(...a),
    fetchDailyStats: (...a: unknown[]) => mockFetchDailyStats(...a),
    contradiction: (...a: unknown[]) => mockContradiction(...a),
    fetchSessionEvents: (...a: unknown[]) => mockFetchSessionEvents(...a),
    fetchScannerDrift: (...a: unknown[]) => mockFetchScannerDrift(...a),
  };
});

import { GET } from "@/app/api/cron/ux-review/route";

const req = () =>
  new Request("http://localhost/api/cron/ux-review", {
    headers: { Authorization: "Bearer test-secret" },
  });

const finding = (over: Record<string, unknown> = {}) => ({
  observationId: "obs-1",
  sessionId: "01a09e04-dfaa-7a3e-9622-0d7ca5285017",
  scannerId: "scanner-1",
  scannerName: "LoveIQ report UX",
  scannerVersion: 2,
  confidence: 0.9,
  reasoning: "something changed on screen",
  ...over,
});

describe("ux-review cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // After DIGEST_HOUR_UTC (07:00), so the digest path is eligible.
    vi.setSystemTime(new Date("2026-09-14T12:00:00Z"));
    mockTryClaim.mockResolvedValue(true);
    mockMarkDelivered.mockResolvedValue(undefined);
    mockFetchFindings.mockResolvedValue([]);
    mockFetchDailyStats.mockResolvedValue([{ scanner: "LoveIQ report UX", observed: 8, yes: 2 }]);
    mockContradiction.mockReturnValue(null);
    mockFetchSessionEvents.mockResolvedValue(new Set(["report_viewed"]));
    // clearAllMocks wipes call history but KEEPS implementations, so a drift
    // value set by one test would leak into every test after it.
    mockFetchScannerDrift.mockResolvedValue([]);
  });

  afterEach(() => vi.useRealTimers());

  /**
   * A function killed at maxDuration writes NO cron_run row, so an over-budget
   * run is invisible rather than merely slow. `fetchSessionEvents` is a HogQL
   * call with a 15s timeout and a retry, and PostHog sheds load with 503 under
   * exactly the conditions that make a run busy — so ONE finding can spend the
   * whole 30s ceiling while the count bound sees only "1 of 6 used".
   */
  it("defers the rest of the findings when the loop budget is spent", async () => {
    mockFetchFindings.mockResolvedValue([
      finding({ observationId: "a" }),
      finding({ observationId: "b" }),
      finding({ observationId: "c" }),
    ]);
    // Each session lookup burns 10s of the 18s loop budget.
    mockFetchSessionEvents.mockImplementation(async () => {
      vi.advanceTimersByTime(10_000);
      return new Set(["report_viewed"]);
    });

    const body = await (await GET(req())).json();

    expect(body.collected, "two findings fit inside the budget").toBe(2);
    expect(body.deferred, "the third was left for the next run").toBe(1);
    // Untouched, not claimed-and-dropped: the next run must take it straight
    // away rather than waiting out the ten-minute stale-claim window.
    // Only the OBSERVATION claims — the daily digest takes one of its own,
    // keyed by the day, and counting it here would make this assertion drift
    // with an unrelated feature.
    const claimed = mockTryClaim.mock.calls.filter((c) => c[1] === "observation").map((c) => c[2]);
    expect(claimed, "the deferred finding must be left unclaimed").toEqual(["a", "b"]);
  });

  it("does not defer when every finding is fast", async () => {
    mockFetchFindings.mockResolvedValue([
      finding({ observationId: "a" }),
      finding({ observationId: "b" }),
    ]);
    const body = await (await GET(req())).json();
    expect(body.deferred).toBe(0);
    expect(body.collected).toBe(2);
  });

  it("never posts an individual finding to Slack", async () => {
    // The whole reason the route changed: on 2026-09-14 the five findings it
    // posted were each wrong about the mechanism. Only the digest may post.
    mockFetchFindings.mockResolvedValue([finding()]);
    await GET(req());

    const kinds = mockNotifySlack.mock.calls.map((c) => (c[0] as { kind: string }).kind);
    expect(kinds).not.toContain("ux_review");
    expect(kinds).toContain("ux_review_digest");
  });

  it("finalises a finding's claim without writing the claim to the brain", async () => {
    // It used to call recordNotice here, and that was two bugs at once.
    // `noticeId()` hashes the headline and the day, and the headline is
    // `UX review: <scanner>` — four possible values — so every finding from one
    // scanner on one day overwrote the previous one. And `brain_search` has no
    // notice filter, so what survived was retrievable as company knowledge:
    // 11 of the 13 notices in the corpus were unverified model prose, including
    // one asserting a survey loop that the verifier probed the same day and
    // cleared on 2/2 devices.
    //
    // The record is `ux_finding` now, written by the verifier after a probe has
    // actually answered.
    mockFetchFindings.mockResolvedValue([finding()]);
    const res = await GET(req());

    expect(mockRecordNotice).not.toHaveBeenCalled();
    expect(mockMarkDelivered).toHaveBeenCalledWith("ux_review", "observation", "obs-1");
    expect(await res.json()).toMatchObject({ ok: true, collected: 1, contradicted: 0 });
  });

  it("finalises the claim on the refuted path too, so it is not re-queried", async () => {
    // A claim taken and never marked goes stale in ten minutes and is handed
    // back, so a 90-minute lookback re-refuted the same finding three times.
    mockFetchFindings.mockResolvedValue([finding()]);
    mockContradiction.mockReturnValue("the session has no unlock_click");

    const res = await GET(req());

    expect(mockRecordNotice).not.toHaveBeenCalled();
    expect(mockMarkDelivered).toHaveBeenCalledWith("ux_review", "observation", "obs-1");
    expect(await res.json()).toMatchObject({ contradicted: 1, collected: 0 });
  });

  it("spends its per-run budget on unclaimed findings, not on ones already handled", async () => {
    // The budget existed to bound a 30-second function, but it was applied to
    // the LOOKBACK rather than to the work: `findings.slice(0, 6)` took the six
    // newest of up to 25 and then skipped the already-claimed ones among them.
    //
    // The lookback is 90 minutes on a 30-minute schedule, so the six newest are
    // re-examined on three consecutive runs. Once six findings arrive inside one
    // gap, every older finding ranks below them (ORDER BY timestamp DESC) and can
    // never be reached — it ages out of the window unclaimed, unverified, and
    // uncounted. The failure mode arrives exactly when the scanners are busiest.
    const findings = Array.from({ length: 8 }, (_, i) =>
      finding({
        observationId: `obs-${i + 1}`,
        sessionId: `01a09e04-dfaa-7a3e-9622-0d7ca528501${i}`,
      })
    );
    mockFetchFindings.mockResolvedValue(findings);
    // The six newest were handled on an earlier run; only the last two are new.
    mockTryClaim.mockImplementation(async (kind: string, _type: string, id: string) =>
      kind === "ux_review" ? id === "obs-7" || id === "obs-8" : true
    );

    const res = await GET(req());

    expect(await res.json()).toMatchObject({ considered: 8, collected: 2, suppressed: 6 });
    const handled = mockMarkDelivered.mock.calls
      .filter((c) => c[0] === "ux_review")
      .map((c) => c[2]);
    expect(handled).toEqual(["obs-7", "obs-8"]);
  });

  it("stops at the budget once that many findings have actually been worked", async () => {
    // The other half of the same rule: the bound must still hold. Eight new
    // findings, none claimed, must cost six units of work and no more.
    mockFetchFindings.mockResolvedValue(
      Array.from({ length: 8 }, (_, i) => finding({ observationId: `new-${i + 1}` }))
    );

    const res = await GET(req());

    expect(await res.json()).toMatchObject({ considered: 8, collected: 6 });
    expect(mockFetchSessionEvents).toHaveBeenCalledTimes(6);
  });

  it("does not post the digest before the digest hour", async () => {
    vi.setSystemTime(new Date("2026-09-14T03:00:00Z"));
    await GET(req());
    const kinds = mockNotifySlack.mock.calls.map((c) => (c[0] as { kind: string }).kind);
    expect(kinds).not.toContain("ux_review_digest");
  });

  it("posts the digest once a day, keyed by the BERLIN date", async () => {
    await GET(req());
    expect(mockTryClaim).toHaveBeenCalledWith("ux_review_digest", "daily", "2026-09-14");
    expect(mockMarkDelivered).toHaveBeenCalledWith("ux_review_digest", "daily", "2026-09-14");
  });

  it("uses the Berlin day, not the UTC day, after Berlin midnight", async () => {
    // 23:30 UTC on the 14th is 01:30 Berlin on the 15th. Keyed on UTC the claim
    // would read "2026-09-14", filing a Berlin-15th event under the 14th.
    //
    // Tested through the DRIFT alert rather than the digest, because Berlin is
    // AHEAD of UTC: the two dates only disagree between 00:00 and 02:00 Berlin,
    // which is always before the 09:00 digest gate. The digest can therefore
    // never observe the difference — the drift alert, which has no hour gate,
    // can.
    vi.setSystemTime(new Date("2026-09-14T23:30:00Z"));
    mockFetchScannerDrift.mockResolvedValue([
      {
        scannerName: "LoveIQ survey UX",
        reason: "prompt",
        detail: "the prompt in PostHog differs from the one in git",
      },
    ]);

    await GET(req());

    const driftClaim = mockTryClaim.mock.calls.find((c) => c[0] === "ux_review_drift");
    expect(driftClaim).toBeDefined();
    // Keyed by scanner AND reason, so two different problems with one scanner
    // do not collapse into a single alert for the day.
    expect(driftClaim?.[1]).toBe("LoveIQ survey UX:prompt");
    expect(driftClaim?.[2]).toBe("2026-09-15");
  });

  it("gates the digest on the Berlin hour, so it does not drift with the clock change", async () => {
    // 07:30 UTC is 09:30 Berlin in summer but 08:30 Berlin in winter. A fixed
    // UTC hour would post an hour earlier from late October without anyone
    // changing anything; a Berlin hour holds 09:00 all year.
    vi.setSystemTime(new Date("2026-01-15T07:30:00Z")); // 08:30 Berlin — too early
    await GET(req());
    expect(mockNotifySlack.mock.calls.map((c) => (c[0] as { kind: string }).kind)).not.toContain(
      "ux_review_digest"
    );

    vi.clearAllMocks();
    mockTryClaim.mockResolvedValue(true);
    mockFetchFindings.mockResolvedValue([]);
    mockFetchDailyStats.mockResolvedValue([]);
    vi.setSystemTime(new Date("2026-01-15T08:30:00Z")); // 09:30 Berlin — go
    await GET(req());
    expect(mockNotifySlack.mock.calls.map((c) => (c[0] as { kind: string }).kind)).toContain(
      "ux_review_digest"
    );
  });

  it("stays silent when the digest claim is already taken", async () => {
    mockTryClaim.mockResolvedValue(false);
    await GET(req());
    const kinds = mockNotifySlack.mock.calls.map((c) => (c[0] as { kind: string }).kind);
    expect(kinds).not.toContain("ux_review_digest");
  });
});
