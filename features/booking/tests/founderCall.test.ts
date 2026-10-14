import { afterEach, describe, expect, it, vi } from "vitest";
import { getFounderCallUrl } from "@features/booking/logic/founderCall";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getFounderCallUrl", () => {
  it("is off when the booking page is not configured", () => {
    vi.stubEnv("NEXT_PUBLIC_FOUNDER_CALL_URL", "");
    expect(getFounderCallUrl()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_FOUNDER_CALL_URL", "   ");
    expect(getFounderCallUrl()).toBeNull();
  });

  it("accepts a Google Calendar booking page, on either of Google's hosts", () => {
    vi.stubEnv("NEXT_PUBLIC_FOUNDER_CALL_URL", "https://calendar.app.google/AbC123xyz");
    expect(getFounderCallUrl()).toBe("https://calendar.app.google/AbC123xyz");
    vi.stubEnv(
      "NEXT_PUBLIC_FOUNDER_CALL_URL",
      "  https://calendar.google.com/calendar/appointments/schedules/AcZssZ1 "
    );
    expect(getFounderCallUrl()).toBe(
      "https://calendar.google.com/calendar/appointments/schedules/AcZssZ1"
    );
  });

  it("refuses anything that is not https", () => {
    vi.stubEnv("NEXT_PUBLIC_FOUNDER_CALL_URL", "http://calendar.app.google/AbC123xyz");
    expect(getFounderCallUrl()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_FOUNDER_CALL_URL", "javascript:alert(1)");
    expect(getFounderCallUrl()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_FOUNDER_CALL_URL", "not a url");
    expect(getFounderCallUrl()).toBeNull();
  });

  it("refuses other booking tools and look-alike hosts", () => {
    vi.stubEnv("NEXT_PUBLIC_FOUNDER_CALL_URL", "https://calendly.com/loveiq/20min");
    expect(getFounderCallUrl()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_FOUNDER_CALL_URL", "https://calendar.app.google.example.com/x");
    expect(getFounderCallUrl()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_FOUNDER_CALL_URL", "https://evil.example/calendar.app.google/x");
    expect(getFounderCallUrl()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_FOUNDER_CALL_URL", "https://user@calendar.app.google/x");
    expect(getFounderCallUrl()).toBeNull();
  });
});
