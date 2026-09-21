import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import {
  DRIVE_SCOPE,
  getDelegatedToken,
  getGoogleAccessToken,
  googleCredentialShape,
  isGoogleConfigured,
} from "@shared/http/google-oauth";
import logger from "@shared/observability/logger";
import { supabaseFetch } from "@features/admin/server/supabase";
import { splitBody } from "./notion";
import { looksLikeWhatsAppExport, whatsappRows } from "./whatsapp";
import { domainMailboxes } from "./gmail";
import {
  chunkPage,
  recordSweep,
  shouldSweep,
  sweepMissing,
  upsertChunks,
  type BrainRow,
  type IngestResult,
} from "./upsert";

/**
 * Google Drive documents — in practice the Gemini notes written after each call.
 *
 * WHY DRIVE AND NOT GMAIL. The notes arrive as an email, but that email is only a
 * notification: the note itself is a Google Doc, which exports to clean text.
 * Parsing the mail body would mean guessing at HTML that Google can change at any
 * time, for a worse result.
 *
 * SCOPE IS CONTROLLED BY SHARING, NOT BY CONFIGURATION. This indexes every Google
 * Doc the service account can see, and it can see nothing by default — a folder
 * has to be shared with
 * `ga4-reader@loveiq-brain.iam.gserviceaccount.com` as Viewer. That is
 * deliberately the same shape as the Notion integration: the boundary is what
 * somebody chose to share, which is visible and revocable in Drive itself, rather
 * than an env var nobody remembers setting. It also means this file needs no
 * allow-list and cannot silently widen.
 *
 * The credential is the same one GA4 and Search Console use. A service account can
 * only reach USER-owned Drive files through sharing or domain-wide delegation, and
 * sharing is the smaller of the two.
 */

const SOURCE = "drive";
const API = "https://www.googleapis.com/drive/v3";
const TIMEOUT_MS = 20_000;
const PAGE_SIZE = 100;
/**
 * How many documents may fail to export before the WALK is called incomplete.
 *
 * Drive was the only source that gave up on the first one: calendar tolerates
 * 10 unreachable calendars and gmail 10 unreadable threads, both counting
 * failures and comparing at the end. Drive called `stop()` inside the catch, so
 * a single permanently-unexportable file marked every run incomplete forever.
 *
 * Measured 2026-09-17: one document — id begins `1bunyq5j`, and the full id is in the
 * ingest logs rather than here because this repository is public — has failed on
 * 224 consecutive runs since 2026-09-08, and drive has not reported a complete
 * walk once in that time — 0 of ~240. The sweep was never affected (it gates on
 * the LISTING, not the fetch), but the source has been reporting degraded for
 * ten days over one file, which is exactly the alert nobody reads any more.
 */
const MAX_TOLERATED_EXPORT_FAILURES = 10;

const MAX_PAGES = 20;

/** Bump when the row SHAPE changes; a mismatch counts as stale. See notion.ts. */
// v3: v1-v2 indexed Google Docs only — 24 call notes out of ~494 readable files on
// the company Drive. Sheets, markdown, CSV, JSON and Word documents were invisible.
// v4: v3 read only the FIRST TAB of every spreadsheet, because it exported them as
// csv and csv holds one table. 40 spreadsheets were indexed that way. Without this
// bump the fix is inert on all of them: a file is refetched only when its
// `modifiedTime` moves, and "Business Case" has not been edited since 2026-09-16,
// so the tab nobody could find would have stayed missing until somebody typed in it.
export const DRIVE_BUILDER_VERSION = 4;

const DOC_MIME = "application/vnd.google-apps.document";
const SHEET_MIME = "application/vnd.google-apps.spreadsheet";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PDF_MIME = "application/pdf";

/**
 * Cap on the text taken from ONE pdf, ~167 chunks at BODY_LIMIT.
 *
 * Not theoretical: a single Drive file ("Pitchbook Investors Data") is already
 * 3,242 chunks -- 13% of the whole corpus, and 13% of the embedding budget, from
 * one data export. Nothing stopped it, because no source caps a single document.
 * A 300-page contract fits comfortably under this; a data dump does not.
 *
 * Caps the NEW source only. The oversized documents that predate it needed a
 * person's decision rather than a rule, and got one on 2026-09-06 --
 * see SKIP_FILE_IDS below.
 */
const PDF_TEXT_LIMIT = 400_000;

/**
 * Documents this ingester indexes nothing from.
 *
 * AN EXPLICIT ID LIST, NOT A RULE, and that is the whole point. The obvious rule
 * -- "drop the big PDFs" -- destroys the fourteen `LoveIQ_*_Preview.pdf` files,
 * which are 58-60 parts each of our OWN product and the only thing in the corpus
 * that can answer what a given archetype's report actually says. It would also
 * take the PhD thesis and the research papers, which are the sourcing behind
 * user-facing claims. No size, extension or folder test separates those from a
 * trade paperback; only a human reading the titles does.
 *
 * What is here: one investor data export at 3,242 chunks (10.5% of the entire
 * corpus, from a spreadsheet), and fourteen third-party books at ~170 parts each.
 * Together roughly 18% of everything indexed, none of it anything LoveIQ knows
 * about itself -- and measured, they surface as top hits on questions they cannot
 * answer, because a 2,400-character book page matches almost any vocabulary.
 *
 * Kept deliberately: the academic sources. Decision recorded 2026-09-06.
 */
/* eslint-disable no-secrets/no-secrets -- Google Drive FILE IDS, not credentials.
   They appear in every Drive URL, and each is already stored in this corpus as
   `brain_chunk.source_id` and inside each chunk's public `url`. Scoped rather
   than file-level so a real secret added below this block is still caught. */
