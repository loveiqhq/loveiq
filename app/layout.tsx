import "./globals.css";
import Script from "next/script";
import type { Metadata, Viewport } from "next";
import { Lora, Manrope } from "next/font/google";
import { headers } from "next/headers";
import SmoothScroll from "@/components/SmoothScroll";
import { NonceProvider } from "@/components/NonceProvider";
import HydrationMarker from "@/components/HydrationMarker";
import UtmCapture from "@/components/UtmCapture";
import { GtmScript, GtmNoScript } from "@/components/GtmScript";

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

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "LoveIQ",
  url: siteUrl,
  logo: `${siteUrl}/images/LoveiqLogo.svg`,
  contactPoint: {
    "@type": "ContactPoint",
    email: "hello@loveiq.org",
    contactType: "customer support",
  },
  address: {
    "@type": "PostalAddress",
    addressLocality: "Berlin",
    addressCountry: "DE",
  },
};

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "LoveIQ",
  url: siteUrl,
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${siteUrl}/glossary?q={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
};

const softwareApplicationSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "LoveIQ",
  description:
    "Science-backed sexual psychology assessment that maps your desire patterns, attachment style, and intimacy blueprint across 14 psychological dimensions.",
  url: "https://www.loveiq.org",
  applicationCategory: "HealthApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "EUR",
    description: "Free introductory assessment. Advanced reports available as one-time purchase.",
  },
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "4.9",
    ratingCount: "30000",
    bestRating: "5",
    worstRating: "1",
  },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Is this a test or an ongoing journey?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "LoveIQ is not a one-off quiz. It is a guided journey of self-understanding. You begin with a core assessment, and your profile can deepen over time as you explore additional topics, reflections, and optional follow-ups. Continued engagement allows your insights to become more precise and personalized.",
      },
    },
    {
      "@type": "Question",
      name: "What exactly does this app do?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "LoveIQ analyzes how you think, feel, communicate, and relate. It translates your responses into a personalized archetype profile and relationship intelligence report that highlights patterns, strengths, challenges, and compatibility dynamics.",
      },
    },
    {
      "@type": "Question",
      name: "How is my data used and protected?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Your data is encrypted, private, and never sold. Responses are used only to generate your results and to improve our models in anonymized form. You can delete or export your data at any time.",
      },
    },
    {
      "@type": "Question",
      name: "What kind of results will I receive?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Depending on the product you use, your results may include: Archetype match scores; Trait patterns across psychological dimensions; Strengths, challenges, and blind spots; Practical insights for attraction, communication, intimacy, and long-term compatibility. The reports are designed to feel both emotionally resonant and scientifically grounded.",
      },
    },
    {
      "@type": "Question",
      name: "Who is this app for?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "LoveIQ is for anyone seeking deeper clarity about themselves and their relationship patterns—whether single, dating, or in a long-term partnership. It is especially relevant for people who value self-awareness, emotional intelligence, and personal growth.",
      },
    },
    {
      "@type": "Question",
      name: "Is it based on science?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. LoveIQ draws from relationship psychology, attachment theory, personality science, behavioral research, and large-scale pattern analysis. These foundations are combined with modern machine-learning techniques to create a rigorous and human-centered system.",
      },
    },
    {
      "@type": "Question",
      name: "How accurate are the insights?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Accuracy depends on the clarity and honesty of your inputs. The model identifies consistent patterns across multiple dimensions, going beyond a casual personality quiz. While no system can capture every nuance of a person, many users report that the insights feel precise and personally meaningful.",
      },
    },
    {
      "@type": "Question",
      name: "Will I get recommendations or next steps?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Your profile includes tailored suggestions such as communication strategies, dating insights, intimacy considerations, and long-term growth paths. Optional follow-up modules allow for deeper exploration.",
      },
    },
    {
      "@type": "Question",
      name: "Is it anonymous?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. You can use LoveIQ with only an email address, and in some cases without entering your name. Your answers are private unless you choose to share your results.",
      },
    },
    {
      "@type": "Question",
      name: "Can I talk to a professional or coach through the app?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "We are working with selected psychologists and relationship coaches to offer optional paid sessions. These experts will be familiar with the LoveIQ framework and able to support you based on your profile.",
      },
    },
    {
      "@type": "Question",
      name: "Is it free?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "You can start with a free introductory assessment. Full reports and advanced insights are available through a one-time purchase.",
      },
    },
    {
      "@type": "Question",
      name: "How long does the first assessment take?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Most users complete the initial assessment in 7–12 minutes. It is mobile-friendly, intuitive, and can be paused and resumed at any time.",
      },
    },
    {
      "@type": "Question",
      name: "Can I save progress, revisit results, or share with a partner?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Progress is saved using a secure magic link sent to your email. You can resume, revisit results, or share them with a partner—no account required.",
      },
    },
  ],
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
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const nonce = headersList.get("x-nonce") || "";

  return (
    <html lang="en" className={`${manrope.variable} ${lora.variable}`}>
      <head>
        <link
          rel="preload"
          as="video"
          href="/couple-hero-mobile.mp4"
          type="video/mp4"
          media="(max-width: 640px)"
        />
        <link
          rel="preload"
          as="video"
          href="/couple-hero.mp4"
          type="video/mp4"
          media="(min-width: 641px)"
        />
        <link rel="preconnect" href="https://cdn-cookieyes.com" />
        <link rel="preconnect" href="https://www.googletagmanager.com" />
        <link rel="dns-prefetch" href="https://www.google.com" />
        <link rel="dns-prefetch" href="https://www.gstatic.com" />
        <link rel="dns-prefetch" href="https://images.unsplash.com" />
        <Script
          id="cookieyes"
          src="https://cdn-cookieyes.com/client_data/761bc9303937f7b41b200de8ed556d45/script.js"
          strategy="afterInteractive"
          nonce={nonce}
        />
        <GtmScript nonce={nonce} />
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-QTYY69L46N"
          strategy="lazyOnload"
          nonce={nonce}
        />
        <Script id="ga-init" strategy="lazyOnload" nonce={nonce}>
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-QTYY69L46N', {
              page_path: window.location.pathname,
            });
          `}
        </Script>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationSchema) }}
        />
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
        <NonceProvider nonce={nonce}>
          <SmoothScroll>{children}</SmoothScroll>
        </NonceProvider>
      </body>
    </html>
  );
}
