import type { Metadata } from "next";
import WNavSection from "@features/landing/ui/white/WNavSection";
import WFooterSection from "@features/landing/ui/white/WFooterSection";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.loveiq.org";

export const metadata: Metadata = {
  title: "Medical & Psychological Disclaimer | LoveIQ",
  description:
    "LoveIQ Medical and Psychological Disclaimer - Important information about our services.",
  alternates: {
    canonical: `${siteUrl}/medical-disclaimer`,
  },
  robots: { index: false },
};

export default function MedicalDisclaimerPage() {
  return (
    <>
      <style>{"html,body{background:#ffffff;}"}</style>
      <WNavSection />
      <main className="min-h-screen bg-white px-4 pt-32 pb-20 sm:pt-40">
        <article className="mx-auto max-w-3xl">
          <h1 className="font-serif font-light text-[#161021] mb-10" style={{ fontSize: "36px" }}>
            Medical & Psychological Disclaimer
          </h1>

          <div
            className="font-sans space-y-8 text-gray-600 leading-relaxed"
            style={{ fontSize: "18px" }}
          >
            {/* Intro */}
            <section>
              <p className="mb-4">LoveIQ is operated by:</p>
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
              <p>(&quot;LoveIQ&quot;, &quot;we&quot;, &quot;us&quot;)</p>
            </section>

            {/* Section 1 */}
            <section>
              <h2 className="text-gray-900 font-semibold mb-4">
                1. No Medical or Psychological Services
              </h2>
              <p className="mb-4">LoveIQ does not provide:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>medical advice</li>
                <li>psychological diagnosis</li>
                <li>psychotherapy</li>
                <li>counseling</li>
                <li>treatment</li>
                <li>crisis intervention</li>
                <li>or any form of healthcare services</li>
              </ul>
              <p>
                Nothing on the LoveIQ platform constitutes or is intended to constitute professional
                healthcare.
              </p>
            </section>

            {/* Section 2 */}
            <section>
              <h2 className="text-gray-900 font-semibold mb-4">2. Nature of LoveIQ</h2>
              <p className="mb-4">LoveIQ provides:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>psychometric self-exploration tools</li>
                <li>educational models</li>
                <li>AI-generated interpretive reports</li>
              </ul>
              <p className="mb-4">
                These are informational and reflective tools only. They do not assess:
              </p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>mental illness</li>
                <li>psychological disorders</li>
                <li>trauma</li>
                <li>personality pathology</li>
                <li>or clinical conditions</li>
              </ul>
              <p>LoveIQ is not a medical device under EU law.</p>
            </section>

            {/* Section 3 */}
            <section>
              <h2 className="text-gray-900 font-semibold mb-4">3. No Diagnosis, No Treatment</h2>
              <p className="mb-4">LoveIQ does not:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>diagnose</li>
                <li>prevent</li>
                <li>monitor</li>
                <li>predict</li>
                <li>treat</li>
                <li>or cure any disease, condition, or disorder</li>
              </ul>
              <p>
                All outputs are: subjective, probabilistic, and model-based reflections of user
                inputs. They are not clinical evaluations.
              </p>
            </section>

            {/* Section 4 */}
            <section>
              <h2 className="text-gray-900 font-semibold mb-4">4. AI and Automated Analysis</h2>
              <p className="mb-4">
                LoveIQ uses automated systems to analyze self-reported information. These systems:
              </p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>do not understand you</li>
                <li>do not know you</li>
                <li>do not have awareness</li>
                <li>do not validate truth</li>
              </ul>
              <p>They generate pattern-based interpretations only.</p>
            </section>

            {/* Section 5 */}
            <section>
              <h2 className="text-gray-900 font-semibold mb-4">5. User Responsibility</h2>
              <p className="mb-4">You are solely responsible for:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>how you interpret results</li>
                <li>how you act on them</li>
                <li>any decisions you make</li>
              </ul>
              <p className="mb-4">You must not use LoveIQ:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>for medical decisions</li>
                <li>for mental health diagnosis</li>
                <li>for crisis or emergency situations</li>
                <li>to replace professional care</li>
              </ul>
            </section>

            {/* Section 6 */}
            <section>
              <h2 className="text-gray-900 font-semibold mb-4">
                6. No Reliance for Health or Safety
              </h2>
              <p className="mb-4">LoveIQ must not be used for:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>suicide prevention</li>
                <li>trauma treatment</li>
                <li>relationship therapy</li>
                <li>medication decisions</li>
                <li>mental health management</li>
              </ul>
              <p className="mb-4">If you experience:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>distress</li>
                <li>depression</li>
                <li>anxiety</li>
                <li>trauma</li>
                <li>suicidal thoughts</li>
              </ul>
              <p className="font-medium text-gray-900">
                seek licensed professional help immediately.
              </p>
            </section>

            {/* Section 7 */}
            <section>
              <h2 className="text-gray-900 font-semibold mb-4">7. Limitation of Liability</h2>
              <p className="mb-4">Applied Psychometrics UG shall not be liable for:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>emotional impact</li>
                <li>relational consequences</li>
                <li>distress</li>
                <li>misunderstandings</li>
                <li>incorrect self-interpretations</li>
                <li>personal decisions</li>
              </ul>
              <p>arising from LoveIQ use.</p>
            </section>

            {/* Section 8 */}
            <section>
              <h2 className="text-gray-900 font-semibold mb-4">8. No Professional Relationship</h2>
              <p className="mb-4">Using LoveIQ does not create:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>a therapist–client relationship</li>
                <li>a doctor–patient relationship</li>
                <li>a counselor–client relationship</li>
              </ul>
              <p>There is no duty of care beyond providing the digital platform.</p>
            </section>

            {/* Section 9 */}
            <section>
              <h2 className="text-gray-900 font-semibold mb-4">9. Consent</h2>
              <p className="mb-4">By using LoveIQ, you acknowledge that:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>you understand this disclaimer</li>
                <li>you accept that LoveIQ is not therapy</li>
                <li>you waive any claims based on medical or psychological reliance.</li>
              </ul>
            </section>

            {/* Section 10 */}
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
