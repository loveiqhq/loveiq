import type { Metadata } from "next";
import LegalNavSection from "@/components/legal/LegalNavSection";
import FooterSection from "@/components/landing/FooterSection";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.loveiq.org";

export const metadata: Metadata = {
  title: "Terms & Conditions | LoveIQ",
  description: "LoveIQ Terms and Conditions - General terms governing use of our services.",
  alternates: {
    canonical: `${siteUrl}/terms-and-conditions`,
  },
  robots: { index: false },
};

export default function TermsAndConditionsPage() {
  return (
    <>
      <LegalNavSection />
      <main className="min-h-screen px-4 py-20" style={{ backgroundColor: "#09050F" }}>
        <article className="mx-auto max-w-3xl">
          <h1 className="font-serif font-light text-white mb-10" style={{ fontSize: "36px" }}>
            Terms & Conditions
          </h1>

          <div
            className="font-sans space-y-8 text-gray-300 leading-relaxed"
            style={{ fontSize: "18px" }}
          >
            {/* Intro */}
            <section>
              <p className="mb-4">
                These Terms & Conditions (&quot;Terms&quot;) govern the contractual relationship
                between:
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
                  className="text-gray-300 hover:text-white transition-colors"
                >
                  hello@loveiq.org
                </a>
              </p>
              <p className="mb-4">(&quot;LoveIQ&quot;, &quot;we&quot;, &quot;us&quot;)</p>
              <p>and users (&quot;you&quot;, &quot;User&quot;) of the LoveIQ platform.</p>
            </section>

            {/* Section 1 */}
            <section>
              <h2 className="text-white font-semibold mb-4">1. Scope of Services</h2>
              <p className="mb-4">LoveIQ provides a digital platform offering:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>psychometric questionnaires</li>
                <li>AI-based analysis</li>
                <li>personal reports</li>
                <li>educational and self-reflection content</li>
                <li>subscriptions and paid digital products</li>
              </ul>
              <p>LoveIQ does not provide medical, psychological, or therapeutic services.</p>
            </section>

            {/* Section 2 */}
            <section>
              <h2 className="text-white font-semibold mb-4">2. Account Registration</h2>
              <p className="mb-4">To use LoveIQ, you must:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>be at least 18 years old</li>
                <li>provide accurate and complete information</li>
                <li>keep your login credentials confidential</li>
              </ul>
              <p>You are responsible for all activity under your account.</p>
            </section>

            {/* Section 3 */}
            <section>
              <h2 className="text-white font-semibold mb-4">3. Contract Formation</h2>
              <p className="mb-4">A contract is formed when you:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>create an account, and</li>
                <li>purchase a subscription or digital content, or</li>
                <li>start using free services.</li>
              </ul>
              <p>The applicable version of these Terms at the time of use shall apply.</p>
            </section>

            {/* Section 4 */}
            <section>
              <h2 className="text-white font-semibold mb-4">
                4. Digital Content and Subscriptions
              </h2>
              <p className="mb-4">LoveIQ provides:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>digital psychometric reports</li>
                <li>subscription-based access</li>
                <li>paid content and features</li>
              </ul>
              <p>Delivery occurs digitally through your account.</p>
            </section>

            {/* Section 5 */}
            <section>
              <h2 className="text-white font-semibold mb-4">5. Prices and Payments</h2>
              <p>
                All prices are displayed including applicable VAT. Payments are processed via
                third-party payment providers (e.g., Stripe). Fees are due in advance.
              </p>
            </section>

            {/* Section 6 */}
            <section>
              <h2 className="text-white font-semibold mb-4">6. Right of Withdrawal (Consumers)</h2>
              <p className="mb-4">
                If you are a consumer within the EU, you normally have a 14-day right of withdrawal.
                However, for digital content, this right expires once:
              </p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>you expressly consent to immediate performance, and</li>
                <li>you acknowledge the loss of the withdrawal right.</li>
              </ul>
              <p>You provide this consent during checkout.</p>
            </section>

            {/* Section 7 */}
            <section>
              <h2 className="text-white font-semibold mb-4">7. Subscription Terms</h2>
              <p className="mb-4">Subscriptions:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>renew automatically</li>
                <li>can be canceled at any time</li>
                <li>remain active until the end of the current billing period</li>
              </ul>
              <p>No partial refunds are granted for unused periods.</p>
            </section>

            {/* Section 8 */}
            <section>
              <h2 className="text-white font-semibold mb-4">8. User Obligations</h2>
              <p className="mb-4">You agree to:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>use LoveIQ for personal purposes only</li>
                <li>not misuse, resell, scrape, or manipulate the platform</li>
                <li>not provide false or misleading information</li>
              </ul>
            </section>

            {/* Section 9 */}
            <section>
              <h2 className="text-white font-semibold mb-4">9. Intellectual Property</h2>
              <p className="mb-4">
                All software, content, reports, and algorithms are the exclusive property of Applied
                Psychometrics UG. Users receive a personal, non-transferable, non-exclusive license
                to access their content.
              </p>
            </section>

            {/* Section 10 */}
            <section>
              <h2 className="text-white font-semibold mb-4">10. Availability and Changes</h2>
              <p className="mb-4">We may:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>update, modify or discontinue parts of the platform</li>
                <li>improve or change reports and algorithms</li>
              </ul>
              <p>No entitlement to permanent availability exists.</p>
            </section>

            {/* Section 11 */}
            <section>
              <h2 className="text-white font-semibold mb-4">11. Liability</h2>
              <p className="mb-4">We are liable only for:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>intent</li>
                <li>gross negligence</li>
                <li>injury to life, body or health</li>
              </ul>
              <p>
                For slight negligence, liability is limited to foreseeable, typical damage. We are
                not liable for decisions you make based on LoveIQ outputs.
              </p>
            </section>

            {/* Section 12 */}
            <section>
              <h2 className="text-white font-semibold mb-4">12. Termination</h2>
              <p className="mb-4">We may suspend or terminate accounts for:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>violations of these Terms</li>
                <li>abuse</li>
                <li>fraud</li>
                <li>legal requirements</li>
              </ul>
              <p>Users may delete their account at any time.</p>
            </section>

            {/* Section 13 */}
            <section>
              <h2 className="text-white font-semibold mb-4">13. Right of Withdrawal (Consumers)</h2>
              <p className="mb-4">
                You have the right to withdraw from this contract within 14 days without giving any
                reason.
              </p>
              <p className="mb-4">
                The withdrawal period will expire after 14 days from the day of conclusion of the
                contract.
              </p>
              <p className="mb-4">
                To exercise the right of withdrawal, you must inform us (Applied Psychometrics UG,
                Hasenheide 62, 10967 Berlin, Germany,{" "}
                <a
                  href="mailto:help@loveiq.org"
                  className="text-gray-300 hover:text-white transition-colors"
                >
                  help@loveiq.org
                </a>
                ) of your decision to withdraw from this contract by an unequivocal statement (e.g.
                a letter sent by post or email).
              </p>
              <p className="mb-4">
                To meet the withdrawal deadline, it is sufficient for you to send your communication
                concerning your exercise of the right of withdrawal before the withdrawal period has
                expired.
              </p>
              <p>
                You expressly agree that LoveIQ begins performance of the digital content and
                subscription services before the end of the withdrawal period. You acknowledge that
                by giving this consent you lose your statutory right of withdrawal once the digital
                content has been made available to you.
              </p>
            </section>

            {/* Section 14 */}
            <section>
              <h2 className="text-white font-semibold mb-4">14. Governing Law</h2>
              <p>These Terms are governed by the laws of the Federal Republic of Germany.</p>
            </section>

            {/* Section 15 */}
            <section>
              <h2 className="text-white font-semibold mb-4">15. Jurisdiction</h2>
              <p>If you are a merchant, the exclusive place of jurisdiction is Berlin, Germany.</p>
            </section>
          </div>
        </article>
      </main>
      <FooterSection />
    </>
  );
}
