import { afterEach, describe, expect, it, vi } from "vitest";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import logger from "@shared/observability/logger";

import {
  buildDigestMessage,
  contradiction,
  compareScanners,
  fetchSessionEvents,
  isSafeSessionId,
  sessionClickTarget,
  sessionViewport,
  fetchCoverageStats,
  fetchDailyStats,
  fetchVerificationStats,
  isChallengerScanner,
  warnIfTruncated,
  buildScorecardMessage,
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

const covered = (over: Partial<{ submissions: number; observed: number }> = {}) => ({
  submissions: 10,
  observed: 10,
  ...over,
});

const verified = (over: Record<string, unknown> = {}) => ({
  reproduced: 0,
  reproducedItems: [] as Array<{
    criterion: string | null;
    urlPath: string | null;
    delivered: boolean;
    fromOwnRecords: boolean;
  }>,
  clear: 0,
  inconclusive: 0,
  gap: 0,
  contradicted: 0,
  duplicate: 0,
  undelivered: 0,
  total: 0,
  ...over,
});

describe("buildDigestMessage", () => {
  it("reports what the PROBES concluded, not only what the model flagged", () => {
    // Until 2026-09-17 this message carried scanner flag counts and nothing
    // else, so a reader could not tell a reproduced defect from a refuted
    // guess — and the flags are the half we have measured to be unreliable.
    const { blocks } = buildDigestMessage(
      [{ scanner: "LoveIQ report UX", observed: 9, yes: 4 }],
      verified({ reproduced: 1, clear: 2, inconclusive: 1, total: 4 }),
      covered()
    );
    const json = JSON.stringify(blocks);
    // Says WHAT was confirmed, not just how many. A count alone told the
    // reader that something real happened and nothing about what.
    expect(json).toContain("1 problem confirmed on a real phone");
    expect(json).toContain("2 did not happen again when we re-tested");
    expect(json).toContain("1 could not be tested");
  });

  it("never renders a bullet with no name on it", () => {
    // Shipped to Marcus on 2026-09-20 as "•  — watched 1, suspected 0". One
    // $recording_observed event carried no scanner_name, and the guard meant
    // to catch it (`?? "unknown"`) could not: HogQL's toString(NULL) is the
    // EMPTY STRING, so the nullish coalescing never fired. The observation is
    // real and must still be reported — just not anonymously.
    const { blocks } = buildDigestMessage(
      [
        { scanner: "", observed: 1, yes: 0 },
        { scanner: "unknown", observed: 2, yes: 0 },
      ],
      verified(),
      covered()
    );
    const json = JSON.stringify(blocks);
    expect(json).not.toContain("•  —");
    expect(json).toContain("An unnamed check — watched 1");
    expect(json).toContain("An unnamed check — watched 2");
  });

  it("names the verdicts that reached nobody", () => {
    // Two of eight verdicts were printed to a CI log and discarded because the
    // session had no submission thread. Silence made that invisible.
    const { blocks } = buildDigestMessage([], verified({ clear: 3, undelivered: 2, total: 3 }));
    expect(JSON.stringify(blocks)).toContain("2 of these had no survey entry to post under");
  });

  it("says how many readers were actually watched", () => {
    // Every other line in this digest counts what the scanners SAID, and none
    // of them can show what was never opened. Measured 2026-09-18: 39 of 118
    // submissions over seven days, so 67% of finishers were watched by nothing
    // — and the digest looked identical either way.
    const { blocks } = buildDigestMessage(
      [],
      verified(),
      covered({ submissions: 118, observed: 39 })
    );
    const json = JSON.stringify(blocks);
    expect(json).toContain("39 of the 118 people");
    expect(json).toContain("33%");
    // "yet", not "never": the most recent hour is always still pending, and
    // anything skipped is re-queued every three hours.
    expect(json).toContain("other 79 had not been watched");
    expect(json).toContain("queued automatically");
    expect(json).not.toContain("never watched");
  });

  it("says nothing was missed when coverage is complete", () => {
    const { blocks } = buildDigestMessage(
      [],
      verified(),
      covered({ submissions: 12, observed: 12 })
    );
    const json = JSON.stringify(blocks);
    expect(json).toContain("12 of the 12 people");
    expect(json).toContain("Everyone was watched");
    expect(json).not.toContain("never watched");
  });

  it("reports unreadable coverage rather than printing full coverage", () => {
    const { blocks } = buildDigestMessage([], verified(), null);
    expect(JSON.stringify(blocks)).toContain("could not read the coverage");
  });

  it("says the record could not be read rather than printing a quiet day", () => {
    // A missing line and a clean day must not look the same.
    const { blocks } = buildDigestMessage([], null, covered());
    expect(JSON.stringify(blocks)).toContain("could not read the verification record");
  });

  it("distinguishes an unreadable ledger from an empty one", () => {
    const { blocks } = buildDigestMessage([], verified(), covered());
    expect(JSON.stringify(blocks)).toContain("nothing reached the re-testing step");
  });

  it("reports the ratio, not just the flags", () => {
    const { text, blocks } = buildDigestMessage(
      [
        { scanner: "LoveIQ survey UX", observed: 12, yes: 2 },
        { scanner: "LoveIQ report UX", observed: 8, yes: 2 },
      ],
      verified()
    );
    expect(text).toContain("4 suspected of 20 watched");
    // Named for what it watches, not for how it is configured in PostHog.
    // "LoveIQ dead-click cause" reads like an error code to the one person
    // this message is written for.
    const json2 = JSON.stringify(blocks);
    expect(json2).toContain("The survey — watched 12, suspected 2");
    expect(json2).not.toContain("LoveIQ");
  });

  it("says plainly that nothing needs attention when nothing was confirmed", () => {
    // The old message ended on a list of counts, which reads like a to-do list
    // even on a day when every suspicion was refuted.
    const { blocks } = buildDigestMessage(
      [{ scanner: "LoveIQ survey UX", observed: 9, yes: 3 }],
      verified({ clear: 3, total: 3 }),
      covered()
    );
    expect(JSON.stringify(blocks)).toContain("Nothing needs your attention today");
  });

  it("groups two people hitting the same problem into one line", () => {
    // Ungrouped, an identical pair printed the same sentence twice and read
    // like a copy-paste mistake rather than two affected people.
    const { blocks } = buildDigestMessage(
      [],
      verified({
        reproduced: 2,
        total: 2,
        reproducedItems: [
          { criterion: "L1", urlPath: "/survey", delivered: true },
          { criterion: "L1", urlPath: "/survey", delivered: true },
        ],
      }),
      covered()
    );
    const json = JSON.stringify(blocks);
    expect(json).toContain("(2 people)");
    // One bullet, not two.
    expect(json.match(/On the survey, people were sent back/g)).toHaveLength(1);
  });

  it("agrees singular and plural, because '1 were' costs the reader trust", () => {
    const { blocks } = buildDigestMessage(
      [],
      verified({
        reproduced: 1,
        contradicted: 1,
        duplicate: 1,
        total: 3,
        reproducedItems: [{ criterion: "D1", urlPath: "/checkout", delivered: false }],
      }),
      covered()
    );
    const json = JSON.stringify(blocks);
    expect(json).toContain("1 problem confirmed");
    expect(json).toContain("we re-tested it at");
    expect(json).toContain("1 was contradicted");
    expect(json).toContain("1 was already answered");
    expect(json).not.toContain("1 were");
    expect(json).toContain("the checkout page");
  });

  /**
   * "We found this without an AI" is a stronger claim than "an AI noticed it
   * and a probe agreed", and it is the signal that the mechanical half of the
   * detector is earning its keep. It is the thing worth watching after
   * 2026-09-19, so it belongs in the message rather than in someone's calendar.
   */
  it("says when a confirmed problem was found without any AI", () => {
    const { blocks } = buildDigestMessage(
      [],
      verified({
        reproduced: 1,
        total: 1,
        reproducedItems: [
          { criterion: "D1", urlPath: "/survey", delivered: true, fromOwnRecords: true },
        ],
      }),
      covered()
    );
    expect(JSON.stringify(blocks)).toContain("Found in our own records, without any AI");
  });

  it("does NOT claim that when a model was involved", () => {
    const { blocks } = buildDigestMessage(
      [],
      verified({
        reproduced: 2,
        total: 2,
        reproducedItems: [
          { criterion: "D1", urlPath: "/survey", delivered: true, fromOwnRecords: true },
          { criterion: "D1", urlPath: "/survey", delivered: true, fromOwnRecords: false },
        ],
      }),
      covered()
    );
    // Same group, mixed provenance: the stronger claim must not cover both.
    expect(JSON.stringify(blocks)).not.toContain("without any AI");
  });

  it("never leaks a criterion id into the message", () => {
    // "L1" means nothing to the reader; an unmapped one must fall back to a
    // sentence rather than printing the code.
    const { blocks } = buildDigestMessage(
      [],
      verified({
        reproduced: 1,
        total: 1,
        reproducedItems: [{ criterion: "Q9", urlPath: "/survey", delivered: true }],
      }),
      covered()
    );
    const json = JSON.stringify(blocks);
    expect(json).toContain("something did not work");
    expect(json).not.toContain("Q9");
  });

  it("calls out a silent day instead of reporting all-clear", () => {
    // A broken scanner and a healthy product both produce zero findings. Saying
    // "no issues" for the first is how a dead detector goes unnoticed.
    const { text } = buildDigestMessage([], verified(), covered());
    expect(text).toMatch(/unusual/i);
    expect(text).not.toMatch(/no issues|all clear/i);
  });

  it("says a flag is not yet a finding", () => {
    const { blocks } = buildDigestMessage(
      [{ scanner: "s", observed: 1, yes: 1 }],
      verified(),
      covered()
    );
    expect(JSON.stringify(blocks)).toContain("reproduce it in a real browser");
  });

  it("escapes a scanner name renamed in the PostHog UI", () => {
    const { blocks } = buildDigestMessage(
      [{ scanner: "<script>alert(1)</script>", observed: 1, yes: 0 }],
      verified()
    );
    expect(JSON.stringify(blocks)).not.toContain("<script>");
  });
});

describe("the per-session lookups refuse an unsafe id before it reaches HogQL", () => {
  // Both interpolate the session id straight into a HogQL string. The guard is
  // the only thing between PostHog's data and a query someone else wrote, and
  // both functions were rewritten on 2026-09-17 to share a retrying helper —
  // exactly the kind of refactor that drops a check nobody asserts.
  it("does not even make the request", async () => {
    process.env.POSTHOG_API_KEY = "test-key";
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({ results: [] }) }));
    vi.stubGlobal("fetch", fetchSpy);

    for (const bad of ["../../evil", "a' OR '1'='1", "x".repeat(200), "has spaces"]) {
      expect(await sessionViewport(bad)).toBeNull();
      expect(await sessionClickTarget(bad)).toBeNull();
    }
    expect(fetchSpy, "an unsafe id reached the network").not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("sessionClickTarget picks the control, not the loudest paragraph", () => {
  /**
   * The tiebreak is the whole point. One production session emitted 22 dead
   * clicks — 21 on decoration and exactly one on the survey consent gate's
   * `button.flex-1` — every count 1, so `ORDER BY count() DESC` alone returned
   * an arbitrary paragraph. The probe then said "not a control, not a defect"
   * and the finding was reported CLEAR with the dead button never looked at.
   *
   * Asserted on the emitted query because the ranking IS the query; a revert to
   * `ORDER BY 3 DESC` has to fail here.
   */
  it("ranks a control above frequency", async () => {
    process.env.POSTHOG_API_KEY = "test-key";
    let sent = "";
    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      sent = JSON.parse(init.body).query.query;
      return { ok: true, json: async () => ({ results: [["/survey", "button.flex-1", 1, 1]] }) };
    });

    const got = await sessionClickTarget("01a0a73f-0713-70e6-afb2-5a30f84f63c2");
    expect(got).toEqual({ pathname: "/survey", selector: "button.flex-1", clicks: 1 });

    // Control flag (4) ahead of frequency (3), not the other way round.
    expect(sent.replace(/\s+/g, " ")).toContain("ORDER BY 4 DESC, 3 DESC");
    expect(sent).toContain("startsWith(toString(properties.target_selector), 'button')");
    vi.unstubAllGlobals();
  });

  it("still returns decoration when that is all the session has", async () => {
    process.env.POSTHOG_API_KEY = "test-key";
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      json: async () => ({ results: [["/survey", "p.font-sans", 3, 0]] }),
    }));
    expect(await sessionClickTarget("01a0b2f9-14fd-7c4e-b273-cf43948c608f")).toEqual({
      pathname: "/survey",
      selector: "p.font-sans",
      clicks: 3,
    });
    vi.unstubAllGlobals();
  });
});

