"use client";

import { useEffect, useImperativeHandle, useRef, useState, type FC, type Ref } from "react";
import type { SurveyQuestion } from "@/data/survey-data";
import { getCountryFlagUrl } from "@/data/countries";
import {
  advanceDetails,
  COUNTRY_QID,
  DETAILS_COPY,
  DETAILS_FIELDS,
  EMAIL_QID,
  fieldDone,
  firstOpenField,
  NAME_MAX_LENGTH,
  NAME_QID,
  OPT_IN_QID,
  optInLabels,
  POSTAL_QID,
  type DetailsField,
  type DetailsStep as DetailsStepResult,
} from "@features/survey/survey2/details";
import { GRADIENT_RING, GRADIENT_TEXT } from "../sheets/parts";
import CountryQuestion from "./CountryQuestion";

/**
 * Survey 2.0's details screen (`00010`): name, email, then country with its postal code, one at
 * a time on one page, and the newsletter question once there is an email (Mark's boards
 * "Details · 1 · Name", "2a · Email", "3 · Country picked · postal code opens", "alt · Yes/No
 * opt-in"). Every answer goes to the engine under today's ids (features/survey/survey2/details.ts).
 *
 * The engine's Next (and Enter in a box, which the engine reads as Next) calls `advance`: it opens
 * the next field to fill, says what is missing, or reports the screen done, and the engine then
 * takes the survey's own last step (the miss-out sheet, the submit).
 */
export interface DetailsStepHandle {
  advance(latest?: Readonly<Record<string, unknown>>): DetailsStepResult;
}

interface DetailsStepProps {
  ref?: Ref<DetailsStepHandle>;
  answers: Readonly<Record<string, unknown>>;
  onAnswer: (qId: string, value: string) => void;
  /** A No on the newsletter question: the engine offers the miss-out sheet, once per run. */
  onOptInNo: () => void;
  /** 16015's options: the stored Yes and No. */
  optInOptions: readonly string[];
  /** 15001, for the country search. */
  countryQuestion: SurveyQuestion;
  /** Open this field: the email, after the server refused it. */
  focusField?: DetailsField;
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");

const CheckIcon: FC = () => (
  <svg
    aria-hidden
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#8a8597"
    strokeWidth="2.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const ShieldIcon: FC = () => (
  <svg
    aria-hidden
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

/** The numbered ring at the start of a row: open (brand ring), done (grey, a tick), or to come. */
const StepRing: FC<{ n: number; state: "active" | "done" | "pending" }> = ({ n, state }) => (
  <span
    aria-hidden
    className={`flex size-[30px] flex-none items-center justify-center rounded-full border-2 border-transparent font-sans text-[13px] font-extrabold ${
      state === "active" ? "text-[#3a2a55]" : state === "done" ? "text-[#8a8597]" : "text-[#a7a2b3]"
    }`}
    style={
      state === "active"
        ? GRADIENT_RING
        : {
            background: `linear-gradient(#fcf9ff, #fcf9ff) padding-box, ${
              state === "done" ? "#d6d1de" : "#e4e2e8"
            } border-box`,
          }
    }
  >
    {state === "done" ? <CheckIcon /> : n}
  </span>
);

const inputClass =
  "w-full border-0 border-b-2 border-[#6b5b95] bg-transparent px-0 pb-[9px] pt-0 font-sans text-[17px] leading-[22px] text-[#161021] placeholder:text-[#8e8e8e] focus:outline-none focus-visible:outline-none";

const DetailsStep: FC<DetailsStepProps> = ({
  ref,
  answers,
  onAnswer,
  onOptInNo,
  optInOptions,
  countryQuestion,
  focusField,
}) => {
  const [active, setActive] = useState<DetailsField>(
    () => focusField ?? firstOpenField(answers) ?? "country"
  );
  const [blocked, setBlocked] = useState<DetailsField | "optIn" | null>(null);
  /** The country search reopened over a picked country (a tap on its row). */
  const [changingCountry, setChangingCountry] = useState(false);
  const moved = useRef(false);
  const inputs = useRef<Partial<Record<DetailsField, HTMLInputElement | null>>>({});
  const { yes, no } = optInLabels(optInOptions);

  // A new field to open from the engine (the email, once the server refused it): adjusted while
  // rendering, as React advises for state that follows a prop.
  const [seenFocus, setSeenFocus] = useState(focusField);
  if (focusField !== seenFocus) {
    setSeenFocus(focusField);
    if (focusField) setActive(focusField);
  }

  // A field opened by Next takes the focus, so typing carries on; never on arrival, where a
  // phone's keyboard would cover the page before it is read.
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    inputs.current[active]?.focus();
  }, [active]);

  useImperativeHandle(
    ref,
    () => ({
      advance(latest = answers) {
        const step = advanceDetails(active, latest);
        if (step.kind === "moved") {
          moved.current = true;
          setActive(step.to);
          setBlocked(null);
        } else if (step.kind === "blocked") {
          setBlocked(step.field);
        } else {
          setBlocked(null);
        }
        return step;
      },
    }),
    [active, answers]
  );

