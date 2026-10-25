/**
 * One question's answers for the Survey page's question detail, split by a second dimension
 * (source, gender, device, relationship, or the answer to another question), from
 * ap_question_answers: finished surveys in the range only.
 */
import { surveyQuestions } from "@/data/survey-data";
import { supabaseFetch } from "@features/admin/server/supabase";

import { classifySource, deviceClass } from "./facts";
import { SOURCES, type ApFilters } from "./filters";
import { inScope, type Scope } from "./metrics";
import { genderLabel, relationshipLabel } from "./survey-page";

export const DIMENSIONS = [
  "none",
  "source",
  "gender",
  "device",
  "relationship",
  "question",
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export interface AnswerRow {
  answer: string[];
  other: string[] | null;
  src: string | null;
  med: string | null;
  ads: boolean;
  /** Read once ap_question_answers returns them; absent before. */
  ref?: string | null;
  fb?: boolean;
  gender: string | null;
  relationship: string | null;
  device: string | null;
  tier: string | null;
  /** The visit the survey was finished in (PostHog), and new or returning once marked. */
  ph: string | null;
  visitorNew?: boolean | null;
  /** Bought before it was taken (pay to start), as ap_facts marks a finisher; absent before. */
  pts?: boolean;
}

export interface AnswerSplit {
  qid: string;
  question: string;
  type: string;
  /** Multiple choice: shares are of respondents, so they add up to more than 100%. */
  multiple: boolean;
  segments: Array<{ name: string; n: number }>;
  /** Groups left out: under five people, or past the three largest. */
  hidden: Array<{ name: string; n: number }>;
  answers: Array<{ label: string; shares: Array<number | null> }>;
  /** The answer whose share differs most between segments, in words. */
  gap: string | null;
  respondents: number;
  /** Finished surveys in the range, so a question few reach shows how few answered it. */
  finished: number;
  /** Why the filters or the split can't be read over this range; the answers are then empty. */
  blocked?: string | null;
}

/** Questions whose answers can be counted: scales and choices, plus the country. */
export function countableQuestions(): Array<{ qid: string; text: string; type: string }> {
  return surveyQuestions
    .filter(
      (q) =>
        q.qId &&
        (q.answerType === "scale" ||
          q.answerType === "single" ||
          q.answerType === "multiple" ||
          q.qId === "15001")
    )
    .map((q) => ({ qid: q.qId, text: q.question, type: q.answerType }));
}

/** The label of one stored answer: a scale step names its ends, a choice is its own text. */
export function answerLabel(qid: string, value: string): string {
  const q = surveyQuestions.find((x) => x.qId === qid);
  if (q?.answerType === "scale") {
    const low = q.scaleLabels?.low;
    const high = q.scaleLabels?.high;
    if (value === "1" && low) return `1 · ${low}`;
    if (value === "7" && high) return `7 · ${high}`;
  }
  return value;
}

/**
 * The order answers are listed in: the survey's own (scale 1 to 7, options as asked), then
 * anything else by how often it was given (a retired option, the country).
 */
function answerOrder(qid: string, counts: Map<string, number>): string[] {
  const q = surveyQuestions.find((x) => x.qId === qid);
  if (q?.answerType === "scale") return ["1", "2", "3", "4", "5", "6", "7"];
  const asked = (q?.options ?? []).filter((o) => counts.has(o));
  const rest = [...counts.keys()]
    .filter((v) => !asked.includes(v))
    .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  return [...asked, ...rest];
}

/** A scale answer to `qid` as the design names it: disagree (1–3), neutral (4) or agree (5–7). */
function scaleSide(v: string, qid: string): string {
  const n = Number(v);
  return `${n <= 3 ? "Disagree" : n === 4 ? "Neutral" : "Agree"} on ${qid}`;
}

/** The design's relationship groups: monogamous and open or polyamorous are both a relationship. */
function relationshipGroup(r: string | null): string {
  const l = relationshipLabel(r);
  if (l === "Single") return l;
  return l === "Monogamous" || l === "Open or polyamorous"
    ? "In a relationship"
    : "Other or not stated";
}

const SOURCE_LABEL = new Map(SOURCES.map((s) => [s.value as string, s.label]));

/** Which segments one person is in (several for a multiple-choice "other" question). */
function segmentsOf(row: AnswerRow, dim: Dimension, otherQid: string | null): string[] {
  switch (dim) {
    case "none":
      return ["All submissions"];
    case "source": {
      const s = classifySource(row);
      return s === "test" ? [] : [SOURCE_LABEL.get(s) ?? s];
    }
    case "gender":
      return [genderLabel(row.gender)];
    case "device": {
      const d = deviceClass(row.device);
      return [
        d === "phone"
          ? "Mobile"
          : d === "computer"
            ? "Desktop"
            : d === "tablet"
              ? "Tablet"
              : "Unknown device",
      ];
    }
    case "relationship":
      return [relationshipGroup(row.relationship)];
    case "question": {
      if (!row.other || !otherQid) return [];
      const type = surveyQuestions.find((x) => x.qId === otherQid)?.answerType;
      return type === "scale" ? row.other.map((v) => scaleSide(v, otherQid)) : row.other;
    }
  }
}

/** Up to three segments (the design's three colours) with at least five people, largest first. */
const MAX_SEGMENTS = 3;
const MIN_SEGMENT = 5;

export function splitAnswers(
  qid: string,
  rows: AnswerRow[],
  dim: Dimension,
  otherQid: string | null,
  scope: Scope,
  finished: number
): AnswerSplit {
  const q = surveyQuestions.find((x) => x.qId === qid);
  const kept = rows.filter((r) => classifySource(r) !== "test" && inScope(r, scope));
  const bySegment = new Map<string, AnswerRow[]>();
  for (const r of kept) {
    for (const s of segmentsOf(r, dim, otherQid)) {
      const list = bySegment.get(s) ?? [];
      list.push(r);
      bySegment.set(s, list);
    }
  }
  const all = [...bySegment.entries()].sort((a, b) => b[1].length - a[1].length);
  const segments = all
    .filter(([, list]) => list.length >= (dim === "none" ? 1 : MIN_SEGMENT))
    .slice(0, dim === "none" ? 1 : MAX_SEGMENTS);
  const shown = new Set(segments.map(([name]) => name));
  const counts = new Map<string, number>();
  for (const v of kept.flatMap((r) => r.answer)) counts.set(v, (counts.get(v) ?? 0) + 1);
  const order = answerOrder(qid, counts);
  const answers = order.map((value) => ({
    label: answerLabel(qid, value),
    shares: segments.map(([, list]) =>
      list.length ? list.filter((r) => r.answer.includes(value)).length / list.length : null
    ),
  }));
  let gap: string | null = null;
  if (segments.length > 1) {
    let best = { d: 0, label: "" };
    for (const a of answers) {
      const vals = a.shares.filter((v): v is number => v !== null);
      const d = Math.max(...vals) - Math.min(...vals);
      if (d > best.d) best = { d, label: a.label };
    }
    if (best.label)
      gap = `“${best.label}”, ${(best.d * 100).toFixed(0)} points between the segments`;
  }
  return {
    qid,
    question: q?.question ?? qid,
    type: q?.answerType ?? "",
    multiple: q?.answerType === "multiple",
    segments: segments.map(([name, list]) => ({ name, n: list.length })),
    hidden: all
      .filter(([name]) => !shown.has(name))
      .map(([name, list]) => ({ name, n: list.length })),
    answers,
    gap,
    respondents: kept.length,
    finished,
  };
}

export async function fetchAnswers(
  from: string,
  to: string,
  qid: string,
  otherQid: string | null
): Promise<{ rows: AnswerRow[]; finished: number }> {
  const res = await supabaseFetch("/rest/v1/rpc/ap_question_answers", {
    method: "POST",
    body: JSON.stringify({ p_from: from, p_to: to, p_qid: qid, p_other: otherQid }),
    timeoutMs: 30_000,
  });
  if (!res.ok) throw new Error(`ap_question_answers failed (${res.status})`);
  const raw = (await res.json()) as { rows?: unknown; finished?: unknown } | null;
  if (!raw || !Array.isArray(raw.rows)) throw new Error("ap_question_answers: unexpected shape");
  const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
  const list = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null;
  return {
    finished: Number(raw.finished) || 0,
    rows: raw.rows.map((r) => {
      const o = r as Record<string, unknown>;
      return {
        answer: list(o.answer) ?? [],
        other: list(o.other),
        src: str(o.src),
        med: str(o.med),
        ads: o.ads === true,
        ref: str(o.ref),
        fb: o.fb === true,
        gender: str(o.gender),
        relationship: str(o.relationship),
        device: str(o.device),
        tier: str(o.tier),
        ph: str(o.ph),
        pts: o.pts === true,
      };
    }),
  };
}

export function isDimension(v: unknown): v is Dimension {
  return typeof v === "string" && (DIMENSIONS as readonly string[]).includes(v);
}

export type AnswerScopeFilters = Pick<ApFilters, "assessment" | "source" | "device" | "tier">;
