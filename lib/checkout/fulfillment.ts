import Stripe from "stripe";
import { Resend } from "resend";
import { getBreaker } from "@/lib/circuit-breaker";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import logger from "@/lib/logger";
import { reportAllEmail } from "@/lib/emails/report-all";
import { reportAllBEmail } from "@/lib/emails/report-all-b";
import { reportEssentialsEmail } from "@/lib/emails/report-essentials";
import { reportFullEmail } from "@/lib/emails/report-full";
import { reportFullBEmail } from "@/lib/emails/report-full-b";
import { pickEmailVariant } from "@/lib/emails/ab-variant";
import {
  getReportPurchasePlan,
  isReportPurchasePlanId,
  type ReportPurchasePlanId,
} from "./reportPurchase";

let _resend: Resend | null = null;
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

// Defensive shape check for `event.data.object`. Stripe's webhook event
// `event.data.object` is loosely typed; before casting to a domain shape, make
// sure the payload at least looks like a Stripe object so we surface a clean
// error instead of throwing on a deeply-nested undefined.
function isStripeObjectShape(value: unknown): value is { id?: string; object?: string } {
  return typeof value === "object" && value !== null;
}

// Stripe error objects can include customer email, payment method last4, and
// other PII not covered by the global pino redact path list. Strip them down
// to a safe shape before logging.
function sanitizeError(error: unknown): Record<string, string | undefined> {
  if (error instanceof Error) {
    const stripeCode = (error as { code?: string }).code;
    return {
      name: error.name,
      message: error.message,
      ...(typeof stripeCode === "string" ? { code: stripeCode } : {}),
    };
  }
  return { name: "UnknownError" };
}

async function lookupRecipientForSubmission(submissionId: number): Promise<{
  email: string | null;
  firstName: string | null;
}> {
  try {
    const response = await supabaseServiceFetch(
      `/rest/v1/survey_submission?id=eq.${submissionId}&select=app_user!fk_survey_submission_user(email,first_name)&limit=1`
    );
    if (!response.ok) return { email: null, firstName: null };

    const rows = (await response.json()) as Array<{
      app_user?: { email?: string | null; first_name?: string | null } | null;
    }>;
    const user = rows[0]?.app_user;
    return {
      email: user?.email?.toLowerCase().trim() || null,
      firstName: user?.first_name?.trim() || null,
    };
  } catch (err) {
    logger.warn({ err, submissionId }, "lookupRecipientForSubmission failed");
    return { email: null, firstName: null };
  }
}

async function lookupReportTokenForSubmission(submissionId: number): Promise<string | null> {
  try {
    const response = await supabaseServiceFetch(
      `/rest/v1/report_access_token?survey_submission_id=eq.${submissionId}&select=token&order=created_at.desc&limit=1`
    );
    if (!response.ok) return null;
    const rows = (await response.json()) as Array<{ token?: string | null }>;
    return rows[0]?.token ?? null;
  } catch (err) {
    logger.warn({ err, submissionId }, "lookupReportTokenForSubmission failed");
    return null;
  }
}

