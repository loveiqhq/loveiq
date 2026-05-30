import Stripe from "stripe";
import { Resend } from "resend";
import { getBreaker } from "@shared/http/circuit-breaker";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";
import { notifySlack, maskEmail, escapeSlack } from "@shared/observability/slack";
import { reportAllEmail } from "@features/report/server/emails/report-all";
import { reportAllBEmail } from "@features/report/server/emails/report-all-b";
import { reportEssentialsEmail } from "@features/report/server/emails/report-essentials";
import { reportFullEmail } from "@features/report/server/emails/report-full";
import { reportFullBEmail } from "@features/report/server/emails/report-full-b";
import { pickEmailVariant } from "@shared/emails/ab-variant";
import { buildUnsubscribeUrl } from "@shared/emails/unsubscribe-token";
import { getEmailSiteUrl } from "@shared/emails/site-url";
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

async function notifySlackPurchase({
  amount,
  archetype,
  currency,
  email,
  firstName,
  paymentId,
  plan,
  submissionId,
}: {
  amount: number | null;
  archetype: string | null;
  currency: string | null;
  email: string | null;
  firstName: string | null;
  paymentId: number;
  plan: ReportPurchasePlanId;
  submissionId: number;
}) {
  const url = process.env.SLACK_PAYMENTS_WEBHOOK_URL;

  if (!url) {
    logger.info(
      { paymentId, plan, submissionId },
      "Slack payments webhook env unset — skipping purchase notification"
    );
    return;
  }

  const planLabel = getReportPurchasePlan(plan).title;
  const archetypeSuffix = plan === "all_reports" || !archetype ? "" : ` (${archetype})`;
  const safeName = firstName?.trim() || "anonymous";
  const safeEmail = email?.trim() || null;
  const maskedEmail = safeEmail ? safeEmail.replace(/^(.).+(@.+)$/, "$1***$2") : "no-email";
  const formattedAmount =
    typeof amount === "number" && Number.isFinite(amount)
      ? `${(currency ?? "EUR").toUpperCase()} ${amount.toFixed(2)}`
      : "amount unknown";

  const text = `:credit_card: New purchase: *${safeName}* (${maskedEmail}) — ${planLabel}${archetypeSuffix} — ${formattedAmount}`;

  try {
    logger.info({ paymentId, plan, submissionId }, "Sending Slack purchase notification");
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, username: "payment_notification" }),
      timeoutMs: 5000,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.error({ paymentId, plan, status: res.status, body }, "Slack purchase webhook failed");
    }
  } catch (err) {
    logger.error({ err, paymentId, plan }, "Slack purchase webhook error");
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
  const siteUrl = getEmailSiteUrl();
  const reportUrl = reportToken
    ? `${siteUrl}/report/${encodeURIComponent(reportToken)}`
    : `${siteUrl}/report`;

  // Purchase confirmations are transactional — they ship regardless of
  // marketing preferences. The unsubscribe link still flows through for
  // CAN-SPAM / RFC 8058 compliance; future marketing emails honor the
  // suppression list elsewhere.
  const unsubSecret = process.env.UNSUBSCRIBE_SECRET;
  const unsubscribeUrl = unsubSecret
    ? buildUnsubscribeUrl(recipient.email, siteUrl, unsubSecret)
    : undefined;

  // Essentials has a single template; full_report and all_reports run an A/B
  // copy test. Variant is deterministic per recipient (hashed email) so retries
  // and dashboards stay consistent.
  const variant =
    plan === "essentials" ? "a" : pickEmailVariant(recipient.email, `purchase-${plan}`);

  const tpl =
    plan === "all_reports"
      ? variant === "b"
        ? reportAllBEmail({ firstName: recipient.firstName, reportUrl, siteUrl, unsubscribeUrl })
        : reportAllEmail({ firstName: recipient.firstName, reportUrl, siteUrl, unsubscribeUrl })
      : plan === "essentials"
        ? reportEssentialsEmail({
            firstName: recipient.firstName,
            reportUrl,
            siteUrl,
            unlockedArchetype: unlockedArchetype ?? null,
            unsubscribeUrl,
          })
        : variant === "b"
          ? reportFullBEmail({
              firstName: recipient.firstName,
              reportUrl,
              siteUrl,
              unlockedArchetype: unlockedArchetype ?? null,
              unsubscribeUrl,
            })
          : reportFullEmail({
              firstName: recipient.firstName,
              reportUrl,
              siteUrl,
              unlockedArchetype: unlockedArchetype ?? null,
              unsubscribeUrl,
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
        headers: {
          "X-LoveIQ-Variant": variant,
          ...(unsubscribeUrl && {
            "List-Unsubscribe": `<${unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          }),
        },
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
  ensurePersonalReportForSubmission,
  resolveSubmissionAccessContext,
  unlockAllArchetypesForPersonalReport,
  upsertArchetypeTierForPersonalReport,
} from "@features/report/server/personalReport";
import { isArchetypeName } from "@features/report/server/archetypeSlug";
import { markReportPriceQuotePurchased } from "@features/pricing/logic/reportPricing";

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

/**
 * Defensive fallback for webhook fulfillment: when a per-archetype plan
 * (essentials/full_report) arrives without a valid `archetype` metadata
 * field — e.g. an older client built before the per-archetype refactor —
 * resolve the buyer's primary archetype from `scoring_result` so the tier
 * write still lands. Returns null if scoring isn't available; the caller
 * logs and skips the tier write in that case.
 */
async function lookupPrimaryArchetypeForSubmission(submissionId: number): Promise<string | null> {
  try {
    const response = await supabaseServiceFetch(
      `/rest/v1/scoring_result?survey_submission_id=eq.${submissionId}&select=primary_archetype,v5_primary_archetype&limit=1`
    );
    if (!response.ok) return null;
    const rows = (await response.json()) as Array<{
      primary_archetype: string | null;
      v5_primary_archetype: string | null;
    }>;
    const row = rows[0];
    if (!row) return null;
    const candidate = row.v5_primary_archetype ?? row.primary_archetype;
    return typeof candidate === "string" && isArchetypeName(candidate) ? candidate : null;
  } catch (err) {
    // eslint-disable-next-line no-secrets/no-secrets -- log message, not a secret
    logger.warn({ err, submissionId }, "lookupPrimaryArchetypeForSubmission failed");
    return null;
  }
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
      // R-04: Stripe Radar fields. risk_level is the bucketed assessment
      // (normal | elevated | highest), risk_score is the underlying 0-100.
      // We persist both onto metadata so post-hoc analysis is possible even
      // for charges that fulfilled normally, and we Slack-alert at write
      // time when risk_level is elevated/highest.
      riskLevel: null as string | null,
      riskScore: null as number | null,
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
    riskLevel: charge.outcome?.risk_level ?? null,
    riskScore: charge.outcome?.risk_score ?? null,
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
    // T-05: handle the race where a parallel path inserted first. After the
    // new partial UNIQUE indexes on (stripe_payment_intent_id) and
    // (stripe_charge_id), Postgres returns 409 if a row with the same
    // non-null Stripe ID already exists. Re-fetch and UPDATE in that case
    // so the caller still gets a payment id back. Other failures still
    // throw.
    if (response.status === 409 && (stripePaymentIntentId || stripeChargeId)) {
      const existing = await fetchExistingPayment({
        stripeChargeId,
        stripePaymentIntentId,
      });
      if (existing?.id) {
        logger.info(
          { existingId: existing.id, stripePaymentIntentId, stripeChargeId },
          "T-05: payment INSERT lost race to parallel path; falling back to UPDATE"
        );
        const updateResponse = await supabaseServiceFetch(`/rest/v1/payment?id=eq.${existing.id}`, {
          body: JSON.stringify(payload),
          headers: { Prefer: "return=representation" },
          method: "PATCH",
        });
        if (!updateResponse.ok) {
          throw new Error("payment_create_failed");
        }
        return existing.id;
      }
    }
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
    // Sessions can expire (or async-fail) before any plan metadata was set —
    // e.g. user abandons checkout, or a malformed session never reached the
    // plan-selection step. Nothing was charged, so nothing to fulfill: mark
    // the event processed and return rather than re-trying forever.
    if (eventStatus !== "succeeded") {
      logger.info(
        { eventId: event.id, eventStatus, sessionId: session.id, type: event.type },
        "Skipping non-success checkout event without plan metadata"
      );
      await upsertWebhookEventRecord({
        event,
        processed: true,
        processingError: null,
        stripePaymentIntentId: null,
      });
      return;
    }
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

  // T-04: when the event TYPE says "succeeded" (checkout.session.completed
  // or checkout.session.async_payment_succeeded) but Stripe's authoritative
  // PaymentIntent.status disagrees, defer to Stripe. Affects only the async/
  // 3DS code path: a card requiring SCA can have the session complete then
  // the PaymentIntent get voided seconds later by Stripe Radar. Without this
  // re-check we'd grant access on an event whose underlying intent is not
  // actually succeeded. Demote `succeeded` → `failed` for the rest of the
  // function (skips tier write + sends a Slack alert via the failure path).
  let effectiveStatus: PaymentStatus = eventStatus;

  if (paymentIntentId) {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge"],
    });

    if (
      effectiveStatus === "succeeded" &&
      paymentIntent.status !== "succeeded" &&
      paymentIntent.status !== "processing"
    ) {
      logger.warn(
        {
          eventId: event.id,
          eventType: event.type,
          paymentIntentId,
          paymentIntentStatus: paymentIntent.status,
        },
        "T-04: PaymentIntent status disagrees with success event — demoting to failed"
      );
      effectiveStatus = "failed";
    }

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
  // Cross-source dedupe for Slack: webhook + status-poll fallback + cron sweep
  // can all reach this function. We only want one Slack ping per unique
  // purchase, so gate the notification on whether THIS run is the first
  // write — i.e. there was no payment row before we got here.
  const isFirstFulfillment = !existingPayment;

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
    // Forced-paywall A/B arm ("treatment" | "control"), stamped server-side at
    // checkout-session creation. Query via payment.metadata->>'forcedPaywallArm'
    // for consent-independent conversion + revenue by arm.
    forcedPaywallArm: settledSession.metadata?.forcedPaywallArm ?? null,
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
    // R-04: persist Stripe Radar outcome on every payment row so admin
    // queries can filter and analytics can correlate risk with refund/
    // dispute outcomes.
    riskLevel: chargeDetails.riskLevel,
    riskScore: chargeDetails.riskScore,
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
    status: effectiveStatus,
    stripeChargeId: charge?.id ?? null,
    stripeCustomerId,
    stripePaymentIntentId: paymentIntentId,
    userAgent: requestUserAgent,
    userId: context.userId,
  });

  if (!paymentId) {
    throw new Error("stripe_checkout_payment_persist_failed");
  }

  if (effectiveStatus === "succeeded") {
    await ensurePaymentItem({ amount, paymentId, plan });
    if (pricingQuoteId) {
      await markReportPriceQuotePurchased({ paymentId, quoteId: pricingQuoteId });
    }
  }

  await updatePersonalReportPayment({
    amount,
    paymentId,
    personalReportId: personalReport.id,
    status: effectiveStatus,
  });

  if (effectiveStatus === "succeeded" && (plan === "essentials" || plan === "full_report")) {
    // If the checkout session lacked a valid archetype metadata field,
    // resolve the buyer's primary archetype from scoring_result. This
    // prevents silent fulfillment loss when an older client (or a flow
    // that opens the modal without a target tile) sends archetype="".
    const archetypeForTier =
      unlockedArchetype ?? (await lookupPrimaryArchetypeForSubmission(context.submissionId));
    if (archetypeForTier) {
      try {
        await upsertArchetypeTierForPersonalReport({
          archetype: archetypeForTier,
          personalReportId: personalReport.id,
          tier: plan,
        });
      } catch (err) {
        logger.warn(
          { archetype: archetypeForTier, err, personalReportId: personalReport.id, tier: plan },
          "Unable to persist archetype tier after checkout"
        );
      }
    } else {
      logger.error(
        { personalReportId: personalReport.id, plan, submissionId: context.submissionId },
        "No archetype available for tier persistence — purchase recorded but tier write skipped"
      );
    }
  } else if (effectiveStatus === "succeeded" && plan === "all_reports") {
    // The all-reports plan unlocks every archetype at full_report tier.
    // Resolver code synthesizes this at read time, but persisting the tiers
    // here keeps admin queries / CSV exports / reporting in sync with the
    // user's actual access without forcing every read path to know about
    // the all_reports special case.
    try {
      await unlockAllArchetypesForPersonalReport(personalReport.id);
    } catch (err) {
      logger.warn(
        { err, personalReportId: personalReport.id, plan },
        "Unable to persist all-archetypes tier after checkout"
      );
    }
  }

  if (effectiveStatus === "succeeded") {
    await sendPurchaseEmail({
      plan,
      reportTokenOverride:
        typeof settledSession.metadata?.reportToken === "string"
          ? settledSession.metadata.reportToken
          : null,
      submissionId: context.submissionId,
      unlockedArchetype,
    });

    // Slack ping — fires once per unique purchase. isFirstFulfillment is
    // false on Stripe re-deliveries, on the cs_status_poll_* synthetic
    // event from the success-page fallback, and on any future code path
    // that reaches this function with a payment row already in place.
    if (isFirstFulfillment) {
      const recipient = await lookupRecipientForSubmission(context.submissionId);
      await notifySlackPurchase({
        amount,
        archetype: unlockedArchetype,
        currency: settledSession.currency ?? null,
        email: recipient.email,
        firstName: recipient.firstName,
        paymentId,
        plan,
        submissionId: context.submissionId,
      });

      // R-04: Stripe Radar elevated/highest risk alert. We still fulfill —
      // a hard block would slow legit buyers — but ops gets a heads-up so
      // they can pre-empt a dispute or refund. `highest` is the urgent
      // category that Stripe flags as likely fraud.
      if (chargeDetails.riskLevel === "elevated" || chargeDetails.riskLevel === "highest") {
        const urgentIcon = chargeDetails.riskLevel === "highest" ? ":rotating_light:" : ":warning:";
        await notifySlack({
          channel: "ops",
          kind: `stripe_risk_${chargeDetails.riskLevel}`,
          text: `${urgentIcon} Stripe Radar *${chargeDetails.riskLevel}* risk on payment #${paymentId} (score ${chargeDetails.riskScore ?? "?"}). Fulfilled; review for proactive refund / contact.`,
          username: "ops_alerts",
        });
      }

      // Promo-code redemption ping to the ops channel — only when a coupon
      // actually applied to this checkout. Keeps the payments channel
      // focused on raw $$$; promo attribution lands in ops alongside the
      // other operational signals.
      if (promotionSummary?.promotionCode) {
        const discountSummary =
          typeof promotionSummary.couponPercentOff === "number"
            ? `${promotionSummary.couponPercentOff}% off`
            : typeof promotionSummary.couponAmountOff === "number"
              ? `${(promotionSummary.couponAmountOff / 100).toFixed(2)} off`
              : "promo applied";
        const stage = settledSession.metadata?.promoStage;
        const stageSuffix = stage ? ` — stage *${escapeSlack(stage)}*` : "";
        await notifySlack({
          channel: "ops",
          kind: "promo_redeemed",
          text: `:tag: Promo *${escapeSlack(promotionSummary.promotionCode)}* redeemed (${discountSummary})${stageSuffix} — payment #${paymentId}`,
          username: "ops_alerts",
        });
      }
    }
  } else if (effectiveStatus === "failed") {
    const recipient = await lookupRecipientForSubmission(context.submissionId);
    const masked = recipient.email ? maskEmail(recipient.email) : "no-email";
    const reason = chargeDetails.failureMessage ?? chargeDetails.failureCode ?? "unknown";
    await notifySlack({
      channel: "ops",
      kind: "stripe_payment_failed",
      text: `:credit_card: Payment failed — ${escapeSlack(masked)} — ${escapeSlack(reason)} — payment #${paymentId}`,
      username: "ops_alerts",
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

  // F-07: partial vs full refund detection. Stripe sets `amount_refunded`
  // cumulatively, so multiple partial refunds add up. We compare against the
  // captured amount (fall back to gross amount when capture details aren't
  // present, e.g. uncaptured authorisations being refunded).
  const captured = charge.amount_captured ?? charge.amount ?? 0;
  const refunded = charge.amount_refunded ?? 0;
  const isPartialRefund = refunded > 0 && refunded < captured;
  const paymentStatus = isPartialRefund ? "succeeded" : "refunded";

  const updateResponse = await supabaseServiceFetch(
    `/rest/v1/payment?id=eq.${existingPayment.id}`,
    {
      body: JSON.stringify({
        refund_amount: toAmount(refunded),
        refunded_at: new Date().toISOString(),
        status: paymentStatus,
        updated_date_time: new Date().toISOString(),
      }),
      headers: { Prefer: "return=minimal" },
      method: "PATCH",
    }
  );

  if (!updateResponse.ok) {
    throw new Error("payment_refund_update_failed");
  }

  // Only re-lock the report on a FULL refund. A partial (goodwill / partial
  // dispute settlement) keeps the user's access — they paid for the report
  // and only some money came back; revoking access would be hostile UX and
  // the most common support-ticket source on a refund flow.
  if (!isPartialRefund && existingPayment.personal_report_id) {
    await updatePersonalReportPayment({
      amount: toAmount(captured),
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

  const refundAmount = toAmount(refunded);
  const refundCurrency = (charge.currency ?? "eur").toUpperCase();
  const refundLabel = isPartialRefund ? "Partial refund" : "Refund";
  await notifySlack({
    channel: "ops",
    kind: "stripe_refund",
    text: `:money_with_wings: ${refundLabel} — payment #${existingPayment.id} ${refundCurrency} ${refundAmount?.toFixed(2) ?? "?"} (charge ${escapeSlack(charge.id)})${isPartialRefund ? " — access preserved" : ""}`,
    username: "ops_alerts",
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

  const disputeAmount = toAmount(dispute.amount);
  const disputeCurrency = (dispute.currency ?? "eur").toUpperCase();
  if (outcome === "opened") {
    await notifySlack({
      channel: "ops",
      kind: "stripe_dispute_opened",
      text: `:rotating_light: Dispute opened — payment #${existingPayment.id} ${disputeCurrency} ${disputeAmount?.toFixed(2) ?? "?"} — reason: ${escapeSlack(dispute.reason ?? "unknown")}`,
      username: "ops_alerts",
    });
  } else {
    const verdict = dispute.status === "won" ? ":trophy: WON" : `:no_entry: ${dispute.status}`;
    await notifySlack({
      channel: "ops",
      kind: "stripe_dispute_resolved",
      text: `Dispute resolved (${verdict}) — payment #${existingPayment.id} ${disputeCurrency} ${disputeAmount?.toFixed(2) ?? "?"} — access ${restoreToSucceeded ? "restored" : "stays locked"}`,
      username: "ops_alerts",
    });
  }
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
        // Surface previously-unhandled Stripe event types so we catch new
        // behaviors before they become invisible regressions. Marked
        // processed=true above so the dead-letter logic doesn't retry.
        logger.info({ eventId: event.id, type: event.type }, "Stripe webhook: unknown event type");
        await notifySlack({
          channel: "ops",
          kind: "stripe_unknown_event",
          text: `:question: Stripe webhook saw an unhandled event type — *${escapeSlack(event.type)}* (event ${escapeSlack(event.id)}). Consider adding a handler or explicit ignore.`,
          username: "ops_alerts",
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
