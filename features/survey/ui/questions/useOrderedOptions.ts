"use client";

import { useMemo, useState } from "react";

import { orderedOptions } from "../questionOrder";
import { getSessionId } from "../hooks/surveySession";

import type { SurveyQuestion } from "@/data/survey-data";

/**
 * The options of `question` in the order this respondent should see them.
 *
 * The session id is read once and held, so the order cannot change under the user
 * mid-question. `orderedOptions` is pure and deterministic given (question, sessionId),
 * which is what lets `useSubmitSurvey` recompute the exact same order at submit time
 * instead of threading it back up through component state.
 *
 * Safe to read storage during render here: SurveyEngine mounts only after the intro
 * slides and the consent screen (see SurveyPage), so it never appears in server-rendered
 * HTML and there is no hydration pass to mismatch.
 */
export function useOrderedOptions(question: SurveyQuestion): string[] {
  // Lazy state initialiser, not a ref: the value is READ during render, and reading a
  // ref during render is exactly what the React compiler forbids. Either way it is
  // computed once and then held for the life of the component.
  const [sessionId] = useState(getSessionId);
  return useMemo(() => orderedOptions(question, sessionId), [question, sessionId]);
}