describe("compareScanners", () => {
  const pinned = UX_SCANNERS[0]!;
  const live = (over: Record<string, unknown> = {}) => [
    {
      name: pinned.name,
      enabled: true,
      scanner_version: pinned.scannerVersion,
      scanner_config: { prompt: pinned.prompt },
      limit_reached: false,
      ...over,
    },
    // The other three, matching git, so only the first can produce drift.
    ...UX_SCANNERS.slice(1).map((s) => ({
      name: s.name,
      enabled: true,
      scanner_version: s.scannerVersion,
      scanner_config: { prompt: s.prompt },
      limit_reached: false,
    })),
  ];

  it("is quiet when PostHog matches git", () => {
    expect(compareScanners(live())).toEqual([]);
  });

  it("catches a prompt edited in the UI without a version bump", () => {
    // The case the old observation-based check could not see at all, and the
    // one its own comment claimed to be protecting: the criteria being applied
    // stop being the criteria in the repo, and the version never moves.
    const drift = compareScanners(
      live({ scanner_config: { prompt: `${pinned.prompt} and also flag blue buttons` } })
    );
    expect(drift).toHaveLength(1);
    expect(drift[0]).toMatchObject({ scannerName: pinned.name, reason: "prompt" });
  });

  it("catches a version that moved in either direction", () => {
    expect(compareScanners(live({ scanner_version: pinned.scannerVersion + 1 }))[0]).toMatchObject({
      reason: "version",
    });
    // A rollback was invisible before: the old check only fired on live > pinned.
    expect(compareScanners(live({ scanner_version: pinned.scannerVersion - 1 }))[0]).toMatchObject({
      reason: "version",
    });
  });

  it("catches a scanner that is disabled or gone", () => {
    expect(compareScanners(live({ enabled: false }))[0]).toMatchObject({ reason: "disabled" });
    expect(compareScanners(live().slice(1))[0]).toMatchObject({
      scannerName: pinned.name,
      reason: "missing",
    });
  });

  it("catches a scanner that has stopped for want of credits", () => {
    expect(compareScanners(live({ limit_reached: true }))[0]).toMatchObject({ reason: "limit" });
  });

  it("does not invent prompt drift from a response it cannot read", () => {
    // An absent prompt is a response shape we do not understand. Reporting
    // drift from it would make every unreadable read look like an edit.
    expect(compareScanners(live({ scanner_config: {} }))).toEqual([]);
    expect(compareScanners(live({ scanner_config: null }))).toEqual([]);
  });

  it("ignores whitespace at the ends, which is not an edit to the criteria", () => {
    expect(
      compareScanners(live({ scanner_config: { prompt: `\n  ${pinned.prompt}  \n` } }))
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

  it("names a scanner PostHog did not name", async () => {
    // HogQL's toString(NULL) is the EMPTY STRING, so `?? "unknown"` could
    // never fire and a real observation reached the digest with no name at
    // all. Shipped to Marcus on 2026-09-20 as "•  — watched 1, suspected 0".
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      json: async () => ({ results: [["", 1, 0]] }),
    }));
    vi.stubEnv("POSTHOG_API_KEY", "phx_test");
    await expect(fetchDailyStats()).resolves.toEqual([{ scanner: "unknown", observed: 1, yes: 0 }]);
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

  it("does not run at all when the events could not be read", () => {
    // A claim our events WOULD refute, with the lookup failed. It must fail
    // open — an outage that refuted everything would look like a quiet, healthy
    // day — but the caller has to be able to tell that apart from a clean check.
    const refutable = "the user clicked 'Unlock full report', which looped them back";
    expect(contradiction(refutable, new Set(["pageview", "$autocapture"]))).toMatch(/unlock click/);
    expect(contradiction(refutable, null)).toBeNull();
  });

  it("keeps null and the empty set as different answers", () => {
    // They were the same value until 2026-09-17: every failure became an empty
    // set, so the refusal gate switched itself off with no trace and the SAME
    // finding came back refuted on one run and reproduced on the next.
    expect(contradiction("anything at all", null)).toBeNull();
    expect(contradiction("anything at all", new Set())).toBeNull();
    // The distinction is only useful if the TYPE admits it, which is what a
    // caller branches on.
    expect(new Set().size === 0 && null === null).toBe(true);
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
    // null, not an empty set: nothing was read, and the caller must not be
    // able to mistake that for "this session has no events".
    await expect(fetchSessionEvents("' OR 1=1 --")).resolves.toBeNull();
    expect(called, "a malformed id must never reach the query").toBe(false);
  });

  it("reports that it could not read, rather than reporting no events", async () => {
    // It used to return an empty set here, which contradiction() then treated
    // as "cannot check" — the right behaviour reached by a route that erased
    // the reason. A caller could not tell an outage from a clean check, so the
    // refusal gate could switch itself off for a run and say nothing.
    vi.stubEnv("POSTHOG_API_KEY", "phx_test");
    vi.stubGlobal("fetch", async () => {
      throw new Error("network down");
    });
    await expect(fetchSessionEvents("01a09e04-dfaa-7a3e-9622-0d7ca5285017")).resolves.toBeNull();
  });

  it("retries once before giving up, like its sibling lookups", async () => {
    // The measurement that justified the retry was taken on THIS query: the
    // 330-event session timed at 526, 82, 71, 3433, 72, 1577, 80, 84, 79, 77 ms.
    // It was the only one of the three left on a single 8s attempt.
    vi.stubEnv("POSTHOG_API_KEY", "phx_test");
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      if (calls === 1) throw new Error("timeout");
      return {
        ok: true,
        json: async () => ({ results: [["unlock_click"]] }),
      } as unknown as Response;
    });
    await expect(fetchSessionEvents("01a09e04-dfaa-7a3e-9622-0d7ca5285017")).resolves.toEqual(
      new Set(["unlock_click"])
    );
    expect(calls, "one retry, so a single timeout does not disable the gate").toBe(2);
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

/**
 * A CHALLENGER MUST NOT SPEAK TO THE TEAM, AND THE DIGEST IS PART OF "THE TEAM".
 *
 * The verifier already refuses to post a challenger's verdicts or open its
 * pull requests. The digest reads PostHog and the ledger directly and had no
 * notion of role, so the first challenger — created 2026-09-20 on the same
 * trigger event as its champion — rendered a second bullet:
 *
 *     • The report — watched 85, suspected 27
 *     • The report — watched  3, suspected  0
 *
 * Two lines, the same label, different numbers, in the one message written for
 * someone who does not read the code. Caught by rendering the real digest
 * against production data before it sent, not by a test.
 */
describe("the digest ignores challenger scanners", () => {
  const CHALLENGER = "LoveIQ report UX (challenger: observation only)";

  it("knows which scanners are experiments", () => {
    // Recognised from the NAME, so it still holds after a challenger is
    // retired from scanners.ts while its ledger rows and events remain.
    expect(isChallengerScanner(CHALLENGER)).toBe(true);
    expect(isChallengerScanner("Anything At All (challenger: something else)")).toBe(true);
    expect(isChallengerScanner("LoveIQ report UX")).toBe(false);
    // Not a challenger merely for containing the word.
    expect(isChallengerScanner("Challenger deep dive")).toBe(false);
    // An unknown scanner is PRODUCTION. Defaulting the other way would let a
    // scanner missing from git vanish from the digest silently; drift already
    // alerts on that, and hiding it here would mask the alert.
    expect(isChallengerScanner("Something nobody pinned")).toBe(false);
    expect(isChallengerScanner(null)).toBe(false);
  });

  it("drops its bullet from the daily counts", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      json: async () => ({
        results: [
          ["LoveIQ report UX", 85, 27],
          [CHALLENGER, 3, 0],
        ],
      }),
    }));
    vi.stubEnv("POSTHOG_API_KEY", "phx_test");
    const rows = await fetchDailyStats();
    expect(rows.map((r) => r.scanner)).toEqual(["LoveIQ report UX"]);
  });

  it("keeps its verdicts out of the numbers Marcus reads", async () => {
    // `undelivered` matters most: a challenger is undelivered BY DESIGN, so
    // unfiltered it reports the experiment working as verdicts reaching nobody.
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      json: async () => [
        { outcome: "clear", delivered: true, scanner_name: "LoveIQ report UX" },
        { outcome: "clear", delivered: false, scanner_name: CHALLENGER },
        { outcome: "reproduced", delivered: false, scanner_name: CHALLENGER },
      ],
    }));
    vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service_key");
    const v = await fetchVerificationStats();
    expect(v?.total).toBe(1);
    expect(v?.clear).toBe(1);
    expect(v?.reproduced).toBe(0);
    expect(v?.undelivered).toBe(0);
  });

  it("does not count a challenger-only observation as coverage", async () => {
    // Coverage exists to expose a gap. A challenger can be deleted tomorrow,
    // so counting its observations would report a reader as watched when the
    // scanner that speaks to the team never opened the recording.
    let hogql = "";
    vi.stubGlobal("fetch", async (_url: string, init: { body?: string }) => {
      const body = String(init?.body ?? "");
      if (body.includes("HogQLQuery")) {
        hogql = body;
        return { ok: true, json: async () => ({ results: [[1]] }) };
      }
      return {
        ok: true,
        json: async () => [{ posthog_session_id: "01a0b000-0000-7000-8000-000000000000" }],
      };
    });
    vi.stubEnv("POSTHOG_API_KEY", "phx_test");
    vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service_key");
    await fetchCoverageStats();
    // By convention, not by a name list: a retired challenger leaves
    // scanners.ts while its events stay in PostHog for another month.
    expect(hogql, "the coverage query must exclude challengers").toMatch(/NOT LIKE/);
    expect(hogql).toMatch(/\(challenger/);
  });
});

