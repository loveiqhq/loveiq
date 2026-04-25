import { EMAIL_FONT, escapeHtml, renderCtaButton, wrapEmailShell } from "@/lib/emails/shared";
import {
  REPORT_PURCHASE_PLANS,
  formatReportPurchasePrice,
  getReportPurchasePlan,
  type ReportPurchasePlan,
  type ReportPurchasePlanId,
} from "@/lib/checkout/reportPurchase";
import type { ReportPriceQuoteSnapshot } from "@/lib/pricing/reportPricing";

export interface ReportDiscountEmailParams {
  ctaUrl: string;
  firstName?: string | null;
  /**
   * Live per-plan quotes. When a plan is missing the block falls back to the
   * catalogue strike price so the email still renders cleanly — the CTA is
   * still the correct action.
   */
  quotes: Partial<Record<ReportPurchasePlanId, ReportPriceQuoteSnapshot>> | null;
  siteUrl: string;
}

const PLAN_TAGLINES: Record<ReportPurchasePlanId, string> = {
  essentials: "Built for those with limited time.",
  full_report:
    "Everything unlocked across 18 dimensions — for those who want the complete picture.",
  all_reports:
    "All 14 archetypes unlocked — the full library, built for those wanting to explore beyond themselves.",
};

interface PlanPricing {
  oldLabel: string;
  newLabel: string;
  savedLabel: string | null;
  percentOff: number | null;
}

function formatEuroSuffix(cents: number): string {
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, "0");
  return `${euros},${fraction}€`;
}

function computePlanPricing(
  plan: ReportPurchasePlan,
  quote: ReportPriceQuoteSnapshot | undefined
): PlanPricing {
  // Strike = MSRP. Floor at catalogue `priceCents` so a stale/incomplete quote
  // (msrp missing or accidentally equal to the discounted current) never wipes
  // out the strike + saved line.
  const quoteMsrp = quote?.msrpCents;
  const strikeCents = Math.max(
    Number.isFinite(quoteMsrp) ? (quoteMsrp as number) : 0,
    plan.priceCents
  );
  const currentCents = quote?.currentPriceCents ?? plan.priceCents;

  if (
    !Number.isFinite(strikeCents) ||
    !Number.isFinite(currentCents) ||
    currentCents >= strikeCents
  ) {
    return {
      oldLabel: formatReportPurchasePrice(strikeCents),
      newLabel: formatReportPurchasePrice(currentCents),
      savedLabel: null,
      percentOff: null,
    };
  }

  const savedCents = strikeCents - currentCents;
  const percentOff = Math.round((savedCents / strikeCents) * 100);
  return {
    oldLabel: formatReportPurchasePrice(strikeCents),
    newLabel: formatReportPurchasePrice(currentCents),
    savedLabel: formatEuroSuffix(savedCents),
    percentOff,
  };
}

function firstNameDisplay(firstName?: string | null): { safe: string; plain: string } {
  const trimmed = firstName?.trim();
  if (trimmed) {
    return { safe: escapeHtml(trimmed), plain: trimmed };
  }
  return { safe: "there", plain: "there" };
}

function renderPlanBlockHtml(plan: ReportPurchasePlan, pricing: PlanPricing): string {
  const savedSpan =
    pricing.savedLabel && pricing.percentOff
      ? `<span style="color:#329000; font-weight:700;">${pricing.percentOff}% saved</span>
         <span style="color:#329000; font-weight:700;"> | -${escapeHtml(pricing.savedLabel)}</span>`
      : "";

  return `
  <p style="margin:0 0 4px 0; font-family:${EMAIL_FONT}; font-size:17px; font-weight:700; line-height:1.55; color:#000000;">
    ${escapeHtml(plan.title)}:
  </p>
  <p style="margin:0 0 4px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000; text-decoration:line-through;">
    ${escapeHtml(pricing.oldLabel)}
  </p>
  <p style="margin:0 0 4px 0; font-family:${EMAIL_FONT}; font-size:19px; font-weight:700; line-height:1.55; color:#000000;">
    ${escapeHtml(pricing.newLabel)}
  </p>
  ${savedSpan ? `<p style="margin:0 0 6px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55;">${savedSpan}</p>` : ""}
  <p style="margin:0 0 18px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
    ${escapeHtml(PLAN_TAGLINES[plan.plan])}
  </p>`;
}

function renderPlanBlockText(plan: ReportPurchasePlan, pricing: PlanPricing): string {
  const savedLine =
    pricing.savedLabel && pricing.percentOff
      ? `${pricing.percentOff}% saved | -${pricing.savedLabel}`
      : null;

  return [
    `${plan.title}:`,
    pricing.oldLabel,
    pricing.newLabel,
    ...(savedLine ? [savedLine] : []),
    PLAN_TAGLINES[plan.plan],
    "",
  ].join("\n");
}

