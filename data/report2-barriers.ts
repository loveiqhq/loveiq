// "How you compare", third column: how many other readers named the same
// barrier to change that this reader did.
//
// Replaces the want-versus-getting bars, which asked the reader to hold two
// abstract self-ratings and infer the point, in a box that promises comparison
// to other people. This is a real comparison and needs no arithmetic.
//
// WHERE THE NUMBERS COME FROM
// Counted 2026-08-26 over the 1,636 scored submissions that answered the
// barrier question (of 1,716 scored). This is the LoveIQ sample, NOT a
// population estimate — everyone in it chose to take a sexuality assessment —
// so the copy says "people here", never "people".
//
// ⚠️ THE STORED TAGS ARE RAW ANSWER TEXT, NOT CODES. The answer options were
// reworded at some point and nothing pinned them to an identifier, so the same
// barrier is split across wordings in historical data:
//
//   "I'm not sure what would actually help"                388
//   "I’m not sure what would actually help"                105   curly apostrophe
//   "Shame, self-judgment, or inner pressure"              357
//   "Shame, pressure, or self-judgment get in the way"      51   reworded option
//   "The person I'm with isn't on the same page…"          257
//   "Someone I’m involved with isn’t aligned or engaged"    37   reworded option
//
// `BARRIER_RULES` below merges them. Anyone counting these tags WITHOUT that
// merge undercuts the top barrier by about a fifth, which affects any analysis
// on this question and not just this column. The durable fix is a stable code
// on the answer option; until then this map has to be kept current, and
// `report2-barriers.test.ts` fails loudly on a tag it cannot place.

export type BarrierCode =
  | "unsure"
  | "shame"
  | "partner"
  | "capacity"
  | "safety"
  | "consistency"
  | "body"
  | "access"
  | "none"
  | "other";

/**
 * Substring rules, applied in order, against a lowercased tag with curly
 * apostrophes folded to straight. Ordered so the more specific test wins.
 */
const BARRIER_RULES: Array<[BarrierCode, RegExp]> = [
  ["unsure", /not sure what would actually help/],
  ["none", /nothing major/],
  ["shame", /shame/],
  ["partner", /same page|aligned or engaged/],
  ["capacity", /time or energy/],
  ["safety", /emotionally safe/],
  ["consistency", /keep going with things|stay consistent/],
  ["body", /physical pain/],
  ["access", /expensive or hard to access|hard to access/],
  ["other", /something else/],
];

export function barrierCodeFor(tag: string): BarrierCode | null {
  const t = tag.toLowerCase().replace(/[’‘]/g, "'");
  for (const [code, re] of BARRIER_RULES) if (re.test(t)) return code;
  return null;
}

/**
 * Share of answering readers naming each barrier, as a percentage. Multi-select,
 * so these sum past 100.
 */
export const BARRIER_SHARE: Record<BarrierCode, number> = {
  unsure: 30.1,
  shame: 24.9,
  none: 21.8,
  partner: 19.4,
  capacity: 16.8,
  other: 15.5,
  safety: 12.7,
  consistency: 10.8,
  body: 9.8,
  access: 6.1,
};

/** Readers who answered the barrier question, i.e. the base for every share. */
export const BARRIER_BASE = 1636;

/** Completes "1 in N …", so each reads as a thing other people named too. */
const BARRIER_LABEL: Record<BarrierCode, string> = {
  unsure: "Not knowing what would help, like you",
  shame: "Shame and self-judgment, like you",
  partner: "A partner not on the same page, like you",
  capacity: "No time or energy, like you",
  safety: "Not feeling safe enough yet, like you",
  consistency: "Keeping it going over time, like you",
  body: "Physical pain or body issues, like you",
  access: "Support out of reach, like you",
  none: "Say nothing major is in the way, like you",
  other: "",
};

/** 30.1 -> "1 in 3". Rounds to the nearest whole person. */
export function shareAsOneIn(pct: number): string {
  return `1 in ${Math.max(2, Math.round(100 / pct))}`;
}

export interface BarrierStat {
  stat: string;
  caption: string;
}

/**
 * The column for one reader.
 *
 * `other` is dropped: "Something else" says nothing anyone can be compared on.
 * Of what is left the MOST COMMON is shown, because the line's job is to tell a
 * reader they are not alone in it — the rarest barrier would say the opposite.
 * A reader whose only answer is "nothing major" gets that as its own line
 * rather than nothing, and anything unrecognised returns null so the caller can
 * fall back to the copy matrix.
 */
export function barrierStatFor(tags: readonly string[] | null | undefined): BarrierStat | null {
  if (!tags?.length) return null;
  const codes = tags
    .map(barrierCodeFor)
    .filter((c): c is BarrierCode => c !== null && c !== "other");
  if (codes.length === 0) return null;

  const informative = codes.filter((c) => c !== "none");
  const pool = informative.length > 0 ? informative : codes;
  const best = pool.reduce((a, b) => (BARRIER_SHARE[b] > BARRIER_SHARE[a] ? b : a));

  return { stat: shareAsOneIn(BARRIER_SHARE[best]), caption: BARRIER_LABEL[best] };
}
