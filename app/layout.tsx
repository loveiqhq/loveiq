import "./globals.css";
import Script from "next/script";
import type { Metadata, Viewport } from "next";
import { Lora, Manrope } from "next/font/google";
import { headers } from "next/headers";
import SmoothScroll from "@shared/ui/SmoothScroll";
import { NonceProvider } from "@shared/ui/NonceProvider";
import HydrationMarker from "@shared/ui/HydrationMarker";
import UtmCapture from "@shared/ui/UtmCapture";
import { GtmScript, GtmNoScript } from "@shared/ui/GtmScript";
import { isTrustpilotEnabled } from "@shared/ui/trustpilot/config";
import UxSignals from "@shared/ui/UxSignals";
import WebVitals from "@shared/ui/WebVitals";
import { after } from "next/server";
import { recordUniqueVisit } from "@shared/observability/recordVisit";
import { jsonLdString } from "@shared/seo/json-ld";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.loveiq.org";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

const lora = Lora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

// Stable knowledge-graph id so WebSite/SoftwareApplication (here) and the
// per-page Person nodes (homepage advisors, /about team) all reconcile to one
// Organization entity instead of orphan snippets.
const organizationId = `${siteUrl}/#organization`;

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": organizationId,
  name: "LoveIQ",
  legalName: "Applied Psychometrics UG (haftungsbeschränkt)",
  url: siteUrl,
  logo: {
    "@type": "ImageObject",
    url: `${siteUrl}/images/loveiq-mark-512.png`,
    width: 512,
    height: 512,
  },
  slogan: "Democratizing sexual psychology.",
  description:
    "LoveIQ translates complex sexual-psychology research into private, science-backed, actionable insights — mapping desire patterns, attachment style, and intimacy across psychological dimensions.",
  email: "hello@loveiq.org",
  knowsAbout: [
    "Sexual psychology",
    "Attachment theory",
    "Relationship intimacy",
    "Sexual communication",
    "Psychometric assessment",
  ],
  contactPoint: {
    "@type": "ContactPoint",
    email: "hello@loveiq.org",
    contactType: "customer support",
  },
  address: {
    "@type": "PostalAddress",
    streetAddress: "Hasenheide 62",
    addressLocality: "Berlin",
    addressRegion: "Berlin",
    postalCode: "10967",
    addressCountry: "DE",
  },
};

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${siteUrl}/#website`,
  name: "LoveIQ",
  url: siteUrl,
  inLanguage: "en-US",
  publisher: { "@id": organizationId },
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${siteUrl}/glossary?q={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "LoveIQ | Science-backed sexual psychology assessment",
  description:
    "Take LoveIQ's science-backed sexual psychology assessment to understand your desires, attachment patterns, and intimacy styles.",
  alternates: {
    canonical: siteUrl,
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "LoveIQ | Science-backed sexual psychology assessment",
    description:
      "Take LoveIQ's science-backed sexual psychology assessment to understand your desires, attachment patterns, and intimacy styles.",
    url: siteUrl,
    siteName: "LoveIQ",
    type: "website",
    locale: "en_US",
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
    title: "LoveIQ | Science-backed sexual psychology assessment",
    description:
      "Take LoveIQ's science-backed sexual psychology assessment to understand your desires, attachment patterns, and intimacy styles.",
    images: [`${siteUrl}/images/og-image.png`],
  },
  // Google Search Console property verification. Renders
  // <meta name="google-site-verification" ...> into <head> on every route.
  // Search Console only requires the tag to be somewhere in <head> — its
  // position there is not part of the check, and Next owns the tag order.
  verification: {
    google: "nVfAGktr8B1Ozc61mSDqVm6j0DuYsgyZIu5EnwKXmlk",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
};

// Trustpilot review widget. The bootstrap is loaded only when the master kill
// switch is on (isTrustpilotEnabled) AND a Business Unit ID is configured, and
// only after the visitor grants the CookieYes `functional` category (it sets
// Trustpilot's third-party cookies). Gated off by default until we have enough
// reviews, so the script never loads while the on-site widgets are hidden.
const trustpilotBusinessUnitId =
  isTrustpilotEnabled() && (process.env.NEXT_PUBLIC_TRUSTPILOT_BUSINESS_UNIT_ID || "").trim()
    ? (process.env.NEXT_PUBLIC_TRUSTPILOT_BUSINESS_UNIT_ID || "").trim()
    : null;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const nonce = headersList.get("x-nonce") || "";

  // Consent-independent daily unique-visit count. Middleware flags the first
  // countable page view per browser per day via x-liq-new-visit; record it
  // AFTER the response so it never blocks render. Aggregate + non-identifying
  // (see recordUniqueVisit / proxy.ts) — this is the Visitor→Survey-start
  // denominator that the consent-gated client pinger previously under-counted.
  const newVisitVariant = headersList.get("x-liq-new-visit");
  if (newVisitVariant) {
    const newVisitUtm = headersList.get("x-liq-new-visit-utm") ?? undefined;
    after(() => recordUniqueVisit(newVisitVariant, newVisitUtm));
  }

  return (
    <html lang="en" className={`${manrope.variable} ${lora.variable}`}>
      <head>
        <link rel="preconnect" href="https://cdn-cookieyes.com" />
        <link rel="preconnect" href="https://www.clarity.ms" />
        <link rel="preconnect" href="https://www.googletagmanager.com" />
        <link rel="dns-prefetch" href="https://www.google.com" />
        <link rel="dns-prefetch" href="https://www.gstatic.com" />
        <link rel="dns-prefetch" href="https://images.unsplash.com" />
        <Script
          id="cookieyes"
          src="https://cdn-cookieyes.com/client_data/761bc9303937f7b41b200de8ed556d45/script.js"
          strategy="lazyOnload"
          nonce={nonce}
        />
        <GtmScript nonce={nonce} />
        <Script
          id="ga-loader"
          src="https://www.googletagmanager.com/gtag/js?id=G-QTYY69L46N"
          strategy="lazyOnload"
          nonce={nonce}
          data-cookieyes="cookieyes-analytics"
        />
        <Script
          id="ga-init"
          strategy="lazyOnload"
          nonce={nonce}
          data-cookieyes="cookieyes-analytics"
        >
          {`
            window.dataLayer = window.dataLayer || [];
            window.gtag = window.gtag || function(){window.dataLayer.push(arguments);}
            if (!window.__loveiqGtagBootstrapped) {
              window.gtag('js', new Date());
              window.__loveiqGtagBootstrapped = true;
            }
            window.__loveiqAnalyticsEnabled = true;
            window.gtag('config', 'G-QTYY69L46N', {
              page_path: window.location.pathname,
            });
          `}
        </Script>
        <Script
          id="google-ads-loader"
          src="https://www.googletagmanager.com/gtag/js?id=AW-18068690553"
          strategy="lazyOnload"
          nonce={nonce}
          data-cookieyes="cookieyes-advertisement"
        />
        <Script
          id="google-ads-init"
          strategy="lazyOnload"
          nonce={nonce}
          data-cookieyes="cookieyes-advertisement"
        >
          {`
            window.dataLayer = window.dataLayer || [];
            window.gtag = window.gtag || function(){window.dataLayer.push(arguments);}
            if (!window.__loveiqGtagBootstrapped) {
              window.gtag('js', new Date());
              window.__loveiqGtagBootstrapped = true;
            }
            window.__loveiqGoogleAdsEnabled = true;
            window.gtag('config', 'AW-18068690553');
          `}
        </Script>
        {trustpilotBusinessUnitId && (
          <Script
            id="trustpilot-bootstrap"
            src="https://widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.js"
            strategy="lazyOnload"
            nonce={nonce}
            data-cookieyes="cookieyes-functional"
          />
        )}
        {/* Organization + WebSite are global (describe the whole site). Page-specific
            entities live on their page: SoftwareApplication + FAQPage on the homepage,
            Person graphs on / and /about, DefinedTerm(Set) in the glossary. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdString(organizationSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdString(websiteSchema) }}
        />
        {/* Microsoft Clarity (session replay + heatmaps) — the only behavioural
            recorder on the site; it replaced Hotjar and Contentsquare, which
            were removed in the same change rather than run three tools over the
            same sessions.

            DELIBERATELY NOT CONSENT-GATED (owner decision, 2026-08-10). This
            tag carries no type="text/plain" / data-cookieyes, so it executes on
            every page load for every visitor regardless of the CookieYes
            banner. That is a reversal of audit finding H1, taken knowingly to
            maximise recorded sessions. Consequences, all documented in
            docs/compliance/{DPIA,ROPA,LAWFUL_BASIS}.md: recording of EU
            visitors happens without consent, and the survey mask was removed in
            the same change, so Article-9 answers are captured. Re-gating is a
            one-line change — restore type="text/plain" + data-cookieyes, which
            is the only mechanism measured to actually withhold a tag here.
            Bootstrap lives in public/clarity-init.js — see that file for why it
            is not inline. */}
        <script src="/clarity-init.js" defer />
      </head>
      <body className="bg-white dark:bg-[#050208]">
        <GtmNoScript />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-black focus:shadow-lg"
        >
          Skip to main content
        </a>
        <HydrationMarker />
        <UtmCapture />
        <WebVitals />
        <UxSignals />
        <NonceProvider nonce={nonce}>
          <SmoothScroll>{children}</SmoothScroll>
        </NonceProvider>
      </body>
    </html>
  );
}
