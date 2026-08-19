// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  finalizeReportSession,
  getReportPaywallDeadline,
  peekReportPaywallDeadline,
  REPORT_PAYWALL_COUNTDOWN_MS,
  REPORT_PAYWALL_DEADLINE_PREFIX,
  getReportPricingSessionId,
  REPORT_SESSION_KEY,
  REPORT_PRICING_SESSION_PREFIX,
  SURVEY_SESSION_KEY,
  copySurveySessionToReportSession,
  getReportSessionId,
  getSessionId,
  setReportPricingSessionId,
  setReportSessionId,
} from "@features/survey/ui/hooks/surveySession";

describe("surveySession", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates and stores a session id when one does not exist", () => {
    const randomUuid = vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("session-123");

    expect(getSessionId()).toBe("session-123");
    expect(sessionStorage.getItem(SURVEY_SESSION_KEY)).toBe("session-123");
    expect(randomUuid).toHaveBeenCalledTimes(1);
  });

  it("reuses the existing session id from session storage", () => {
    sessionStorage.setItem(SURVEY_SESSION_KEY, "existing-session");
    const randomUuid = vi.spyOn(globalThis.crypto, "randomUUID");

    expect(getSessionId()).toBe("existing-session");
    expect(randomUuid).not.toHaveBeenCalled();
  });

  it("copies the survey session into report storage", () => {
    sessionStorage.setItem(SURVEY_SESSION_KEY, "existing-session");

    expect(copySurveySessionToReportSession()).toBe("existing-session");
    expect(localStorage.getItem(REPORT_SESSION_KEY)).toBe("existing-session");
  });

  it("prefers the active survey session when loading the report", () => {
    setReportSessionId("report-session");
    sessionStorage.setItem(SURVEY_SESSION_KEY, "survey-session");

    expect(getReportSessionId()).toBe("survey-session");
    expect(localStorage.getItem(REPORT_SESSION_KEY)).toBe("survey-session");
  });

  it("falls back to the saved report session when no active survey session exists", () => {
    setReportSessionId("report-session");

    expect(getReportSessionId()).toBe("report-session");
  });

  it("falls back to the survey session and promotes it when no report session exists", () => {
    sessionStorage.setItem(SURVEY_SESSION_KEY, "survey-session");

    expect(getReportSessionId()).toBe("survey-session");
    expect(localStorage.getItem(REPORT_SESSION_KEY)).toBe("survey-session");
  });

  it("finalizes the report session and clears the matching survey session", () => {
    sessionStorage.setItem(SURVEY_SESSION_KEY, "survey-session");
    localStorage.setItem(REPORT_SESSION_KEY, "stale-report-session");

    finalizeReportSession("survey-session");

    expect(localStorage.getItem(REPORT_SESSION_KEY)).toBe("survey-session");
    expect(sessionStorage.getItem(SURVEY_SESSION_KEY)).toBeNull();
  });

  it("creates and reuses a pricing session id per report session context", () => {
    const randomUuid = vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("pricing-123");

    expect(getReportPricingSessionId({ sessionId: "02d88f31-eceb-4402-940d-c8cd98d01848" })).toBe(
      "pricing-123"
    );
    expect(
      sessionStorage.getItem(
        `${REPORT_PRICING_SESSION_PREFIX}:session:02d88f31-eceb-4402-940d-c8cd98d01848`
      )
    ).toBe("pricing-123");
    expect(getReportPricingSessionId({ sessionId: "02d88f31-eceb-4402-940d-c8cd98d01848" })).toBe(
      "pricing-123"
    );
    expect(randomUuid).toHaveBeenCalledTimes(1);
  });

  it("isolates pricing session ids for token-based report access", () => {
    const randomUuid = vi
      .spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValueOnce("pricing-token")
      .mockReturnValueOnce("pricing-session");

    expect(getReportPricingSessionId({ token: "rpt_ABCDEFGHIJKLMNOPQRST" })).toBe("pricing-token");
    expect(getReportPricingSessionId({ sessionId: "02d88f31-eceb-4402-940d-c8cd98d01848" })).toBe(
      "pricing-session"
    );
    expect(randomUuid).toHaveBeenCalledTimes(2);
  });

  it("setReportPricingSessionId overwrites the stored id for a token context", () => {
    sessionStorage.setItem(
      `${REPORT_PRICING_SESSION_PREFIX}:token:rpt_ABCDEFGHIJKLMNOPQRST`,
      "old-id"
    );

    setReportPricingSessionId({
      token: "rpt_ABCDEFGHIJKLMNOPQRST",
      pricingSessionId: "url-supplied-id",
    });

    expect(
      sessionStorage.getItem(`${REPORT_PRICING_SESSION_PREFIX}:token:rpt_ABCDEFGHIJKLMNOPQRST`)
    ).toBe("url-supplied-id");
    expect(getReportPricingSessionId({ token: "rpt_ABCDEFGHIJKLMNOPQRST" })).toBe(
      "url-supplied-id"
    );
  });

  it("setReportPricingSessionId stores against the session-id context when no token present", () => {
    setReportPricingSessionId({
      sessionId: "02d88f31-eceb-4402-940d-c8cd98d01848",
      pricingSessionId: "from-email",
    });

    expect(
      sessionStorage.getItem(
        `${REPORT_PRICING_SESSION_PREFIX}:session:02d88f31-eceb-4402-940d-c8cd98d01848`
      )
    ).toBe("from-email");
  });

  it("setReportPricingSessionId silently no-ops when neither token nor session id is supplied", () => {
    setReportPricingSessionId({ pricingSessionId: "orphan" });
    // No storage key can be formed; nothing should be written.
    expect(sessionStorage.length).toBe(0);
  });
});

