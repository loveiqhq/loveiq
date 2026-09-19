/**
 * WHAT THE PUBLISHED LITERATURE SAYS ABOUT THE CONSTRUCTS WE SELL.
 *
 * For an applied psychometrics company this was the missing half. The corpus held
 * everything LoveIQ has written ABOUT the Dual Control Model and had never read a paper
 * behind it -- 24,904 chunks, none of them research. So the brain could say what we claim
 * and never what the claim rests on, which is also the root of the recurring complaint
 * that drafts read as final with nothing under them.
 *
 * SEEDED FROM OUR OWN ONTOLOGY, not from a topic sweep: the glossary is the list of
 * constructs we actually use, so the collection is bounded by the product rather than by
 * psychology at large. The scoring dimensions are deliberately NOT a separate seed --
 * their names are product phrasing ("Crave novelty / variety") that no literature search
 * matches, and the constructs under them are already glossary terms (novelty seeking,
 * contextual desire, emotional intimacy).
 *
 * THE RISK, AND IT IS THE WHOLE DESIGN. Our glossary mixes real constructs with LoveIQ
 * coinages, and a literature database answers both. Measured 2026-09-17 with a bare phrase
 * search: "base code" returned 24 papers on DNA nanopore codes, "core modalities" 18 on
 * oncology deep learning, "deep survey" 30 on multi-omics proteomics. Indexing those as
 * "the evidence for Base Code" would not be a thin evidence base, it would be a fabricated
 * one -- worse than none, because it reads as diligence.
 *
 * Two gates stop it, both measured rather than assumed:
 *
 *  1. Every paper must carry the construct AS A PHRASE IN ITS TITLE, and a subject word
 *     from our field in its title or abstract. Title rather than abstract is the load-
 *     bearing part: with abstracts allowed, "Being Chosen" produced a card citing tubal
 *     reanastomosis and a patent on antiseptics, because the words appeared in passing.
 *  2. The construct must clear MIN_HITS. Real constructs measured 13 to 5,822; the
 *     coinage survivors measured exactly 1. Five sits between them with room either side.
 *
 * A construct that fails the gates gets NO chunk, and that silence is information: it is
 * how "this chapter claims something with nothing behind it" becomes findable.
 */

import { upsertChunks, type BrainRow } from "./upsert";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";

const SEARCH = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";

/**
 * Europe PMC asks for a contact in the agent string so they can reach someone about a
 * misbehaving client rather than just blocking it.
 */
const AGENT = "loveiq-brain/1.0 (+https://www.loveiq.org; hello@loveiq.org)";

/**
 * Our field, in words that are UNAMBIGUOUS in it.
 *
 * The first version included bare `relationship`, `attachment`, `partner`, `desire` and
 * `arousal`, and every one of them leaks: papers say "the relationship between variables",
 * "cell attachment", "business partner". Measured — with those in, the coinage
 * "Anonymization" matched 31 papers and the top hit was a speaker-trait machine-learning
 * study; with them out it matches 2 and falls below the floor. Multi-word forms keep the
 * useful sense ("romantic relationship", "intimate partner") without the collisions.
 *
 * KNOWN HOLE, and it is small: a construct whose own name contains one of these words
 * satisfies the clause by itself, so the subject gate does nothing for "Fatigue And
 * Libido" or "Sexual Desire". Both are in our field anyway, which is why this is tolerable
 * rather than fixed.
 */
export const SUBJECT =
  "(sexual OR sexuality OR erotic OR intimacy OR intimate OR romantic OR libido OR orgasm OR " +
  'foreplay OR couple OR couples OR dyadic OR marital OR marriage OR "sexual desire" OR ' +
  '"romantic relationship" OR "intimate partner")';

/**
 * Literature about ORGANISMS, which our vocabulary cannot exclude on its own.
 *
 * "Sexual stage" is a phase of the Toxoplasma life cycle and "sexual readiness" is a
 * thing songbirds have. Both satisfy the subject clause above, because the clause is
 * satisfied by the word "sexual" that the construct itself supplies -- so for any
 * construct carrying a subject word the AND is decorative. Measured 2026-09-18: of 72
 * cards, 16 constructs carry such a word and two had left the field entirely.
 *
 * Excluding the organisms costs nothing measurable: Attachment Style 145 -> 145,
 * Orgasm 564 -> 564, Dual Control Model 3 -> 3, Importance of Sexuality 8 -> 8.
 */
const NOT_ORGANISM =
  "(toxoplasma OR plasmodium OR malaria OR parasite OR parasites OR gametocyte OR " +
  "oocyst OR songbird OR insect OR insects OR fungal OR fungus OR algae OR plant OR " +
  "plants OR mosquito OR helminth OR nematode OR yeast OR livestock OR poultry)";

