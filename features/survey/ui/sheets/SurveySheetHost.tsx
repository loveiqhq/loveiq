"use client";

import type { FC } from "react";
import type { LightMapOffer } from "@features/report/logic/lightReportMap";
import type { SurveySheetId } from "@features/survey/surveySheets";
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
  /**
   * Which EUR 1.99 page follows this run, in Mark's 50/50: his new one (`light`) or today's
   * (`price`). The halfway sheet and the map tell the offer in its words.
   */
  offer: LightMapOffer;
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

/**
 * Every sheet this visit may show, each drawn only while open (and while it slides away), so
 * closing one can play over the next question. SurveyEngine decides which is open.
 */
const SurveySheetHost: FC<SurveySheetHostProps> = ({
  enabled,
  open,
  offer,
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
            return (
              <HalfwaySheet
                key={id}
                open={isOpen}
                minutesLeft={minutesLeft}
                offer={offer}
                {...handlers}
              />
            );
          case "desire":
            return <DesireSheet key={id} open={isOpen} {...handlers} />;
          case "reportMap":
            return (
              <ReportMapScreen
                key={id}
                open={isOpen}
                offer={offer}
                // The screens after the one it opens over: 3 in the classic survey, where it opens
                // when three are left; 2 in Survey 2.0, after 17002 (17003, then the details page).
                left={Math.max(1, total - 1 - progressIndex)}
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
