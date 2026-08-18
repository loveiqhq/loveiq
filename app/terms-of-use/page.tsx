import type { Metadata } from "next";
import WNavSection from "@features/landing/ui/white/WNavSection";
import WFooterSection from "@features/landing/ui/white/WFooterSection";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.loveiq.org";

export const metadata: Metadata = {
  title: "Terms of Use | LoveIQ",
  description: "LoveIQ Terms of Use - Rules and guidelines for using our platform.",
  alternates: {
    canonical: `${siteUrl}/terms-of-use`,
  },
};

export default function TermsOfUsePage() {
  return (
    <>
      <style>{"html,body{background:#ffffff;}"}</style>
      <WNavSection />
      <main className="min-h-screen bg-white px-4 pt-32 pb-20 sm:pt-40">
        <article className="mx-auto max-w-3xl">
          <h1 className="font-serif font-light text-[#161021] mb-10" style={{ fontSize: "36px" }}>
            Terms of Use
          </h1>

          <div
            className="font-sans space-y-8 text-gray-600 leading-relaxed"
            style={{ fontSize: "18px" }}
          >
            {/* Intro */}
            <section>
              <p className="mb-4">
                These Terms of Use govern how you may access and use the LoveIQ platform operated
                by:
              </p>
              <p className="mb-4">
                Applied Psychometrics UG (in formation) (haftungsbeschränkt)
                <br />
                Hasenheide 62
                <br />
                10967 Berlin
                <br />
                Germany
              </p>
              <p className="mb-4">
                Managing Director: Marcus Börner
                <br />
                Email:{" "}
                <a
                  href="mailto:hello@loveiq.org"
                  className="text-[#C2410C] hover:text-[#fe6839] transition-colors"
                >
                  hello@loveiq.org
                </a>
              </p>
              <p className="mb-4">(&quot;LoveIQ&quot;, &quot;we&quot;, &quot;us&quot;)</p>
              <p>By accessing or using LoveIQ, you agree to these Terms of Use.</p>
            </section>

            {/* Section 1 */}
            <section>
              <h2 className="text-gray-900 font-semibold mb-4">1. Purpose of LoveIQ</h2>
              <p className="mb-4">LoveIQ provides digital tools for:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>psychometric self-exploration</li>
                <li>relationship and sexuality insights</li>
                <li>personal reflection and education</li>
              </ul>
              <p>LoveIQ is not a medical, therapeutic, or diagnostic service.</p>
            </section>

            {/* Section 2 */}
            <section>
              <h2 className="text-gray-900 font-semibold mb-4">2. Eligibility</h2>
              <p className="mb-4">You may use LoveIQ only if:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>you are at least 18 years old</li>
                <li>you have legal capacity to enter into contracts</li>
                <li>you provide truthful and complete information</li>
              </ul>
            </section>

            {/* Section 3 */}
            <section>
              <h2 className="text-gray-900 font-semibold mb-4">3. User Account</h2>
              <p className="mb-4">You are responsible for:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>maintaining the confidentiality of your login</li>
                <li>all activity under your account</li>
                <li>keeping your information accurate and up to date</li>
              </ul>
              <p>You must not share, sell, or transfer your account.</p>
            </section>

            {/* Section 4 */}
            <section>
              <h2 className="text-gray-900 font-semibold mb-4">4. Acceptable Use</h2>
              <p className="mb-4">You agree to use LoveIQ only for:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>personal</li>
                <li>lawful</li>
                <li>non-commercial purposes</li>
              </ul>
              <p className="mb-4">You must not:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>scrape, copy, or resell reports or content</li>
                <li>
                  reverse-engineer or attempt to extract models, scoring systems, or algorithms
                </li>
                <li>use bots, automation, or scripts</li>
                <li>interfere with platform security or availability</li>
              </ul>
            </section>

            {/* Section 5 */}
            <section>
              <h2 className="text-gray-900 font-semibold mb-4">5. Data Integrity</h2>
              <p className="mb-4">You must not:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>provide false, misleading, or manipulative answers</li>
                <li>attempt to influence or game the psychometric system</li>
              </ul>
              <p>Doing so may lead to account suspension or termination.</p>
            </section>

            {/* Section 6 */}
            <section>
              <h2 className="text-gray-900 font-semibold mb-4">6. Reliance on Results</h2>
              <p className="mb-4">LoveIQ results are:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>informational</li>
                <li>exploratory</li>
                <li>subjective models of self-perception</li>
              </ul>
              <p className="mb-4">You must not use LoveIQ:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>for medical decisions</li>
                <li>for diagnosing mental health conditions</li>
                <li>for legal, financial, or life-critical decisions</li>
              </ul>
            </section>

            {/* Section 7 */}
            <section>
              <h2 className="text-gray-900 font-semibold mb-4">7. Content Standards</h2>
              <p className="mb-4">You must not upload or submit:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>illegal content</li>
                <li>abusive, hateful, or harmful material</li>
                <li>content that violates the rights of others</li>
              </ul>
              <p>We may remove content at our discretion.</p>
            </section>

            {/* Section 8 */}
            <section>
              <h2 className="text-gray-900 font-semibold mb-4">8. Monitoring and Enforcement</h2>
              <p className="mb-4">We may:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>monitor usage</li>
                <li>investigate violations</li>
                <li>suspend or terminate access</li>
              </ul>
              <p>
                We are not required to provide prior notice where necessary to protect users, the
                platform, or legal compliance.
              </p>
            </section>

            {/* Section 9 */}
            <section>
              <h2 className="text-gray-900 font-semibold mb-4">9. Platform Changes</h2>
              <p className="mb-4">We may modify:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>features</li>
                <li>reports</li>
                <li>scoring logic</li>
                <li>access rules</li>
              </ul>
              <p>You have no claim to any specific version or result.</p>
            </section>

            {/* Section 10 */}
            <section>
              <h2 className="text-gray-900 font-semibold mb-4">10. Termination</h2>
              <p className="mb-4">We may suspend or terminate your access if you:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>violate these Terms</li>
                <li>misuse the platform</li>
                <li>attempt fraud or abuse</li>
              </ul>
              <p>You may stop using LoveIQ at any time.</p>
            </section>

            {/* Section 11 */}
            <section>
              <h2 className="text-gray-900 font-semibold mb-4">11. Liability</h2>
              <p className="mb-4">We are not responsible for:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>decisions you make based on LoveIQ outputs</li>
                <li>emotional, relational, or personal consequences</li>
                <li>misunderstandings of psychometric results</li>
              </ul>
              <p>Use is at your own risk.</p>
            </section>

            {/* Section 12 */}
            <section>
              <h2 className="text-gray-900 font-semibold mb-4">12. Governing Law</h2>
              <p>These Terms are governed by the laws of the Federal Republic of Germany.</p>
            </section>
          </div>
        </article>
      </main>
      <WFooterSection />
    </>
  );
}
