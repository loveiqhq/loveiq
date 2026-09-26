/**
 * The experiment registry in Claude ("a ceteris paribus environment to conclude from",
 * Marcus): every A/B test with its hypothesis, the one number that decides it, its dates
 * and its outcome, and the live readout of a running test whose arms are stamped.
 *
 * THE REGISTRY IS /ADMIN'S OWN `admin_experiment` TABLE, unused until 2026-09-26, so a test
 * registered here shows in the admin panel and one entered there shows here. Writes go
 * through the same `admin_upsert_experiment` the panel uses, which refuses a test with no
 * hypothesis or primary metric. That refusal is the discipline, and it is kept.
 *
 * THE NUMBERS come from experiment-readouts.ts, the code /admin's A/B overview runs, with its
 * plain-language verdicts that never call a winner the statistics do not support.
 */
import {
  CONCLUDED,
  LIVE_AXES,
  armReader,
  liveReadouts,
  loadArmOutcomes,
  tallyAxis,
  type ArmOutcomes,
  type ExperimentReadout,
} from "@features/admin/server/experiment-readouts";
import { supabaseFetch } from "@features/admin/server/supabase";
import { AXIS_TITLES, type ExperimentAxis } from "@features/attribution/server/labels";
import { loadPeople } from "@features/brain/server/people";

export const AXES: ExperimentAxis[] = ["landing", "survey", "pricing", "paywall"];
export const STATUSES = ["draft", "active", "paused", "completed", "archived"] as const;
type Status = (typeof STATUSES)[number];
/** Where an experiment is recorded when the person's own address is not in the registry. */
const SHARED_ADDRESS = "teamwork@loveiq.org";

/** Every column the panel's upsert writes, so an update can hand back what it does not change. */
interface Row {
  id: number;
  owner_email: string | null;
  name: string;
  hypothesis: string;
  segment_id: number | null;
  primary_metric_key: string;
  guardrail_metric_keys: string[] | null;
  status: Status;
  start_date: string | null;
  decision_date: string | null;
  expected_impact: string | null;
  result_summary: string | null;
  outcome: string | null;
  readout_method: string | null;
  control_sample_size: number | null;
  control_success_count: number | null;
  variant_sample_size: number | null;
  variant_success_count: number | null;
  control_metric_value: number | null;
  variant_metric_value: number | null;
  control_stddev_value: number | null;
  variant_stddev_value: number | null;
  readout_notes: string | null;
  axis: ExperimentAxis | null;
}
const COLUMNS =
  "id,owner_email,name,hypothesis,segment_id,primary_metric_key,guardrail_metric_keys,status," +
  "start_date,decision_date,expected_impact,result_summary,outcome,readout_method," +
  "control_sample_size,control_success_count,variant_sample_size,variant_success_count," +
  "control_metric_value,variant_metric_value,control_stddev_value,variant_stddev_value," +
  "readout_notes,axis";

const DAY_MS = 86_400_000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const isRealDay = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && isoDay(Date.parse(`${s}T00:00:00Z`) || 0) === s;

async function readRows(query: string): Promise<Row[]> {
  const res = await supabaseFetch(`/rest/v1/admin_experiment?select=${COLUMNS}&${query}`);
  if (!res.ok) throw new Error(`admin_experiment: ${res.status}`);
  return (await res.json()) as Row[];
}

/** "V2 3 of 412 bought (0.7%); V1 1 of 398 bought (0.3%)". */
function armsLine(r: ExperimentReadout): string {
  const arms = r.arms.map((a) => `${a.label} ${a.purchases} of ${a.n} bought (${a.rate}%)`);
  return arms.length ? arms.join("; ") : "nobody assigned yet";
}

function describe(e: Row): string {
  const where = e.axis ? `, ${AXIS_TITLES[e.axis]}` : "";
  const dates = e.start_date
    ? `, ${e.start_date}${e.decision_date ? ` to ${e.decision_date}` : " onwards"}`
    : "";
  return (
    `- #${e.id} ${e.name} (${e.status}${where}${dates}). Hypothesis: ${e.hypothesis} ` +
    `Decided by: ${e.primary_metric_key}.` +
    (e.expected_impact ? ` Expected: ${e.expected_impact}` : "")
  );
}