const SKIP_FILE_IDS = new Set([
  "1CK4rTwWyL9NPDrGNTTzy2-ElZGBuZ9PFh4eWa58b-2M", // Pitchbook Investors Data (3,242)
  "1IM31OqVpLOl9Rs7Z3ndixKWeYqHX2xkp", // The 15 Commitments of Conscious Leadership.pdf
  "1l98gvhLBXhbFf5wq3plctq7V9n-2Jx9z", // Come As You Are.pdf
  "1RwRoB-igQqsvzE6LHno97G8WwqynTy6S", // The 7 Habits of Highly Effective People.pdf
  "1hnM-VS1B3BAe3LHFRviEsAPRMdi3j_2z", // The Psychology of Human Sexuality.pdf
  "1qYkpYT1qCsDVK9RLM6vFh-hYctVWa02E", // Magnificent Sex.pdf
  "1NhDPQYzkYIqpJU3ltCnM_rK0sq3xyjSl", // Erotism.pdf
  "1WDJ-weS-2WKa_I2oqhjGrMDpJ7jvT9mU", // Womens Anatomy of Arousal.pdf
  "1gR4xfkr6TyPRaz0Io2m-Wf7BwufnEnx-", // Methods of Persuasion.pdf
  "1rz74juprM1AaD6uYQGtFaATisFeiLLRA", // Why We Love.pdf
  "13DIy7VHqC9kRej_u2Cz2esDS8AmdGD79", // Mating in Captivity.pdf
  "1FoZvl6x7jp5Wlcik9XKfYJeXvX_Ifixt", // The Ethical Slut.pdf
  "1bfIb9WMlptdXDXnmp551QycCI7hYlg8x", // The Hite Report.pdf
  "1VE2ia5QOxvnXXrvP4qxWyKU1bigkFdgu", // Sex at Dawn.pdf
  "1aSbmxqaOOmgX82AAanW-yQfC6kTBdnPp", // Bonk.pdf

  //
  // A SIBLING PRODUCT'S ENGINEERING DOCS, 20 files and 121 chunks. Same decision as
  // its issue-tracker mail (GMAIL_EXCLUDE_SUBJECTS) and for the same measured reason,
  // taken one step later: with that mail gone, THESE took rank 1 on three of twenty
  // ordinary LoveIQ questions -- "what is the status of the backend work", "what
  // analytics and tracking do we have", "what is the plan for sign in and accounts".
  // Per chunk they were worse than the 1,308 mails, because a long-form title
  // ("Backend Foundation Report", "Analytics Summary") matches generic engineering
  // wording and the title carries double weight in the ranker.
  //
  // Ids rather than a title or folder rule: four of the twenty carry no trace of the
  // project in their filename and would survive any name test, and no size or folder
  // test separates them from our own docs. Deliberately UNLABELLED here -- the file
  // ids are already public in every chunk's url, but the project's name is not, and
  // this repository is public. Verified before removal: none of the twenty contains
  // LoveIQ content. Thirteen chunks match the string "LoveIQ" and all thirteen are
  // the Atlassian hostname in a ticket url, not our product.
  //
  "1AxlHrIVgycXHlVWOtc-YMaUFJzb7jzYh", // sibling project, 2 chunks
  "1m4bdzMVjzoEcnZW36OH2sPzSMmIYHMnB", // sibling project, 2 chunks
  "1rZyQIk2tk11bHOyXz_653cBkNwQNY70f", // sibling project, 4 chunks
  "1bMAv-8gS1dFFzhLi1QcNn5dlWs5Wybf7", // sibling project, 5 chunks
  "1ErNBksqyb0rnKq6uWuUfxPUZnInIZwkC", // sibling project, 4 chunks
  "1_BPPebFUwiKZK7YN1r3oeJDE4fcAO0nu", // sibling project, 6 chunks
  "1SKbX_eJkgMy-1ZdmxVt7vq6fRX2sGYDe", // sibling project, 3 chunks
  "1Mk2utAPMa0_o20UJjWVMJw9Ep104OG5m", // sibling project, 4 chunks
  "1jy5P4HfVfUqlqixnaDd-TurpHQWcZvKn", // sibling project, 5 chunks
  "1bgXowHv0oQKY4lBvl1bvA_6Zbkh9UNNX", // sibling project, 3 chunks
  "1ZM0APARBf5dmgv15dQ47FXjxOUOqHgUq", // sibling project, 9 chunks
  "1-VodwT9lGUF3CkQd_0E8VqHE-ufylDdL", // sibling project, 4 chunks
  "1TYrhNkRorQxVOWR4O6_uu7Ka6BrZJdmv", // sibling project, 24 chunks
  "1SrWmoox8w9o5Y6vZcUFmheeTrgGQ8CiK", // sibling project, 5 chunks
  "1118DEybDx5mDZBST0l1zrAaqlCTX3Lyy", // sibling project, 10 chunks
  "1CdI8DqPBblaWO-yyF7kxh26Lea0NKSSR", // sibling project, 6 chunks
  "1i3Zo0MNbZ8OKRZQg83i0emuQjDumPx3Y", // sibling project, 6 chunks
  "1XVHkrtsCPQTQap0rujC7n02PElqqqE5s", // sibling project, 5 chunks
  "1aBr687qwORqJrHmju18eNLAwo-R6tl6Y", // sibling project, 7 chunks
  "1wTYYD4it-lnlVJ0pUOMWvOu6hNHe7wh5", // sibling project, 5 chunks
]);
/* eslint-enable no-secrets/no-secrets */

/**
 * Google's own divider between Gemini's written notes and the raw transcript.
 * Verified present in 114 of 114 meeting notes in the corpus. Google's string,
 * not ours, so if they change it this fails loudly (section unset + a warning)
 * rather than mislabelling half of every note.
 */
const TRANSCRIPT_DIVIDER = /You should review Gemini's notes to make sure they'?re accurate/i;

/**
 * The two halves of a Gemini meeting note.
 *
 * Exported because the `search_company_context` tool description tells callers to
 * filter on these EXACT strings — `{"section": "summary"}` is how you ask for what
 * was decided rather than what was said. A rename here would leave that description
 * pointing at a value nothing emits, which is a tool that lies rather than one that
 * errors, so a test couples the two.
 */
export const DRIVE_SECTIONS = ["summary", "transcript"] as const;
export type DriveSection = (typeof DRIVE_SECTIONS)[number];

/** Below this, a pdf is a scan with no text layer, and indexing it yields a
 *  title-shaped chunk with no content. We have no OCR, so it is skipped. */
const PDF_MIN_CHARS = 200;

/**
 * EVERY FILE ON THE COMPANY DRIVE WE CAN TURN INTO TEXT, not just meeting notes.
 *
 * This used to fetch Google Docs alone, which was 24 call notes. The Drive that
 * ec@loveiq.org can see actually holds 980 items: 284 Docs, 213 PDFs, 141 folders,
 * 98 markdown files, 43 Word documents, 39 Sheets and 20 CSVs. Everything except
 * the meeting notes was invisible to the brain.
 *
 * Three ways to get text out, by type:
 *  - Google Docs and Sheets EXPORT (Docs to text, Sheets to CSV).
 *  - Plain-text formats DOWNLOAD as-is (`alt=media`).
 *  - `.docx` downloads and goes through `mammoth`, which is already a dependency.
 *
 *  - PDFs DOWNLOAD and go through `unpdf`. Drive refuses to export them ("Export
 *    only supports Docs Editors files", HTTP 403), so the bytes are fetched and
 *    the text layer read locally. A scan with no text layer is skipped rather
 *    than indexed as an empty husk -- there is no OCR here.
 */
const PLAIN_MIMES = new Set([
  "text/markdown",
  "text/plain",
  "text/csv",
  "application/json",
  "text/html",
]);

/** Everything the listing asks for, as a Drive `q` fragment. */
const WANTED_MIMES = [DOC_MIME, SHEET_MIME, DOCX_MIME, PDF_MIME, ...PLAIN_MIMES];

/**
 * Google Meet does not always put the note IN the meeting folder — for meetings
 * organised by someone else it drops a SHORTCUT pointing at a document in their
 * Drive. Measured in the LoveIQ `Google Meet` folder: one series holds 23 real
 * documents, and three others hold nothing but shortcuts, one of which points at a
 * video. So a query for documents alone finds 23 of 24 available notes.
 */
const SHORTCUT_MIME = "application/vnd.google-apps.shortcut";

interface DriveFile {
  id?: string;
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
  createdTime?: string;
  webViewLink?: string;
  owners?: Array<{ emailAddress?: string }>;
  shortcutDetails?: { targetId?: string; targetMimeType?: string };
}

/**
 * Statuses Drive returns transiently under completely normal operation. Google documents
 * the remedy as retry-with-backoff; the API is explicitly not expected to be 100%.
 */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [400, 1200];

/**
 * One Drive request, retried on a transient refusal.
 *
 * WHY THIS MATTERS MORE THAN IT LOOKS. The listing walk gave up permanently on the first
 * non-ok response, so a single 500 on page 4 of 8 ended the whole walk — and because the
 * sweep only runs after a COMPLETE walk, no deleted document was ever removed from the
 * corpus. On 2026-09-13 that was the live state: `stopped=listing-refused@p4:500`, with
 * nothing in the alert reading as a failure. Retrying here rather than in the listing
 * loop fixes the export path too, which was failing the same way (`stopped=export-failed`).
 *
 * A 4xx that is not 429 is the caller's fault and is returned immediately: retrying a
 * 403 just spends the time budget arriving at the same answer.
 */
