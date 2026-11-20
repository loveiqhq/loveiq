"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CRISIS_COUNTRY_OPTIONS } from "./countries";
import { GradientButton, Wordmark } from "./MiraShell";
import { local, miraApi, useReloadWhenRestored } from "./api";

/**
 * Boards 04 (create account), 05 (verify email) and 06 (about you), without the WhatsApp step
 * (out of the MVP). Sign-in by emailed code or with Google (Apple follows later).
 */

type Step = "account" | "verify" | "about";
const STEPS: Array<{ key: Step; label: string }> = [
  { key: "account", label: "Account" },
  { key: "verify", label: "Verify" },
  { key: "about", label: "About you" },
];

const GOOGLE_ERRORS: Record<string, string> = {
  cancelled: "Google sign-in was cancelled. Try again, or use your email.",
  failed: "Google sign-in didn't work. Please try again, or use your email.",
  busy: "Too many tries. Please wait a minute, or use your email.",
  off: "Google sign-in isn't available right now. Please use your email.",
  ticks: "Please tick the three boxes first.",
  other: "Please sign in with your email for this address. We'll send you a code.",
};

/** A new account's zone until the browser's is sent (migration 20261118210000_mira_nudges_and_memory). */
const DEFAULT_TIME_ZONE = "Europe/Berlin";
const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;

/** The daily nudge comes at the person's own 8:00: a profile still on the default zone gets this browser's. */
async function keepTimeZone() {
  const tz = browserTimeZone();
  if (!tz || tz === DEFAULT_TIME_ZONE) return;
  const me = await miraApi<{ profile?: { time_zone?: string } }>("/api/mira/me");
  if (me.ok && me.data.profile?.time_zone === DEFAULT_TIME_ZONE) {
    await miraApi("/api/mira/me", { method: "PATCH", body: { time_zone: tz } });
  }
}

/** The anonymous chat as the sign-in carries it: role and words only. */
const carriedChat = () =>
  (local.chat()?.turns ?? []).map(({ role, content }) => ({ role, content })).slice(-48);

