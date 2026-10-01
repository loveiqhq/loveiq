/**
 * After the proof walks: store each finished walk's events and truth in ux_walk_record,
 * where the UX checker proves its measures on them (features/ux-signals), and say how
 * tonight's walks compare with the measures.
 *
 *   npx tsx scripts/walkers/check-signals.ts --walks <WALK_OUT>
 *
 * THE LOG IS PUBLIC (this repository is), so it carries signal names and counts only:
 * no events, no selectors, no URLs. What each walk got wrong is in the table, for Jarvis.
 *
 * Exit 0 when every walk finished and was stored; 1 when one stopped or heard nothing, none
 * finished, or a write failed.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { supabaseFetch } from "@features/admin/server/supabase";
import { agrees } from "@features/ux-signals/logic/proof";
import { SIGNALS, type SignalValue, type UxEvent } from "@features/ux-signals/logic/signals";

export interface WalkRow {
  walked_at: string;
  walk: string;
  run_id: string | null;
  origin: string;
  events: UxEvent[];
  truth: Record<string, SignalValue>;
  planted: string[];
}

/**
 * Fewer events than this from a walk that finished means the tap heard nothing, not that the
 * walk did nothing: a whole survey alone is over a hundred. Stored, such a walk would count
 * against every measure; on 2026-10-01 one broken page script did exactly that, 0 events.
 */
export const MIN_EVENTS = 20;

/** Every walk folder that finished and knows its truth. A stopped walk wrote no truth. */
export function rowsIn(dir: string, runId: string | null): WalkRow[] {
  if (!existsSync(dir)) return [];
  const rows: WalkRow[] = [];
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const at = (f: string) => join(dir, d.name, f);
    if (!existsSync(at("truth.json")) || !existsSync(at("events.json"))) continue;
    const walk = JSON.parse(readFileSync(at("walk.json"), "utf8")) as {
      startedAt: string;
      origin: string;
      planted?: string[];
      plantFailures?: string[];
    };
    rows.push({
      walked_at: walk.startedAt,
      walk: d.name,
      // A hand run has no GitHub run; its start time keeps a second store from adding it
      // again (UNIQUE treats two NULLs as different, so a null here would never collide).
      run_id: runId ?? `hand:${walk.startedAt}`,
      origin: walk.origin,
      events: JSON.parse(readFileSync(at("events.json"), "utf8")) as UxEvent[],
      truth: JSON.parse(readFileSync(at("truth.json"), "utf8")) as Record<string, SignalValue>,
      planted: [
        ...(walk.planted ?? []),
        ...(walk.plantFailures ?? []).map((f) => `NOT DONE: ${f}`),
      ],
    });
  }
  return rows;
}

/**
 * The walks that stopped before their end: a walk.json, with why, and no truth. The workflow
 * runs each walk `|| true` so one stop cannot cost the night's others, which left a stop
 * visible only in the log: on 2026-10-01 a walk bought by accident and stopped, and the run
 * still read as a success.
 */
export function stoppedIn(dir: string): Array<{ walk: string; why: string }> {
  if (!existsSync(dir)) return [];
  const out: Array<{ walk: string; why: string }> = [];
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const at = (f: string) => join(dir, d.name, f);
    if (!d.isDirectory() || !existsSync(at("walk.json")) || existsSync(at("truth.json"))) continue;
    // stoppedAt is redacted for this public log by walk.ts.
    const walk = JSON.parse(readFileSync(at("walk.json"), "utf8")) as { stoppedAt?: string };
    out.push({ walk: d.name, why: walk.stoppedAt ?? "no reason recorded" });
  }
  return out;
}

/** The walks worth storing, and the deaf ones: finished, but their tap heard next to nothing. */
export function storable(rows: readonly WalkRow[]): { rows: WalkRow[]; deaf: WalkRow[] } {
  return {
    rows: rows.filter((r) => r.events.length >= MIN_EVENTS),
    deaf: rows.filter((r) => r.events.length < MIN_EVENTS),
  };
}

/** One line per signal: tonight's walks the measure got right, of those that knew. */
export function tonight(rows: readonly WalkRow[]): string[] {
  return SIGNALS.map((def) => {
    const known = rows.filter((r) => def.name in r.truth && def.measure);
    const right = known.filter((r) => agrees(def, r.truth[def.name]!, def.measure!(r.events)));
    return known.length
      ? `${def.name}: right on ${right.length} of ${known.length}`
      : `${def.name}: no walk tonight knew it`;
  });
}

export async function main(argv: string[]): Promise<number> {
  const i = argv.indexOf("--walks");
  const dir = i > -1 ? argv[i + 1] : undefined;
  if (!dir) {
    console.error("Usage: check-signals.ts --walks <WALK_OUT>");
    return 1;
  }
  const { rows, deaf } = storable(rowsIn(dir, process.env.GITHUB_RUN_ID ?? null));
  const stopped = stoppedIn(dir);
  for (const s of stopped) {
    console.error(`${s.walk} stopped (${s.why}): it is not stored, and the run is not a success.`);
  }
  for (const r of deaf) {
    console.error(
      `${r.walk} finished but heard ${r.events.length} events: the tap or the walk's page script is broken, so it is not stored.`
    );
  }
  if (!rows.length) {
    console.error("No proof walk finished tonight with its events, so nothing was stored.");
    return 1;
  }
  const res = await supabaseFetch("/rest/v1/ux_walk_record?on_conflict=run_id,walk", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    console.error(`Storing the walks failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return 1;
  }
  console.log(`Stored ${rows.length} proof walk(s). Tonight, against what each walk knew:`);
  for (const line of tonight(rows)) console.log(`- ${line}`);
  // A deaf walk is a broken instrument, and a stopped one a broken walk or page: whatever was
  // stored, the run must not read as a success.
  return deaf.length || stopped.length ? 1 : 0;
}

if (process.argv[1]?.endsWith("check-signals.ts")) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err);
      process.exit(1);
    }
  );
}