async function sendPurchaseEmail({
  plan,
  reportTokenOverride,
  submissionId,
  unlockedArchetype,
}: {
  plan: ReportPurchasePlanId;
  reportTokenOverride: string | null;
  submissionId: number;
  unlockedArchetype?: string | null;
}): Promise<void> {
  if (plan !== "essentials" && plan !== "full_report" && plan !== "all_reports") {
    return;
  }

  const resend = getResend();
  if (!resend) {
    logger.warn({ plan, submissionId }, "RESEND_API_KEY missing — skipping purchase email");
    return;
  }

  const recipient = await lookupRecipientForSubmission(submissionId);
  if (!recipient.email) {
    logger.warn({ plan, submissionId }, "No recipient email for purchase — skipping");
    return;
  }

  const reportToken = reportTokenOverride || (await lookupReportTokenForSubmission(submissionId));
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://loveiq.org").replace(/\/$/, "");
  const reportUrl = reportToken
    ? `${siteUrl}/report/${encodeURIComponent(reportToken)}`
    : `${siteUrl}/report`;

  // Essentials has a single template; full_report and all_reports run an A/B
  // copy test. Variant is deterministic per recipient (hashed email) so retries
  // and dashboards stay consistent.
  const variant =
    plan === "essentials" ? "a" : pickEmailVariant(recipient.email, `purchase-${plan}`);

  const tpl =
    plan === "all_reports"
      ? variant === "b"
        ? reportAllBEmail({ firstName: recipient.firstName, reportUrl, siteUrl })
        : reportAllEmail({ firstName: recipient.firstName, reportUrl, siteUrl })
      : plan === "essentials"
        ? reportEssentialsEmail({
            firstName: recipient.firstName,
            reportUrl,
            siteUrl,
            unlockedArchetype: unlockedArchetype ?? null,
          })
        : variant === "b"
          ? reportFullBEmail({
              firstName: recipient.firstName,
              reportUrl,
              siteUrl,
              unlockedArchetype: unlockedArchetype ?? null,
            })
          : reportFullEmail({
              firstName: recipient.firstName,
              reportUrl,
              siteUrl,
              unlockedArchetype: unlockedArchetype ?? null,
            });

  try {
    const { error } = await Promise.race([
      resend.emails.send({
        from: process.env.RESEND_FROM || "LoveIQ <hello@send.loveiq.org>",
        to: recipient.email,
        replyTo: process.env.RESEND_REPLY_TO || "hello@loveiq.org",
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        headers: { "X-LoveIQ-Variant": variant },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Resend timeout")), 8_000)
      ),
    ]);
    if (error) {
      logger.error({ error, plan, submissionId, variant }, "Purchase email send failed");
    } else {
      logger.info({ plan, submissionId, variant }, "Purchase email sent");
    }
  } catch (err) {
    logger.error({ err, plan, submissionId, variant }, "Purchase email error");
  }
}
import {
  STRIPE_CHECKOUT_SESSION_EXPAND,
  getStripeCheckoutPromotionSummary,
} from "./stripeCheckout";
import {
  addUnlockedArchetypeForPersonalReport,
  ensurePersonalReportForSubmission,
  resolveSubmissionAccessContext,
} from "@/lib/report/personalReport";
import { isArchetypeName } from "@/lib/report/archetypeSlug";
import { markReportPriceQuotePurchased } from "@/lib/pricing/reportPricing";

const SUPABASE_TIMEOUT_MS = 8_000;

interface ServiceFetchOptions {
  body?: string;
  headers?: Record<string, string>;
  method?: string;
  timeoutMs?: number;
}

type PaymentStatus = "canceled" | "disputed" | "failed" | "refunded" | "succeeded";

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

function getMetadataString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
    // Concurrent webhook retries may race past the lookup above and both attempt
    // to insert. The unique index on stripe_event_id collapses one of them with
    // a 409 Conflict — treat as already-recorded rather than retrying.
    if (createResponse.status === 409) {
      return null;
    }
    throw new Error("payment_webhook_event_create_failed");
  }

  const createdRows = (await createResponse.json()) as Array<{ id: number }>;
  return createdRows[0]?.id ?? null;
}

