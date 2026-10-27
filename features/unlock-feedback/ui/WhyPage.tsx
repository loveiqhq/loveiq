"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FC } from "react";
import { getCsrfToken } from "@shared/http/csrf-client";
import { LoveIQWordmark } from "@shared/ui/branding/LoveIQBrand";
import {
  isUnlockReason,
  REASON_COPY,
  UNLOCK_REASONS,
  type UnlockReason,
} from "@features/unlock-feedback/logic/reasons";
import type { AnswerResult } from "@features/unlock-feedback/server/answer";

/**
 * /why: where the unlock-feedback email's answers land (Marcus's "Landing" artboard, 18 Oct
 * 2026). The link's token arrives as an httpOnly cookie, never in this URL; `r` is the
 * answer tapped. The page posts it once it has loaded, which is what makes it count, and
 * claims nothing until the server says what happened.
 */

type View =
  | { status: "recording" }
  | { status: "ready"; answer: AnswerResult }
  | { status: "link" }
  | { status: "error" };

const SUPPORT_EMAIL = "hello@loveiq.org";

/** The site's gradient CTA (white landing: WQuestionCard, WResultTeaser), at the design's 52px. */
const CTA =
  "group flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-full bg-gradient-to-br from-[#fe6839] via-[#bf66d9] via-[43%] to-[#958ef6] px-[22px] py-3.5 text-[16px] font-semibold leading-6 text-white shadow-[0_10px_26px_-12px_rgba(191,102,217,0.75)] transition duration-300 hover:shadow-[0_14px_30px_-10px_rgba(191,102,217,0.85)] motion-safe:hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60";

const LINK = "font-semibold text-ap-plum underline hover:text-ap-violet";

function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-csrf-token": getCsrfToken() },
    body: JSON.stringify(body),
  });
}

