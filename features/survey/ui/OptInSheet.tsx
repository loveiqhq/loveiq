"use client";

import { useId, type FC } from "react";
import { OPT_IN_SHEET_COPY, type OptInSheetDismissVia } from "@features/survey/optInSheet";
import SurveySheetShell, {
  CLOSE_MS,
  OPEN_GUARD_MS,
  SheetButton,
  SheetGrabber,
} from "@features/survey/ui/sheets/SurveySheetShell";

export { CLOSE_MS, OPEN_GUARD_MS };

interface OptInSheetProps {
  open: boolean;
  /** "Yes, I want to keep learning": SurveyEngine switches the answer to Yes and submits. */
  onAccept: () => void;
  /** "Not now": SurveyEngine submits the No. */
  onDecline: () => void;
  /** Closed without a choice (outside, Esc, a swipe down): the reader stays on the question. */
  onDismiss: (via: OptInSheetDismissVia) => void;
}

const CheckIcon: FC = () => (
  <svg
    className="mt-[2px] flex-none"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#2e7d5b"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

/**
 * The "Sure you want to miss out?" sheet over the marketing opt-in (Q16015), Mark's board
 * "Opt-in · B · Sample email sheet on Next" (Claude Design NGyoLVAex5vSW4voVs7Tcc, 10 Nov
 * 2026). Every value below is the board's, drawn at 390 x 844; the frame (scrim, gradient
 * border, grabber, focus, Esc, Tab, swipe, the tap guard) is SurveySheetShell's, shared with
 * the sheets between questions. Its focus goes to the sheet, never to Yes: the Enter that
 * moved the reader on may still be held. Copy and its reasons: features/survey/optInSheet.ts.
 */
const OptInSheet: FC<OptInSheetProps> = ({ open, onAccept, onDecline, onDismiss }) => {
  const titleId = useId();
  const listId = useId();
  const fineId = useId();
  const copy = OPT_IN_SHEET_COPY;
  return (
    <SurveySheetShell
      open={open}
      rootAttributes={{ "data-optin-sheet": true }}
      labelledBy={titleId}
      describedBy={`${listId} ${fineId}`}
      scrimLabel="Back to the question"
      onDismiss={onDismiss}
      panelClassName="gap-[14px]"
    >
      <>
        <SheetGrabber />
        <h2
          id={titleId}
          className="font-serif text-[20px] font-medium leading-[24px] tracking-[-0.2px] text-[#161021]"
        >
          {copy.titleLead}
          {/* The padding, given back by the margin, keeps the italic t inside the gradient. */}
          <span
            className="-mr-[0.06em] pr-[0.06em] font-semibold italic text-transparent"
            style={{
              backgroundImage: "linear-gradient(105deg, #fe6839 0%, #bf66d9 55%, #958ef6 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
            }}
          >
            {copy.titleEmphasis}
          </span>
          {copy.titleEnd}
        </h2>
        <ul id={listId} className="flex flex-col gap-2">
          {copy.benefits.map((benefit) => (
            <li
              key={benefit}
              className="flex items-start gap-[10px] font-sans text-[14px] leading-5 text-[#161021]"
            >
              <CheckIcon />
              <span>{benefit}</span>
            </li>
          ))}
        </ul>
        <p id={fineId} className="font-sans text-[11px] leading-[15px] text-[#6b6678]">
          {copy.finePrintLead}
          <b className="font-bold">{copy.finePrintFigure}</b>
          {copy.finePrintEnd}
        </p>
        <SheetButton
          onPress={onAccept}
          className="flex h-12 w-full items-center justify-center rounded-full font-sans text-[15px] font-bold leading-[normal] text-white shadow-[0_10px_26px_-12px_rgba(191,102,217,0.75)] outline-none focus-visible:ring-2 focus-visible:ring-[#6b5b95]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
          style={{
            backgroundImage: "linear-gradient(135deg, #fe6839 0%, #bf66d9 43%, #958ef6 100%)",
          }}
        >
          {copy.accept}
        </SheetButton>
        {/* A text link on the board (underlined, no box). The padding, given back by the
              margins, makes it easier to tap without moving anything. */}
        <SheetButton
          onPress={onDecline}
          className="-mx-3 -my-1.5 self-center rounded-full px-3 py-1.5 font-sans text-[14px] font-semibold leading-[normal] text-[#4a4558] underline outline-none focus-visible:ring-2 focus-visible:ring-[#6b5b95]/60"
        >
          {copy.decline}
        </SheetButton>
      </>
    </SurveySheetShell>
  );
};

export default OptInSheet;
