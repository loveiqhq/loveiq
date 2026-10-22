import type { Metadata } from "next";
import { getPayToStartOffer } from "@features/pay-to-start/server/offer";
import { PayToStartLanding } from "@features/pay-to-start/ui/landing/PayToStartLanding";
import { PTS_HERO } from "@features/pay-to-start/ui/landing/payToStartContent";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.loveiq.org";

/**
 * Pay to start the survey (Notion "RFD > Pay to start survey"): the page the search ad
 * sends to. Kept out of the index and out of the sitemap; nothing on the site links here.
 * LoveIQ-branded until the new brand is ready (Marcus, 18.10). The Open Graph tags are its
 * own, so a shared link shows this page's title, not the home page's card.
 */
export const metadata: Metadata = {
  title: "What’s my sexual archetype? | LoveIQ",
  description: PTS_HERO.lead,
  robots: { index: false, follow: false },
  alternates: { canonical: `${siteUrl}/sexual-archetype` },
  openGraph: {
    title: "What’s my sexual archetype?",
    description: PTS_HERO.lead,
    url: `${siteUrl}/sexual-archetype`,
    siteName: "LoveIQ",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "What’s my sexual archetype?",
    description: PTS_HERO.lead,
  },
};

export default function SexualArchetypePage() {
  // Read per request, so every price on the page is the price Stripe will be asked for.
  const offer = getPayToStartOffer("full");
  return <PayToStartLanding offer={offer.id} priceCents={offer.priceCents} />;
}
