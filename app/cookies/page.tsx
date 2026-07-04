import type { Metadata } from "next";
import WNavSection from "@features/landing/ui/white/WNavSection";
import WFooterSection from "@features/landing/ui/white/WFooterSection";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.loveiq.org";

export const metadata: Metadata = {
  title: "Cookie Policy | LoveIQ",
  description: "LoveIQ Cookie Policy - Information about cookies and tracking technologies we use.",
  alternates: {
    canonical: `${siteUrl}/cookies`,
  },
  robots: { index: false },
};

export default function CookiesPage() {
  return (
    <>
      <style>{"html,body{background:#ffffff;}"}</style>
      <WNavSection />
      <main className="min-h-screen bg-white px-4 pt-32 pb-20 sm:pt-40">
        <article className="mx-auto max-w-3xl">
          <h1 className="font-serif font-light text-[#161021] mb-10" style={{ fontSize: "36px" }}>
            Cookie Policy
          </h1>

          <div
            className="font-sans space-y-8 text-gray-600 leading-relaxed"
            style={{ fontSize: "18px" }}
          >
            <p>
              This Cookie Policy explains how the following company uses cookies and similar
              technologies on loveiq.org and related services.
            </p>

            <p>
              <span className="font-semibold text-gray-900">
                Applied Psychometrics UG (in formation) (haftungsbeschränkt)
              </span>
              <br />
              Hasenheide 62
              <br />
              10967 Berlin
              <br />
              Germany
              <br />
              Managing Director: Marcus Börner
              <br />
              Email:{" "}
              <a
                href="mailto:hello@loveiq.org"
                className="text-[#C2410C] hover:text-[#fe6839] transition-colors"
              >
                hello@loveiq.org
              </a>
              <br />
              (“LoveIQ”, “we”, “us”)
            </p>

            <section>
              <h2 className="text-gray-900 font-semibold mb-4">1. What are Cookies?</h2>
              <p className="mb-4">
                Cookies are small text files stored on your device when you visit a website. They
                allow the website to recognize your device and store certain information about your
                preferences or past actions.
              </p>
              <p className="mb-4">We also use similar technologies such as:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>local storage</li>
                <li>pixels</li>
                <li>device identifiers</li>
                <li>scripts</li>
              </ul>
              <p>For simplicity, all these technologies are referred to as “cookies”.</p>
            </section>

            <section>
              <h2 className="text-gray-900 font-semibold mb-4">2. Legal Basis</h2>
              <p className="mb-4">We use cookies only in accordance with:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>General Data Protection Regulation (GDPR)</li>
                <li>German Telecommunications Telemedia Data Protection Act (TTDSG)</li>
                <li>ePrivacy Directive</li>
              </ul>
              <p className="mb-4">
                <strong>Strictly necessary cookies:</strong> § 25 (2) TTDSG / Art. 6(1)(b) GDPR — no
                consent required.
              </p>
              <p>
                <strong>All other cookies:</strong> § 25 (1) TTDSG / Art. 6(1)(a) GDPR — require
                prior explicit consent via our consent banner.
              </p>
            </section>

            <section>
              <h2 className="text-gray-900 font-semibold mb-4">3. Categories of Cookies We Use</h2>

              <h3 className="text-gray-900 font-medium mb-2">A. Strictly Necessary Cookies</h3>
              <p className="mb-2">
                These cookies are required for the operation of LoveIQ and cannot be disabled.
                Examples:
              </p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>login authentication</li>
                <li>session security</li>
                <li>shopping/checkout process</li>
                <li>consent status storage</li>
              </ul>
              <p className="mb-6">
                Legal basis: Legitimate interest &amp; contract performance (Art. 6(1)(b) GDPR,
                §25(2) TTDSG)
              </p>

              <h3 className="text-gray-900 font-medium mb-2">B. Functional Cookies</h3>
              <p className="mb-2">These improve usability:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>language preferences</li>
                <li>interface settings</li>
                <li>remembering progress in surveys</li>
              </ul>
              <p className="mb-6">Legal basis: Consent (Art. 6(1)(a) GDPR)</p>

              <h3 className="text-gray-900 font-medium mb-2">C. Analytics Cookies</h3>
              <p className="mb-2">Used to understand how users interact with LoveIQ:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>page visits</li>
                <li>error tracking</li>
                <li>performance metrics</li>
              </ul>
              <p className="mb-2">
                Typical tools may include privacy-friendly analytics and aggregated statistics.
              </p>
              <p className="mb-6">
                Legal basis: Consent (Art. 6(1)(a) GDPR). IP addresses are anonymized where
                technically possible.
              </p>

              <h3 className="text-gray-900 font-medium mb-2">D. Marketing Cookies</h3>
              <p className="mb-2">We may use cookies for:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>advertising measurement</li>
                <li>retargeting</li>
                <li>conversion tracking</li>
              </ul>
              <p className="mb-2">These are only activated after explicit consent.</p>
              <p className="mb-6">Legal basis: Consent (Art. 6(1)(a) GDPR)</p>

              <h3 className="text-gray-900 font-medium mb-2">E. Third-Party Services</h3>
              <p className="mb-2">LoveIQ may integrate services such as:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>payment providers (e.g., Stripe)</li>
                <li>hosting/CDN</li>
                <li>email services</li>
                <li>analytics tools</li>
                <li>customer reviews (e.g., Trustpilot) &mdash; loaded only after consent</li>
              </ul>
              <p>
                These providers may set their own cookies. We conclude data-processing agreements
                with partners under Art. 28 GDPR.
              </p>
            </section>

            <section>
              <h2 className="text-gray-900 font-semibold mb-4">4. Consent Management</h2>
              <p className="mb-4">When you first visit loveiq.org, you will be asked to choose:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>Accept all cookies</li>
                <li>Reject non-essential cookies</li>
                <li>Customize preferences</li>
              </ul>
              <p>
                Your choices are stored and can be changed at any time via the “Cookie Settings”
                link in the footer.
              </p>
            </section>

            <section>
              <h2 className="text-gray-900 font-semibold mb-4">5. How to Control Cookies</h2>
              <p className="mb-4">You can:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>change preferences via our banner</li>
                <li>delete cookies in your browser</li>
                <li>block cookies via browser settings</li>
              </ul>
              <p>Please note: disabling necessary cookies may limit functionality.</p>
            </section>

            <section>
              <h2 className="text-gray-900 font-semibold mb-4">6. Storage Duration</h2>
              <p className="mb-4">Cookies are stored only as long as necessary:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Session cookies: deleted after session</li>
                <li>Consent cookie: up to 12 months</li>
                <li>Analytics cookies: maximum 24 months</li>
                <li>Marketing cookies: maximum 12 months</li>
              </ul>
            </section>

            <section>
              <h2 className="text-gray-900 font-semibold mb-4">7. Data Transfers</h2>
              <p className="mb-4">
                Some third-party providers may process data outside the EU. We ensure protection
                through:
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>EU Standard Contractual Clauses</li>
                <li>additional safeguards</li>
                <li>data minimization</li>
              </ul>
            </section>

            <section>
              <h2 className="text-gray-900 font-semibold mb-4">8. Your Rights</h2>
              <p className="mb-4">You have the right to:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>withdraw consent at any time</li>
                <li>access stored data</li>
                <li>request deletion</li>
                <li>object to processing</li>
                <li>lodge a complaint with a supervisory authority</li>
              </ul>
              <p>Contact us in case.</p>
            </section>

            <section>
              <h2 className="text-gray-900 font-semibold mb-4">9. Updates</h2>
              <p>We may update this Cookie Policy to reflect legal or technical changes.</p>
            </section>

            <section>
              <h2 className="text-gray-900 font-semibold mb-4">10. Governing Law</h2>
              <p>These Terms are governed by the laws of the Federal Republic of Germany.</p>
            </section>
          </div>
        </article>
      </main>
      <WFooterSection />
    </>
  );
}
