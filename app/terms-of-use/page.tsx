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
                Applied Psychometrics UG (haftungsbeschränkt)
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
                  className="text-[#C2410C] underline hover:text-[#fe6839] transition-colors"
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
              <h2 className="text-gray-900 font-semibold mb-4">11. Mira, the AI Coach (Beta)</h2>
              <p className="mb-4">
                Mira is LoveIQ&apos;s AI coach for body confidence in sex. These rules apply in
                addition when you use Mira.
              </p>
              <h3 className="text-gray-900 font-medium mb-2">11.1 What Mira is</h3>
              <p className="mb-4">
                Mira is an AI coach in beta. An AI model writes her replies. They can be wrong,
                incomplete or not right for you. Check what matters to you and make your own
                decisions.
              </p>
              <h3 className="text-gray-900 font-medium mb-2">11.2 What Mira is not</h3>
              <p className="mb-4">
                Mira is not therapy. She does not give medical advice, diagnosis or treatment, and
                she does not replace a doctor, therapist or counsellor.
              </p>
              <h3 className="text-gray-900 font-medium mb-2">11.3 Not for emergencies</h3>
              <p className="mb-4">
                Mira is not an emergency service. If you are in danger, might hurt yourself or
                someone else, or need urgent medical help, call your local emergency number (112 in
                the EU) or go to the nearest emergency department. In the chat, &quot;Need support
                right now?&quot; lists free support lines.
              </p>
              <h3 className="text-gray-900 font-medium mb-2">11.4 Only for adults</h3>
              <p className="mb-4">
                You may use Mira only if you are 18 or older. If you tell Mira you are under 18, she
                stops coaching for good on that account or in that browser, turns her emails off and
                deletes the chats saved in that account.
              </p>
              <h3 className="text-gray-900 font-medium mb-2">11.5 Acceptable use</h3>
              <p className="mb-4">You must not:</p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>share or ask for sexual content involving minors, in any form</li>
                <li>
                  try to make Mira produce sexually explicit material, such as erotic stories or
                  role-play, or other harmful content
                </li>
                <li>try to get around Mira&apos;s safety rules, for example with trick prompts</li>
                <li>
                  use Mira to harass or harm anyone, or share other people&apos;s private details
                  without their permission
                </li>
                <li>
                  abuse the service, for example with bots or scripts, by flooding it with requests,
                  by testing its security without our permission or by asking for sign-in codes for
                  email addresses that are not yours
                </li>
              </ul>
              <p className="mb-4">
                If you break these rules, we may limit or stop your use of Mira, or delete your
                account.
              </p>
              <h3 className="text-gray-900 font-medium mb-2">11.6 Free, and may change</h3>
              <p className="mb-4">
                Mira is free during the beta. Without an account, you can send 10 messages. After
                that, you need a free account. Mira always answers a message about a crisis. We may
                change Mira, limit it or stop it at any time. If we stop it, we will tell account
                holders by email beforehand where we can.
              </p>
              <h3 className="text-gray-900 font-medium mb-2">11.7 Daily nudges</h3>
              <p className="mb-4">
                A free account comes with daily nudge emails from Mira, at most one a day. You can
                change their time, pause them or stop them in Mira&apos;s settings, or with the link
                in any nudge.
              </p>
              <h3 className="text-gray-900 font-medium mb-2">11.8 Deleting your account</h3>
              <p>
                You can delete your chats or your whole Mira account at any time in Mira&apos;s
                settings, or ask us at{" "}
                <a
                  href="mailto:hello@loveiq.org"
                  className="text-[#C2410C] underline hover:text-[#fe6839] transition-colors"
                >
                  hello@loveiq.org
                </a>
                . How Mira handles your data is explained in{" "}
                <a
                  href="/mira/privacy"
                  className="text-[#C2410C] underline hover:text-[#fe6839] transition-colors"
                >
                  How Mira handles your data
                </a>
                .
              </p>
            </section>

            {/* Section 12 */}
            <section>
              <h2 className="text-gray-900 font-semibold mb-4">12. Liability</h2>
              <p className="mb-4">
                12.1 We are liable without limitation for intent and gross negligence, for injury to
                life, body or health caused by our fault, under the German Product Liability Act
                (Produkthaftungsgesetz) and where we have given a guarantee.
              </p>
              <p className="mb-4">
                12.2 For slight negligence, we are liable only if we breach an essential contractual
                obligation. An essential obligation is one that makes the proper use of LoveIQ
                possible in the first place and on which you may regularly rely. In that case, our
                liability is limited to the damage that is typical and foreseeable for this kind of
                contract.
              </p>
              <p className="mb-4">12.3 Otherwise, our liability is excluded.</p>
              <p>
                12.4 These rules also apply to the personal liability of our employees,
                representatives and agents.
              </p>
            </section>

            {/* Section 13 */}
            <section>
              <h2 className="text-gray-900 font-semibold mb-4">
                13. Governing Law and Place of Jurisdiction
              </h2>
              <p className="mb-4">
                These Terms are governed by the law of the Federal Republic of Germany. The UN
                Convention on Contracts for the International Sale of Goods (CISG) does not apply.
                If you are a consumer, this choice of law does not take away the protection of the
                mandatory rules of the country where you usually live (Art. 6(2) Rome I Regulation).
              </p>
              <p>
                If you are a merchant (Kaufmann), a legal entity under public law or a special fund
                under public law, the exclusive place of jurisdiction for all disputes arising from
                these Terms is Berlin, Germany.
              </p>
            </section>
          </div>
        </article>
      </main>
      <WFooterSection />
    </>
  );
}