/** A running test's readout since its own start, by the same code /admin's overview runs. */
async function liveLine(
  e: Row,
  now: number,
  load: (since: string) => Promise<ArmOutcomes>
): Promise<string> {
  if (!e.axis) {
    return "  No axis is recorded for it, so there are no stamped arms to read; its numbers are whatever was entered in /admin.";
  }
  const outcomes = await load(`${e.start_date ?? isoDay(now - 30 * DAY_MS)}T00:00:00Z`);
  const read = armReader(e.axis, outcomes);
  if (!read) {
    return `  Nothing stamps an arm for ${AXIS_TITLES[e.axis]} any more, so there is nothing live to read.`;
  }
  const r = tallyAxis(outcomes, e.axis, read);
  return `  So far: ${armsLine(r)}. ${r.verdict}`;
}

export async function listExperiments(
  now = Date.now(),
  load: (since: string) => Promise<ArmOutcomes> = loadArmOutcomes
): Promise<string> {
  const rows = await readRows("status=neq.archived&order=id.desc&limit=100");
  const running = rows.filter((e) => e.status === "active" || e.status === "paused");
  const planned = rows.filter((e) => e.status === "draft");
  const done = rows.filter((e) => e.status === "completed");
  const out = ["RUNNING NOW"];
  for (const e of running) out.push(describe(e), await liveLine(e, now, load));
  // A split being randomised with nothing registered against it is the confusion the
  // registry exists to end, so it is named rather than left out.
  const covered = new Set(running.map((e) => e.axis));
  const unregistered = LIVE_AXES.filter((a) => !covered.has(a));
  if (unregistered.length) {
    const outcomes = await load(`${isoDay(now - 30 * DAY_MS)}T00:00:00Z`);
    for (const r of liveReadouts(outcomes).filter((x) => !covered.has(x.axis))) {
      out.push(
        `- ${r.title}: being randomised with no hypothesis on record; register it with ` +
          `record_experiment. Last 30 days: ${armsLine(r)}. ${r.verdict}`
      );
    }
  }
  if (out.length === 1) out.push("- None. No test is being randomised right now.");
  if (planned.length) out.push("", "PLANNED", ...planned.map(describe));
  out.push("", "FINISHED");
  for (const e of done) {
    out.push(describe(e), `  Outcome: ${e.outcome ?? e.result_summary ?? "not recorded"}`);
  }
  // The tests that ended before the registry existed, in the words /admin prints for them.
  for (const c of CONCLUDED) out.push(`- ${c.title} (before the registry): ${c.outcome}`);
  out.push(
    "",
    "Before the next test starts, record it with record_experiment: what it should change and " +
      "why (the hypothesis), the one number that decides it, the axis its arms are stamped on, " +
      "and the day it starts. When it ends, record the outcome there and the decision with " +
      "record_decision. The same registry is /admin's Experiments page."
  );
  return out.join("\n");
}

export interface ExperimentInput {
  experiment_id?: unknown;
  name?: unknown;
  hypothesis?: unknown;
  metric?: unknown;
  axis?: unknown;
  status?: unknown;
  start_date?: unknown;
  decision_date?: unknown;
  expected_impact?: unknown;
  outcome?: unknown;
  recorded_by?: unknown;
  owner?: unknown;
}

export type RecordOutcome = { ok: false; message: string } | { ok: true; id: number; text: string };

/** A person's address from the registry's aliases, preferring the company domain. */
async function addressOf(name: string): Promise<string | null> {
  const people = await loadPeople().catch(() => null);
  if (!people) return null;
  const want = name.trim().toLowerCase();
  const person = [...people.values()].find((p) => p.canonical.toLowerCase() === want);
  if (!person) return null;
  const aliases = [...people.entries()]
    .filter(([alias, p]) => p === person && alias.includes("@"))
    .map(([alias]) => alias.toLowerCase());
  return aliases.find((a) => a.endsWith("@loveiq.org")) ?? aliases[0] ?? null;
}

