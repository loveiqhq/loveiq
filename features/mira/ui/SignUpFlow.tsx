"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CRISIS_COUNTRY_OPTIONS } from "./countries";
import { LegalLinks, MiraCloud, PrimaryButton, Wordmark } from "./MiraShell";
import { useMiraLook } from "./MiraLook";
import {
  ADULTS_ONLY,
  NEW_CODE,
  local,
  miraApi,
  rememberSourceForGoogle,
  useReloadWhenRestored,
} from "./api";
import { accountLook } from "./prefs";
import { PasskeyOffer } from "./account/PasskeyOffer";
import {
  autofillWorks,
  canOfferPasskey,
  offeredHere,
  signInWithPasskey,
  stopPasskeyPrompt,
  usePasskeysWork,
} from "./account/passkeys";

/**
 * Boards 04 (create account), 05 (verify email) and 06 (about you), without the WhatsApp step
 * (out of the MVP). Sign-in by emailed code, with Google, or (22 Nov 2026) with a passkey: a
 * button, and the email field's own suggestions where the browser offers passkeys there. After a
 * code sign-in on a device that can make one, "Use Face ID next time?" once (account/).
 */

type Step = "account" | "verify" | "passkey" | "kept" | "about" | "minor";
const STEPS: Array<{ key: Step; label: string }> = [
  { key: "account", label: "Account" },
  { key: "verify", label: "Verify" },
  { key: "about", label: "About you" },
];

const ENTER_EMAIL = "Please enter your email address.";
const TICK_THREE = "Please tick the three boxes to go on.";

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

type SavedLook = { theme?: string | null; text_size?: string | null };

/**
 * Into an account that exists: the look it saved (Settings › Appearance) comes to this browser,
 * and the daily nudge comes at the person's own 8:00 (a profile still on the default zone gets
 * this browser's).
 */
async function afterSignIn(adopt: (saved: SavedLook) => void) {
  const me = await miraApi<{ profile?: SavedLook & { time_zone?: string } }>("/api/mira/me");
  if (!me.ok || !me.data.profile) return;
  adopt(me.data.profile);
  const tz = browserTimeZone();
  if (tz && tz !== DEFAULT_TIME_ZONE && me.data.profile.time_zone === DEFAULT_TIME_ZONE) {
    await miraApi("/api/mira/me", { method: "PATCH", body: { time_zone: tz } });
  }
}

/**
 * The anonymous chat as the sign-in carries it: role and words, and the mark of a reply that
 * opened the support lines (the chat is then named by its date, never by those words).
 */
const carriedChat = () =>
  (local.chat()?.turns ?? [])
    .map(({ role, content, crisis }) => ({ role, content, ...(crisis ? { crisis: true } : {}) }))
    .slice(-48);

/**
 * "Check your inbox", kept in this tab for the code's hour, so a reload, Back or a tab the phone
 * discarded while the person read their mail comes back to the code field (round-2 ID-5).
 */
const WAITING = "mira.signin.code.v1";
const CODE_LIFE_MS = 60 * 60_000;
type Waiting = { email: string; useAssessment: boolean; at: number };
function waitingCode(): Waiting | null {
  try {
    const w = JSON.parse(sessionStorage.getItem(WAITING) ?? "null") as Waiting | null;
    return w && typeof w.email === "string" && Date.now() - w.at < CODE_LIFE_MS ? w : null;
  } catch {
    return null;
  }
}
function keepWaiting(w: Waiting | null): void {
  try {
    if (w) sessionStorage.setItem(WAITING, JSON.stringify(w));
    else sessionStorage.removeItem(WAITING);
  } catch {
    // Blocked storage: a reload starts over, as before.
  }
}