const WhyPage: FC<{ initialReason: UnlockReason | null }> = ({ initialReason }) => {
  const router = useRouter();
  const [view, setView] = useState<View>(
    initialReason ? { status: "recording" } : { status: "link" }
  );
  const [reason, setReason] = useState<UnlockReason>(initialReason ?? "other");
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const posted = useRef(false);

  const record = useCallback(async () => {
    if (!initialReason) return;
    try {
      const response = await postJson("/api/unlock-feedback/answer", {
        r: initialReason,
        touch: navigator.maxTouchPoints > 1,
      });
      if (response.status === 400 || response.status === 404) {
        setView({ status: "link" });
        return;
      }
      if (!response.ok) throw new Error(`answer_${response.status}`);
      const answer = (await response.json()) as AnswerResult;
      setReason(answer.reason);
      setView({ status: "ready", answer });
    } catch {
      setView({ status: "error" });
    }
  }, [initialReason]);

  useEffect(() => {
    // Once per page load: development's double effect must not post the answer twice.
    if (posted.current) return;
    posted.current = true;
    void record();
  }, [record]);

  const retry = () => {
    setView({ status: "recording" });
    void record();
  };

  const changeReason = (value: string) => {
    if (!isUnlockReason(value)) return;
    setReason(value);
    setPicked([]);
  };

  const toggle = (label: string) =>
    setPicked((current) =>
      current.includes(label) ? current.filter((p) => p !== label) : [...current, label]
    );

  const openReport = async (answer: AnswerResult) => {
    const changed = reason !== answer.reason;
    const words = note.trim();
    if (!changed && picked.length === 0 && !words) {
      router.push(answer.reportPath);
      return;
    }
    setSending(true);
    setNotice("");
    try {
      const response = await postJson("/api/unlock-feedback/detail", {
        ...(changed ? { reason } : {}),
        chips: picked,
        note: words,
      });
      if (!response.ok) throw new Error(`detail_${response.status}`);
      router.push(answer.reportPath);
    } catch {
      // The words are the reader's: keep them on screen rather than drop them on the way out.
      setSending(false);
      setNotice("We couldn’t send that. Please try again, or skip to your report.");
    }
  };

  const copy = REASON_COPY[reason];

  return (
    <div className="min-h-screen bg-white font-sans text-ap-ink [&_:focus-visible]:outline [&_:focus-visible]:outline-2 [&_:focus-visible]:outline-offset-2 [&_:focus-visible]:outline-ap-purple">
      <header className="border-b border-ap-line">
        <div className="mx-auto flex w-full max-w-[560px] items-center p-4">
          <LoveIQWordmark className="text-[22px] tracking-[-0.01em]" loveClassName="text-ap-ink" />
        </div>
      </header>

      <main id="main-content" className="mx-auto flex w-full max-w-[560px] flex-col pb-8">
        {/* Polite and atomic: what the server says replaces "One moment" and is read out. */}
        <div role="status" className="flex flex-col gap-3.5 px-4 pt-8">
          {view.status === "recording" && (
            <p className="text-[16px] leading-[25.6px] text-ap-body">One moment, please.</p>
          )}
          {view.status === "ready" && (
            <>
              <h1 className="m-0 font-serif text-[28px] font-medium leading-[1.2] tracking-[-0.01em] text-balance">
                {view.answer.alreadyPaid
                  ? "Thank you. We’ve saved your answer."
                  : "Thank you. Your full report is unlocked."}
              </h1>
              <p className="m-0 text-[16px] leading-[25.6px] text-ap-body">
                {view.answer.alreadyPaid
                  ? "You already have your report. It’s ready whenever you are."
                  : // Mark's line (22.10), counted as the report counts since 27.10 (Eman): 17 chapters.
                    "We’ve saved your answer. The full report, with all its 17 chapters, is yours now, free."}
              </p>
            </>
          )}
          {view.status === "link" && (
            <>
              <h1 className="m-0 font-serif text-[28px] font-medium leading-[1.2] tracking-[-0.01em] text-balance">
                We couldn’t open this link.
              </h1>
              <p className="m-0 text-[16px] leading-[25.6px] text-ap-body">
                Please open the email we sent you and tap your answer again. If it still doesn’t
                work, write to us at{" "}
                <a className={LINK} href={`mailto:${SUPPORT_EMAIL}`}>
                  {SUPPORT_EMAIL}
                </a>
                .
              </p>
            </>
          )}
          {view.status === "error" && (
            <>
              <h1 className="m-0 font-serif text-[28px] font-medium leading-[1.2] tracking-[-0.01em] text-balance">
                Something went wrong.
              </h1>
              <p className="m-0 text-[16px] leading-[25.6px] text-ap-body">
                We couldn’t save your answer. Please check your connection and try again.
              </p>
            </>
          )}
        </div>

        {view.status === "error" && (
          <div className="px-4 pt-6">
            <button type="button" onClick={retry} className={CTA}>
              Try again
            </button>
          </div>
        )}

        {view.status === "ready" && (
          <>
            <div className="mx-4 mt-6 flex flex-col gap-2 rounded-[20px] bg-ap-lilac p-[18px]">
              <label
                htmlFor="reason"
                className="text-[14px] font-extralight leading-[22.4px] text-ap-body"
              >
                Your answer
              </label>
              {/* 16px, not the design's 15: iOS zooms the page into any smaller field. */}
              <select
                id="reason"
                value={reason}
                onChange={(event) => changeReason(event.target.value)}
                aria-describedby="reason-hint"
                className="min-h-[48px] w-full rounded-full border border-ap-ink/[0.18] bg-white px-3.5 py-2.5 font-sans text-[16px] font-semibold text-ap-ink"
              >
                {UNLOCK_REASONS.map((code) => (
                  <option key={code} value={code}>
                    {REASON_COPY[code].landing}
                  </option>
                ))}
              </select>
              <p id="reason-hint" className="m-0 text-[12px] leading-[19.2px] text-ap-plum">
                Tapped the wrong one? Change it here.
              </p>
            </div>

            <section aria-labelledby="followup-question" className="flex flex-col gap-3 px-4 pt-8">
              <p className="m-0 flex items-center gap-2">
                <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-ap-orange" />
                <span className="text-[11px] font-bold uppercase leading-4 tracking-[0.88px] text-ap-label">
                  Optional
                </span>
              </p>
              <h2
                id="followup-question"
                className="m-0 font-serif text-[20px] font-medium leading-6 tracking-[-0.2px]"
              >
                {copy.question}
              </h2>
              {copy.chips.length > 0 && (
                <>
                  <p className="m-0 text-[12px] leading-[19.2px] text-ap-muted">
                    Pick any that fit.
                  </p>
                  <div
                    role="group"
                    aria-labelledby="followup-question"
                    className="flex flex-wrap gap-2"
                  >
                    {copy.chips.map((label) => {
                      const on = picked.includes(label);
                      return (
                        <button
                          key={label}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggle(label)}
                          className={`min-h-[44px] cursor-pointer rounded-full border px-4 py-2.5 text-left text-[14px] font-semibold leading-5 ${
                            on
                              ? "border-ap-purple bg-ap-purple/10 text-ap-violet"
                              : "border-ap-line bg-white text-ap-body"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </section>

            <div className="flex flex-col gap-2 px-4 pt-6">
              <label htmlFor="more" className="font-serif text-[18px] font-medium leading-[22px]">
                Anything else we should know?
              </label>
              {/* The reader's own words: kept out of Clarity (data-clarity-mask, as the survey's
                  free-text boxes) and out of PostHog's autocapture and replays (ph-no-capture). */}
              <textarea
                id="more"
                rows={4}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={copy.placeholder}
                maxLength={2000}
                data-clarity-mask="true"
                className="ph-no-capture w-full resize-y rounded-[18px] border border-ap-ink/[0.18] px-4 py-3.5 font-sans text-[16px] leading-[22px] text-ap-ink placeholder:text-ap-muted"
              />
            </div>

            <div className="flex flex-col gap-3 px-4 pt-6">
              <div>
                <button
                  type="button"
                  onClick={() => void openReport(view.answer)}
                  disabled={sending}
                  className={CTA}
                >
                  Submit and open my report
                </button>
                {/* Always rendered: a live region that appears with its text is not read out. */}
                <p
                  role="status"
                  className="m-0 text-center text-[14px] leading-5 text-ap-body [&:not(:empty)]:mt-3"
                >
                  {notice}
                </p>
              </div>
              <Link
                href={view.answer.reportPath}
                className={`p-3 text-center text-[14px] leading-5 ${LINK}`}
              >
                Skip, just open my report
              </Link>
            </div>

            <p className="mx-4 mt-4 border-t border-ap-ink/[0.08] pt-4 text-[12px] leading-[19.2px] text-ap-muted">
              Your answers are only used to improve LoveIQ. No payment details needed.
            </p>
          </>
        )}
      </main>
    </div>
  );
};

export default WhyPage;
