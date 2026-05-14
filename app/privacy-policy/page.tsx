import type { Metadata } from "next";
import LegalNavSection from "@/components/legal/LegalNavSection";
import FooterSection from "@features/landing/ui/FooterSection";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.loveiq.org";

export const metadata: Metadata = {
  title: "Privacy Policy | LoveIQ",
  description: "LoveIQ Privacy Policy - How we collect, use, and protect your personal data.",
  alternates: {
    canonical: `${siteUrl}/privacy-policy`,
  },
  robots: { index: false },
};

export default function PrivacyPolicyPage() {
  return (
    <>
      <LegalNavSection />
      <main className="min-h-screen px-4 py-20" style={{ backgroundColor: "#09050F" }}>
        <article className="mx-auto max-w-3xl">
          <h1 className="font-serif font-light text-white mb-10" style={{ fontSize: "36px" }}>
            Privacy Policy
          </h1>

          <div
            className="font-sans space-y-8 text-gray-300 leading-relaxed"
            style={{ fontSize: "18px" }}
          >
            {/* Section 1 */}
            <section>
              <h2 className="text-white font-semibold mb-4">1. Controller</h2>
              <p className="mb-4">
                Applied Psychometrics UG (in formation) (haftungsbeschraenkt)
                <br />
                Hasenheide 62
                <br />
                10967 Berlin
                <br />
                Germany
              </p>
              <p className="mb-4">
                Managing Director: Marcus Barner
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

            {/* Section 2 */}
            <section>
              <h2 className="text-white font-semibold mb-4">2. Scope of this Privacy Policy</h2>
              <p>
                This Privacy Policy applies to the LoveIQ platform, including our website, mobile
                applications, surveys, psychometric tools, reports, subscription services and any
                related digital services (&quot;Platform&quot;). We process personal data in
                compliance with the General Data Protection Regulation (GDPR), the German Federal
                Data Protection Act (BDSG), and all applicable EU data-protection laws.
              </p>
            </section>

            {/* Section 3 */}
            <section>
              <h2 className="text-white font-semibold mb-4">3. Categories of Personal Data</h2>
              <p className="mb-4">We process the following categories of personal data:</p>

              <h3 className="text-white font-medium mb-2">3.1 Account and Identity Data</h3>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>Email address</li>
                <li>Login credentials</li>
                <li>User ID</li>
              </ul>

              <h3 className="text-white font-medium mb-2">3.2 Psychometric and Survey Data</h3>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>Answers to psychometric questionnaires</li>
                <li>
                  Personality, attachment, relationship and sexuality-related self-descriptions
                </li>
                <li>Emotional, behavioral and relational self-assessments</li>
              </ul>
              <p className="mb-4">
                These data qualify as special categories of personal data under Art. 9 GDPR.
              </p>

              <h3 className="text-white font-medium mb-2">3.3 Usage and Technical Data</h3>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>IP address</li>
                <li>Device and browser information</li>
                <li>Time and date of access</li>
                <li>Interaction logs</li>
              </ul>

              <h3 className="text-white font-medium mb-2">3.4 Payment Data</h3>
              <p>
                We do not store full payment data. Payments are processed by external payment
                providers (e.g. Stripe). We receive transaction references, payment status and
                subscription IDs.
              </p>
            </section>

            {/* Section 4 */}
            <section>
              <h2 className="text-white font-semibold mb-4">4. Purposes of Processing</h2>
              <p className="mb-4">We process personal data for the following purposes:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Creating and managing user accounts</li>
                <li>Delivering psychometric reports and insights</li>
                <li>Personalizing content and user experience</li>
                <li>Operating subscriptions and paid content</li>
                <li>Fraud prevention and platform security</li>
                <li>Customer support</li>
                <li>Legal and accounting compliance</li>
                <li>
                  Scientific and statistical improvement of our platform (using pseudonymized or
                  anonymized data)
                </li>
              </ul>
            </section>

            {/* Section 5 */}
            <section>
              <h2 className="text-white font-semibold mb-4">
                5. Legal Bases for Processing (Art. 6 &amp; 9 GDPR)
              </h2>
              <p className="mb-4">We rely on the following legal bases:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>Account and service delivery: Art. 6(1)(b) GDPR (contract)</li>
                <li>Technical operation and security: Art. 6(1)(f) GDPR (legitimate interest)</li>
                <li>Marketing communications: Art. 6(1)(a) GDPR (consent)</li>
                <li>
                  Processing of sensitive psychometric, sexual and relationship data: Art. 9(2)(a)
                  GDPR (explicit consent)
                </li>
                <li>Legal compliance: Art. 6(1)(c) GDPR</li>
              </ul>
              <p>You may withdraw consent at any time with effect for the future.</p>
            </section>

            {/* Section 6 */}
            <section>
              <h2 className="text-white font-semibold mb-4">6. Automated Processing and AI</h2>
              <p className="mb-4">
                We use automated systems, including artificial intelligence, to analyze your inputs
                and generate psychometric reports. This processing:
              </p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>Does not produce legal effects</li>
                <li>Does not replace professional diagnosis</li>
                <li>Is used exclusively to deliver the requested services</li>
              </ul>
              <p>We do not use your data to train public or third-party AI models.</p>
            </section>

            {/* Section 7 */}
            <section>
              <h2 className="text-white font-semibold mb-4">7. Recipients of Data</h2>
              <p className="mb-4">Your data may be processed by:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>Cloud hosting providers</li>
                <li>AI processing providers</li>
                <li>Payment processors</li>
                <li>Customer support tools</li>
                <li>Analytics and security providers</li>
              </ul>
              <p>
                All recipients are bound by data-processing agreements in accordance with Art. 28
                GDPR.
              </p>
            </section>

            {/* Section 8 */}
            <section>
              <h2 className="text-white font-semibold mb-4">8. International Data Transfers</h2>
              <p className="mb-4">
                Some service providers may process data outside the EU/EEA. Where this occurs, we
                ensure protection through:
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>EU Standard Contractual Clauses</li>
                <li>Additional technical and organizational safeguards</li>
              </ul>
            </section>

            {/* Section 9 */}
            <section>
              <h2 className="text-white font-semibold mb-4">9. Storage Period</h2>
              <p className="mb-4">We store your data:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>For the duration of your account</li>
                <li>Up to 30 days after deletion of your account</li>
                <li>Longer if required by tax or commercial law</li>
              </ul>
              <p>Pseudonymized statistical data may be stored longer.</p>
            </section>

            {/* Section 10 */}
            <section>
              <h2 className="text-white font-semibold mb-4">10. Your Rights</h2>
              <p className="mb-4">You have the right to:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>Access your data (Art. 15 GDPR)</li>
                <li>Rectification (Art. 16 GDPR)</li>
                <li>Erasure (Art. 17 GDPR)</li>
                <li>Restriction (Art. 18 GDPR)</li>
                <li>Data portability (Art. 20 GDPR)</li>
                <li>Object to processing (Art. 21 GDPR)</li>
                <li>Withdraw consent at any time</li>
              </ul>
              <p>
                Requests can be sent to:{" "}
                <a
                  href="mailto:hello@loveiq.org"
                  className="text-gray-300 hover:text-white transition-colors"
                >
                  hello@loveiq.org
                </a>
              </p>
            </section>

            {/* Section 11 */}
            <section>
              <h2 className="text-white font-semibold mb-4">11. Right to Lodge a Complaint</h2>
              <p>
                You may lodge a complaint with any EU supervisory authority, in particular: Berlin
                Commissioner for Data Protection and Freedom of Information{" "}
                <a
                  href="https://www.datenschutz-berlin.de"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-300 hover:text-white transition-colors"
                >
                  https://www.datenschutz-berlin.de
                </a>
              </p>
            </section>

            {/* Section 12 */}
            <section>
              <h2 className="text-white font-semibold mb-4">
                12. Data Protection Impact Assessment (Art. 35 GDPR)
              </h2>
              <p className="mb-4">
                Because LoveIQ processes sensitive psychological, sexual and relational data using
                automated analysis, we have conducted a Data Protection Impact Assessment (DPIA).
              </p>
              <p className="mb-4">The DPIA includes:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Risk assessment</li>
                <li>Data minimization</li>
                <li>Encryption</li>
                <li>Access controls</li>
                <li>Pseudonymization</li>
                <li>User consent management</li>
              </ul>
            </section>

            {/* Section 13 */}
            <section>
              <h2 className="text-white font-semibold mb-4">13. Security Measures</h2>
              <p className="mb-4">
                We apply technical and organizational security measures including:
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>Encryption in transit and at rest</li>
                <li>Role-based access controls</li>
                <li>Logging and monitoring</li>
                <li>Regular security reviews</li>
              </ul>
            </section>

            {/* Section 14 */}
            <section>
              <h2 className="text-white font-semibold mb-4">14. Changes</h2>
              <p>
                We may update this Privacy Policy from time to time. Users will be informed of
                material changes.
              </p>
            </section>
          </div>
        </article>
      </main>
      <FooterSection />
    </>
  );
}
