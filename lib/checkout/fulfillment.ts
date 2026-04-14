import Stripe from "stripe";
import { getBreaker } from "@/lib/circuit-breaker";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import logger from "@/lib/logger";
import {
  getReportPurchasePlan,
  isReportPurchasePlanId,
  type ReportPurchasePlanId,
} from "./reportPurchase";
import {
  ensurePersonalReportForSubmission,
  resolveSubmissionAccessContext,
} from "@/lib/report/personalReport";
import { markReportPriceQuotePurchased } from "@/lib/pricing/reportPricing";

const SUPABASE_TIMEOUT_MS = 8_000;

interface ServiceFetchOptions {
  body?: string;
  headers?: Record<string, string>;
  method?: string;
  timeoutMs?: number;
}

type PaymentStatus = "canceled" | "failed" | "refunded" | "succeeded";

function getSupabaseServiceConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("supabase_not_configured");
  }

  return { serviceRoleKey, url };
}

async function supabaseServiceFetch(path: string, options: ServiceFetchOptions = {}) {
  const { url, serviceRoleKey } = getSupabaseServiceConfig();
  const { method = "GET", body, headers = {}, timeoutMs = SUPABASE_TIMEOUT_MS } = options;

  return getBreaker("supabase").fire(() =>
    fetchWithTimeout(`${url}${path}`, {
      body,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        ...headers,
      },
      method,
      timeoutMs,
    })
  );
}

function normalizePlan(value: unknown): ReportPurchasePlanId | null {
  return typeof value === "string" && isReportPurchasePlanId(value) ? value : null;
}

function toAmount(value: number | null | undefined) {
  if (typeof value !== "number") return null;
  return value / 100;
}

function toIsoDate(epochSeconds: number | null | undefined) {
  if (typeof epochSeconds !== "number" || !Number.isFinite(epochSeconds)) {
    return new Date().toISOString();
  }

  return new Date(epochSeconds * 1000).toISOString();
}

function getChargeDetails(charge: Stripe.Charge | null) {
  if (!charge) {
    return {
      cardBrand: null,
      cardExpMonth: null,
      cardExpYear: null,
      cardLast4: null,
      failureCode: null,
      failureMessage: null,
      paymentMethodType: null,
      receiptUrl: null,
    };
  }

  const paymentMethodDetails = charge.payment_method_details;
  const card = paymentMethodDetails?.type === "card" ? paymentMethodDetails.card : null;

  return {
    cardBrand: card?.brand ?? null,
    cardExpMonth: card?.exp_month ?? null,
    cardExpYear: card?.exp_year ?? null,
    cardLast4: card?.last4 ?? null,
    failureCode: charge.failure_code ?? null,
    failureMessage: charge.failure_message ?? null,
    paymentMethodType: paymentMethodDetails?.type ?? null,
    receiptUrl: charge.receipt_url ?? null,
  };
}

async function upsertWebhookEventRecord({
  event,
  paymentId,
  processed,
  processingError,
  stripePaymentIntentId,
}: {
  event: Stripe.Event;
  paymentId?: number | null;
  processed: boolean;
  processingError?: string | null;
  stripePaymentIntentId?: string | null;
}) {
  const lookupResponse = await supabaseServiceFetch(
    `/rest/v1/payment_webhook_event?stripe_event_id=eq.${encodeURIComponent(event.id)}&select=id&limit=1`
  );

  if (!lookupResponse.ok) {
    throw new Error("payment_webhook_event_lookup_failed");
  }

  const lookupRows = (await lookupResponse.json()) as Array<{ id: number }>;

  const payload = {
    event_data: JSON.parse(JSON.stringify(event.data.object)) as Record<string, unknown>,
    event_type: event.type,
    payment_id: typeof paymentId === "number" ? paymentId : null,
    processed,
    processed_at: processed ? new Date().toISOString() : null,
    processing_error: processingError ?? null,
    received_at: new Date().toISOString(),
    stripe_event_id: event.id,
    stripe_payment_intent_id: stripePaymentIntentId ?? null,
  };

  if (lookupRows[0]?.id) {
    const updateResponse = await supabaseServiceFetch(
      `/rest/v1/payment_webhook_event?id=eq.${lookupRows[0].id}`,
      {
        body: JSON.stringify(payload),
        headers: { Prefer: "return=minimal" },
        method: "PATCH",
      }
    );

    if (!updateResponse.ok) {
      throw new Error("payment_webhook_event_update_failed");
    }

    return lookupRows[0].id;
  }

  const createResponse = await supabaseServiceFetch("/rest/v1/payment_webhook_event", {
    body: JSON.stringify(payload),
    headers: { Prefer: "return=representation" },
    method: "POST",
  });

  if (!createResponse.ok) {
    throw new Error("payment_webhook_event_create_failed");
  }

  const createdRows = (await createResponse.json()) as Array<{ id: number }>;
  return createdRows[0]?.id ?? null;
}

