import type { Metadata } from "next";
import Link from "next/link";
import { MiraFrame } from "@features/mira/ui/MiraShell";

export const metadata: Metadata = {
  title: "How Mira handles your data | Applied Psychometrics",
  robots: { index: false, follow: false },
};

/**
 * Mira's privacy notice, in plain words, written 18 Nov 2026 to match what the code does and
 * checked by Eman on 20 Nov 2026. Change it whenever what Mira stores or shares changes.
 */
export default function MiraPrivacyPage() {
  return (
    <MiraFrame>
      <article className="max-w-[720px] text-[15px] leading-relaxed text-ap-body [&_h2]:mt-8 [&_h2]:font-serif [&_h2]:text-[22px] [&_h2]:font-medium [&_h2]:text-ap-ink [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-5">
        <h1 className="font-serif text-[34px] font-medium text-ap-ink">
          How Mira handles your data
        </h1>
        <p className="mt-3">
          Mira is an AI coach for body confidence, run by Applied Psychometrics, the company behind
          LoveIQ (see the{" "}
          <Link href="/imprint" className="underline">
            imprint
          </Link>
          ). This page explains what Mira uses and why. Our{" "}
          <Link href="/privacy-policy" className="underline">
            privacy policy
          </Link>{" "}
          covers everything else.
        </p>

        <h2>What Mira uses</h2>
        <ul>
          <li>
            What you write to Mira. It is about your sex life, which is sensitive data under the
            GDPR, so we only use it with your explicit consent.
          </li>
          <li>
            With an account: your email, the name and gender you give, the country you choose, your
            coaching style and your settings.
          </li>
          <li>
            Your LoveIQ Sexual Personality result, if you took the test with the same email and
            allow Mira to use it.
          </li>
          <li>
            Your thumbs up or down on an answer, your feedback, and a random id for this browser
            that counts your free conversations.
          </li>
        </ul>

        <h2>Why</h2>
        <ul>
          <li>To coach you: Mira needs your messages to answer them.</li>
          <li>
            To send your daily nudge, if you have an account and Mira remembers your chats: the AI
            writes one short email from your last chat, and it also appears in that chat. You can
            change the time, pause or stop it in Settings or from any nudge.
          </li>
          <li>
            To improve Mira: we look at ratings, feedback and how people use her. Our analytics
            tools (PostHog and Microsoft Clarity) record what is typed on the page, as on the rest
            of our site.
          </li>
          <li>Never for advertising, and never to train shared AI models.</li>
        </ul>

        <h2>Who else processes it</h2>
        <ul>
          <li>
            Anthropic, which makes Claude, the AI model behind Mira: it receives your messages to
            write Mira&apos;s replies and may process them outside the EU.
          </li>
          <li>
            Supabase, our database, in Switzerland; Vercel, which hosts the site; Resend, which
            sends your sign-in code.
          </li>
          <li>
            Google, only if you sign in with Google: it confirms your email address to us, and
            nothing else.
          </li>
          <li>PostHog and Microsoft Clarity, our analytics tools.</li>
        </ul>

        <h2>How long we keep it</h2>
        <ul>
          <li>
            Without an account, your chat stays in this browser, not in our database. A reply you
            rate is kept with its rating.
          </li>
          <li>
            With an account, your chats are kept while &ldquo;Remember our conversations&rdquo; is
            on, until you delete them or your account, and at most 12 months after the last message
            you wrote.
          </li>
        </ul>

        <h2>Your choices</h2>
        <ul>
          <li>
            Withdraw your consent at any time: stop chatting, delete your chats or your account in
            Settings.
          </li>
          <li>
            Ask for a copy of your data or anything else at{" "}
            <a href="mailto:hello@loveiq.org" className="underline">
              hello@loveiq.org
            </a>
            . You can also complain to a data protection authority.
          </li>
        </ul>

        <h2>Mira is not a therapist</h2>
        <p>
          Mira does not give medical advice, diagnosis or treatment. If you are in danger or might
          hurt yourself, call your local emergency number. In the chat, &ldquo;Need support right
          now?&rdquo; lists free support lines.
        </p>
      </article>
    </MiraFrame>
  );
}
