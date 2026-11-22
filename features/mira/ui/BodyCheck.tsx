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

  // Keyboard and screen reader users land on each new statement.
  useEffect(() => {
    if (typeof step === "number") statementRef.current?.focus();
  }, [step]);

  async function save(all: number[]) {
    setStep("saving");
    setError(null);
    const res = await miraApi("/api/mira/body-check", { body: { answers: all } });
    if (!res.ok) {
      setError(res.data.error ?? "Your answers didn't save. Please try again.");
      setStep(items.length - 1);
      return;
    }
    setStep("done");
    window.setTimeout(() => onClose(true), 4000);
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
      <p role="status" className={step === "done" ? `${card} text-[14px] text-ap-body` : "sr-only"}>
        {step === "done" ? THANKS[due] : ""}
      </p>
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
              onClick={() => onClose(false)}
              className="min-h-[44px] px-3 text-[13px] text-ap-muted underline"
            >
              Not now
            </button>
          </div>
        </div>
      ) : null}
      {step === "offer" || step === "done" ? null : (
        <Modal label="Body check" onClose={() => onClose(false)}>
          <fieldset disabled={step === "saving"}>
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
                  onClick={() => setStep(index - 1)}
                  className="min-h-[44px] text-[14px] text-ap-plum underline"
                >
                  Back
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => onClose(false)}
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