async function driveGet(token: string, path: string): Promise<Response> {
  let res: Response | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, BACKOFF_MS[attempt - 1] ?? 1200));
      logger.info({ attempt, status: res?.status }, "brain-ingest drive: retrying");
    }
    // An absolute URL passes through, so the Sheets API reuses this retry/backoff
    // instead of growing a second copy of it.
    res = await fetchWithTimeout(path.startsWith("https://") ? path : `${API}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      timeoutMs: TIMEOUT_MS,
    });
    if (!RETRYABLE.has(res.status)) return res;
  }
  // Out of attempts: hand back the last refusal so the caller names it as it always did.
  return res as Response;
}

/** Every Google Doc the service account can see. */
async function listDocs(
  token: string,
  isOutOfTime: () => boolean
): Promise<{ items: DriveFile[]; complete: boolean; stopped?: string }> {
  const out: DriveFile[] = [];
  let complete = true;
  /**
   * WHICH of the ways to stop actually happened, first one wins.
   *
   * `complete=false` alone is not a diagnosis. Measured 2026-09-07, brain-drive had
   * reported it on 21 of 21 runs with no way to tell a listing cap from a refused
   * page from the clock — and the three want completely different fixes. Gmail
   * already learned this and named its exits; this is the same idea.
   */
  let stopped: string | undefined;
  const stop = (why: string) => {
    complete = false;
    stopped ??= why;
  };
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    if (isOutOfTime()) {
      stop(`time-budget@listing:p${page}`);
      break;
    }
    // Shortcuts come back in the same query so a second pass is not needed.
    const q = encodeURIComponent(
      `(${[...WANTED_MIMES, SHORTCUT_MIME].map((m) => `mimeType='${m}'`).join(" or ")}) ` +
        `and trashed=false`
    );
    const fields = encodeURIComponent(
      "nextPageToken,files(id,name,mimeType,modifiedTime,createdTime,webViewLink," +
        "owners(emailAddress),shortcutDetails(targetId,targetMimeType))"
    );
    const res = await driveGet(
      token,
      `/files?q=${q}&fields=${fields}&pageSize=${PAGE_SIZE}` +
        `&includeItemsFromAllDrives=true&supportsAllDrives=true` +
        (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "")
    );
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      logger.warn({ status: res.status, detail }, "brain-ingest drive: list failed");
      return { items: out, complete: false, stopped: `listing-refused@p${page}:${res.status}` };
    }
    const json = (await res.json().catch(() => null)) as {
      files?: DriveFile[];
      nextPageToken?: string;
    } | null;
    for (const f of json?.files ?? []) if (f.id) out.push(f);
    pageToken = json?.nextPageToken;
    if (!pageToken) break;
    // The cap is PAGE_SIZE * MAX_PAGES documents. Named separately because hitting it
    // is a capacity decision to revisit, not a fault to chase.
    if (page === MAX_PAGES - 1) stop(`page-cap@${MAX_PAGES}x${PAGE_SIZE}`);
  }
  return { items: out, complete, stopped };
}

/**
 * Everything in a COLLEAGUE'S Drive, not just the admin's.
 *
 * THE GAP THIS CLOSES, measured 2026-09-19. This walk reads as one account, so it
 * sees only what that account owns or has been shared. Impersonating each colleague
 * in turn and diffing showed 124 documents invisible to it, 97 of them one person's.
 * `resolveShortcuts` below names one cause: Meet files a meeting note in the
 * ORGANISER's Drive, so every meeting we did not organise was unreadable.
 *
 * WIDENED FROM MEETING NOTES TO EVERYTHING, on an explicit decision recorded
 * 2026-09-21. The narrow version indexed only files matching `notes by gemini`,
 * because reading a colleague's whole Drive also reaches documents that are theirs
 * rather than the company's. That trade was put to the owner and the answer was to
 * index everything, so the rule is now the same one the admin walk uses: the file
 * types below, not trashed, minus the three exclusions every listed file passes
 * through in `ingestDrive` — `SKIP_FILE_IDS`, `isVendorBilling` and
 * `isJobApplication`.
 *
 * WHAT THAT MEANS IN PRACTICE, so nobody is surprised by it. The set now reachable
 * includes a shareholders agreement, employee option terms and a confidential
 * information memorandum — deliberate — and also a colleague's landlord dispute:
 * eviction demand, dunning letters, deposit settlement. Those last are a person's
 * private affairs that happen to sit in a work Drive. They are in scope under the
 * decision above; if that is reconsidered, `SKIP_FILE_IDS` is the mechanism, which
 * is exactly why it is an explicit id list rather than a rule.
 *
 * CVs stay out regardless — `isJobApplication` is applied to this listing too, and a
 * test drives a colleague's CV through the whole walk to prove it.
 *
 * A refusal for one colleague is not an error for the walk. Their files stay
 * unreadable exactly as they were before this existed.
 */
export async function colleagueDocuments(
  alreadyListed: ReadonlySet<string>,
  isOutOfTime: () => boolean,
  oidcToken?: string | null
): Promise<{
  items: DriveFile[];
  /**
   * The token each note must be READ with, by file id.
   *
   * The admin token that lists the rest of Drive cannot fetch these — that is the
   * whole reason they were invisible. Listing them with a colleague's token and then
   * exporting them with the admin's produced a 404 for every one, and fourteen of
   * those tripped the export-failure tolerance, which stopped the walk early AND
   * blocked the sweep, because the sweep gate is the listing being complete.
   */
  tokens: Map<string, string>;
  asked: number;
  refused: number;
}> {
  const mailboxes = await domainMailboxes(oidcToken);
  if (!mailboxes || mailboxes.length === 0)
    return { items: [], tokens: new Map(), asked: 0, refused: 0 };

  const items: DriveFile[] = [];
  const tokens = new Map<string, string>();
  const seen = new Set(alreadyListed);
  let asked = 0;
  let refused = 0;

  for (const mailbox of mailboxes) {
    if (isOutOfTime()) break;
    const userToken = await getDelegatedToken(mailbox, DRIVE_SCOPE, Date.now(), oidcToken);
    if (!userToken) {
      refused += 1;
      continue;
    }
    asked += 1;
    /**
     * The same file types the admin walk asks for, so a document is indexed on the
     * same terms whoever happens to own it — including `SHORTCUT_MIME`, which
     * `resolveShortcuts` needs to follow a Meet note filed in someone else's Drive.
     */
    const q = encodeURIComponent(
      `'${mailbox.replace(/'/g, "\\'")}' in owners and trashed=false and ` +
        `(${[...WANTED_MIMES, SHORTCUT_MIME].map((m) => `mimeType='${m}'`).join(" or ")})`
    );
    const fields = encodeURIComponent(
      "nextPageToken,files(id,name,mimeType,modifiedTime,createdTime,webViewLink," +
        "owners(emailAddress),shortcutDetails(targetId,targetMimeType))"
    );
    /**
     * PAGED, which the meeting-note version did not need to be. One colleague owns
     * 197 documents on their own, and a single unpaged `pageSize=200` would have
     * silently returned the first page and called the walk complete — the quiet
     * truncation this file has been bitten by before.
     */
    let pageToken = "";
    for (let page = 0; page < MAX_PAGES; page++) {
      if (isOutOfTime()) break;
      const res = await driveGet(
        userToken,
        `/files?q=${q}&fields=${fields}&pageSize=${PAGE_SIZE}` +
          (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "")
      );
      if (!res.ok) {
        refused += 1;
        break;
      }
      const body = (await res.json().catch(() => ({}))) as {
        files?: DriveFile[];
        nextPageToken?: string;
      };
      for (const f of body.files ?? []) {
        if (!f.id || seen.has(f.id)) continue;
        seen.add(f.id);
        tokens.set(f.id, userToken);
        items.push(f);
      }
      pageToken = body.nextPageToken ?? "";
      if (!pageToken) break;
    }
  }
  return { items, tokens, asked, refused };
}

