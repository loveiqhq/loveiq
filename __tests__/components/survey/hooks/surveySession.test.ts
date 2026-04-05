// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSessionId } from "@/components/survey/hooks/surveySession";

describe("surveySession", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates and stores a session id when one does not exist", () => {
    const randomUuid = vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("session-123");

    expect(getSessionId()).toBe("session-123");
    expect(sessionStorage.getItem("loveiq-survey-session")).toBe("session-123");
    expect(randomUuid).toHaveBeenCalledTimes(1);
  });

  it("reuses the existing session id from session storage", () => {
    sessionStorage.setItem("loveiq-survey-session", "existing-session");
    const randomUuid = vi.spyOn(globalThis.crypto, "randomUUID");

    expect(getSessionId()).toBe("existing-session");
    expect(randomUuid).not.toHaveBeenCalled();
  });
});