export default function SignUpFlow({
  googleEnabled = false,
  googleResult = null,
  needsAbout = false,
}: {
  googleEnabled?: boolean;
  googleResult?: string | null;
  needsAbout?: boolean;
}) {
  const router = useRouter();
  const backFromGoogle = googleResult === "done";
  const [step, setStep] = useState<Step>(backFromGoogle && needsAbout ? "about" : "account");
  const [email, setEmail] = useState("");
  const [adult, setAdult] = useState(false);
  const [terms, setTerms] = useState(false);
  const [consent, setConsent] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [gender, setGender] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    googleResult && !backFromGoogle ? (GOOGLE_ERRORS[googleResult] ?? GOOGLE_ERRORS.failed!) : null
  );
  const [notice, setNotice] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const shownStep = useRef(step);
  useReloadWhenRestored();

  // A new step moves focus to its heading, so keyboard and screen reader users start there.
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    heading.current?.focus();
  }, [step]);

  /** Into the account. Replace: Back must not land on the sign-up again (it would forward here
   *  once more). Refresh: no page the router kept from before the sign-in comes back signed out. */
  function goHome() {
    router.replace("/mira/home");
    router.refresh();
  }

  // Back from Google, signed in: the chat in this browser comes along, as with the emailed code.
  useEffect(() => {
    if (!backFromGoogle) return;
    const carry = carriedChat();
    void (async () => {
      if (carry.length) {
        const res = await miraApi("/api/mira/auth", { body: { action: "carry", carry } });
        if (res.ok) local.saveChat(null);
      }
      if (needsAbout) return;
      await keepTimeZone();
      goHome();
    })();
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Emails a code; true when it went out. */
  async function sendCode(): Promise<boolean> {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await miraApi("/api/mira/auth", {
      body: { action: "start", email, adult, terms, consent },
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.data.error ?? "We couldn't send the code. Please try again.");
      return false;
    }
    setStep("verify");
    return true;
  }

  // Each success below keeps `busy` on until the next page shows, so nothing can be sent twice.
  async function verify() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const carry = carriedChat();
    const res = await miraApi<{ needsProfile?: boolean; chatId?: string | null }>(
      "/api/mira/auth",
      { body: { action: "verify", email, code, ...(carry.length ? { carry } : {}) } }
    );
    if (!res.ok) {
      setBusy(false);
      return setError(res.data.error ?? "That code didn't work. Check it, or send a new one.");
    }
    local.saveChat(null);
    if (res.data.needsProfile) {
      setBusy(false);
      return setStep("about");
    }
    await keepTimeZone();
    goHome();
  }

  async function saveAbout() {
    setBusy(true);
    setError(null);
    const res = await miraApi("/api/mira/me", {
      method: "PATCH",
      body: {
        name: name.trim() || null,
        country: country || null,
        gender: gender.trim() || null,
        // For the daily nudge at the person's own 8:00 (Settings can change it).
        time_zone: browserTimeZone(),
      },
    });
    if (!res.ok) {
      setBusy(false);
      return setError(res.data.error ?? "We couldn't save that. Please try again.");
    }
    goHome();
  }

  async function skipAbout() {
    setBusy(true);
    setError(null);
    // This step promises the nudge at "8:00 your time": the zone is kept even when it's skipped.
    await keepTimeZone();
    goHome();
  }

  const current = STEPS.findIndex((s) => s.key === step);
  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-ap-ink lg:flex-row">
      {/* On phones the form comes first and this lilac panel follows it. */}
      <aside className="order-last flex flex-col gap-8 bg-ap-lilac p-6 sm:p-10 md:order-none lg:w-[460px] lg:shrink-0">
        <div className="hidden md:block">
          <Wordmark />
        </div>
        <div className="mt-auto flex flex-col gap-4">
          <p className="text-[14px] text-ap-body">
            <strong className="text-ap-ink">Mira</strong> · AI coach · Body confidence
          </p>
          <blockquote className="font-serif text-[22px] italic leading-snug sm:text-[26px]">
            {step === "about"
              ? "“Nice to meet you. What should I call you?”"
              : "“With an account, I remember what matters to you, so we never have to start over.”"}
          </blockquote>
          <ul className="flex flex-col gap-2 text-[14px] text-ap-body">
            <li>Your chat history, kept on every device</li>
            <li>Answers that build on what you&apos;ve shared</li>
            <li>Delete everything anytime, in Settings</li>
          </ul>
          <p className="border-t border-black/10 pt-4 text-[13px] leading-relaxed text-ap-body">
            Emails from us use a neutral sender name and subject line, so nothing about your chats
            shows in your inbox.
          </p>
        </div>
      </aside>

      <main className="flex flex-1 flex-col px-4 py-8 sm:px-12 lg:px-20">
        <div className="mb-8 md:hidden">
          <Wordmark />
        </div>
        <nav aria-label="Sign-up progress" className="grid grid-cols-3 gap-2">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex flex-col gap-2">
              <span
                className={`h-1 rounded-full ${i <= current ? "bg-ap-purple" : "bg-ap-track"}`}
              />
              <span
                className={`text-[12px] ${i === current ? "font-bold text-ap-ink" : "text-ap-muted"}`}
              >
                {s.label}
              </span>
            </div>
          ))}
        </nav>

        <div className="my-auto flex w-full max-w-[460px] flex-col gap-5 py-10">
          {backFromGoogle && step === "account" ? (
            <p className="text-[15px] text-ap-body">Signing you in…</p>
          ) : null}

          {step === "account" && !backFromGoogle ? (
            <form
              className="flex flex-col gap-5"
              onSubmit={(e) => {
                e.preventDefault();
                void sendCode();
              }}
            >
              <div>
                <h1
                  ref={heading}
                  tabIndex={-1}
                  className="font-serif text-[34px] font-medium leading-tight outline-none"
                >
                  Create your free account{" "}
                  <span className="inline-block whitespace-nowrap align-middle rounded-full bg-ap-lilac px-3 py-1 font-sans text-[13px] font-semibold text-ap-plum">
                    Beta version
                  </span>
                </h1>
                <p className="mt-2 text-[15px] text-ap-body">
                  It takes a minute. Your current chat comes with you.
                </p>
              </div>
              <label className="flex flex-col gap-2 text-[14px] font-semibold">
                Email
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="min-h-[48px] rounded-2xl border border-ap-line px-4 text-[16px] font-normal outline-none focus:border-ap-purple"
                />
              </label>
              <p className="-mt-2 text-[13px] text-ap-muted">
                Took the LoveIQ test already? Use the same email and we&apos;ll connect your result.
              </p>
              <Tick checked={adult} onChange={setAdult}>
                I confirm that I am 18 years of age or older.
              </Tick>
              <Tick checked={terms} onChange={setTerms}>
                I agree to the{" "}
                <a href="/terms-of-use" target="_blank" className="underline">
                  Terms of Use
                </a>
                , the{" "}
                <a href="/privacy-policy" target="_blank" className="underline">
                  Privacy Policy
                </a>{" "}
                and the{" "}
                <a href="/medical-disclaimer" target="_blank" className="underline">
                  Medical &amp; Psychological Disclaimer
                </a>
                .
              </Tick>
              <Tick checked={consent} onChange={setConsent}>
                I agree that Mira may use what I share about my sex life, and my test result if I
                allow it, to coach me and to improve Mira.{" "}
                <Link href="/mira/privacy" target="_blank" className="underline">
                  How Mira handles your data
                </Link>
              </Tick>
              <GradientButton
                type="submit"
                disabled={busy || !emailOk || !adult || !terms || !consent}
              >
                {busy ? "Sending…" : "Send me a code"}
              </GradientButton>
              {googleEnabled ? (
                <>
                  <div className="flex items-center gap-3 text-[13px] text-ap-muted">
                    <span className="h-px flex-1 bg-ap-line" />
                    or
                    <span className="h-px flex-1 bg-ap-line" />
                  </div>
                  {/* A plain link: Google sign-in is a full-page hand-over, not an app route. Its href
                      must not depend on state the click changes: React re-renders before the browser
                      follows the link, so a click that cleared the href went nowhere. */}
                  <a
                    href={
                      adult && terms && consent
                        ? "/api/mira/auth/google?adult=1&terms=1&consent=1"
                        : undefined
                    }
                    aria-disabled={busy || !adult || !terms || !consent}
                    className="flex min-h-[48px] items-center justify-center gap-3 rounded-full border border-ap-line bg-white px-5 text-[15px] font-semibold text-ap-ink transition hover:border-ap-purple aria-disabled:pointer-events-none aria-disabled:opacity-50"
                  >
                    <GoogleG />
                    Continue with Google
                  </a>
                </>
              ) : null}
              <p className="text-[13px] text-ap-muted">
                No password needed. Already have an account? Use the same form.
              </p>
            </form>
          ) : null}

          {step === "verify" ? (
            <form
              className="flex flex-col gap-5"
              onSubmit={(e) => {
                e.preventDefault();
                void verify();
              }}
            >
              <div>
                <h1
                  ref={heading}
                  tabIndex={-1}
                  className="font-serif text-[34px] font-medium leading-tight outline-none"
                >
                  Check your inbox
                </h1>
                <p className="mt-2 text-[15px] text-ap-body">
                  We sent a sign-in code to{" "}
                  <strong className="[overflow-wrap:anywhere]">{email}</strong>. It works for an
                  hour.
                </p>
              </div>
              <label className="flex flex-col gap-2 text-[14px] font-semibold">
                Code from the email
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={10}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  className="min-h-[56px] rounded-2xl border border-ap-line px-4 text-center font-serif text-[28px] tracking-[0.5em] outline-none focus:border-ap-purple"
                />
              </label>
              <GradientButton type="submit" disabled={busy || code.length < 6}>
                {busy ? "Checking…" : "Verify and continue"}
              </GradientButton>
              <div className="flex justify-between gap-3 text-[14px] text-ap-muted">
                <button
                  type="button"
                  className="underline disabled:opacity-50"
                  disabled={busy}
                  onClick={async () => {
                    if (await sendCode()) setNotice("A new code is on its way.");
                  }}
                >
                  Send a new code
                </button>
                <button
                  type="button"
                  className="underline"
                  onClick={() => {
                    setStep("account");
                    setCode("");
                  }}
                >
                  Change email
                </button>
              </div>
            </form>
          ) : null}

          {step === "about" ? (
            <form
              className="flex flex-col gap-5"
              onSubmit={(e) => {
                e.preventDefault();
                void saveAbout();
              }}
            >
              <h1
                ref={heading}
                tabIndex={-1}
                className="font-serif text-[34px] font-medium leading-tight outline-none"
              >
                About you
              </h1>
              <label className="flex flex-col gap-2 text-[14px] font-semibold">
                What should Mira call you?
                <input
                  value={name}
                  maxLength={60}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name or nickname"
                  className="min-h-[48px] rounded-2xl border border-ap-line px-4 text-[16px] font-normal outline-none focus:border-ap-purple"
                />
              </label>
              <label className="flex flex-col gap-2 text-[14px] font-semibold">
                How do you describe your gender?{" "}
                <span className="font-normal text-ap-muted">
                  Optional. Mira won&apos;t need to ask again.
                </span>
                <input
                  value={gender}
                  maxLength={40}
                  onChange={(e) => setGender(e.target.value)}
                  placeholder="Woman, man, non-binary, or your own words"
                  className="min-h-[48px] rounded-2xl border border-ap-line px-4 text-[16px] font-normal outline-none focus:border-ap-purple"
                />
              </label>
              <label className="flex flex-col gap-2 text-[14px] font-semibold">
                Where are you based?{" "}
                <span className="font-normal text-ap-muted">
                  So Mira can show the right support lines if you ever need them.
                </span>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="min-h-[48px] rounded-2xl border border-ap-line bg-white px-4 text-[16px] font-normal"
                >
                  <option value="">Choose…</option>
                  {CRISIS_COUNTRY_OPTIONS.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                  <option value="OTHER">Somewhere else</option>
                </select>
              </label>
              <p className="text-[13px] leading-relaxed text-ap-muted">
                Mira sends a short daily nudge by email at 8:00 your time, picking up on your last
                chat. You can change the time, pause or stop it anytime in Settings or from any
                nudge.
              </p>
              <GradientButton type="submit" disabled={busy}>
                {busy ? "Saving…" : "Continue"}
              </GradientButton>
              <button
                type="button"
                disabled={busy}
                onClick={() => void skipAbout()}
                className="text-[14px] text-ap-muted underline disabled:opacity-50"
              >
                Skip for now
              </button>
            </form>
          ) : null}

          {notice ? (
            <p role="status" className="text-[14px] text-ap-good-ink">
              {notice}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-[14px] text-ap-bad-ink">
              {error}
            </p>
          ) : null}
        </div>
      </main>
    </div>
  );
}

/** Google's "G", as its sign-in branding asks. */
function GoogleG() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function Tick({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-3 rounded-2xl border border-ap-line p-4 text-[14px] leading-snug text-ap-body">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-[2px] h-4 w-4 shrink-0 accent-[#795fc8]"
      />
      <span>{children}</span>
    </label>
  );
}
