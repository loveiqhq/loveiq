"use client";

import type { FC } from "react";
import { surveySheetDef, type SurveySheetId } from "@features/survey/surveySheets";
import {
  DesireSheet,
  ExpertSheet,
  HalfwaySheet,
  ScienceSheet,
  TrustpilotSheet,
} from "./InfoSheets";
import ReportMapScreen from "./ReportMapScreen";
import type { SheetDismissVia } from "./SurveySheetShell";

interface SurveySheetHostProps {
  /** The sheets this visit may show (their switches, or a staging preview). */
  enabled: readonly SurveySheetId[];
  /** The one open now, if any. */
  open: SurveySheetId | null;
  /** Minutes left after the question on screen, as the progress strip counts them. */
  minutesLeft: number;
  /** The question on screen, for the map's progress strip. */
  progressIndex: number;
  total: number;
  onKeepGoing: (extra?: { ticked?: boolean }) => void;
  onDismiss: (via: SheetDismissVia) => void;
  /** The map's Previous (and its Esc): back to the question on screen. */
  onMapPrevious: () => void;
}

const reportMapLeft = (() => {
  const p = surveySheetDef("reportMap").placement;
  return p.kind === "remaining" ? p.left : 3;
})();

/**
 * Every sheet this visit may show, each drawn only while open (and while it slides away), so
 * closing one can play over the next question. SurveyEngine decides which is open.
 */
const SurveySheetHost: FC<SurveySheetHostProps> = ({
  enabled,
  open,
  minutesLeft,
  progressIndex,
  total,
  onKeepGoing,
  onDismiss,
  onMapPrevious,
}) => {
  const handlers = { onKeepGoing, onDismiss };
  return (
    <>
      {enabled.map((id) => {
        const isOpen = open === id;
        switch (id) {
          case "science":
            return <ScienceSheet key={id} open={isOpen} {...handlers} />;
          case "trustpilot":
            return <TrustpilotSheet key={id} open={isOpen} {...handlers} />;
          case "expert":
            return <ExpertSheet key={id} open={isOpen} {...handlers} />;
          case "halfway":
            return <HalfwaySheet key={id} open={isOpen} minutesLeft={minutesLeft} {...handlers} />;
          case "desire":
            return <DesireSheet key={id} open={isOpen} {...handlers} />;
          case "reportMap":
            return (
              <ReportMapScreen
                key={id}
                open={isOpen}
                left={reportMapLeft}
                progressIndex={progressIndex}
                total={total}
                onNext={() => onKeepGoing()}
                onPrevious={onMapPrevious}
                onDismiss={() => onMapPrevious()}
              />
            );
          default:
            return null;
        }
      })}
    </>
  );
};

export default SurveySheetHost;
