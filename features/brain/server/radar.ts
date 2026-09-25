import { createHash } from "node:crypto";
import { supabaseFetch } from "@features/admin/server/supabase";
import { markSuperseded } from "@features/brain/server/decisions";
import type { LlmMessage, LlmResult } from "@features/brain/server/llm";
import { readAll } from "@features/brain/server/read-all";
import logger from "@shared/observability/logger";

/**
 * THE DECISION RADAR: pairs of recorded decisions that cannot both stand. Plan item G13.
 *
 * 185 of 200 decisions are mined from meeting notes, and nothing compared one with
 * another. "Require Jira tickets for all major features" (2026-05-15) and a September
 * decision whose own reason is "concerns with using Notion for tracking bug fixes" both
 * stood as current, and so did August's "split the survey into a free and a paid section"
 * long after the survey became free. A reader asking what was decided got both, unmarked.
 *
 * TWO STAGES, BECAUSE ONE WAS NEITHER PRECISE NOR STABLE. Measured 2026-09-26 on the live
 * decisions: one call over a topic flagged duplicates ("pause hiring a designer", recorded
 * three times) and unrelated pairs, and found Jira/Notion in one run of two. Now a
 * generous first call proposes candidates per topic, and a strict second call judges each
 * pair on its own, with both records' reasons and quotes. Measured: Jira/Notion proposed 3
 * of 3 and confirmed 3 of 3; the duplicates and unrelated pairs cleared; two full runs
 * agreed.
 *
 * A PERSON SETTLES, NEVER THE MODEL. A finding is only ever a question: "these may not
 * agree; which stands?". It is written onto both decision records (`meta.disputed_by`),
 * so search and fetch_document show it on the record itself, until someone answers with
 * `settle_decision_conflict`: one stands (the other is marked superseded, exactly as
 * record_decision would), or both do. `brain_decision_conflict` is the authority; the
 * record fields are kept in step with it on every run and every settle.
 *
 * ONLY WHAT CHANGED IS CHECKED AGAIN. A topic is re-read when its set of current decisions
 * changes (a new, rewritten or superseded one); `brain_radar_topic` holds the hash.
 */

export const GEN = [
  "You read a company's recorded decisions on one topic and list pairs that MIGHT not both be in force today:",
  "one may replace the other, or they may give different answers to the same question.",
  "Always include pairs that name different tools, channels, owners, numbers or rules for similar work. Closely related",
  "work is one job: features, epics, bugs and tasks are all the team's work, tracked in one tool.",
  "Include weaker candidates; a careful check follows. Skip only pairs that are plainly about different things.",
  'Use the ids exactly as listed. Return at most ten, strongest first. JSON only: {"pairs":[{"a":"<id>","b":"<id>"}]}',
].join("\n");

export const VERIFY = [
  "You compare two recorded decisions of one company and say whether someone could follow both today.",
  '- "reverses": the later one replaces or undoes the earlier one.',
  '- "unclear": they give different answers to the same question (a different tool, owner, number, channel or rule for the',
  "  same job), so a reader cannot tell which applies now. Also unclear: the later one shows the earlier one was not being",
  "  followed (for example it moves away from a different tool than the one the earlier one required).",
  "  Closely related work is one job: features, epics, bugs and tasks are all the team's work, tracked in one tool.",
  '- "none": the later one refines, extends, narrows or adds to the earlier one; they are the same decision worded',
  "  differently; they are about different jobs; or both can be followed at once. When unsure, answer none.",
  'JSON only: {"verdict":"reverses|unclear|none","why":"one plain sentence naming what they disagree on"}',
].join("\n");

/** A call that proposes more than this is over-firing; the rest are dropped. */
export const MAX_CANDIDATES = 10;

export interface Decision {
  id: string;
  title: string;
  decidedOn: string;
  topic: string;
  /** The record's own "Why:", "Rejected:" and quote lines, which the second call reads. */
  detail: string;
  why: string;
  meta: Record<string, unknown>;
}

export type Kind = "reverses" | "unclear";

export interface Finding {
  earlier: string;
  later: string;
  topic: string;
  kind: Kind;
  why: string;
}

export interface ConflictRow extends Finding {
  found_on: string;
  status: "open" | "settled" | "both_stand";
  settled_by: string | null;
  settled_on: string | null;
  note: string | null;
}

export interface DisputeMark {
  id: string;
  on: string;
  kind: Kind;
  why: string;
}

const bare = (id: string) => id.replace(/^decision[:/]/, "");
export const decisionId = (id: string) => `decision:${bare(id.trim())}`;
const pairKey = (a: string, b: string) => [a, b].sort().join("|");

