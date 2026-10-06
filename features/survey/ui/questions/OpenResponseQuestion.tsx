"use client";

import { useState, type FC, type KeyboardEvent } from "react";
import type { SurveyQuestion } from "@/data/survey-data";
import { isMultiline } from "@features/survey/questionFlags";
import QuestionHeading from "./QuestionHeading";
import { useSurveyTheme } from "../SurveyThemeContext";
import { isValidSurveyEmail, tidySurveyEmail } from "@features/survey/email";

interface OpenResponseQuestionProps {
  question: SurveyQuestion;
  value: string | null;
  onChange: (value: string) => void;
  forceValidation?: boolean;
  confirmValue?: string;
  onConfirmChange?: (value: string) => void;
}

const AlertCircleIcon: FC = () => (
  <svg
    aria-hidden
    className="h-4 w-4 shrink-0"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const MAX_LENGTH = 500;
// Multi-line boxes (`isMultiline`) take a list or a few sentences. 1,000 is the most a
// string answer may hold at the API (`surveyAnswersSchema`), so the box never lets someone
// type an answer the server would then reject.
const MULTILINE_MAX_LENGTH = 1000;
// Qs that render without a character counter (email + name).
const UNLIMITED_QIDS = new Set(["00000", "00001"]);
// The server keeps 80 characters of a name. Typing past that used to be refused at the
// final submit, 56 questions later, on every Retry; now the box stops there.
const NAME_QID = "00001";
const NAME_MAX_LENGTH = 80;

function getValidationError(
  value: string,
  inputType: string | undefined,
  limit: number | null
): string | null {
  if (!value) return null;
  if (inputType === "email") {
    if (!isValidSurveyEmail(value))
      return "Hmm, that doesn\u2019t look like a valid email. Make sure it follows the format: name@example.com";
  }
  if (limit !== null && value.length > limit) return `Maximum ${limit} characters allowed`;
  return null;
}

/**
 * SurveyEngine listens on `window`: Enter and \u2192 move on, \u2190 goes back. In a multi-line box
 * those are editing keys (a new line, moving the caret), so they stop here, the same
 * containment CountryQuestion applies to its search box.
 */
function containEditingKeys(e: KeyboardEvent<HTMLTextAreaElement>) {
  if (e.key === "Enter" || e.key === "ArrowLeft" || e.key === "ArrowRight") e.stopPropagation();
}

const OpenResponseQuestion: FC<OpenResponseQuestionProps> = ({
  question,
  value,
  onChange,
  forceValidation,
  confirmValue,
  onConfirmChange,
}) => {
  const [touched, setTouched] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);
  const currentValue = value ?? "";
  const showError = touched || forceValidation;
  const multiline = isMultiline(question.qId);
  const limit = UNLIMITED_QIDS.has(question.qId)
    ? null
    : multiline
      ? MULTILINE_MAX_LENGTH
      : MAX_LENGTH;
  const limited = limit !== null;
  const error = showError ? getValidationError(currentValue, question.inputType, limit) : null;

  const isEmailField = question.inputType === "email";
  const confirmCurrent = confirmValue ?? "";
  const emailMismatch =
    isEmailField &&
    currentValue.trim().length > 0 &&
    confirmCurrent.trim().length > 0 &&
    tidySurveyEmail(currentValue).toLowerCase() !== tidySurveyEmail(confirmCurrent).toLowerCase();
  const showConfirmError = (confirmTouched || forceValidation) && emailMismatch;
  /**
   * Next stays disabled until the confirm box matches, and a disabled button
   * takes no tap, so with the confirm box EMPTY nothing ever said why Next did
   * nothing: no error fires until the box holds something. Reproduced on iPhone
   * and Android emulation, 2026-10-04: a valid email, Next greyed out, taps and
   * the keyboard's Go both ignored, no message. So say it as soon as it is the
   * one thing missing, and in red once they have tried to go on.
   */
  const confirmMissing = isValidSurveyEmail(currentValue) && confirmCurrent.trim().length === 0;
  /** Red, and announced as an error, rather than a hint. */
  const confirmInvalid = showConfirmError || (confirmMissing && !!forceValidation);
  const confirmMessageId = `${question.qId}-confirm-message`;

  const white = useSurveyTheme() === "white";
  // White autofill: omit the dark autofill overpaint class (it forces white
  // fill text) and let the browser's default light autofill render on white.
  const inputBase = `w-full border-b-2 bg-transparent pb-3 pt-2 font-sans text-[22px] focus:outline-none sm:text-[24px] ${
    white
      ? "text-[#161021] placeholder:text-black/30"
      : "autofill-dark text-white placeholder:text-white/30"
  }`;

  return (
    <div className="flex flex-col gap-5">
      {/* Question title */}
      <QuestionHeading question={question} />

      {/* Input */}
      <div className="flex flex-col gap-2">
        {multiline ? (
          /* A list or a few sentences (Mark's content asks). data-clarity-mask keeps the
             words out of session replay: the survey root is unmasked by owner decision
             (10.08), and this is the one place people type free text about their own
             sexuality. Fatih, 29.09. */
          <textarea
            name={question.qId}
            aria-label={question.question}
            value={currentValue}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => setTouched(true)}
            onKeyDown={containEditingKeys}
            placeholder={question.placeholder || "Type your answer…"}
            autoComplete="off"
            rows={5}
            maxLength={MULTILINE_MAX_LENGTH}
            data-clarity-mask="true"
            className={`min-h-[152px] w-full resize-y rounded-[16px] border px-[18px] py-[14px] font-sans text-[17px] leading-[26px] transition-[border-color] duration-200 focus:outline-none ${
              white
                ? "bg-[#f5f6f8] text-[#161021] placeholder:text-black/35"
                : "bg-white/[0.05] text-white placeholder:text-white/30"
            } ${
              error
                ? "border-[#ef4444]"
                : white
                  ? "border-black/[0.08] focus:border-[rgba(254,104,57,0.45)]"
                  : "border-white/10 focus:border-[rgba(254,104,57,0.45)]"
            }`}
          />
        ) : (
          <input
            type={question.inputType === "email" ? "email" : "text"}
            name={question.qId}
            aria-label={question.question}
            value={currentValue}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder={question.placeholder || "Type your answer…"}
            autoComplete={question.inputType === "email" ? "email" : "off"}
            spellCheck={question.inputType === "email" ? false : undefined}
            maxLength={limit ?? (question.qId === NAME_QID ? NAME_MAX_LENGTH : undefined)}
            className={`${inputBase} ${
              error
                ? "border-[#ef4444]"
                : "border-[rgba(254,104,57,0.2)] focus:border-[rgba(254,104,57,0.4)]"
            }`}
            style={
              white
                ? undefined
                : {
                    ["--autofill-bg" as string]: "#0a0510",
                    ["--autofill-font-size" as string]: "22px",
                    ["--autofill-font-size-sm" as string]: "24px",
                  }
            }
          />
        )}

        {/* Below input: error message left, char count right */}
        <div className="flex items-start justify-between gap-4">
          {/* Error message */}
          <div className="flex items-center gap-1.5" aria-live="polite">
            {error && (
              <>
                <span className="text-[#ef4444]">
                  <AlertCircleIcon />
                </span>
                <span className="font-sans text-[13px] font-medium text-[#ef4444]">{error}</span>
              </>
            )}
          </div>

          {/* Character counter (hidden for unlimited Qs) */}
          {limited && (
            <span
              className={`font-sans text-[12px] font-medium ${white ? "text-black/40" : "text-white/30"}`}
            >
              {currentValue.length} / {limit}
            </span>
          )}
        </div>
      </div>

      {/* Confirm email field (email-input questions only) */}
      {isEmailField && (
        <div className="flex flex-col gap-2">
          <input
            type="email"
            name={`${question.qId}-confirm`}
            aria-label="Confirm email address"
            aria-describedby={showConfirmError || confirmMissing ? confirmMessageId : undefined}
            aria-invalid={confirmInvalid || undefined}
            value={confirmCurrent}
            onChange={(e) => onConfirmChange?.(e.target.value)}
            onBlur={() => setConfirmTouched(true)}
            placeholder="Confirm email address."
            autoComplete="email"
            spellCheck={false}
            className={`${inputBase} ${
              confirmInvalid
                ? "border-[#ef4444]"
                : "border-[rgba(254,104,57,0.2)] focus:border-[rgba(254,104,57,0.4)]"
            }`}
            style={{
              ["--autofill-bg" as string]: "#0a0510",
              ["--autofill-font-size" as string]: "22px",
              ["--autofill-font-size-sm" as string]: "24px",
            }}
          />
          <div id={confirmMessageId} className="flex items-center gap-1.5" aria-live="polite">
            {showConfirmError && (
              <>
                <span className="text-[#ef4444]">
                  <AlertCircleIcon />
                </span>
                <span className="font-sans text-[13px] font-medium text-[#ef4444]">
                  Emails don&rsquo;t match. Please re-enter.
                </span>
              </>
            )}
            {confirmMissing && (
              <span
                className={`font-sans text-[13px] font-medium ${
                  forceValidation ? "text-[#ef4444]" : white ? "text-black/55" : "text-white/55"
                }`}
              >
                Type your email again to confirm it.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default OpenResponseQuestion;
