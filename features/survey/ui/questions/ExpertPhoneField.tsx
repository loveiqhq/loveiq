"use client";

import { useId, useMemo, type FC } from "react";
import {
  EXPERT_COPY,
  EXPERT_COUNTRY_CODES,
  EXPERT_PHONE_MAX_LENGTH,
  guessExpertCode,
  joinExpertPhone,
  splitExpertPhone,
} from "@features/survey/survey2/expert";

/**
 * The phone number under a Yes on Survey 2.0's expert question (Mark's board "Q-new-expert",
 * Marcus's ask): a country code, the reader's own from the browser until they pick one (Mark,
 * 24 Nov), and the number, kept as one string ("+49 151 2345678", features/survey/survey2/expert.ts).
 *
 * The number is personal, so the field stays out of session recordings: data-clarity-mask for
 * Clarity and ph-no-capture for PostHog, as the survey's other free-text boxes.
 */
const ExpertPhoneField: FC<{
  value: string;
  onChange: (value: string) => void;
  /** Next was refused: say what is missing. */
  showError: boolean;
}> = ({ value, onChange, showError }) => {
  const id = useId();
  // The field opens on a Yes, in the browser, so the browser's own time zone and languages are
  // there to read.
  const fallback = useMemo(
    () =>
      guessExpertCode(
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        typeof navigator === "undefined" ? [] : navigator.languages
      ),
    []
  );
  const { code, number } = splitExpertPhone(value, fallback);
  const helperId = `${id}-helper`;
  const errorId = `${id}-error`;
  const field =
    "h-12 rounded-xl border border-[#d6d1de] bg-white font-sans text-[#161021] focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-[#8f72c0]";

  return (
    <div className="-mt-1 rounded-[14px] border border-[#e4dcf0] bg-[#faf8fd] px-4 py-[14px] motion-safe:animate-expert-phone-in">
      <label htmlFor={id} className="block font-sans text-[13.5px] font-bold text-[#161021]">
        {EXPERT_COPY.phoneLabel}
      </label>
      <div className="mt-2 flex gap-2">
        {/* 16px, not 15 as on the board: iOS zooms into a smaller form control and never back out. */}
        <select
          aria-label={EXPERT_COPY.codeLabel}
          value={code}
          onChange={(e) => onChange(joinExpertPhone(e.target.value, number))}
          className={`${field} w-[104px] flex-none px-[10px] text-[16px] font-semibold`}
        >
          {EXPERT_COUNTRY_CODES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder={EXPERT_COPY.phonePlaceholder}
          maxLength={EXPERT_PHONE_MAX_LENGTH}
          value={number}
          onChange={(e) => onChange(joinExpertPhone(code, e.target.value))}
          aria-invalid={showError || undefined}
          aria-describedby={showError ? `${helperId} ${errorId}` : helperId}
          data-clarity-mask="true"
          className={`${field} ph-no-capture min-w-0 flex-1 px-[14px] text-[16px] placeholder:text-[#8e8e8e]`}
        />
      </div>
      <p id={helperId} className="mt-2 font-sans text-[12px] leading-[17px] text-[#5b5568]">
        {EXPERT_COPY.phoneHelper}
      </p>
      {showError && (
        <p
          id={errorId}
          role="alert"
          className="mt-2 font-sans text-[12.5px] font-semibold leading-[18px] text-[#d92d20]"
        >
          {EXPERT_COPY.phoneMissing}
        </p>
      )}
    </div>
  );
};

export default ExpertPhoneField;