/** JSON out of a model's answer, or null. Seen live: a JavaScript expression inside it. */
export function parseJson(raw: string): unknown {
  const body = raw.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(body.slice(body.indexOf("{"), body.lastIndexOf("}") + 1));
  } catch {
    return null;
  }
}

/** The candidate pairs, both ids from this topic's list; null when the answer is unreadable. */
export function parseCandidates(raw: string, ids: Set<string>): Array<[string, string]> | null {
  const parsed = parseJson(raw) as { pairs?: unknown } | null;
  if (!parsed || !Array.isArray(parsed.pairs)) return null;
  const out: Array<[string, string]> = [];
  const seen = new Set<string>();
  for (const p of parsed.pairs as Array<{ a?: unknown; b?: unknown }>) {
    if (typeof p?.a !== "string" || typeof p?.b !== "string") continue;
    const a = decisionId(p.a);
    const b = decisionId(p.b);
    if (a === b || !ids.has(a) || !ids.has(b) || seen.has(pairKey(a, b))) continue;
    seen.add(pairKey(a, b));
    out.push([a, b]);
    if (out.length === MAX_CANDIDATES) break;
  }
  return out;
}

/** The second call's verdict; null when unreadable. A finding without a reason is not one. */
export function parseVerdict(raw: string): { verdict: Kind | "none"; why: string } | null {
  const parsed = parseJson(raw) as { verdict?: unknown; why?: unknown } | null;
  if (!parsed || !["reverses", "unclear", "none"].includes(String(parsed.verdict))) return null;
  const why = typeof parsed.why === "string" ? parsed.why.replace(/\s+/g, " ").trim() : "";
  const verdict = parsed.verdict as Kind | "none";
  if (verdict !== "none" && !why) return { verdict: "none", why: "" };
  return { verdict, why: why.slice(0, 400) };
}

/** Oldest first by decided date, then id, whatever order the model named them in. */
export function orderPair(a: Decision, b: Decision): [Decision, Decision] {
  return a.decidedOn < b.decidedOn || (a.decidedOn === b.decidedOn && a.id < b.id)
    ? [a, b]
    : [b, a];
}

export function idsHash(decisions: Decision[]): string {
  return createHash("sha1")
    .update(
      decisions
        .map((d) => d.id)
        .sort()
        .join("\n")
    )
    .digest("hex")
    .slice(0, 16);
}

const text = (d: Decision) => d.title.replace(/^Decision:\s*/, "");

// ── Reading ─────────────────────────────────────────────────────────────────────────

interface ChunkRow {
  source_id: string;
  title: string | null;
  body: string;
  period_end: string | null;
  meta: Record<string, unknown> | null;
}

export function toDecision(r: ChunkRow): Decision {
  const lines = r.body.split("\n");
  const pick = (re: RegExp) => lines.filter((l) => re.test(l)).join("\n  ");
  return {
    id: r.source_id,
    title: r.title ?? "",
    decidedOn: r.period_end ?? "",
    topic: String(r.meta?.topic ?? "other").toLowerCase() || "other",
    detail: pick(/^(Why|Rejected|Quoted from the notes):/).slice(0, 700),
    why: (lines.find((l) => l.startsWith("Why: ")) ?? "").slice(5, 165),
    meta: r.meta ?? {},
  };
}

