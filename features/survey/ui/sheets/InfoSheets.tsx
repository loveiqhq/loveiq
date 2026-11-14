"use client";

import { useId, useRef, useState, type FC, type ReactNode, type RefObject } from "react";
import Image from "next/image";
import type { SurveySheetId } from "@features/survey/surveySheets";
import {
  DESIRE_SHEET_COPY,
  EXPERT_SHEET_COPY,
  HALFWAY_SHEET_COPY,
  SCIENCE_SHEET_COPY,
  TRUSTPILOT_SHEET_COPY,
} from "@features/survey/surveySheetsCopy";
import {
  getTrustpilotConfig,
  isTrustpilotEnabled,
  TRUSTPILOT_FALLBACK_URL,
} from "@shared/ui/trustpilot/config";
import { trustpilotLabel } from "@shared/ui/trustpilot/label";
import SurveySheetShell, { SheetGrabber, type SheetDismissVia } from "./SurveySheetShell";
import {
  COUNT_AT_MS,
  COUNT_MS,
  CountUpPercent,
  delay,
  GradientText,
  IconTile,
  KeepGoingButton,
  order,
} from "./parts";

/** What the engine gives every information sheet. */
export interface InfoSheetHandlers {
  /** "Keep going". The State of Desire sheet says whether its box was ticked. */
  onKeepGoing: (extra?: { ticked?: boolean }) => void;
  /** Closed without the button: the scrim, Esc or a swipe down. Same as Keep going. */
  onDismiss: (via: SheetDismissVia) => void;
}

interface InfoSheetFrameProps extends InfoSheetHandlers {
  open: boolean;
  sheetId: SurveySheetId;
  titleId: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
  /** Overrides Keep going's action (the State of Desire sheet passes its tick). */
  keepGoing?: () => void;
  keepGoingClassName?: string;
  children: ReactNode;
}

/**
 * The frame of a sheet between questions: the shared shell, the grabber, the sheet's own
 * content and "Keep going". Focus goes to the heading, so a screen reader starts with what
 * the sheet says. Tapping outside, Esc or a swipe down carry on as Keep going does: these
 * sheets ask nothing. Closing, it slides away over whatever comes next.
 */
const InfoSheetFrame: FC<InfoSheetFrameProps> = ({
  open,
  sheetId,
  titleId,
  headingRef,
  onKeepGoing,
  onDismiss,
  keepGoing,
  keepGoingClassName,
  children,
}) => (
  <SurveySheetShell
    open={open}
    rootAttributes={{ "data-survey-sheet": sheetId }}
    labelledBy={titleId}
    initialFocusRef={headingRef}
    scrimLabel="Continue the survey"
    onDismiss={onDismiss}
    exitOnClose
    panelClassName="gap-[14px]"
  >
    <SheetGrabber />
    {children}
    <KeepGoingButton className={keepGoingClassName} onPress={keepGoing ?? (() => onKeepGoing())} />
  </SurveySheetShell>
);

const HEADING_FOCUS = "outline-none";

const FlaskIcon: FC = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M9 3h6" />
    <path d="M10 3v6L4.5 18.5A2 2 0 0 0 6.2 21.5h11.6a2 2 0 0 0 1.7-3L14 9V3" />
    <path d="M7 15h10" />
  </svg>
);

/**
 * Sheet 1, after 02004: one message for every reader (Mark's board), the share counting up
 * slowly (Mark's "the 37% counting up") and "respond" turning to the gradient. The share it
 * is set against counts up too, at the same speed, starting once the first is halfway
 * (Mark's second review, 13 Nov: "after the 36% is half way or fully done").
 */
const CONTRAST_AT_MS = COUNT_AT_MS + COUNT_MS / 2;

export const ScienceSheet: FC<InfoSheetHandlers & { open: boolean }> = ({ open, ...handlers }) => {
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const v = SCIENCE_SHEET_COPY;
  return (
    <InfoSheetFrame
      open={open}
      sheetId="science"
      titleId={titleId}
      headingRef={headingRef}
      {...handlers}
    >
      <div className="sheet-in flex items-center gap-[10px]" style={order(0)}>
        <IconTile>
          <FlaskIcon />
        </IconTile>
        <h2
          id={titleId}
          ref={headingRef}
          tabIndex={-1}
          className={`font-serif text-[20px] font-medium leading-[1.2] tracking-[-0.2px] text-[#161021] [text-wrap:balance] ${HEADING_FOCUS}`}
        >
          {v.headLead}
          <GradientText inkAt={450}>{v.headEmphasis}</GradientText>
          {v.headEnd}
        </h2>
      </div>
      <p className="sheet-in font-serif text-[19px] leading-[26px] text-[#161021]" style={order(1)}>
        <CountUpPercent value={v.share} />
        {v.statText}
        <CountUpPercent value={v.contrastShare} at={CONTRAST_AT_MS} />
        {v.contrastText}
      </p>
    </InfoSheetFrame>
  );
};

