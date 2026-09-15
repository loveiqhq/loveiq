import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const complete = vi.fn();
// Only the network call is replaced. `parseRetryAfterMs` is pure and is the thing under
// test below, so it must stay the real one.
vi.mock("@features/brain/server/llm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@features/brain/server/llm")>()),
  complete: (...args: unknown[]) => complete(...args),
  isLlmConfigured: () => true,
}));

const upsertChunks = vi.fn(async () => {});
vi.mock("@features/brain/server/ingest/upsert", () => ({
  upsertChunks: (...args: unknown[]) => upsertChunks(...args),
}));

const supabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => supabaseFetch(...args),
}));

import { mineDecisions } from "@features/brain/server/ingest/mine-decisions";
import { parseRetryAfterMs } from "@features/brain/server/llm";

/** Two meetings whose notes carry a quotable, settled decision each. */
const MEETINGS = [
  { id: "m-newer", date: "2026-09-02", text: "We agreed to cap the report at 29." },
  { id: "m-older", date: "2026-09-01", text: "We agreed to move the paywall earlier." },
];

const ok = (text: string) => ({ ok: true as const, text, truncated: false });

const reply = (decision: string, quote: string) =>
  ok(
    JSON.stringify({
      decisions: [{ decision, why: "measured", topic: "pricing", quote, settled: true }],
    })
  );

/**
 * Stands in for every PostgREST read the miner makes: the meeting list, the mined-log
 * scan, the person roster, and the `markMined` write. Only the meeting list needs real
 * shape; the rest may be empty.
 */
