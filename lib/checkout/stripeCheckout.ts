import Stripe from "stripe";
import type { ReportPurchasePlanId } from "./reportPurchase";
import type { ReportAccessPlan } from "@/lib/report/access";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

export const STRIPE_CHECKOUT_DISABLED_MESSAGE =
  "Checkout preview only. Payments are not enabled in this environment yet.";

const SUPABASE_TIMEOUT_MS = 5_000;

export type StripeCheckoutSessionResponse =
  | {
      enabled: false;
      message: string;
      reason: "checkout_disabled";
    }
  | {
      enabled: true;
      url: string;
    };

export interface StripeCheckoutPurchaseAnalytics {
  value: number;
  currency: string;
  transaction_id: string;
  pricing_cluster_id?: string;
  base_price_bucket?: string;
  experiment_group?: string;
  discount_step?: number;
  country_tier?: string;
  device_type?: string;
  traffic_source?: string;
  engagement_score?: number;
  behavioral_bucket?: string;
  initial_price?: number;
}

export type StripeCheckoutSessionStatusResponse =
  | {
      enabled: false;
      message: string;
      reason: "checkout_disabled";
    }
  | {
      enabled: true;
      accessPlan: ReportAccessPlan;
      paymentStatus: string | null;
      purchaseAnalytics: StripeCheckoutPurchaseAnalytics | null;
      sessionStatus: string | null;
    };

let stripeClient: Stripe | null = null;

function normalizeCustomerEmail(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

function getSubmissionUserEmail(
  appUser:
    | {
        email: string | null;
      }
    | Array<{
        email: string | null;
      }>
    | null
) {
  if (Array.isArray(appUser)) {
    return normalizeCustomerEmail(appUser[0]?.email ?? null);
  }

  return normalizeCustomerEmail(appUser?.email ?? null);
}

export function isStripeCheckoutEnabled() {
  return process.env.STRIPE_CHECKOUT_ENABLED === "true";
}

export function getStripeServerClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    return null;
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey);
  }

  return stripeClient;
}

export function getStripePriceId(plan: ReportPurchasePlanId) {
  switch (plan) {
    case "essentials":
      return process.env.STRIPE_PRICE_ID_ESSENTIALS ?? null;
    case "full_report":
      return process.env.STRIPE_PRICE_ID_FULL_REPORT ?? null;
    case "all_reports":
      return process.env.STRIPE_PRICE_ID_ALL_REPORTS ?? null;
    default:
      return null;
  }
}

export async function getStripeCheckoutCustomerEmail({
  reportSessionId,
  reportToken,
}: {
  reportSessionId?: string | null;
  reportToken?: string | null;
}) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  let submissionId: number | null = null;

  if (reportToken) {
    const tokenResponse = await fetchWithTimeout(
      `${supabaseUrl}/rest/v1/report_access_token?token=eq.${encodeURIComponent(reportToken)}&select=survey_submission_id&limit=1`,
      {
        cache: "no-store",
        headers,
        timeoutMs: SUPABASE_TIMEOUT_MS,
      }
    );

    if (!tokenResponse.ok) {
      return null;
    }

    const tokenRows = (await tokenResponse.json()) as Array<{ survey_submission_id: number }>;
    submissionId = tokenRows[0]?.survey_submission_id ?? null;
  } else if (reportSessionId) {
    const submissionResponse = await fetchWithTimeout(
      `${supabaseUrl}/rest/v1/survey_submission?session_id=eq.${encodeURIComponent(reportSessionId)}&select=id&limit=1`,
      {
        cache: "no-store",
        headers,
        timeoutMs: SUPABASE_TIMEOUT_MS,
      }
    );

    if (!submissionResponse.ok) {
      return null;
    }

    const submissionRows = (await submissionResponse.json()) as Array<{ id: number }>;
    submissionId = submissionRows[0]?.id ?? null;
  }

  if (!submissionId) {
    return null;
  }

  const userResponse = await fetchWithTimeout(
    `${supabaseUrl}/rest/v1/survey_submission?id=eq.${submissionId}&select=app_user!fk_survey_submission_user(email)&limit=1`,
    {
      cache: "no-store",
      headers,
      timeoutMs: SUPABASE_TIMEOUT_MS,
    }
  );

  if (!userResponse.ok) {
    return null;
  }

  const rows = (await userResponse.json()) as Array<{
    app_user:
      | {
          email: string | null;
        }
      | Array<{
          email: string | null;
        }>
      | null;
  }>;

  return getSubmissionUserEmail(rows[0]?.app_user ?? null);
}
