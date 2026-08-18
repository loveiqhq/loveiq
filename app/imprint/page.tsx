import type { Metadata } from "next";
import WNavSection from "@features/landing/ui/white/WNavSection";
import WFooterSection from "@features/landing/ui/white/WFooterSection";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.loveiq.org";

export const metadata: Metadata = {
  title: "Imprint | LoveIQ",
  description: "LoveIQ Imprint - Legal information and company details.",
  alternates: {
    canonical: `${siteUrl}/imprint`,
  },
};

export default function ImprintPage() {
  return (
    <>
      <style>{"html,body{background:#ffffff;}"}</style>
      <WNavSection />
      <main className="min-h-screen bg-white px-4 pt-32 pb-20 sm:pt-40">
        <article className="mx-auto max-w-3xl">
          <h1 className="font-serif font-light text-[#161021] mb-10" style={{ fontSize: "36px" }}>
            Imprint
          </h1>

          <div
            className="font-sans space-y-6 text-gray-600 leading-relaxed"
            style={{ fontSize: "18px" }}
          >
            <p>
              <span className="font-semibold text-gray-900">Applied Psychometrics UG</span>{" "}
              (haftungsbeschränkt)
              <br />
              Hasenheide 62,
              <br />
              10967 Berlin
              <br />
              Germany
            </p>

            <p>Commercial Register: HRB 282986 B</p>

            {/* P-15: VAT ID still pending from accounting. TMG §5 requires this once
                the entity is VAT-registered; replace "TBD" with the issued
                "DEnnnnnnnnn" identifier and remove this comment. */}
            <p>VAT Identification Number pursuant to §27a UStG: TBD</p>

            <p>Managing Director: Marcus Börner</p>

            <p>
              Responsible for content pursuant to § 18 (2) of the German Interstate
              <br />
              Media Treaty (MStV): Marcus Börner, Hasenheide 62, 10967 Berlin
            </p>

            <p>
              Email:{" "}
              <a
                href="mailto:hello@loveiq.org"
                className="text-[#C2410C] hover:text-[#fe6839] transition-colors"
              >
                hello@loveiq.org
              </a>
            </p>
          </div>
        </article>
      </main>
      <WFooterSection />
    </>
  );
}
