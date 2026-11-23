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
    gets: "Your messages, the chat so far, and what Mira knows about you: your coaching style and, with an account, your name, gender, country, the language you want her replies in, your goals on the go with this week's ticks, your weekly session's day and time and, if you allow it, your LoveIQ result, your journal, the bands of your self-checks and whether your mood check reported thoughts of being better off dead or of hurting yourself (never your answers or scores). When you open a weekly session, your last saved chat. When a voice session ends, its words once more, to write its key points.",
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
    gets: "Your email address and the emails we send you: sign-in and confirmation codes, nudges, weekly-session invites and reminders, journal reminders, and the note when your address changes or a passkey is added. For each email, whether it reached you, was opened and which link was clicked, with your IP address and email app.",
    basis: "Our contract with you; for opens and clicks, our legitimate interest",
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
    gets: "How you use our pages, including what you and Mira write in the chat, your goals, your journal, your voice sessions and their key points, your picks and your answers in “Find my challenge”, the words of a rating, and your self-check answers and results, as they show on the page.",
    basis: "Our legitimate interest",
    where: "EU (Frankfurt). PostHog is in the EU–US Data Privacy Framework.",
  },
  {
    who: "Microsoft: Clarity",
    role: "Independent controller.",
    gets: "Recordings and heatmaps of how you use our pages, including what you and Mira write in the chat, your goals, your journal, your voice sessions and their key points, your picks and your answers in “Find my challenge”, the words of a rating, and your self-check answers and results, as they show on the page.",
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
    who: "Everyone who visits Mira's pages",
    role: "The public. Only if you rate Mira and tick the box to show your words.",
    gets: "Your words once our team approved them, with the first name or initials and the age range you chose. Your stars only as part of the average, never with your name.",
    basis: "Your explicit consent",
    where: "Anywhere: a web page anyone can open.",
  },
  {
    who: "CookieYes",
    role: "Processor. Stores your cookie choice.",
    gets: "Your cookie choice, with a random id.",
    basis: "Our legal duty to prove consent",
    where: "UK. The EU recognises the UK as safe (adequacy decision).",
  },
  // Talking to Mira by voice (22 Nov 2026): the browser's own service, never one of ours.
  {
    who: "Your browser's speech service (for example Apple's or Google's)",
    role: "Your browser's maker, under its own terms. Only when you talk to Mira and your browser can't turn speech into text on your device.",
    gets: "Your voice while you talk to Mira, which it turns into text for your browser. We never receive the sound.",
    basis: "Your explicit consent, which you give with a tick before you first talk",
    where: "Decided by your browser's maker. It may be outside the EU.",
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
 * 21 Nov 2026: the reply language and the look (light or dark, text size) with their cookie.
 * 22 Nov 2026: goals (Challenges & goals), in each section below; ratings and quotes
 * (features/mira/reviews.ts), to be checked by Eman; passkeys, signed-in devices and changing
 * the email (Settings › Sign-in & security); the self-checks (to be checked by Eman).
 * 22 Nov 2026, after the privacy audit: what the analytics tools see (nothing on Mira's pages is
 * masked, DPIA M5), the team's data tool, every email Resend sends, the voice tick, the
 * self-checks' counts and the under-18 stop in full.
 * Round 3 (R3-DATA-4): the email links' cookie (mira_link) and the under-18 browser mark.
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
            choose, your coaching style, your settings and your time zone. We also keep when you
            last gave your consent and which wording you saw.
          </li>
          <li>
            The language you want Mira to reply in, if you choose one, and how Mira looks for you
            (light or dark, and the text size). The look is also kept in a cookie on this browser
            for a year, so Mira&apos;s pages open the way you set them, with or without an account.
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
            If you rate Mira: your stars, from 1 to 5. Only if you tick the box for it, also one
            sentence for others, with the first name or initials and the age range you choose, when
            you agreed and to which wording, and whether our team approved it. See{" "}
            <a href="#ratings" className="underline">
              Ratings and quotes
            </a>
            .
          </li>
          <li>
            The body check, if you choose to take it: your answers to ten statements about how you
            relate to your body (the Body Appreciation Scale-2), at the start and four weeks later.
          </li>
          <li id="self-checks">
            Your self-checks, if you choose to take them: your answers to the anxiety check (GAD-7),
            the mood check (PHQ-9) and the loneliness check, with the date. They are health data. We
            work out your score and band from your answers and show them to you, with how many
            points higher or lower each is than last time. If your answer to the mood check&apos;s
            question about thoughts of being better off dead or of hurting yourself was above
            &ldquo;Not at all&rdquo;, that result keeps the support lines at its top whenever you
            open it, and for 14 days Mira sends you no nudges or journal reminders; deleting your
            check results ends that pause. Mira sees only each check&apos;s latest band from the
            last 90 days, such as &ldquo;mild anxiety&rdquo;, and only if you turn on &ldquo;Mira
            may use my check results&rdquo;. Then she is also told if that mood check reported such
            thoughts, so she can gently check in once a chat, offer support lines and, if you are at
            risk now, follow her crisis rules. She never sees your answers or scores. We keep when
            you turn that on or off, and which wording you saw. Our statistics count the checks
            started and finished, never what you answered, and how often that question showed
            support lines: a count only, not linked to you or your browser. Until you finish a
            check, your answers so far are kept only in this browser tab, for up to a day. The
            checks support self-reflection; they are not a diagnosis.
          </li>
          <li>
            Your goals, if you set any with an account: each goal in your words, how many days a
            week you aim for, whether Mira suggested it, and the days you tick it. When you chat,
            Mira sees your goals on the go and this week&apos;s ticks, so she can ask how one is
            going. We count goals set, ticked, done and put away, never what they say.
          </li>
          <li>
            Labels about your chats, never your words: which of Mira&apos;s questions you answered
            (not your answer), the topic of a new chat, when Mira suggested a doctor or therapist
            and when she showed you support lines. Also the steps you take, such as opening the chat
            or making an account, with the time.
          </li>
          <li>
            For your daily nudges: when each was sent, whether it reached you, whether you opened it
            and whether you clicked its button. If you stop them: the reason you pick and anything
            you add in your own words.
          </li>
          <li>
            If you book a weekly session: the day, time and time zone you choose, when each reminder
            was sent, and whether you opened the session within 30 minutes of its start. When you
            open a session, Mira picks up from your last saved chat, but never from one that held a
            crisis in the last 14 days.
          </li>
          <li>
            A random id in a cookie on this browser, kept for a year. Without an account it counts
            your free message and links your steps. When you sign in, a cookie keeps you signed in.
            When you open a link from one of Mira&apos;s emails to stop reminders or change your
            nudges, a cookie keeps the link&apos;s key for an hour, sent only to that page, so the
            key stays out of the page&apos;s address.
          </li>
          <li>
            Short-lived counters with your IP address, email address or browser id, to stop abuse.
          </li>
          <li>
            If you add a passkey (Face ID, Touch ID, Windows Hello or a fingerprint): its public key
            and id, a name (the device it was made on, which you can change), whether it is synced,
            and when it was added and last used. Your face or fingerprint never leaves your device;
            we never see it.
          </li>
          <li>
            For each device you sign in on: how you signed in (a code, Google or a passkey), the
            kind of device and browser (for example &ldquo;iPhone · Safari&rdquo;), the approximate
            city at sign-in, which our host works out from your IP address (we don&apos;t keep the
            IP address), and when it was last used. You see them in Settings.
          </li>
          <li>
            If you change your email: the new address and a scrambled form of the code we send
            there, until you confirm it.
          </li>
        </ul>

        <h2>Coaches, suggestions and search</h2>
        <ul>
          <li>
            Mira&apos;s coaches page lists the coaches on their way. If you tap &ldquo;Notify
            me&rdquo; on one, we keep which coach you asked about, with your account, so we can let
            you know when that coach is ready. Like the rest of Mira&apos;s log, the request is
            deleted after 12 months.
          </li>
          <li>
            &ldquo;Find my challenge&rdquo; asks two quick questions. We keep only which coach it
            suggested, never your answers. That coach shows which challenge you picked; like the
            rest of Mira&apos;s log, it is deleted after 12 months.
          </li>
          <li>
            &ldquo;Picked for you&rdquo; on your Home page suggests practices from the guide, and
            sometimes a coach, from the topics of your own chats (the labels above). It uses only
            the chats you still have from while you were signed in: a chat you delete stops counting
            at once, and so does every chat from before you last deleted all your chats. It uses
            nothing while &ldquo;Remember our conversations&rdquo; is off. It shows only on your
            Home page, which our analytics tools also record.
          </li>
          <li>
            The search on your Home page runs in your browser: what you type is not sent to our
            servers, though our analytics tools record the page as they do every page. We count
            searches that find nothing, without the words.
          </li>
          <li>
            We also count, as steps, when you open the coaches page and the finder, which picks you
            are shown and which you tap, and which practice of the guide you asked Mira about.
          </li>
          <li>
            Legal basis: your explicit consent to coaching (Art. 6(1)(a) and Art. 9(2)(a) GDPR), as
            for Mira&apos;s other labels. If you tell Mira you are under 18, your requests to hear
            about coaches and the coach the finder suggested are deleted, and no coach is offered to
            you.
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
            To keep your goals, show how they build up and let Mira check in on them. This is part
            of coaching you. Legal basis: your explicit consent (Art. 6(1)(a) and Art. 9(2)(a)
            GDPR).
          </li>
          <li>
            To show you your self-checks, to count how they are used (never your answers) and, if
            you allow it, to let Mira tailor her coaching to them. Legal basis: your explicit
            consent (Art. 6(1)(a) and Art. 9(2)(a) GDPR), which you give at sign-up for what you
            share about your health and confirm when you start your first check.
          </li>
          <li>
            To run your free account: signing in, your settings and the emails that come with it,
            which are your sign-in codes and the daily nudges. Legal basis: our contract with you
            (Art. 6(1)(b) GDPR). A nudge picks up on your last chat, so it also rests on your
            consent to coaching.
          </li>
          <li>
            To keep your account safe: passkeys, the list of devices you&apos;re signed in on,
            signing them out, changing your email (a code goes to the new address, and we tell your
            old one), and telling you when a passkey is added. Legal basis: our contract with you
            (Art. 6(1)(b) GDPR); for each device&apos;s approximate city, our legitimate interest in
            letting you spot a sign-in that isn&apos;t yours (Art. 6(1)(f) GDPR).
          </li>
          <li>
            If you book a weekly session: to keep it, and to email you its calendar invite, any
            change, and a reminder before each session. Legal basis: our contract with you (Art.
            6(1)(b) GDPR), as you asked for it. These emails never contain anything from your chats,
            and the reminders pause for 14 days after a crisis, as the nudges do.
          </li>
          <li>
            To improve Mira from ratings, feedback, the steps people take and the opens and clicks
            of our emails, and to stop abuse. Legal basis: our legitimate interest in a service that
            works and is safe (Art. 6(1)(f) GDPR).
          </li>
          <li>
            To show honest ratings on Mira&apos;s pages. Your stars count toward the average shown,
            never with your name. Before we take a rating, we count your messages to Mira to check
            that you have talked with her; we don&apos;t read them for it. Legal basis: our
            legitimate interest in telling visitors what people think of Mira (Art. 6(1)(f) GDPR).
            Your words, name and age range are shown only with your explicit consent, because they
            may say something about your sex life or your health (Art. 6(1)(a) and Art. 9(2)(a)
            GDPR).
          </li>
          <li>
            Our analytics tools run on Mira&apos;s pages, as on the rest of our site. PostHog and
            Microsoft Clarity see what is on them as it appears there, from what you and Mira write
            in the chat to your goals, journal and self-checks (see the table below). Legal basis,
            as in section 7.4 of our privacy policy: our legitimate interest (Art. 6(1)(f) GDPR).
            Google cookies and identifiers need your cookie consent.
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

        <p className="mt-3">
          Weekly sessions add no one to this list: Resend sends their emails. If you add a session
          to your calendar, your calendar provider (for example Google or Apple) keeps that entry
          under its own privacy policy.
        </p>
        <p className="mt-3">
          Our team can currently also read much of what Mira stores, including your chats, goals,
          journal, the key points of your voice sessions and your name, with an internal data tool
          that only team members can use. Its answers reach them through Claude, Anthropic&apos;s AI
          assistant.
        </p>

        {/* Talking to Mira by voice (22 Nov 2026, features/mira/ui/voice). */}
        <h2>Talking to Mira by voice</h2>
        <ul>
          <li>
            If you tap Talk, your browser listens through your microphone, in the language you chose
            for Mira&apos;s replies or else your browser&apos;s own, and turns what you say into
            text. Mira never receives your voice or any recording of it, only the text. The text
            goes to Mira like a typed message: the same consent, safety rules and limits apply.
          </li>
          <li>
            Where your browser can, this happens on your device (in Chrome, for example). Otherwise
            your browser uses its maker&apos;s speech service (for example Apple&apos;s or
            Google&apos;s), under that company&apos;s terms, not ours, possibly outside the EU.
            Before you first talk, you agree to that with a tick; we keep that you agreed, when, and
            which wording you saw.
          </li>
          <li>
            Mira&apos;s replies are read aloud by a voice on your device. We never use an online
            voice, so no other company gets her words for it.
          </li>
          <li>
            The words show on the page as you speak, so our analytics tools see them there, as they
            see typed text.
          </li>
          <li>
            With an account and &ldquo;Remember our conversations&rdquo; on, each voice session is
            kept as words: its spoken messages in your chat, when it began and ended, how much of
            the talking was yours and Mira&apos;s (counted in words), whether speech became text on
            your device or in your browser&apos;s service, and up to three key points.
            Anthropic&apos;s model writes the key points from the session&apos;s words, under the
            same rules as Mira&apos;s replies. Mira is told not to sum up a session in which she
            showed support lines.
          </li>
          <li>
            You can read and delete each session under Voice sessions. Deleting it deletes its key
            points and its words, in the chat too. A session also goes with its chat: when you
            delete your chats or your account, at the 12-month limit, or if Mira stops because you
            are under 18.
          </li>
          <li>
            For Mira&apos;s statistics we count each session&apos;s length, how speech became text,
            its number of turns and whether its key points were opened later: numbers, never words.
            Without an account, that count is all we keep of a voice session.
          </li>
        </ul>

        <h2>How long we keep it</h2>
        <ul>
          <li>
            Without an account, your chat is saved only in this browser, not by us. Starting a new
            chat or clearing your browser data removes it. If you make an account, Mira can carry
            the chat into it.
          </li>
          <li>
            With an account, Mira saves your chats while &ldquo;Remember our conversations&rdquo; is
            on. They stay until you delete them in Settings or delete your account. If you
            don&apos;t write to Mira for 12 months, they are all deleted.
          </li>
          <li>
            If you turn &ldquo;Remember our conversations&rdquo; off, Mira stops saving new chats.
            Chats saved before stay until you delete them in Settings, or until the 12-month limit.
          </li>
          <li>
            Your account, profile and nudge records stay until you delete your account. Body check
            answers stay until you delete them in Settings with your check results, or delete your
            account. If you never finish signing up, your sign-in is deleted after 24 hours.
          </li>
          <li>
            Your goals and the days you ticked them stay until you delete them on your goals page,
            or delete your account.
          </li>
          <li>
            Your rating, and your words if you shared them, stay until you take them back in
            Settings or delete your account. Words our team decides not to show are deleted then;
            the reason we gave stays with your rating, so you can see it in Settings.
          </li>
          <li>
            Your self-check answers stay until you delete them (Settings, &ldquo;Delete my check
            results&rdquo;) or delete your account. If Mira stops coaching you because you are under
            18, they are deleted too.
          </li>
          <li>
            Mira&apos;s log of labels, steps, ratings, feedback and reasons for stopping nudges is
            deleted after 12 months. Deleting your account deletes any words in the log, and the
            rest is no longer linked to you.
          </li>
          <li>
            A weekly session stays until you cancel it or delete your account, and its reminder
            records go with it.
          </li>
          <li>Sign-in codes are deleted once used, and otherwise within a day.</li>
          <li>
            Passkeys stay until you remove them in Settings or delete your account. A device stays
            in your list until you sign it out, or until 90 days after it was last used; then it has
            to sign in again. A change of email waiting for its code is deleted once used, and
            otherwise within a day.
          </li>
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
            PostHog and Microsoft Clarity record how our pages are used, the journal&apos;s screens
            included, as for the chat (see &ldquo;Who else gets your data&rdquo;).
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
            You can take back your consent at any time. Stop chatting, or delete your chats, your
            self-check results or your account in Settings. Without an account, start a new chat or
            clear your browser data. This does not make what we did before unlawful.
          </li>
          <li>
            Daily nudges come with your free account. You can stop them with the link in any nudge,
            or in Settings. To pause them or get fewer instead, sign in from that link.
          </li>
          <li>You can delete one goal, or all your goals, on your goals page at any time.</li>
          <li>
            You can stop showing your words, or remove your rating, in Settings at any time. They
            disappear from Mira&apos;s pages straight away.
          </li>
          <li>
            In Settings you can remove a passkey, sign out any device or every device at once, and
            change your email.
          </li>
          <li>
            A weekly session is your choice. Change it, pause its reminders or cancel it in
            Settings; every session email has a link that stops the reminders.
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
            . A request covers all your Mira data. A copy leaves out what was done in a browser
            before you signed in, as on a shared browser that can be someone else&apos;s.
          </li>
          <li>
            You can complain to a data protection authority, for example the Berlin Commissioner for
            Data Protection and Freedom of Information.
          </li>
        </ul>

        <h2 id="ratings">Ratings and quotes</h2>
        <p className="mt-3">
          Anyone who has talked with Mira can rate her in Settings, at any time. Mira also asks at a
          good moment: after you say you would recommend her, or after you liked several of her
          answers in one chat. Never right after a crisis, a suggestion to see a doctor or
          therapist, or the body check, and at most once a month. You can always say &ldquo;Not
          now&rdquo;.
        </p>
        <ul>
          <li>
            Only people who have talked with Mira can rate her, once each: an account needs at least
            three messages of its own. To check, we count your messages; we don&apos;t read them for
            it.
          </li>
          <li>Every rating counts toward the average, high or low.</li>
          <li>
            Your words are shown only if you tick the box for it. Our team reads every quote before
            it shows. We never change your words, except to take out a detail that could identify
            you or someone else, which we mark with […], as the box says.
          </li>
          <li>
            We hold back or take down a quote only if we can&apos;t remove identifying details, it
            is harmful or abusive, it isn&apos;t about Mira, or it is spam or a duplicate, never
            because it is critical. Settings shows you our reason.
          </li>
          <li>
            Mira&apos;s pages show the average, how many people rated her and one approved quote a
            day, whatever its stars, and only once at least 20 people have rated her. Our
            team&apos;s own ratings, and those of anyone who said they are under 18, never count.
          </li>
          <li>
            If you tell Mira you are under 18, your rating and your words are deleted, even if they
            were shown.
          </li>
        </ul>

        <h2>Only for adults</h2>
        <p className="mt-3">
          Mira is only for people aged 18 or older. If you tell Mira you are under 18, she stops
          coaching for good on that account or in that browser. In a browser without an account, the
          chat there is cleared, and a cookie marks that browser for a year. In an account, she
          turns her emails off, forgets its reply language and look, and deletes what it keeps: its
          chats, goals, journal, self-check and body check results, voice sessions, rating and
          words, passkeys, weekly session, requests to hear about coaches and the coach the finder
          suggested, and a change of email waiting for its code.
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
          nothing beyond the analytics on all our pages. &ldquo;Ask Mira about this&rdquo; opens the
          chat with a question about that practice, for you to send or change; the chat notes which
          practice it was.
        </p>
      </article>
    </MiraFrame>
  );
}
