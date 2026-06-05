import { surveyQuestions } from "@/data/survey-data";
import {
  DIMENSION_KEYS,
  DIMENSION_LABELS,
  type DimensionKey,
} from "@features/admin/server/explorer";

/**
 * Client-side mirror of the route's answer-question whitelist: discrete-type
 * questions (single / multiple / country) excluding the demographic ones that
 * are already first-class dimensions. Powers the answer filter + the
 * "group by an answer" dropdown options.
 */
const DEMOGRAPHIC_QIDS = new Set(["15001", "15003", "15004", "15010", "15011"]);

export interface AnswerQuestion {
  qId: string;
  label: string;
  options: string[];
}

export const ANSWER_QUESTIONS: AnswerQuestion[] = surveyQuestions
  .filter(
    (q) =>
      (q.answerType === "single" || q.answerType === "multiple" || q.answerType === "country") &&
      !DEMOGRAPHIC_QIDS.has(q.qId) &&
      q.options.length > 0
  )
  .map((q) => ({ qId: q.qId, label: q.question, options: q.options }));

export const ANSWER_QUESTION_BY_ID = new Map(ANSWER_QUESTIONS.map((q) => [q.qId, q]));

export interface GroupOption {
  value: string; // a DimensionKey, or `q:<qId>`
  label: string;
}

export const DIMENSION_GROUP_OPTIONS: GroupOption[] = DIMENSION_KEYS.map((dim) => ({
  value: dim,
  label: DIMENSION_LABELS[dim],
}));

export const ANSWER_GROUP_OPTIONS: GroupOption[] = ANSWER_QUESTIONS.map((q) => ({
  value: `q:${q.qId}`,
  label: q.label,
}));

/**
 * 1-7 (Likert) scale questions. Group-by only — their value distribution is the
 * insight. Stored answer is the raw 1-7 number, so there are no discrete
 * `options` to filter on (kept out of the answer-filter surface).
 */
export interface ScaleQuestion {
  qId: string;
  label: string;
  scaleLabels?: { low: string; high: string };
}

export const SCALE_QUESTIONS: ScaleQuestion[] = surveyQuestions
  .filter((q) => q.answerType === "scale")
  .map((q) => ({ qId: q.qId, label: q.question, scaleLabels: q.scaleLabels }));

export const SCALE_QID_SET = new Set(SCALE_QUESTIONS.map((q) => q.qId));
export const SCALE_QUESTION_BY_ID = new Map(SCALE_QUESTIONS.map((q) => [q.qId, q]));

export const SCALE_GROUP_OPTIONS: GroupOption[] = SCALE_QUESTIONS.map((q) => ({
  value: `q:${q.qId}`,
  label: q.label,
}));

/** Question label lookup spanning both answer and scale questions. */
const QUESTION_LABEL_BY_QID = new Map<string, string>([
  ...ANSWER_QUESTIONS.map((q) => [q.qId, q.label] as const),
  ...SCALE_QUESTIONS.map((q) => [q.qId, q.label] as const),
]);

/** True when a group-by token is a 1-7 scale question (`q:<scaleQid>`). */
export function isScaleToken(token: string): boolean {
  return token.startsWith("q:") && SCALE_QID_SET.has(token.slice(2));
}

/** Filter-panel groupings (paidStatus is a header toggle, not shown here). */
export const DIMENSION_GROUPS: Array<{ title: string; dims: DimensionKey[] }> = [
  { title: "Who", dims: ["archetype", "age", "gender", "country", "orientation", "relationship"] },
  { title: "Acquisition", dims: ["trafficSource", "utmMedium", "utmCampaign"] },
  {
    title: "Pricing & experiment",
    dims: [
      "plan",
      "device",
      "paywallArm",
      "experimentGroup",
      "countryTier",
      "priceBucket",
      "behavioralBucket",
    ],
  },
  { title: "Engagement", dims: ["reportViewed", "sessionBucket"] },
];

/** Human label for a group-by token (a dimension key or `q:<qId>`). */
export function tokenLabel(token: string): string {
  if (token.startsWith("q:")) {
    const qid = token.slice(2);
    return QUESTION_LABEL_BY_QID.get(qid) ?? `Answer ${qid}`;
  }
  return DIMENSION_LABELS[token as DimensionKey] ?? token;
}

export interface AnswerFilterValue {
  qId: string;
  values: string[];
}

/**
 * Encode answer filters to the `ans` URL param: `qid:v1|v2;qid2:v3` with each
 * value URL-encoded (matches the route's parser, which decodeURIComponent's
 * each value after splitting on ; : |). Returns null when empty.
 */
export function encodeAnswers(filters: AnswerFilterValue[]): string | null {
  const parts = filters
    .filter((f) => f.values.length > 0 && ANSWER_QUESTION_BY_ID.has(f.qId))
    .map((f) => `${f.qId}:${f.values.map((v) => encodeURIComponent(v)).join("|")}`);
  return parts.length > 0 ? parts.join(";") : null;
}

export function decodeAnswers(raw: string | null): AnswerFilterValue[] {
  if (!raw) return [];
  const out: AnswerFilterValue[] = [];
  for (const clause of raw.split(";")) {
    const idx = clause.indexOf(":");
    if (idx <= 0) continue;
    const qId = clause.slice(0, idx).trim();
    if (!ANSWER_QUESTION_BY_ID.has(qId)) continue;
    const values = clause
      .slice(idx + 1)
      .split("|")
      .map((v) => {
        try {
          return decodeURIComponent(v);
        } catch {
          return v;
        }
      })
      .filter(Boolean);
    if (values.length > 0) out.push({ qId, values });
  }
  return out;
}

export interface ArchMatchValue {
  archetype: string;
  /** Minimum match % (0-100). */
  min: number;
}

/**
 * Encode archetype-match filters to the `archMatch` URL param:
 * `Name:min;Name2:min2` with each name URL-encoded (mirrors the route parser).
 * Drops zero-threshold clauses. Returns null when empty.
 */
export function encodeArchMatch(clauses: ArchMatchValue[]): string | null {
  const parts = clauses
    .filter((c) => c.archetype && c.min > 0)
    .map((c) => `${encodeURIComponent(c.archetype)}:${Math.round(c.min)}`);
  return parts.length > 0 ? parts.join(";") : null;
}

export function decodeArchMatch(raw: string | null): ArchMatchValue[] {
  if (!raw) return [];
  const out: ArchMatchValue[] = [];
  for (const clause of raw.split(";")) {
    const idx = clause.indexOf(":");
    if (idx <= 0) continue;
    let archetype: string;
    try {
      archetype = decodeURIComponent(clause.slice(0, idx)).trim();
    } catch {
      archetype = clause.slice(0, idx).trim();
    }
    const min = Number(clause.slice(idx + 1));
    if (archetype && Number.isFinite(min)) {
      out.push({ archetype, min: Math.max(0, Math.min(100, min)) });
    }
  }
  return out;
}