/**
 * Turn the raw listing into the documents we can actually read.
 *
 * A shortcut is a pointer, not a file: its own `modifiedTime` tracks the pointer,
 * so the TARGET's metadata has to be fetched or the incremental check would never
 * notice the note being edited. One extra request per shortcut, and shortcuts are
 * a handful.
 *
 * An unreadable target is NOT an error. Google Meet creates a shortcut whenever
 * the meeting was organised by somebody else, and the note then lives in THEIR
 * Drive — so "we cannot read it" is the normal state until that person shares
 * their own folder. It is counted and logged rather than warned about, because it
 * is information for a human, not a fault to page anyone over.
 *
 * Video targets are skipped outright: a recording is not text and there is no OCR
 * or transcription step here, so indexing an empty body would be worse than
 * skipping it.
 */
async function resolveShortcuts(
  token: string,
  listed: DriveFile[]
): Promise<{ docs: DriveFile[]; unreachable: number; skippedNonDoc: number }> {
  const docs: DriveFile[] = [];
  const seen = new Set<string>();
  let unreachable = 0;
  let skippedNonDoc = 0;

  for (const f of listed) {
    if (f.mimeType && WANTED_MIMES.includes(f.mimeType) && f.id) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      docs.push(f);
    }
  }

  for (const f of listed) {
    if (f.mimeType !== SHORTCUT_MIME) continue;
    const targetId = f.shortcutDetails?.targetId;
    if (!targetId) continue;
    if (!WANTED_MIMES.includes(f.shortcutDetails?.targetMimeType ?? "")) {
      skippedNonDoc += 1;
      continue;
    }
    // A target can also be directly visible; do not index it twice.
    if (seen.has(targetId)) continue;

    const res = await driveGet(
      token,
      `/files/${encodeURIComponent(targetId)}` +
        `?fields=id,name,mimeType,modifiedTime,createdTime,webViewLink,owners(emailAddress)` +
        `&supportsAllDrives=true`
    );
    if (!res.ok) {
      unreachable += 1;
      continue;
    }
    const target = (await res.json().catch(() => null)) as DriveFile | null;
    if (!target?.id) {
      unreachable += 1;
      continue;
    }
    seen.add(target.id);
    // Keep the SHORTCUT's name: it is the one that carries the meeting title in
    // the folder the team actually looks at.
    docs.push({ ...target, name: target.name || f.name });
  }

  return { docs, unreachable, skippedNonDoc };
}

/** A Google Doc as plain text. */
/** Strip the BOM and CRLFs Google exports carry; both show up inside chunk bodies. */
const clean = (t: string): string =>
  t
    .replace(/^\ufeff/, "")
    .replace(/\r\n/g, "\n")
    .trim();

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
/** Same ceiling as a pdf: a spreadsheet is the other easy way to blow up a chunk. */
const SHEET_TEXT_LIMIT = 400_000;

/**
 * EVERY TAB, not just the first one.
 *
 * `files.export?mimeType=text/csv` is what this used to do, and CSV is a
 * single-table format — Drive answers with the FIRST worksheet and silently drops
 * the rest. Found 2026-09-19: "Business Case" has two tabs, `Costs` and `Core_KPI`,
 * and the brain held only the cost lines. Asked about the KPI table it said it could
 * not see the file, which is worse than saying nothing: the file WAS indexed, so
 * every check that counts documents called it present.
 *
 * The Sheets API takes `drive.readonly`, which this token already carries, so no new
 * scope and no admin grant. Two calls: the tab names, then every tab's values in one
 * `batchGet`.
 */
export async function sheetTabTitles(token: string, fileId: string): Promise<string[]> {
  const metaRes = await driveGet(
    token,
    `${SHEETS_API}/${fileId}?fields=${encodeURIComponent("sheets(properties(title))")}`
  );
  if (!metaRes.ok) throw new Error(`sheets-meta ${metaRes.status}`);
  const meta = (await metaRes.json()) as { sheets?: Array<{ properties?: { title?: string } }> };
  return (meta.sheets ?? [])
    .map((sh) => sh?.properties?.title)
    .filter((t): t is string => typeof t === "string" && t.length > 0);
}

/**
 * The tabs that actually PRODUCE a heading — i.e. the ones with at least one
 * non-empty row.
 *
 * `sheetText` skips an empty tab outright (`if (rows.length === 0) return`), so a
 * reconciliation that expects one heading per TITLE reports a false gap for every
 * empty tab. Measured 2026-09-20: a tab literally named ">>> Archive", used as a
 * visual separator and holding nothing, was reported as a missing tab.
 *
 * This exists so the check can replicate the ingester's rule instead of a
 * simplification of it.
 */
export async function sheetTabsWithRows(token: string, fileId: string): Promise<string[]> {
  const titles = await sheetTabTitles(token, fileId);
  if (titles.length === 0) return [];
  const ranges = titles
    .map((t) => `ranges=${encodeURIComponent(`'${t.replace(/'/g, "''")}'`)}`)
    .join("&");
  const res = await driveGet(
    token,
    `${SHEETS_API}/${fileId}/values:batchGet?${ranges}&majorDimension=ROWS`
  );
  if (!res.ok) throw new Error(`sheets-values ${res.status}`);
  const payload = (await res.json()) as { valueRanges?: Array<{ values?: unknown[][] }> };
  return titles.filter((_, i) => {
    const rows = (payload.valueRanges ?? [])[i]?.values ?? [];
    return rows.some((row) => row.join("").trim().length > 0);
  });
}

async function sheetText(token: string, fileId: string): Promise<string> {
  const titles = await sheetTabTitles(token, fileId);
  if (titles.length === 0) return "";

  // A1 notation: the whole tab is just its quoted name, and an apostrophe in that
  // name is escaped by doubling. Get them all in one request rather than one each.
  const ranges = titles
    .map((t) => `ranges=${encodeURIComponent(`'${t.replace(/'/g, "''")}'`)}`)
    .join("&");
  const valRes = await driveGet(
    token,
    `${SHEETS_API}/${fileId}/values:batchGet?${ranges}&majorDimension=ROWS`
  );
  if (!valRes.ok) throw new Error(`sheets-values ${valRes.status}`);
  const payload = (await valRes.json()) as { valueRanges?: Array<{ values?: unknown[][] }> };

  const parts: string[] = [];
  (payload.valueRanges ?? []).forEach((vr, i) => {
    const rows = (vr.values ?? [])
      .map((row) =>
        row
          .map((cell) => String(cell ?? "").trim())
          .join(", ")
          .trim()
      )
      .filter((line) => line.replace(/,/g, "").trim().length > 0);
    if (rows.length === 0) return;
    // NAME THE TAB. Without it two tables run together and a reader cannot tell which
    // sheet a number came from — the same reason chunks carry their document title.
    parts.push(`## ${titles[i] ?? `Sheet ${i + 1}`}\n${rows.join("\n")}`);
  });

  const joined = clean(parts.join("\n\n"));
  return joined.length > SHEET_TEXT_LIMIT
    ? `${joined.slice(0, SHEET_TEXT_LIMIT)}\n\n[truncated: this spreadsheet is longer than the brain indexes]`
    : joined;
}

