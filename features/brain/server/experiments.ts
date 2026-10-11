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
  type ArmStat,
  type ExperimentReadout,
} from "@features/admin/server/experiment-readouts";
import { MIN_CELL_COUNT } from "@features/admin/server/statistics";
import { supabaseFetch } from "@features/admin/server/supabase";
import { reportingDay } from "@shared/time/reporting-day";
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

/** Two-sided 95% confidence and 80% power: the usual bar for calling an A/B test. */
const Z_CONFIDENCE = 1.959964;
const Z_POWER = 0.841621;
const pct = (rate: number) => `${(rate * 100).toFixed(1)}%`;

/** People each arm needs to tell a buying rate of `a` from one of `b` (0 to 1) apart. */
export function perArmSample(a: number, b: number): number {
  const mean = (a + b) / 2;
  const spread =
    Z_CONFIDENCE * Math.sqrt(2 * mean * (1 - mean)) +
    Z_POWER * Math.sqrt(a * (1 - a) + b * (1 - b));
  return Math.ceil(spread ** 2 / (a - b) ** 2);
}

/** When the first person counted in one of the readout's arms arrived, or null if nobody has. */
function firstCounted(
  outcomes: ArmOutcomes,
  read: (id: number, tracker: string | null) => string | null,
  r: ExperimentReadout
): number | null {
  const arms = new Set(r.arms.map((a) => a.arm));
  let first: number | null = null;
  for (const s of outcomes.submissions) {
    const arm = read(s.id, s.utm_tracker);
    const at = Date.parse(s.created_date_time ?? "");
    if (arm && arms.has(arm) && Number.isFinite(at) && (first === null || at < first)) first = at;
  }
  return first;
}

/**
 * How many people each arm needs before the readout can call the test, and the day that
 * comes at the pace people have arrived so far (Marcus, 5 Oct: "how long until we know?").
 * Sized for the gap seen so far, so a smaller real gap takes longer; arms that are level so
 * far are sized for a 50% lift, since no number of people can show a gap of zero.
 */
export function sampleLine(r: ExperimentReadout, firstAt: number | null, now: number): string {
  const arms = r.arms.filter((a) => a.n > 0);
  if (arms.length < 2 || firstAt === null) return "";
  const rate = (a: ArmStat) => a.purchases / a.n;
  const [lead, next] = [...arms].sort((x, y) => rate(y) - rate(x)) as [ArmStat, ArmStat];
  const [hi, lo] = [rate(lead), rate(next)];
  const have = Math.min(...arms.map((x) => x.n));
  // A day at least, so an hour of traffic is not projected as a pace.
  const perDay = have / Math.max((now - firstAt) / DAY_MS, 1);
  /** When `need` people per arm arrive at this pace, as a sentence. */
  const when = (need: number, ifTheGapHolds: boolean) => {
    const days = perDay > 0 ? Math.ceil((need - have) / perDay) : Infinity;
    if (days > 365) {
      return (
        `At ${perDay.toFixed(1)} a day per arm that is more than a year away, so purchases ` +
        "alone will not settle it: test a bigger change, or decide on an earlier step such as checkout starts."
      );
    }
    // The day as the team reads it, in Berlin.
    const day = reportingDay(new Date(now + days * DAY_MS));
    return `At ${perDay.toFixed(1)} a day per arm, that is around ${day}${ifTheGapHolds ? ", if the gap holds" : ""}.`;
  };
  // The readout counts purchases whatever metric decides the test, so the size is for them.
  const label = "  Needed, for a difference in purchases (what the readout above counts):";
  const power = "at 95% confidence and 80% power";
  if (hi === 0) {
    const yardstick = perArmSample(0.015, 0.01);
    return (
      `${label} nobody has bought yet, so there is no rate to size against. As a yardstick, ` +
      `telling 1.0% from 1.5% takes about ${yardstick} people per arm, ${power}; the smaller ` +
      `arm has ${have}. ${when(yardstick, false)}`
    );
  }
  // Level arms are sized for a 50% lift, or for halfway to 100% when a 50% lift would pass
  // it (above 66.7% there is no such rate, and the formula would return NaN).
  const lift = lo * 1.5 < 1;
  const [a, b, basis] =
    hi > lo
      ? [hi, lo, `to tell ${pct(hi)} from ${pct(lo)} apart`]
      : [
          lift ? lo * 1.5 : (1 + lo) / 2,
          lo,
          lift
            ? `to see a 50% lift on ${pct(lo)}, since the arms are level so far`
            : `to see ${pct(lo)} rise halfway to 100%, since the arms are level so far`,
        ];
  // The readout will not judge until every arm has MIN_CELL_COUNT buyers.
  const need = Math.max(perArmSample(a, b), b > 0 ? Math.ceil(MIN_CELL_COUNT / b) : 0);
  const head = `${label} about ${need} people per arm ${basis}, ${power}; the smaller arm has ${have}.`;
  if (have >= need) return `${head} Both have enough, so the verdict above is the answer.`;
  return `${head} ${when(need, hi > lo)}`;
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
  const needed = sampleLine(r, firstCounted(outcomes, read, r), now);
  return `  So far: ${armsLine(r)}. ${r.verdict}${needed ? `\n${needed}` : ""}`;
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
      const read = armReader(r.axis, outcomes);
      const needed = read ? sampleLine(r, firstCounted(outcomes, read, r), now) : "";
      out.push(
        `- ${r.title}: being randomised with no hypothesis on record; register it with ` +
          `record_experiment. Last 30 days: ${armsLine(r)}. ${r.verdict}` +
          (needed ? `\n${needed}` : "")
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
      "record_decision."
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
      "It is saved in the admin panel's own experiment table. " +
      (nextStatus === "completed"
        ? "Record the decision it led to with record_decision, if you have not."
        : "When it ends, set its status to completed with the outcome, and record the decision with record_decision."),
  };
}