/** Trustpilot's green and its star (shared/ui/trustpilot/TrustpilotReviews.tsx). */
const TP_GREEN = "#00b67a";
const TP_STAR =
  "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z";

const TrustpilotMark: FC = () => (
  <span className="inline-flex items-center gap-1.5" aria-hidden="true">
    <svg viewBox="0 0 24 24" width="20" height="20" fill={TP_GREEN} focusable="false">
      <path d={TP_STAR} />
    </svg>
    <span className="font-sans text-[17px] font-semibold tracking-tight text-[#161021]">
      Trustpilot
    </span>
  </span>
);

/**
 * Trustpilot's stars as Trustpilot draws them: green tiles, in half-star steps (a 4.4
 * TrustScore shows four and a half). Their shape, colours and fill never change and never
 * count up (Trustpilot's brand rules); on the sheet they only arrive one after another, from
 * `at` ms, 110ms apart (Mark's review, 12 Nov: "animate the Excellent and the stars").
 */
const STAR_STEP_MS = 110;

const TrustpilotStars: FC<{ score: number; at?: number }> = ({ score, at }) => {
  const stars = Math.round(score * 2) / 2;
  return (
    <span className="flex gap-[3px]" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, stars - i));
        return (
          <span
            key={i}
            data-tp-star
            className={`flex h-[22px] w-[22px] items-center justify-center rounded-[3px] ${
              at === undefined ? "" : "sheet-star"
            }`}
            style={{
              ...(at === undefined ? {} : delay(at + i * STAR_STEP_MS)),
              background:
                fill >= 1
                  ? TP_GREEN
                  : fill <= 0
                    ? "#dcdce6"
                    : `linear-gradient(90deg, ${TP_GREEN} ${fill * 100}%, #dcdce6 ${fill * 100}%)`,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#ffffff" focusable="false">
              <path d={TP_STAR} />
            </svg>
          </span>
        );
      })}
    </span>
  );
};

/**
 * Whether the Trustpilot sheet can show: the site's Trustpilot switch on and both numbers
 * configured (shared/ui/trustpilot/config.ts), the rule every Trustpilot card here follows;
 * never typed in. SurveyEngine asks first, so it never holds a move for a sheet that would
 * draw nothing.
 */
export function trustpilotSheetReady(): boolean {
  if (!isTrustpilotEnabled()) return false;
  const config = getTrustpilotConfig();
  return !!config.score && !!config.reviewCount && Number.isFinite(Number.parseFloat(config.score));
}

