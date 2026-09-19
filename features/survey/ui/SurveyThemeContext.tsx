"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { SurveyVariant } from "@shared/experiments/surveyVariant";

/**
 * Survey theme. Provided around the survey QUESTION screens only (see
 * SurveyEngine); intro/consent/pre-report wizard are never wrapped, so they stay
 * dark.
 *
 * The default is "white", matching what every visitor now gets since the theme
 * test concluded (2026-08-25). It used to be "dark", which meant a consumer
 * rendered outside the provider silently fell back to the losing arm's styling —
 * a mismatch that would now show up as a dark control on an otherwise white
 * screen rather than as anything anyone would notice in review.
 */
const SurveyThemeContext = createContext<SurveyVariant>("white");

export function SurveyThemeProvider({
  variant,
  children,
}: {
  variant: SurveyVariant;
  children: ReactNode;
}) {
  return <SurveyThemeContext.Provider value={variant}>{children}</SurveyThemeContext.Provider>;
}

/** Returns the active survey theme: "white" or "dark". */
export function useSurveyTheme(): SurveyVariant {
  return useContext(SurveyThemeContext);
}
