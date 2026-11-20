"use client";

import { useEffect, useRef, useState } from "react";
import miraConfig from "@features/mira/content/mira-config.json";
import { miraApi } from "./api";

const { items, answers: LABELS, directions } = miraConfig.bodyCheck;

/**
 * The body check card in the chat (Marcus's MVP success board, "Therapeutic success"): the
 * Body Appreciation Scale-2, one statement at a time, at the start and again after four weeks.
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

  const card = "rounded-2xl border border-ap-line bg-[#faf9fc] p-4";

  if (step === "offer") {
    return (
      <div className={card}>
        <p className="text-[14px] font-semibold">
          {due === "baseline" ? "A two-minute body check" : "Your four-week body check"}
        </p>
        <p className="mt-1 text-[14px] leading-relaxed text-ap-body">
          {due === "baseline"
            ? "Ten short statements about how you relate to your body, from a research questionnaire. Answer them now and again in four weeks, so we can both see whether our chats help. Your answers stay with your account, and you can skip this."
            : "It’s been four weeks since your first body check. The same ten statements again, about two minutes, to see what has changed."}
        </p>
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
            className="min-h-[44px] rounded-full bg-black px-5 text-[14px] font-bold text-white"
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
    );
  }

  if (step === "done") {
    return (
      <div className={card}>
        <p role="status" className="text-[14px] text-ap-body">
          {due === "baseline"
            ? "Thank you. I’ll ask again in four weeks."
            : "Thank you. That’s your four-week check done."}
        </p>
      </div>
    );
  }

  const index = step === "saving" ? items.length - 1 : step;
  return (
    <div className={card}>
      <fieldset disabled={step === "saving"}>
        <legend className="text-[12px] font-semibold uppercase tracking-wide text-ap-muted">
          Statement {index + 1} of {items.length}
        </legend>
        <p className="mt-1 text-[12px] text-ap-muted">{directions}</p>
        <p
          ref={statementRef}
          tabIndex={-1}
          className="mt-3 text-[16px] font-semibold leading-snug outline-none"
        >
          {items[index]}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {LABELS.map((label, i) => (
            <button
              key={label}
              type="button"
              aria-pressed={picked[index] === i + 1}
              onClick={() => answer(i + 1)}
              className={`min-h-[44px] rounded-full border px-4 text-[14px] hover:border-ap-purple ${picked[index] === i + 1 ? "border-ap-purple bg-ap-lilac font-semibold" : "border-ap-line bg-white"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-3">
          {index > 0 ? (
            <button
              type="button"
              onClick={() => setStep(index - 1)}
              className="min-h-[44px] text-[13px] text-ap-plum underline"
            >
              Back
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onClose(false)}
            className="min-h-[44px] text-[13px] text-ap-muted underline"
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
    </div>
  );
}
