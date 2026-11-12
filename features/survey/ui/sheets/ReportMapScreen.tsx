"use client";

import { useId, useRef, type CSSProperties, type FC } from "react";
import { REPORT_MAP_COPY } from "@features/survey/surveySheetsCopy";
import {
  WIZARD_CHAPTER_COUNT,
  WIZARD_DRAWER,
  WIZARD_PART_COUNT,
} from "@features/survey/ui/wizard/wizardContent";
import SurveyNav from "../SurveyNav";
import SurveyProgress from "../SurveyProgress";
import SurveySheetShell, { useSheetPress, type SheetDismissVia } from "./SurveySheetShell";
import { GradientText, order } from "./parts";

/**
 * How each chapter reads on the map in the EUR 1.99 change still to come (Mark's board F2):
 * the Core Archetype free, the welcome and the snapshot of the top archetypes in the Light
 * Report, the opening of four featured chapters with it, the rest in the full report.
 */
type MapRowKind = "free" | "priced" | "featured" | "locked";

const PRICED_ROWS: ReadonlySet<string> = new Set([
  "introduction",
  "what_shaped_this_report",
  "top_archetypes",
]);
const FEATURED_ROWS: ReadonlySet<string> = new Set([
  "typical_beliefs",
  "typical_arousal_accelerators_turn_ons_of_the_core_archetype",
  "challenges_in_partnership",
  "typical_sexual_fantasy_amp_practice_tendencies",
]);

export function mapRowKind(id: string): MapRowKind {
  if (id === "core_archetype") return "free";
  if (PRICED_ROWS.has(id)) return "priced";
  if (FEATURED_ROWS.has(id)) return "featured";
  return "locked";
}

/** The board draws the map at 198px and shows it at 156px. */
const MAP_ZOOM = 0.7872;

const PART_LABEL: CSSProperties = {
  backgroundImage: "linear-gradient(90deg, #dc5a8e, #b46ad6 70%, #a274e8)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
};

const GradientLock: FC<{ size: number; id: string }> = ({ size, id }) => (
  <svg
    className="flex-none"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={`url(#${id})`}
    strokeWidth="2.3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fe6839" />
        <stop offset="0.5" stopColor="#bf66d9" />
        <stop offset="1" stopColor="#958ef6" />
      </linearGradient>
    </defs>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0" />
  </svg>
);

