"use client";

import { useEffect, useRef, useState, type FC } from "react";
import type { FeedbackPayload } from "./hooks/useSectionFeedback";

const NEGATIVE_ISSUES = [
  {
    id: "inaccurate",
    label: "Inaccurate or Misleading",
    desc: "The content felt wrong, off, or misrepresented the topic.",
  },
  {
    id: "incomplete",
    label: "Missing or Incomplete",
    desc: "Important details, examples, or insights were missing.",
  },
  {
    id: "unclear",
    label: "Unclear or Hard to Follow",
    desc: "The writing was confusing, repetitive, or poorly structured.",
  },
  {
    id: "irrelevant",
    label: "Not Relevant or Useful",
    desc: "It didn't answer my question or add value to the report.",
  },
  {
    id: "tone",
    label: "Wrong Tone or Style",
    desc: "It sounded too formal, robotic, biased, or emotionally off.",
  },
  { id: "other", label: "Other", desc: "Something else." },
] as const;

type Step = "idle" | "positive" | "negative-pick" | "negative-comment" | "sent" | "failed";

type Rating = "up" | "down";

interface Props {
  /**
   * Stores the rating alone, on the thumb (review 01.10). Resolves to whether it was
   * stored; `false` takes the choice back. Optional only for callers with nothing to
   * store, which then keep the choice on screen.
   */
  onRate?: (feedback: Rating) => Promise<boolean> | boolean | void;
  /** Send: the rating with its optional issue and comment. `false` = not stored. */
  onFeedback: (payload: FeedbackPayload) => Promise<boolean> | boolean | void;
  sectionTitle: string;
  /** The rating stored for this section, if any. */
  value: Rating | null;
  /** A message has been sent for this section. */
  isSent: boolean;
}

/**
 * "Does this resonate?" — a thumb, then an optional message.
 *
 * Marcus, review 01.10: "Let's not force users to store a message when rating. Ergo store
 * the rating also without 'send'". The thumb stores the rating at once and opens the
 * message box; Cancel only closes the box, the rating stays. The thumbs stay switchable,
 * a message sent or not. Clicking the thumb already stored only toggles the box.
 */
