import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import { getGoogleAccessToken, isGoogleConfigured } from "@shared/http/google-oauth";
import logger from "@shared/observability/logger";
import { supabaseFetch } from "@features/admin/server/supabase";
import { splitBody } from "./notion";
import { sweepStale, touchChunks, upsertChunks, type BrainRow, type IngestResult } from "./upsert";

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
const MAX_PAGES = 20;

/** Bump when the row SHAPE changes; a mismatch counts as stale. See notion.ts. */
export const DRIVE_BUILDER_VERSION = 2;

/** Only native Google Docs export to text. A PDF or image would need OCR. */
const DOC_MIME = "application/vnd.google-apps.document";

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

async function driveGet(token: string, path: string): Promise<Response> {
  return fetchWithTimeout(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    timeoutMs: TIMEOUT_MS,
  });
}

/** Every Google Doc the service account can see. */
async function listDocs(
  token: string,
  isOutOfTime: () => boolean
): Promise<{ items: DriveFile[]; complete: boolean }> {
  const out: DriveFile[] = [];
  let complete = true;
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    if (isOutOfTime()) {
      complete = false;
      break;
    }
    // Shortcuts come back in the same query so a second pass is not needed.
    const q = encodeURIComponent(
      `(mimeType='${DOC_MIME}' or mimeType='${SHORTCUT_MIME}') and trashed=false`
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
      return { items: out, complete: false };
    }
    const json = (await res.json().catch(() => null)) as
      | { files?: DriveFile[]; nextPageToken?: string }
      | null;
    for (const f of json?.files ?? []) if (f.id) out.push(f);
    pageToken = json?.nextPageToken;
    if (!pageToken) break;
    if (page === MAX_PAGES - 1) complete = false;
  }
  return { items: out, complete };
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
    if (f.mimeType === DOC_MIME && f.id) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      docs.push(f);
    }
  }

  for (const f of listed) {
    if (f.mimeType !== SHORTCUT_MIME) continue;
    const targetId = f.shortcutDetails?.targetId;
    if (!targetId) continue;
    if (f.shortcutDetails?.targetMimeType !== DOC_MIME) {
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
async function docText(token: string, fileId: string): Promise<string> {
  const res = await driveGet(token, `/files/${fileId}/export?mimeType=text%2Fplain`);
  if (!res.ok) throw new Error(`export ${res.status}`);
  // Docs export with a BOM and CRLFs; both would show up inside chunk bodies.
  return (await res.text()).replace(/^﻿/, "").replace(/\r\n/g, "\n").trim();
}

export function docToRows(file: DriveFile, text: string, stampedAt: string): BrainRow[] {
  const name = (file.name ?? "").trim();
  if (!file.id || !name) return [];
  const edited = file.modifiedTime ?? file.createdTime ?? null;
  const owner = file.owners?.[0]?.emailAddress ?? null;

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
  return parts.map((body, i) =>
    i === 0
      ? { ...base, body }
      : {
          ...base,
          source_id: `${base.source_id}#${i + 1}`,
          title: `${base.title} (part ${i + 1} of ${parts.length})`,
          body,
          meta: { ...base.meta, part: i + 1, parts: parts.length },
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
    if (!res.ok) {
      logger.warn({ status: res.status }, "brain-ingest drive: could not read existing chunks");
      return new Map();
    }
    const batch = (await res.json().catch(() => [])) as Array<{
      source_id?: string;
      meta?: { edited?: unknown; v?: unknown } | null;
    }>;
    for (const row of batch) {
      const edited = row.meta?.edited;
      const v = typeof row.meta?.v === "number" ? row.meta.v : 0;
      if (row.source_id && typeof edited === "string") out.set(row.source_id, { edited, v });
    }
    if (batch.length < 1000) break;
  }
  return out;
}

function partIdsOf(known: Map<string, unknown>, baseId: string): string[] {
  const prefix = `${baseId}#`;
  return [...known.keys()].filter((id) => id.startsWith(prefix));
}

export async function ingestDrive(
  stampedAt: string,
  isOutOfTime: () => boolean = () => false
): Promise<IngestResult> {
  if (!isGoogleConfigured()) {
    return { source: SOURCE, rows: 0, swept: 0, skipped: "google-not-configured" };
  }
  const token = await getGoogleAccessToken();
  if (!token) {
    return { source: SOURCE, rows: 0, swept: 0, skipped: "google-token-unavailable" };
  }
  if (isOutOfTime()) return { source: SOURCE, rows: 0, swept: 0, skipped: "drive-time-budget" };

  const known = await knownDriveEdits();
  const raw = await listDocs(token, isOutOfTime);
  const resolved = await resolveShortcuts(token, raw.items);
  const listed = { items: resolved.docs, complete: raw.complete };

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
  let complete = listed.complete;

  for (const file of listed.items) {
    const sourceId = `doc:${file.id}`;
    const edited = file.modifiedTime ?? file.createdTime ?? null;
    const seen = known.get(sourceId);
    if (edited && seen && seen.edited === edited && seen.v === DRIVE_BUILDER_VERSION) {
      touch.push(sourceId, ...partIdsOf(known, sourceId));
    } else {
      toFetch.push(file);
    }
  }

  for (const file of toFetch) {
    if (isOutOfTime()) {
      complete = false;
      break;
    }
    try {
      rows.push(...docToRows(file, await docText(token, file.id as string), stampedAt));
    } catch (err) {
      // One unreadable document must not cost the rest of the run.
      logger.warn({ err, file: file.id }, "brain-ingest drive: export failed");
      complete = false;
    }
  }

  const written = await upsertChunks(rows);
  const writtenIds = new Set(rows.map((r) => r.source_id));
  const deferred = toFetch
    .flatMap((f) => [`doc:${f.id}`, ...partIdsOf(known, `doc:${f.id}`)])
    .filter((id) => !writtenIds.has(id));
  const touched = await touchChunks(SOURCE, [...touch, ...deferred], stampedAt);

  // Only sweep when the LISTING was complete. A partial list makes existing
  // documents look deleted; a partial FETCH does not, because everything is
  // either rewritten or confirmed above.
  const swept = listed.complete ? await sweepStale(SOURCE, stampedAt, written + touched) : 0;

  logger.info(
    {
      docs: listed.items.length,
      shortcutsUnreachable: resolved.unreachable,
      written,
      touched,
      deferred: deferred.length,
      complete,
    },
    "brain-ingest drive"
  );
  return { source: SOURCE, rows: written + touched, swept };
}
