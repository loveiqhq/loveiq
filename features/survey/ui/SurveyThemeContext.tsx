"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { SurveyVariant } from "@shared/experiments/surveyVariant";

/**
 * Survey theme (the white A/B). Provided around the survey QUESTION screens only
 * (see SurveyEngine); intro/consent/pre-report wizard are never wrapped, so they
 * stay dark. Defaults to "dark" so any consumer rendered outside the provider
 * (or in the dark arm) gets the current dark styling.
 */
const SurveyThemeContext = createContext<SurveyVariant>("dark");

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
