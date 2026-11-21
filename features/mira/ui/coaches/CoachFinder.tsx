"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import {
  FINDER,
  coachById,
  type CoachId,
  type FinderOutcome,
} from "@features/mira/content/coaches";
import { track } from "./data";
import { ChevronIcon, CloseIcon, CoachPortrait, NotifyButton } from "./parts";
import { FOCUS, INK_PILL, QUIET_PILL } from "./styles";

const TEXT_BUTTON = `min-h-[44px] px-2 text-[14px] font-semibold text-ap-muted underline underline-offset-4 hover:text-ap-ink ${FOCUS}`;

/**
 * "Not sure? Find my challenge" (board Coaches): two taps at most, in plain words, ending on a
 * coach. A coming-soon coach is named as one, with Notify me and Mira meanwhile; "Something else"
 * asks what would help (board 10's feedback). Only the outcome is counted, never the answers.
 */
export function CoachFinder({
  known,
  onNotify,
  onClose,
}: {
  known: CoachId[];
  onNotify: (id: CoachId, on: boolean) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"start" | "desire">("start");
  const [outcome, setOutcome] = useState<FinderOutcome | null>(null);
  // Each question and the result take focus as they appear, so a keyboard or screen reader
  // follows along instead of being left on a button that has gone.
  const focusOnMount = useCallback((el: HTMLElement | null) => el?.focus(), []);

  function choose(to: FinderOutcome | "desire") {
    if (to === "desire") return setStep("desire");
    setOutcome(to);
    track("finder_done", to);
  }
  function again() {
    setOutcome(null);
    setStep("start");
  }
  const q = FINDER[step];

  return (
    <section
      id="finder"
      aria-labelledby="finder-h"
      className="relative mt-5 scroll-mt-6 overflow-hidden rounded-[28px] border border-ap-line bg-[linear-gradient(165deg,#faf6ff_0%,#ffffff_60%)] p-5 motion-safe:animate-mira-in sm:p-7"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="finder-h" className="font-serif text-[22px] font-medium leading-tight">
            Find my challenge
          </h2>
          <p className="mt-1 text-[14px] text-ap-muted">
            Two quick questions, then a coach who fits.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the finder"
          className={`-mr-2 -mt-1.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ap-muted transition-colors hover:bg-ap-ground hover:text-ap-ink ${FOCUS}`}
        >
          <CloseIcon />
        </button>
      </div>

      {outcome === null ? (
        <fieldset key={step} className="mt-5 min-w-0 motion-safe:animate-mira-in">
          <legend
            ref={focusOnMount}
            tabIndex={-1}
            className="font-serif text-[19px] font-medium leading-snug text-ap-ink outline-none"
          >
            {q.question}
          </legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {q.options.map((o) => (
              <button
                key={o.label}
                type="button"
                onClick={() => choose(o.to)}
                className={`group flex min-h-[52px] items-center justify-between gap-3 rounded-2xl border border-ap-line bg-white px-4 py-3 text-left text-[15px] font-medium text-ap-ink transition-[background-color,border-color,transform] hover:border-ap-lavender hover:bg-[#fbf8ff] active:scale-[0.99] ${FOCUS}`}
              >
                {o.label}
                <ChevronIcon className="shrink-0 text-ap-quiet transition-transform group-hover:translate-x-0.5" />
              </button>
            ))}
          </div>
          {step === "desire" ? (
            <button
              type="button"
              onClick={() => setStep("start")}
              className={`mt-2 ${TEXT_BUTTON}`}
            >
              Back
            </button>
          ) : null}
        </fieldset>
      ) : outcome === "none" ? (
        <div className="mt-5 motion-safe:animate-mira-in">
          <h3
            ref={focusOnMount}
            tabIndex={-1}
            className="font-serif text-[21px] font-medium leading-snug outline-none"
          >
            We don’t have a coach for that yet
          </h3>
          <p className="mt-2 max-w-[56ch] text-[15px] leading-relaxed text-ap-body">
            Tell us what you’d like help with: it shapes which coach comes next. If part of it is
            about how you feel in your body, Mira can help meanwhile.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link href="/mira/feedback" className={INK_PILL}>
              Tell us what would help
            </Link>
            <Link href="/mira" className={QUIET_PILL}>
              Talk to Mira
            </Link>
            <button type="button" onClick={again} className={TEXT_BUTTON}>
              Start again
            </button>
          </div>
        </div>
      ) : (
        <Result id={outcome} known={known} onNotify={onNotify} again={again} focus={focusOnMount} />
      )}
    </section>
  );
}

function Result({
  id,
  known,
  onNotify,
  again,
  focus,
}: {
  id: CoachId;
  known: CoachId[];
  onNotify: (id: CoachId, on: boolean) => void;
  again: () => void;
  focus: (el: HTMLElement | null) => void;
}) {
  const coach = coachById(id);
  return (
    <div className="mt-5 flex flex-col gap-4 motion-safe:animate-mira-in sm:flex-row sm:items-start">
      <CoachPortrait coach={coach} size={64} />
      <div className="min-w-0 flex-1">
        <h3
          ref={focus}
          tabIndex={-1}
          className="font-serif text-[22px] font-medium leading-snug outline-none"
        >
          {coach.name} is your coach for this
        </h3>
        <p className="mt-0.5 text-[14px] text-ap-muted">
          {coach.challenge}
          {coach.live ? " · Here now" : " · Coming soon"}
        </p>
        <p className="mt-3 max-w-[56ch] text-[15px] leading-relaxed text-ap-body">
          {coach.live
            ? "How you feel in your body is what Mira knows best, and she’s here now."
            : `${coach.name} isn’t here yet. Ask to hear when ${coach.name} is ready. Meanwhile, Mira can help with the part that’s about how you feel in your body.`}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {coach.live ? (
            <Link href="/mira" className={INK_PILL}>
              Talk to Mira
            </Link>
          ) : (
            <>
              <NotifyButton coach={coach} done={known.includes(coach.id)} onChange={onNotify} />
              <Link href="/mira" className={QUIET_PILL}>
                Talk to Mira meanwhile
              </Link>
            </>
          )}
          <button type="button" onClick={again} className={TEXT_BUTTON}>
            Start again
          </button>
        </div>
      </div>
    </div>
  );
}
