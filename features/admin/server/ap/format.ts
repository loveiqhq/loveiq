/**
 * How AP-Analytics writes numbers: one place, so a tile, a table and the CSV agree.
 * A missing value is "—" in a cell; the minus sign is the real one (−), as in the design.
 */

export type Unit = "count" | "eur" | "eur3" | "pct" | "min" | "mmss" | "days" | "ratio";
export type Tone = "good" | "bad" | "flat";
/** Which way a change is good; "either" for a check whose change is neither (shown grey). */
export type GoodWhen = "up" | "down" | "either";

const MINUS = "−";
export const EMPTY = "—";

const grouped = (v: number, digits = 0) =>
  v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** "12,608", "€1,199", "€29.00", "€0.002", "5.96%", "6:40", "0:02.9", "2.4 days". */
export function fmt(unit: Unit, v: number | null | undefined, digits?: number): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return EMPTY;
  const sign = v < 0 ? MINUS : "";
  const a = Math.abs(v);
  switch (unit) {
    case "count":
      return sign + grouped(a, digits ?? 0);
    case "eur":
      return `${sign}€${grouped(a, digits ?? (a >= 1000 || Number.isInteger(a) ? 0 : 2))}`;
    case "eur3":
      return `${sign}€${a.toFixed(digits ?? 3)}`;
    case "pct":
      return `${sign}${(a * 100).toFixed(digits ?? (a * 100 >= 10 ? 1 : 2))}%`;
    case "min":
      return `${sign}${a.toFixed(digits ?? 1)} min`;
    case "mmss": {
      // m:ss as the design writes it ("0:41", "6:40"). Under 10 seconds with a tenth
      // ("0:02.9"): medians of a few seconds must not all read "0:03", nor a glance "0:00".
      if (a < 9_950) return `${sign}0:0${(a / 1000).toFixed(digits ?? 1)}`;
      const s = Math.round(a / 1000);
      return `${sign}${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    }
    case "days":
      return `${sign}${a.toFixed(digits ?? 1)} days`;
    case "ratio":
      return sign + a.toFixed(digits ?? 1);
  }
}

export interface Delta {
  text: string;
  tone: Tone;
}

/**
 * The change against the comparison: a percentage for counts and money, points for rates,
 * the plain difference when the comparison is zero. `goodWhen` says which way is good.
 */
export function delta(
  unit: Unit,
  now: number | null,
  before: number | null,
  goodWhen: GoodWhen = "up",
  /** "abs": the plain difference ("−€3.25") rather than a percentage, as the design does for prices. */
  as?: "abs"
): Delta | null {
  if (now === null || before === null || !Number.isFinite(now) || !Number.isFinite(before))
    return null;
  const diff = now - before;
  const tone: Tone =
    Math.abs(diff) < 1e-9 || goodWhen === "either"
      ? "flat"
      : diff > 0 === (goodWhen === "up")
        ? "good"
        : "bad";
  const sign = diff > 0 ? "+" : diff < 0 ? MINUS : "±";
  if (unit === "pct") {
    return {
      text: `${sign}${Math.abs(diff * 100).toFixed(Math.abs(diff * 100) >= 10 ? 1 : 2)} pt`,
      tone,
    };
  }
  if (unit === "mmss") return { text: `${sign}${fmt("mmss", Math.abs(diff))}`, tone };
  if (unit === "eur3") return { text: `${sign}€${Math.abs(diff).toFixed(3)}`, tone };
  if (before === 0 || as === "abs") {
    return {
      text:
        unit === "eur"
          ? // Cents only on small sums, as the design writes them ("−€3.25", "+€899").
            `${sign}€${grouped(Math.abs(diff), Number.isInteger(diff) || Math.abs(diff) >= 100 ? 0 : 2)}`
          : `${sign}${grouped(Math.abs(diff))}`,
      tone,
    };
  }
  const rel = (diff / Math.abs(before)) * 100;
  // A small swing reads flat: under 1% is noise on these volumes.
  return { text: `${sign}${Math.abs(rel).toFixed(1)}%`, tone: Math.abs(rel) < 1 ? "flat" : tone };
}

/** Points for an SVG polyline in a 120 × 36 box; gaps (null) are skipped. */
export function sparkPoints(values: Array<number | null>, height = 36): string {
  const real = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (real.length === 0) return "";
  const max = Math.max(...real);
  const min = Math.min(...real);
  const range = max - min || 1;
  const step = values.length > 1 ? 120 / (values.length - 1) : 0;
  const top = 4;
  const usable = height - top * 2;
  return values
    .map((v, i) =>
      v === null || !Number.isFinite(v)
        ? null
        : `${(i * step).toFixed(1)},${(height - top - ((v - min) / range) * usable).toFixed(1)}`
    )
    .filter((p): p is string => p !== null)
    .join(" ");
}