/**
 * Terms whose literature is about something else entirely, kept as a MEASURED list
 * rather than a rule, because no rule survived measurement (see the rejected signals
 * below). Both were checked by reading the papers they actually returned.
 */
export const AMBIGUOUS_TERMS = new Set(["sexual stage", "sexual readiness"]);

/**
 * Glossary domains that describe HOW WE MEASURE rather than WHAT WE MEASURE.
 *
 * There is no literature on our own apparatus, and asking for it returns papers that merely
 * use the word. Verified against the sample: excluding these drops `Privacy`,
 * `Likert-Scale Items`, `Anonymization` and `Deep Survey`, and drops NOTHING that should
 * have been kept — the only filter tried that had no false negatives.
 */
export const EXCLUDED_DOMAINS = new Set(["Data, Privacy & Measurement", "Product & Assessment"]);

/**
 * WHAT THE GATES STILL LET THROUGH, measured and written down rather than hoped away.
 *
 * Nothing separates "a construct the literature studies" from "a phrase that occurs in our
 * field" cheaply. Four candidate signals were built and REJECTED on measurement, which is
 * worth recording so none is rebuilt:
 *
 *  - The glossary `type` field. `Privacy` and `Attachment Style` are both "Framework &
 *    Model"; `Process-Focused` and `Avoidant Attachment` are both "Trait & Disposition".
 *    It does not divide them.
 *  - A title-restricted hit count, on the theory that a real construct appears in titles.
 *    The distributions overlap outright: the drop set measured 0, 2, 3, 8, 445, 3812 and
 *    the keep set 0, 1, 14, 25, 47, 118, 217, 713, 1051, 1955. Any cut that removes
 *    "Process-Focused" also removes "Responsive Desire" and "Casual Dating".
 *  - Dropping the construct's OWN words from the subject clause, so the clause stops
 *    being satisfied by the construct echoing itself. Correct in principle and net
 *    NEGATIVE in fact: it fixed `Sexual Stage` (158 -> 1 hit, below the floor, card
 *    gone) but pushed three legitimate cards under the floor too -- `Sexual Confidence`
 *    7 -> 1, `Importance of Sexuality` 8 -> 2, and `Dual Control Model of Sexual
 *    Response` 3 -> 2, which is the single construct this corpus most needs. It also
 *    failed to fix `Sexual Readiness`, which kept its songbird at 3 hits.
 *  - `MESH:"Humans"`, on the theory that the contaminant is non-human research. Europe
 *    PMC's MeSH indexing is far too sparse: it took `Attachment Style` 145 -> 0,
 *    `Asexuality` 131 -> 0 and `Dual Control Model` 3 -> 0. It removes the corpus, not
 *    the contamination.
 *
 * MEASURED RESIDUE, from reading all 72 cards the first full pass produced rather than
 * from guessing. The title gate removed more than expected — `Process-Focused`,
 * `Partner-Focused` and `Identity & Orientation` get no card at all — and what survives is
 * a handful of generic single words: `Subjective`, `Validation`, `Ethics`, `Genital`,
 * `Orientation`. Roughly five of seventy-two.
 *
 * They cannot be filtered on length or hit count, because `Intimacy`, `Desire`, `Arousal`,
 * `Orgasm` and `Libido` are also single words with thousands of hits and are exactly the
 * constructs this exists for. Every paper on the weak ones is real and in our field; the
 * card is merely of little use. That residue is carried by the disclaimer in the body,
 * which says a paper appearing here means only that it is titled with the term — never
 * that it supports our use of it.
 *
 * NOTHING DELETES A CARD, deliberately. A construct renamed or removed from the glossary
 * keeps its card until someone clears it by hand. The alternative — sweeping anything not
 * in the current construct list — would need to tell "no longer a construct" apart from
 * "not in today's slice", and at seventy-two rows the stale card costs less than the sweep
 * that gets that distinction wrong.
 */

/**
 * How many papers must be ABOUT the construct before we will say a literature exists.
 *
 * Re-measured against the title-restricted query, where the two groups finally separate
 * with a gap between them rather than overlapping:
 *
 *   0  Being Chosen, Flow States, Casual Dating, Likert-Scale Items
 *   1  Process-Focused (its one paper is about seizure risk in transcranial stimulation)
 *   1  Identity & Orientation, Responsive Desire
 *   ---------------------------------------------------------------- floor
 *   7  Emotional Needs          10  Endorphins        14  Sexual Script
 *  20  Avoidant Attachment     145  Attachment Style  1051 Sexual Desire
 *
 * Three sits in the gap. It costs us "Responsive Desire", which is a real construct with
 * exactly one titled paper under that name — and that is the right way to be wrong here.
 * A gap is recoverable and an invented citation list is not, so silence wins ties.
 */