const SectionFeedback: FC<Props> = ({ onRate, onFeedback, sectionTitle, value, isSent }) => {
  const [step, setStep] = useState<Step>("idle");
  const [comment, setComment] = useState("");
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);
  const [issueDropdownOpen, setIssueDropdownOpen] = useState(false);
  // The thumb on screen. Follows a stored rating, and moves at once on a click so the
  // choice shows while it is stored; a refusal moves it back.
  const [rated, setRated] = useState<Rating | null>(value);
  const [announce, setAnnounce] = useState("");
  // Counts the reader's choices: a result that arrives after a newer one is ignored
  // (final review, 01.10), so a superseded failure never takes back the newer choice.
  const choices = useRef(0);

  useEffect(() => {
    setRated(value);
  }, [value]);

  // Auto-dismiss a toast after 3 seconds
  useEffect(() => {
    if (step !== "sent" && step !== "failed") return;
    const id = setTimeout(() => setStep("idle"), 3000);
    return () => clearTimeout(id);
  }, [step]);

  const selectedItem = NEGATIVE_ISSUES.find((i) => i.id === selectedIssue);
  const panelOpen = (rating: Rating) =>
    rating === "up" ? step === "positive" : step === "negative-pick" || step === "negative-comment";

  const choose = async (rating: Rating) => {
    // The panel toggles; the rating only posts when it changes.
    setStep(panelOpen(rating) ? "idle" : rating === "up" ? "positive" : "negative-pick");
    if (rated === rating) return;
    const choice = ++choices.current;
    const previous = rated;
    setRated(rating);
    setAnnounce("");
    const stored = onRate ? await onRate(rating) : true;
    if (choice !== choices.current) return;
    if (stored === false) {
      setRated(previous);
      setStep("failed");
      return;
    }
    setAnnounce("Rating saved");
  };

  const send = async (payload: FeedbackPayload) => {
    const choice = ++choices.current;
    const stored = await onFeedback(payload);
    if (choice !== choices.current) return;
    if (stored === false) {
      setStep("failed");
      return;
    }
    setRated(payload.feedback);
    setComment("");
    setSelectedIssue(null);
    setIssueDropdownOpen(false);
    setStep("sent");
  };

  return (
    <div className="report-fb" data-sent={isSent || undefined}>
      {/* Thumbs row — always in flow to anchor layout */}
      <span className="report-fb__label">Does this resonate?</span>
      <div className="report-fb__thumbs">
        <button
          type="button"
          aria-label={`This resonates: ${sectionTitle}`}
          aria-pressed={rated === "up"}
          className={`report-fb__thumb ${rated === "up" ? "is-selected" : ""}`}
          onClick={() => void choose("up")}
        >
          <ThumbUpIcon />
        </button>
        <button
          type="button"
          aria-label={`This does not resonate: ${sectionTitle}`}
          aria-pressed={rated === "down"}
          className={`report-fb__thumb ${rated === "down" ? "is-selected" : ""}`}
          onClick={() => void choose("down")}
        >
          <ThumbDownIcon />
        </button>
      </div>
      <span className="report-fb__status" role="status" aria-live="polite">
        {announce}
      </span>

      {/* Floating panels — absolutely positioned */}
      {step === "sent" && (
        <div className="report-fb__panel report-fb--toast">
          <CheckIcon />
          <div className="report-fb__toast-copy">
            <p className="report-fb__toast-title">Feedback sent!</p>
            <p className="report-fb__toast-sub">Thank you for helping us improve.</p>
          </div>
        </div>
      )}

      {step === "failed" && (
        <div className="report-fb__panel report-fb--toast is-failed" role="alert">
          <div className="report-fb__toast-copy">
            <p className="report-fb__toast-title">Couldn&rsquo;t save that</p>
            <p className="report-fb__toast-sub">Please try again in a moment.</p>
          </div>
        </div>
      )}

      {step === "positive" && (
        <div className="report-fb__panel report-fb--expanded">
          <textarea
            className="report-fb__textarea"
            placeholder="Add a comment (optional)..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
          />
          <div className="report-fb__actions">
            <button
              type="button"
              className="report-fb__cancel"
              onClick={() => {
                setStep("idle");
                setComment("");
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="report-fb__send"
              onClick={() => void send({ feedback: "up", comment: comment || undefined })}
            >
              Send
            </button>
          </div>
        </div>
      )}

      {(step === "negative-pick" || step === "negative-comment") && (
        <div className="report-fb__panel report-fb--expanded">
          <button
            type="button"
            className="report-fb__dropdown-trigger"
            onClick={() => setIssueDropdownOpen((v) => !v)}
          >
            <span className="report-fb__dropdown-text">
              {selectedItem ? (
                <>
                  <span className="report-fb__dropdown-check">
                    <CheckCircleIcon />
                  </span>
                  {selectedItem.label}
                </>
              ) : (
                "Select an issue..."
              )}
            </span>
            <ChevronIcon up={issueDropdownOpen} />
          </button>

          {issueDropdownOpen && (
            <div className="report-fb__dropdown-list">
              {NEGATIVE_ISSUES.map((issue) => (
                <button
                  key={issue.id}
                  type="button"
                  className={`report-fb__dropdown-item ${selectedIssue === issue.id ? "is-selected" : ""}`}
                  onClick={() => {
                    setSelectedIssue(issue.id);
                    setIssueDropdownOpen(false);
                    setStep("negative-comment");
                  }}
                >
                  <span className="report-fb__dropdown-radio">
                    {selectedIssue === issue.id ? <CheckCircleIcon /> : <EmptyCircleIcon />}
                  </span>
                  <span>
                    <strong>{issue.label}</strong>
                    <span className="report-fb__dropdown-desc">{issue.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {(step === "negative-comment" || !issueDropdownOpen) && (
            <textarea
              className="report-fb__textarea"
              placeholder="Add a comment (optional)..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
            />
          )}

          <div className="report-fb__actions">
            <button
              type="button"
              className="report-fb__cancel"
              onClick={() => {
                setStep("idle");
                setComment("");
                setSelectedIssue(null);
                setIssueDropdownOpen(false);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="report-fb__send"
              onClick={() =>
                void send({
                  feedback: "down",
                  issue: selectedIssue ?? undefined,
                  comment: comment || undefined,
                })
              }
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Icons ── */

const ThumbUpIcon: FC = () => (
  <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <path
      d="M5.25 7.5v8.25"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M11.25 4.41 10.5 7.5h4.37a1.5 1.5 0 0 1 1.44 1.92l-1.75 6a1.5 1.5 0 0 1-1.44 1.08H3a1.5 1.5 0 0 1-1.5-1.5V9A1.5 1.5 0 0 1 3 7.5h2.07a1.5 1.5 0 0 0 1.34-.83L9 1.5a2.35 2.35 0 0 1 2.25 2.91Z"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ThumbDownIcon: FC = () => (
  <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <path
      d="M12.75 10.5V2.25"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M6.75 13.59 7.5 10.5H3.13a1.5 1.5 0 0 1-1.44-1.92l1.75-6A1.5 1.5 0 0 1 4.88 1.5H15a1.5 1.5 0 0 1 1.5 1.5V9a1.5 1.5 0 0 1-1.5 1.5h-2.07a1.5 1.5 0 0 0-1.34.83L9 16.5a2.35 2.35 0 0 1-2.25-2.91Z"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CheckIcon: FC = () => (
  <svg viewBox="0 0 20 20" fill="none" className="report-fb__toast-check" aria-hidden="true">
    <circle cx="10" cy="10" r="9" fill="#6b7280" />
    <path
      d="M6.5 10l2.5 2.5 5-5"
      stroke="#fff"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CheckCircleIcon: FC = () => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <circle cx="10" cy="10" r="9" fill="#fe6839" />
    <path
      d="M6.5 10l2.5 2.5 5-5"
      stroke="#fff"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const EmptyCircleIcon: FC = () => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <circle cx="10" cy="10" r="9" stroke="rgba(22,16,33,0.25)" strokeWidth="1.2" />
  </svg>
);

const ChevronIcon: FC<{ up?: boolean }> = ({ up }) => (
  <svg
    viewBox="0 0 10 6"
    fill="none"
    aria-hidden="true"
    style={up ? { transform: "rotate(180deg)" } : undefined}
  >
    <path
      d="M1 1l4 4 4-4"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default SectionFeedback;
