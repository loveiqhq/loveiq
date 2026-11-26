// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ph = vi.hoisted(() => ({ capture: vi.fn(), register: vi.fn() }));
vi.mock("posthog-js", () => ({ default: ph }));
// Every gate open: production, and analytics consent (the dataLayer push needs it).
vi.mock("@shared/env/is-non-prod-deploy", async (orig) => ({
  ...(await orig<object>()),
  isProductionSite: () => true,
}));

import {
  trackLandingCardAnswer,
  trackOptInSheetClosed,
  trackOptInSheetShown,
} from "@features/analytics/client";

beforeEach(() => {
  ph.capture.mockClear();
  document.cookie = "cookieyes-consent=analytics:yes";
  window.dataLayer = [];
});
afterEach(() => {
  document.cookie = "cookieyes-consent=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
});

describe("an answer given to PostHog alone", () => {
  it("reaches PostHog with the point picked and its question, and Google's dataLayer without", () => {
    trackLandingCardAnswer({ location: "hero", changed: false, value: 6, question: "10003" });
    expect(ph.capture).toHaveBeenCalledWith("landing_card_answer", {
      location: "hero",
      changed: false,
      value: 6,
      question: "10003",
    });
    // The same event still reaches GA4 (the gates are open), as where and whether only.
    const pushed = (window.dataLayer as Record<string, unknown>[]).filter(
      (e) => e.event === "landing_card_answer"
    );
    expect(pushed).toEqual([{ event: "landing_card_answer", location: "hero", changed: false }]);
  });
});

describe("the opt-in's miss-out sheet closing", () => {
  afterEach(() => vi.useRealTimers());

  it("tells PostHog alone its outcome and how long it was open", () => {
    vi.useFakeTimers();
    trackOptInSheetShown();
    vi.advanceTimersByTime(2500);
    trackOptInSheetClosed({ outcome: "dismissed", via: "swipe" });
    expect(ph.capture).toHaveBeenLastCalledWith("survey_optin_sheet_closed", {
      question_id: "16015",
      outcome: "dismissed",
      via: "swipe",
      ms_open: 2500,
    });
    const pushed = (window.dataLayer as Record<string, unknown>[]).filter(
      (e) => e.event === "survey_optin_sheet_closed"
    );
    expect(pushed).toEqual([{ event: "survey_optin_sheet_closed", question_id: "16015" }]);
  });

  it("sends no time for a close with no opening on this page", () => {
    trackOptInSheetShown();
    trackOptInSheetClosed({ outcome: "not_now" });
    trackOptInSheetClosed({ outcome: "yes" });
    expect(ph.capture).toHaveBeenLastCalledWith("survey_optin_sheet_closed", {
      question_id: "16015",
      outcome: "yes",
    });
  });
});
