import type { Metadata } from "next";
import LegalNavSection from "@features/legal/ui/LegalNavSection";
import FooterSection from "@features/landing/ui/FooterSection";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.loveiq.org";

export const metadata: Metadata = {
  title: "Digital Content & Subscription Terms | LoveIQ",
  description:
    "LoveIQ Digital Content and Subscription Terms - Terms for digital products and subscriptions.",
  alternates: {
    canonical: `${siteUrl}/digital-content-terms`,
  },
  robots: { index: false },
};

export default function DigitalContentTermsPage() {
  return (
    <>
      <LegalNavSection />
      <main className="min-h-screen px-4 py-20" style={{ backgroundColor: "#09050F" }}>
        <article className="mx-auto max-w-3xl">
          <h1 className="font-serif font-light text-white mb-10" style={{ fontSize: "36px" }}>
            Digital Content & Subscription Terms
          </h1>

          <div
            className="font-sans space-y-8 text-gray-300 leading-relaxed"
            style={{ fontSize: "18px" }}
          >
            {/* Intro */}
            <section>
              <p className="mb-4">
                These Digital Content & Subscription Terms apply to all purchases, subscriptions and
                digital products offered through the LoveIQ platform operated by:
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
              <p>(&quot;LoveIQ&quot;, &quot;we&quot;, &quot;us&quot;)</p>
            </section>

            {/* Section 1 */}
            <section>
              <h2 className="text-white font-semibold mb-4">1. Scope</h2>
              <p className="mb-4">These Terms govern:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>psychometric reports</li>
                <li>unlocked content</li>
                <li>digital features</li>
                <li>subscriptions</li>
                <li>any other digital services provided through LoveIQ</li>
              </ul>
              <p>All products are delivered digitally.</p>
            </section>

            {/* Section 2 */}
            <section>
              <h2 className="text-white font-semibold mb-4">2. Nature of Digital Content</h2>
              <p className="mb-4">LoveIQ provides:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>personalized psychometric reports</li>
                <li>AI-generated insights</li>
                <li>interactive digital content</li>
              </ul>
              <p>
                All content is created specifically for you based on your inputs and is not reusable
                or returnable.
              </p>
            </section>

            {/* Section 3 */}
            <section>
              <h2 className="text-white font-semibold mb-4">3. Contract Formation</h2>
              <p className="mb-4">A contract is formed when you:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>confirm your purchase, and</li>
                <li>complete payment</li>
              </ul>
              <p>Digital delivery begins immediately after purchase.</p>
            </section>

            {/* Section 4 */}
            <section>
              <h2 className="text-white font-semibold mb-4">
                4. Right of Withdrawal & Loss of the Right of Withdrawal for Digital Content
                (Consumers)
              </h2>
              <p className="mb-4">
                Under EU law, consumers normally have a 14-day right of withdrawal. However, for
                LoveIQ digital content:
              </p>
              <p className="mb-4">You expressly agree that:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>LoveIQ begins performance immediately after purchase, and</li>
                <li>
                  you thereby lose your statutory right of withdrawal once the content is made
                  available to you
                </li>
              </ul>
              <p className="mb-4">This consent is given during checkout.</p>

              <h3 className="text-white font-medium mb-2">
                Loss of the Right of Withdrawal for Digital Content:
              </h3>
              <p className="mb-4">
                You expressly agree that LoveIQ begins performance of the digital content and
                subscription services before the end of the withdrawal period.
              </p>
              <p>
                You acknowledge that by giving this consent you lose your statutory right of
                withdrawal once the digital content has been made available to you.
              </p>
            </section>

            {/* Section 5 */}
            <section>
              <h2 className="text-white font-semibold mb-4">5. No Refunds After Delivery</h2>
              <p className="mb-4">
                Once digital content (including reports, unlocked sections or subscription access)
                has been delivered or activated, refunds are excluded.
              </p>
              <p className="mb-4">This applies even if:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>you do not use the content</li>
                <li>you do not agree with the results</li>
                <li>you cancel shortly after purchase</li>
              </ul>
            </section>

            {/* Section 6 */}
            <section>
              <h2 className="text-white font-semibold mb-4">6. Subscriptions</h2>
              <p className="mb-4">Subscriptions:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>grant access for the selected billing period</li>
                <li>renew automatically until canceled</li>
                <li>can be canceled at any time via your account</li>
              </ul>
              <p>
                Cancellation takes effect at the end of the current billing period. No partial
                refunds are granted.
              </p>
            </section>

            {/* Section 7 */}
            <section>
              <h2 className="text-white font-semibold mb-4">7. Price Changes</h2>
              <p>
                We may change subscription prices. Users will be informed in advance. If you do not
                agree, you may cancel before the new price applies.
              </p>
            </section>

            {/* Section 8 */}
            <section>
              <h2 className="text-white font-semibold mb-4">8. Payment Processing</h2>
              <p>
                Payments are processed by external providers (e.g. Stripe). We do not store your
                payment card details.
              </p>
            </section>

            {/* Section 9 */}
            <section>
              <h2 className="text-white font-semibold mb-4">9. Access Suspension</h2>
              <p className="mb-4">We may suspend access if:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>payment fails</li>
                <li>abuse or fraud is detected</li>
                <li>Terms are violated</li>
              </ul>
            </section>

            {/* Section 10 */}
            <section>
              <h2 className="text-white font-semibold mb-4">10. Termination</h2>
              <p>
                You may cancel subscriptions at any time. We may terminate accounts for violations
                of law or Terms. Termination does not entitle you to a refund for already delivered
                digital content.
              </p>
            </section>

            {/* Section 11 */}
            <section>
              <h2 className="text-white font-semibold mb-4">11. Governing Law</h2>
              <p>These Terms are governed by the laws of the Federal Republic of Germany.</p>
            </section>
          </div>
        </article>
      </main>
      <FooterSection />
    </>
  );
}
