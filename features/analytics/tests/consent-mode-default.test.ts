import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Google Consent Mode v2 — the DEFAULT state, and its POSITION.
 *
 * CookieYes only sends `consent` UPDATE, and its own script is lazyOnload, so on
 * production that update landed at dataLayer index 7 — after the GA4 config
 * (index 2) and after the Google Ads config (index 5). Captured on
 * www.loveiq.org 2026-09-05 with a fresh browser profile:
 *
 *   0 gtm.js   1 ["js"]   2 config G-QTYY69L46N   3 gtm.dom   4 gtm.load
 *   5 config AW-18068690553   6 set developer_id   7 consent update (all denied)
 *
 * With no default declared, consent is UNSET for that whole window and gtag
 * treats unset as permission to store — `_gcl_au`, the Ads conversion-linker
 * cookie, was present before any consent click. Declaring denied-by-default is
 * also what lets Google MODEL the conversions of visitors who decline, which is
 * most buyers here (7 of 9 paid Stripe sessions since 2026-08-06 carried
 * `gaAnalyticsConsent=0`).
 *
 * These are source + ordering assertions on purpose. A test that only checked
 * that the call EXISTS would pass while somebody moved it below the configs,
 * which is the exact bug being fixed — position is the whole fix.
 */
const LAYOUT = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");

const CONSENT_DEFAULT = "window.gtag('consent', 'default'";

describe("Google Consent Mode default", () => {
  it("declares a default consent state at all", () => {
    expect(LAYOUT).toContain(CONSENT_DEFAULT);
  });

  it("denies every non-essential storage category by default", () => {
    const block = LAYOUT.slice(LAYOUT.indexOf(CONSENT_DEFAULT));
    for (const category of [
      "ad_storage",
      "ad_user_data",
      "ad_personalization",
      "analytics_storage",
      "functionality_storage",
      "personalization_storage",
    ]) {
      expect(block, `${category} must default to denied`).toMatch(
        new RegExp(`${category}:\\s*'denied'`)
      );
    }
    // security_storage is strictly necessary and is the one Google expects granted.
    expect(block).toMatch(/security_storage:\s*'granted'/);
  });

  it("gives the CMP time to answer before tags fire", () => {
    const block = LAYOUT.slice(LAYOUT.indexOf(CONSENT_DEFAULT));
    expect(block).toMatch(/wait_for_update:\s*\d+/);
  });

  it("runs before GTM, the gtag shim and BOTH tag configs", () => {
    const consentAt = LAYOUT.indexOf(CONSENT_DEFAULT);
    expect(consentAt).toBeGreaterThan(-1);

    for (const [label, marker] of [
      ["GTM container", "<GtmScript"],
      ["gtag shim", 'id="gtag-shim"'],
      ["GA4 config", "window.gtag('config', 'G-QTYY69L46N'"],
      ["Google Ads config", "window.gtag('config', 'AW-18068690553')"],
      ["CookieYes", 'id="cookieyes"'],
    ] as const) {
      const at = LAYOUT.indexOf(marker);
      expect(at, `${label} not found — update this guard`).toBeGreaterThan(-1);
      expect(
        consentAt,
        `the consent default must be pushed BEFORE ${label}, or the window where ` +
          `consent is unset reopens and ad cookies get written without permission`
      ).toBeLessThan(at);
    }
  });

  it("is loaded beforeInteractive, not deferred behind hydration", () => {
    const decl = LAYOUT.slice(
      LAYOUT.lastIndexOf("<Script", LAYOUT.indexOf('id="consent-default"')),
      LAYOUT.indexOf(CONSENT_DEFAULT)
    );
    expect(decl).toContain('strategy="beforeInteractive"');
  });
});
