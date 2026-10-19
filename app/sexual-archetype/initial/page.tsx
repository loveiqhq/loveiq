import type { Metadata } from "next";
import { getPayToStartOffer } from "@features/pay-to-start/server/offer";
import { PayToStartLanding } from "@features/pay-to-start/ui/landing/PayToStartLanding";
import { PTS_HERO } from "@features/pay-to-start/ui/landing/payToStartContent";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.loveiq.org";

/**
 * Pay to start, the initial report (Marcus, 19.10; Figma Report-3.0 "Pay to start >
 * Pre-Payments", 1733:4089 and 1733:4424): the page its search ad sends to. The survey and
 * the report pre-unlocked, for the offer's price: the Core Archetype in full and a credit
 * toward the full report. Kept out of the index and the sitemap, as the full report's page
 * is; nothing on the site links here. Under `/sexual-archetype`, so its visits are labelled
 * as that journey's (proxy.ts).
 */
export const metadata: Metadata = {
  title: "What’s my sexual archetype? | LoveIQ",
  description: PTS_HERO.lead,
  robots: { index: false, follow: false },
  alternates: { canonical: `${siteUrl}/sexual-archetype/initial` },
  openGraph: {
    title: "What’s my sexual archetype?",
    description: PTS_HERO.lead,
    url: `${siteUrl}/sexual-archetype/initial`,
    siteName: "LoveIQ",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "What’s my sexual archetype?",
    description: PTS_HERO.lead,
  },
};

export default function SexualArchetypeInitialPage() {
  const offer = getPayToStartOffer("pre");
  return <PayToStartLanding offer={offer.id} priceCents={offer.priceCents} />;
}
