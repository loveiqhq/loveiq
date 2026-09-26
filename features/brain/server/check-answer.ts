/**
 * Every figure and quote in a drafted answer, looked up in the documents it cites.
 *
 * "The LLM may only cite retrieved sources; if confidence is low, it must say 'we don't
 * know'" (Marcus, 2 March). The server has no model, and whether a sentence's wording is
 * fair to its source is a reader's judgement. But a number or a quoted phrase is either in
 * the cited record or it is not, and a wrong figure is the most damaging thing an answer
 * can carry ("I don't trust the data", 15 September). So this checks exactly that, and
 * says plainly what it cannot check.
 */

export interface SourceText {
  id: string;
  text: string;
}

interface NumberAtom {
  kind: "number";
  raw: string;
  value: number;
  decimals: number;
}
interface QuoteAtom {
  kind: "quote";
  raw: string;
  norm: string;
}
interface DateAtom {
  kind: "date";
  raw: string;
  forms: string[];
}
type Atom = NumberAtom | QuoteAtom | DateAtom;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Lower case, one kind of quote, apostrophe and dash, single spaces. */
const normText = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Brain ids ("decision/decision:2026-09-09-3d275f5327") carry digits that are not figures.
 * Only the brain's own source names start one, so "5/10" and "26/09/2026" stay figures.
 */
const SOURCE_NAMES =
  "decision|plan|notice|report|research|skill|domain|doc|analytics|ga4|gsc|notion|drive|" +
  "slack|gmail|calendar|whatsapp|people|evidence|clarity";