/**
 * A READ THAT CAME BACK EXACTLY FULL WAS CUT SHORT.
 *
 * These reads go straight to PostgREST, not through
 * `features/admin/server/supabase.ts`, so the max-rows guard that shouts about
 * this elsewhere does not cover them. PostgREST answers a truncated read with
 * 200 and a short body — no error, no flag — and the digest then reports a
 * coverage percentage or an outcome tally computed on a slice, with nothing
 * saying a slice is what it was.
 */
describe("a truncated read is never reported as a whole one", () => {
  const errors: unknown[] = [];
  const spyOnLogger = () =>
    vi.spyOn(logger, "error").mockImplementation(((...a: unknown[]) => {
      errors.push(a);
    }) as never);

  it("shouts when a read comes back exactly at its limit", () => {
    errors.length = 0;
    const spy = spyOnLogger();
    warnIfTruncated(new Array(500).fill(0), 500, "coverage: survey_submission");
    spy.mockRestore();
    expect(JSON.stringify(errors), "a full read must be reported as truncated").toMatch(
      /rows are MISSING/
    );
    // ERROR, not warn: only error and fatal are mirrored to Slack, so a warning
    // here reaches Vercel's log viewer and therefore nobody.
    expect(JSON.stringify(errors)).toMatch(/coverage: survey_submission/);
  });

  it("stays quiet on a read comfortably under the limit", () => {
    // Otherwise the guard cries wolf every healthy day and gets muted, which
    // is worse than not having it.
    errors.length = 0;
    const spy = spyOnLogger();
    warnIfTruncated(new Array(499).fill(0), 500, "coverage: survey_submission");
    warnIfTruncated([], 500, "verification: ux_finding");
    spy.mockRestore();
    expect(errors).toEqual([]);
  });

  it("is actually wired to the reads that can truncate", () => {
    /**
     * The function existing proves nothing. A mutation deleting the CALL at the
     * coverage read left every assertion above green — the guard would have
     * been dead code shipping a false sense of safety.
     *
     * Both PostgREST reads in this file state their own `limit` and neither
     * goes through the max-rows guard in features/admin/server/supabase.ts, so
     * both must be checked here.
     */
    const src = readFileSync(resolve(process.cwd(), "features/ux-review/server/review.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    // Matches a literal `&limit=500` AND a `&limit=${LIMIT}`. Digits-only
    // under-counts the limited reads, so an unguarded templated one would slip
    // through the very check that exists to find it.
    const limitedReads = src.match(/&limit=(?:\d+|\$\{[^}]+\})/g) ?? [];
    const calls = src.match(/warnIfTruncated\(/g) ?? [];
    expect(limitedReads.length, "there should be limited reads to guard").toBeGreaterThan(0);
    // One call per limited read, plus the declaration itself.
    expect(calls.length - 1, "every limited read must be guarded").toBe(limitedReads.length);
  });

  it("also fires when a read somehow exceeds its own limit", () => {
    errors.length = 0;
    const spy = spyOnLogger();
    warnIfTruncated(new Array(501).fill(0), 500, "verification: ux_finding");
    spy.mockRestore();
    expect(JSON.stringify(errors)).toMatch(/rows are MISSING/);
  });
});

/**
 * THE WEEKLY SCORECARD.
 *
 * `score.mjs --ledger` computes all of this and prints it into a CI log.
 * Nobody reads CI logs — that is the failure mode behind most of what went
 * wrong in this pipeline, and a champion/challenger experiment whose result
 * lands there is the same mistake with a nicer name.
 */
describe("the scanner scorecard", () => {
  const sc = (scanner: string, right: number, wrong: number, contradicted = 0) => ({
    scanner,
    right,
    wrong,
    contradicted,
  });
  const render = (scores: Parameters<typeof buildScorecardMessage>[0]) =>
    JSON.stringify(buildScorecardMessage(scores, 30).blocks);

  it("never prints two lines with the same name", () => {
    // `plainScanner` maps a challenger and its champion to the SAME words, so
    // without a distinguishing suffix the reader sees "The report" twice with
    // different numbers. That exact shape reached Marcus once already.
    const out = render([
      sc("LoveIQ report UX", 0, 41, 21),
      sc("LoveIQ report UX (challenger: observation only)", 0, 1),
    ]);
    expect(out).toContain("new version being tested");
    expect(out.match(/The report/g)?.length, "the champion and trial must read differently").toBe(
      (out.match(/The report — new version/g)?.length ?? 0) + 2
    );
  });

  it("uses no internal names", () => {
    // "our own dead_click events" is the scanner_name in the database. It is
    // not a phrase for a message written for someone who does not read code.
    const out = render([sc("our own dead_click events", 0, 6)]);
    expect(out).toContain("Taps our own code recorded");
    expect(out).not.toContain("dead_click");
  });

  it("does not invite a decision before the trial has a sample", () => {
    const out = render([
      sc("LoveIQ report UX", 0, 41, 21),
      sc("LoveIQ report UX (challenger: observation only)", 0, 1),
    ]);
    expect(out).toContain("1 of the 30 results needed");
    expect(out, "no verdict may be implied at n=1").not.toContain("Trial result");
  });

  it("reports the comparison once the trial has enough", () => {
    const out = render([
      sc("LoveIQ report UX", 0, 41, 21),
      sc("LoveIQ report UX (challenger: observation only)", 6, 24, 1),
    ]);
    expect(out).toContain("Trial result");
    expect(out, "the refutation counts are the point of the experiment").toContain("1 times");
  });

  it("leaves the challenger out of the headline total", () => {
    // The headline is what the LIVE checks are worth. Folding an experiment in
    // would make the number move when nothing about the product changed.
    const out = buildScorecardMessage(
      [sc("LoveIQ report UX", 1, 9), sc("LoveIQ report UX (challenger: observation only)", 9, 1)],
      30
    );
    expect(out.text).toContain("1 of 10");
  });

  it("says so plainly when there is nothing to report", () => {
    expect(render([])).toContain("No checks have been scored yet");
  });
});