async function fetchExistingPayment({
  stripeChargeId,
  stripePaymentIntentId,
}: {
  stripeChargeId?: string | null;
  stripePaymentIntentId?: string | null;
}) {
  if (stripePaymentIntentId) {
    const response = await supabaseServiceFetch(
      `/rest/v1/payment?stripe_payment_intent_id=eq.${encodeURIComponent(stripePaymentIntentId)}&select=id,personal_report_id&limit=1`
    );

    if (!response.ok) {
      throw new Error("payment_lookup_failed");
    }

    const rows = (await response.json()) as Array<{
      id: number;
      personal_report_id: number | null;
    }>;
    if (rows[0]) return rows[0];
  }

  if (!stripeChargeId) {
    return null;
  }

  const response = await supabaseServiceFetch(
    `/rest/v1/payment?stripe_charge_id=eq.${encodeURIComponent(stripeChargeId)}&select=id,personal_report_id&limit=1`
  );

  if (!response.ok) {
    throw new Error("payment_lookup_failed");
  }

  const rows = (await response.json()) as Array<{ id: number; personal_report_id: number | null }>;
  return rows[0] ?? null;
}

async function upsertPaymentRecord({
  amount,
  cardBrand,
  cardExpMonth,
  cardExpYear,
  cardLast4,
  currency,
  description,
  failureCode,
  failureMessage,
  metadata,
  paymentDateTime,
  paymentId,
  paymentMethodId,
  paymentMethodType,
  personalReportId,
  pricingQuoteId,
  receiptUrl,
  status,
  stripeChargeId,
  stripeCustomerId,
  stripePaymentIntentId,
  userId,
}: {
  amount: number | null;
  cardBrand: string | null;
  cardExpMonth: number | null;
  cardExpYear: number | null;
  cardLast4: string | null;
  currency: string | null;
  description: string;
  failureCode: string | null;
  failureMessage: string | null;
  metadata: Record<string, unknown>;
  paymentDateTime: string;
  paymentId: number | null;
  paymentMethodId: string | null;
  paymentMethodType: string | null;
  personalReportId: number;
  pricingQuoteId: number | null;
  receiptUrl: string | null;
  status: PaymentStatus;
  stripeChargeId: string | null;
  stripeCustomerId: string | null;
  stripePaymentIntentId: string | null;
  userId: number;
}) {
  const payload = {
    amount,
    card_brand: cardBrand,
    card_exp_month: cardExpMonth,
    card_exp_year: cardExpYear,
    card_last4: cardLast4,
    currency: currency?.toUpperCase() ?? null,
    description,
    failure_code: failureCode,
    failure_message: failureMessage,
    metadata,
    payment_date_time: paymentDateTime,
    payment_method_type: paymentMethodType,
    personal_report_id: personalReportId,
    pricing_quote_id: pricingQuoteId,
    receipt_url: receiptUrl,
    status,
    stripe_charge_id: stripeChargeId,
    stripe_customer_id: stripeCustomerId,
    stripe_payment_intent_id: stripePaymentIntentId,
    stripe_payment_method_id: paymentMethodId,
    user_id: userId,
  };

  if (paymentId) {
    const response = await supabaseServiceFetch(`/rest/v1/payment?id=eq.${paymentId}`, {
      body: JSON.stringify(payload),
      headers: { Prefer: "return=representation" },
      method: "PATCH",
    });

    if (!response.ok) {
      throw new Error("payment_update_failed");
    }

    const rows = (await response.json()) as Array<{ id: number }>;
    return rows[0]?.id ?? paymentId;
  }

  const response = await supabaseServiceFetch("/rest/v1/payment", {
    body: JSON.stringify(payload),
    headers: { Prefer: "return=representation" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("payment_create_failed");
  }

  const rows = (await response.json()) as Array<{ id: number }>;
  return rows[0]?.id ?? null;
}

async function ensurePaymentItem({
  amount,
  paymentId,
  plan,
}: {
  amount: number | null;
  paymentId: number;
  plan: ReportPurchasePlanId;
}) {
  const lookupResponse = await supabaseServiceFetch(
    `/rest/v1/payment_item?payment_id=eq.${paymentId}&select=id&limit=1`
  );

  if (!lookupResponse.ok) {
    throw new Error("payment_item_lookup_failed");
  }

  const existingRows = (await lookupResponse.json()) as Array<{ id: number }>;
  if (existingRows[0]) {
    return existingRows[0].id;
  }

  const planDefinition = getReportPurchasePlan(plan);

  const createResponse = await supabaseServiceFetch("/rest/v1/payment_item", {
    body: JSON.stringify({
      item_name: planDefinition.title,
      item_type: "report_plan",
      payment_id: paymentId,
      quantity: 1,
      total_price: amount,
      unit_price: amount,
    }),
    headers: { Prefer: "return=representation" },
    method: "POST",
  });

  if (!createResponse.ok) {
    throw new Error("payment_item_create_failed");
  }

  const rows = (await createResponse.json()) as Array<{ id: number }>;
  return rows[0]?.id ?? null;
}

async function updatePersonalReportPayment({
  amount,
  paymentId,
  personalReportId,
  status,
}: {
  amount: number | null;
  paymentId: number;
  personalReportId: number;
  status: PaymentStatus;
}) {
  const response = await supabaseServiceFetch(
    `/rest/v1/personal_report?id=eq.${personalReportId}`,
    {
      body: JSON.stringify({
        payment_id: paymentId,
        payment_status: status,
        price: amount,
      }),
      headers: { Prefer: "return=minimal" },
      method: "PATCH",
    }
  );

  if (!response.ok) {
    throw new Error("personal_report_payment_update_failed");
  }
}

async function syncCheckoutSessionPayment({
  event,
  eventStatus,
  session,
  stripe,
}: {
  event: Stripe.Event;
  eventStatus: PaymentStatus;
  session: Stripe.Checkout.Session;
  stripe: Stripe;
}) {
  const plan = normalizePlan(session.metadata?.plan);
  if (!plan) {
    throw new Error("stripe_checkout_missing_plan");
  }

  const context = await resolveSubmissionAccessContext({
    reportSessionId: session.metadata?.reportSessionId || null,
    reportToken: session.metadata?.reportToken || null,
  });

  if (!context?.submissionId) {
    throw new Error("stripe_checkout_missing_submission_context");
  }

  if (!context.userId) {
    throw new Error("stripe_checkout_missing_user_context");
  }

  const personalReport = await ensurePersonalReportForSubmission({
    reportToken: session.metadata?.reportToken || null,
    submissionId: context.submissionId,
  });

  if (!personalReport?.id) {
    throw new Error("stripe_checkout_missing_personal_report");
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  let charge: Stripe.Charge | null = null;
  let paymentMethodId: string | null = null;
  let stripeCustomerId: string | null =
    typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null);
  let paymentDateTime = new Date().toISOString();

  if (paymentIntentId) {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge"],
    });

    const latestCharge = paymentIntent.latest_charge;
    charge =
      latestCharge && typeof latestCharge !== "string"
        ? latestCharge
        : latestCharge
          ? await stripe.charges.retrieve(latestCharge)
          : null;
    paymentMethodId =
      typeof paymentIntent.payment_method === "string"
        ? paymentIntent.payment_method
        : (paymentIntent.payment_method?.id ?? null);
    stripeCustomerId =
      typeof paymentIntent.customer === "string"
        ? paymentIntent.customer
        : (paymentIntent.customer?.id ?? stripeCustomerId);
    paymentDateTime = toIsoDate(paymentIntent.created);
  }

  const amount = toAmount(session.amount_total);
  const pricingQuoteIdRaw = session.metadata?.pricingQuoteId;
  const pricingQuoteId =
    typeof pricingQuoteIdRaw === "string" && /^\d+$/.test(pricingQuoteIdRaw)
      ? Number(pricingQuoteIdRaw)
      : null;
  const chargeDetails = getChargeDetails(charge);
  const existingPayment = await fetchExistingPayment({
    stripeChargeId: charge?.id ?? null,
    stripePaymentIntentId: paymentIntentId,
  });

  const metadata = {
    checkoutSessionId: session.id,
    plan,
    pricingQuoteId,
    pricingClusterId: session.metadata?.pricingClusterId ?? null,
    experimentGroup: session.metadata?.experimentGroup ?? null,
    basePriceBucket: session.metadata?.basePriceBucket ?? null,
    discountStep: session.metadata?.discountStep ?? null,
    currentPrice: session.metadata?.currentPrice ?? null,
    initialPrice: session.metadata?.initialPrice ?? null,
    countryTier: session.metadata?.countryTier ?? null,
    deviceType: session.metadata?.deviceType ?? null,
    trafficSource: session.metadata?.trafficSource ?? null,
    engagementScore: session.metadata?.engagementScore ?? null,
    behavioralBucket: session.metadata?.behavioralBucket ?? null,
    reportSessionId: session.metadata?.reportSessionId ?? null,
    reportToken: session.metadata?.reportToken ?? null,
    stripePaymentStatus: session.payment_status ?? null,
  };

  const paymentId = await upsertPaymentRecord({
    amount,
    cardBrand: chargeDetails.cardBrand,
    cardExpMonth: chargeDetails.cardExpMonth,
    cardExpYear: chargeDetails.cardExpYear,
    cardLast4: chargeDetails.cardLast4,
    currency: session.currency ?? null,
    description: `LoveIQ ${getReportPurchasePlan(plan).title}`,
    failureCode: chargeDetails.failureCode,
    failureMessage: chargeDetails.failureMessage,
    metadata,
    paymentDateTime,
    paymentId: existingPayment?.id ?? null,
    paymentMethodId,
    paymentMethodType: chargeDetails.paymentMethodType,
    personalReportId: personalReport.id,
    pricingQuoteId,
    receiptUrl: chargeDetails.receiptUrl,
    status: eventStatus,
    stripeChargeId: charge?.id ?? null,
    stripeCustomerId,
    stripePaymentIntentId: paymentIntentId,
    userId: context.userId,
  });

  if (!paymentId) {
    throw new Error("stripe_checkout_payment_persist_failed");
  }

  if (eventStatus === "succeeded") {
    await ensurePaymentItem({ amount, paymentId, plan });
    if (pricingQuoteId) {
      await markReportPriceQuotePurchased({ paymentId, quoteId: pricingQuoteId });
    }
  }

  await updatePersonalReportPayment({
    amount,
    paymentId,
    personalReportId: personalReport.id,
    status: eventStatus,
  });

  await upsertWebhookEventRecord({
    event,
    paymentId,
    processed: true,
    processingError: null,
    stripePaymentIntentId: paymentIntentId,
  });
}

