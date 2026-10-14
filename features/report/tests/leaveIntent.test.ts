// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FIRST_VISIT_WINDOW_MS,
  POPUP_POINT_QUIET_MS,
  chooseLeaveOffer,
  findOpenOverlay,
  hasReturnMarkers,
  isFirstVisit,
  isInsidePopupWindow,
  leaveMode,
  leaveOfferKey,
  parseReportDate,
  popupPointKey,
  resolveLeaveOverride,
} from "@features/report/logic/leaveIntent";

afterEach(() => {
  vi.unstubAllEnvs();
  document.body.innerHTML = "";
  document.documentElement.style.removeProperty("--liq-consent-h");
});

const NOW = Date.parse("2026-10-14T10:00:00.000Z");
const params = (qs = "") => new URLSearchParams(qs);

describe("resolveLeaveOverride", () => {
  it("forces the offer on, off or open off production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://staging.loveiq.org");
    expect(resolveLeaveOverride("on")).toBe("on");
    expect(resolveLeaveOverride("off")).toBe("off");
    expect(resolveLeaveOverride("show")).toBe("show");
    expect(resolveLeaveOverride("bogus")).toBeNull();
    expect(resolveLeaveOverride(null)).toBeNull();
  });

  it("is ignored on production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.loveiq.org");
    expect(resolveLeaveOverride("on")).toBeNull();
    expect(resolveLeaveOverride("show")).toBeNull();
  });
});

describe("hasReturnMarkers", () => {
  it("is false for the plain report address the survey sends the tab to", () => {
    expect(hasReturnMarkers(params())).toBe(false);
    expect(hasReturnMarkers(params("v4=1&preview=1"))).toBe(false);
  });

  it.each([
    "offer=1",
    "promo=LIQ-100-abcdefgh",
    "pricingSessionId=0b6f",
    "invite=1",
    "from=email",
    "utm_source=email",
    "utm_source=loveiq_email",
    "utm_medium=email",
    "utm_medium=Nurture",
  ])("treats %s as a return visit", (qs) => {
    expect(hasReturnMarkers(params(qs))).toBe(true);
  });

  it("does not count an ad click as a return visit", () => {
    expect(hasReturnMarkers(params("utm_source=google&utm_medium=cpc"))).toBe(false);
  });
});

describe("parseReportDate", () => {
  it("reads the database's microsecond timestamps", () => {
    expect(parseReportDate("2026-10-14T09:00:00.851299+00:00")).toBe(
      Date.parse("2026-10-14T09:00:00.851Z")
    );
    expect(parseReportDate("2026-10-14 09:00:00.851299+00")).toBe(
      Date.parse("2026-10-14T09:00:00.851Z")
    );
    expect(parseReportDate("2026-05-07T12:00:00.000Z")).toBe(Date.parse("2026-05-07T12:00:00Z"));
  });

  it("gives null for nothing or nonsense", () => {
    expect(parseReportDate(null)).toBeNull();
    expect(parseReportDate(undefined)).toBeNull();
    expect(parseReportDate("")).toBeNull();
    expect(parseReportDate("yesterday")).toBeNull();
  });
});

describe("isFirstVisit", () => {
  const base = {
    urlToken: "rpt_abc",
    completedToken: "rpt_abc",
    reportDate: new Date(NOW - 10 * 60 * 1000).toISOString(),
    now: NOW,
    search: params(),
  };

  it("is the tab that finished the survey, soon after", () => {
    expect(isFirstVisit(base)).toBe(true);
  });

  it("is not another tab or another report", () => {
    expect(isFirstVisit({ ...base, completedToken: null })).toBe(false);
    expect(isFirstVisit({ ...base, completedToken: "rpt_other" })).toBe(false);
    expect(isFirstVisit({ ...base, urlToken: null })).toBe(false);
  });

  it("ends two hours after the report was made", () => {
    const at = (age: number) => new Date(NOW - age).toISOString();
    expect(isFirstVisit({ ...base, reportDate: at(FIRST_VISIT_WINDOW_MS) })).toBe(true);
    expect(isFirstVisit({ ...base, reportDate: at(FIRST_VISIT_WINDOW_MS + 1) })).toBe(false);
  });

  it("allows a little clock skew but not a date in the future", () => {
    expect(isFirstVisit({ ...base, reportDate: new Date(NOW + 60_000).toISOString() })).toBe(true);
    expect(
      isFirstVisit({ ...base, reportDate: new Date(NOW + 60 * 60 * 1000).toISOString() })
    ).toBe(false);
  });

  it("is not a first visit when the date cannot be read", () => {
    expect(isFirstVisit({ ...base, reportDate: "not a date" })).toBe(false);
    expect(isFirstVisit({ ...base, reportDate: null })).toBe(false);
  });

  it("is not a first visit when the address came from an email", () => {
    expect(isFirstVisit({ ...base, search: params("offer=1") })).toBe(false);
  });
});