const GreyLock: FC<{ size: number; color?: string; strokeWidth?: number }> = ({
  size,
  color = "#8a8695",
  strokeWidth = 2.2,
}) => (
  <svg
    className="flex-none"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

const Pill: FC<{ kind: "free" | "priced"; children: string; size?: "map" | "legend" }> = ({
  kind,
  children,
  size = "map",
}) => (
  <span
    className={`flex-none whitespace-nowrap rounded-full font-bold ${
      size === "map"
        ? "px-[6px] py-[2px] text-[8px] leading-[11px]"
        : "px-[9px] py-[3px] text-[11px]"
    } ${kind === "free" ? "bg-[#e3f3ea] text-[#2e7d5b]" : "bg-[#f1ebfd] text-[#6b5b95]"}`}
  >
    {children}
  </span>
);

const MapRow: FC<{ id: string; label: string; gradientId: string }> = ({
  id,
  label,
  gradientId,
}) => {
  const kind = mapRowKind(id);
  const base =
    "relative my-[1px] -mr-[1px] flex items-center justify-between gap-[6px] whitespace-nowrap pl-[16.5px] text-[10px] font-normal text-[#3f3a4d]";
  if (kind === "locked") {
    return (
      <div data-map-row={kind} className={`${base} h-[29.22px] pr-[7.8px]`}>
        <span className="min-w-0 truncate">{label}</span>
        <GreyLock size={11} />
      </div>
    );
  }
  const dashed =
    kind === "free"
      ? "rounded-[9px] border-[0.8px] border-dashed border-[#93cdb0] bg-[#f6f1fd]"
      : "rounded-[7px] border-[0.8px] border-dashed border-[#c9b6f2]";
  return (
    <div data-map-row={kind} className={`${base} h-[27.22px] pr-[7px] ${dashed}`}>
      {kind === "free" ? (
        <span
          aria-hidden
          className="absolute left-[6px] top-1/2 -mt-[2px] h-1 w-1 rounded-full bg-[#b48cf0]"
        />
      ) : null}
      <span className="min-w-0 truncate">{label}</span>
      {kind === "free" ? (
        <Pill kind="free">{REPORT_MAP_COPY.free}</Pill>
      ) : kind === "priced" ? (
        <Pill kind="priced">{REPORT_MAP_COPY.price}</Pill>
      ) : (
        <GradientLock size={12} id={gradientId} />
      )}
    </div>
  );
};

/** The survey's own footer, its buttons pressed through the screen's guard. */
const MapFooter: FC<{
  progressIndex: number;
  total: number;
  onNext: () => void;
  onPrevious: () => void;
}> = ({ progressIndex, total, onNext, onPrevious }) => {
  const press = useSheetPress();
  return (
    <div className="flex-none bg-white">
      <SurveyNav
        canGoBack
        canGoNext
        hasAnswer
        onPrevious={() => press(onPrevious)}
        onNext={() => press(onNext)}
        progress={<SurveyProgress index={progressIndex} total={total} />}
      />
    </div>
  );
};

interface ReportMapScreenProps {
  open: boolean;
  /** How many questions are left after the one on screen (3). */
  left: number;
  /** The question on screen, for the progress strip. */
  progressIndex: number;
  total: number;
  /** Next: on to the next question. */
  onNext: () => void;
  /** Previous, or Esc: back to the question on screen. */
  onPrevious: () => void;
  onDismiss: (via: SheetDismissVia) => void;
}

/**
 * Sheet 6, when three questions are left: what the report holds (Mark's board "Explain · F2 ·
 * How to read your report", before the name and the email). A full screen with Previous and
 * Next, as the board draws it. Its moment: the map builds part by part, then the legend.
 */
const ReportMapScreen: FC<ReportMapScreenProps> = ({
  open,
  left,
  progressIndex,
  total,
  onNext,
  onPrevious,
  onDismiss,
}) => {
  const titleId = useId();
  // An id SVG's url(#…) can point at: useId's own characters are not all safe there.
  const gradientBase = `map${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const copy = REPORT_MAP_COPY;
  return (
    <SurveySheetShell
      open={open}
      layout="screen"
      rootAttributes={{ "data-survey-sheet": "reportMap" }}
      labelledBy={titleId}
      initialFocusRef={headingRef}
      scrimLabel={copy.previous}
      onDismiss={onDismiss}
      exitOnClose
      noSwipe
    >
      <div className="min-h-0 flex-1 overflow-y-auto" data-lenis-prevent>
        <div className="flex flex-col gap-2 px-5 pt-[76px]">
          <h1
            id={titleId}
            ref={headingRef}
            tabIndex={-1}
            className="sheet-in m-0 font-serif text-[24px] font-medium leading-[1.2] text-[#161021] outline-none"
            style={order(0)}
          >
            {copy.titleLead}
            <GradientText inkAt={450}>{copy.titleEmphasis(left)}</GradientText>
            {copy.titleMid}
            <GradientText inkAt={520}>{copy.titleEnd}</GradientText>
          </h1>
        </div>
        <div className="mb-3 mt-[10px] flex items-center gap-4 px-5">
          <div className="flex-none" style={{ zoom: MAP_ZOOM }}>
            <div className="relative box-border w-[198px] overflow-hidden rounded-[20px] border-[1.5px] border-solid border-[#e0d7fe] bg-white py-[13px] pl-[10.5px] pr-[10px] shadow-[0_10px_44px_rgba(22,16,33,0.28)]">
              {WIZARD_DRAWER.map((part, i) => (
                <div key={part.part} className="sheet-in" style={order(1 + i)}>
                  <div
                    className={`mb-[2.3px] w-fit max-w-[156px] text-[7.5px] font-bold uppercase leading-[13px] tracking-[0.13em] text-transparent ${
                      i === 0 ? "" : "mt-[12.9px]"
                    }`}
                    style={PART_LABEL}
                  >
                    {`${part.part} · ${part.label}`}
                  </div>
                  {part.rows.map((row) => (
                    <MapRow
                      key={row.id}
                      id={row.id}
                      label={row.label}
                      gradientId={`${gradientBase}-${row.id}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-5 font-sans">
            <div className="sheet-in font-serif text-[#161021]" style={order(8)}>
              <div className="text-[26px] font-medium leading-[30px]">
                {copy.parts(WIZARD_PART_COUNT)}
              </div>
              <div className="text-[19px] leading-6">{copy.chapters(WIZARD_CHAPTER_COUNT)}</div>
            </div>
            <div className="sheet-in flex flex-col gap-[6px]" style={order(9.2)}>
              <span className="self-start">
                <Pill kind="free" size="legend">
                  {copy.free}
                </Pill>
              </span>
              <p className="m-0 text-[13px] leading-[19px] text-[#4a4558]">
                {copy.freeLead}
                <b className="font-bold text-[#161021]">{copy.freeEmphasis}</b>
                {copy.freeEnd}
              </p>
            </div>
            <div className="sheet-in flex flex-col gap-[6px]" style={order(10.4)}>
              <span className="flex items-center gap-2">
                <Pill kind="priced" size="legend">
                  {copy.price}
                </Pill>
                <GradientLock size={18} id={`${gradientBase}-legend`} />
              </span>
              <p className="m-0 text-[13px] leading-[19px] text-[#4a4558]">
                {copy.lightLead}
                <b className="font-bold text-[#161021]">{copy.lightEmphasis}</b>
                {copy.lightMid}
                <b className="font-bold text-[#161021]">{copy.lightFeatured}</b>
                {copy.lightEnd}
              </p>
            </div>
            <div className="sheet-in flex flex-col gap-[6px]" style={order(11.6)}>
              <GreyLock size={18} color="#6b6678" strokeWidth={2} />
              <p className="m-0 text-[13px] leading-[19px] text-[#4a4558]">
                {copy.fullLead}
                <b className="font-bold text-[#161021]">{copy.fullEmphasis}</b>
                {copy.fullEnd}
              </p>
            </div>
          </div>
        </div>
      </div>
      <MapFooter
        progressIndex={progressIndex}
        total={total}
        onNext={onNext}
        onPrevious={onPrevious}
      />
    </SurveySheetShell>
  );
};

export default ReportMapScreen;