async function docText(token: string, fileId: string, mimeType?: string): Promise<string> {
  // Google-native files must be EXPORTED; everything else downloads with alt=media.
  // Asking for the wrong one is a 403 that reads like a permission problem.
  if (mimeType === SHEET_MIME) {
    try {
      return await sheetText(token, fileId);
    } catch (err) {
      // Fall back to the old first-tab-only export rather than losing the file
      // entirely — but say so, because a silent fallback is how this went unnoticed.
      logger.warn({ err, file: fileId }, "brain-ingest drive: sheets api failed, first tab only");
      const res = await driveGet(token, `/files/${fileId}/export?mimeType=text%2Fcsv`);
      if (!res.ok) throw new Error(`export ${res.status}`);
      return clean(await res.text());
    }
  }

  if (mimeType === DOC_MIME) {
    const res = await driveGet(token, `/files/${fileId}/export?mimeType=text%2Fplain`);
    if (!res.ok) throw new Error(`export ${res.status}`);
    return clean(await res.text());
  }

  const res = await driveGet(token, `/files/${fileId}?alt=media`);
  if (!res.ok) throw new Error(`download ${res.status}`);

  if (mimeType === PDF_MIME) {
    const buf = new Uint8Array(await res.arrayBuffer());
    /**
     * A ZERO-BYTE PDF IS NOT AN EXPORT FAILURE.
     *
     * pdfjs throws `The PDF file is empty, i.e. its size is zero bytes` for one, which
     * lands in the catch and is reported as a failed export — for ever, because nothing
     * about the file will change. Measured 2026-09-18: two such files had been failing
     * on every hourly run since at least 2026-09-08, and one of them used to abort the
     * whole walk. A file with no bytes is the case `!text.trim()` already handles, and
     * belongs in `empty=` with the other duds rather than in the failure list, which
     * should only ever hold things somebody can act on.
     */
    if (buf.byteLength === 0) return "";
    const { extractText, getDocumentProxy } = await import("unpdf");
    const doc = await getDocumentProxy(buf);
    const { text } = await extractText(doc, { mergePages: true });
    const joined = clean(Array.isArray(text) ? text.join("\n") : text);
    if (joined.length < PDF_MIN_CHARS) return "";
    return joined.length > PDF_TEXT_LIMIT
      ? `${joined.slice(0, PDF_TEXT_LIMIT)}\n\n[truncated: this pdf is longer than the brain indexes]`
      : joined;
  }

  if (mimeType === DOCX_MIME) {
    // `mammoth` is already a dependency; it turns .docx into plain text without
    // pulling in an office suite.
    const mammoth = await import("mammoth");
    const buf = Buffer.from(await res.arrayBuffer());
    const out = await mammoth.extractRawText({ buffer: buf });
    return clean(out.value);
  }
  return clean(await res.text());
}

/**
 * How many distinct email addresses make a document a LIST OF PEOPLE rather than a
 * document that happens to mention some.
 *
 * Measured across every Drive document in the corpus on 2026-09-17, and the two groups do
 * not overlap remotely. The largest ordinary document — a "Team Members" page — carries
 * SIX. Everything above that is an export: 1,429 addresses in
 * `loveiq_audience1_completers_all.csv`, 533 in its opt-in twin, 121 in
 * `loveiq_audience2_abandoners.csv`, and 100 apiece in four `.json` fixtures. Twenty sits
 * in the gap with a wide margin on both sides.
 */
export const MAX_ADDRESSES_PER_DOC = 20;

const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Is this file a personal-data export?
 *
 * `brain_chunk` must never index user-level rows — survey answers, individual reports,
 * email addresses. That rule was written for the ingesters and then not enforced anywhere:
 * an audit on 2026-09-17 found three marketing audience exports sitting in Drive and fully
 * indexed, putting 2,083 real people's addresses into a corpus any team member can search
 * with one shared token.
 *
 * Counted on DISTINCT addresses across the whole document, not per chunk, because that is
 * the only level where the signal exists. A 2,400-character chunk of a CSV holds five to
 * nine addresses — indistinguishable from a calendar invite with nine guests.
 */
export function isPersonalDataExport(text: string): boolean {
  const seen = new Set<string>();
  for (const m of text.match(EMAIL_IN_TEXT) ?? []) {
    seen.add(m.toLowerCase());
    // Stop early: a 1,429-address CSV need not be fully de-duplicated to be recognised.
    if (seen.size > MAX_ADDRESSES_PER_DOC) return true;
  }
  return false;
}

export function docToRows(file: DriveFile, text: string, stampedAt: string): BrainRow[] {
  const name = (file.name ?? "").trim();
  if (!file.id || !name) return [];

  /**
   * REFUSED BEFORE ANYTHING IS BUILT. Returning no rows also means the file never enters
   * the walk's written-id set, so `sweepMissing` removes whatever was indexed before this
   * guard existed — the corpus repairs itself rather than needing a one-off delete.
   */
  if (isPersonalDataExport(text)) {
    logger.warn(
      { file: name },
      "brain-ingest drive: refusing a file that is a list of people, not a document"
    );
    return [];
  }
  const edited = file.modifiedTime ?? file.createdTime ?? null;
  const owner = file.owners?.[0]?.emailAddress ?? null;

  /**
   * A WhatsApp export is a conversation, not a document.
   *
   * Left to the normal path it becomes anonymous 2,400-character slices, every one
   * stamped with the FILE's modified date — so "what did we decide in July" cannot
   * work, because no chunk knows which day it covers. Cut it per day instead, the
   * same shape the Slack ingester produces.
   */
  if (looksLikeWhatsAppExport(text)) {
    return whatsappRows(file.id, name, file.webViewLink ?? null, text, stampedAt);
  }

  /**
   * TITLE THE MEETING NOTES AS MEETING NOTES.
   *
   * The title feeds the trigram index — it is half of what `brain_search` matches
   * on — and "Drive: LoveIQ Sync - 2026/08/28 08:59 CEST - Notes by Gemini"
   * contains no word anyone would use to ask for it. Measured before this change:
   * "action items from our recent meetings" ranked a dependency-bump commit above
   * the actual meeting notes, and the notes only appeared at all because retrieval
   * reserves slots per source.
   *
   * Gemini names every note "… - Notes by Gemini", so that is the detector. Other
   * Drive documents keep the neutral prefix rather than being mislabelled.
   */
  const isMeetingNote = /notes by gemini/i.test(name);
  const title = isMeetingNote ? `Meeting notes: ${name}` : `Drive: ${name}`;

  const base: BrainRow = {
    source: SOURCE,
    source_id: `doc:${file.id}`,
    title,
    url: file.webViewLink ?? null,
    body: [name, text].filter(Boolean).join("\n\n"),
    meta: {
      kind: isMeetingNote ? "meeting-notes" : "drive-doc",
      v: DRIVE_BUILDER_VERSION,
      owner,
      created: file.createdTime ?? null,
      edited,
    },
    updated_at: stampedAt,
    // The date the document last changed, so a note from today outranks one from
    // March on a scoring tie.
    period_end: typeof edited === "string" ? edited.slice(0, 10) : null,
  };

  // Split rather than let the write path slice the tail off — a call note is
  // routinely longer than the 2,400-character ceiling.
  const parts = splitBody(base.body);

  /**
   * A GEMINI NOTE IS TWO DOCUMENTS IN ONE FILE: the structured decision record
   * (Summary, Details, Decisions/Aligned, Suggested next steps) and then the raw
   * transcript.
   *
   * That matters because `brain_search` collapses a document to its single
   * highest-scoring part. Measured across all 114 notes on four decision-shaped
   * questions, the winning part is a TRANSCRIPT part 24-46% of the time — so on
   * roughly a third of meetings the decision record is discarded at random and
   * "I give you 20 seconds because I also need to get shoes" is returned instead.
   *
   * Marking the halves lets the dedup prefer the record deterministically. The
   * transcript is not lost: `fetch_document` returns the whole file, which is why
   * this can be a preference rather than a reserved retrieval slot.
   *
   * The boundary is GOOGLE'S OWN divider, not a heuristic of ours — verified
   * present in 114 of 114 notes. Three files contain it twice, so the FIRST
   * occurrence wins. When it is absent the section is left unset rather than
   * guessed, and the run says so.
   */
  const dividerAt = isMeetingNote ? parts.findIndex((part) => TRANSCRIPT_DIVIDER.test(part)) : -1;
  if (isMeetingNote && dividerAt < 0) {
    logger.warn(
      { file: file.id, name },
      "brain-drive: meeting note has no transcript divider; leaving section unset"
    );
  }
  const sectionOf = (i: number): DriveSection | undefined =>
    dividerAt < 0 ? undefined : i <= dividerAt ? "summary" : "transcript";

  return parts.map((body, i) =>
    i === 0
      ? { ...base, body, meta: { ...base.meta, section: sectionOf(0) } }
      : {
          ...base,
          source_id: `${base.source_id}#${i + 1}`,
          title: `${base.title} (part ${i + 1} of ${parts.length})`,
          body,
          meta: { ...base.meta, part: i + 1, parts: parts.length, section: sectionOf(i) },
        }
  );
}

