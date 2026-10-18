import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockNotifySlack = vi.fn();

vi.mock("@shared/observability/slack", () => ({
  notifySlack: (...args: unknown[]) => mockNotifySlack(...args),
}));

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  MAX_PRICE_CENTS,
  MIN_PRICE_CENTS,
  formatOfferAmount,
  formatOfferPrice,
  getOfferDefinition,
  isPayToStartOfferId,
  parsePriceCents,
} from "@features/pay-to-start/logic/offer";
import {
  CHECKOUT_SESSION_ID_REGEX,
  PAY_TO_START_WIZARD_SLIDES,
  PREPAID_COOKIE_DEV,
  PREPAID_COOKIE_PROD,
  readPrepaidToken,
} from "@features/pay-to-start/logic/journey";
import {
  PAY_TO_START_PRICE_ENV,
  __resetPriceAlertForTests,
  getPayToStartOffer,
} from "@features/pay-to-start/server/offer";

const TOKEN = `rpp_${"A1b2".repeat(8)}`;

describe("offer registry", () => {
  it("sells the full offer: survey + full report, at the Figma price by default", () => {
    const offer = getOfferDefinition("full");
    expect(offer.enabled).toBe(true);
    expect(offer.grant).toEqual({ kind: "report_plan", plan: "full_report" });
    expect(offer.defaultPriceCents).toBe(2900);
    expect(offer.wizard).toBe("pay_to_start");
    expect(offer.landingPath).toBe("/sexual-archetype");
  });

  it("registers the pre-unlock offer without selling it", () => {
    const offer = getOfferDefinition("pre");
    expect(offer.enabled).toBe(false);
    expect(offer.grant).toEqual({ kind: "pre_unlock" });
  });

  it("recognises only known offer ids", () => {
    expect(isPayToStartOfferId("full")).toBe(true);
    expect(isPayToStartOfferId("pre")).toBe(true);
    expect(isPayToStartOfferId("FULL")).toBe(false);
    expect(isPayToStartOfferId("__proto__")).toBe(false);
    expect(isPayToStartOfferId(undefined)).toBe(false);
  });
});

describe("parsePriceCents", () => {
  it("accepts whole cents in range, with surrounding spaces", () => {
    expect(parsePriceCents("2900")).toBe(2900);
    expect(parsePriceCents(" 1999 ")).toBe(1999);
    expect(parsePriceCents(String(MIN_PRICE_CENTS))).toBe(MIN_PRICE_CENTS);
    expect(parsePriceCents(String(MAX_PRICE_CENTS))).toBe(MAX_PRICE_CENTS);
  });

  it("refuses euros, decimals, signs, and anything out of range", () => {
    // "29" would be EUR 0.29: the most likely typo for "29 euros".
    for (const raw of ["29", "29.00", "2,900", "-2900", "+2900", "2900e0", "abc", "", "9901"]) {
      expect(parsePriceCents(raw)).toBeNull();
    }
    expect(parsePriceCents(null)).toBeNull();
    expect(parsePriceCents(undefined)).toBeNull();
  });
});

describe("price formatting", () => {
  it("shows whole euros without cents, as every price on the page reads", () => {
    expect(formatOfferPrice(2900)).toBe("€29");
    expect(formatOfferPrice(1999)).toBe("€19.99");
    expect(formatOfferPrice(1990)).toBe("€19.90");
  });

  it("always shows cents where an amount is quoted (the email)", () => {
    expect(formatOfferAmount(2900)).toBe("€29.00");
    expect(formatOfferAmount(1999)).toBe("€19.99");
  });
});