/** Sheet 2, after 03008: the TrustScore and one real review. */
export const TrustpilotSheet: FC<InfoSheetHandlers & { open: boolean }> = ({
  open,
  ...handlers
}) => {
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  if (!trustpilotSheetReady()) return null;
  const config = getTrustpilotConfig();
  const score = Number.parseFloat(config.score ?? "");
  if (!config.score || !config.reviewCount) return null;
  const copy = TRUSTPILOT_SHEET_COPY;
  return (
    <InfoSheetFrame
      open={open}
      sheetId="trustpilot"
      titleId={titleId}
      headingRef={headingRef}
      {...handlers}
    >
      <div className="flex flex-col items-start gap-[10px] px-4 pb-4 pt-[2px]">
        <div className="sheet-in flex flex-col items-start gap-[10px]" style={order(0)}>
          <TrustpilotMark />
          <h2
            id={titleId}
            ref={headingRef}
            tabIndex={-1}
            className={`flex items-baseline gap-2 ${HEADING_FOCUS}`}
          >
            <span
              className="sheet-star font-serif text-[26px] font-semibold leading-[30px] text-[#161021]"
              style={delay(240)}
            >
              {trustpilotLabel(score)}
            </span>
            <span className="font-sans text-[14px] font-normal text-[#4a4558]">
              {copy.scoreLead}
              <b className="text-[#161021]">{config.score}</b>
              {copy.outOf}
            </span>
          </h2>
          <span className="flex items-center gap-2">
            <TrustpilotStars score={score} at={420} />
            <span className="font-sans text-[12px] text-[#6b6678]">
              {copy.reviews(config.reviewCount)}
            </span>
          </span>
        </div>
        <div className="sheet-in flex flex-col self-stretch" style={order(17)}>
          <div aria-hidden className="sheet-grow-x h-px w-full bg-[#efedf2]" style={delay(1000)} />
          <blockquote className="pt-3 font-serif text-[18px] leading-[23px] text-[#161021]">
            {`“${copy.quote}”`}
          </blockquote>
          <a
            href={copy.reviewUrl || config.profileUrl || TRUSTPILOT_FALLBACK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 self-start font-sans text-[12px] text-[#6b6678] underline-offset-2 hover:underline"
          >
            {`${copy.author} · Trustpilot review, ${copy.date}`}
          </a>
        </div>
      </div>
    </InfoSheetFrame>
  );
};

/**
 * Sheet 3, before 01005: an expert's words, the phrase that matters turning to the gradient.
 * Mark's second review (13 Nov): "no need for an animation of the image… make the entire card
 * slide up slower". Nothing inside moves; the card arrives as one piece, more slowly
 * (sheets-motion.css), and the phrase turns once it has landed.
 */
export const ExpertSheet: FC<InfoSheetHandlers & { open: boolean }> = ({ open, ...handlers }) => {
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const copy = EXPERT_SHEET_COPY;
  return (
    <InfoSheetFrame
      open={open}
      sheetId="expert"
      titleId={titleId}
      headingRef={headingRef}
      {...handlers}
    >
      <div className="flex flex-col gap-[14px]">
        <div className="flex items-center gap-[14px]">
          <div
            className="h-16 w-16 flex-none rounded-full border-[2.5px] border-solid border-transparent p-[3px]"
            style={{
              background:
                "linear-gradient(#ffffff, #ffffff) padding-box, linear-gradient(135deg, #fe6839 0%, #bf66d9 50%, #958ef6 100%) border-box",
            }}
          >
            <Image
              src={copy.photo}
              alt=""
              width={53}
              height={53}
              className="h-full w-full rounded-full bg-[#f4effd] object-cover"
            />
          </div>
          <div className="flex min-w-0 flex-col gap-[2px] font-sans">
            <h2
              id={titleId}
              ref={headingRef}
              tabIndex={-1}
              className={`text-[15px] font-bold leading-5 text-[#161021] ${HEADING_FOCUS}`}
            >
              {copy.name}
            </h2>
            <p className="text-[13px] leading-[18px] text-[#4a4558]">{copy.discipline}</p>
            <p className="text-[12px] leading-4 text-[#6b6678]">{copy.affiliation}</p>
          </div>
        </div>
        <blockquote className="pl-[14px] font-serif text-[18px] leading-[26px] text-[#161021]">
          {/* No rule beside the quote (Mark's review, 12 Nov); the board keeps its 14px indent. */}
          {"“"}
          {copy.quoteLead}
          {/* Once the card has landed (0.75s, sheets-motion.css). */}
          <GradientText inkAt={800}>{copy.quoteEmphasis}</GradientText>
          {copy.quoteEnd}
          {"”"}
        </blockquote>
      </div>
    </InfoSheetFrame>
  );
};

const StepMarker: FC<{ n: number; color: string }> = ({ n, color }) => (
  <div
    className="flex h-8 w-8 flex-none items-center justify-center rounded-full border-2 border-solid bg-white font-serif text-[15px] font-semibold"
    style={{ borderColor: color, color }}
  >
    {n}
  </div>
);

const LockIcon: FC = () => (
  <svg
    width="11.5"
    height="13.7"
    viewBox="4.1 3.1 15.8 18.8"
    fill="none"
    stroke="#3a2a55"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

/** When each halfway step arrives (Mark's review, 12 Nov: "maybe the steps show up one after the other?"). */
const STEP_AT_MS = [320, 640, 960] as const;

/**
 * Sheet 4, after 11003: halfway. Mark's revised board (12 Nov): no tick beside the heading,
 * step headlines top-aligned with their markers, more room between the steps and the pills a
 * little further right. Its moment: the three steps arrive one after another, each connector
 * growing once its step has landed, then the Free pill settles.
 */
export const HalfwaySheet: FC<InfoSheetHandlers & { open: boolean; minutesLeft: number }> = ({
  open,
  minutesLeft,
  ...handlers
}) => {
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const copy = HALFWAY_SHEET_COPY;
  return (
    <InfoSheetFrame
      open={open}
      sheetId="halfway"
      titleId={titleId}
      headingRef={headingRef}
      keepGoingClassName="mt-4"
      {...handlers}
    >
      <h2
        id={titleId}
        ref={headingRef}
        tabIndex={-1}
        className={`sheet-in mb-2 min-h-[53px] font-serif text-[22px] font-medium leading-[1.2] text-[#161021] [text-wrap:balance] ${HEADING_FOCUS}`}
        style={order(0)}
      >
        {copy.titleLead}
        <GradientText inkAt={500}>{copy.titleEmphasis}</GradientText>
        {copy.titleEnd}
      </h2>
      <div className="flex flex-col font-sans">
        <div data-halfway-step className="sheet-step flex gap-[14px]" style={delay(STEP_AT_MS[0])}>
          <div className="flex flex-col items-center">
            <StepMarker n={1} color="#6b5b95" />
            <div
              aria-hidden
              className="sheet-grow-y w-[2px] flex-1 bg-[#e6e3eb]"
              style={delay(STEP_AT_MS[0] + 260)}
            />
          </div>
          <div className="flex flex-col gap-[3px] pb-[22px]">
            <div className="text-[15px] font-bold leading-5 text-[#161021]">{copy.finishTitle}</div>
            <div className="text-[14px] leading-[21px] text-[#4a4558]">
              {copy.finishBody(minutesLeft)}
            </div>
          </div>
        </div>
        <div
          data-halfway-step
          className="sheet-step -mx-3 mb-[22px] flex gap-[14px] rounded-[16px] bg-[#eaf6ef] p-3 shadow-[inset_0_0_0_1px_#cfe8da]"
          style={delay(STEP_AT_MS[1])}
        >
          <div className="flex flex-col items-center">
            <StepMarker n={2} color="#2e7d5b" />
            <div
              aria-hidden
              className="sheet-grow-y -mb-[34px] w-[2px] flex-1 bg-[#e6e3eb]"
              style={delay(STEP_AT_MS[1] + 260)}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <div className="text-[15px] font-bold leading-5 text-[#161021]">
              {copy.archetypeTitle}
            </div>
            <div className="text-[14px] leading-[21px] text-[#4a4558]">{copy.archetypeBody}</div>
          </div>
          <span
            className="sheet-settle -mr-[6px] flex-shrink-0 self-start whitespace-nowrap rounded-full bg-white px-[10px] py-1 text-[12px] font-bold leading-4 text-[#2e7d5b]"
            style={delay(STEP_AT_MS[1] + 300)}
          >
            {copy.free}
          </span>
        </div>
        <div data-halfway-step className="sheet-step flex gap-[14px]" style={delay(STEP_AT_MS[2])}>
          <IconTile label={copy.lockedLabel}>
            <LockIcon />
          </IconTile>
          <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <div className="text-[15px] font-bold leading-5 text-[#161021]">
              {copy.lightTitle}
              <span className="mt-[1px] block text-[12px] leading-4 text-[#2e7d5b]">
                {copy.lightGuarantee}
              </span>
            </div>
            <p className="m-0 text-[14px] leading-[21px] text-[#4a4558]">{copy.lightBody}</p>
          </div>
          <span className="-mr-[6px] flex-shrink-0 self-start whitespace-nowrap rounded-full bg-[#f4f2f7] px-[10px] py-1 text-[12px] font-bold leading-4 text-[#4a4558]">
            {copy.optional}
          </span>
        </div>
      </div>
    </InfoSheetFrame>
  );
};

/** The State of Desire 2026 cover, drawn at 360 x 504 and shown at 64 x 90, as on the board. */
const DesireCover: FC = () => {
  const c = DESIRE_SHEET_COPY.cover;
  return (
    <div
      role="img"
      aria-label={DESIRE_SHEET_COPY.coverLabel}
      className="sheet-rise relative h-[90px] w-16 flex-none overflow-hidden rounded-[4px] shadow-[0_10px_18px_-10px_rgba(107,91,149,0.65)]"
      style={delay(250)}
    >
      <div
        aria-hidden
        className="absolute left-0 top-0 box-border h-[504px] w-[360px] origin-top-left overflow-hidden font-sans text-white"
        style={{
          transform: "scale(0.17778)",
          background: "linear-gradient(135deg, #fe6839 0%, #bf66d9 50%, #958ef6 100%)",
          boxShadow: "inset -1px 0 0 rgba(255,255,255,0.4)",
        }}
      >
        <div
          className="absolute bottom-0 left-0 top-0 w-4"
          style={{
            background: "linear-gradient(90deg, rgba(22,16,33,0.22), rgba(22,16,33,0.04))",
            boxShadow: "inset -1px 0 0 rgba(255,255,255,0.35)",
          }}
        />
        <div
          className="absolute bottom-0 right-0 top-0 w-[7px]"
          style={{
            background:
              "repeating-linear-gradient(90deg, rgba(255,255,255,0.85) 0 1px, rgba(255,255,255,0.25) 1px 2px)",
          }}
        />
        <div className="absolute inset-0 flex flex-col pb-[26px] pl-10 pr-[30px] pt-7">
          <div className="whitespace-nowrap text-[10.5px] font-bold tracking-[0.16em]">
            {c.kicker}
            <div className="mt-[6px] opacity-80">{c.month}</div>
          </div>
          <div className="mt-auto font-serif text-[52px] font-medium leading-[56px] tracking-[-0.5px]">
            {c.titleTop}
            <br />
            <span className="italic">{c.titleItalic}</span>
          </div>
          <div className="mt-3 text-[14px] leading-[21px] text-white/90">{c.blurb}</div>
          <div className="mt-4 whitespace-nowrap border-t border-white/40 pt-3 text-[11px] font-semibold tracking-[0.01em] text-white/90">
            {c.meta}
          </div>
          <div className="mt-[18px] font-serif text-[18px] font-bold">{c.brand}</div>
        </div>
      </div>
    </div>
  );
};

/**
 * Sheet 5, after 16005: a finding from the State of Desire study and the report. Its box
 * starts unticked (a ticked box is not consent: GDPR recital 32). Keep going says whether it
 * was ticked, to PostHog, and a tick is kept for the run and sent with the answers, whose
 * #incoming-surveys message says who asked for the study (Mark, 13 Nov: "just record the
 * tick for now"; he sends it by hand). Prices never move.
 */
export const DesireSheet: FC<InfoSheetHandlers & { open: boolean }> = ({ open, ...handlers }) => {
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const tickId = useId();
  const [ticked, setTicked] = useState(false);
  const copy = DESIRE_SHEET_COPY;
  return (
    <InfoSheetFrame
      open={open}
      sheetId="desire"
      titleId={titleId}
      headingRef={headingRef}
      keepGoing={() => handlers.onKeepGoing({ ticked })}
      {...handlers}
    >
      <div className="sheet-in flex flex-col gap-1" style={order(0)}>
        <div className="font-sans text-[13px] font-semibold leading-[18px] text-[#6b5b95]">
          {copy.eyebrow}
        </div>
        <h2
          id={titleId}
          ref={headingRef}
          tabIndex={-1}
          className={`font-serif text-[19px] font-normal leading-[26px] text-[#161021] ${HEADING_FOCUS}`}
        >
          <GradientText>{copy.statLead}</GradientText>
          <CountUpPercent value={copy.statShare} at={500} />
          {copy.statEnd}
        </h2>
      </div>
      <div
        className="sheet-in flex flex-col gap-[14px] rounded-[16px] border border-solid border-[#e9e6ee] bg-white p-[14px]"
        style={order(1)}
      >
        <div className="flex items-center gap-[14px]">
          <DesireCover />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-start justify-between gap-[10px]">
              <div className="font-serif text-[18px] font-medium leading-[23px] text-[#161021]">
                {copy.titleLead}
                <GradientText italic>{copy.titleEmphasis}</GradientText>
                {copy.titleEnd}
              </div>
              <span className="flex-shrink-0 whitespace-nowrap rounded-full bg-[#f4effd] px-[10px] py-1 font-sans text-[12px] font-bold leading-4 text-[#6b5b95]">
                {copy.price}
              </span>
            </div>
            <div className="font-sans text-[13px] leading-[19px] text-[#4a4558]">
              {copy.participants}
            </div>
          </div>
        </div>
        <label
          htmlFor={tickId}
          className="flex cursor-pointer items-start gap-[10px] border-t border-solid border-[#efedf2] pt-3"
        >
          <input
            id={tickId}
            type="checkbox"
            checked={ticked}
            onChange={(e) => setTicked(e.target.checked)}
            className="peer sr-only"
          />
          <span
            aria-hidden
            className={`mt-[1px] flex h-5 w-5 flex-none items-center justify-center rounded-[6px] peer-focus-visible:ring-2 peer-focus-visible:ring-[#6b5b95]/60 peer-focus-visible:ring-offset-2 ${
              ticked
                ? "sheet-tick-fill bg-[#6b5b95]"
                : "border-[1.5px] border-solid border-[#c4bfd1] bg-white"
            }`}
          >
            {ticked ? (
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#ffffff"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                focusable="false"
              >
                <path d="M4 12.5l5 5L20 6.5" pathLength={1} className="sheet-draw" />
              </svg>
            ) : null}
          </span>
          <span className="font-sans text-[14px] leading-[21px] text-[#3f3a4d]">
            {copy.tickLead}
            <b className="font-extrabold text-[#2e7d5b]">{copy.tickEmphasis}</b>
            {copy.tickEnd}
          </span>
        </label>
      </div>
    </InfoSheetFrame>
  );
};
