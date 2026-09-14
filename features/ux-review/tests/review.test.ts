import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildDigestMessage,
  contradiction,
  detectDrift,
  fetchSessionEvents,
  isSafeSessionId,
  sessionViewport,
  fetchDailyStats,
  fetchFindings,
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

describe("buildDigestMessage", () => {
  it("reports the ratio, not just the flags", () => {
    const { text, blocks } = buildDigestMessage([
      { scanner: "LoveIQ survey UX", observed: 12, yes: 2 },
      { scanner: "LoveIQ report UX", observed: 8, yes: 2 },
    ]);
    expect(text).toContain("20 recordings reviewed, 4 flagged");
    expect(JSON.stringify(blocks)).toContain("LoveIQ survey UX — 12 reviewed, 2 flagged");
  });

  it("calls out a silent day instead of reporting all-clear", () => {
    // A broken scanner and a healthy product both produce zero findings. Saying
    // "no issues" for the first is how a dead detector goes unnoticed.
    const { text } = buildDigestMessage([]);
    expect(text).toMatch(/unusual/i);
    expect(text).not.toMatch(/no issues|all clear/i);
  });

  it("says a flag is not yet a finding", () => {
    const { blocks } = buildDigestMessage([{ scanner: "s", observed: 1, yes: 1 }]);
    expect(JSON.stringify(blocks)).toContain("reproduces it in a real browser");
  });

  it("escapes a scanner name renamed in the PostHog UI", () => {
    const { blocks } = buildDigestMessage([
      { scanner: "<script>alert(1)</script>", observed: 1, yes: 0 },
    ]);
    expect(JSON.stringify(blocks)).not.toContain("<script>");
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

describe("fetchDailyStats", () => {
  it("counts every verdict, not just the flagged ones", async () => {
    // The ratio is the interesting number: day one was 5 yes / 31 observed and
    // all five were wrong about why. A digest of only the YES rows hides that.
    let sentBody = "";
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      sentBody = String(init.body);
      return {
        ok: true,
        json: async () => ({ results: [["LoveIQ survey UX", 12, 2]] }),
      } as unknown as Response;
    });
    vi.stubEnv("POSTHOG_API_KEY", "phx_test");
    const stats = await fetchDailyStats();
    expect(stats).toEqual([{ scanner: "LoveIQ survey UX", observed: 12, yes: 2 }]);
    expect(sentBody).not.toContain("scanner_output_verdict = 'yes'");
  });

  it("throws on a HogQL error returned with HTTP 200", async () => {
    // Same trap as fetchFindings: a broken query would otherwise produce an
    // empty digest, which reads as a quiet, healthy day.
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      json: async () => ({ error: "Unknown field", results: [] }),
    }));
    vi.stubEnv("POSTHOG_API_KEY", "phx_test");
    await expect(fetchDailyStats()).rejects.toThrow(/posthog daily query error/);
  });

  it("throws on a non-2xx rather than reporting an empty day", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 503, json: async () => ({}) }));
    vi.stubEnv("POSTHOG_API_KEY", "phx_test");
    await expect(fetchDailyStats()).rejects.toThrow(/posthog daily query 503/);
  });

  it("returns nothing rather than throwing when PostHog is not configured", async () => {
    vi.stubEnv("POSTHOG_API_KEY", "");
    await expect(fetchDailyStats()).resolves.toEqual([]);
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
