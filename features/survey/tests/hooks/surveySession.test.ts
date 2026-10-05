// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COMPLETED_REPORT_KEY,
  completedReportToken,
  finalizeReportSession,
  forgetCompletedReport,
  rememberCompletedReport,
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
import {
  clearPersistedSurveyState,
  saveLandingPrefill,
} from "@features/survey/ui/hooks/surveyStorage";

describe("surveySession", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("the id a draft was saved under", () => {
    // The draft outlives the tab; the id lived only in sessionStorage, so a reader who
    // closed the tab resumed their answers under a new one (orphaned server draft, a
    // shuffle order recorded that they never saw). 6.3% of sessions start partway.
    const ID = "3f2b1c7a-9d4e-4f10-8b52-1a2c3d4e5f60";
    const closeTheTab = () => sessionStorage.clear();

    /** A tab with no id of its own takes one: here, a new one equal to ID. */
    const takeId = () => {
      vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValueOnce(ID);
      return getSessionId();
    };

    it("survives the tab while a draft does", () => {
      localStorage.setItem("loveiq-survey-answers", JSON.stringify({ q1: "a" }));
      expect(takeId()).toBe(ID);
      closeTheTab();
      expect(getSessionId()).toBe(ID);
    });

    // A finished run's id would answer a retake with the old submission (#375).
    it("is not reused without a draft", () => {
      takeId();
      closeTheTab();
      expect(getSessionId()).not.toBe(ID);
    });

    it("goes with the run", () => {
      localStorage.setItem("loveiq-survey-answers", JSON.stringify({ q1: "a" }));
      takeId();
      forgetCompletedReport();
      expect(localStorage.getItem(SURVEY_SESSION_KEY)).toBeNull();
      takeId();
      finalizeReportSession(ID);
      expect(localStorage.getItem(SURVEY_SESSION_KEY)).toBeNull();
    });

    // Kept after a submit (the tab keeps its id for the report), it was adopted by the next
    // run started from the homepage card in a new tab, and the server answered that run
    // with the finished one's submission (#375).
    it("goes with the draft at submit, so the next run from the card is a new session", () => {
      localStorage.setItem("loveiq-survey-answers", JSON.stringify({ q1: "a" }));
      takeId();
      clearPersistedSurveyState({ clearPendingCompletion: true, clearSurveySession: false });
      expect(localStorage.getItem(SURVEY_SESSION_KEY)).toBeNull();
      closeTheTab();
      saveLandingPrefill("01001", 4);
      expect(getSessionId()).not.toBe(ID);
    });

    it("is never adopted by a fresh draft from the homepage card", () => {
      // A leftover from a run whose clean-up never ran (closed mid-wizard).
      localStorage.setItem(SURVEY_SESSION_KEY, ID);
      saveLandingPrefill("01001", 4);
      expect(getSessionId()).not.toBe(ID);
    });

    // The engine calls getSessionId on every render; a finished tab keeps its id while its
    // wrap-up screens are up, so it must never write its id over or beside another draft.
    it("is never written by a tab that already has its id", () => {
      const OTHER = "9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
      localStorage.setItem("loveiq-survey-answers", JSON.stringify({ q1: "a" }));
      localStorage.setItem(SURVEY_SESSION_KEY, OTHER);
      sessionStorage.setItem(SURVEY_SESSION_KEY, ID);
      expect(getSessionId()).toBe(ID);
      expect(localStorage.getItem(SURVEY_SESSION_KEY)).toBe(OTHER);
    });

    it("never pairs a finished tab's id with a draft another tab started", () => {
      // This tab finished: it keeps its id, its draft and copy went at submit.
      sessionStorage.setItem(SURVEY_SESSION_KEY, ID);
      // Another tab starts a new run from the homepage card.
      saveLandingPrefill("01001", 4);
      // This tab's wrap-up screens render again.
      getSessionId();
      expect(localStorage.getItem(SURVEY_SESSION_KEY)).toBeNull();
      // The new run, reopened in a new tab, is a new session.
      closeTheTab();
      expect(getSessionId()).not.toBe(ID);
    });

    // localStorage is shared by every tab; the copy may be a draft's in another tab.
    it("is left alone when a report finishing in this tab belongs to another run", () => {
      const OTHER = "9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
      localStorage.setItem(SURVEY_SESSION_KEY, OTHER);
      sessionStorage.setItem(SURVEY_SESSION_KEY, ID);
      finalizeReportSession(ID);
      expect(localStorage.getItem(SURVEY_SESSION_KEY)).toBe(OTHER);
      sessionStorage.setItem(SURVEY_SESSION_KEY, ID);
      forgetCompletedReport();
      expect(localStorage.getItem(SURVEY_SESSION_KEY)).toBe(OTHER);
    });

    it("ignores a saved value that is not a session id", () => {
      localStorage.setItem("loveiq-survey-answers", JSON.stringify({ q1: "a" }));
      localStorage.setItem(SURVEY_SESSION_KEY, "s-123-old");
      expect(getSessionId()).not.toBe("s-123-old");
    });
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

describe("the completed-report marker", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("round-trips and can be forgotten", () => {
    expect(completedReportToken()).toBeNull();
    rememberCompletedReport("rpt_abc123");
    expect(completedReportToken()).toBe("rpt_abc123");
    forgetCompletedReport();
    expect(completedReportToken()).toBeNull();
  });

  it("forgetting it also drops the finished run's session id", () => {
    // A retake under the old id is answered with the old submission (#375).
    sessionStorage.setItem(SURVEY_SESSION_KEY, "finished-run");
    rememberCompletedReport("rpt_finished");
    forgetCompletedReport();
    expect(sessionStorage.getItem(SURVEY_SESSION_KEY)).toBeNull();
    expect(getSessionId()).not.toBe("finished-run");
  });

  it("ignores an empty token rather than marking the tab finished", () => {
    rememberCompletedReport("");
    expect(completedReportToken()).toBeNull();
  });

  it("is the same key scripts/probes/verify-survey-loop.mjs seeds", () => {
    // The probe reproduces the loop by putting the browser in the state a
    // finished tab is in, and it writes this key as a string literal. Rename
    // the constant alone and the probe keeps passing while testing nothing —
    // the same shape as a guard that matches a bare word.
    const probe = readFileSync(
      resolve(process.cwd(), "scripts/probes/verify-survey-loop.mjs"),
      "utf8"
    );
    expect(probe).toContain(`sessionStorage.setItem("${COMPLETED_REPORT_KEY}"`);
  });
});
