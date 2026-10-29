"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FC,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { trackPaygateExitNote, trackPaygateExitReason } from "@features/analytics/client";
import { seededRandom } from "@features/survey/ui/questionOrder";
import {
  EXIT_COPY,
  EXIT_NOTE_MAX,
  exitReasons,
  orderExitReasons,
  type ExitReason,
  type ExitStage,
} from "./exitContent";
import { TickIcon } from "./exitIcons";

interface ExitReasonsProps {
  stage: ExitStage;
  /** The EUR 1.99, for the gate's "I wasn't sure what I'd get for €1.99". */
  priceCents: number;
  /** The reader's submission (or "preview"): one order per reader and page, however often it opens. */
  seed: string;
  /** Tests pin the order outright. */
  random?: () => number;
}

/**
 * Answers and sentences recorded per visit: the events share 20 a minute with the report's.
 * Every tap is saved as it is made (Marcus and Mark, sync 29.10: "even the random clicks"),
 * up to twelve; past that, only the reader's last choice, once, as they leave.
 */
const MAX_ANSWERS = 12;
const MAX_NOTES = 3;

type ExitReasonAnswer = Parameters<typeof trackPaygateExitReason>[0];

/**
 * The canvas's Survey board, "Not today? Tell us why.", with the states it does not draw
 * (Fatih, 28.10: mark it, thank, stay):
 *   - one tap saves the answer and marks the row; another tap changes it;
 *   - "Something else" opens a box for the sentence, with Send;
 *   - the footnote turns into the thanks, read out politely; nothing else on the page moves.
 * A radio group whose arrows move focus and whose tap (or Enter, Space) chooses: choosing
 * records an answer, so arrowing through the list must not record eight.
 */
const ExitReasons: FC<ExitReasonsProps> = ({ stage, priceCents, seed, random }) => {
  const titleId = useId();
  const noteId = useId();
  const [reasons] = useState<ExitReason[]>(() =>
    orderExitReasons(exitReasons(stage, priceCents), random ?? seededRandom(`${seed}:${stage}`))
  );
  const recorded = useRef({ answers: 0, notes: 0, last: null as string | null });
  /** A choice made past the cap, still unsent: the reader's final answer, sent as they leave. */
  const pending = useRef<ExitReasonAnswer | null>(null);
  const order = reasons.map((r) => r.code);
  const [chosen, setChosen] = useState<ExitReason["code"] | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);

  // "Something else" opens its box with the caret in it.
  useEffect(() => {
    if (chosen === "other") noteRef.current?.focus();
  }, [chosen]);

  // Leaving (Back, the way out, Unlock, a closed tab): a final choice past the cap is sent now.
  // The event goes by sendBeacon, which outlives the page.
  useEffect(() => {
    const flush = () => {
      const answer = pending.current;
      pending.current = null;
      if (!answer || answer.reason === recorded.current.last) return;
      recorded.current.last = answer.reason;
      trackPaygateExitReason(answer);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  const choose = (reason: ExitReason, index: number) => {
    setFocusIndex(index);
    if (chosen === reason.code) return;
    const answer: ExitReasonAnswer = {
      stage,
      reason: reason.code,
      position: index + 1,
      order,
      changed: chosen !== null,
    };
    if (recorded.current.answers < MAX_ANSWERS) {
      recorded.current.answers += 1;
      recorded.current.last = reason.code;
      pending.current = null;
      trackPaygateExitReason(answer);
    } else {
      pending.current = answer;
    }
    setChosen(reason.code);
  };

  const onKeyDown = (index: number) => (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const last = reasons.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowDown" || event.key === "ArrowRight")
      next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft")
      next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next === null) return;
    event.preventDefault();
    setFocusIndex(next);
    buttons.current[next]?.focus();
  };

  const note = draft.trim();
  const canSend = note.length > 0 && note !== sent;
  const send = () => {
    if (!canSend) return;
    if (recorded.current.notes < MAX_NOTES) {
      recorded.current.notes += 1;
      trackPaygateExitNote({ stage, text: note });
    }
    setSent(note);
  };

  // Thanked once an answer is in: at once for a reason, after Send for "Something else".
  const thanked = chosen !== null && (chosen !== "other" || sent !== null);
  // The row a Tab lands on: the chosen one, else the one the arrows last reached.
  const tabStop = chosen ? reasons.findIndex((r) => r.code === chosen) : focusIndex;

  return (
    <section className="pge-reasons" aria-labelledby={titleId}>
      <div className="pge-reasons__panel">
        <div className="pge-reasons__head">
          <h2 id={titleId} className="pge-h2">
            {EXIT_COPY.reasons.title}
          </h2>
          <p className="pge-reasons__hint">{EXIT_COPY.reasons.hint}</p>
        </div>
        <div className="pge-reasons__group" role="radiogroup" aria-label={EXIT_COPY.reasons.group}>
          {reasons.map((reason, index) => {
            const on = chosen === reason.code;
            return (
              <div key={reason.code} className={on ? "pge-reason pge-reason--on" : "pge-reason"}>
                <button
                  ref={(el) => {
                    buttons.current[index] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  tabIndex={index === tabStop ? 0 : -1}
                  className="pge-reason__button"
                  onClick={() => choose(reason, index)}
                  onKeyDown={onKeyDown(index)}
                >
                  <span className="pge-reason__dot" aria-hidden="true" />
                  <span>{reason.label}</span>
                </button>
                {on && reason.code === "other" ? (
                  <div className="pge-reason__note">
                    <label htmlFor={noteId} className="sr-only">
                      {EXIT_COPY.reasons.noteLabel}
                    </label>
                    <textarea
                      ref={noteRef}
                      id={noteId}
                      className="pge-reason__textarea ph-no-capture"
                      data-clarity-mask="true"
                      maxLength={EXIT_NOTE_MAX}
                      rows={3}
                      placeholder={EXIT_COPY.reasons.notePlaceholder}
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                    />
                    <button
                      type="button"
                      className="pge-reason__send"
                      disabled={!canSend}
                      onClick={send}
                    >
                      {EXIT_COPY.reasons.send}
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <p className="pge-reasons__foot" role="status" aria-live="polite">
          {thanked ? (
            <span className="pge-reasons__thanks">
              <TickIcon size={14} width={2.6} />
              {EXIT_COPY.reasons.thanks}
            </span>
          ) : (
            EXIT_COPY.reasons.footnote
          )}
        </p>
      </div>
    </section>
  );
};

export default ExitReasons;
