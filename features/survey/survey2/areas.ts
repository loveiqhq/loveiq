import type { SurveyQuestion } from "@/data/survey-data";
import { OPTION_GROUPS } from "@features/survey/optionGroups";

import { SURVEY_2_AREAS_QID } from "./order";

/**
 * 16016 in two screens (Mark's to-do 5): the areas first (`16016a`, up to two of its 13
 * categories), then the topics inside them (16016, up to three). The topics are what is stored;
 * the areas screen's answer stays in the draft and is never submitted.
 */

const TOPICS_QID = "16016";

type Answers = Readonly<Record<string, unknown>>;

/** The areas picked on the first screen, or none. */
export function areasPicked(answers: Answers): string[] {
  const value = answers[SURVEY_2_AREAS_QID];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** The topics of `topics` that sit inside `areas`. */
export function pruneTopics(topics: readonly string[], areas: readonly string[]): string[] {
  const inside = new Set(
    (OPTION_GROUPS.get(TOPICS_QID) ?? [])
      .filter((group) => areas.includes(group.label))
      .flatMap((group) => group.options)
  );
  return topics.filter((topic) => inside.has(topic));
}

/**
 * The screens with the topics screen narrowed to the areas picked: its options are the topics
 * inside them, in authored order, so the page groups them under those areas only. With no area
 * on record (a draft can't reach the topics without one, but nothing breaks if it does) every
 * topic stays. Every other screen is returned as it is.
 */
export function withPickedAreas(screens: SurveyQuestion[], answers: Answers): SurveyQuestion[] {
  const areas = areasPicked(answers);
  if (areas.length === 0) return screens;
  return screens.map((q) =>
    q.qId === TOPICS_QID ? { ...q, options: pruneTopics(q.options, areas) } : q
  );
}

/** The answers to submit: everything but the areas screen's own answer. */
export function submittableAnswers<T>(answers: Readonly<Record<string, T>>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [qId, value] of Object.entries(answers)) {
    if (qId !== SURVEY_2_AREAS_QID) out[qId] = value;
  }
  return out;
}
