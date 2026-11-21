import type { Metadata } from "next";
import { miraLinkPreview } from "@features/mira/link-preview";
import Link from "next/link";
import { MiraFrame } from "@features/mira/ui/MiraShell";

export const metadata: Metadata = {
  title: "How Mira handles your data | LoveIQ",
  robots: { index: false, follow: false },
  ...miraLinkPreview("/mira/privacy", "How Mira handles your data | LoveIQ"),
};

/**
 * Who gets what, as the recipients table shows it. Anthropic's storage, routing and deletion are
 * as its own pages state them on 20 Nov 2026 (cited in docs/compliance/DPIA.md, section 7); the
 * Google roles are Google's own list (business.safety.google/adsservices).
 */
const RECIPIENTS = [
  {
    who: "Anthropic (Anthropic Ireland, Limited, and Anthropic, PBC)",
    role: "Processor. Its AI model, Claude, writes Mira's replies and her daily nudges.",
    gets: "Your messages, the chat so far, and what Mira knows about you: your coaching style and, with an account, your name, gender, country and, if you allow it, your LoveIQ result.",
    basis: "Your explicit consent",
    where:
      "Stored in the USA. It may be processed in the USA, Europe, Asia or Australia. EU standard contractual clauses.",
  },
  {
    who: "Supabase",
    role: "Processor. Our database and sign-in.",
    gets: "Everything Mira saves about you, as listed above.",
    basis: "As for each kind of data above",
    where: "Zurich, Switzerland. The EU recognises Switzerland as safe (adequacy decision).",
  },
  {
    who: "Vercel",
    role: "Processor. Hosts the site; our servers run in Frankfurt.",
    gets: "Your IP address, browser details and the pages you open. Your messages pass through.",
    basis: "Our contract with you; our legitimate interest",
    where:
      "Frankfurt, Germany. Vercel is a US company: EU–US Data Privacy Framework and EU standard contractual clauses.",
  },
  {
    who: "Resend",
    role: "Processor. Sends our emails.",
    gets: "Your email address, your sign-in codes and your nudges. Whether a nudge reached you and was opened, with your IP address and email app.",
    basis: "Our contract with you; for opens, our legitimate interest",
    where: "USA. EU standard contractual clauses.",
  },
  {
    who: "Upstash",
    role: "Processor. Short-lived counters that stop abuse.",
    gets: "Your IP address, email address or browser id.",
    basis: "Our legitimate interest",
    where: "USA / EU. EU standard contractual clauses.",
  },
  {
    who: "Google: Sign in with Google",
    role: "Independent controller for your Google account.",
    gets: "Only if you choose “Continue with Google”: Google confirms your email address to us, and so knows you signed in to Mira.",
    basis: "Our contract with you",
    where: "Google may process it in the USA. EU–US Data Privacy Framework.",
  },
  {
    who: "PostHog",
    role: "Processor. Product analytics and session recordings.",
    gets: "How you use our pages, including what you and Mira write in the chat as it shows on the page.",
    basis: "Our legitimate interest",
    where: "EU (Frankfurt). PostHog is in the EU–US Data Privacy Framework.",
  },
  {
    who: "Microsoft: Clarity",
    role: "Independent controller.",
    gets: "Recordings and heatmaps of how you use our pages, including what you and Mira write in the chat.",
    basis: "Our legitimate interest",
    where: "USA. EU–US Data Privacy Framework.",
  },
  {
    who: "Google: Analytics and Tag Manager",
    role: "Processor.",
    gets: "Page views and events. Cookies and identifiers only with your cookie consent.",
    basis: "Our legitimate interest; cookies: your consent",
    where: "USA. EU–US Data Privacy Framework.",
  },
  {
    who: "Google: Ads",
    role: "Independent controller.",
    gets: "Its tag loads on our pages and may set a measurement cookie before you answer the cookie banner. Other cookies and identifiers only with your consent.",
    basis: "Our legitimate interest; cookies: your consent",
    where: "USA. EU–US Data Privacy Framework.",
  },
  {
    who: "CookieYes",
    role: "Processor. Stores your cookie choice.",
    gets: "Your cookie choice, with a random id.",
    basis: "Our legal duty to prove consent",
    where: "UK. The EU recognises the UK as safe (adequacy decision).",
  },
];

