import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildReviewMessage,
  contradiction,
  detectDrift,
  fetchSessionEvents,
  isSafeSessionId,
  sessionViewport,
  fetchFindings,
  findThreadTs,
  firstSentence,
  recordingLink,
  type UxFinding,
} from "../server/review";
import { UX_REVIEW_MIN_CONFIDENCE, UX_SCANNERS } from "../server/scanners";

const finding = (over: Partial<UxFinding> = {}): UxFinding => ({
  observationId: "01a0-obs",
  sessionId: "01a0-sess",
  scannerId: UX_SCANNERS[1]!.id ?? "sid",
  scannerName: UX_SCANNERS[1]!.name,
  scannerVersion: UX_SCANNERS[1]!.scannerVersion,
  confidence: 0.9,
  reasoning:
    "The paywall card did not respond to a tap. It happened on the locked chapter. Cited at t=120s.",
  ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe("buildReviewMessage", () => {
  it("is four blocks and leads with the finding, not the working out", () => {
    const { text, blocks } = buildReviewMessage(finding());
    expect(blocks).toHaveLength(4);
    expect(blocks[1]).toMatchObject({
      type: "section",
      text: { text: expect.stringContaining("The paywall card did not respond to a tap.") },
    });
    // The rest of the model's prose must NOT be in the message — "very short
    // summary" was the actual requirement on the card.
    expect(JSON.stringify(blocks)).not.toContain("Cited at t=120s");
    expect(text).toContain("UX review");
  });

  it("links to the recording by path, which opens it", () => {
    const { blocks } = buildReviewMessage(finding({ sessionId: "abc-123" }));
    // /replay/<id> opens the recording; the query-param form lands on a filtered
    // LIST, which reads as a broken link to whoever clicked it.
    expect(JSON.stringify(blocks)).toContain("/replay/abc-123");
    expect(recordingLink("a b")).toContain("a%20b");
  });

  it("always says the finding is unreviewed", () => {
    // The human-in-the-loop commitment, expressed where a reader will see it.
    // Nothing this pipeline posts may read as established fact.
    const { blocks } = buildReviewMessage(finding());
    expect(JSON.stringify(blocks)).toContain("unreviewed");
  });

  it("mentions the unrated backlog only when there is one", () => {
    expect(JSON.stringify(buildReviewMessage(finding(), 0).blocks)).not.toContain("unrated");
    expect(JSON.stringify(buildReviewMessage(finding(), 3).blocks)).toContain("3 unrated");
  });

  it("escapes model prose, which describes a session anyone could have staged", () => {
    const { blocks } = buildReviewMessage(
      finding({ reasoning: "A <script> & *bold* thing broke here." })
    );
    const json = JSON.stringify(blocks);
    // Slack markup, not HTML: the repo neutralises <>&*_~` by backslash-escaping,
    // which stops prose being read as a link or as bold/italic formatting.
    expect(json).toContain("\\\\<script");
    expect(json).toContain("\\\\*bold");
    expect(json).not.toMatch(/[^\\]\*bold/);
  });

  it("clamps a runaway reasoning so one finding cannot fill the channel", () => {
    const { blocks } = buildReviewMessage(finding({ reasoning: "x".repeat(5000) }));
    const body = JSON.stringify(blocks[1]);
    expect(body.length).toBeLessThan(400);
  });
});

describe("firstSentence", () => {
  it("stops at the first sentence and survives prose without one", () => {
    expect(firstSentence("One thing. Two thing.")).toBe("One thing.");
    expect(firstSentence("  no full stop here ")).toBe("no full stop here");
  });
});

describe("detectDrift", () => {
  it("fires when PostHog's live version is ahead of the version pinned in git", () => {
    const scanner = UX_SCANNERS[0]!;
    const drift = detectDrift([
      { scannerName: scanner.name, scannerVersion: scanner.scannerVersion + 1 },
    ]);
    expect(drift).toEqual([
      {
        scannerName: scanner.name,
        pinnedVersion: scanner.scannerVersion,
        liveVersion: scanner.scannerVersion + 1,
      },
    ]);
  });

  it("stays quiet when they agree", () => {
    const scanner = UX_SCANNERS[0]!;
    expect(
      detectDrift([{ scannerName: scanner.name, scannerVersion: scanner.scannerVersion }])
    ).toEqual([]);
  });
});

describe("fetchFindings", () => {
  it("asks only for high-confidence YES verdicts, so weak hits never reach Slack", async () => {
    let sentBody = "";
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      sentBody = String(init.body);
      return { ok: true, json: async () => ({ results: [] }) } as unknown as Response;
    });
    vi.stubEnv("POSTHOG_API_KEY", "phx_test");
    await fetchFindings();
    expect(sentBody).toContain("scanner_output_verdict = 'yes'");
    expect(sentBody).toContain(String(UX_REVIEW_MIN_CONFIDENCE));
  });

  it("throws on a HogQL error returned with HTTP 200", async () => {
    // PostHog answers a bad query 200-with-error. Treating that as "no findings"
    // makes a broken detector look exactly like a healthy product.
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      json: async () => ({ error: "Unknown field", results: [] }),
    }));
    vi.stubEnv("POSTHOG_API_KEY", "phx_test");
    await expect(fetchFindings()).rejects.toThrow(/posthog query error/);
  });

  it("returns nothing rather than throwing when PostHog is not configured", async () => {
    vi.stubEnv("POSTHOG_API_KEY", "");
    await expect(fetchFindings()).resolves.toEqual([]);
  });
});

