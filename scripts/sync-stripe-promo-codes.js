#!/usr/bin/env node

/**
 * Ensure the LOVEIQ percentage promo-code set exists in Stripe.
 *
 * Usage:
 *   node scripts/sync-stripe-promo-codes.js          # dry-run
 *   node scripts/sync-stripe-promo-codes.js --apply  # create/update in Stripe
 *
 * Requires STRIPE_SECRET_KEY in the environment or in .env.local.
 */

const fs = require("fs");
const path = require("path");
const Stripe = require("stripe");

const PROMO_PERCENTS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const DRY_RUN = !process.argv.includes("--apply");

function loadEnvFile(fileName) {
  const envPath = path.join(__dirname, "..", fileName);

  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^["']|["']$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function couponIdForPercent(percent) {
  return `loveiq_percent_${percent}_once`;
}

function codeForPercent(percent) {
  return `LOVEIQ${percent}`;
}

function couponNameForPercent(percent) {
  return `LOVEIQ ${percent}% Off`;
}

function isStripeNotFound(error) {
  return (
    error &&
    typeof error === "object" &&
    "statusCode" in error &&
    Number(error.statusCode) === 404
  );
}

function getCouponIdFromPromotionCode(promotionCode) {
  if (!promotionCode || !promotionCode.promotion) {
    return null;
  }

  const coupon = promotionCode.promotion.coupon;
  if (!coupon) {
    return null;
  }

  return typeof coupon === "string" ? coupon : coupon.id;
}

async function ensureCoupon(stripe, percent) {
  const couponId = couponIdForPercent(percent);
  const desiredName = couponNameForPercent(percent);
  const desiredMetadata = {
    percent_off: String(percent),
    scope: "all_plans",
    source: "loveiq-sync-script",
  };

  try {
    const existing = await stripe.coupons.retrieve(couponId);

    if (existing.deleted) {
      throw new Error(`Coupon ${couponId} exists as a deleted object in Stripe.`);
    }

    if (existing.percent_off !== percent) {
      throw new Error(
        `Coupon ${couponId} already exists with percent_off=${existing.percent_off}, expected ${percent}.`
      );
    }

    const needsMetadataUpdate =
      existing.name !== desiredName ||
      existing.duration !== "once" ||
      existing.metadata?.percent_off !== desiredMetadata.percent_off ||
      existing.metadata?.scope !== desiredMetadata.scope ||
      existing.metadata?.source !== desiredMetadata.source;

    if (!needsMetadataUpdate) {
      console.log(`coupon ${couponId}: ok`);
      return existing;
    }

    if (DRY_RUN) {
      console.log(`coupon ${couponId}: would update name/metadata`);
      return existing;
    }

    const updated = await stripe.coupons.update(couponId, {
      metadata: desiredMetadata,
      name: desiredName,
    });
    console.log(`coupon ${couponId}: updated`);
    return updated;
  } catch (error) {
    if (!isStripeNotFound(error)) {
      throw error;
    }

    if (DRY_RUN) {
      console.log(`coupon ${couponId}: would create (${percent}% off)`);
      return {
        id: couponId,
        percent_off: percent,
      };
    }

    const created = await stripe.coupons.create({
      duration: "once",
      id: couponId,
      metadata: desiredMetadata,
      name: desiredName,
      percent_off: percent,
    });
    console.log(`coupon ${couponId}: created`);
    return created;
  }
}

async function ensurePromotionCode(stripe, percent, couponId) {
  const code = codeForPercent(percent);
  const desiredMetadata = {
    coupon_id: couponId,
    percent_off: String(percent),
    scope: "all_plans",
    source: "loveiq-sync-script",
  };

  const existingList = await stripe.promotionCodes.list({
    code,
    limit: 100,
  });
  const existing = existingList.data.find(
    (entry) => String(entry.code || "").toUpperCase() === code.toUpperCase()
  );

  if (existing) {
    const attachedCouponId = getCouponIdFromPromotionCode(existing);
    if (attachedCouponId && attachedCouponId !== couponId) {
      throw new Error(
        `Promotion code ${code} already points to coupon ${attachedCouponId}, expected ${couponId}.`
      );
    }

    if (existing.active) {
      console.log(`promotion code ${code}: ok`);
      return existing;
    }

    if (DRY_RUN) {
      console.log(`promotion code ${code}: would reactivate`);
      return existing;
    }

    const updated = await stripe.promotionCodes.update(existing.id, {
      active: true,
      metadata: desiredMetadata,
    });
    console.log(`promotion code ${code}: reactivated`);
    return updated;
  }

  if (DRY_RUN) {
    console.log(`promotion code ${code}: would create`);
    return null;
  }

  const created = await stripe.promotionCodes.create({
    active: true,
    code,
    metadata: desiredMetadata,
    promotion: {
      coupon: couponId,
      type: "coupon",
    },
  });
  console.log(`promotion code ${code}: created`);
  return created;
}

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.error("Missing STRIPE_SECRET_KEY in environment or .env.local");
    process.exit(1);
  }

  const stripe = new Stripe(secretKey);

  console.log(DRY_RUN ? "=== DRY RUN ===" : "=== APPLY MODE ===");
  console.log(`Target code family: ${codeForPercent(10)} .. ${codeForPercent(100)}`);

  for (const percent of PROMO_PERCENTS) {
    const coupon = await ensureCoupon(stripe, percent);
    await ensurePromotionCode(stripe, percent, coupon.id);
  }

  console.log("Stripe promo-code sync complete.");
}

main().catch((error) => {
  console.error("Stripe promo-code sync failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