/** source_id → what is already indexed, for the incremental skip. */
async function knownDriveEdits(): Promise<Map<string, { edited: string; v: number }>> {
  const out = new Map<string, { edited: string; v: number }>();
  for (let offset = 0; offset < 50_000; offset += 1000) {
    const res = await supabaseFetch(
      `/rest/v1/brain_chunk?select=source_id,meta&source=eq.${SOURCE}&order=source_id.asc&limit=1000&offset=${offset}`
    );
    // Fails closed on an unreadable status AND on an unreadable body — a truncated
    // keep set is what the sweep deletes against. See chunkPage.
    const batch = await chunkPage<{
      source_id?: string;
      meta?: { edited?: unknown; v?: unknown } | null;
    }>("drive", res);
    for (const row of batch) {
      const edited = row.meta?.edited;
      const v = typeof row.meta?.v === "number" ? row.meta.v : 0;
      if (row.source_id && typeof edited === "string") out.set(row.source_id, { edited, v });
    }
    if (batch.length < 1000) break;
  }
  return out;
}

/**
 * The stored part ids of one document — optionally only those on a given builder
 * version.
 *
 * WHY THE VERSION FILTER EXISTS. These ids go into the sweep's KEEP-set, and they
 * come from the database rather than from the file, so they include parts the file
 * no longer produces. A document that re-chunks SHORTER leaves a tail behind:
 * measured 2026-09-20, the Glossary went from 311 parts to 223 and the 88 orphans
 * survived every sweep, because the run after the rewrite found the file unchanged,
 * TOUCHED it, and re-protected all 311 ids. A shrinking file was therefore only
 * sweepable during the single run that shrank it, and the sweep runs once a day.
 *
 * Pass the current version at the touch site: a part left behind by an older, longer
 * version carries the older version, so filtering on it separates orphans from live
 * parts exactly. Do NOT pass it for a file the run never reached — its parts may
 * legitimately all be on an old version, and protecting none of them would delete
 * the document for being unread.
 */
function partIdsOf(
  known: Map<string, { edited: string; v: number }>,
  baseId: string,
  atVersion?: number
): string[] {
  const prefix = `${baseId}#`;
  return [...known.entries()]
    .filter(
      ([id, meta]) => id.startsWith(prefix) && (atVersion === undefined || meta.v === atVersion)
    )
    .map(([id]) => id);
}

/**
 * The Drive token, IMPERSONATING A PERSON where possible.
 *
 * This is the difference between seeing the company Drive and seeing a corner of
 * it. As its own identity the service account can only read what has been
 * explicitly shared with it -- measured on 2026-08-30: **24 documents**, against
 * 512 for a person. The other ~11,000 chunks in the corpus came from a one-off
 * local run under a human credential, and every production run since has been
 * saved from deleting them only by the sweep's majority guard.
 *
 * Delegation fixes that without anyone sharing a single folder by hand: read as the
 * workspace admin and Drive returns what THEY can see.
 *
 * Falls back to the service account's own token, so if delegation is unavailable
 * this is exactly as capable as before and never worse.
 */
async function driveToken(oidcToken?: string | null): Promise<string | null> {
  const admin = (process.env.GOOGLE_WORKSPACE_ADMIN ?? "").trim();
  if (admin) {
    const delegated = await getDelegatedToken(admin, DRIVE_SCOPE, Date.now(), oidcToken);
    if (delegated) return delegated;
    logger.warn(
      { admin },
      "brain-ingest drive: could not impersonate the workspace admin, falling back to the " +
        "service account -- which sees only what has been shared with it"
    );
  }
  return getGoogleAccessToken(Date.now(), oidcToken);
}

/**
 * Vendor billing: a record of what we PAID, not of what we decided.
 *
 * A RULE HERE, DELIBERATELY, WHERE `SKIP_FILE_IDS` IS A LIST. The id list exists
 * because no size, folder or extension test separates a valuable pdf from a
 * throwaway one. Billing is the exception that survives that objection: the names
 * are machine-generated by the vendor, a new one arrives every month, and an id list
 * would be stale by the next billing cycle.
 *
 * WHY THEY GO. Measured 2026-09-19: 93 such files were in the corpus, and asking the
 * brain what was agreed about pricing IN OUR CALLS returned five Slack billing
 * statements and no meeting note at all — a one-page invoice has far higher term
 * density than a meeting transcript split across 48 parts, so it wins on vocabulary
 * every time. Nothing is lost: the same invoices arrive as email (170 of them), which
 * is where the September cost-sheet audit was built from, and the figures the team
 * actually works off live in the Business Case sheet.
 *
 * NARROW ON PURPOSE. Requires a pdf, the word at a boundary (so "invoicing" does not
 * match), AND one of two marks of a real vendor file rather than a document ABOUT
 * billing: a run of digits in the name — a vendor reference — or a name that is the
 * billing word and its numbering and nothing else.
 *
 * THE SECOND TEST EXISTS BECAUSE THE FIRST MISSED. `invoice 1.1.pdf` and
 * `invoice 1.2.pdf` survived the first rule and sat in the corpus as Amazon Rechnungen,
 * VAT boilerplate and all: the vendor put the reference number in the DOCUMENT, and
 * only the filename is known at listing time. A name with nothing left in it once the
 * word and the numbering are removed cannot be a document about invoicing, because a
 * document about invoicing has something to say in its title. Measured over all 705
 * Drive documents: the addition catches those two and nothing else.
 */