export const MIN_HITS = 3;

/** Enough to be evidence, few enough that the chunk stays readable. */
export const PAPERS_PER_CONSTRUCT = 5;

/**
 * The rotation. 323 constructs over this many days is about eleven a run, which keeps one
 * run far inside the function ceiling and refreshes everything monthly — far faster than
 * the literature on a construct actually moves.
 */
export const CYCLE_DAYS = 30;

export interface Paper {
  title: string;
  journal: string | null;
  year: string | null;
  doi: string | null;
  citedBy: number;
  openAccess: boolean;
  abstract: string | null;
}

export interface EvidenceResult {
  /** Total matches in Europe PMC, which is the signal the construct is real. */
  hitCount: number;
  papers: Paper[];
}

const str = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s : null;
};

/**
 * The exact query, exported so a test can assert both gates are in it.
 *
 * `TITLE:` FOR THE CONSTRUCT, and that one word is the difference between an evidence base
 * and a fabricated one. Searching title-OR-abstract matched papers that mention the phrase
 * in passing, and a dry run showed what that produces: "Being Chosen" cleared the floor on
 * six abstract matches and generated a card citing tubal reanastomosis, a study of The
 * Bachelor, children's competitive altruism, and a 1993 patent on antiseptic compositions.
 * Not one was evidence for anything.
 *
 * Restricting the construct to the TITLE means a paper is listed only when it is ABOUT the
 * construct. Measured on the same terms: "Being Chosen", "Flow States", "Casual Dating" and
 * "Likert-Scale Items" fall to zero, while "Endorphins" returns "Endorphins, Sexuality, and
 * Reproduction" and "Emotional Needs" returns "Personality typology, emotional needs, and
 * romantic relationships".
 *
 * The subject clause stays on TITLE_ABS, where it belongs: a paper about attachment style
 * in couples may only say "couples" in the abstract.
 */
