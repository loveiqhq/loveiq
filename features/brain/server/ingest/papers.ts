/**
 * FULL TEXT OF OPEN-ACCESS PAPERS, searched only when asked for (`sources: ["paper"]`).
 *
 * `evidence` holds one citation card per construct: who has published on it, and a line of
 * each abstract. This holds the papers themselves, whole, so "what did the study find" can
 * be answered from the paper and not from 260 characters of its abstract.
 *
 * ONLY CC BY AND CC0 (Eman, 2026-09-30). Both let a company reuse the text; NC forbids
 * commercial use, ND forbids adaptation, and SA attaches terms to what we make from it. The
 * license is read twice and must pass both times: Europe PMC's search must say "cc by" or
 * "cc0", AND the article's own license statement must name a Creative Commons BY license or
 * the CC0 dedication, with no NC, ND or SA anywhere in it. A paper that fails either is
 * skipped, never stored.
 *
 * OPT-IN, like the books: a paper is 20 or 30 parts in our own vocabulary, and a few hundred
 * of them would crowd company answers out of every search. brain_search returns them only
 * when a caller names the source (migration 20260930210000).
 *
 * NONE OF IT IS LOVEIQ'S. Every part opens by naming the paper, its authors and its license
 * and by saying it is third-party work, so a part read on its own is still attributed.
 */
import { supabaseFetch } from "@features/admin/server/supabase";
import { decodeEntities } from "@shared/format/html-escape";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";

import { EUROPE_PMC_AGENT, buildQuery, constructsForDay } from "./evidence";
import { BODY_LIMIT, splitBody } from "./notion";
import { chunkPage, partBase, upsertChunks, type BrainRow } from "./upsert";

const REST = "https://www.ebi.ac.uk/europepmc/webservices/rest";
export const SOURCE = "paper";

/** The best few per construct: enough to read the field, few enough to stay a library. */
export const PAPERS_PER_CONSTRUCT = 3;
/** About 12 x 25 parts a day, well inside what the embedding backfill clears in an hour. */
export const MAX_PAPERS_PER_RUN = 12;
/** Shorter is an abstract with a heading, not a paper. */
export const MIN_TEXT_CHARS = 3_000;
/**
 * Longer is a thesis or a monograph: 60-odd parts that one question would never need, and a
 * large share of a day's embedding for one document.
 */
export const MAX_TEXT_CHARS = 150_000;

export type PaperLicense = "cc by" | "cc0";
const LICENSE_NAME: Record<PaperLicense, string> = { "cc by": "CC BY", cc0: "CC0" };

export interface PaperMeta {
  pmcid: string;
  title: string;
  firstAuthor: string | null;
  authorCount: number;
  journal: string | null;
  year: string | null;
  doi: string | null;
  license: PaperLicense;
}

const str = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s : null;
};

/** The evidence query, narrowed to papers whose full text we may store. */
export function buildPaperQuery(construct: string): string {
  return (
    `(${buildQuery(construct)}) AND OPEN_ACCESS:y AND IN_EPMC:y ` +
    `AND (LICENSE:"cc by" OR LICENSE:"cc0")`
  );
}