describe("findThreadTs", () => {
  it("resolves a recording to the survey notification it belongs under", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(String(url));
      // Match the TABLE, not a substring: "slack_journey_message?survey_submission_id="
      // also contains "survey_submission", which made this stub answer the second
      // call with the first call's payload.
      const body = String(url).includes("/survey_submission?")
        ? [{ id: 2063 }]
        : [{ message_ts: "1789.4242" }];
      return { ok: true, json: async () => body } as unknown as Response;
    });
    vi.stubEnv("SUPABASE_URL", "https://db.example");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "svc");
    await expect(findThreadTs("sess-1")).resolves.toBe("1789.4242");
    // It must look the session up by the column that actually links the two.
    expect(calls[0]).toContain("posthog_session_id=eq.sess-1");
    expect(calls[1]).toContain("survey_submission_id=eq.2063");
  });

  it("returns null rather than throwing when there is no thread to use", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => [] }));
    vi.stubEnv("SUPABASE_URL", "https://db.example");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "svc");
    // A landing-page recording has no submission. The finding still has to be
    // delivered — to the channel — so this must not throw or block.
    await expect(findThreadTs("sess-none")).resolves.toBeNull();
  });

  it("survives Supabase being unreachable", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("network down");
    });
    vi.stubEnv("SUPABASE_URL", "https://db.example");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "svc");
    await expect(findThreadTs("sess-1")).resolves.toBeNull();
  });
});

