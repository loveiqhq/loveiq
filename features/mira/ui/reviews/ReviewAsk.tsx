"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AGE_RANGES,
  NAME_MAX,
  NAME_PATTERN,
  QUOTE_MAX,
  REVIEW_CONSENT_VERSION,
  ageLabel,
} from "@features/mira/reviews";
import { miraApi } from "../api";

/**
 * The thank-you ask (22 Nov 2026), in the chat, at a good moment only: after a 9 or 10 on the
 * recommend question, or the third thumbs-up in one chat (MiraChat decides; never near a crisis,
 * an under-18 stop, a referral or the body check, and only for a signed-in person). Stars first,
 * then, if the person likes, one sentence for others, which leaves the browser only with its own
 * consent ticked. A person rates once; this browser is asked at most once in 30 days, and "Not
 * now" waits as long.
 */

/** Days before this browser is asked again, after an ask or a "Not now". */
export const ASK_AGAIN_DAYS = 30;
/** Thumbs-up in one chat that make a good moment to ask. */
export const THUMBS_FOR_ASK = 3;
const ASKED = "mira.review.v1";

/** True unless this browser was asked in the last 30 days. */
export function reviewAskDue(now = Date.now()): boolean {
  try {
    const at = Number(
      (JSON.parse(localStorage.getItem(ASKED) ?? "null") as { askedAt?: number })?.askedAt
    );
    return !Number.isFinite(at) || now - at > ASK_AGAIN_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return true;
  }
}

function markAsked(): void {
  try {
    localStorage.setItem(ASKED, JSON.stringify({ askedAt: Date.now() }));
  } catch {
    // Private mode or blocked storage: the server still asks only those who haven't rated.
  }
}

/**
 * The consent to show a person's words, as the box says it. Its version is REVIEW_CONSENT_VERSION
 * (features/mira/reviews.ts): change the words, change the version.
 */
export const CONSENT_TEXT =
  "I agree that Mira’s pages may show these words publicly, with the name and age range above. Our team reads them first and may take out a detail that could identify someone, marked […]; nothing else is changed. I can take this back in Settings at any time.";

const FIELD =
  "min-h-[44px] rounded-xl border border-ap-line bg-white px-3 text-[16px] font-normal text-ap-ink outline-none transition-colors focus:border-ap-lavender";

