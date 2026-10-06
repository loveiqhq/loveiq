// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { GLOBAL_UTM_KEY } from "@shared/url/utm";
import { UTM_STORAGE_KEY } from "@features/survey/ui/hooks/useUtmCapture";
import {
  PENDING_COMPLETION_KEY,
  SURVEY_INDEX_KEY,
  SURVEY_STATE_KEY,
  SURVEY_STEP_KEY,
  clearPendingCompletion,
  clearPersistedSurveyState,
  loadPendingCompletion,
  savePendingCompletion,
  type PendingSurveyCompletion,
  SURVEY_CONSENT_KEY,
  __resetSurveyConsentForTests,
  hasSurveyConsent,
  recordSurveyConsent,
} from "@features/survey/ui/hooks/surveyStorage";

const payload: PendingSurveyCompletion = {
  sessionId: "550e8400-e29b-41d4-a716-446655440000",
  email: "alice@example.com",
  firstName: "Alice",
  answers: { q1: "yes" },
  startedAt: "2026-04-05T10:00:00.000Z",
  durationMs: 120000,
  utmTracker: '{"utm_source":"google"}',
  currentIndex: 3,
  savedAt: "2026-04-05T10:02:00.000Z",
};

describe("surveyStorage", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("saves and loads pending completion payloads", () => {
    savePendingCompletion(payload);

    expect(loadPendingCompletion()).toEqual(payload);
  });

  it("returns null for invalid or incomplete pending completion data", () => {
    localStorage.setItem(PENDING_COMPLETION_KEY, "not-json");
    expect(loadPendingCompletion()).toBeNull();

    localStorage.setItem(
      PENDING_COMPLETION_KEY,
      JSON.stringify({ sessionId: "only-session", email: "missing-started-at@example.com" })
    );
    expect(loadPendingCompletion()).toBeNull();
  });

  it("clears pending completion state", () => {
    savePendingCompletion(payload);

    clearPendingCompletion();

    expect(localStorage.getItem(PENDING_COMPLETION_KEY)).toBeNull();
  });

  it("clears persisted survey state while keeping pending completion by default", () => {
    localStorage.setItem(SURVEY_STATE_KEY, '{"answers":{"q1":"yes"}}');
    localStorage.setItem(SURVEY_INDEX_KEY, "2");
    localStorage.setItem(UTM_STORAGE_KEY, "legacy-utm");
    localStorage.setItem(GLOBAL_UTM_KEY, "global-utm");
    localStorage.setItem(PENDING_COMPLETION_KEY, JSON.stringify(payload));
    sessionStorage.setItem(SURVEY_STEP_KEY, "5");
    sessionStorage.setItem("loveiq-survey-session", "session-123");
    localStorage.setItem("loveiq-survey-session", "session-123");

    clearPersistedSurveyState();

    expect(localStorage.getItem(SURVEY_STATE_KEY)).toBeNull();
    expect(localStorage.getItem(SURVEY_INDEX_KEY)).toBeNull();
    expect(localStorage.getItem(UTM_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(GLOBAL_UTM_KEY)).toBeNull();
    expect(localStorage.getItem(PENDING_COMPLETION_KEY)).not.toBeNull();
    expect(sessionStorage.getItem(SURVEY_STEP_KEY)).toBeNull();
    expect(sessionStorage.getItem("loveiq-survey-session")).toBeNull();
    // The session id is mirrored into localStorage so it outlives a closed tab for as
    // long as the draft does. Clearing the draft must take the mirror, or the next
    // survey on this browser resumes a dead id.
    expect(localStorage.getItem("loveiq-survey-session")).toBeNull();
  });

  it("optionally clears the pending completion record too", () => {
    localStorage.setItem(PENDING_COMPLETION_KEY, JSON.stringify(payload));

    clearPersistedSurveyState({ clearPendingCompletion: true });

    expect(localStorage.getItem(PENDING_COMPLETION_KEY)).toBeNull();
  });

  it("can preserve the survey session for report handoff cleanup", () => {
    sessionStorage.setItem(SURVEY_STEP_KEY, "5");
    sessionStorage.setItem("loveiq-survey-session", "session-123");
    localStorage.setItem("loveiq-survey-session", "session-123");

    clearPersistedSurveyState({ clearSurveySession: false });

    expect(sessionStorage.getItem(SURVEY_STEP_KEY)).toBeNull();
    // The tab keeps its id for the handoff...
    expect(sessionStorage.getItem("loveiq-survey-session")).toBe("session-123");
    // ...but the mirror goes with the draft, so no later tab resumes a finished run (#375).
    expect(localStorage.getItem("loveiq-survey-session")).toBeNull();
  });
});

describe("isCompletionReady with a landing-prefilled question", () => {
  it("recognises a finished survey even though currentIndex stops one short", async () => {
    const { isCompletionReady, SURVEY_TOTAL_QUESTIONS } =
      await import("@features/survey/server/utils");
    // Everything answered, but one question was answered on the landing page so
    // it never appeared in the flow — the index tops out at total - 1.
    const answers: Record<string, string> = { "00000": "someone@example.test" };
    for (let i = 1; i < SURVEY_TOTAL_QUESTIONS; i++) answers[`q${i}`] = "x";
    expect(Object.keys(answers)).toHaveLength(SURVEY_TOTAL_QUESTIONS);

    expect(isCompletionReady(SURVEY_TOTAL_QUESTIONS - 1, answers)).toBe(true);
    // Still gated on the email, and still false for a genuine mid-survey drop-off.
    expect(isCompletionReady(SURVEY_TOTAL_QUESTIONS - 1, { "00000": "" })).toBe(false);
    expect(isCompletionReady(3, { "00000": "someone@example.test" })).toBe(false);
  });
});

describe("survey consent record", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetSurveyConsentForTests();
  });

  it("is cleared with the run it was given for", () => {
    recordSurveyConsent();
    expect(hasSurveyConsent()).toBe(true);

    clearPersistedSurveyState({ clearPendingCompletion: true });

    expect(localStorage.getItem(SURVEY_CONSENT_KEY)).toBeNull();
    expect(hasSurveyConsent()).toBe(false);
  });

  it("is still held for this page when the browser refuses storage", () => {
    const real = window.localStorage;
    const boom = () => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    };
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => ({ getItem: boom, setItem: boom, removeItem: boom, clear: boom, key: boom }),
    });
    try {
      expect(hasSurveyConsent()).toBe(false);
      recordSurveyConsent();
      expect(hasSurveyConsent()).toBe(true);
    } finally {
      Object.defineProperty(window, "localStorage", { configurable: true, value: real });
    }
  });
});
