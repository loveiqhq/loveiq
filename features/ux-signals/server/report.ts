/**
 * The UX checker Jarvis serves (`ux_signals`): every one of Marcus's 22 signals measured on
 * real visits, and shown only once proven on the persona walks.
 */
import { surveyQuestionNames } from "@features/admin/server/friction-metrics";

import { proveAll, PROOF_MIN_CASES, PROOF_SHARE, type Proof } from "../logic/proof";
import { SIGNALS } from "../logic/signals";
import { summarize } from "../logic/summary";
import { fetchVisits } from "./posthog-visits";
import { PROOF_DAYS, readWalkRecords } from "./walks";

export interface UxSignalsReport {
  days: number;
  /** null when PostHog could not be read: nothing is shown then, and the reason is. */
  visits: number | null;
  events: number | null;
  visitsWhy?: string;
  /** null when the walk records could not be read: nothing is proven then. */
  walks: number | null;
  latestWalk: string | null;
  signals: Array<{
    name: string;
    stage: string;
    measures: string;
    /** It cannot be measured from what the site records; `proof.why` says what is missing. */
    missing: boolean;
    proof: Proof;
    /** Only for a proven signal, and only when PostHog answered. */
    finding: string | null;
    n: number | null;
  }>;
}

export async function buildUxSignalsReport(days: number): Promise<UxSignalsReport> {
  const [walks, visits] = await Promise.all([readWalkRecords(), fetchVisits(days)]);
  const proofs = proveAll(walks ?? []);
  const names = surveyQuestionNames();
  return {
    days,
    visits: visits.ok ? visits.visits.length : null,
    events: visits.ok ? visits.events : null,
    ...(visits.ok ? {} : { visitsWhy: visits.why }),
    walks: walks === null ? null : walks.length,
    latestWalk: walks?.[0]?.walkedAt ?? null,
    signals: SIGNALS.map((def, i) => {
      // No walk records means nothing proven: proveAll([]) already says so for every signal.
      const proof = proofs[i]!;
      const summary = proof.proven && visits.ok ? summarize(def, visits.visits, names) : null;
      return {
        name: def.name,
        stage: def.stage,
        measures: def.measures,
        missing: Boolean(def.missing),
        proof,
        finding: summary?.sentence ?? null,
        n: summary?.n ?? null,
      };
    }),
  };
}

export function renderUxSignals(r: UxSignalsReport): string {
  const out: string[] = [];
  out.push(
    `Marcus's 22 behaviour signals, measured on real visits over the last ${r.days} day${r.days === 1 ? "" : "s"}. ` +
      `A signal is shown only once its measure has been right on at least ` +
      `${PROOF_SHARE * 100}% of the persona walks of the last ${PROOF_DAYS} days (${PROOF_MIN_CASES} at ` +
      `least, and on both the walks where the behaviour happened and those where it did not), ` +
      `because a walk knows exactly what it did.`
  );
  out.push(
    r.visits === null
      ? `Real visits: PostHog could not be read (${r.visitsWhy}). This is an outage, not a result, so no signal is shown.`
      : `Real visits: ${r.visits.toLocaleString("en-US")} production sessions, ${r.events!.toLocaleString("en-US")} events. Staging is never in them; our own probes are kept out from 2026-10-01, so a window reaching back past that still holds a few of their report visits.`
  );
  out.push(
    r.walks === null
      ? "Walks: the walk records could not be read, so nothing counts as proven. This is an outage, not a result."
      : `Walks: ${r.walks} in the last ${PROOF_DAYS} days${r.latestWalk ? `, the latest ${r.latestWalk.slice(0, 10)}` : ""}. They run production's code on staging's database, at night.`
  );

  const shown = r.signals.filter((s) => s.proof.proven);
  const unproven = r.signals.filter((s) => !s.proof.proven && !s.missing);
  const missing = r.signals.filter((s) => s.missing);

  out.push("", `PROVEN, AND WHAT REAL VISITS SHOW (${shown.length} of 22):`);
  if (!shown.length) out.push("- None yet.");
  for (const s of shown) {
    out.push(
      `- ${s.name} (${s.stage}): ${s.finding ?? "not measured this time (see above)."} ` +
        `Proof: ${s.proof.why}`
    );
  }
  out.push("", `NOT PROVEN YET, SO NOT SHOWN (${unproven.length}):`);
  if (!unproven.length) out.push("- None.");
  for (const s of unproven) {
    const miss = s.proof.misses[0];
    out.push(
      `- ${s.name} (${s.stage}): ${s.proof.why}` +
        (miss
          ? ` First miss: walk ${miss.walk} knew ${JSON.stringify(miss.truth)}, the measure said ${JSON.stringify(miss.measured)}.`
          : "")
    );
  }
  if (missing.length) {
    out.push("", `CANNOT BE MEASURED YET (${missing.length}):`);
    for (const s of missing) out.push(`- ${s.name} (${s.stage}): ${s.proof.why}`);
  }
  out.push("", "HOW EACH IS MEASURED:", ...r.signals.map((s) => `- ${s.name}: ${s.measures}`));
  return out.join("\n");
}