const ID = new RegExp(`\\b(?:${SOURCE_NAMES})\\/[^\\s,;)\\]]+`, "gi");
/** An id as written in prose, without the punctuation that ends its sentence. */
const bareId = (id: string) => id.replace(/[.:!?]+$/, "");
const ISO_DAY = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const NUMBER = /(?:€\s?|EUR\s?)?-?\d[\d,]*(?:\.\d+)?\s?%?/g;
const QUOTE = /["“]([^"”]{8,300})["”]/g;

/** Decimal places that carry information: "70.00" is as precise as "70", "3.30" as "3.3". */
const placesOf = (digits: string) =>
  digits.includes(".") ? digits.split(".")[1]!.replace(/0+$/, "").length : 0;

/** Numbers in a text, normalised: "13,245" and "13245" are the same figure. */
function numbersIn(text: string): Array<{ value: number; decimals: number }> {
  const out: Array<{ value: number; decimals: number }> = [];
  for (const m of text.replace(ID, " ").replace(ISO_DAY, " ").matchAll(NUMBER)) {
    const digits = m[0].replace(/€|EUR|%|\s/g, "").replace(/,/g, "");
    const value = Number(digits);
    if (!Number.isFinite(value)) continue;
    out.push({ value, decimals: placesOf(digits) });
  }
  return out;
}

/** The figures, days and quoted phrases in one sentence that a source can confirm. */
export function atomsIn(sentence: string): Atom[] {
  const atoms: Atom[] = [];
  const bare = sentence.replace(ID, " ");
  for (const m of bare.matchAll(QUOTE)) {
    const norm = normText(m[1]!);
    // A quote of three words or more; shorter is a term in quotes, not a quotation.
    if (norm.split(" ").length >= 3) atoms.push({ kind: "quote", raw: m[0], norm });
  }
  const unquoted = bare.replace(QUOTE, " ");
  for (const m of unquoted.matchAll(ISO_DAY)) {
    const [, , mo, d] = m;
    const month = MONTHS[Number(mo) - 1] ?? "";
    const day = String(Number(d));
    atoms.push({
      kind: "date",
      raw: m[0],
      forms: [m[0], `${day} ${month}`, `${day} ${month.slice(0, 3)}`, `${month} ${day}`].map(
        normText
      ),
    });
  }
  for (const m of unquoted.replace(ISO_DAY, " ").matchAll(NUMBER)) {
    const raw = m[0].trim();
    const digits = raw.replace(/€|EUR|%|\s/g, "").replace(/,/g, "");
    const value = Number(digits);
    if (!Number.isFinite(value) || digits === "") continue;
    const decimals = placesOf(digits);
    // A bare single digit is in almost every document, so finding it proves nothing: it
    // is left unchecked rather than reported as confirmed. Percentages and amounts stay.
    if (Math.abs(value) < 10 && decimals === 0 && !/%|€|EUR/.test(raw)) continue;
    atoms.push({ kind: "number", raw, value, decimals });
  }
  return atoms;
}

/** A figure is in a source when a number there rounds to it: "3.3%" is confirmed by "3.28%". */
function holdsNumber(source: Array<{ value: number; decimals: number }>, a: NumberAtom): boolean {
  const f = 10 ** a.decimals;
  // A source figure with fewer places can never round to a more precise answer, since
  // trailing zeros are already stripped, so no separate precision check is needed.
  return source.some((s) => Math.round(s.value * f) / f === Math.round(a.value * f) / f);
}

/** The source figures nearest a missing one, to show a rounding slip or a typo at a glance. */
function nearest(source: Array<{ value: number }>, a: NumberAtom): number[] {
  const scale = Math.max(Math.abs(a.value), 1);
  return [...new Set(source.map((s) => s.value))]
    .filter((v) => v !== a.value && Math.abs(v - a.value) / scale <= 0.25)
    .sort((x, y) => Math.abs(x - a.value) - Math.abs(y - a.value))
    .slice(0, 2);
}

const sentencesOf = (answer: string) =>
  answer
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9"“(\-*•])/)
    .map((s) => s.replace(/^\s*(?:[-*•]|\d+\.)\s+/, "").trim())
    .filter(Boolean);

const clip = (s: string, n = 120) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export interface CheckResult {
  text: string;
  missing: number;
  uncited: number;
  confirmed: number;
}

/**
 * Check a draft against its sources. A sentence that names an id inline is checked against
 * that document only; any other sentence against all of them.
 */
export function checkAnswer(answer: string, sources: SourceText[]): CheckResult {
  const byId = new Map(
    sources.map((s) => [s.id, { norm: normText(s.text), numbers: numbersIn(s.text) }])
  );
  const lines = { missing: [] as string[], uncited: [] as string[], confirmed: [] as string[] };
  let unchecked = 0;
  let figures = 0;
  let quotes = 0;

  for (const sentence of sentencesOf(answer)) {
    const atoms = atomsIn(sentence);
    if (atoms.length === 0) {
      unchecked += 1;
      continue;
    }
    const named = [...sentence.matchAll(ID)].map((m) => bareId(m[0])).filter((id) => byId.has(id));
    const against = named.length ? named : [...byId.keys()];
    if (against.length === 0) {
      lines.uncited.push(`- "${clip(sentence)}": ${atoms.map((a) => a.raw).join(", ")}`);
      continue;
    }
    const lost: string[] = [];
    const where: string[] = [];
    for (const a of atoms) {
      if (a.kind === "quote") quotes += 1;
      else figures += 1;
      const home = against.find((id) => {
        const s = byId.get(id)!;
        if (a.kind === "quote") return s.norm.includes(a.norm);
        if (a.kind === "date") return a.forms.some((f) => s.norm.includes(f));
        return holdsNumber(s.numbers, a);
      });
      if (home) {
        where.push(`${a.raw} in ${home}`);
        continue;
      }
      const close =
        a.kind === "number"
          ? nearest(
              against.flatMap((id) => byId.get(id)!.numbers),
              a
            )
          : [];
      lost.push(
        `${a.kind === "quote" ? `the quote ${clip(a.raw, 60)}` : a.raw}` +
          (close.length ? ` (nearest there: ${close.join(", ")})` : "")
      );
    }
    if (lost.length) {
      lines.missing.push(
        `- "${clip(sentence)}": ${lost.join("; ")} ${lost.length === 1 ? "is" : "are"} not in ` +
          `${against.length === 1 ? against[0] : `any of ${against.length} cited sources`}`
      );
    } else {
      lines.confirmed.push(`- "${clip(sentence, 80)}": ${where.join("; ")}`);
    }
  }

  const out = [
    `Checked ${figures} figure${figures === 1 ? "" : "s"} and ${quotes} quote${quotes === 1 ? "" : "s"} ` +
      `against ${sources.length} source${sources.length === 1 ? "" : "s"}.`,
  ];
  if (lines.missing.length) {
    out.push(
      "",
      "NOT IN THE CITED SOURCES. Correct these, cite where they come from, or say they are " +
        "your own arithmetic before sending:",
      ...lines.missing
    );
  }
  if (lines.uncited.length) out.push("", "NO SOURCE GIVEN:", ...lines.uncited);
  if (lines.confirmed.length) out.push("", "FOUND IN A CITED SOURCE:", ...lines.confirmed);
  if (unchecked) {
    const one = unchecked === 1;
    out.push(
      "",
      `${unchecked} sentence${one ? " has" : "s have"} no figure or quote, so this cannot check ` +
        `${one ? "it" : "them"}: whether the wording is fair to the source is for a reader to judge.`
    );
  }
  if (!lines.missing.length && !lines.uncited.length && figures + quotes > 0) {
    out.push("", "Every figure and quote checked is in a cited source.");
  }
  return {
    text: out.join("\n"),
    missing: lines.missing.length,
    uncited: lines.uncited.length,
    confirmed: lines.confirmed.length,
  };
}