  const open = (field: DetailsField) => {
    moved.current = true;
    setActive(field);
    setBlocked(null);
  };

  const country = text(answers[COUNTRY_QID]);
  const optIn = text(answers[OPT_IN_QID]);
  const emailDone = fieldDone("email", answers);

  const missing = (field: DetailsField | "optIn") =>
    blocked === field ? (
      <p
        role="alert"
        className="mt-2 font-sans text-[12.5px] font-semibold leading-[18px] text-[#d92d20]"
      >
        {field === "optIn" ? DETAILS_COPY.optInMissing : DETAILS_COPY.fields[field].missing}
      </p>
    ) : null;

  const activeBody = (field: DetailsField) => {
    const copy = DETAILS_COPY.fields[field];
    if (field === "country") {
      // Picked: the country as a quiet row (Mark's board "3 · Country picked"), the postal code
      // under it; a tap on the row searches again.
      const searching = !country || changingCountry;
      return (
        <>
          {searching ? (
            <>
              <div className="font-serif text-[18px] leading-[24px] text-[#161021]">
                {copy.prompt}
              </div>
              <div className="mt-[10px]">
                <CountryQuestion
                  question={countryQuestion}
                  value={country || null}
                  onChange={(value) => {
                    onAnswer(COUNTRY_QID, value);
                    if (value) setChangingCountry(false);
                  }}
                  heading={false}
                />
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setChangingCountry(true)}
              className="focus-visible-ring block w-full text-left"
            >
              <span className="block font-sans text-[12px] text-[#6b6678]">{copy.row}</span>
              <span className="block truncate font-sans text-[15.5px] font-semibold text-[#161021]">
                {country}
              </span>
            </button>
          )}
          {country && !searching && (
            <div className="ml-[14px] mt-3 border-l-2 border-[#e4dcf5] pb-[14px] pl-[26px] pt-[2px]">
              <label className="block">
                <span className="font-sans text-[12.5px] font-bold text-[#413b4d]">
                  {DETAILS_COPY.postalLabel(country)}
                </span>
                <span className="mt-2 flex items-center gap-[10px]">
                  {getCountryFlagUrl(country) && (
                    // eslint-disable-next-line @next/next/no-img-element -- tiny decorative external flag icon
                    <img
                      aria-hidden="true"
                      src={getCountryFlagUrl(country)}
                      alt=""
                      width={22}
                      height={15}
                      className="flex-none rounded-[3px] shadow-[0_0_0_1px_rgba(22,16,33,0.12)]"
                    />
                  )}
                  <input
                    ref={(el) => {
                      inputs.current.country = el;
                    }}
                    type="text"
                    inputMode="text"
                    autoComplete="postal-code"
                    value={text(answers[POSTAL_QID])}
                    onChange={(e) => onAnswer(POSTAL_QID, e.target.value)}
                    placeholder={DETAILS_COPY.postalExample[country] ?? ""}
                    className={inputClass}
                  />
                </span>
                <span className="mt-[6px] block font-sans text-[12px] leading-[16px] text-[#6b5b95]">
                  {DETAILS_COPY.postalHelper}
                </span>
              </label>
            </div>
          )}
        </>
      );
    }
    return (
      <>
        <div className="font-serif text-[18px] leading-[24px] text-[#161021]">{copy.prompt}</div>
        <label className="mt-[10px] block">
          <span className="font-sans text-[12.5px] font-bold text-[#413b4d]">{copy.label}</span>
          <input
            ref={(el) => {
              inputs.current[field] = el;
            }}
            type={field === "email" ? "email" : "text"}
            inputMode={field === "email" ? "email" : "text"}
            autoComplete={field === "email" ? "email" : "nickname"}
            maxLength={field === "name" ? NAME_MAX_LENGTH : undefined}
            value={text(answers[field === "email" ? EMAIL_QID : NAME_QID])}
            onChange={(e) => onAnswer(field === "email" ? EMAIL_QID : NAME_QID, e.target.value)}
            placeholder={copy.placeholder}
            className={`mt-2 ${inputClass}`}
          />
        </label>
        {field === "email" && (
          <div className="mt-[10px] flex items-start gap-[10px] rounded-xl bg-[#eef7f1] px-3 py-[10px] text-[#1f5d40]">
            <span className="mt-[1px] flex-none">
              <ShieldIcon />
            </span>
            <p className="font-sans text-[12.5px] leading-[18px]">
              <b>{DETAILS_COPY.privacyTipLead}</b> {DETAILS_COPY.privacyTip}
            </p>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="flex flex-col" data-survey-details>
      <h2 className="m-0 font-serif text-[22.5px] font-medium leading-[27px] tracking-[-0.2px] text-[#161021]">
        {DETAILS_COPY.titleLead}
        <span className="text-transparent" style={GRADIENT_TEXT}>
          {DETAILS_COPY.titleEmphasis}
        </span>
      </h2>
      <p className="mt-[10px] font-sans text-[13.5px] leading-[20px] text-[#413b4d]">
        {DETAILS_COPY.sub}
      </p>

      <div
        className="mt-4 flex flex-col items-center gap-[6px] rounded-[20px] border-[1.5px] border-transparent px-[18px] pb-3 pt-[14px] text-center shadow-[0_10px_28px_-14px_rgba(107,91,149,0.45)]"
        style={{
          background:
            "linear-gradient(#ffffff, #ffffff) padding-box, linear-gradient(135deg, #fe6839 0%, #bf66d9 50%, #958ef6 100%) border-box",
        }}
      >
        <span
          className="font-sans text-[11px] font-bold uppercase tracking-[0.1em] text-transparent"
          style={GRADIENT_TEXT}
        >
          {DETAILS_COPY.archetypeLabel}
        </span>
        <span
          aria-hidden
          className="select-none font-serif text-[30px] font-semibold leading-[36px] text-[#161021] [filter:blur(8px)]"
        >
          {DETAILS_COPY.archetypePlaceholder}
        </span>
      </div>

      <div className="mt-[10px]">
        {DETAILS_FIELDS.map((field, i) => {
          const copy = DETAILS_COPY.fields[field];
          if (field === active) {
            return (
              <div
                key={field}
                data-details-field={field}
                className="flex gap-3 border-t border-[#f1eef5] pb-4 pt-[14px]"
              >
                <StepRing n={i + 1} state="active" />
                <div className="min-w-0 flex-1">
                  {activeBody(field)}
                  {missing(field)}
                </div>
              </div>
            );
          }
          const done = fieldDone(field, answers);
          const value =
            field === "name"
              ? text(answers[NAME_QID])
              : field === "email"
                ? text(answers[EMAIL_QID])
                : text(answers[COUNTRY_QID]);
          return (
            <button
              key={field}
              type="button"
              data-details-field={field}
              onClick={() => open(field)}
              className="flex w-full items-center gap-3 border-t border-[#f1eef5] py-[9px] text-left"
            >
              <StepRing n={i + 1} state={done ? "done" : "pending"} />
              {done ? (
                <span className="min-w-0 flex-1">
                  <span className="block font-sans text-[12px] text-[#6b6678]">{copy.row}</span>
                  <span className="block truncate font-sans text-[15.5px] font-semibold text-[#161021]">
                    {value}
                  </span>
                </span>
              ) : (
                <span className="font-sans text-[15px] text-[#a7a2b3]">{copy.row}</span>
              )}
            </button>
          );
        })}
        <div className="border-t border-[#f1eef5]" />
      </div>

      {emailDone && (
        <div className="mt-[14px] rounded-2xl border border-[#ece8f3] bg-[#faf8fd] px-[14px] pb-3 pt-[14px]">
          <p
            id="details-optin-title"
            className="font-sans text-[15px] font-bold leading-[21px] text-[#161021]"
          >
            {DETAILS_COPY.optInTitle}
          </p>
          <p className="mt-1 font-sans text-[12px] leading-[17px] text-[#6b6678]">
            {DETAILS_COPY.optInSub}
          </p>
          <div
            role="radiogroup"
            aria-labelledby="details-optin-title"
            className="mt-[10px] flex gap-2"
          >
            {(
              [
                [yes, DETAILS_COPY.optInYes],
                [no, DETAILS_COPY.optInNo],
              ] as const
            ).map(([stored, label]) => {
              const picked = optIn === stored;
              return (
                <button
                  key={stored}
                  type="button"
                  role="radio"
                  aria-checked={picked}
                  onClick={() => {
                    setBlocked(null);
                    onAnswer(OPT_IN_QID, stored);
                    if (stored === no) onOptInNo();
                  }}
                  className={`flex min-h-10 min-w-0 flex-1 items-center justify-between gap-2 rounded-xl px-3 py-[6px] text-left font-sans text-[14px] leading-[19px] ${
                    picked
                      ? "border-[1.5px] border-[#6b5b95] bg-[#f4f1fb] font-bold text-[#161021]"
                      : "border border-[#e8e8ee] bg-[#f3f4f7] font-semibold text-[#413b4d]"
                  }`}
                >
                  <span>{label}</span>
                  <span
                    aria-hidden
                    className={`flex size-[18px] flex-none items-center justify-center rounded-full ${
                      picked ? "border-2 border-[#6b5b95]" : "border-[1.5px] border-[#c2c3c6]"
                    }`}
                  >
                    {picked && <span className="size-2 rounded-full bg-[#6b5b95]" />}
                  </span>
                </button>
              );
            })}
          </div>
          {missing("optIn")}
        </div>
      )}

      <p className="mt-3 flex items-center gap-2 font-sans text-[12.5px] leading-[18px] text-[#2f7a55]">
        <ShieldIcon />
        <span>{DETAILS_COPY.note}</span>
      </p>
    </div>
  );
};

export default DetailsStep;
