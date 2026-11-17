"use client";

import { useId, useRef, type CSSProperties, type FC } from "react";
import { lightMapRowKind, type LightMapOffer } from "@features/report/logic/lightReportMap";
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
 * How each chapter reads on the map in the EUR 1.99 Light Report offer (Mark's board F2): one
 * list with the pre-report wizard's map and the report's own menu (lightReportMap.ts).
 */
export const mapRowKind = lightMapRowKind;

/**
 * The board draws the map at 198px and shows it at 156px on a phone. From 640px it is drawn
 * larger, 238px (Mark's review, 12 Nov: "I can hardly read the chapter overview… Can we make
 * that bigger? Maybe the user might even have to scroll"): the screen's body scrolls.
 */
const MAP_ZOOM_CLASS = "[zoom:0.7872] sm:[zoom:1.2]";

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

/** The green tick before each reason in today's page's legend (Mark's board, 16 Nov). */
const CheckDot: FC = () => (
  <span
    aria-hidden
    className="flex h-4 w-4 flex-none items-center justify-center rounded-full bg-[#e8f4ee]"
  >
    <svg
      width="9"
      height="9"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#2e7d5b"
      strokeWidth="3.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
    >
      <path d="M4 12.5l5 5L20 6.5" />
    </svg>
  </span>
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

const CORE_ARCHETYPE_ROW = "core_archetype";

const MapRow: FC<{ id: string; label: string; gradientId: string; offer: LightMapOffer }> = ({
  id,
  label,
  gradientId,
  offer,
}) => {
  const kind = mapRowKind(id, offer);
  const base =
    "relative my-[1px] -mr-[1px] flex items-center justify-between gap-[6px] whitespace-nowrap pl-[16.5px] text-[10px] font-normal text-[#3f3a4d]";
  if (kind === "locked") {
    return (
      <div data-map-row={kind} data-map-row-id={id} className={`${base} h-[29.22px] pr-[7.8px]`}>
        <span className="min-w-0 truncate">{label}</span>
        <GreyLock size={11} />
      </div>
    );
  }
  // The Core Archetype keeps its tinted row and dot in both halves of Mark's 50/50; before
  // today's page its dashes turn the EUR 1.99's violet (his board, 16 Nov).
  const core = id === CORE_ARCHETYPE_ROW;
  const dashed = core
    ? `rounded-[9px] border-[0.8px] border-dashed bg-[#f6f1fd] ${
        kind === "free" ? "border-[#93cdb0]" : "border-[#c9b6f2]"
      }`
    : "rounded-[7px] border-[0.8px] border-dashed border-[#c9b6f2]";
  return (
    <div
      data-map-row={kind}
      data-map-row-id={id}
      className={`${base} h-[27.22px] pr-[7px] ${dashed}`}
    >
      {core ? (
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
  /**
   * Which EUR 1.99 page follows (Mark's 50/50, 16 Nov): his new one (`light`, the Core
   * Archetype free) or today's (`price`, the Core Archetype in the EUR 1.99).
   */
  offer: LightMapOffer;
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
  offer,
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
            {/* On a desktop "This is waiting:" starts its own line (Mark's review, 12 Nov). */}
            <br aria-hidden className="hidden sm:inline" />
            <GradientText inkAt={520}>{copy.titleEnd}</GradientText>
          </h1>
        </div>
        <div className="mb-3 mt-[10px] flex items-center gap-4 px-5 sm:items-start sm:gap-8">
          <div data-report-map className={`flex-none ${MAP_ZOOM_CLASS}`}>
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
                      offer={offer}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-5 font-sans sm:sticky sm:top-6">
            <div className="sheet-in font-serif text-[#161021]" style={order(8)}>
              <div className="text-[26px] font-medium leading-[30px]">
                {copy.parts(WIZARD_PART_COUNT)}
              </div>
              <div className="text-[19px] leading-6">{copy.chapters(WIZARD_CHAPTER_COUNT)}</div>
            </div>
            {offer === "light" ? (
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
            ) : null}
            <div className="sheet-in flex flex-col gap-[6px]" style={order(10.4)}>
              <span className="flex items-center gap-2">
                <Pill kind="priced" size="legend">
                  {copy.price}
                </Pill>
                <GradientLock size={18} id={`${gradientBase}-legend`} />
              </span>
              {offer === "light" ? (
                <p className="m-0 text-[13px] leading-[19px] text-[#4a4558]">
                  {copy.lightLead}
                  <b className="font-bold text-[#161021]">{copy.lightEmphasis}</b>
                  <br />
                  {copy.lightMid}
                  <b className="font-bold text-[#161021]">{copy.lightFeatured}</b>
                  {copy.lightEnd}
                </p>
              ) : (
                <>
                  <p className="m-0 text-[13px] leading-[19px] text-[#4a4558]">
                    {copy.priceLead}
                    <b className="font-bold text-[#161021]">{copy.priceEmphasis}</b>
                    {copy.priceMid}
                    <b className="font-bold text-[#161021]">{copy.priceFeatured}</b>
                    {copy.priceEnd}
                  </p>
                  <ul className="m-0 mt-2 flex list-none flex-col gap-[6px] p-0">
                    {copy.priceReasons.map((reason) => (
                      <li
                        key={reason}
                        className="flex items-start gap-[7px] text-[12px] leading-4 text-[#3f3a4d]"
                      >
                        <CheckDot />
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
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