export function ReviewAsk({ from, onClose }: { from: "nps" | "thumbs"; onClose: () => void }) {
  const [ready, setReady] = useState(false);
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [quote, setQuote] = useState("");
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ words: boolean } | null>(null);
  const close = useRef(onClose);
  const title = useRef<HTMLParagraphElement | null>(null);
  const thanks = useRef<HTMLParagraphElement | null>(null);
  // After a 9 or 10 the pressed button is gone: the ask (or, without it, the composer) takes the
  // focus. After a thumbs-up the button stays, so the focus does too.
  const takeFocus = useRef(from === "nps");

  // Only someone who hasn't rated yet is asked; the first name offered to sign with comes along.
  useEffect(() => {
    let live = true;
    void miraApi<{ review?: unknown; name?: string | null }>("/api/mira/reviews/mine").then((r) => {
      if (!live) return;
      if (!r.ok || r.data.review) {
        if (takeFocus.current) document.getElementById("mira-input")?.focus();
        return close.current();
      }
      setName(r.data.name ?? "");
      setReady(true);
      markAsked();
      void miraApi("/api/mira/event", { body: { type: "track", name: "review_prompt_shown" } });
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (ready && takeFocus.current) title.current?.focus();
  }, [ready]);

  // The Send button goes with the form: the thanks takes the focus, without opening a keyboard.
  useEffect(() => {
    if (done) thanks.current?.focus();
  }, [done]);

  if (!ready) return null;
  const words = quote.trim().replace(/\s+/g, " ");
  const share = words.length > 0 && consent;
  const signed = name.trim();
  const nameOk = signed.length > 0 && signed.length <= NAME_MAX && NAME_PATTERN.test(signed);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!stars || busy || (share && !nameOk)) return;
    setBusy(true);
    setError(null);
    const res = await miraApi("/api/mira/reviews", {
      body: {
        stars,
        ...(share
          ? {
              words: {
                quote: words,
                name: signed,
                ageRange: age || null,
                consent: REVIEW_CONSENT_VERSION,
              },
            }
          : {}),
      },
    });
    setBusy(false);
    // 409: rated already, on another device. Either way it's in.
    if (res.ok || res.status === 409) return setDone({ words: share && res.ok });
    setError(res.data.error ?? "Your rating didn't save. Please try again.");
  }

  function notNow() {
    void miraApi("/api/mira/event", { body: { type: "track", name: "review_prompt_not_now" } });
    document.getElementById("mira-input")?.focus(); // the pressed button is about to go
    onClose();
  }

  const heading = from === "nps" ? "Thank you, that means a lot." : "Glad this is helping.";
  return (
    <section
      aria-labelledby="mira-review-title"
      className="rounded-[20px] border border-ap-line bg-white/90 p-4 motion-safe:animate-mira-reply sm:p-5"
    >
      {done ? (
        <div className="motion-safe:animate-mira-in">
          <p
            ref={thanks}
            id="mira-review-title"
            role="status"
            tabIndex={-1}
            className="font-serif text-[17px] font-semibold outline-none"
          >
            Thank you{done.words ? `, ${signed}` : ""}.
          </p>
          <p className="mt-1 text-[14px] leading-normal text-ap-body">
            {done.words ? "Our team reads every quote before it shows. " : ""}You can see or take
            back what you shared in{" "}
            <Link href="/mira/settings" className="font-semibold text-ap-ink underline">
              Settings
            </Link>
            .
          </p>
        </div>
      ) : (
        <form onSubmit={send} noValidate>
          <p
            ref={title}
            id="mira-review-title"
            tabIndex={-1}
            className="font-serif text-[17px] font-semibold outline-none"
          >
            {heading}
          </p>
          <p className="mt-1 text-[14px] leading-normal text-ap-body">
            Would you rate Mira? It helps others decide whether to talk to her.
          </p>
          <fieldset className="mt-2.5">
            <legend className="sr-only">Your rating, 1 to 5 stars</legend>
            <div className="-ml-2 flex" onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((n) => {
                const lit = n <= (hover || stars);
                return (
                  <label
                    key={n}
                    onMouseEnter={() => setHover(n)}
                    className="relative grid h-11 w-11 cursor-pointer place-items-center"
                  >
                    <input
                      type="radio"
                      name="mira-review-stars"
                      value={n}
                      checked={stars === n}
                      onChange={() => setStars(n)}
                      className="peer absolute inset-0 m-0 cursor-pointer appearance-none rounded-full"
                    />
                    <svg
                      aria-hidden="true"
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      className={`pointer-events-none rounded-full transition-[color,transform] duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-ap-lavender peer-focus-visible:ring-offset-2 ${
                        lit ? "text-ap-orange" : "text-[#d9d4e2]"
                      } ${stars === n ? "motion-safe:animate-mira-pop" : ""}`}
                      fill="currentColor"
                    >
                      <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" />
                    </svg>
                    <span className="sr-only">
                      {n} {n === 1 ? "star" : "stars"}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {stars ? (
            <div className="mt-2 flex flex-col gap-3 motion-safe:animate-mira-in">
              <label className="flex flex-col gap-1.5 text-[14px] font-semibold">
                <span>
                  A sentence for others, if you like{" "}
                  <span className="font-normal text-ap-muted">(optional)</span>
                </span>
                <textarea
                  value={quote}
                  onChange={(e) => setQuote(e.target.value)}
                  maxLength={QUOTE_MAX}
                  rows={2}
                  placeholder="What has Mira helped you with?"
                  className="min-h-[76px] resize-none rounded-2xl border border-ap-line px-4 py-3 text-[16px] font-normal leading-snug text-ap-ink outline-none transition-colors placeholder:text-ap-muted focus:border-ap-lavender"
                />
              </label>
              {words ? (
                <div className="flex flex-col gap-3 rounded-2xl bg-ap-ground p-3.5 motion-safe:animate-mira-in">
                  <div className="flex flex-wrap gap-3">
                    <label className="flex min-w-[150px] flex-1 flex-col gap-1.5 text-[13px] font-semibold">
                      Shown as
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={NAME_MAX}
                        autoComplete="given-name"
                        placeholder="First name or initials"
                        className={FIELD}
                      />
                    </label>
                    <label className="flex min-w-[130px] flex-col gap-1.5 text-[13px] font-semibold">
                      <span>
                        Age range <span className="font-normal text-ap-muted">(optional)</span>
                      </span>
                      <select
                        value={age}
                        onChange={(e) => setAge(e.target.value)}
                        className={FIELD}
                      >
                        <option value="">Don&apos;t show</option>
                        {AGE_RANGES.map((a) => (
                          <option key={a} value={a}>
                            {ageLabel(a)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="flex items-start gap-3 text-[13px] leading-snug text-ap-body">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                      className="mt-[2px] h-[18px] w-[18px] shrink-0 accent-[#795fc8]"
                    />
                    <span>{CONSENT_TEXT}</span>
                  </label>
                  {!consent ? (
                    <p className="text-[12px] text-ap-muted">
                      Without the tick, only your stars are sent.
                    </p>
                  ) : !nameOk ? (
                    <p className="text-[12px] text-ap-bad-ink">
                      Add a first name or initials (letters only).
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-3 flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={notNow}
              className="min-h-[44px] px-3.5 text-[14px] font-semibold text-ap-muted"
            >
              Not now
            </button>
            <button
              type="submit"
              disabled={!stars || busy || (share && !nameOk)}
              className="inline-flex min-h-[44px] items-center rounded-full bg-ap-ink px-5 text-[14px] font-bold text-white transition-[transform,background-color] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-ap-track disabled:text-ap-muted disabled:active:scale-100"
            >
              {busy ? "Sending…" : "Send"}
            </button>
          </div>
          {error ? (
            <p role="alert" className="mt-2 text-right text-[13px] text-ap-bad-ink">
              {error}
            </p>
          ) : null}
        </form>
      )}
    </section>
  );
}