/** One search result, or null when it is not a paper we may store. Pure. */
export function toPaperMeta(row: Record<string, unknown>): PaperMeta | null {
  const pmcid = str(row.pmcid);
  const title = str(row.title);
  const license = (str(row.license) ?? "").toLowerCase();
  if (!pmcid || !/^PMC\d+$/.test(pmcid) || !title) return null;
  // The search filter asked for these; the answer is checked, not trusted.
  if (license !== "cc by" && license !== "cc0") return null;
  const raw = (row.pubTypeList as { pubType?: unknown } | undefined)?.pubType;
  const types = Array.isArray(raw) ? raw.map(String) : typeof raw === "string" ? [raw] : [];
  // A retracted paper, or the notice retracting one, is not evidence of anything.
  if (types.some((t) => /retract/i.test(t))) return null;
  const authors = (decodeEntities(str(row.authorString) ?? "") || "")
    .replace(/\.$/, "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  const journalInfo = row.journalInfo as { journal?: { title?: unknown } } | undefined;
  return {
    pmcid,
    title: decodeEntities(title.replace(/\.$/, "")),
    firstAuthor: authors[0] ?? null,
    authorCount: authors.length,
    journal: decodeEntities(str(journalInfo?.journal?.title) ?? "") || null,
    year: str(row.pubYear),
    doi: str(row.doi),
    license,
  };
}

/**
 * The article's OWN license, from its `<permissions>`: "cc by" for any version of CC BY,
 * "cc0" for the CC0 dedication, and null for everything else, including a license we cannot
 * read. Any NC, ND or SA term anywhere in the statement refuses it, whatever else it says.
 */
export function articleLicense(xml: string): { license: PaperLicense; url: string } | null {
  const permissions = /<permissions>([\s\S]*?)<\/permissions>/.exec(xml)?.[1] ?? "";
  if (!permissions) return null;
  const urls = [...permissions.matchAll(/https?:\/\/[^\s"'<>)]+/g)].map((m) =>
    m[0].toLowerCase().replace(/[.,;]+$/, "")
  );
  const text = decodeEntities(permissions.replace(/<[^>]+>/g, " ")).toLowerCase();
  const restricted =
    urls.some((u) => /creativecommons\.org\/licenses\/[a-z-]*(nc|nd|sa)/.test(u)) ||
    /non-?commercial|no-?deriv|share-?alike/.test(text);
  if (restricted) return null;
  const by = urls.find((u) => /creativecommons\.org\/licenses\/by\/\d/.test(u));
  if (by) return { license: "cc by", url: by };
  const zero = urls.find((u) => /creativecommons\.org\/publicdomain\/zero\//.test(u));
  if (zero) return { license: "cc0", url: zero };
  return null;
}

/** Elements that are not running text: tables, figures, maths, and the reference list. */
const NOT_PROSE =
  /<(table-wrap|fig|fig-group|disp-formula|inline-formula|supplementary-material|ref-list|fn-group|table)(?:\s[^>]*)?>[\s\S]*?<\/\1>/g;

/** JATS markup to readable text. Pure, so a test can drive it with a fixture. */
export function jatsToText(fragment: string): string {
  return (
    decodeEntities(
      fragment
        .replace(NOT_PROSE, " ")
        // A citation that names its source ("Smith et al., 2019") reads as prose and stays.
        // A bare number ("[12]") points into the reference list, which is not stored, so it
        // would be a dangling figure for check_answer to "confirm". It goes.
        .replace(/<xref(?:\s[^>]*)?>([\s\S]*?)<\/xref>/g, (_m, inner: string) =>
          /\p{L}/u.test(inner.replace(/<[^>]+>/g, "")) ? inner : ""
        )
        // A heading stays on the line above its first paragraph, so a part boundary (which
        // falls on a blank line) can never leave a heading at the foot of one part and its
        // text at the head of the next.
        .replace(/<\/title>\s*<p(?:\s[^>]*)?>/g, "</title>\n")
        .replace(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/g, "\n\n$1")
        .replace(/<\/?(?:p|sec|list|list-item|boxed-text|abstract)(?:\s[^>]*)?>/g, "\n\n")
        .replace(/<[^>]+>/g, "")
    )
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ")
      .replace(/[\u200b-\u200d\ufeff]/g, "")
      .replace(/[ \t\u00a0]+/g, " ")
      // What removed markers leave behind: "( )", "[, ]", "(; ; )", "[–]".
      .replace(/\s*[([][\s,;:\u2013\u2014-]*[)\]]/g, "")
      .replace(/ +([,.;:])/g, "$1")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/** The abstract and the body, nothing from the back matter. Empty when there is no body. */
export function articleText(xml: string): string {
  const body = /<body(?:\s[^>]*)?>([\s\S]*)<\/body>/.exec(xml)?.[1];
  if (!body) return "";
  const abstract = /<abstract(?:\s[^>]*)?>([\s\S]*?)<\/abstract>/.exec(xml)?.[1];
  const parts = [abstract ? `Abstract\n${jatsToText(abstract)}` : "", jatsToText(body)];
  return parts.filter(Boolean).join("\n\n");
}

const byline = (p: PaperMeta) =>
  p.firstAuthor ? `${p.firstAuthor}${p.authorCount > 1 ? " et al." : ""}` : "unknown authors";

/** The line every part opens with, so a part read alone still says whose it is. */
export function partHead(p: PaperMeta, part: number, parts: number): string {
  return (
    `${p.title}, ${byline(p)} (${p.year ?? "n.d."}). Open-access research under ` +
    `${LICENSE_NAME[p.license]}: third-party work, not LoveIQ's own claim. ` +
    `Part ${part} of ${parts}.`
  );
}

/** A paper as the brain stores it: every part fits the write cap WITH its head. */
export function paperRows(
  p: PaperMeta,
  text: string,
  licenseUrl: string,
  construct: string,
  stampedAt: string
): BrainRow[] {
  // Room for the longest head, plus 32 for a URL redaction the write may grow (as books).
  const widest = partHead(p, 9999, 9999).length + 1 + 32;
  const parts = splitBody(text, BODY_LIMIT - widest);
  const title = `Paper: ${p.title}, ${byline(p)}${p.year ? ` ${p.year}` : ""}`;
  return parts.map((body, i) => ({
    source: SOURCE,
    source_id: i === 0 ? `paper:${p.pmcid}` : `paper:${p.pmcid}#${i + 1}`,
    title: title + (i === 0 ? "" : ` (part ${i + 1} of ${parts.length})`),
    url: `https://europepmc.org/article/PMC/${p.pmcid}`,
    body: `${partHead(p, i + 1, parts.length)}\n${body}`,
    meta: {
      kind: SOURCE,
      pmcid: p.pmcid,
      doi: p.doi,
      journal: p.journal,
      year: p.year,
      // NOT `author`: meta.author is matched against colleagues' names, and a paper by
      // someone who shares one would be filed as that colleague's.
      first_author: p.firstAuthor,
      license: p.license,
      license_url: licenseUrl,
      construct,
      part: i + 1,
      parts: parts.length,
    },
    updated_at: stampedAt,
    // Reference material, like the books: brain_search reads a missing date as today, which
    // is harmless for a source that is a candidate only when named.
    period_end: null,
  }));
}

/** The PMCIDs already stored. Throws on a bad read: a lost page would refetch, not lose. */
export async function storedPmcids(): Promise<Set<string>> {
  const out = new Set<string>();
  for (let offset = 0; offset < 200_000; offset += 1000) {
    const res = await supabaseFetch(
      `/rest/v1/brain_chunk?select=source_id&source=eq.${SOURCE}` +
        `&order=source_id.asc&limit=1000&offset=${offset}`
    );
    const page = await chunkPage<{ source_id?: string }>(SOURCE, res);
    for (const r of page) {
      const base = partBase(String(r.source_id ?? ""));
      if (base.startsWith("paper:")) out.add(base.slice("paper:".length));
    }
    if (page.length < 1000) break;
  }
  return out;
}

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  const res = await fetchWithTimeout(url, {
    headers: { "User-Agent": EUROPE_PMC_AGENT },
    timeoutMs: 20_000,
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as Record<string, unknown> | null;
}

/** One construct's candidates. Null on a failed search, so it is counted, not hidden. */
export async function searchPapers(construct: string): Promise<PaperMeta[] | null> {
  const url =
    `${REST}/search?query=${encodeURIComponent(buildPaperQuery(construct))}` +
    `&format=json&pageSize=${PAPERS_PER_CONSTRUCT}&resultType=core`;
  try {
    const json = await getJson(url);
    const rows = (json?.resultList as { result?: unknown } | undefined)?.result;
    // A 200 with no result list is a changed or broken API, not an empty literature.
    if (!Array.isArray(rows)) return null;
    return (rows as Array<Record<string, unknown>>)
      .map(toPaperMeta)
      .filter((p): p is PaperMeta => p !== null);
  } catch (err) {
    logger.warn({ err, construct }, "papers: Europe PMC search threw");
    return null;
  }
}

/** The article XML, or null. Never throws: one paper must not take the run with it. */
export async function fetchArticle(pmcid: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(`${REST}/${pmcid}/fullTextXML`, {
      headers: { "User-Agent": EUROPE_PMC_AGENT },
      timeoutMs: 20_000,
    });
    if (!res.ok) return null;
    const xml = await res.text();
    return xml.includes("<article") ? xml : null;
  } catch (err) {
    logger.warn({ err, pmcid }, "papers: full text fetch threw");
    return null;
  }
}

export interface IngestPapersResult {
  constructs: number;
  searches: number;
  failedSearches: number;
  written: number;
  parts: number;
  skipped: {
    stored: number;
    license: number;
    noText: number;
    tooLong: number;
    unread: number;
    /** Every part refused by upsert's credential check: stored as markers, nothing searchable. */
    withheld: number;
  };
}

interface Deps {
  stored: () => Promise<Set<string>>;
  search: (construct: string) => Promise<PaperMeta[] | null>;
  article: (pmcid: string) => Promise<string | null>;
  upsert: (rows: BrainRow[]) => Promise<number>;
  pause: () => Promise<void>;
}

const LIVE: Deps = {
  stored: storedPmcids,
  search: searchPapers,
  article: fetchArticle,
  upsert: upsertChunks,
  // Europe PMC is a free public service with no key; the only thing keeping us polite is us.
  pause: () => new Promise((r) => setTimeout(r, 300)),
};

/**
 * Today's slice of constructs (the evidence rotation), their best open papers, and the full
 * text of each one not yet stored, until the run's cap or its clock. Each paper is written in
 * its own call, so a run that stops early keeps what it finished and every document's parts
 * arrive together (the leftover-part rule needs that).
 */
export async function ingestPapers(
  constructs: string[],
  dayIndex: number,
  stampedAt: string,
  isOutOfTime: () => boolean = () => false,
  deps: Deps = LIVE
): Promise<IngestPapersResult> {
  const stored = await deps.stored();
  const todays = constructsForDay(constructs, dayIndex);
  const result: IngestPapersResult = {
    constructs: todays.length,
    searches: 0,
    failedSearches: 0,
    written: 0,
    parts: 0,
    skipped: { stored: 0, license: 0, noText: 0, tooLong: 0, unread: 0, withheld: 0 },
  };
  const full = () => result.written >= MAX_PAPERS_PER_RUN || isOutOfTime();

  for (const construct of todays) {
    if (full()) break;
    if (result.searches > 0) await deps.pause();
    result.searches += 1;
    const found = await deps.search(construct);
    if (!found) {
      result.failedSearches += 1;
      continue;
    }
    for (const paper of found) {
      if (stored.has(paper.pmcid)) {
        result.skipped.stored += 1;
        continue;
      }
      if (full()) break;
      await deps.pause();
      const xml = await deps.article(paper.pmcid);
      if (!xml) {
        result.skipped.unread += 1;
        continue;
      }
      const license = articleLicense(xml);
      if (!license) {
        result.skipped.license += 1;
        continue;
      }
      const text = articleText(xml);
      if (text.length < MIN_TEXT_CHARS) {
        result.skipped.noText += 1;
        continue;
      }
      if (text.length > MAX_TEXT_CHARS) {
        result.skipped.tooLong += 1;
        continue;
      }
      // The article's own statement is the one that counts: a search that said "cc0" for a
      // CC BY paper still needs the credit a CC BY license asks for.
      const rows = paperRows(
        { ...paper, license: license.license },
        text,
        license.url,
        construct,
        stampedAt
      );
      // What upsert returns is what became searchable: a part holding a credential is
      // stored as a marker instead, and a paper that is all markers was not added.
      const indexed = await deps.upsert(rows);
      stored.add(paper.pmcid);
      if (indexed === 0) {
        result.skipped.withheld += 1;
        continue;
      }
      result.written += 1;
      result.parts += indexed;
    }
  }
  return result;
}