async function syncRefundEvent({ charge, event }: { charge: Stripe.Charge; event: Stripe.Event }) {
  const existingPayment = await fetchExistingPayment({
    stripeChargeId: charge.id,
    stripePaymentIntentId: charge.payment_intent ? String(charge.payment_intent) : null,
  });

  if (!existingPayment?.id) {
    await upsertWebhookEventRecord({
      event,
      processed: false,
      processingError: "payment_not_found_for_refund",
      stripePaymentIntentId:
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent?.id,
    });
    return;
  }

  const updateResponse = await supabaseServiceFetch(
    `/rest/v1/payment?id=eq.${existingPayment.id}`,
    {
      body: JSON.stringify({
        refund_amount: toAmount(charge.amount_refunded),
        refunded_at: new Date().toISOString(),
        status: "refunded",
      }),
      headers: { Prefer: "return=minimal" },
      method: "PATCH",
    }
  );

  if (!updateResponse.ok) {
    throw new Error("payment_refund_update_failed");
  }

  if (existingPayment.personal_report_id) {
    await updatePersonalReportPayment({
      amount: toAmount(charge.amount_captured ?? charge.amount),
      paymentId: existingPayment.id,
      personalReportId: existingPayment.personal_report_id,
      status: "refunded",
    });
  }

  await upsertWebhookEventRecord({
    event,
    paymentId: existingPayment.id,
    processed: true,
    processingError: null,
    stripePaymentIntentId:
      typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id,
  });
}