describe("getPayToStartOffer (the price setting)", () => {
  const original = process.env[PAY_TO_START_PRICE_ENV];

  beforeEach(() => {
    mockNotifySlack.mockReset();
    mockNotifySlack.mockResolvedValue(undefined);
    __resetPriceAlertForTests();
  });

  afterEach(() => {
    if (original === undefined) delete process.env[PAY_TO_START_PRICE_ENV];
    else process.env[PAY_TO_START_PRICE_ENV] = original;
  });

  it("uses the default when the setting is unset or blank", () => {
    delete process.env[PAY_TO_START_PRICE_ENV];
    expect(getPayToStartOffer().priceCents).toBe(2900);
    process.env[PAY_TO_START_PRICE_ENV] = "  ";
    expect(getPayToStartOffer().priceCents).toBe(2900);
    expect(mockNotifySlack).not.toHaveBeenCalled();
  });

  it("sells at the setting's price when it is valid", () => {
    process.env[PAY_TO_START_PRICE_ENV] = "1999";
    const offer = getPayToStartOffer();
    expect(offer.priceCents).toBe(1999);
    expect(offer.id).toBe("full");
  });

  it("falls back to the default on an invalid setting and alerts #ops once", () => {
    process.env[PAY_TO_START_PRICE_ENV] = "29";
    expect(getPayToStartOffer().priceCents).toBe(2900);
    expect(getPayToStartOffer().priceCents).toBe(2900);
    expect(mockNotifySlack).toHaveBeenCalledTimes(1);
    expect(mockNotifySlack.mock.calls[0]?.[0]).toMatchObject({
      channel: "ops",
      kind: "pts_price_setting_invalid",
    });
  });

  it("survives a failing Slack call", async () => {
    mockNotifySlack.mockRejectedValue(new Error("slack down"));
    process.env[PAY_TO_START_PRICE_ENV] = "free";
    expect(getPayToStartOffer().priceCents).toBe(2900);
    // Let the rejected promise settle: an unhandled rejection would fail the run.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("never applies the setting to the pre-unlock offer", () => {
    process.env[PAY_TO_START_PRICE_ENV] = "1999";
    expect(getPayToStartOffer("pre").priceCents).toBe(199);
  });
});

describe("journey constants", () => {
  it("shows slides 1, 4, 5 and 6 to a buyer, under the standard indices", () => {
    expect([...PAY_TO_START_WIZARD_SLIDES]).toEqual([0, 3, 4, 5]);
  });

  it("accepts real Checkout session ids only", () => {
    expect(CHECKOUT_SESSION_ID_REGEX.test("cs_test_a1B2c3D4e5F6g7")).toBe(true);
    expect(CHECKOUT_SESSION_ID_REGEX.test("cs_live_a1B2c3D4e5F6g7")).toBe(true);
    expect(CHECKOUT_SESSION_ID_REGEX.test("cs_test_short")).toBe(false);
    expect(CHECKOUT_SESSION_ID_REGEX.test("pi_test_a1B2c3D4e5F6g7")).toBe(false);
    expect(CHECKOUT_SESSION_ID_REGEX.test("cs_test_a1B2c3D4e5F6g7&x=1")).toBe(false);
  });
});

describe("readPrepaidToken", () => {
  it("reads either cookie name from a raw header", () => {
    expect(readPrepaidToken(`${PREPAID_COOKIE_PROD}=${TOKEN}`)).toBe(TOKEN);
    expect(readPrepaidToken(`a=1; ${PREPAID_COOKIE_DEV}=${TOKEN}; b=2`)).toBe(TOKEN);
  });

  it("ignores missing, malformed and look-alike cookies", () => {
    expect(readPrepaidToken(null)).toBeNull();
    expect(readPrepaidToken("")).toBeNull();
    expect(readPrepaidToken(`${PREPAID_COOKIE_DEV}=rpp_short`)).toBeNull();
    expect(readPrepaidToken(`x${PREPAID_COOKIE_DEV}=${TOKEN}`)).toBeNull();
    expect(readPrepaidToken(`${PREPAID_COOKIE_DEV}=%E0%A4%A`)).toBeNull();
    expect(readPrepaidToken(`${PREPAID_COOKIE_DEV}=${TOKEN}x`)).toBeNull();
  });

  it("skips a bad first copy and takes a valid later one", () => {
    expect(readPrepaidToken(`${PREPAID_COOKIE_PROD}=garbage; ${PREPAID_COOKIE_DEV}=${TOKEN}`)).toBe(
      TOKEN
    );
  });

  it("reads only the __Host- name in production, which no sibling subdomain can plant", () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      expect(readPrepaidToken(`${PREPAID_COOKIE_DEV}=${TOKEN}`)).toBeNull();
      expect(
        readPrepaidToken(`${PREPAID_COOKIE_DEV}=${TOKEN}; ${PREPAID_COOKIE_PROD}=${TOKEN}`)
      ).toBe(TOKEN);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