async function fetchWebhookEventRecord(stripeEventId: string) {
  const response = await supabaseServiceFetch(
    `/rest/v1/payment_webhook_event?stripe_event_id=eq.${encodeURIComponent(stripeEventId)}&select=id,payment_id,processed&limit=1`
  );

  if (!response.ok) {
    throw new Error("payment_webhook_event_lookup_failed");
  }

  const rows = (await response.json()) as Array<{
    id: number;
    payment_id: number | null;
    processed: boolean | null;
  }>;

  return rows[0] ?? null;
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
  ipAddress,
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
  userAgent,
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
  ipAddress: string | null;
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
  userAgent: string | null;
  userId: number;
}) {
  const now = new Date().toISOString();
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
    ip_address: ipAddress,
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
    updated_date_time: now,
    user_agent: userAgent,
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
    body: JSON.stringify({
      ...payload,
      created_date_time: now,
    }),
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
  const now = new Date().toISOString();
  const response = await supabaseServiceFetch(
    `/rest/v1/personal_report?id=eq.${personalReportId}`,
    {
      body: JSON.stringify({
        payment_id: paymentId,
        payment_status: status,
        price: amount,
        updated_date_time: now,
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

  const settledSession = await stripe.checkout.sessions.retrieve(session.id, {
    expand: STRIPE_CHECKOUT_SESSION_EXPAND,
  });

  const paymentIntentId =
    typeof settledSession.payment_intent === "string"
      ? settledSession.payment_intent
      : (settledSession.payment_intent?.id ?? null);

  let charge: Stripe.Charge | null = null;
  let paymentMethodId: string | null = null;
  let stripeCustomerId: string | null =
    typeof settledSession.customer === "string"
      ? settledSession.customer
      : (settledSession.customer?.id ?? null);
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

  const amount = toAmount(settledSession.amount_total);
  const pricingQuoteIdRaw = settledSession.metadata?.pricingQuoteId;
  const pricingQuoteId =
    typeof pricingQuoteIdRaw === "string" && /^\d+$/.test(pricingQuoteIdRaw)
      ? Number(pricingQuoteIdRaw)
      : null;
  const chargeDetails = getChargeDetails(charge);
  const promotionSummary = getStripeCheckoutPromotionSummary(settledSession);
  const requestIp = getMetadataString(settledSession.metadata?.requestIp);
  const requestUserAgent = getMetadataString(settledSession.metadata?.requestUserAgent);
  const existingPayment = await fetchExistingPayment({
    stripeChargeId: charge?.id ?? null,
    stripePaymentIntentId: paymentIntentId,
  });

  const rawArchetypeMetadata = settledSession.metadata?.archetype ?? null;
  const unlockedArchetype =
    typeof rawArchetypeMetadata === "string" && isArchetypeName(rawArchetypeMetadata)
      ? rawArchetypeMetadata
      : null;

  const metadata = {
    archetype: unlockedArchetype,
    checkoutSessionId: settledSession.id,
    plan,
    pricingQuoteId,
    pricingClusterId: settledSession.metadata?.pricingClusterId ?? null,
    experimentGroup: settledSession.metadata?.experimentGroup ?? null,
    basePriceBucket: settledSession.metadata?.basePriceBucket ?? null,
    discountStep: settledSession.metadata?.discountStep ?? null,
    currentPrice: settledSession.metadata?.currentPrice ?? null,
    initialPrice: settledSession.metadata?.initialPrice ?? null,
    msrp: settledSession.metadata?.msrp ?? null,
    startingPrice: settledSession.metadata?.startingPrice ?? null,
    countryTier: settledSession.metadata?.countryTier ?? null,
    deviceType: settledSession.metadata?.deviceType ?? null,
    trafficSource: settledSession.metadata?.trafficSource ?? null,
    engagementScore: settledSession.metadata?.engagementScore ?? null,
    behavioralBucket: settledSession.metadata?.behavioralBucket ?? null,
    reportSessionId: settledSession.metadata?.reportSessionId ?? null,
    reportToken: settledSession.metadata?.reportToken ?? null,
    requestIp,
    requestUserAgent,
    stripePaymentStatus: settledSession.payment_status ?? null,
    promotionCode: promotionSummary?.promotionCode ?? null,
    couponId: promotionSummary?.couponId ?? null,
    couponName: promotionSummary?.couponName ?? null,
    couponPercentOff: promotionSummary?.couponPercentOff ?? null,
    couponAmountOff:
      promotionSummary?.couponAmountOff !== null && promotionSummary?.couponAmountOff !== undefined
        ? promotionSummary.couponAmountOff / 100
        : null,
    discountAmount: promotionSummary?.discountAmount ?? null,
  };

  const paymentId = await upsertPaymentRecord({
    amount,
    cardBrand: chargeDetails.cardBrand,
    cardExpMonth: chargeDetails.cardExpMonth,
    cardExpYear: chargeDetails.cardExpYear,
    cardLast4: chargeDetails.cardLast4,
    currency: settledSession.currency ?? null,
    description: `LoveIQ ${getReportPurchasePlan(plan).title}`,
    failureCode: chargeDetails.failureCode,
    failureMessage: chargeDetails.failureMessage,
    ipAddress: requestIp,
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
    userAgent: requestUserAgent,
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

  if (eventStatus === "succeeded" && plan === "full_report" && unlockedArchetype) {
    try {
      await addUnlockedArchetypeForPersonalReport({
        archetype: unlockedArchetype,
        personalReportId: personalReport.id,
      });
    } catch (err) {
      logger.warn(
        { archetype: unlockedArchetype, err, personalReportId: personalReport.id },
        "Unable to persist unlocked archetype after checkout"
      );
    }
  }

  if (eventStatus === "succeeded") {
    await sendPurchaseEmail({
      plan,
      reportTokenOverride:
        typeof settledSession.metadata?.reportToken === "string"
          ? settledSession.metadata.reportToken
          : null,
      submissionId: context.submissionId,
      unlockedArchetype,
    });
  }

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
        updated_date_time: new Date().toISOString(),
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

// Chargebacks: Stripe holds the funds the moment the dispute is created. We
// mirror that on our side so the report re-locks automatically — the access
// query filters payments by status=succeeded, so flipping to disputed drops
// the row from access computation. If the merchant later wins the dispute,
// Stripe emits charge.dispute.closed with status=won and we restore the row.
async function syncDisputeEvent({
  dispute,
  event,
  outcome,
}: {
  dispute: Stripe.Dispute;
  event: Stripe.Event;
  outcome: "opened" | "closed";
}) {
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
  const paymentIntentId =
    typeof dispute.payment_intent === "string"
      ? dispute.payment_intent
      : (dispute.payment_intent?.id ?? null);

  const existingPayment = await fetchExistingPayment({
    stripeChargeId: chargeId ?? null,
    stripePaymentIntentId: paymentIntentId,
  });

  if (!existingPayment?.id) {
    await upsertWebhookEventRecord({
      event,
      processed: false,
      processingError: "payment_not_found_for_dispute",
      stripePaymentIntentId: paymentIntentId,
    });
    return;
  }

  // Re-lock on dispute open. On close, only restore if the merchant won —
  // lost / warning_closed / charge_refunded outcomes leave the payment locked.
  const restoreToSucceeded = outcome === "closed" && dispute.status === "won";
  const nextStatus = restoreToSucceeded ? "succeeded" : "disputed";

  const updateResponse = await supabaseServiceFetch(
    `/rest/v1/payment?id=eq.${existingPayment.id}`,
    {
      body: JSON.stringify({
        status: nextStatus,
        updated_date_time: new Date().toISOString(),
      }),
      headers: { Prefer: "return=minimal" },
      method: "PATCH",
    }
  );

  if (!updateResponse.ok) {
    throw new Error("payment_dispute_update_failed");
  }

  if (existingPayment.personal_report_id) {
    await updatePersonalReportPayment({
      amount: toAmount(dispute.amount),
      paymentId: existingPayment.id,
      personalReportId: existingPayment.personal_report_id,
      status: nextStatus,
    });
  }

  await upsertWebhookEventRecord({
    event,
    paymentId: existingPayment.id,
    processed: true,
    processingError: null,
    stripePaymentIntentId: paymentIntentId,
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
    const existingWebhookEvent = await fetchWebhookEventRecord(event.id);
    if (existingWebhookEvent?.processed) {
      return;
    }

    if (!isStripeObjectShape(event.data.object)) {
      await upsertWebhookEventRecord({
        event,
        processed: false,
        processingError: "event_payload_invalid_shape",
        stripePaymentIntentId: null,
      });
      return;
    }

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
      case "charge.dispute.created":
        await syncDisputeEvent({
          dispute: event.data.object as Stripe.Dispute,
          event,
          outcome: "opened",
        });
        return;
      case "charge.dispute.closed":
        await syncDisputeEvent({
          dispute: event.data.object as Stripe.Dispute,
          event,
          outcome: "closed",
        });
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
      { err: sanitizeError(error), eventId: event.id, type: event.type },
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
