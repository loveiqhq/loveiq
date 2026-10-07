"use client";

import { useMemo, useState } from "react";

import { orderedOptionGroups } from "../questionOrder";
import { getSessionId } from "../hooks/surveySession";

import type { SurveyQuestion } from "@/data/survey-data";
import type { OptionGroup } from "@features/survey/optionGroups";

/**
 * The categories of a grouped question, in this respondent's order, or `undefined` for a
 * question without categories.
 *
 * The sibling of `useOrderedOptions`, and deliberately the same shape: the session id is
 * read once and held, and `orderedOptionGroups` is pure and deterministic given
 * (question, sessionId). That is what lets `useSubmitSurvey` record the order by
 * recomputing `orderedOptions` (these same groups, flattened) instead of threading it back
 * up through component state.
 */
export function useOrderedOptionGroups(question: SurveyQuestion): OptionGroup[] | undefined {
  // Lazy initialiser, not a ref: the value is read during render (see useOrderedOptions).
  const [sessionId] = useState(getSessionId);
  return useMemo(() => orderedOptionGroups(question, sessionId), [question, sessionId]);
}