/** Every decision still in force: whole records, none marked superseded. Null if unreadable. */
export async function currentDecisions(): Promise<Decision[] | null> {
  const rows = await readAll<ChunkRow>(
    `/rest/v1/brain_chunk?select=source_id,title,body,period_end,meta&source=eq.decision&order=id.asc`
  );
  if (!rows) return null;
  return rows.filter((r) => !/#\d+$/.test(r.source_id) && !r.meta?.superseded_by).map(toDecision);
}

export async function conflictRows(): Promise<ConflictRow[] | null> {
  return readAll<ConflictRow>(
    `/rest/v1/brain_decision_conflict?select=*&order=found_on.asc,earlier.asc,later.asc`
  );
}

async function topicState(): Promise<Map<string, string> | null> {
  const rows = await readAll<{ topic: string; ids_hash: string }>(
    `/rest/v1/brain_radar_topic?select=topic,ids_hash&order=topic.asc`
  );
  return rows ? new Map(rows.map((r) => [r.topic, r.ids_hash])) : null;
}

async function write(path: string, method: string, body: unknown, prefer: string): Promise<void> {
  const res = await supabaseFetch(path, {
    method,
    headers: { "Content-Type": "application/json", Prefer: prefer },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`radar write failed (${res.status}) on ${path.split("?")[0]}`);
}

// ── Checking ────────────────────────────────────────────────────────────────────────

export interface RadarDeps {
  complete: (messages: LlmMessage[], timeoutMs: number) => Promise<LlmResult>;
  now: () => number;
}

/** Model failures that will not clear by trying the next topic now. */
const STOPS = new Set(["rate_limited", "overloaded", "unconfigured"]);

export async function checkTopic(
  topic: string,
  decisions: Decision[],
  known: Set<string>,
  deps: RadarDeps
): Promise<
  | { ok: true; candidates: number; findings: Finding[]; unreadable: number }
  | { ok: false; reason: string }
> {
  const byId = new Map(decisions.map((d) => [d.id, d]));
  const list = decisions
    .map((d) => `${bare(d.id)} | ${d.decidedOn} | ${text(d)}${d.why ? ` | why: ${d.why}` : ""}`)
    .join("\n");
  const gen = await deps.complete(
    [
      { role: "system", content: GEN },
      { role: "user", content: `Topic: ${topic}\n${list}` },
    ],
    120_000
  );
  if (!gen.ok) return { ok: false, reason: gen.reason };
  const pairs = parseCandidates(gen.text, new Set(byId.keys()));
  if (!pairs) return { ok: false, reason: "unparseable" };

  const findings: Finding[] = [];
  let unreadable = 0;
  for (const [a, b] of pairs) {
    if (known.has(pairKey(a, b))) continue;
    const [earlier, later] = orderPair(byId.get(a)!, byId.get(b)!);
    const side = (label: string, d: Decision) =>
      `${label} (${d.decidedOn}): ${text(d)}${d.detail ? `\n  ${d.detail}` : ""}`;
    const res = await deps.complete(
      [
        { role: "system", content: VERIFY },
        { role: "user", content: `${side("Earlier", earlier)}\n${side("Later", later)}` },
      ],
      60_000
    );
    if (!res.ok) return { ok: false, reason: res.reason };
    const verdict = parseVerdict(res.text);
    if (!verdict) {
      // Precision first: an unreadable verdict is not a finding.
      unreadable++;
      continue;
    }
    if (verdict.verdict === "none") continue;
    findings.push({
      earlier: earlier.id,
      later: later.id,
      topic,
      kind: verdict.verdict,
      why: verdict.why,
    });
  }
  return { ok: true, candidates: pairs.length, findings, unreadable };
}

// ── Keeping the records in step ─────────────────────────────────────────────────────

/** What each decision's `meta.disputed_by` should say, from the open conflicts. */
export function disputeMarks(
  open: ConflictRow[],
  dates: Map<string, string>
): Map<string, DisputeMark[]> {
  const marks = new Map<string, DisputeMark[]>();
  const add = (on: string, other: string, c: ConflictRow) =>
    marks.set(on, [
      ...(marks.get(on) ?? []),
      { id: other, on: dates.get(other) ?? "", kind: c.kind, why: c.why },
    ]);
  for (const c of open) {
    add(c.earlier, c.later, c);
    add(c.later, c.earlier, c);
  }
  return marks;
}

const sameMarks = (a: unknown, b: DisputeMark[] | undefined) =>
  JSON.stringify(Array.isArray(a) ? a : []) === JSON.stringify(b ?? []);

/**
 * Settle what no longer applies and bring every record's `disputed_by` in step with the
 * open conflicts. No model: run after every radar pass and every settle.
 */
export async function syncDisputes(
  today: string
): Promise<{ autoSettled: number; marked: number } | null> {
  const [decisions, rows] = await Promise.all([currentDecisions(), conflictRows()]);
  if (!decisions || !rows) return null;
  const current = new Set(decisions.map((d) => d.id));
  let autoSettled = 0;
  for (const c of rows.filter((r) => r.status === "open")) {
    const gone = [c.earlier, c.later].find((id) => !current.has(id));
    if (!gone) continue;
    await write(
      `/rest/v1/brain_decision_conflict?earlier=eq.${encodeURIComponent(c.earlier)}&later=eq.${encodeURIComponent(c.later)}`,
      "PATCH",
      {
        status: "settled",
        settled_by: "the decision radar",
        settled_on: today,
        note: `decision/${gone} is no longer current (superseded or removed)`,
      },
      "return=minimal"
    );
    c.status = "settled";
    autoSettled++;
  }
  const dates = new Map(decisions.map((d) => [d.id, d.decidedOn]));
  const marks = disputeMarks(
    rows.filter((r) => r.status === "open"),
    dates
  );
  let marked = 0;
  for (const d of decisions) {
    const want = marks.get(d.id);
    if (sameMarks(d.meta.disputed_by, want)) continue;
    const meta = { ...d.meta };
    if (want) meta.disputed_by = want;
    else delete meta.disputed_by;
    await write(
      `/rest/v1/brain_chunk?source=eq.decision&source_id=eq.${encodeURIComponent(d.id)}`,
      "PATCH",
      { meta },
      "return=minimal"
    );
    marked++;
  }
  return { autoSettled, marked };
}

// ── The run ─────────────────────────────────────────────────────────────────────────

export interface RadarResult {
  ok: boolean;
  error?: string;
  decisions: number;
  topics: number;
  checked: string[];
  unchanged: number;
  candidates: number;
  found: Array<Finding & { earlierTitle: string; laterTitle: string }>;
  failed: Array<{ topic: string; reason: string }>;
  outOfTime: string[];
  autoSettled: number;
  marked: number;
}

export async function runRadar(deps: RadarDeps, budgetMs: number): Promise<RadarResult> {
  const deadline = deps.now() + budgetMs;
  const today = new Date(deps.now()).toISOString().slice(0, 10);
  const result: RadarResult = {
    ok: true,
    decisions: 0,
    topics: 0,
    checked: [],
    unchanged: 0,
    candidates: 0,
    found: [],
    failed: [],
    outOfTime: [],
    autoSettled: 0,
    marked: 0,
  };
  const [decisions, rows, state] = await Promise.all([
    currentDecisions(),
    conflictRows(),
    topicState(),
  ]);
  if (!decisions || !rows || !state) {
    return {
      ...result,
      ok: false,
      error: "the decisions or the radar's own tables could not be read",
    };
  }
  result.decisions = decisions.length;
  const known = new Set(rows.map((r) => pairKey(r.earlier, r.later)));
  const titles = new Map(decisions.map((d) => [d.id, text(d)]));
  const byTopic = new Map<string, Decision[]>();
  for (const d of decisions) byTopic.set(d.topic, [...(byTopic.get(d.topic) ?? []), d]);
  result.topics = byTopic.size;

  let stopped: string | null = null;
  for (const [topic, list] of [...byTopic].sort(([a], [b]) => a.localeCompare(b))) {
    const hash = idsHash(list);
    if (state.get(topic) === hash) {
      result.unchanged++;
      continue;
    }
    if (stopped || deps.now() >= deadline) {
      // Left for the next run: its hash is not recorded, so it is still "changed".
      result.outOfTime.push(topic);
      continue;
    }
    if (list.length >= 2) {
      const res = await checkTopic(topic, list, known, deps);
      if (!res.ok) {
        result.failed.push({ topic, reason: res.reason });
        if (STOPS.has(res.reason)) stopped = res.reason;
        continue;
      }
      result.candidates += res.candidates;
      if (res.findings.length) {
        await write(
          `/rest/v1/brain_decision_conflict?on_conflict=earlier,later`,
          "POST",
          res.findings.map((f) => ({ ...f, found_on: today })),
          "resolution=ignore-duplicates,return=minimal"
        );
        for (const f of res.findings) {
          known.add(pairKey(f.earlier, f.later));
          result.found.push({
            ...f,
            earlierTitle: titles.get(f.earlier) ?? f.earlier,
            laterTitle: titles.get(f.later) ?? f.later,
          });
        }
      }
    }
    await write(
      `/rest/v1/brain_radar_topic?on_conflict=topic`,
      "POST",
      { topic, ids_hash: hash, checked_at: new Date(deps.now()).toISOString() },
      "resolution=merge-duplicates,return=minimal"
    );
    result.checked.push(topic);
  }

  const synced = await syncDisputes(today);
  if (!synced) {
    return { ...result, ok: false, error: "the records could not be brought in step" };
  }
  result.autoSettled = synced.autoSettled;
  result.marked = synced.marked;
  if (result.failed.length && result.checked.length === 0) result.ok = false;
  logger.info(
    { checked: result.checked.length, found: result.found.length, failed: result.failed.length },
    "brain: decision radar run"
  );
  return result;
}

// ── Settling ────────────────────────────────────────────────────────────────────────

export type Keep = "earlier" | "later" | "both";

export async function settleConflict(
  input: { a: string; b: string; keep: Keep; actor: string; note?: string },
  now: Date = new Date()
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const a = decisionId(input.a);
  const b = decisionId(input.b);
  const rows = await readAll<ConflictRow>(
    `/rest/v1/brain_decision_conflict?select=*` +
      `&or=(and(earlier.eq.${encodeURIComponent(a)},later.eq.${encodeURIComponent(b)}),` +
      `and(earlier.eq.${encodeURIComponent(b)},later.eq.${encodeURIComponent(a)}))&order=earlier.asc`
  );
  if (!rows)
    return { ok: false, error: "The radar's records could not be read. Nothing was changed." };
  const c = rows[0];
  if (!c) {
    return {
      ok: false,
      error: `No recorded conflict between decision/${bare(a)} and decision/${bare(b)}. decision_conflicts lists the open ones.`,
    };
  }
  if (c.status !== "open") {
    return {
      ok: false,
      error: `Already settled on ${c.settled_on ?? "an earlier day"} by ${c.settled_by ?? "someone"} (${c.status === "both_stand" ? "both stand" : "one stands"}). Nothing was changed.`,
    };
  }
  const today = now.toISOString().slice(0, 10);
  const winner = input.keep === "earlier" ? c.earlier : input.keep === "later" ? c.later : null;
  const loser = input.keep === "earlier" ? c.later : input.keep === "later" ? c.earlier : null;
  if (winner && loser) await markSuperseded(loser, winner, today);
  await write(
    `/rest/v1/brain_decision_conflict?earlier=eq.${encodeURIComponent(c.earlier)}&later=eq.${encodeURIComponent(c.later)}`,
    "PATCH",
    {
      status: winner ? "settled" : "both_stand",
      settled_by: input.actor.trim(),
      settled_on: today,
      note: input.note?.trim() || null,
    },
    "return=minimal"
  );
  const synced = await syncDisputes(today);
  return {
    ok: true,
    text:
      (winner
        ? `Settled: decision/${bare(winner)} stands, and decision/${bare(loser!)} is now marked superseded by it, ` +
          "so search shows it as history."
        : `Settled: both decision/${bare(c.earlier)} and decision/${bare(c.later)} stand; the radar will not raise this pair again.`) +
      (synced && synced.autoSettled
        ? ` ${synced.autoSettled} other open conflict${synced.autoSettled === 1 ? "" : "s"} with the superseded decision closed with it.`
        : "") +
      (synced
        ? ""
        : " The records' warnings could not be updated yet; the next radar run will do it."),
  };
}

// ── Listing ─────────────────────────────────────────────────────────────────────────

export interface OpenConflict extends ConflictRow {
  earlierTitle: string;
  laterTitle: string;
  earlierOn: string;
  laterOn: string;
}

export async function openConflicts(topic: string | null): Promise<OpenConflict[] | null> {
  const [rows, decisions] = await Promise.all([conflictRows(), currentDecisions()]);
  if (!rows || !decisions) return null;
  const byId = new Map(decisions.map((d) => [d.id, d]));
  return rows
    .filter((r) => r.status === "open" && byId.has(r.earlier) && byId.has(r.later))
    .filter((r) => !topic || r.topic === topic.trim().toLowerCase())
    .map((r) => ({
      ...r,
      earlierTitle: text(byId.get(r.earlier)!),
      laterTitle: text(byId.get(r.later)!),
      earlierOn: byId.get(r.earlier)!.decidedOn,
      laterOn: byId.get(r.later)!.decidedOn,
    }));
}

export function renderConflicts(list: OpenConflict[], topic: string | null): string {
  if (list.length === 0) {
    return `No open conflicts between recorded decisions${topic ? ` on ${topic}` : ""}.`;
  }
  const byTopic = new Map<string, OpenConflict[]>();
  for (const c of list) byTopic.set(c.topic, [...(byTopic.get(c.topic) ?? []), c]);
  const blocks = [...byTopic].map(
    ([t, cs]) =>
      `${t}:\n` +
      cs
        .map(
          (c) =>
            `- ${c.kind === "reverses" ? "The later may replace the earlier" : "They may give different answers"}: ${c.why}\n` +
            `    earlier ${c.earlierOn}: "${c.earlierTitle}" (decision/${bare(c.earlier)})\n` +
            `    later   ${c.laterOn}: "${c.laterTitle}" (decision/${bare(c.later)})`
        )
        .join("\n")
  );
  return (
    `${list.length} pair${list.length === 1 ? "" : "s"} of recorded decisions that may not both stand` +
    `${topic ? ` on ${topic}` : ""}, found by the decision radar. Each was proposed and then checked on its own by a model: ` +
    `it is a question for a person, not a verdict.\n\n${blocks.join("\n\n")}\n\n` +
    "To settle one: settle_decision_conflict with both ids and keep: earlier, later, or both. The one that does not stand " +
    "is marked superseded, the same as record_decision would do."
  );
}