describe("contradiction", () => {
  it("refutes an unlock claim in a session with no unlock event", () => {
    // The real 2026-09-14 fabrication: "the user clicked 'Unlock full report',
    // which looped them back to the survey" — in a session containing none of
    // the four events that fire when that happens.
    const why = contradiction(
      "the user clicked 'Unlock full report', which looped them back to the survey",
      new Set(["report_viewed", "locked_card_price_shown"])
    );
    expect(why).toMatch(/unlock click/);
  });

  it("accepts the same claim when the event is there", () => {
    expect(
      contradiction("the user clicked 'Unlock full report'", new Set(["unlock_click"]))
    ).toBeNull();
  });

  it("does not refute when the session's events could not be read", () => {
    // fetchSessionEvents() returns an empty Set on a missing key, an unsafe id,
    // a non-ok response, a 200-with-error payload, or a throw. Without the
    // size-0 guard every checkable claim is refuted during a PostHog outage,
    // so an outage looks exactly like a quiet, healthy day. Fail open.
    expect(
      contradiction(
        "the user clicked 'Unlock full report', which looped them back to the survey",
        new Set()
      )
    ).toBeNull();
  });

  it("still refutes that claim the moment events ARE readable", () => {
    // The guard must key on "we read nothing", not on "the event is absent" —
    // otherwise it would disable refutation altogether.
    expect(
      contradiction(
        "the user clicked 'Unlock full report', which looped them back to the survey",
        new Set(["report_viewed"])
      )
    ).toMatch(/unlock click/);
  });

  it("says nothing about claims it cannot check", () => {
    // A rule that fires on unmatched prose would refute everything, which is
    // just a differently-wrong detector.
    expect(contradiction("the heading was covered by the chapter bar", new Set())).toBeNull();
  });

  it("refuses a session id that is not UUID-shaped", async () => {
    expect(isSafeSessionId("01a09e04-dfaa-7a3e-9622-0d7ca5285017")).toBe(true);
    expect(isSafeSessionId("' OR 1=1 --")).toBe(false);
    expect(isSafeSessionId("a'; DROP TABLE events; --")).toBe(false);
    // And the fetch refuses rather than interpolating it.
    vi.stubEnv("POSTHOG_API_KEY", "phx_test");
    let called = false;
    vi.stubGlobal("fetch", async () => {
      called = true;
      return { ok: true, json: async () => ({ results: [] }) } as unknown as Response;
    });
    await expect(fetchSessionEvents("' OR 1=1 --")).resolves.toEqual(new Set());
    expect(called, "a malformed id must never reach the query").toBe(false);
  });

  it("falls silent rather than refuting when PostHog is unreachable", async () => {
    // An empty event set would otherwise contradict every claim that names an
    // action, turning an outage into a wave of false refutations.
    vi.stubEnv("POSTHOG_API_KEY", "phx_test");
    vi.stubGlobal("fetch", async () => {
      throw new Error("network down");
    });
    await expect(fetchSessionEvents("01a0-sess")).resolves.toEqual(new Set());
  });
});

describe("sessionViewport", () => {
  const stub = (rows: unknown[][]) =>
    vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({ results: rows }) }));

  it("returns the narrowest and widest size the reader actually had", async () => {
    vi.stubEnv("POSTHOG_API_KEY", "phx_test");
    // The real Galaxy Z Flip session: the viewport moves as the device folds,
    // so a probe must cover both ends, not a default phone width.
    stub([[262, 715, "Linux"]]);
    await expect(sessionViewport("01a0-sess")).resolves.toEqual({
      min: 262,
      max: 715,
      os: "Linux",
    });
  });

  it("collapses a fixed-size session to one width", async () => {
    vi.stubEnv("POSTHOG_API_KEY", "phx_test");
    stub([[384, 384, "Android"]]);
    await expect(sessionViewport("01a0-sess")).resolves.toEqual({
      min: 384,
      max: 384,
      os: "Android",
    });
  });

  it("refuses a malformed session id without querying", async () => {
    vi.stubEnv("POSTHOG_API_KEY", "phx_test");
    let called = false;
    vi.stubGlobal("fetch", async () => {
      called = true;
      return { ok: true, json: async () => ({ results: [] }) } as unknown as Response;
    });
    await expect(sessionViewport("' OR 1=1 --")).resolves.toBeNull();
    expect(called).toBe(false);
  });

  it("returns null on a session with no viewport data", async () => {
    // Falling back to a default device is the caller's choice to make, not
    // something to fake here with a plausible-looking number.
    vi.stubEnv("POSTHOG_API_KEY", "phx_test");
    stub([[null, null, ""]]);
    await expect(sessionViewport("01a0-sess")).resolves.toBeNull();
  });
});
