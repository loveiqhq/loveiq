"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Check } from "@features/mira/content/checks";
import { PrimaryButton } from "../MiraShell";

/**
 * A self-check, one question per screen, in the calm chat's language: the scale's own instruction
 * above its question, its answers as large pills, a quiet progress line. A tap answers and moves
 * on after a beat, so the choice is seen; the keyboard picks with the arrows (a native radio
 * group) and moves on with Enter or Next, so passing over an answer never commits it. Back keeps
 * every answer. The last answer waits for "See my result", so it can be checked or changed
 * before anything is saved (a retake is two weeks away). Each answer goes to `onAnswer` at once,
 * so the page can keep the draft and open the support lines the moment the mood check's question 9
 * is answered.
 */
export function CheckRunner({
  check,
  initial,
  saving,
  finishLabel = "See my result",
  onAnswer,
  onFinish,
  onStop,
}: {
  /** A self-check, or the body check on its own page (ui/BodyCheck.tsx BODY_CHECK). */
  check: Pick<Check, "title" | "instructions" | "items" | "options"> & { id: string };
  /** The answers so far, in question order (a resumed check). */
  initial: number[];
  saving: boolean;
  /** The last question's button. */
  finishLabel?: string;
  onAnswer: (answers: number[], index: number) => void;
  onFinish: (answers: number[]) => void;
  onStop: () => void;
}) {
  const n = check.items.length;
  const start = Math.min(initial.length, n - 1);
  const [answers, setAnswers] = useState<number[]>(initial);
  const [index, setIndex] = useState(start);
  const [picked, setPicked] = useState<number | undefined>(initial[start]);
  // A pointer press on an answer, so the click that follows commits it (an arrow key never does).
  const tapped = useRef(false);
  const pending = useRef<number | null>(null);
  const questionRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    questionRef.current?.focus();
  }, [index]);
  useEffect(
    () => () => {
      if (pending.current !== null) window.clearTimeout(pending.current);
    },
    []
  );

  function cancelPending() {
    if (pending.current !== null) window.clearTimeout(pending.current);
    pending.current = null;
  }

  function commit(value: number) {
    cancelPending();
    const next = [...answers];
    next[index] = value;
    setAnswers(next);
    onAnswer(next, index);
    if (index === n - 1) {
      onFinish(next);
      return;
    }
    setIndex(index + 1);
    setPicked(next[index + 1]);
  }

  /** A tap on the last question: passed on at once, saved only with "See my result". */
  function pickLast(value: number) {
    const next = [...answers];
    next[index] = value;
    setAnswers(next);
    onAnswer(next, index);
  }

  function back() {
    cancelPending();
    setIndex(index - 1);
    setPicked(answers[index - 1]);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (picked !== undefined) commit(picked);
  }

  const last = index === n - 1;
  return (
    <section aria-label={check.title} className="max-w-[600px]">
      <div className="flex items-center justify-between gap-3 text-[13px] text-ap-muted">
        <span aria-hidden="true" className="tabular-nums">
          {index + 1} of {n}
        </span>
        <button
          type="button"
          onClick={() => {
            cancelPending();
            onStop();
          }}
          className="inline-flex min-h-[44px] items-center underline decoration-ap-line underline-offset-4 hover:text-ap-ink"
        >
          Stop for now
        </button>
      </div>
      <div aria-hidden="true" className="h-[3px] overflow-hidden rounded-full bg-ap-track">
        <div
          className="h-full rounded-full bg-ap-ink transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${((index + (picked === undefined ? 0 : 1)) / n) * 100}%` }}
        />
      </div>
      <form
        key={index}
        onSubmit={submit}
        onKeyDown={() => {
          tapped.current = false;
        }}
        className="mt-7 motion-safe:animate-mira-reply"
      >
        {/* Not disabled while it saves (decision 7: focus would drop); answers wait instead. */}
        <fieldset aria-busy={saving}>
          <legend className="w-full">
            <span className="block text-[14px] leading-relaxed text-ap-muted">
              {check.instructions}
            </span>
            <span
              ref={questionRef}
              tabIndex={-1}
              className="mt-3 block font-serif text-[24px] font-medium leading-snug text-ap-ink outline-none [text-wrap:balance] sm:text-[28px]"
            >
              <span className="sr-only">
                Question {index + 1} of {n}:{" "}
              </span>
              {check.items[index]}
            </span>
          </legend>
          <div className="mt-6 flex flex-col gap-2.5">
            {check.options.map((o) => (
              <label
                key={o.value}
                onPointerDown={() => {
                  tapped.current = true;
                }}
                className="group flex min-h-[52px] cursor-pointer items-center gap-3.5 rounded-2xl border border-ap-field bg-white px-4 py-3 text-[16px] text-ap-ink transition-[border-color,background-color,transform] duration-200 hover:border-ap-lavender active:scale-[0.99] has-[:checked]:border-ap-ink has-[:checked]:bg-ap-ground has-[:focus]:ring-2 has-[:focus]:ring-ap-purple has-[:focus]:ring-offset-2 has-[:focus]:ring-offset-white motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                <input
                  type="radio"
                  name={`${check.id}-${index}`}
                  value={o.value}
                  checked={picked === o.value}
                  onChange={() => !saving && setPicked(o.value)}
                  onClick={() => {
                    if (!tapped.current || saving) return;
                    tapped.current = false;
                    setPicked(o.value);
                    cancelPending();
                    // A beat to see the choice land before the next question. The last one stays
                    // to be seen (its support lines, for the mood check's question 9, open now).
                    if (last) pickLast(o.value);
                    else pending.current = window.setTimeout(() => commit(o.value), 240);
                  }}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className="h-5 w-5 shrink-0 rounded-full border-2 border-ap-field bg-white transition-[border-width,border-color] duration-200 peer-checked:border-[6px] peer-checked:border-ap-ink motion-reduce:transition-none"
                />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-7 flex items-center justify-between gap-3">
          {index > 0 ? (
            <button
              type="button"
              onClick={() => !saving && back()}
              aria-disabled={saving || undefined}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-2 text-[15px] font-semibold text-ap-ink hover:text-ap-plum aria-disabled:text-ap-quiet"
            >
              <span aria-hidden="true">←</span> Back
            </button>
          ) : (
            <span />
          )}
          <PrimaryButton type="submit" disabled={picked === undefined || saving}>
            {saving ? "Saving…" : last ? finishLabel : "Next"}
          </PrimaryButton>
        </div>
      </form>
    </section>
  );
}
