"use client";

import {
  Fragment,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type FC,
  type Ref,
} from "react";
import type { SurveyQuestion } from "@/data/survey-data";
import { getCountryFlagUrl } from "@/data/countries";
import { isOptInYes } from "@features/survey/optInSheet";
import {
  advanceDetails,
  COUNTRY_QID,
  DETAILS_COPY,
  DETAILS_FIELDS,
  EMAIL_QID,
  fieldDone,
  firstOpenStep,
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
 * a time on one page (Mark's boards "Details · 1 · Name", "2a · Email", "2b · Email entered ·
 * opt-in opens", "3 · Country picked · postal code opens"). Once there is an email, the
 * newsletter switch opens under it, and the country opens only on the Next that passes it (Mark,
 * 24 Nov). Every answer goes to the engine under today's ids (features/survey/survey2/details.ts).
 *
 * The engine's Next (and Enter in a box, which the engine reads as Next) calls `advance`: it opens
 * the next step, says what is missing, holds the page while the miss-out sheet is up, or reports
 * the screen done, and the engine then submits.
 */
export type DetailsAdvance = DetailsStepResult | { kind: "held" };

export interface DetailsStepHandle {
  advance(latest?: Readonly<Record<string, unknown>>): DetailsAdvance;
}

interface DetailsStepProps {
  ref?: Ref<DetailsStepHandle>;
  answers: Readonly<Record<string, unknown>>;
  onAnswer: (qId: string, value: string) => void;
  /**
   * Next leaving the email with the newsletter switch off: the engine offers the miss-out sheet,
   * once per run, and says whether it opened. Its Yes and Not now then carry on as Next would.
   */
  onOptInOff: () => boolean;
  /** 16015's options: the stored Yes and No. */
  optInOptions: readonly string[];
  /** 15001, for the country search. */
  countryQuestion: SurveyQuestion;
  /** Open this field: the email, after the server refused it. */
  focusField?: DetailsField;
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** White inside a 1.5px brand-gradient border: Mark's archetype card and newsletter box. */
const GRADIENT_CARD = {
  background:
    "linear-gradient(#ffffff, #ffffff) padding-box, linear-gradient(135deg, #fe6839 0%, #bf66d9 50%, #958ef6 100%) border-box",
} as const;

const Tick: FC<{ size: number; color: string; stroke: number; className?: string }> = ({
  size,
  color,
  stroke,
  className,
}) => (
  <svg
    aria-hidden
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={stroke}
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
    {state === "done" ? <Tick size={14} color="#8a8597" stroke={2.6} /> : n}
  </span>
);

/**
 * The newsletter switch under the email (Mark's board "Details · 2b"), hung off the email's ring
 * by the same line as the postal code under the country. The whole title row is the switch, so a
 * tap anywhere on it turns it; its points and fine print describe it to a screen reader.
 */
const OptInSwitch: FC<{ on: boolean; onToggle: () => void }> = ({ on, onToggle }) => {
  const id = useId();
  return (
    <div data-details-optin className="-mt-1 ml-[14px] border-l-2 border-[#e4dcf5] pb-3 pl-[26px]">
      <div className="rounded-2xl border-[1.5px] border-transparent p-3" style={GRADIENT_CARD}>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-describedby={`${id}-points ${id}-fine`}
          onClick={onToggle}
          className="focus-visible-ring -my-[7px] flex w-full items-center gap-3 rounded-xl py-[7px] text-left"
        >
          <span className="min-w-0 flex-1 font-serif text-[17px] leading-[22px] text-[#161021]">
            <span className="text-transparent" style={GRADIENT_TEXT}>
              {DETAILS_COPY.optInLead}
            </span>
            {DETAILS_COPY.optInRest}
          </span>
          <span
            aria-hidden
            className="relative h-[30px] w-[52px] flex-none rounded-full bg-[#ddd8e6]"
          >
            <span
              className={`absolute inset-0 rounded-full shadow-[0_6px_16px_-8px_rgba(191,102,217,0.8)] transition-opacity duration-200 motion-reduce:transition-none ${
                on ? "opacity-100" : "opacity-0"
              }`}
              style={{
                background: "linear-gradient(135deg, #fe6839 0%, #bf66d9 50%, #958ef6 100%)",
              }}
            />
            <span
              className={`absolute left-[3px] top-[3px] flex size-6 items-center justify-center rounded-full bg-white transition-transform duration-200 ease-out motion-reduce:transition-none ${
                on
                  ? "translate-x-[22px] shadow-[0_1px_4px_rgba(22,16,33,0.3)]"
                  : "shadow-[0_1px_3px_rgba(22,16,33,0.25)]"
              }`}
            >
              {on && <Tick size={11} color="#bf66d9" stroke={3.4} />}
            </span>
          </span>
        </button>
        <ul
          id={`${id}-points`}
          className="mt-2 flex flex-col gap-[5px] font-sans text-[13px] leading-[18px] text-[#161021]"
        >
          {DETAILS_COPY.optInPoints.map((point) => (
            <li key={point} className="flex gap-2">
              <Tick size={13} color="#2e7d5b" stroke={2.8} className="mt-[2px] flex-none" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
        <p id={`${id}-fine`} className="mt-2 font-sans text-[12px] leading-[17px] text-[#6b6678]">
          {DETAILS_COPY.optInFine}
        </p>
      </div>
    </div>
  );
};

const inputClass =
  "w-full border-0 border-b-2 border-[#6b5b95] bg-transparent px-0 pb-[9px] pt-0 font-sans text-[17px] leading-[22px] text-[#161021] placeholder:text-[#8e8e8e] focus:outline-none focus-visible:outline-none";

const DetailsStep: FC<DetailsStepProps> = ({
  ref,
  answers,
  onAnswer,
  onOptInOff,
  optInOptions,
  countryQuestion,
  focusField,
}) => {
  const [active, setActive] = useState<DetailsField>(
    () => focusField ?? firstOpenStep(answers) ?? "country"
  );
  const [blocked, setBlocked] = useState<DetailsField | null>(null);
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
        // Next on the email passes the newsletter switch under it, stored as it stands: today's
        // No while it is off, after the miss-out sheet has had its one turn (it carries on).
        if (active === "email" && fieldDone("email", latest) && !isOptInYes(latest[OPT_IN_QID])) {
          if (latest[OPT_IN_QID] !== no) onAnswer(OPT_IN_QID, no);
          if (onOptInOff()) {
            setBlocked(null);
            return { kind: "held" };
          }
        }
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
    [active, answers, no, onAnswer, onOptInOff]
  );

  const open = (field: DetailsField) => {
    moved.current = true;
    setActive(field);
    setBlocked(null);
  };

  const country = text(answers[COUNTRY_QID]);
  const emailDone = fieldDone("email", answers);
  const optInOn = isOptInYes(answers[OPT_IN_QID]);

  const missing = (field: DetailsField) =>
    blocked === field ? (
      <p
        role="alert"
        className="mt-2 font-sans text-[12.5px] font-semibold leading-[18px] text-[#d92d20]"
      >
        {DETAILS_COPY.fields[field].missing}
      </p>
    ) : null;

  /** A country picked and not being searched again: Mark's board "3 · Country picked". */
  const countryPicked = Boolean(country) && !changingCountry;

  const activeBody = (field: DetailsField) => {
    const copy = DETAILS_COPY.fields[field];
    if (field === "country") {
      // Picked: the country as a quiet row, a tap on it searches again (the postal code hangs
      // under the row, postalCode below).
      return countryPicked ? (
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
      ) : (
        <>
          <div className="font-serif text-[18px] leading-[24px] text-[#161021]">{copy.prompt}</div>
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
      );
    }
    const email = field === "email";
    return (
      <>
        <div className="font-serif text-[18px] leading-[24px] text-[#161021]">{copy.prompt}</div>
        {/* The email's spacing is Mark's boards 2a/2b; the name's, board 1. */}
        <label className={`block ${email ? "mt-2" : "mt-[10px]"}`}>
          <span className="font-sans text-[12.5px] font-bold text-[#413b4d]">{copy.label}</span>
          <input
            ref={(el) => {
              inputs.current[field] = el;
            }}
            type={email ? "email" : "text"}
            inputMode={email ? "email" : "text"}
            autoComplete={email ? "email" : "nickname"}
            maxLength={field === "name" ? NAME_MAX_LENGTH : undefined}
            value={text(answers[email ? EMAIL_QID : NAME_QID])}
            onChange={(e) => onAnswer(email ? EMAIL_QID : NAME_QID, e.target.value)}
            placeholder={copy.placeholder}
            className={`${email ? "mt-[6px]" : "mt-2"} ${inputClass}`}
          />
        </label>
        {/* The privacy tip until there is an email; the newsletter switch then takes its place. */}
        {email && !emailDone && (
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

  /**
   * The postal code under a picked country, hung off the step's ring by a line as on Mark's
   * board 3 (the newsletter switch hangs under the email the same way); the underline runs under
   * the flag too. Says what is missing here, under the field it is about.
   */
  const postalCode = () => (
    <div className="-mt-[2px] ml-[14px] border-l-2 border-[#e4dcf5] pb-[14px] pl-[26px] pt-[2px]">
      <label className="block">
        <span className="font-sans text-[12.5px] font-bold text-[#413b4d]">
          {DETAILS_COPY.postalLabel(country)}
        </span>
        <span className="mt-2 flex items-center gap-[10px] border-b-2 border-[#6b5b95] pb-[9px]">
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
            className="w-full border-0 bg-transparent p-0 font-sans text-[17px] leading-[22px] text-[#161021] placeholder:text-[#8e8e8e] focus:outline-none focus-visible:outline-none"
          />
        </span>
        <span className="mt-[6px] block font-sans text-[12px] leading-[16px] text-[#6b5b95]">
          {DETAILS_COPY.postalHelper}
        </span>
      </label>
      {missing("country")}
    </div>
  );

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
        style={GRADIENT_CARD}
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
            // Mark's boards: the email row (2a/2b) and a picked country's row (3) sit tighter.
            const picked = field === "country" && countryPicked;
            return (
              <Fragment key={field}>
                <div
                  data-details-field={field}
                  className={`flex gap-3 border-t border-[#f1eef5] ${
                    field === "email" ? "py-3" : picked ? "items-center py-[9px]" : "pb-4 pt-[14px]"
                  }`}
                >
                  <StepRing n={i + 1} state="active" />
                  <div className="min-w-0 flex-1">
                    {activeBody(field)}
                    {!picked && missing(field)}
                  </div>
                </div>
                {field === "email" && emailDone && (
                  <OptInSwitch
                    on={optInOn}
                    onToggle={() => onAnswer(OPT_IN_QID, optInOn ? no : yes)}
                  />
                )}
                {picked && postalCode()}
              </Fragment>
            );
          }
          if (!fieldDone(field, answers)) {
            // A step still to come opens only through Next (Mark: the country only after the
            // click that passes the newsletter switch), so its row takes no tap.
            return (
              <div
                key={field}
                data-details-field={field}
                className="flex items-center gap-3 border-t border-[#f1eef5] py-[9px]"
              >
                <StepRing n={i + 1} state="pending" />
                <span className="font-sans text-[15px] text-[#a7a2b3]">{copy.row}</span>
              </div>
            );
          }
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
              <StepRing n={i + 1} state="done" />
              <span className="min-w-0 flex-1">
                <span className="block font-sans text-[12px] text-[#6b6678]">{copy.row}</span>
                <span className="block truncate font-sans text-[15.5px] font-semibold text-[#161021]">
                  {value}
                </span>
              </span>
            </button>
          );
        })}
        <div className="border-t border-[#f1eef5]" />
      </div>

      <p className="mt-3 flex items-center gap-2 font-sans text-[12.5px] leading-[18px] text-[#2f7a55]">
        <ShieldIcon />
        <span>{DETAILS_COPY.note}</span>
      </p>
    </div>
  );
};

export default DetailsStep;