const BILLING_NAME = /(^|[_\s-])(invoice|receipt|rechnung|billing[_\s-]statement)([_\s-]|\d|\.)/i;
const BILLING_WORD = /invoice|receipt|rechnung|billing[_\s-]?statement/gi;
/**
 * The vendor's reference with no spelled-out word: `MT-INV00945830.pdf`.
 *
 * Five of these were in the corpus and three of them came back in the TOP TWELVE for
 * "what did we agree about pricing in our calls" — the exact question this whole rule
 * was written for, still answered with invoices a month after the first fix.
 */
const VENDOR_REF = /(^|[^a-z])inv[-_]?\d{4,}/i;
/**
 * WHAT IS DELIBERATELY NOT HERE: a name of nothing but digits.
 *
 * `5419031713.pdf` is a Google invoice and `726933.pdf` is a peer-reviewed paper on
 * sexual and relationship variables, 26 chunks of exactly the literature this company
 * exists to read. `18.01.161.20221004.pdf` is another. The filename cannot tell them
 * apart, and the rule runs at LISTING time — before anything is fetched — so there is
 * no content to appeal to. A "no words in the name" rule measured beautifully and
 * would have deleted both papers. The nine numeric invoices are one chunk each and
 * have never surfaced in a probe; the papers are worth far more than they cost.
 */
