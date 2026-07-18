// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { getGaMeasurementContext } from "@features/analytics/client";

const clearCookies = () => {
  for (const name of ["_ga", "_ga_QTYY69L46N", "cookieyes-consent"]) {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
};

const setConsent = (analytics: boolean) => {
  document.cookie = `cookieyes-consent=consent:yes,necessary:yes,analytics:${
    analytics ? "yes" : "no"
  }; path=/`;
};

describe("getGaMeasurementContext", () => {
  afterEach(clearCookies);

  it("parses client_id (last two segments of _ga) and session_id (3rd of _ga_<id>)", () => {
    document.cookie = "_ga=GA1.1.123456789.1600000000; path=/";
    document.cookie = "_ga_QTYY69L46N=GS1.1.1600000000.1.1.1600000123.0.0.0; path=/";
    setConsent(true);

    const ctx = getGaMeasurementContext();
    expect(ctx.clientId).toBe("123456789.1600000000");
    expect(ctx.sessionId).toBe("1600000000");
    expect(ctx.consent).toBe(true);
  });

  it("returns null ids when the GA cookies are absent", () => {
    setConsent(true);
    const ctx = getGaMeasurementContext();
    expect(ctx.clientId).toBeNull();
    expect(ctx.sessionId).toBeNull();
    expect(ctx.consent).toBe(true);
  });

  it("reports consent=false when analytics consent was declined", () => {
    document.cookie = "_ga=GA1.1.123456789.1600000000; path=/";
    setConsent(false);
    const ctx = getGaMeasurementContext();
    expect(ctx.clientId).toBe("123456789.1600000000");
    expect(ctx.consent).toBe(false);
  });

  it("returns clientId null for a malformed _ga cookie", () => {
    document.cookie = "_ga=broken; path=/";
    setConsent(true);
    expect(getGaMeasurementContext().clientId).toBeNull();
  });
});
