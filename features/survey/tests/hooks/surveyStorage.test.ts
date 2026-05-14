// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { GLOBAL_UTM_KEY } from "@/lib/utm";
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

    clearPersistedSurveyState();

    expect(localStorage.getItem(SURVEY_STATE_KEY)).toBeNull();
    expect(localStorage.getItem(SURVEY_INDEX_KEY)).toBeNull();
    expect(localStorage.getItem(UTM_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(GLOBAL_UTM_KEY)).toBeNull();
    expect(localStorage.getItem(PENDING_COMPLETION_KEY)).not.toBeNull();
    expect(sessionStorage.getItem(SURVEY_STEP_KEY)).toBeNull();
    expect(sessionStorage.getItem("loveiq-survey-session")).toBeNull();
  });

  it("optionally clears the pending completion record too", () => {
    localStorage.setItem(PENDING_COMPLETION_KEY, JSON.stringify(payload));

    clearPersistedSurveyState({ clearPendingCompletion: true });

    expect(localStorage.getItem(PENDING_COMPLETION_KEY)).toBeNull();
  });

  it("can preserve the survey session for report handoff cleanup", () => {
    sessionStorage.setItem(SURVEY_STEP_KEY, "5");
    sessionStorage.setItem("loveiq-survey-session", "session-123");

    clearPersistedSurveyState({ clearSurveySession: false });

    expect(sessionStorage.getItem(SURVEY_STEP_KEY)).toBeNull();
    expect(sessionStorage.getItem("loveiq-survey-session")).toBe("session-123");
  });
});