export async function processStripeWebhookEvent({
  event,
  stripe,
}: {
  event: Stripe.Event;
  stripe: Stripe;
}) {
  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await syncCheckoutSessionPayment({
          event,
          eventStatus: "succeeded",
          session: event.data.object as Stripe.Checkout.Session,
          stripe,
        });
        return;
      case "checkout.session.async_payment_failed":
        await syncCheckoutSessionPayment({
          event,
          eventStatus: "failed",
          session: event.data.object as Stripe.Checkout.Session,
          stripe,
        });
        return;
      case "checkout.session.expired":
        await syncCheckoutSessionPayment({
          event,
          eventStatus: "canceled",
          session: event.data.object as Stripe.Checkout.Session,
          stripe,
        });
        return;
      case "charge.refunded":
        await syncRefundEvent({ charge: event.data.object as Stripe.Charge, event });
        return;
      default:
        await upsertWebhookEventRecord({
          event,
          processed: true,
          processingError: null,
          stripePaymentIntentId: null,
        });
    }
  } catch (error) {
    logger.error(
      { error, eventId: event.id, type: event.type },
      "Stripe webhook fulfillment failed"
    );

    await upsertWebhookEventRecord({
      event,
      processed: false,
      processingError: error instanceof Error ? error.message : "unknown_webhook_error",
      stripePaymentIntentId: null,
    });

    throw error;
  }
}