export function isVendorBilling(name?: string, mimeType?: string): boolean {
  if (mimeType !== PDF_MIME) return false;
  const n = (name ?? "").trim();
  if (VENDOR_REF.test(n)) return true;
  if (!BILLING_NAME.test(n)) return false;
  if (/\d{3,}/.test(n)) return true;
  const rest = n
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(BILLING_WORD, "")
    .replace(/[\d\s._\-()#]/g, "");
  return rest.length === 0;
}

/**
 * A JOB APPLICATION. Somebody else's personal data, not company knowledge.
 *
 * Fifteen were indexed — named CVs and résumés of external candidates, 23 chunks —
 * searchable by anyone on the team through a tool that answers in prose. Nothing about
 * how LoveIQ works is in any of them, so the corpus loses nothing by their going, and
 * the direction to err in with a stranger's personal data is out.
 *
 * A RULE, NOT AN ID LIST, for the same reason billing is: recruiting keeps happening,
 * so a list of ids is stale by the next applicant. Anchored at word boundaries so
 * "CV screening process" or a file merely mentioning a résumé is untouched; measured
 * across all 705 Drive documents, it matched those fifteen and produced no near miss.
 *
 * REVERSIBLE, and a decision rather than a defect: if the team wants to ask the brain
 * who applied for a role, delete this function and its call. Recorded 2026-09-20.
 */
const JOB_APPLICATION = /(^|[_\s(-])(cv|resume|résumé|lebenslauf)([_\s).\d-]|$)/i;
export function isJobApplication(name?: string): boolean {
  return JOB_APPLICATION.test((name ?? "").trim());
}

export async function ingestDrive(
  stampedAt: string,
  isOutOfTime: () => boolean = () => false,
  /** Vercel's per-request identity token; see readVercelOidcToken(). Without it
   *  the keyless path cannot run, because the token is a request HEADER. */
  oidcToken?: string | null
): Promise<IngestResult> {
  if (!isGoogleConfigured()) {
    return { source: SOURCE, rows: 0, swept: 0, skipped: "google-not-configured" };
  }
  const token = await driveToken(oidcToken);
  if (!token) {
    return {
      source: SOURCE,
      rows: 0,
      swept: 0,
      skipped: `google-token-unavailable(${googleCredentialShape(oidcToken)})`,
    };
  }
  if (isOutOfTime()) return { source: SOURCE, rows: 0, swept: 0, skipped: "drive-time-budget" };

  const known = await knownDriveEdits();
  const raw = await listDocs(token, isOutOfTime);
  /**
   * Meeting notes filed in a colleague's Drive, which the single-account listing
   * above cannot see. Additive and best-effort: if the directory is unreadable or a
   * colleague refuses, the walk proceeds with exactly what it had before.
   */
  const colleagues = await colleagueDocuments(
    new Set(raw.items.map((f) => f.id ?? "")),
    isOutOfTime,
    oidcToken
  );
  const resolved = await resolveShortcuts(token, [...raw.items, ...colleagues.items]);
  // Filtered here rather than at fetch time so the ids never reach `toFetch`,
  // `touch` or `deferred` either: a skipped document must look absent to the
  // sweep, not merely unfetched, or the sweep would protect the rows we are
  // removing.
  const listed = {
    items: resolved.docs.filter(
      (f) =>
        !SKIP_FILE_IDS.has(f.id ?? "") &&
        !isVendorBilling(f.name, f.mimeType) &&
        !isJobApplication(f.name)
    ),
    complete: raw.complete,
    stopped: raw.stopped,
  };

  if (resolved.unreachable > 0 || resolved.skippedNonDoc > 0) {
    // Information, not a fault: a shortcut we cannot follow means the note lives
    // in someone else's Drive and they have not shared their folder.
    logger.info(
      { unreachable: resolved.unreachable, nonDocTargets: resolved.skippedNonDoc },
      "brain-ingest drive: some shortcut targets are not readable (their owner has not shared) or are not documents"
    );
  }

  // NOTHING SHARED IS NOT AN ERROR, and must not look like one. The service
  // account sees only what somebody shared with it, so an empty list on a fresh
  // setup is the expected state — reported as skipped so the ops alert does not
  // fire every night for a source nobody has enabled yet.
  if (listed.items.length === 0) {
    return {
      source: SOURCE,
      rows: 0,
      swept: 0,
      skipped: listed.complete ? "drive-nothing-shared" : "drive-list-failed",
    };
  }

  const rows: BrainRow[] = [];
  const touch: string[] = [];
  const toFetch: DriveFile[] = [];
  /** Documents this run could not export. Tolerated up to a limit; see above. */
  const exportFailures: string[] = [];
  /** Files that yielded no text at all, and files refused as a list of people. Counted
   *  so `docs=` minus the chunks it produced is an arithmetic identity, not a mystery. */
  let emptyDocs = 0;
  let refusedDocs = 0;
  /** Produced no rows for a reason that is NOT the people-list refusal (no id, no name). */
  let unusableDocs = 0;
  let complete = listed.complete;
  let stopped: string | undefined = listed.stopped;
  const stop = (why: string) => {
    complete = false;
    stopped ??= why;
  };

  for (const file of listed.items) {
    const sourceId = `doc:${file.id}`;
    const edited = file.modifiedTime ?? file.createdTime ?? null;
    const seen = known.get(sourceId);
    if (edited && seen && seen.edited === edited && seen.v === DRIVE_BUILDER_VERSION) {
      // Current version only: an orphan part from a longer previous version must
      // look absent to the sweep, not be confirmed by it.
      touch.push(sourceId, ...partIdsOf(known, sourceId, DRIVE_BUILDER_VERSION));
    } else {
      toFetch.push(file);
    }
  }

  /**
   * The files this run actually GOT TO, whatever came of them.
   *
   * Not the same as "produced rows". A document that was read and turned out empty,
   * or was refused as a list of people, belongs in here — it was reached, and the
   * decision not to index it is a decision, not an outage. Only files the loop never
   * arrived at are deferred to the sweep's keep-set below.
   */
  const reached = new Set<string>();

  for (const file of toFetch) {
    if (isOutOfTime()) {
      stop(`time-budget@fetch:${rows.length}rows`);
      break;
    }
    reached.add(`doc:${file.id}`);
    try {
      // A colleague's meeting note is readable only as that colleague.
      const readToken = colleagues.tokens.get(file.id as string) ?? token;
      const text = await docText(readToken, file.id as string, file.mimeType);
      // A file that yields no text -- a scanned pdf with no text layer, an empty
      // doc -- would otherwise be indexed as a chunk whose only content is its own
      // title, which then matches questions it cannot answer. Skipping lets the
      // sweep remove it if it was indexed before.
      if (!text.trim()) {
        emptyDocs += 1;
        continue;
      }
      const produced = docToRows(file, text, stampedAt);
      // `docToRows` returns NOTHING for a file it refuses as a list of people. That
      // refusal is deliberate and silent, which is the problem: `docs=745` against 727
      // indexed documents could not be reconciled from outside, so a NEW gap would look
      // exactly like this known one.
      //
      // It also returns nothing for a file with no id or name, which is a DIFFERENT
      // thing and must not be counted under the same word -- one label for two states
      // is the exact complaint these counters exist to answer.
      if (produced.length === 0) {
        if (isPersonalDataExport(text)) refusedDocs += 1;
        else unusableDocs += 1;
      }
      rows.push(...produced);
    } catch (err) {
      // One unreadable document must not cost the rest of the run -- and it must
      // not cost the run's STATUS either, which is what calling stop() here did.
      logger.warn({ err, file: file.id }, "brain-ingest drive: export failed");
      // WHY it failed, not just which file. `docText` throws `export <status>` /
      // `download <status>`, and without that status the summary names three opaque
      // ids and the log line holding the reason has rolled off hours before anyone
      // reads them -- which is the same reasoning that put the ids here at all.
      const why = err instanceof Error ? err.message : String(err);
      exportFailures.push(`${file.id}(${why.slice(0, 60)})`);
    }
  }

  /**
   * Judged in aggregate, like calendar and gmail already do.
   *
   * WHICH documents, not just that some failed: the ids land in
   * `cron_run.error_message` via the detail below whether or not the run is
   * called incomplete, because the log line above sits in a buffer that holds
   * hours and this cron runs hourly, so by the time anyone looks it has rolled
   * off. Drive file ids are opaque and already public in every chunk's url.
   */
  if (exportFailures.length > MAX_TOLERATED_EXPORT_FAILURES) {
    stop(`export-failed=${exportFailures.length}:${exportFailures[0]}`);
  }

  const written = await upsertChunks(rows);
  const writtenIds = new Set(rows.map((r) => r.source_id));
  /**
   * ONLY THE FILES THIS RUN NEVER REACHED.
   *
   * This used to defer every file in `toFetch` that produced no rows, which quietly
   * included the ones that WERE read and deliberately not indexed — an empty
   * document, or a file refused as a list of people. The empty-document branch above
   * says in as many words that skipping "lets the sweep remove it if it was indexed
   * before", and this is what stopped that from ever happening.
   *
   * Found 2026-09-19 by chasing the last spreadsheet that would not rebuild: "Discount
   * sheet" is an empty sheet, one tab, no rows. Its 14-character chunk had survived
   * since 31 August, protected on every single run, describing a document that holds
   * nothing.
   */
  const deferred = toFetch
    .filter((f) => !reached.has(`doc:${f.id}`))
    .flatMap((f) => [`doc:${f.id}`, ...partIdsOf(known, `doc:${f.id}`)])
    .filter((id) => !writtenIds.has(id));
  /**
   * NO TOUCH AT ALL. Drive is 16,117 rows, which is 161 confirm requests, and one of
   * them reliably exceeded the 8s timeout -- brain-drive failed at 14:52, 15:52 and
   * 16:52 on 2026-08-31 doing exactly this. A confirm pass that cannot finish inside
   * one invocation cannot be scheduled into working.
   *
   * `sweepMissing` deletes by the id set the walk collected, which is what the sweep
   * always meant. Every id here is one we know exists: rewritten, unchanged, or
   * deferred because the clock ran out.
   */
  const confirmed = [...touch, ...deferred];
  const touched = confirmed.length;

  // Only sweep when the LISTING was complete. A partial list makes existing
  // documents look deleted; a partial FETCH does not, because everything is either
  // rewritten or confirmed above. Once a day, not every run -- see shouldSweep.
  const sweeping = listed.complete && (await shouldSweep(SOURCE));
  // Recorded BEFORE the sweep: a throw after the record defers 20 hours, a throw
  // before it retried hourly forever.
  if (sweeping) await recordSweep(SOURCE);
  const swept = sweeping
    ? await sweepMissing(SOURCE, new Set([...writtenIds, ...confirmed]), {
        scopeKey: "owner",
        /**
         * Only the owners this run actually saw. The service account sees what
         * people share with it, so an owner leaves the listing when a folder is
         * unshared or an account is suspended — lost access, not deleted
         * documents. Without this their rows are swept whole, and 11 of the 15
         * owners here (775 rows, every external collaborator among them) sit
         * under the vanishing-scope heuristic's 5% floor, so nothing else
         * catches it.
         *
         * Built from `resolved.docs`, BEFORE the SKIP_FILE_IDS filter above: a
         * skipped document must still look absent to the sweep, and protecting
         * its owner would be the one way to undo that on purpose.
         */
        walkedScopes: new Set(
          resolved.docs
            .map((f) => f.owners?.[0]?.emailAddress)
            .filter((o): o is string => Boolean(o))
        ),
      })
    : 0;

  logger.info(
    {
      docs: listed.items.length,
      colleagueNotes: colleagues.items.length,
      colleaguesAsked: colleagues.asked,
      colleaguesRefused: colleagues.refused,
      shortcutsUnreachable: resolved.unreachable,
      written,
      touched,
      deferred: deferred.length,
      complete,
    },
    "brain-ingest drive"
  );
  // `complete` was logged and then dropped, so a walk that fetched one document of
  // three returned exactly the same object as one that fetched all three.
  return {
    source: SOURCE,
    rows: written + touched,
    swept,
    complete,
    // Drive's sweep gate is the LISTING, not the fetch -- see `sweepBlocked`.
    sweepBlocked: !listed.complete,
    detail:
      `docs=${listed.items.length} written=${written} touched=${touched} swept=${swept} ` +
      `complete=${complete}${stopped ? ` stopped=${stopped}` : ""}` +
      // Colleague notes are appended to the listing, so without this the only way to
      // tell "none were found" from "the feature is not running" is a structured log
      // nobody reads. `asked` is printed even at zero for exactly that reason.
      ` colleagueNotes=${colleagues.items.length}/${colleagues.asked}asked` +
      (colleagues.refused > 0 ? ` colleaguesRefused=${colleagues.refused}` : "") +
      (emptyDocs > 0 ? ` empty=${emptyDocs}` : "") +
      (refusedDocs > 0 ? ` refusedAsPeopleList=${refusedDocs}` : "") +
      (unusableDocs > 0 ? ` unusable=${unusableDocs}` : "") +
      (exportFailures.length > 0
        ? ` exportFailed=${exportFailures.length}:${exportFailures.slice(0, 3).join(",")}`
        : ""),
  };
}
