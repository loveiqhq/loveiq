import type { Metadata } from "next";
import { headers } from "next/headers";
import { after } from "next/server";
import SurveyPage from "@features/survey/ui/SurveyPage";
import { readPrepaidToken, type SurveyJourney } from "@features/pay-to-start/logic/journey";
import { offerDefinitionOf } from "@features/pay-to-start/logic/offer";
import { findEntitlementByToken } from "@features/pay-to-start/server/entitlement";
import { recordSurveyPageView } from "@shared/observability/recordVisit";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.loveiq.org";

export const metadata: Metadata = {
  title: "Survey Intro | LoveIQ",
  description:
    "Prepare to discover your sexual archetypes with LoveIQ's science-backed assessment. This short guide helps you get the most meaningful and accurate results.",
  alternates: {
    canonical: `${siteUrl}/survey`,
  },
  openGraph: {
    title: "Survey Intro | LoveIQ",
    description:
      "Prepare to discover your sexual archetypes with LoveIQ's science-backed assessment.",
    url: `${siteUrl}/survey`,
    siteName: "LoveIQ",
    type: "website",
    images: [
      {
        url: `${siteUrl}/images/og-image.png`,
        width: 1200,
        height: 630,
        alt: "LoveIQ - Science-backed sexual psychology assessment",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Survey Intro | LoveIQ",
    description:
      "Prepare to discover your sexual archetypes with LoveIQ's science-backed assessment.",
    images: [`${siteUrl}/images/og-image.png`],
  },
};

/**
 * A visitor who paid before the survey (pay to start): their entitlement cookie holds an
 * unused entitlement that is paid or still settling. Null for everyone else, and on any
 * failure, which leaves the survey exactly as it is for everyone.
 */
async function payToStartJourney(cookieHeader: string | null): Promise<SurveyJourney | null> {
  const token = readPrepaidToken(cookieHeader);
  if (!token) return null;
  try {
    const entitlement = await findEntitlementByToken(token);
    if (!entitlement || entitlement.consumed_submission_id) return null;
    if (entitlement.status !== "succeeded" && entitlement.status !== "pending") return null;
    return {
      kind: "pay_to_start",
      paid: entitlement.status === "succeeded",
      returnPath: offerDefinitionOf(entitlement.offer).landingPath,
    };
  } catch {
    return null;
  }
}

export default async function Page() {
  /**
   * Consent-independent daily survey-page count. Middleware flags the first
   * survey view per browser per day via `x-liq-new-survey`; record it AFTER the
   * response so it never blocks render, exactly as the root layout does for
   * `x-liq-new-visit`.
   *
   * This is the numerator that can honestly sit under "Visits": same writer,
   * same throwaway per-day id, same Berlin day, same consent posture. The
   * browser-posted `survey_engine_mount` beside it needs the `__liq_vid` cookie,
   * which is only minted after someone accepts — see recordSurveyPageView.
   */
  const headersList = await headers();
  const newSurveyVariant = headersList.get("x-liq-new-survey");
  if (newSurveyVariant) {
    const utmSource = headersList.get("x-liq-new-visit-utm") ?? undefined;
    after(() => recordSurveyPageView(newSurveyVariant, utmSource));
  }

  return <SurveyPage journey={await payToStartJourney(headersList.get("cookie"))} />;
}
