import logger from "@shared/observability/logger";
import { notifySlack } from "@shared/observability/slack";
import {
  getOfferDefinition,
  parsePriceCents,
  type PayToStartOffer,
  type PayToStartOfferId,
} from "@features/pay-to-start/logic/offer";

/** An offer with the price it sells at right now. */
export interface PricedOffer extends PayToStartOffer {
  priceCents: number;
}

/**
 * The environment setting that holds the full offer's price, in cents. Server-only (no
 * NEXT_PUBLIC_ prefix): the page reads it while rendering on the server and hands the
 * number down, so the browser never decides a price. Unset means the offer's default
 * (EUR 29, the Figma price). Changing it needs a redeploy, and the ad copy says EUR 29.
 */
export const PAY_TO_START_PRICE_ENV = "PAY_TO_START_PRICE_CENTS";

let alertedInvalidSetting = false;

/**
 * The offer as it sells now. An invalid setting must never take the page or the checkout
 * down, so it falls back to the default; it is logged on every read and reported to #ops
 * once per server process, where someone will see it.
 */
export function getPayToStartOffer(id: PayToStartOfferId = "full"): PricedOffer {
  const offer = getOfferDefinition(id);
  if (id !== "full") return { ...offer, priceCents: offer.defaultPriceCents };

  const raw = process.env.PAY_TO_START_PRICE_CENTS;
  if (raw === undefined || raw.trim() === "") {
    return { ...offer, priceCents: offer.defaultPriceCents };
  }
  const parsed = parsePriceCents(raw);
  if (parsed !== null) return { ...offer, priceCents: parsed };

  logger.error(
    { setting: PAY_TO_START_PRICE_ENV, fallbackCents: offer.defaultPriceCents },
    "pay-to-start: price setting is not a whole number of cents between 500 and 9900; using the default"
  );
  if (!alertedInvalidSetting) {
    alertedInvalidSetting = true;
    void notifySlack({
      channel: "ops",
      kind: "pts_price_setting_invalid",
      text: `:warning: Pay to start: ${PAY_TO_START_PRICE_ENV} is not a whole number of cents between 500 and 9900, so the page and checkout use the default (${offer.defaultPriceCents} cents). Fix it in Vercel and redeploy.`,
      username: "ops_alerts",
    }).catch(() => undefined);
  }
  return { ...offer, priceCents: offer.defaultPriceCents };
}

/** For tests: forget that the invalid-setting alert was sent. */
export function __resetPriceAlertForTests(): void {
  alertedInvalidSetting = false;
}