export function buildQuery(construct: string): string {
  // Quotes stripped rather than escaped: a stray quote would end the phrase early and
  // silently widen the search to whatever followed it.
  const phrase = construct.replace(/["\\]/g, " ").trim();
  return `TITLE:"${phrase}" AND TITLE_ABS:${SUBJECT} NOT TITLE_ABS:${NOT_ORGANISM}`;
}

/** Shapes one Europe PMC result. Pure, so the mapping is testable without the network. */
export function toPaper(row: Record<string, unknown>): Paper | null {
  const title = str(row.title);
  if (!title) return null;
  const journalInfo = row.journalInfo as { journal?: { title?: unknown } } | undefined;
  const cited = Number(row.citedByCount);
  return {
    // Europe PMC ends most titles with a full stop; two in a row reads as a typo.
    title: title.replace(/\.$/, ""),
    journal: str(journalInfo?.journal?.title),
    year: str(row.pubYear),
    doi: str(row.doi),
    citedBy: Number.isFinite(cited) ? cited : 0,
    openAccess: row.isOpenAccess === "Y",
    abstract: str(row.abstractText),
  };
}

/** One search. Never throws — a vendor outage must not take the rest of the run with it. */
export async function searchEvidence(construct: string): Promise<EvidenceResult | null> {
  const url =
    `${SEARCH}?query=${encodeURIComponent(buildQuery(construct))}` +
    `&format=json&pageSize=${PAPERS_PER_CONSTRUCT}&resultType=core`;
  try {
    const res = await fetchWithTimeout(url, {
      headers: { "User-Agent": AGENT },
      timeoutMs: 20_000,
    });
    if (!res.ok) {
      logger.warn({ status: res.status, construct }, "evidence: Europe PMC refused");
      return null;
    }
    const json = (await res.json()) as {
      hitCount?: unknown;
      resultList?: { result?: unknown };
    };
    const hitCount = Number(json.hitCount);
    const rows = Array.isArray(json.resultList?.result)
      ? (json.resultList.result as Array<Record<string, unknown>>)
      : [];
    return {
      hitCount: Number.isFinite(hitCount) ? hitCount : 0,
      papers: rows.map(toPaper).filter((p): p is Paper => p !== null),
    };
  } catch (err) {
    logger.warn({ err, construct }, "evidence: Europe PMC search threw");
    return null;
  }
}

/** Enough of the abstract to judge whether the paper is worth opening. */
const SNIPPET = 260;

/**
 * ONE CHUNK PER CONSTRUCT, not one per paper.
 *
 * A chunk per paper would be several hundred third-party abstracts, each dense with our
 * own vocabulary and competing with our own records on every question — the drowning that
 * cost two battery probes when 341 glossary chunks landed. A citation list per construct
 * answers the question this exists for ("what is the evidence for X") in one hit, is a
 * third of the size, and cannot be mistaken for our own writing because it is visibly a
 * list of other people's papers.
 */
export function buildEvidenceRow(
  construct: string,
  result: EvidenceResult,
  stampedAt: string
): BrainRow | null {
  if (result.hitCount < MIN_HITS || result.papers.length === 0) return null;

  const lines = result.papers.map((p) => {
    const where = [p.journal, p.year].filter(Boolean).join(", ");
    const cited = p.citedBy > 0 ? `, cited ${p.citedBy}×` : "";
    const doi = p.doi ? `\n    doi: ${p.doi}${p.openAccess ? " (open access)" : ""}` : "";
    const gist = p.abstract ? `\n    ${p.abstract.slice(0, SNIPPET).replace(/\s+/g, " ")}…` : "";
    return `  • ${p.title}${where ? ` (${where}${cited})` : cited}${doi}${gist}`;
  });

  const body = [
    `Published research whose TITLE contains “${construct}”, from Europe PMC — so each paper ` +
      `is about the construct rather than merely mentioning it.`,
    "",
    "THIS IS OTHER PEOPLE'S WORK, NOT LOVEIQ'S. Nothing here has been reviewed or endorsed",
    "by us, the findings may disagree with each other and with our own material, and a paper",
    "appearing here means only that it is titled with the term in our field — not that it supports how",
    `we use it. Cite it as the paper, never as “LoveIQ found”.`,
    "",
    `${result.hitCount} papers match in total; the ${result.papers.length} most relevant are listed.`,
    "",
    ...lines,
  ].join("\n");

  return {
    source: "evidence",
    source_id: `evidence:${construct
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}`,
    title: `Research on ${construct} — published literature`,
    url: `https://europepmc.org/search?query=${encodeURIComponent(buildQuery(construct))}`,
    body,
    meta: {
      kind: "evidence",
      construct,
      hitCount: result.hitCount,
      papers: result.papers.length,
      provider: "europepmc",
    },
    updated_at: stampedAt,
    /**
     * Null: a citation list is reference material with no date it describes. Dating it
     * with today would make it compete with dated records on recency, which is the
     * ranking mistake the reference demotion already exists to undo.
     */
    period_end: null,
  };
}

/**
 * Which constructs this run looks at.
 *
 * A deterministic slice by day, so the rotation needs no cursor table and cannot drift:
 * every construct is refreshed once per CYCLE_DAYS, and a run that dies simply loses that
 * day rather than losing its place.
 */
export function constructsForDay(all: string[], dayIndex: number): string[] {
  const cycle = Math.max(1, CYCLE_DAYS);
  const slot = ((dayIndex % cycle) + cycle) % cycle;
  return all.filter((_, i) => i % cycle === slot);
}

/**
 * The constructs worth asking the literature about: every glossary term except the ones
 * describing our own measurement apparatus. Takes the glossary as an argument rather than
 * importing it, so a test can drive this with three terms instead of 323.
 */
export function researchableConstructs(
  glossary: Array<{ term?: unknown; domain?: unknown }>
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of glossary) {
    const term = typeof t.term === "string" ? t.term.trim() : "";
    if (!term) continue;
    if (EXCLUDED_DOMAINS.has(String(t.domain))) continue;
    if (AMBIGUOUS_TERMS.has(term.toLowerCase())) continue;
    // Deterministic order matters: the daily slice is taken by index, so a wobble in
    // ordering would re-check some constructs and starve others.
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

export interface IngestEvidenceResult {
  looked: number;
  written: number;
  /** Constructs the literature does not know, which is a finding rather than a failure. */
  belowFloor: number;
  failed: number;
}

export async function ingestEvidence(
  constructs: string[],
  dayIndex: number,
  stampedAt: string,
  isOutOfTime: () => boolean = () => false
): Promise<IngestEvidenceResult> {
  const todays = constructsForDay(constructs, dayIndex);
  const rows: BrainRow[] = [];
  let looked = 0;
  let belowFloor = 0;
  let failed = 0;

  for (const construct of todays) {
    if (isOutOfTime()) break;
    // Paced, because Europe PMC is a free public service with no key and no quota — the
    // only thing stopping us being rude to it is us. Ten constructs a day means this costs
    // three seconds a run.
    if (looked > 0) await new Promise((r) => setTimeout(r, 300));
    looked += 1;
    const result = await searchEvidence(construct);
    if (!result) {
      failed += 1;
      continue;
    }
    const row = buildEvidenceRow(construct, result, stampedAt);
    if (row) rows.push(row);
    else belowFloor += 1;
  }

  const written = rows.length === 0 ? 0 : await upsertChunks(rows);
  return { looked, written, belowFloor, failed };
}
