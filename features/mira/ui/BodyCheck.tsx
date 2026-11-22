"use client";

import { useEffect, useRef, useState } from "react";
import miraConfig from "@features/mira/content/mira-config.json";
import { miraApi } from "./api";
import { Modal } from "./SupportPanel";

const { items, answers: LABELS, directions } = miraConfig.bodyCheck;

/** The scale as the self-checks' runner asks it on its own page (ui/checks/CheckRunner.tsx). */
export const BODY_CHECK = {
  id: "body",
  title: "Body check",
  instructions: directions,
  items,
  options: LABELS.map((label, i) => ({ label, value: i + 1 })),
};

/** What the check is, before it starts: in the chat's card and on its page. */
export const OFFER = {
  baseline: {
    title: "A two-minute body check",
    text: "Ten short statements about how you relate to your body, from a research questionnaire. Answer them now and again in four weeks, so we can both see whether our chats help. Your answers stay with your account, and you can skip this.",
  },
  week4: {
    title: "Your four-week body check",
    text: "It’s been four weeks since your first body check. The same ten statements again, about two minutes, to see what has changed.",
  },
} as const;

export const THANKS = {
  baseline: "Thank you. I’ll ask again in four weeks.",
  week4: "Thank you. That’s your four-week check done.",
} as const;

/**
 * The chat's message box, once the dialog or the card has gone with the focused button: never the
 * page itself. After the chat's own commit, so the dialog's closing can't take it back.
 */
const toComposer = () => window.setTimeout(() => document.getElementById("mira-input")?.focus(), 0);

/**
 * The body check in the chat (Marcus's MVP success board, "Therapeutic success"): offered as a
 * card under Mira's reply, then the Body Appreciation Scale-2 one statement at a time in a dialog
 * (on a small phone the chat's message area is too short to show a statement and its answers),
 * at the start and again after four weeks.
 * Only with consent: it is offered, and nothing is kept unless the person starts and finishes
 * it. The statements, the answers and the directions are the scale's own, word for word; its
 * authors ask that they are not changed. No score is shown: it measures, it doesn't judge.
 */
export function BodyCheck({
  due,
  onStart,
  onClose,
}: {
  due: "baseline" | "week4";
  onStart: () => void;
  /** done: saved; otherwise the person chose "Not now" or stopped part way. */
  onClose: (done: boolean) => void;
}) {
  const [step, setStep] = useState<"offer" | number | "saving" | "done">("offer");
  const [picked, setPicked] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const statementRef = useRef<HTMLParagraphElement | null>(null);
  const thanksRef = useRef<HTMLParagraphElement | null>(null);

  // Keyboard and screen reader users land on each new statement, then on the thank-you: after
  // the commit, when the dialog is gone (a focus moved while it was open went nowhere, the page
  // behind it being inert: round-3 R3-HAB-10).
  useEffect(() => {
    if (typeof step === "number") statementRef.current?.focus();
    else if (step === "done") thanksRef.current?.focus();
  }, [step]);

  /** Not now, Stop for now, Escape or the thank-you's Close: the card goes, the composer has focus. */
  function close(done: boolean) {
    onClose(done);
    toComposer();
  }

  async function save(all: number[]) {
    setStep("saving");
    setError(null);
    const res = await miraApi("/api/mira/body-check", { body: { answers: all } });
    if (!res.ok) {
      setError(res.data.error ?? "Your answers didn't save. Please try again.");
      setStep(items.length - 1);
      return;
    }
    // The dialog goes; the thank-you takes the focus and stays until its own Close (no timer).
    setStep("done");
  }

  function answer(value: number) {
    if (typeof step !== "number") return;
    const next = [...picked.slice(0, step), value];
    setPicked(next);
    if (step < items.length - 1) setStep(step + 1);
    else void save(next);
  }

  const card = "rounded-[20px] border border-ap-line bg-white/90 p-4";

  // The statement on screen: while saving, the last.
  const index = typeof step === "number" ? step : items.length - 1;
  return (
    <>
      {/* There from the start, so the thank-you is read out when it comes (a region mounted with
          its text already in it is not); the visible card once the check is saved. */}
      <div className={step === "done" ? `${card} flex flex-wrap items-center gap-x-3` : undefined}>
        <p
          ref={thanksRef}
          role="status"
          tabIndex={-1}
          className={step === "done" ? "text-[14px] text-ap-body outline-none" : "sr-only"}
        >
          {step === "done" ? THANKS[due] : ""}
        </p>
        {step === "done" ? (
          <button
            type="button"
            onClick={() => close(true)}
            className="min-h-[44px] text-[13px] text-ap-muted underline"
          >
            Close
          </button>
        ) : null}
      </div>
      {step === "offer" ? (
        <div className={card}>
          <p className="text-[14px] font-semibold">{OFFER[due].title}</p>
          <p className="mt-1 text-[14px] leading-relaxed text-ap-body">{OFFER[due].text}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void miraApi("/api/mira/event", {
                  body: { type: "track", name: "body_check_started" },
                });
                onStart();
                setStep(0);
              }}
              className="min-h-[44px] rounded-full bg-ap-ink px-5 text-[14px] font-bold text-white"
            >
              Start
            </button>
            <button
              type="button"
              onClick={() => close(false)}
              className="min-h-[44px] px-3 text-[13px] text-ap-muted underline"
            >
              Not now
            </button>
          </div>
        </div>
      ) : null}
      {step === "offer" || step === "done" ? null : (
        <Modal label="Body check" onClose={() => close(false)}>
          {/* Not disabled while it saves (decision 7): answer() ignores taps till then. */}
          <fieldset aria-busy={step === "saving"}>
            <legend className="text-[12px] font-semibold uppercase tracking-wide text-ap-muted">
              Body check · statement {index + 1} of {items.length}
            </legend>
            <p className="mt-1 text-[13px] text-ap-muted">{directions}</p>
            <p
              ref={statementRef}
              data-autofocus
              tabIndex={-1}
              className="mt-4 font-serif text-[22px] font-medium leading-snug outline-none"
            >
              {items[index]}
            </p>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-5">
              {LABELS.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={picked[index] === i + 1}
                  onClick={() => answer(i + 1)}
                  className={`min-h-[48px] rounded-full border px-4 text-[15px] hover:border-ap-purple ${picked[index] === i + 1 ? "border-ap-purple bg-ap-lilac font-semibold" : "border-ap-line bg-white"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap justify-between gap-3">
              {index > 0 ? (
                <button
                  type="button"
                  onClick={() => step !== "saving" && setStep(index - 1)}
                  className="min-h-[44px] text-[14px] text-ap-plum underline"
                >
                  Back
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => close(false)}
                className="min-h-[44px] text-[14px] text-ap-muted underline"
              >
                Stop for now
              </button>
            </div>
            {step === "saving" ? <p className="mt-2 text-[13px] text-ap-muted">Saving…</p> : null}
            {error ? (
              <p role="alert" className="mt-2 text-[13px] text-ap-bad-ink">
                {error}{" "}
                <button
                  type="button"
                  onClick={() => void save(picked)}
                  className="font-semibold underline"
                >
                  Try again
                </button>
              </p>
            ) : null}
          </fieldset>
        </Modal>
      )}
    </>
  );
}
