"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CRISIS_COUNTRY_OPTIONS } from "./countries";
import { GradientButton, Wordmark } from "./MiraShell";
import { local, miraApi } from "./api";

/**
 * Boards 04 (create account), 05 (verify email) and 06 (about you), without the WhatsApp step
 * (out of the MVP) and with email code only (Apple and Google sign-in follow later).
 */

type Step = "account" | "verify" | "about";
const STEPS: Array<{ key: Step; label: string }> = [
  { key: "account", label: "Account" },
  { key: "verify", label: "Verify" },
  { key: "about", label: "About you" },
];

export default function SignUpFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("account");
  const [email, setEmail] = useState("");
  const [adult, setAdult] = useState(false);
  const [terms, setTerms] = useState(false);
  const [consent, setConsent] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [gender, setGender] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function sendCode() {
    setBusy(true);
    setError(null);
    const res = await miraApi("/api/mira/auth", {
      body: { action: "start", email, adult, terms, consent },
    });
    setBusy(false);
    if (!res.ok) return setError(res.data.error ?? "We couldn't send the code. Please try again.");
    setNotice(null);
    setStep("verify");
  }

  async function verify() {
    setBusy(true);
    setError(null);
    const carry = local.chat()?.turns ?? [];
    const res = await miraApi<{ needsProfile?: boolean; chatId?: string | null }>(
      "/api/mira/auth",
      {
        body: {
          action: "verify",
          email,
          code,
          ...(carry.length ? { carry: carry.slice(-48) } : {}),
        },
      }
    );
    setBusy(false);
    if (!res.ok)
      return setError(res.data.error ?? "That code didn't work. Check it, or send a new one.");
    local.saveChat(null);
    if (res.data.needsProfile) setStep("about");
    else router.push("/mira/home");
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
        time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || undefined,
      },
    });
    setBusy(false);
    if (!res.ok) return setError(res.data.error ?? "We couldn't save that. Please try again.");
    router.push("/mira/home");
  }

  const current = STEPS.findIndex((s) => s.key === step);
  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-ap-ink lg:flex-row">
      <aside className="flex flex-col gap-8 bg-ap-lilac p-6 sm:p-10 lg:w-[460px] lg:shrink-0">
        <Wordmark />
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
          {step === "account" ? (
            <form
              className="flex flex-col gap-5"
              onSubmit={(e) => {
                e.preventDefault();
                void sendCode();
              }}
            >
              <div>
                <h1 className="font-serif text-[34px] font-medium leading-tight">
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
                <h1 className="font-serif text-[34px] font-medium leading-tight">
                  Check your inbox
                </h1>
                <p className="mt-2 text-[15px] text-ap-body">
                  We sent a sign-in code to <strong>{email}</strong>. It works for an hour.
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
                  className="underline"
                  onClick={async () => {
                    await sendCode();
                    setNotice("A new code is on its way.");
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
              <h1 className="font-serif text-[34px] font-medium leading-tight">About you</h1>
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
                onClick={() => router.push("/mira/home")}
                className="text-[14px] text-ap-muted underline"
              >
                Skip for now
              </button>
            </form>
          ) : null}

          {notice ? <p className="text-[14px] text-ap-good-ink">{notice}</p> : null}
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