export function reportDiscountEmail({
  ctaUrl,
  firstName,
  quotes,
  siteUrl,
}: ReportDiscountEmailParams) {
  const name = firstNameDisplay(firstName);
  const subject = "Special deal on your personal report";
  const previewText = `${name.plain}, your results are ready — now at a discounted price.`;

  const orderedPlans: ReportPurchasePlan[] = [
    getReportPurchasePlan("essentials"),
    getReportPurchasePlan("full_report"),
    getReportPurchasePlan("all_reports"),
  ];

  const planBlocksHtml = orderedPlans
    .map((plan) => renderPlanBlockHtml(plan, computePlanPricing(plan, quotes?.[plan.plan])))
    .join("");

  const planBlocksText = orderedPlans
    .map((plan) => renderPlanBlockText(plan, computePlanPricing(plan, quotes?.[plan.plan])))
    .join("\n");

  const bodyHtml = `
  <tr>
    <td style="padding:24px 32px 4px;">
      <h1 style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:24px; font-weight:700; line-height:1.35; color:#000000;">
        Your results are ready — now at a discounted price.
      </h1>
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        Hi ${name.safe},
      </p>
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        You completed the LoveIQ test — which means <strong style="font-weight:700;">your personalized report is ready.</strong> A lot of people never take that first step. You did. Your results are sitting there, and they&rsquo;re more specific than you might expect.
      </p>
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; font-weight:700; line-height:1.55; color:#000000;">
        Here&rsquo;s what&rsquo;s available to you right now:
      </p>
      ${planBlocksHtml}
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:16px 32px 24px;">
      ${renderCtaButton({ href: ctaUrl, label: "Secure discount on report" })}
    </td>
  </tr>
  <tr>
    <td style="padding:8px 32px 0;">
      <p style="margin:0 0 8px 0; font-family:${EMAIL_FONT}; font-size:17px; font-weight:700; line-height:1.55; color:#000000;">
        Why it&rsquo;s worth a look:
      </p>
      <ul style="margin:0 0 16px 0; padding-left:24px; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        <li style="margin:0 0 4px 0;">Built on psychology + real response patterns</li>
        <li style="margin:0 0 4px 0;">Practical insights you can actually use</li>
        <li style="margin:0;">Private by design — your data stays yours</li>
      </ul>
      <p style="margin:0 0 16px 0; font-family:${EMAIL_FONT}; font-size:17px; line-height:1.55; color:#000000;">
        Curious minds tend to get the most out of this.
      </p>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:8px 32px 32px;">
      <p style="margin:0 0 12px 0; font-family:${EMAIL_FONT}; font-size:16px; line-height:1.55; color:#000000; text-align:center;">
        If you have any questions or you&rsquo;d like to consult, feel free to reach out to us at
        <a href="mailto:hello@loveiq.org" style="color:#1a73e8; text-decoration:underline;">hello@loveiq.org</a>.
        We are happy to help.
      </p>
      <p style="margin:0 0 4px 0; font-family:${EMAIL_FONT}; font-size:16px; line-height:1.55; color:#000000; text-align:center;">
        With kindness,
      </p>
      <p style="margin:0; font-family:${EMAIL_FONT}; font-size:16px; line-height:1.55; color:#000000; text-align:center;">
        Your LoveIQ team
      </p>
    </td>
  </tr>`;

  const html = wrapEmailShell({ bodyHtml, previewText, siteUrl, title: subject });

  const text = [
    subject,
    "",
    "Your results are ready — now at a discounted price.",
    "",
    `Hi ${name.plain},`,
    "",
    "You completed the LoveIQ test — which means your personalized report is ready. A lot of people never take that first step. You did. Your results are sitting there, and they're more specific than you might expect.",
    "",
    "Here's what's available to you right now:",
    "",
    planBlocksText,
    `Secure discount on report: ${ctaUrl}`,
    "",
    "Why it's worth a look:",
    "- Built on psychology + real response patterns",
    "- Practical insights you can actually use",
    "- Private by design — your data stays yours",
    "",
    "Curious minds tend to get the most out of this.",
    "",
    "If you have any questions or you'd like to consult, feel free to reach out to us at hello@loveiq.org. We are happy to help.",
    "",
    "With kindness,",
    "Your LoveIQ team",
  ]
    .filter((line, idx, arr) => !(line === "" && arr[idx - 1] === ""))
    .join("\n");

  return { subject, html, text, siteUrl };
}

// Re-export for tests.
export { REPORT_PURCHASE_PLANS };
