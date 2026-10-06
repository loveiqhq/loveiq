/**
 * Load the books we keep in Drive into the brain, as source `book`.
 *
 * Eleven third-party books on love, desire and sex, the ones relevant to what LoveIQ
 * measures (decided 2026-09-28). Three other books in the same folder (leadership,
 * habits, persuasion) stay out, and all fourteen stay out of the Drive walk: see
 * SKIP_FILE_IDS in features/brain/server/ingest/drive.ts.
 *
 * OPT-IN, and that is the design: `brain_search` returns a `book` row only when the
 * caller asks for the source (migration 20260928010000). About 3,200 pages on the
 * product's own vocabulary would otherwise crowd company answers out of the semantic
 * top-120 before any demotion applied.
 *
 * Whole books, not the Drive walk's first 400,000 characters: a library that silently
 * stops halfway through a book answers "what does it say about X" with "nothing".
 * Every part says in its own text that it is someone else's work, so no excerpt can
 * read as a LoveIQ claim.
 *
 * Static by nature, so run by hand, not on a schedule. Safe to re-run: parts are
 * upserted by id, and leftover parts of a book that got shorter are deleted.
 *
 *   npm run brain:books                            # write
 *   npm run brain:books -- --dry                   # count parts, write nothing
 *   npm run brain:books -- --only "Bonk,Erotism"   # just these titles
 *
 * Load in halves of about 1,500 parts and let the embeddings drain in between:
 * brain-fast alerts when more than 2,000 chunks are waiting, and a load this size is
 * not a fault anyone needs to hear about.
 */

import { extractText, getDocumentProxy } from "unpdf";

import { BODY_LIMIT, splitBody } from "@features/brain/server/ingest/notion";
import { upsertChunks, type BrainRow } from "@features/brain/server/ingest/upsert";
import { DRIVE_SCOPE, getDelegatedToken } from "@shared/http/google-oauth";

/** Drive file id → the book. The files are owned by teamwork@ and readable by ec@. */
export const BOOKS = [
  { id: "1rz74juprM1AaD6uYQGtFaATisFeiLLRA", title: "Why We Love", author: "Helen Fisher" },
  { id: "13DIy7VHqC9kRej_u2Cz2esDS8AmdGD79", title: "Mating in Captivity", author: "Esther Perel" },
  { id: "1l98gvhLBXhbFf5wq3plctq7V9n-2Jx9z", title: "Come As You Are", author: "Emily Nagoski" },
  {
    id: "1hnM-VS1B3BAe3LHFRviEsAPRMdi3j_2z",
    title: "The Psychology of Human Sexuality",
    author: "Justin J. Lehmiller",
  },
  {
    id: "1qYkpYT1qCsDVK9RLM6vFh-hYctVWa02E",
    title: "Magnificent Sex",
    author: "Peggy J. Kleinplatz and A. Dana Ménard",
  },
  { id: "1bfIb9WMlptdXDXnmp551QycCI7hYlg8x", title: "The Hite Report", author: "Shere Hite" },
  {
    id: "1VE2ia5QOxvnXXrvP4qxWyKU1bigkFdgu",
    title: "Sex at Dawn",
    author: "Christopher Ryan and Cacilda Jethá",
  },
  {
    id: "1FoZvl6x7jp5Wlcik9XKfYJeXvX_Ifixt",
    title: "The Ethical Slut",
    author: "Dossie Easton and Janet W. Hardy",
  },
  {
    id: "1WDJ-weS-2WKa_I2oqhjGrMDpJ7jvT9mU",
    title: "Women's Anatomy of Arousal",
    author: "Sheri Winston",
  },
  { id: "1aSbmxqaOOmgX82AAanW-yQfC6kTBdnPp", title: "Bonk", author: "Mary Roach" },
  { id: "1NhDPQYzkYIqpJU3ltCnM_rK0sq3xyjSl", title: "Erotism", author: "Georges Bataille" },
] as const;

type Book = (typeof BOOKS)[number];

/** The line every part opens with, so an excerpt can never read as our own claim. */
export function partHead(book: Book, part: number, parts: number): string {
  return (
    `${book.title} by ${book.author}. A third-party book in our library, not LoveIQ's ` +
    `own claim. Part ${part} of ${parts}.`
  );
}

/** A book's text as the brain stores it: every part fits the write cap WITH its head. */
export function bookRows(book: Book, text: string, stampedAt: string): BrainRow[] {
  // Sized for the longest head this book can have, so no part is cut at the write cap, and
  // 32 characters more: the write redacts secrets in URLs BEFORE the cap, and a redaction
  // can be longer than what it replaces ("&code=12" becomes "&code=[redacted]").
  const widest = partHead(book, 9999, 9999).length + 1 + 32;
  const parts = splitBody(text, BODY_LIMIT - widest);
  return parts.map((body, i) => ({
    source: "book",
    source_id: i === 0 ? `book:${book.id}` : `book:${book.id}#${i + 1}`,
    title:
      `Book: ${book.title}, ${book.author}` +
      (i === 0 ? "" : ` (part ${i + 1} of ${parts.length})`),
    url: `https://drive.google.com/file/d/${book.id}/view`,
    body: `${partHead(book, i + 1, parts.length)}\n${body}`,
    meta: {
      kind: "book",
      book: book.title,
      author: book.author,
      part: i + 1,
      parts: parts.length,
      drive_file_id: book.id,
    },
    updated_at: stampedAt,
    // Reference material describes no date. brain_search scores a missing date as today,
    // which is harmless here: a book row is a candidate only when books are asked for.
    period_end: null,
  }));
}

/** Plain text: control characters out, runs of spaces folded, paragraph breaks kept. */
export function cleanBookText(raw: string): string {
  return raw
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function main(): Promise<void> {
  const dry = process.argv.includes("--dry");
  const onlyAt = process.argv.indexOf("--only");
  const only =
    onlyAt > -1 ? (process.argv[onlyAt + 1] ?? "").split(",").map((t) => t.trim()) : null;
  const chosen = BOOKS.filter((b) => !only || only.includes(b.title));
  if (only && chosen.length !== only.length) {
    throw new Error(`--only names a title that is not in BOOKS: ${only.join(", ")}`);
  }
  const token = await getDelegatedToken("ec@loveiq.org", DRIVE_SCOPE);
  if (!token) throw new Error("no Drive access for ec@loveiq.org");
  const stampedAt = new Date().toISOString();
  let total = 0;
  let failed = 0;
  for (const book of chosen) {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${book.id}?alt=media&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      console.error(`${book.title}: Drive answered ${res.status}`);
      failed++;
      continue;
    }
    const pdf = await getDocumentProxy(new Uint8Array(await res.arrayBuffer()));
    const { text } = await extractText(pdf, { mergePages: true });
    const clean = cleanBookText(String(text));
    if (clean.length < 10_000) {
      console.error(`${book.title}: only ${clean.length} characters of text (a scan?), skipped`);
      failed++;
      continue;
    }
    const rows = bookRows(book, clean, stampedAt);
    const wrote = dry ? 0 : await upsertChunks(rows);
    console.log(`${book.title}: ${rows.length} parts${dry ? " (dry run)" : `, ${wrote} written`}`);
    total += rows.length;
  }
  console.log(
    `${total} parts across ${chosen.length - failed} books${failed ? `, ${failed} failed` : ""}`
  );
  if (failed) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("brain-books.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