export async function recordExperiment(
  input: ExperimentInput,
  now = Date.now()
): Promise<RecordOutcome> {
  const refuse = (message: string): RecordOutcome => ({ ok: false, message });
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

  const recordedBy = text(input.recorded_by);
  if (!recordedBy) {
    return refuse(
      "`recorded_by` is required: the full name of whoever is recording this. There is one " +
        "shared credential, so it is taken on trust, like record_decision's actor."
    );
  }
  const axis = text(input.axis);
  if (axis && !AXES.includes(axis as ExperimentAxis)) {
    return refuse(`\`axis\` is one of ${AXES.join(", ")}, not "${axis}".`);
  }
  const status = text(input.status);
  if (status && !STATUSES.includes(status as Status)) {
    return refuse(`\`status\` is one of ${STATUSES.join(", ")}, not "${status}".`);
  }
  for (const key of ["start_date", "decision_date"] as const) {
    // eslint-disable-next-line security/detect-object-injection -- key is one of two literals.
    const day = text(input[key]);
    if (day && !isRealDay(day))
      return refuse(`\`${key}\` must be a real day like 2026-10-01, not "${day}".`);
  }

  let existing: Row | undefined;
  if (input.experiment_id !== undefined && input.experiment_id !== null) {
    const id = Number(input.experiment_id);
    if (!Number.isInteger(id) || id <= 0) {
      return refuse(
        `\`experiment_id\` is the number experiments lists, like 3, not "${String(input.experiment_id)}".`
      );
    }
    [existing] = await readRows(`id=eq.${id}`);
    if (!existing) return refuse(`No experiment #${id} is registered. experiments lists them.`);
  }

  const name = text(input.name) ?? existing?.name;
  const hypothesis = text(input.hypothesis) ?? existing?.hypothesis;
  const metric = text(input.metric) ?? existing?.primary_metric_key;
  const missing = [
    !name ? "`name`" : "",
    !hypothesis ? "`hypothesis` (what the change should do, and why)" : "",
    !metric ? "`metric` (the one number that decides it)" : "",
  ].filter(Boolean);
  if (missing.length) {
    return refuse(
      `A test is registered with ${missing.join(", ")} or not at all: a test without them ` +
        "cannot be concluded from, which is the point of the registry."
    );
  }

  const startDate = text(input.start_date) ?? existing?.start_date ?? null;
  const today = isoDay(now);
  const nextStatus =
    (status as Status | undefined) ??
    existing?.status ??
    (startDate && startDate <= today ? "active" : "draft");
  const owner = text(input.owner);
  const recorder = (await addressOf(recordedBy)) ?? SHARED_ADDRESS;
  const ownerEmail = owner
    ? ((await addressOf(owner)) ?? SHARED_ADDRESS)
    : (existing?.owner_email ?? recorder);

  // The panel's upsert overwrites every column on an update, so everything this call does
  // not change is handed back as it is, the readout figures typed into /admin included.
  const res = await supabaseFetch("/rest/v1/rpc/admin_upsert_experiment", {
    method: "POST",
    body: JSON.stringify({
      p_admin_email: recorder,
      p_experiment_id: existing?.id ?? null,
      p_owner_email: ownerEmail,
      p_name: name,
      p_hypothesis: hypothesis,
      p_segment_id: existing?.segment_id ?? null,
      p_primary_metric_key: metric,
      p_guardrail_metric_keys: existing?.guardrail_metric_keys ?? [],
      p_status: nextStatus,
      p_start_date: startDate,
      p_decision_date: text(input.decision_date) ?? existing?.decision_date ?? null,
      p_expected_impact: text(input.expected_impact) ?? existing?.expected_impact ?? null,
      p_result_summary: existing?.result_summary ?? null,
      p_outcome: text(input.outcome) ?? existing?.outcome ?? null,
      p_readout_method: existing?.readout_method ?? "conversion-rate",
      p_control_sample_size: existing?.control_sample_size ?? null,
      p_control_success_count: existing?.control_success_count ?? null,
      p_variant_sample_size: existing?.variant_sample_size ?? null,
      p_variant_success_count: existing?.variant_success_count ?? null,
      p_control_metric_value: existing?.control_metric_value ?? null,
      p_variant_metric_value: existing?.variant_metric_value ?? null,
      p_control_stddev_value: existing?.control_stddev_value ?? null,
      p_variant_stddev_value: existing?.variant_stddev_value ?? null,
      p_readout_notes: existing?.readout_notes ?? null,
    }),
  });
  if (!res.ok) {
    throw new Error(`admin_upsert_experiment: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  const id = Number(await res.json());
  // The upsert predates the axis column and never touches it, so it is set on its own.
  if (axis && axis !== existing?.axis) {
    const patch = await supabaseFetch(`/rest/v1/admin_experiment?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ axis }),
    });
    if (!patch.ok) throw new Error(`admin_experiment axis: ${patch.status}`);
  }
  return {
    ok: true,
    id,
    text:
      `${existing ? "Updated" : "Registered"} experiment #${id}: ${name} (${nextStatus}` +
      `${(axis ?? existing?.axis) ? `, ${AXIS_TITLES[(axis ?? existing?.axis) as ExperimentAxis]}` : ""}).\n` +
      `Hypothesis: ${hypothesis}\nDecided by: ${metric}\n` +
      `It shows in /admin's Experiments page too. ` +
      (nextStatus === "completed"
        ? "Record the decision it led to with record_decision, if you have not."
        : "When it ends, set its status to completed with the outcome, and record the decision with record_decision."),
  };
}