describe("leaveMode", () => {
  const eligible = {
    override: null,
    bookingUrl: "https://calendar.app.google/x",
    isV4: true,
    viewMode: "owner" as const,
    hasPurchased: false,
    viewingOwnArchetype: true,
    submissionId: 42,
    userEmail: "reader@example.com",
    firstVisit: true,
    isProbe: false,
  };

  it("arms the trigger for an eligible reader", () => {
    expect(leaveMode(eligible)).toBe("trigger");
  });

  it.each([
    ["no booking page", { bookingUrl: null }],
    ["an older report", { isV4: false }],
    ["a shared report", { viewMode: "shared" as const }],
    ["a paying reader", { hasPurchased: true }],
    ["another archetype on screen", { viewingOwnArchetype: false }],
    ["no submission", { submissionId: null }],
    ["no email to send the code to", { userEmail: null }],
    ["a blank email", { userEmail: "  " }],
    ["a return visit", { firstVisit: false }],
    ["our own probe", { isProbe: true }],
    ["the preview switch set to off", { override: "off" as const }],
  ])("is off for %s", (_label, change) => {
    expect(leaveMode({ ...eligible, ...change })).toBe("off");
  });

  it("lets the preview switch skip who the reader is, not what they own", () => {
    const anonymousPreview = {
      ...eligible,
      submissionId: null,
      userEmail: null,
      firstVisit: false,
      isProbe: true,
    };
    expect(leaveMode({ ...anonymousPreview, override: "on" })).toBe("trigger");
    expect(leaveMode({ ...anonymousPreview, override: "show" })).toBe("show");
    expect(leaveMode({ ...anonymousPreview, override: "on", hasPurchased: true })).toBe("off");
    expect(leaveMode({ ...anonymousPreview, override: "show", bookingUrl: null })).toBe("off");
    expect(leaveMode({ ...anonymousPreview, override: "show", viewMode: "shared" })).toBe("off");
  });
});

describe("isInsidePopupWindow", () => {
  it("holds the offer back for 30 seconds after the pay pop-up point", () => {
    expect(isInsidePopupWindow(null, NOW)).toBe(false);
    expect(isInsidePopupWindow(NOW, NOW)).toBe(true);
    expect(isInsidePopupWindow(NOW - (POPUP_POINT_QUIET_MS - 1), NOW)).toBe(true);
    expect(isInsidePopupWindow(NOW - POPUP_POINT_QUIET_MS, NOW)).toBe(false);
  });
});

describe("findOpenOverlay", () => {
  it("is null on a bare page", () => {
    expect(findOpenOverlay(document)).toBeNull();
  });

  it("sees an open dialog, the invite modal and the phone feedback panel", () => {
    document.body.innerHTML = '<div role="dialog" aria-modal="true"></div>';
    expect(findOpenOverlay(document)).toBe("dialog");
    document.body.innerHTML = '<div data-invite-modal=""></div>';
    expect(findOpenOverlay(document)).toBe("invite");
    document.body.innerHTML = '<div class="report-fb__panel report-fb--expanded"></div>';
    expect(findOpenOverlay(document)).toBe("feedback");
  });

  it("ignores a closed dialog that stays in the page", () => {
    document.body.innerHTML = '<div role="dialog"></div>';
    expect(findOpenOverlay(document)).toBeNull();
  });

  it("sees the cookie banner and its settings window", () => {
    document.documentElement.style.setProperty("--liq-consent-h", "120px");
    expect(findOpenOverlay(document)).toBe("cookie_banner");
    document.documentElement.style.setProperty("--liq-consent-h", "0px");
    expect(findOpenOverlay(document)).toBeNull();
    document.body.innerHTML = '<div class="cky-modal cky-modal-open"></div>';
    expect(findOpenOverlay(document)).toBe("cookie_banner");
  });
});

describe("storage keys and the offer", () => {
  it("keys the offer and the pop-up point on the submission", () => {
    expect(leaveOfferKey(42)).toBe("loveiq-leave-offer:42");
    expect(popupPointKey(42)).toBe("loveiq-leave-offer-point:42");
  });

  it("offers the founder call", () => {
    expect(chooseLeaveOffer()).toBe("founder_call");
  });
});
