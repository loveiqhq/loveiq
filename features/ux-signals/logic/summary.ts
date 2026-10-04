/**
 * One plain sentence per signal over many real visits. Computed, never narrated: these
 * numbers decide where attention goes.
 */
import { median, mode, type SignalDef, type SignalValue, type UxVisit } from "./signals";

const share = (k: number, n: number) => `${Math.round((100 * k) / n)}%`;

/** Seconds, to one decimal under a minute and whole above it. */
export function secs(ms: number): string {
  const s = ms / 1000;
  return s >= 60 ? `${Math.round(s)} s` : `${s.toFixed(1)} s`;
}

const quantile = (sorted: number[], q: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;

export interface Summary {
  /** Visits that reached what the signal is about. */
  n: number;
  sentence: string;
}

/**
 * `names` turns a survey question id ("01002") into its words, so "most often at" names a
 * question a reader recognizes.
 */
export function summarize(
  def: SignalDef,
  visits: readonly UxVisit[],
  names: ReadonlyMap<string, string> = new Map()
): Summary {
  if (def.recordedSince) {
    // Whole visits, by their first event: a page loaded before the release runs the old code.
    const since = Date.parse(def.recordedSince);
    const after = visits.filter((v) => v.length > 0 && v[0]!.t >= since);
    const s = summarize({ ...def, recordedSince: undefined }, after, names);
    const day = def.recordedSince.slice(0, 10);
    return {
      ...s,
      sentence: `${s.sentence} Only visits from ${day} on, when the site began recording it.`,
    };
  }
  if (!def.measure) return { n: 0, sentence: def.missing ?? "Not measured." };
  const measured: Array<{ v: SignalValue; visit: UxVisit }> = [];
  for (const visit of visits) {
    const v = def.measure(visit);
    if (v !== null) measured.push({ v, visit });
  }
  const n = measured.length;
  if (n === 0) return { n, sentence: "No visit in this period reached it." };
  const where = () => {
    if (!def.where) return "";
    const at = mode(measured.flatMap((m) => def.where!(m.visit)));
    if (!at) return "";
    const words = names.get(at);
    return `; most often at ${words ? `"${words}" (${at})` : at}`;
  };

  if (def.kind === "duration") {
    const times = measured
      .map((m) => m.v)
      .filter((v): v is number => typeof v === "number")
      .sort((a, b) => a - b);
    const none = n - times.length;
    const noneText = none ? `; ${share(none, n)} never did (${none})` : "";
    if (!times.length) return { n, sentence: `None of ${n} visits did${where()}.` };
    return {
      n,
      sentence:
        `Median ${secs(median(times)!)} (middle half ${secs(quantile(times, 0.25))} to ` +
        `${secs(quantile(times, 0.75))}) over ${times.length} visits${noneText}.`,
    };
  }

  if (def.kind === "count" || def.list) {
    const any = measured.filter((m) => (def.list ? def.positive?.(m.v) : Number(m.v) > 0)).length;
    return {
      n,
      sentence: `${share(any, n)} of ${n} visits, at least once (${any})${where()}.`,
    };
  }

  // Categories and buckets: how the visits divide.
  const counts = new Map<string, number>();
  for (const m of measured) counts.set(String(m.v), (counts.get(String(m.v)) ?? 0) + 1);
  const order =
    def.kind === "bucket"
      ? [...counts.keys()].sort((a, b) => Number(a) - Number(b))
      : [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)!);
  const shown = order.slice(0, 6);
  const rest = order.length - shown.length;
  const label = (k: string) => (def.kind === "bucket" ? `${k}%` : k);
  return {
    n,
    sentence:
      `Of ${n} visits: ${shown.map((k) => `${label(k)} ${share(counts.get(k)!, n)}`).join(", ")}` +
      `${rest > 0 ? `, and ${rest} rarer` : ""}${where()}.`,
  };
}