const unchanging = () => () => {};
/** A Settings section the sign-in page was opened at (`#weekly`), or ""; "" on the server. */
const sectionHere = () => (/^#[a-z]{2,20}$/.test(window.location.hash) ? window.location.hash : "");
const useSectionHere = () => useSyncExternalStore(unchanging, sectionHere, () => "");

export default function SignUpFlow({
  googleEnabled = false,
  googleResult = null,
  needsAbout = false,
  minor = false,
  next: asked = null,
}: {
  googleEnabled?: boolean;
  googleResult?: string | null;
  needsAbout?: boolean;
  /**
   * This browser or account is stopped as under 18 (rail 15; the page reads the stop's cookie and
   * the account, and Google's refused return): the one refusal, and nothing to sign in or up with.
   */
  minor?: boolean;
  /** Where to go once signed in (the page checked it: a Mira page only); else Home. */
  next?: string | null;
}) {
  // A link into a Settings section (a session email's #weekly) came here without it in `next`:
  // the page's redirect can't see an anchor, but the browser keeps it in the address.
  const section = useSectionHere();
  const next = asked === "/mira/settings" ? asked + section : asked;
  const router = useRouter();
  const { look, adopt } = useMiraLook();
  const adoptSaved = (saved: SavedLook) => adopt(accountLook(saved, look));
  const backFromGoogle = googleResult === "done";
  const [step, setStep] = useState<Step>(
    minor ? "minor" : backFromGoogle && needsAbout ? "about" : "account"
  );
  // On the under-18 refusal: whether a sign-in happened (a code or Google), so Settings can sign
  // out or delete; a refused passkey or code request, or a stopped browser's visit, signed nobody in.
  const [minorSignedIn, setMinorSignedIn] = useState(minor && backFromGoogle);
  const [email, setEmail] = useState("");
  const [adult, setAdult] = useState(false);
  const [terms, setTerms] = useState(false);
  const [consent, setConsent] = useState(false);
  // Optional, unticked: the LoveIQ result (use_assessment) and the team reading rated replies.
  const [useAssessment, setUseAssessment] = useState(false);
  // The honeypot's value: people never see the field, so only a bot fills it.
  const [website, setWebsite] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [gender, setGender] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    googleResult && !backFromGoogle && !minor
      ? (GOOGLE_ERRORS[googleResult] ?? GOOGLE_ERRORS.failed!)
      : null
  );
  const [notice, setNotice] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const emailField = useRef<HTMLInputElement>(null);
  const shownStep = useRef(step);
  // Passkeys: shown only where the browser has them; where the offer goes on to.
  const passkeys = usePasskeysWork();
  const afterOffer = useRef<"about" | "home">("home");
  // Where "Continue" goes after "Your earlier chat wasn't kept".
  const afterKept = useRef<() => unknown>(() => undefined);
  const ticks = useRef({ adult, terms, consent, useAssessment });
  // A passkey's answer reads the boxes as they are then (ticked while it waited).
  useEffect(() => {
    ticks.current = { adult, terms, consent, useAssessment };
  });
  useReloadWhenRestored();

  // A new step moves focus to its heading, so keyboard and screen reader users start there.
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    heading.current?.focus();
  }, [step]);

  /** Into the account (or back to the chat a nudge opened). Replace: Back must not land on the
   *  sign-up again (it would forward here once more). Refresh: no page the router kept from
   *  before the sign-in comes back signed out. */
  function goHome() {
    router.replace(next ?? "/mira/home");
    router.refresh();
  }

  /**
   * This browser or the account was stopped as under 18 (rail 15): "Mira is only for adults."
   * instead of "About you" or Home, every route refusing from here on; the browser forgets its
   * chat and its 18+ tick, as the chat does at the stop.
   */
  /**
   * The sign-up card promised "this chat comes with you", but this account keeps no chats
   * ("Remember our conversations" off): say so, then go on (round-2 ID-20).
   */
  function notKept(then: () => unknown) {
    afterKept.current = then;
    setBusy(false);
    setStep("kept");
  }

  function refusedAsMinor(signedIn: boolean) {
    local.forget();
    setMinorSignedIn(signedIn);
    setBusy(false);
    setStep("minor");
  }

  // A reload, Back or a discarded tab on "Check your inbox": back to it, with its address and
  // the optional tick (the verify records it). The three required ticks come back too: a code
  // went out only once they were ticked (the route checks them first), and "Send a new code"
  // sends them again (round-3 R3-ACCT-1). Once, after the first paint.
  useEffect(() => {
    if (step !== "account" || backFromGoogle) return;
    const waiting = waitingCode();
    if (!waiting) return;
    /* eslint-disable react-hooks/set-state-in-effect -- this tab's storage, read after hydration */
    setEmail(waiting.email);
    setAdult(true);
    setTerms(true);
    setConsent(true);
    setUseAssessment(waiting.useAssessment);
    setStep("verify");
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Back from Google, signed in: the chat in this browser comes along, as with the emailed code.
  useEffect(() => {
    if (!backFromGoogle) return;
    if (minor) {
      local.forget(); // its chat isn't kept (the page shows the refusal)
      return;
    }
    const carry = carriedChat();
    void (async () => {
      const goOn = async () => {
        if (needsAbout) return setStep("about");
        await afterSignIn(adoptSaved);
        goHome();
      };
      if (carry.length) {
        const res = await miraApi<{ memoryOff?: boolean }>("/api/mira/auth", {
          body: { action: "carry", carry },
        });
        if (res.ok) local.saveChat(null);
        if (res.data.memoryOff) return notKept(goOn);
      }
      if (needsAbout) return;
      await goOn();
    })();
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Emails a code; true when it went out. */
  async function sendCode(): Promise<boolean> {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await miraApi<{ codeSent?: boolean }>("/api/mira/auth", {
      body: { action: "start", email, adult, terms, consent, website },
    });
    setBusy(false);
    // This browser is stopped as under 18: the server sends no code (R4-CORE-1), the refusal shows.
    if (res.minor) {
      refusedAsMinor(false);
      return false;
    }
    // One went out minutes ago (the inbox's 10-minute wait): it still works, so on to its field.
    const sentBefore = res.status === 429 && res.data.codeSent === true && step === "account";
    if (!res.ok && !sentBefore) {
      setError(res.data.error ?? "We couldn't send the code. Please try again.");
      return false;
    }
    keepWaiting({ email, useAssessment, at: Date.now() });
    if (sentBefore) setNotice(res.data.error ?? null);
    setStep("verify");
    return res.ok;
  }

  // Each success below keeps `busy` on until the next page shows, so nothing can be sent twice.
  async function verify() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const carry = carriedChat();
    const res = await miraApi<{
      needsProfile?: boolean;
      chatId?: string | null;
      offerPasskey?: boolean;
      minor?: boolean;
      memoryOff?: boolean;
    }>("/api/mira/auth", {
      body: {
        action: "verify",
        email,
        code,
        useAssessment,
        ...(carry.length ? { carry } : {}),
      },
    });
    if (!res.ok) {
      setBusy(false);
      return setError(res.data.error ?? "That code didn't work. Check it, or send a new one.");
    }
    keepWaiting(null);
    if (res.data.minor) return refusedAsMinor(true);
    local.saveChat(null);
    const goOn = async () => {
      if (res.data.offerPasskey && !offeredHere() && (await canOfferPasskey())) {
        afterOffer.current = res.data.needsProfile ? "about" : "home";
        setBusy(false);
        return setStep("passkey");
      }
      if (res.data.needsProfile) {
        setBusy(false);
        return setStep("about");
      }
      setBusy(true);
      await afterSignIn(adoptSaved);
      goHome();
    };
    if (res.data.memoryOff) return notKept(goOn);
    await goOn();
  }

  /** After the offer, wherever the sign-in was going. */
  async function afterPasskeyOffer() {
    if (afterOffer.current === "about") return setStep("about");
    setBusy(true);
    await afterSignIn(adoptSaved);
    goHome();
  }

  /**
   * Signed in with a passkey, from the button or the email field's suggestions. Then as after
   * Google: the chat in this browser comes along, "About you" if they're new, else on.
   */
  async function passkeySignedIn(needsProfile: boolean): Promise<void> {
    setBusy(true);
    setError(null);
    const carry = carriedChat();
    const goOn = async () => {
      if (needsProfile) {
        setBusy(false);
        return setStep("about");
      }
      setBusy(true);
      await afterSignIn(adoptSaved);
      goHome();
    };
    if (carry.length) {
      const moved = await miraApi<{ memoryOff?: boolean }>("/api/mira/auth", {
        body: { action: "carry", carry },
      });
      if (moved.ok) local.saveChat(null);
      if (moved.data.memoryOff) return notKept(goOn);
    }
    await goOn();
  }

  // The email field offers the browser's passkeys while the form shows (conditional mediation),
  // one run at a time: leaving the form ends the run, and so does the button's own sheet. Only a
  // sheet the person closed, or a challenge that ran out, asks again, three times at most, so a
  // refused or failing request can never spin.
  const suggesting = useRef(0);
  /** Ends the current run (its next step stops) and numbers the next. */
  const endSuggestions = () => ++suggesting.current;
  async function suggestPasskeys(run: number): Promise<void> {
    const live = () => run === suggesting.current;
    if (!(await autofillWorks())) return;
    for (let tries = 0; tries < 3 && live(); tries++) {
      const res = await signInWithPasskey({ autofill: true, live, ticks: () => ticks.current });
      if (!live()) return;
      if (res.ok) return passkeySignedIn(res.needsProfile);
      if (res.minor) return refusedAsMinor(false);
      if (res.error) setError(res.error);
      if (!res.again) return;
    }
  }
  useEffect(() => {
    if (step !== "account" || backFromGoogle || !passkeys) return;
    void suggestPasskeys(endSuggestions());
    return () => {
      endSuggestions();
      stopPasskeyPrompt();
    };
    // suggestPasskeys reads state through refs; once per showing of the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, backFromGoogle, passkeys]);

  /** "Sign in with a passkey": the device's own sheet, open until the person answers it. */
  async function passkeyButton(): Promise<void> {
    const run = endSuggestions(); // the sheet replaces the suggestions
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await signInWithPasskey({ ticks: () => ticks.current });
    if (res.ok) return passkeySignedIn(res.needsProfile);
    if (res.minor) return refusedAsMinor(false);
    setBusy(false);
    if (res.error) setError(res.error);
    // Still on the form: its suggestions come back.
    if (run === suggesting.current) void suggestPasskeys(run);
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
    await afterSignIn(adoptSaved);
    goHome();
  }

  // The offer belongs to the code check: the progress stays on Verify.
  const current = STEPS.findIndex(
    (s) => s.key === (step === "passkey" || step === "kept" ? "verify" : step)
  );
  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  // Google sign-in leaves the page, so the optional ticks and `next` ride along on the link.
  const googleHref =
    "/api/mira/auth/google?adult=1&terms=1&consent=1" +
    (useAssessment ? "&assessment=1" : "") +
    (next ? `&next=${encodeURIComponent(next)}` : "");

  return (
    <div className="relative flex min-h-screen flex-col bg-white font-sans text-ap-ink lg:flex-row">
      {/* The page's banner, as on every Mira page (round-3 R3-UXA-12): the logo, at the top on
          phones, and from md over the lilac panel's corner, where the panel keeps it room. */}
      <header className="px-4 pt-8 sm:px-12 md:absolute md:left-10 md:top-10 md:z-[1] md:p-0">
        <Wordmark />
      </header>
      {/* On phones the form comes first and this lilac panel follows it. */}
      <aside className="relative order-last flex flex-col gap-8 overflow-hidden border-t border-ap-line p-6 sm:p-10 md:order-none lg:w-[460px] lg:shrink-0 lg:border-r lg:border-t-0">
        <MiraCloud className="opacity-90" />
        {/* The logo's room: the banner draws it here (its size never follows the text size). */}
        <div aria-hidden="true" className="relative hidden h-[46px] md:block" />
        <div className={`relative mt-auto flex-col gap-4 ${step === "minor" ? "hidden" : "flex"}`}>
          <p className="flex items-center gap-2.5 text-[14px] text-ap-body">
            <Image
              src="/images/mira/mira.webp"
              alt=""
              width={36}
              height={36}
              unoptimized
              className="h-9 w-9 rounded-full object-cover"
            />
            <span>
              <strong className="text-ap-ink">Mira</strong> · AI coach · Body confidence
            </span>
          </p>
          <blockquote className="font-serif text-[22px] italic leading-snug sm:text-[26px]">
            {step === "about"
              ? "“Nice to meet you. What should I call you?”"
              : "“With an account, I keep our chats, so we can always pick up where we left off.”"}
          </blockquote>
          <ul className="flex flex-col gap-2 text-[14px] text-ap-body">
            <li>Your chat history, kept on every device</li>
            <li>Answers that build on what you&apos;ve shared</li>
            <li>Delete everything anytime, in Settings</li>
          </ul>
          <p className="border-t border-ap-line pt-4 text-[13px] leading-relaxed text-ap-body">
            Emails from us use a neutral sender name and subject line, so nothing about your chats
            shows in your inbox.
          </p>
        </div>
      </aside>

      {/* The form's column: the main part, then the page's contentinfo with the legal links. */}
      <div className="flex flex-1 flex-col px-4 pb-8 sm:px-12 lg:px-20">
        <main id="main-content" className="flex flex-1 flex-col pt-8">
          <ol
            aria-label="Sign-up progress"
            className={`grid-cols-3 gap-2 ${step === "minor" ? "hidden" : "grid"}`}
          >
            {STEPS.map((s, i) => (
              <li
                key={s.key}
                aria-current={i === current ? "step" : undefined}
                className="flex flex-col gap-2"
              >
                <span
                  aria-hidden="true"
                  className={`h-1 rounded-full ${i <= current ? "bg-ap-purple" : "bg-ap-track"}`}
                />
                <span
                  className={`text-[12px] ${i === current ? "font-bold text-ap-ink" : "text-ap-muted"}`}
                >
                  {s.label}
                </span>
              </li>
            ))}
          </ol>

          <div className="my-auto flex w-full max-w-[460px] flex-col gap-5 py-10">
            {backFromGoogle && step === "account" ? (
              <p className="text-[15px] text-ap-body">Signing you in…</p>
            ) : null}

            {step === "account" && !backFromGoogle ? (
              <form
                className="flex flex-col gap-5"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  if (busy) return;
                  // Said, not a silently dead button: what is missing, and the focus on it.
                  if (!emailOk) {
                    setError(ENTER_EMAIL);
                    return emailField.current?.focus();
                  }
                  if (!adult || !terms || !consent) {
                    setError(TICK_THREE);
                    return e.currentTarget
                      .querySelector<HTMLInputElement>('input[aria-required="true"]:not(:checked)')
                      ?.focus();
                  }
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
                    <span className="inline-block whitespace-nowrap align-middle rounded-full border border-ap-line px-2.5 py-0.5 font-sans text-[12px] font-semibold tracking-[0.04em] text-ap-muted">
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
                    ref={emailField}
                    type="email"
                    // "webauthn": where the browser has them, this field also suggests passkeys.
                    autoComplete="email webauthn"
                    required
                    aria-invalid={error === ENTER_EMAIL || undefined}
                    aria-describedby={error === ENTER_EMAIL ? "signup-error" : undefined}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="min-h-[48px] rounded-2xl border border-ap-field bg-white px-4 text-[16px] font-normal outline-none focus:border-ap-purple"
                  />
                </label>
                {/* A honeypot: hidden from people and screen readers and out of the tab order, so
                  only a bot fills it; the code request carries it and the server drops those. */}
                <input
                  type="text"
                  name="website"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  className="sr-only"
                />
                <p className="-mt-2 text-[13px] text-ap-muted">
                  Took the LoveIQ test already? Use the same email and we&apos;ll connect your
                  result.
                </p>
                <Tick checked={adult} onChange={setAdult} required>
                  I confirm that I am 18 years of age or older.
                </Tick>
                <Tick checked={terms} onChange={setTerms} required>
                  I accept the{" "}
                  <a href="/terms-of-use" target="_blank" className="underline">
                    terms of use
                  </a>{" "}
                  and I have read the{" "}
                  <a href="/privacy-policy" target="_blank" className="underline">
                    privacy notice
                  </a>
                  .
                </Tick>
                <Tick checked={consent} onChange={setConsent} required>
                  Mira may process what I share about my sex life and health to coach me, and to
                  count, without my words, how Mira is used and whether she helps.{" "}
                  <Link href="/mira/privacy" target="_blank" className="underline">
                    How Mira handles your data
                  </Link>
                </Tick>
                <p className="-mb-2 text-[13px] text-ap-muted">Optional, for a new account</p>
                <Tick checked={useAssessment} onChange={setUseAssessment}>
                  Use my LoveIQ test result to tailor my coaching.
                </Tick>
                <PrimaryButton type="submit" disabled={busy}>
                  {busy ? "Sending…" : "Send me a code"}
                </PrimaryButton>
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
                      href={adult && terms && consent ? googleHref : undefined}
                      aria-disabled={busy || !adult || !terms || !consent}
                      onClick={rememberSourceForGoogle}
                      className="flex min-h-[48px] items-center justify-center gap-3 rounded-full border border-ap-line bg-white px-5 text-[15px] font-semibold text-ap-ink transition hover:border-ap-purple aria-disabled:pointer-events-none aria-disabled:opacity-50"
                    >
                      <GoogleG />
                      Continue with Google
                    </a>
                  </>
                ) : null}
                {passkeys ? (
                  <button
                    type="button"
                    aria-disabled={busy || undefined}
                    onClick={() => (busy ? undefined : void passkeyButton())}
                    className="flex min-h-[48px] items-center justify-center gap-3 rounded-full border border-ap-line bg-white px-5 text-[15px] font-semibold text-ap-ink transition hover:border-ap-purple focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ap-purple aria-disabled:cursor-wait aria-disabled:opacity-50"
                  >
                    <PasskeyIcon />
                    Sign in with a passkey
                  </button>
                ) : null}
                <p className="text-[13px] text-ap-muted">
                  No password needed. Already have an account? Use the same form
                  {passkeys ? ", or your passkey" : ""}.
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
                    className="min-h-[56px] rounded-2xl border border-ap-field bg-white px-4 text-center font-serif text-[28px] tracking-[0.5em] outline-none focus:border-ap-purple"
                  />
                </label>
                <PrimaryButton type="submit" disabled={busy || code.length < 6}>
                  {busy ? "Checking…" : "Verify and continue"}
                </PrimaryButton>
                <div className="flex justify-between gap-3 text-[14px] text-ap-muted">
                  <button
                    type="button"
                    className="underline aria-disabled:cursor-wait aria-disabled:opacity-50"
                    aria-disabled={busy || undefined}
                    onClick={async () => {
                      if (busy) return;
                      if (await sendCode()) setNotice(NEW_CODE);
                    }}
                  >
                    Send a new code
                  </button>
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      keepWaiting(null);
                      setStep("account");
                      setCode("");
                      // A restored step brought the ticks back for its resend; whoever types an
                      // address next must tick them themselves (consent is never pre-ticked).
                      setAdult(false);
                      setTerms(false);
                      setConsent(false);
                      setUseAssessment(false);
                    }}
                  >
                    Change email
                  </button>
                </div>
              </form>
            ) : null}

            {step === "passkey" ? (
              <PasskeyOffer headingRef={heading} onDone={() => void afterPasskeyOffer()} />
            ) : null}

            {step === "kept" ? (
              <div className="flex flex-col gap-5">
                <div>
                  <h1
                    ref={heading}
                    tabIndex={-1}
                    className="font-serif text-[34px] font-medium leading-tight outline-none"
                  >
                    Your earlier chat wasn&apos;t kept
                  </h1>
                  <p className="mt-2 text-[15px] text-ap-body">
                    “Remember our conversations” is off for this account, so Mira keeps no chats.
                    You can turn it on in Settings.
                  </p>
                </div>
                <PrimaryButton onClick={() => void afterKept.current()}>Continue</PrimaryButton>
              </div>
            ) : null}

            {step === "minor" ? (
              <div className="flex flex-col gap-3">
                <h1
                  ref={heading}
                  tabIndex={-1}
                  className="font-serif text-[34px] font-medium leading-tight outline-none"
                >
                  {ADULTS_ONLY}
                </h1>
                {minorSignedIn ? (
                  <p className="text-[15px] text-ap-body">
                    You can sign out or delete the account in{" "}
                    <Link
                      href="/mira/settings"
                      className="font-semibold text-ap-ink underline underline-offset-2"
                    >
                      Settings
                    </Link>
                    .
                  </p>
                ) : null}
              </div>
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
                    className="min-h-[48px] rounded-2xl border border-ap-field bg-white px-4 text-[16px] font-normal outline-none focus:border-ap-purple"
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
                    className="min-h-[48px] rounded-2xl border border-ap-field bg-white px-4 text-[16px] font-normal outline-none focus:border-ap-purple"
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
                    className="min-h-[48px] rounded-2xl border border-ap-field bg-white px-4 text-[16px] font-normal"
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
                  chat. You can change the time or pause it anytime in Settings, and stop it from
                  any nudge.
                </p>
                <PrimaryButton type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Continue"}
                </PrimaryButton>
                <button
                  type="button"
                  aria-disabled={busy || undefined}
                  onClick={() => (busy ? undefined : void skipAbout())}
                  className="text-[14px] text-ap-muted underline aria-disabled:cursor-wait aria-disabled:opacity-50"
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
              <p id="signup-error" role="alert" className="text-[14px] text-ap-bad-ink">
                {error}
              </p>
            ) : null}
          </div>
        </main>
        <footer>
          <LegalLinks className="max-w-[520px]" />
        </footer>
      </div>
    </div>
  );
}

/** A passkey: a person and a key, the mark passkey managers use. */
function PasskeyIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="9" cy="7.5" r="3.5" />
      <path d="M3 20v-1a5 5 0 0 1 5-5h2.5" />
      <circle cx="17" cy="13.5" r="2.5" />
      <path d="M17 16v5l1.5-1.2M17 18.5l1.5 1" />
    </svg>
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
  required,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  /** One of the three the code and Google need (said when one is missing). */
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1 text-[14px] leading-snug text-ap-body">
      <input
        type="checkbox"
        aria-required={required || undefined}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-[1px] h-[18px] w-[18px] shrink-0 accent-ap-purple"
      />
      <span>{children}</span>
    </label>
  );
}
