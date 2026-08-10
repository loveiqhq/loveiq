import { NextResponse } from "next/server";
import { reportCoreEmail } from "@features/report/server/emails/report-core";
import { reportFullEmail } from "@features/report/server/emails/report-full";
import { reportAllEmail } from "@features/report/server/emails/report-all";
import { reportEssentialsEmail } from "@features/report/server/emails/report-essentials";
import { partnerCodeEmail } from "@features/report/server/emails/nurture/partner-code";
import { nurture30hNoUnlockEmail } from "@features/report/server/emails/nurture/nurture-30h-no-unlock";
import { testLinkEmail } from "@features/survey/server/emails/test-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DEV-ONLY email preview. Renders a purchase / nurture email template to HTML so
 * it can be eyeballed in the browser (resize for mobile vs desktop). 404s in
 * production — this is a review aid, never a shipped surface. No secrets, no
 * sends: everything below is static sample data.
 *
 *   /api/dev/email-preview               → index of available templates
 *   /api/dev/email-preview?template=core → renders that template's HTML
 */

const SITE = "http://localhost:3001";
const REPORT_URL = `${SITE}/report/preview?from=email`;

const TEMPLATES: Record<string, () => { subject: string; html: string }> = {
  // Tier 1 — "Just a snapshot" (reuses the full-report confirmation)
  full: () =>
    reportFullEmail({
      firstName: "Alex",
      reportUrl: REPORT_URL,
      siteUrl: SITE,
      unlockedArchetype: "Spark Seeker",
    }),
  // Tier 2 — "All your core archetypes" (top-3 unlocked)
  core: () =>
    reportCoreEmail({
      firstName: "Alex",
      reportUrl: REPORT_URL,
      siteUrl: SITE,
      archetypes: ["Spark Seeker", "Sensual Connector", "Loyal Ritualist"],
    }),
  // Tier 3 — "For you & your partner" purchase confirmation
  all: () => reportAllEmail({ firstName: "Alex", reportUrl: REPORT_URL, siteUrl: SITE }),
  // Tier 3 — the one-time 100%-off partner code email
  partner: () =>
    partnerCodeEmail({
      firstName: "Alex",
      ctaUrl: `${SITE}/survey?${new URLSearchParams({
        utm_source: "email",
        utm_campaign: "partner_code",
      }).toString()}`,
      promoCode: "LIQ-100-A1B2C3D4",
      siteUrl: SITE,
    }),
  // The single nurture discount: −50% at 72h (reuses the 50%-off template)
  nurture72h: () =>
    nurture30hNoUnlockEmail({
      firstName: "Alex",
      ctaUrl: `${REPORT_URL}&promo=LIQ-50-X1Y2Z3W4`,
      promoCode: "LIQ-50-X1Y2Z3W4",
      percentOff: 50,
      siteUrl: SITE,
    }),
  // Landing "Not in the mood right now?" band → POST /api/test-link
  testLink: () =>
    testLinkEmail({
      // eslint-disable-next-line no-secrets/no-secrets
      testUrl: `${SITE}/survey?utm_source=loveiq_email&utm_medium=email&utm_campaign=test_link`,
      siteUrl: SITE,
      unsubscribeUrl: `${SITE}/api/unsubscribe?token=sample`,
    }),
  // Legacy (grandfathered) essentials confirmation
  essentials: () =>
    reportEssentialsEmail({
      firstName: "Alex",
      reportUrl: REPORT_URL,
      siteUrl: SITE,
      unlockedArchetype: "Spark Seeker",
    }),
};

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const key = new URL(request.url).searchParams.get("template");
  if (!key) {
    const links = Object.keys(TEMPLATES)
      .map((k) => `<li><a href="/api/dev/email-preview?template=${k}">${k}</a></li>`)
      .join("");
    return new Response(
      `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><h1>Email previews (dev only)</h1><ul>${links}</ul>`,
      { headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }

  const render = Object.prototype.hasOwnProperty.call(TEMPLATES, key)
    ? // eslint-disable-next-line security/detect-object-injection -- guarded by hasOwnProperty over a static map
      TEMPLATES[key]
    : null;
  if (!render) {
    return NextResponse.json({ error: "Unknown template." }, { status: 400 });
  }

  const { subject, html } = render();
  // Prepend the subject line so the reviewer sees it above the rendered body.
  const withSubject = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div style="font:14px system-ui;padding:8px 12px;background:#faf7ff;border-bottom:1px solid #eadcff"><strong>Subject:</strong> ${subject}</div>${html}`;
  return new Response(withSubject, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