const COLUMNS = [
  ["who", "Who"],
  ["role", "Role"],
  ["gets", "What they get"],
  ["basis", "Legal basis"],
  ["where", "Where, and safeguard"],
] as const;

/**
 * Mira's privacy notice, in plain words. Written 18 Nov 2026 to match what the code does and
 * checked by Eman on 20 Nov 2026. Later that day: the two consent ticks, rated replies' text only
 * with consent, the stop for minors, the retention list, the recipients table, Anthropic's
 * deletion and the data protection officer. Change it whenever what Mira stores or shares changes.
 */
export default function MiraPrivacyPage() {
  return (
    <MiraFrame>
      <article className="max-w-[720px] text-[15px] leading-relaxed text-ap-body [&_h2]:mt-8 [&_h2]:font-serif [&_h2]:text-[22px] [&_h2]:font-medium [&_h2]:text-ap-ink [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-5">
        <h1 className="font-serif text-[34px] font-medium text-ap-ink">
          How Mira handles your data
        </h1>
        <p className="mt-3">
          Mira is the AI coach by LoveIQ for body confidence in sex. Mira is in beta. LoveIQ is run
          by Applied Psychometrics UG (haftungsbeschränkt), Hasenheide 62, 10967 Berlin, Germany
          (see the{" "}
          <Link href="/imprint" className="underline">
            imprint
          </Link>
          ). We decide what happens to your data, so we are the controller under the GDPR. This page
          explains what Mira uses, why, who else gets it and how long we keep it. Our{" "}
          <Link href="/privacy-policy" className="underline">
            privacy policy
          </Link>{" "}
          covers the rest of LoveIQ.
        </p>

        <h2>Who to contact</h2>
        <ul>
          <li>
            Questions and requests:{" "}
            <a href="mailto:hello@loveiq.org" className="underline">
              hello@loveiq.org
            </a>
            .
          </li>
          <li>
            Our data protection officer, Eman Čičkušić:{" "}
            <a href="mailto:ec@loveiq.org" className="underline">
              ec@loveiq.org
            </a>
            , or by post to the address above.
          </li>
        </ul>

        <h2>What Mira uses</h2>
        <ul>
          <li>
            What you write to Mira, and what she writes back. It is about your sex life and often
            your health. The GDPR calls this sensitive data. We only use it with your explicit
            consent, which you give with a tick before your first message or when you make an
            account.
          </li>
          <li>
            With a free account: your email address, the name and gender you give, the country you
            choose, your coaching style, your settings and your time zone. We also keep each consent
            you gave, when you gave it and which wording you saw.
          </li>
          <li>Your saved chats, if &ldquo;Remember our conversations&rdquo; is on.</li>
          <li>
            Your LoveIQ Sexual Personality result, only if you tick &ldquo;Use my LoveIQ test result
            to tailor my coaching&rdquo;. It stays off unless you turn it on. We find your result by
            the email address you confirmed.
          </li>
          <li>
            Your thumbs up or down on a reply. We keep only the thumbs, never the reply&apos;s text.
          </li>
          <li>
            Your feedback, and your answer when Mira asks whether you would recommend her. Your
            email address goes with your feedback only if you say we may contact you.
          </li>
          <li>
            The body check, if you choose to take it: your answers to ten statements about how you
            relate to your body (the Body Appreciation Scale-2), at the start and four weeks later.
          </li>
          <li>
            Labels about your chats, never your words: which of Mira&apos;s questions you answered
            (not your answer), the topic of a new chat, when Mira suggested a doctor or therapist
            and when she showed you support lines. Also the steps you take, such as opening the chat
            or making an account, with the time.
          </li>
          <li>
            For your daily nudges: when each was sent, whether it reached you, whether you opened it
            and whether you clicked its button.
          </li>
          <li>
            A random id in a cookie on this browser, kept for a year. Without an account it counts
            your free message and links your steps. When you sign in, a cookie keeps you signed in.
          </li>
          <li>
            Short-lived counters with your IP address, email address or browser id, to stop abuse.
          </li>
        </ul>

        <h2>Why, and on what legal basis</h2>
        <ul>
          <li>
            To coach you. Mira needs your messages to answer them. Legal basis: your explicit
            consent (Art. 6(1)(a) and Art. 9(2)(a) GDPR).
          </li>
          <li>
            To see whether Mira helps. We count the labels and compare body check scores across
            everyone. We never read your words for this. Legal basis: your explicit consent (Art.
            6(1)(a) and Art. 9(2)(a) GDPR).
          </li>
          <li>
            To run your free account: signing in, your settings and the emails that come with it,
            which are your sign-in codes and the daily nudges. Legal basis: our contract with you
            (Art. 6(1)(b) GDPR). A nudge picks up on your last chat, so it also rests on your
            consent to coaching.
          </li>
          <li>
            To improve Mira from ratings, feedback, the steps people take and nudge opens, and to
            stop abuse. Legal basis: our legitimate interest in a service that works and is safe
            (Art. 6(1)(f) GDPR).
          </li>
          <li>
            Our analytics tools run on Mira&apos;s pages, as on the rest of our site. PostHog and
            Microsoft Clarity see what you and Mira write in the chat, as it appears on the page.
            Legal basis, as in section 7.4 of our privacy policy: our legitimate interest (Art.
            6(1)(f) GDPR). Google cookies and identifiers need your cookie consent.
          </li>
          <li>
            We do not use what you tell Mira for advertising or to train AI models. Anthropic may
            not use it to train its models either.
          </li>
        </ul>

        <h2>Who else gets your data</h2>
        <p className="mt-3">
          A processor works only on our instructions, under a data processing agreement. An
          independent controller decides itself what it does with the data, under its own privacy
          policy.
        </p>
        <table className="mt-3 w-full border-collapse text-left text-[13px] leading-snug">
          <thead className="max-md:hidden">
            <tr>
              {COLUMNS.map(([key, label]) => (
                <th
                  key={key}
                  scope="col"
                  className="border-b border-ap-line px-2 py-2 align-bottom font-semibold text-ap-ink"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RECIPIENTS.map((r) => (
              <tr key={r.who} className="border-b border-ap-line max-md:block max-md:py-3">
                {COLUMNS.map(([key, label]) => (
                  <td
                    key={key}
                    className={`px-2 py-2 align-top max-md:block max-md:px-0 max-md:py-0.5 ${key === "who" ? "font-semibold text-ap-ink" : ""}`}
                  >
                    {key === "who" ? null : (
                      <span className="font-semibold text-ap-ink md:hidden">{label}: </span>
                    )}
                    {r[key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <h2>How long we keep it</h2>
        <ul>
          <li>
            Without an account, your chat is saved only in this browser, not by us. Starting a new
            chat or clearing your browser data removes it. If you make an account, Mira can carry
            the chat into it.
          </li>
          <li>
            With an account, Mira saves your chats while &ldquo;Remember our conversations&rdquo; is
            on. They stay until you delete them in Settings or delete your account, and at most 12
            months after the last message you wrote.
          </li>
          <li>
            If you turn &ldquo;Remember our conversations&rdquo; off, Mira stops saving new chats.
            Chats saved before stay until you delete them in Settings, or until the 12-month limit.
          </li>
          <li>
            Your account, profile, body check answers and nudge records stay until you delete your
            account. If you never finish signing up, your sign-in is deleted after 24 hours.
          </li>
          <li>
            Mira&apos;s log of labels, steps, ratings and feedback is deleted after 12 months.
            Deleting your account deletes any words in the log, and the rest is no longer linked to
            you.
          </li>
          <li>Sign-in codes are deleted once used, and otherwise within a day.</li>
          <li>The counters against abuse expire by themselves within 30 days.</li>
          <li>Backups of our database keep copies for up to 30 days.</li>
          <li>
            Anthropic deletes your messages and Mira&apos;s replies within 30 days. If its automated
            safety systems flag a chat, it may keep it for up to 2 years.
          </li>
          <li>
            Analytics tools keep data for their own periods. PostHog, for example, keeps session
            recordings for 30 days.
          </li>
        </ul>

        <h2>Your daily journal</h2>
        <ul>
          <li>
            If you use the daily journal in your account, we keep, for each day you check in, how
            you rated your mood, your body, closeness and energy (1 to 5, or skipped) and the line
            you wrote, if any. This is sensitive data about your health and sex life. We keep it to
            show it back to you, on the explicit consent you gave when you made your account (Art.
            6(1)(a) and Art. 9(2)(a) GDPR).
          </li>
          <li>
            Mira reads your journal only if you turn on &ldquo;Let Mira read my journal&rdquo;. Then
            your ratings from the last 7 days go to Anthropic with your messages, so she can notice
            patterns with you. Your notes go too only if you also turn on &ldquo;Include my
            notes&rdquo;. Both are off unless you turn them on, we keep when you chose, and turning
            one off stops it from your next message.
          </li>
          <li>
            PostHog and Microsoft Clarity don&apos;t record your ratings or notes: we hide them from
            their recordings. They can still see that you used the journal.
          </li>
          <li>
            To see how the journal is used, we count check-ins, days in a row and these choices
            across everyone, never your ratings or your words.
          </li>
          <li>
            A daily reminder email comes only if you turn on &ldquo;Remind me daily&rdquo;: one a
            day at most, at the time you choose, never with anything from your journal. Resend sends
            it, as it sends our other emails, and a link in every reminder stops it without signing
            in.
          </li>
          <li>
            Your journal stays until you delete an entry or all of it, on the journal page or in
            Settings, or your account. If a note mentions wanting to hurt yourself, you see the same
            support lines as in the chat. If you tell Mira you are under 18, your journal is
            deleted.
          </li>
        </ul>

        <h2>Your choices and rights</h2>
        <ul>
          <li>
            You can take back your consent at any time. Stop chatting, or delete your chats or your
            account in Settings. Without an account, start a new chat or clear your browser data.
            This does not make what we did before unlawful.
          </li>
          <li>
            Daily nudges come with your free account. You can pause or stop them with the link in
            any nudge, or in Settings.
          </li>
          <li>
            You can ask for access to your data and a copy of it, and for correction, deletion or
            restriction. You can object to what we do on the basis of our legitimate interest. Write
            to{" "}
            <a href="mailto:hello@loveiq.org" className="underline">
              hello@loveiq.org
            </a>{" "}
            or to our data protection officer at{" "}
            <a href="mailto:ec@loveiq.org" className="underline">
              ec@loveiq.org
            </a>
            . A request covers all your Mira data.
          </li>
          <li>
            You can complain to a data protection authority, for example the Berlin Commissioner for
            Data Protection and Freedom of Information.
          </li>
        </ul>

        <h2>Only for adults</h2>
        <p className="mt-3">
          Mira is only for people aged 18 or older. If you tell Mira you are under 18, she stops
          coaching for good on that account or in that browser. She turns her emails off and deletes
          the chats saved in that account. In a browser without an account, the chat there is
          cleared.
        </p>

        <h2>Mira is not a therapist</h2>
        <p className="mt-3">
          Mira does not give medical advice, diagnosis or treatment, and she can be wrong. If you
          are in danger or might hurt yourself, call your local emergency number (112 in the EU). In
          the chat, &ldquo;Need support right now?&rdquo; lists free support lines. Mira always
          answers a message about a crisis, even after your free messages are used up.
        </p>
        <p className="mt-3">
          Mira&apos;s body confidence guide is a page to read. It asks for nothing and stores
          nothing beyond the analytics on all our pages.
        </p>
      </article>
    </MiraFrame>
  );
}