function wireSupabase() {
  supabaseFetch.mockImplementation(async (path: string) => {
    const json = (body: unknown) => ({
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => "",
    });
    if (path.includes("brain_mine_log")) return json([]);
    if (path.includes("brain_person")) return json([{ canonical: "Eman Cickusic" }]);
    if (path.includes("brain_chunk")) {
      return json(
        MEETINGS.map((m) => ({
          source_id: `${m.id}#1`,
          title: `Meeting notes: ${m.id}`,
          body: m.text,
          period_end: m.date,
          meta: { section: "summary", people: [] },
        }))
      );
    }
    return json([]);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  complete.mockReset();
  upsertChunks.mockReset();
  upsertChunks.mockResolvedValue(undefined);
  supabaseFetch.mockReset();
  wireSupabase();
});
afterEach(() => vi.useRealTimers());

/** Runs the miner while letting every pending timer fire immediately. */
async function run(limit: number, budgetMs: number) {
  const promise = mineDecisions(limit, budgetMs);
  await vi.runAllTimersAsync();
  return promise;
}

describe("parseRetryAfterMs — how long the provider asked us to wait", () => {
  it("reads Google's RetryInfo out of the 429 body", () => {
    expect(parseRetryAfterMs(null, '{"details":[{"retryDelay":"32s"}]}')).toBe(32_000);
  });

  it("rounds a fractional delay UP, so we never wake a hair too early", () => {
    expect(parseRetryAfterMs(null, '{"retryDelay":"32.65s"}')).toBe(32_650);
  });

  it("prefers the retry-after header when the provider sends one", () => {
    expect(parseRetryAfterMs("5", '{"retryDelay":"99s"}')).toBe(5_000);
  });

  /** An absent hint must stay absent. Falling back to 0 would spin the loop. */
  it("returns undefined when neither hint is present, rather than zero", () => {
    expect(parseRetryAfterMs(null, "Too Many Requests")).toBeUndefined();
    expect(parseRetryAfterMs("not-a-number", "{}")).toBeUndefined();
  });

  it("refuses to be parked for longer than two minutes", () => {
    expect(parseRetryAfterMs(null, '{"retryDelay":"3600s"}')).toBe(120_000);
  });

  /**
   * THE REAL BODY, as the free tier actually sends it (captured from production, quota
   * figures only -- no credentials). `RetryInfo` is the LAST of three `details` entries
   * and lands at character 1325 of 1366. The first version of this parser read a copy
   * truncated to 600 characters and therefore always answered "no hint", which is
   * indistinguishable from a provider that sent none -- so the miner never waited and
   * the whole change did nothing. Keep this fixture long.
   */
  it("finds the hint in a real Google 429, where RetryInfo is 1300 characters in", () => {
    const body = JSON.stringify([
      {
        error: {
          code: 429,
          message:
            "You exceeded your current quota, please check your plan and billing details. " +
            "For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. " +
            "To monitor your current usage, head to: https://ai.dev/rate-limit. \n" +
            "* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, " +
            "limit: 5, model: gemini-3.6-flash\nPlease retry in 32.652110245s.",
          status: "RESOURCE_EXHAUSTED",
          details: [
            {
              "@type": "type.googleapis.com/google.rpc.Help",
              links: [
                {
                  description: "Learn more about Gemini API quotas",
                  url: "https://ai.google.dev/gemini-api/docs/rate-limits",
                },
              ],
            },
            {
              "@type": "type.googleapis.com/google.rpc.QuotaFailure",
              violations: [
                {
                  quotaMetric:
                    "generativelanguage.googleapis.com/generate_content_free_tier_requests",
                  quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier",
                  quotaDimensions: { model: "gemini-3.6-flash", location: "global" },
                  quotaValue: "5",
                },
              ],
            },
            { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "32s" },
          ],
        },
      },
    ]);

    expect(body.length).toBeGreaterThan(1000);
    expect(body.indexOf("retryDelay")).toBeGreaterThan(600);
    expect(parseRetryAfterMs(null, body)).toBe(32_000);
  });

  /**
   * The free tier enforces 5/minute AND 20/day, and dresses both the same way — the
   * daily refusal still carries `retryDelay: "17s"`. Honouring it would spend the run's
   * entire budget re-asking a question that cannot be answered again until tomorrow.
   */
  it("refuses to wait on the DAILY quota, however short the delay it offers", () => {
    const daily = JSON.stringify({
      error: {
        message:
          "Quota exceeded for metric: ...free_tier_requests, limit: 20. Please retry in 17.1s.",
        details: [
          {
            "@type": "type.googleapis.com/google.rpc.QuotaFailure",
            violations: [
              { quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier", quotaValue: "20" },
            ],
          },
          { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "17s" },
        ],
      },
    });
    expect(parseRetryAfterMs(null, daily)).toBeUndefined();
  });

  /** The per-minute limit, by contrast, really does clear. */
  it("still waits on the per-MINUTE quota", () => {
    const perMinute = JSON.stringify({
      error: {
        details: [
          {
            "@type": "type.googleapis.com/google.rpc.QuotaFailure",
            violations: [
              { quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier", quotaValue: "5" },
            ],
          },
          { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "32s" },
        ],
      },
    });
    expect(parseRetryAfterMs(null, perMinute)).toBe(32_000);
  });

  /** The message carries the delay too, ~900 characters earlier. Either alone suffices. */
  it("falls back to the delay in the message when RetryInfo is absent", () => {
    expect(parseRetryAfterMs(null, "quota exceeded. Please retry in 12.5s.")).toBe(12_500);
  });
});

describe("mineDecisions — a per-minute quota is a pause, not the end of the run", () => {
  /**
   * THE POINT OF THE WHOLE CHANGE.
   *
   * The free tier allows five requests a minute. Treating the 429 as terminal mined five
   * meetings a night and closed every run with "stopped early: rate_limited". This asserts
   * the run continues past the limit.
   */
  it("waits out the window and carries on", async () => {
    complete
      .mockResolvedValueOnce({ ok: false, reason: "rate_limited", retryAfterMs: 32_000 })
      .mockResolvedValueOnce(reply("cap the report at 29", "We agreed to cap the report at 29."))
      .mockResolvedValueOnce(
        reply("move the paywall earlier", "We agreed to move the paywall earlier.")
      );

    const result = await run(2, 240_000);

    expect(result.skipped).toBeNull();
    expect(result.scanned).toBe(2);
    expect(result.written).toBe(2);
  });

  /**
   * THE BUG THIS LOOP WAS WRITTEN AROUND. A `for...of` with a `continue` advances the
   * iterator, so the meeting we paused FOR is the one that never gets read — and it is
   * never tombstoned either, so nothing downstream would ever notice.
   */
  it("re-reads the meeting it paused for, rather than skipping it", async () => {
    complete
      .mockResolvedValueOnce({ ok: false, reason: "rate_limited", retryAfterMs: 1_000 })
      .mockResolvedValueOnce(reply("cap the report at 29", "We agreed to cap the report at 29."))
      .mockResolvedValueOnce(
        reply("move the paywall earlier", "We agreed to move the paywall earlier.")
      );

    await run(2, 240_000);

    const asked = complete.mock.calls.map((c) =>
      String((c[0] as Array<{ content: string }>)[1].content)
    );
    // Three calls for two meetings: the first meeting is asked for twice.
    expect(asked).toHaveLength(3);
    expect(asked[0]).toContain("cap the report at 29");
    expect(asked[1]).toContain("cap the report at 29");
    expect(asked[2]).toContain("move the paywall earlier");
  });

  /** A wait that would outlast the run must not start: the cron would be killed mid-write. */
  it("stops instead of starting a wait it cannot finish inside the budget", async () => {
    complete.mockResolvedValue({ ok: false, reason: "rate_limited", retryAfterMs: 90_000 });

    const result = await run(2, 10_000);

    expect(result.skipped).toBe("rate_limited");
    expect(complete).toHaveBeenCalledTimes(1);
  });

  /**
   * The whole point of carrying `dailyQuota` out of the LLM layer: `cron_run` has to say
   * WHICH limit stopped the run, because the two want opposite fixes. A daily stop means
   * the cron is scheduled in the wrong part of the Pacific day and no budget will help;
   * a per-minute stop means the wait budget ran out and should be raised.
   */
  it("names the DAILY quota when that is what stopped it", async () => {
    complete.mockResolvedValue({ ok: false, reason: "rate_limited", dailyQuota: true });

    const result = await run(2, 240_000);

    expect(result.skipped).toBe("rate_limited_daily");
    // Terminal: a daily limit does not clear until midnight Pacific, so no retry.
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("names the PER-MINUTE quota when the wait cannot fit the budget", async () => {
    complete.mockResolvedValue({
      ok: false,
      reason: "rate_limited",
      dailyQuota: false,
      retryAfterMs: 90_000,
    });

    const result = await run(2, 10_000);

    expect(result.skipped).toBe("rate_limited_minute");
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("leaves an UNKNOWN limit unnamed rather than guessing per-minute", async () => {
    // A provider that says nothing about which limit it hit must not be reported as
    // per-minute. Naming it would be a claim nobody made, and the bare string is what
    // every existing reader already understands.
    complete.mockResolvedValue({ ok: false, reason: "rate_limited", retryAfterMs: 90_000 });

    const result = await run(2, 10_000);

    expect(result.skipped).toBe("rate_limited");
  });

  /** Without a hint there is nothing to wait for, so the old behaviour stands. */
  it("still stops dead when the provider gives no retry hint", async () => {
    complete.mockResolvedValue({ ok: false, reason: "rate_limited" });

    const result = await run(2, 240_000);

    expect(result.skipped).toBe("rate_limited");
    expect(complete).toHaveBeenCalledTimes(1);
  });

  /** A genuine error is not a quota pause and must never be retried into a loop. */
  it("does not wait on a non-quota failure", async () => {
    complete.mockResolvedValue({ ok: false, reason: "error", detail: "HTTP 500" });

    const result = await run(2, 240_000);

    expect(result.skipped).toBe("error");
    expect(complete).toHaveBeenCalledTimes(1);
  });

  /**
   * The case above passes even with the `reason` check deleted, because an error result
   * carries no `retryAfterMs` and `Date.now() + undefined` is NaN, which compares false.
   * It proves the absence of a delay, not the presence of the check. This one hands a
   * non-quota failure a perfectly good delay, so only the `reason` test can refuse it.
   */
  it("refuses to retry a non-quota failure even when it carries a retry delay", async () => {
    complete.mockResolvedValue({
      ok: false,
      reason: "error",
      detail: "HTTP 503",
      retryAfterMs: 1_000,
    });

    const result = await run(2, 240_000);

    expect(result.skipped).toBe("error");
    expect(complete).toHaveBeenCalledTimes(1);
  });

  /** Running out of clock is a different outcome from running out of quota. */
  it("reports out_of_time distinctly, so a slow run is not read as a throttled one", async () => {
    complete.mockImplementation(async () => {
      vi.advanceTimersByTime(60_000);
      return reply("cap the report at 29", "We agreed to cap the report at 29.");
    });

    const result = await run(2, 30_000);

    expect(result.skipped).toBe("out_of_time");
  });
});