/**
 * The urgency clock is three minutes long and, since 2026-08-19, is STARTED by the
 * report rather than by page load — it arms on reaching the first paywalled
 * chapter, the same moment the plans pop-up arms. That split is why there are two
 * readers: `peek` reports a clock that is already running, `get` starts one.
 */
describe("report paywall countdown deadline", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("runs for three minutes", () => {
    expect(REPORT_PAYWALL_COUNTDOWN_MS).toBe(3 * 60 * 1_000);
  });

  it("peek does not start the clock", () => {
    expect(peekReportPaywallDeadline({ token: "rpt_x" })).toBeNull();
    // The important half: peeking must not have written anything, or every page
    // load would anchor the countdown again.
    expect(sessionStorage.length).toBe(0);
  });

  it("arming stores a deadline three minutes out, and peek then sees it", () => {
    const before = Date.now();
    const armed = getReportPaywallDeadline({ token: "rpt_x" });

    expect(armed).toBeGreaterThanOrEqual(before + REPORT_PAYWALL_COUNTDOWN_MS);
    expect(armed).toBeLessThanOrEqual(Date.now() + REPORT_PAYWALL_COUNTDOWN_MS);
    expect(sessionStorage.getItem(`${REPORT_PAYWALL_DEADLINE_PREFIX}:token:rpt_x`)).toBe(
      String(armed)
    );
    expect(peekReportPaywallDeadline({ token: "rpt_x" })).toBe(armed);
  });

  it("re-arming keeps the running clock instead of granting a fresh three minutes", () => {
    const armed = getReportPaywallDeadline({ token: "rpt_x" });
    expect(getReportPaywallDeadline({ token: "rpt_x" })).toBe(armed);
  });

  it("keeps an already-elapsed deadline, so the countdown cannot be farmed", () => {
    const past = Date.now() - 5_000;
    sessionStorage.setItem(`${REPORT_PAYWALL_DEADLINE_PREFIX}:token:rpt_x`, String(past));

    expect(peekReportPaywallDeadline({ token: "rpt_x" })).toBe(past);
    expect(getReportPaywallDeadline({ token: "rpt_x" })).toBe(past);
  });

  it("keys per report, so a second report starts its own clock", () => {
    const first = getReportPaywallDeadline({ token: "rpt_a" });
    // Not armed by the first report's clock...
    expect(peekReportPaywallDeadline({ token: "rpt_b" })).toBeNull();

    getReportPaywallDeadline({ token: "rpt_b" });
    // ...and arming it leaves the first report's clock exactly where it was. (The
    // two epoch values can be equal to the millisecond in a test, so the entries
    // are what this asserts, not the numbers.)
    expect(sessionStorage.getItem(`${REPORT_PAYWALL_DEADLINE_PREFIX}:token:rpt_b`)).not.toBeNull();
    expect(peekReportPaywallDeadline({ token: "rpt_a" })).toBe(first);
  });

  it("falls back to session id, and to an unpersisted window with no key at all", () => {
    const bySession = getReportPaywallDeadline({ sessionId: "sess-1" });
    expect(sessionStorage.getItem(`${REPORT_PAYWALL_DEADLINE_PREFIX}:session:sess-1`)).toBe(
      String(bySession)
    );

    // No token and no session: the countdown still works, it just cannot persist.
    expect(peekReportPaywallDeadline({})).toBeNull();
    expect(getReportPaywallDeadline({})).toBeGreaterThan(Date.now());
    expect(sessionStorage.getItem(`${REPORT_PAYWALL_DEADLINE_PREFIX}:token:null`)).toBeNull();
  });
});
