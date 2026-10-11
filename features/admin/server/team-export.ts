/**
 * The team's copy of the production data: every customer and product table, one CSV each,
 * in a Google Drive folder only the team can open, for the team to explore freely.
 *
 * Two ways to run it: Jarvis's `export_all_data` tool starts it on the server
 * (app/api/cron/team-export), and `scripts/team-data-export.ts` runs it from a laptop. Either
 * way the data goes from the database to Drive and never through a chat.
 *
 * EVERYTHING, UNMASKED, BY DECISION. Eman, 2026-10-10: the team (Eman, Marcus, Mark, Fatih,
 * Sanjin, Ajna) gets all of it, with nothing removed or masked: emails, names, free-text
 * answers, report links, payment details. The folder it goes to is shared with those six and
 * nobody else, and `assertTeamOnly` stops an upload to a folder anyone else can open.
 *
 * Not exported, because none of it is customer or product data, or because copying it would
 * defeat its purpose:
 *   - `brain_*`: Jarvis's index of the company's own email, Slack, WhatsApp and documents,
 *     which everyone can already search through Jarvis;
 *   - plumbing: `cron_run`, `rate_limits`, `system_flags`, `slack_*`;
 *   - `data_subject_request_log`: the people who asked us to delete or restrict their data.
 * And while anyone has asked us to restrict processing (`app_user.processing_restricted_at`,
 * GDPR Art. 18), the export does not run at all (assertNobodyRestricted says why).
 *
 * Test and staff rows stay in, flagged `is_likely_test` with the reason, by the admin
 * panel's own rule, on `survey_submission` and `survey_partial_save`.
 * See docs/runbooks/TEAM_DATA_EXPORT.md.
 */
import { POSTGREST_MAX_ROWS, supabaseFetch } from "@features/admin/server/supabase";
import { evaluateTestSubmission } from "@features/admin/server/test-submission";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";

type Row = Record<string, unknown>;

/** A table as the database describes it: its columns in order, and its primary key. */
export interface TableSpec {
  name: string;
  columns: string[];
  key: string[];
}

export interface ExportFile {
  name: string;
  body: string;
}

/** Thrown when a run passes its deadline, so the run is recorded as a timeout. */
export class OutOfTime extends Error {}

/** Whether a table goes into the export. See the header for why each exclusion exists. */
export function isExported(table: string): boolean {
  if (table.startsWith("brain_") || table.startsWith("slack_")) return false;
  return !["cron_run", "rate_limits", "system_flags", "data_subject_request_log"].includes(table);
}

/** The admin panel's test rule, as two columns, on the two tables it judges. */
export function withTestFlag(table: string, row: Row, emailOfUser: Map<unknown, string>): Row {
  let verdict: ReturnType<typeof evaluateTestSubmission> | null = null;
  if (table === "survey_submission") {
    verdict = evaluateTestSubmission({
      recordType: "submission",
      email: emailOfUser.get(row.user_id),
      durationMs: typeof row.duration_ms === "number" ? row.duration_ms : null,
    });
  } else if (table === "survey_partial_save") {
    const answers = (row.answers ?? {}) as Record<string, unknown>;
    verdict = evaluateTestSubmission({
      recordType: "partial",
      // 00000 is the survey's email question.
      email: typeof answers["00000"] === "string" ? answers["00000"] : null,
      durationMs: null,
      answerCount: Object.keys(answers).length,
      startedAt: typeof row.started_at === "string" ? row.started_at : null,
      savedAt: typeof row.saved_at === "string" ? row.saved_at : null,
    });
  }
  return verdict
    ? { ...row, is_likely_test: verdict.isLikelyTest, test_reasons: verdict.reasons.join("|") }
    : row;
}

/**
 * People who asked us to restrict processing (GDPR Art. 18) must not be in the export. No
 * filter can promise that: their details also sit in payloads, URLs and free text, in more
 * encodings than any matcher decodes, and each attempt at one was shown a way past it. So the
 * export does not try. It stops, before writing anything, while anyone is restricted, and a
 * person decides (see docs/runbooks/TEAM_DATA_EXPORT.md). Nobody had been on 2026-10-10.
 */
export function assertNobodyRestricted(users: Row[]): void {
  const restricted = users.filter((u) => u.processing_restricted_at != null);
  if (restricted.length) {
    throw new Error(
      `${restricted.length} people asked us to restrict processing their data (app_user.processing_restricted_at); ` +
        "the export stops rather than risk copying them: see docs/runbooks/TEAM_DATA_EXPORT.md. Nothing written."
    );
  }
}

/**
 * One CSV cell. Text Excel would run as a formula (=, +, -, @ first) gets a leading quote,
 * as the admin export does; a number does not, so a negative value stays a number.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^[-+]?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The table's own columns first, so an empty table still has its header; added ones after. */
export function toCsv(rows: Row[], columns: string[] = []): string {
  const all = [...new Set([...columns, ...rows.flatMap((row) => Object.keys(row))])];
  const lines = [all.map(csvCell).join(",")];
  for (const row of rows) lines.push(all.map((c) => csvCell(row[c])).join(","));
  return `${lines.join("\n")}\n`;
}

export function readme(
  specs: TableSpec[],
  counts: Record<string, number>,
  generatedAt: string
): string {
  return [
    "# LoveIQ team data export",
    "",
    `Generated ${generatedAt} from the production database.`,
    "Everything, unmasked: emails, names, free-text answers, report links and payment details",
    "included. For the LoveIQ team only (Eman, Marcus, Mark, Fatih, Sanjin, Ajna): it holds",
    "customers' answers about their sex lives, so keep it in this folder and do not forward it.",
    "For a fresh copy, ask Claude (Jarvis) to export all the data; it takes a few minutes.",
    "",
    "| File | Rows |",
    "| --- | --- |",
    ...specs.map((s) => `| ${s.name}.csv | ${counts[s.name] ?? 0} |`),
    "",
    "- One CSV per database table, same columns. JSON columns hold JSON text.",
    "- Not exported: Jarvis's own index (brain_*), job and alert plumbing (cron_run,",
    "  rate_limits, system_flags, slack_*), and the log of people who asked us to delete their",
    "  data.",
    "- Nobody had asked us to restrict processing their data. The export stops while anyone has.",
    "- `is_likely_test` and `test_reasons` on survey_submission and survey_partial_save flag",
    "  staff emails and runs too fast to be real, as the admin panel does. Filter on them.",
    "- Every refresh replaces the files named after a table. Keep your own work under another",
    "  name or in a subfolder, or the next refresh overwrites it.",
    "- Read table by table over a few minutes, not as one snapshot: a row written meanwhile can",
    "  be in one file and not in its partner.",
    "- Excel: Data -> From Text/CSV, file origin UTF-8, and set id columns such as q_id and",
    "  frontend_qid to Text, or `00000` becomes `0`. Text that starts with = + - or @ has a",
    "  leading ' so Excel shows it instead of running it.",
    "",
  ].join("\n");
}

export function specsOf(
  definitions: Record<string, { properties?: Record<string, { description?: string }> }>
): TableSpec[] {
  const specs = Object.entries(definitions)
    .filter(([name]) => isExported(name))
    .map(([name, def]) => {
      const props = Object.entries(def.properties ?? {});
      return {
        name,
        columns: props.map(([column]) => column),
        key: props.filter(([, p]) => p.description?.includes("<pk/>")).map(([column]) => column),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  /**
   * A schema read that came back short must stop the run, not shrink it: with no tables the
   * export would upload a README over the real one and report success, and without app_user's
   * restriction column the check for restricted people would pass without looking.
   */
  const has = (table: string, column?: string) =>
    specs.some((s) => s.name === table && (!column || s.columns.includes(column)));
  const missing = [
    ["app_user", "processing_restricted_at"],
    ["survey_submission"],
    ["personal_report"],
    ["survey_submission_answer"],
  ].filter(([table, column]) => !has(table!, column));
  if (missing.length) {
    throw new Error(
      `the schema read is missing ${missing.map((m) => m.join(".")).join(", ")}; nothing written`
    );
  }
  return specs;
}

/** Every table the database exposes, with its columns and keys, from its own API. */
export async function tableSpecs(): Promise<TableSpec[]> {
  // 60 s, not the default 8: the description of every table is large and slow to build.
  const res = await supabaseFetch("/rest/v1/", {
    headers: { Accept: "application/openapi+json" },
    timeoutMs: 60_000,
  });
  if (!res.ok) throw new Error(`could not read the schema (${res.status}); nothing written`);
  const spec = (await res.json()) as {
    definitions?: Record<string, { properties?: Record<string, { description?: string }> }>;
  };
  return specsOf(spec.definitions ?? {});
}

/**
 * Every row of a table. With a single-column key, a page at a time after the last key seen:
 * paging by offset slowed past the fetch timeout near the end of the 168,000 behaviour events
 * on 2026-10-10, because the database walks every skipped row again for each page. A table
 * keyed on several columns, or none, is paged by offset in key (or column) order instead, and
 * a row seen twice is kept once: an insert that sorts before the page boundary while the read
 * runs (funnel_event is written all the time) shifts the next page by one.
 */
async function readAll(spec: TableSpec, isOutOfTime: () => boolean): Promise<Row[]> {
  const rows: Row[] = [];
  const keyset = spec.key.length === 1 ? spec.key[0]! : null;
  const order = (keyset ? [keyset] : spec.key.length ? spec.key : spec.columns)
    .map((c) => `${c}.asc`)
    .join(",");
  let after: unknown = null;
  for (let offset = 0; ; offset += POSTGREST_MAX_ROWS) {
    // Every page, not every table: the largest table is over a hundred pages.
    if (isOutOfTime()) throw new OutOfTime(`ran out of time reading ${spec.name}; nothing written`);
    const from =
      keyset && after !== null ? `&${keyset}=gt.${encodeURIComponent(String(after))}` : "";
    const page = keyset ? "" : `&offset=${offset}`;
    const res = await supabaseFetch(
      `/rest/v1/${spec.name}?select=*&order=${order}&limit=${POSTGREST_MAX_ROWS}${from}${page}`,
      { timeoutMs: 60_000, paginated: true }
    );
    if (!res.ok) throw new Error(`could not read ${spec.name} (${res.status}); nothing written`);
    const batch = (await res.json()) as Row[];
    rows.push(...batch);
    if (batch.length < POSTGREST_MAX_ROWS) break;
    if (keyset) after = batch[batch.length - 1]![keyset];
  }
  return keyset ? rows : uniqueRows(rows, spec.key.length ? spec.key : spec.columns);
}

/** Rows with the same values in `identity` kept once, first seen first. */
export function uniqueRows(rows: Row[], identity: string[]): Row[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const id = JSON.stringify(identity.map((c) => row[c]));
    return seen.has(id) ? false : (seen.add(id), true);
  });
}

/**
 * Every file of the export, the README last. App users are read first, so a restriction stops
 * the run before anything else is read. Each table becomes CSV as soon as it is read and its
 * rows are dropped: holding every table's rows until the end peaked at 1.1 GB on 2026-10-11,
 * over half of what a server function has.
 */
export async function buildExport(
  specs: TableSpec[],
  read: (spec: TableSpec, isOutOfTime: () => boolean) => Promise<Row[]> = readAll,
  isOutOfTime: () => boolean = () => false,
  generatedAt: () => string = () => new Date().toISOString()
): Promise<ExportFile[]> {
  const usersSpec = specs.find((s) => s.name === "app_user");
  if (!usersSpec) throw new Error("the schema read has no app_user; nothing written");
  const users = await read(usersSpec, isOutOfTime);
  assertNobodyRestricted(users);
  const emailOfUser = new Map(users.map((u) => [u.id, String(u.email ?? "")]));
  const counts: Record<string, number> = {};
  const files: ExportFile[] = [];
  for (const spec of specs) {
    if (isOutOfTime()) throw new OutOfTime(`ran out of time before ${spec.name}; nothing written`);
    const rows = spec === usersSpec ? users : await read(spec, isOutOfTime);
    counts[spec.name] = rows.length;
    files.push({
      name: `${spec.name}.csv`,
      body: toCsv(
        rows.map((row) => withTestFlag(spec.name, row, emailOfUser)),
        spec.columns
      ),
    });
  }
  // Last, so a run that fails part-way never shows a README dated after files it did not write.
  files.push({ name: "README.md", body: readme(specs, counts, generatedAt()) });
  return files;
}

/** The Drive property the server finds the team's folder by, so renaming the folder is safe. */
export const TEAM_FOLDER_TAG = { key: "loveiq_team_export", value: "production" } as const;

export function folderUrl(id: string): string {
  return `https://drive.google.com/drive/folders/${id}`;
}

/** A value inside a quoted Drive query term: backslashes and single quotes escaped. */
export function driveQuoted(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

interface Permission {
  type?: string;
  emailAddress?: string;
  displayName?: string;
}

interface FolderMeta {
  mimeType?: string;
  trashed?: boolean;
  ownedByMe?: boolean;
  writersCanShare?: boolean;
  permissions?: Permission[];
}

interface DriveFile {
  id: string;
  name: string;
  ownedByMe?: boolean;
  permissions?: Permission[];
}

/**
 * Why a permission list lets in more than loveiq.org people: a link, the whole domain, a group
 * (Drive does not list a group's members, and a group can hold outside accounts), or an
 * outside account. Empty when only loveiq.org people can open it.
 */
function openTo(permissions: Permission[] | undefined): string[] {
  // Fail closed: a reply without the list says nothing about who can open it.
  if (!Array.isArray(permissions)) return ["Drive did not say who can open it"];
  return permissions.flatMap((p) => {
    if (p.type === "anyone" || p.type === "domain") return [`it is shared by ${p.type} link`];
    if (p.type !== "user") {
      return [
        `it is shared with a ${p.type ?? "kind of account"} whose members Drive does not list`,
      ];
    }
    const email = (p.emailAddress ?? "").toLowerCase();
    return email.endsWith("@loveiq.org") ? [] : ["someone outside loveiq.org can open it"];
  });
}

/**
 * The folder must be ours and closed: owned by the account the export writes as, open only to
 * loveiq.org people (no link, domain or group), and editors unable to share it on. Checked
 * right before every upload, because the data goes there unattended and a folder's sharing
 * can change after the decision that made it.
 */
export function assertTeamOnly(folder: FolderMeta): void {
  const problems: string[] = [];
  if (folder.mimeType !== "application/vnd.google-apps.folder" || folder.trashed) {
    problems.push("it is not a folder in use");
  }
  if (folder.ownedByMe !== true) problems.push("ec@loveiq.org does not own it");
  if (folder.writersCanShare !== false) problems.push("its editors can share it on");
  problems.push(...openTo(folder.permissions));
  if (problems.length) {
    throw new Error(
      `refusing to upload: the Drive folder is not team-only (${[...new Set(problems)].join("; ")}). Nothing written.`
    );
  }
}

/**
 * One Drive request. A 429, a 5xx or a rate-limit 403 is retried twice (after 1 s, then 3 s):
 * a run makes about 300 requests, and one passing error would otherwise leave the folder
 * half refreshed. A timeout is not retried, so the run's deadline holds. A request that throws
 * fails without its URL: an upload's URL is a session link that takes content without a login
 * for a week, and these messages reach Slack, cron_run and the chat.
 */
async function drive(
  url: string,
  init: RequestInit & { timeoutMs: number },
  what: string
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetchWithTimeout(url, init);
    } catch (err) {
      const why = err instanceof Error && /timeout/i.test(err.message) ? "timed out" : "failed";
      throw new Error(`Drive ${what} ${why}`);
    }
    const passing =
      res.status === 429 ||
      res.status >= 500 ||
      (res.status === 403 && /rateLimitExceeded/i.test(await res.clone().text()));
    if (!passing || attempt === 2) return res;
    await new Promise((r) => setTimeout(r, 1000 * 3 ** attempt));
  }
}

const FOLDER_FIELDS =
  "mimeType,trashed,ownedByMe,writersCanShare,permissions(type,emailAddress,displayName)";

/**
 * Checks a folder by id before anything goes into it, and returns who can open it, by name,
 * so a reply can say exactly who.
 */
export async function checkFolder(token: string, id: string): Promise<string[]> {
  const res = await drive(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=${FOLDER_FIELDS}`,
    { headers: { Authorization: `Bearer ${token}` }, timeoutMs: 30_000 },
    "read of the folder"
  );
  if (!res.ok) throw new Error(`Drive could not read the folder (${res.status}). Nothing written.`);
  const folder = (await res.json()) as FolderMeta;
  assertTeamOnly(folder);
  return (folder.permissions ?? []).map((p) => p.displayName || p.emailAddress || "someone");
}

/**
 * The team's folder: the one carrying TEAM_FOLDER_TAG that ec@ owns. Owned, because anyone
 * can share a folder with ec@ and set the same tag on it (this repository is public), and the
 * export must never go into a folder somebody else controls.
 */
export async function findTeamFolder(token: string): Promise<{ id: string; people: string[] }> {
  const q = encodeURIComponent(
    `properties has { key=${driveQuoted(TEAM_FOLDER_TAG.key)} and value=${driveQuoted(TEAM_FOLDER_TAG.value)} } ` +
      "and mimeType='application/vnd.google-apps.folder' and 'me' in owners and trashed=false"
  );
  const res = await drive(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`,
    { headers: { Authorization: `Bearer ${token}` }, timeoutMs: 30_000 },
    "search for the team folder"
  );
  if (!res.ok) throw new Error(`Drive could not search for the team folder (${res.status})`);
  const found = ((await res.json()) as { files?: Array<{ id: string }> }).files ?? [];
  if (found.length !== 1) {
    throw new Error(
      `${found.length} of ec@'s Drive folders carry the team export's tag (one must): ` +
        "see docs/runbooks/TEAM_DATA_EXPORT.md. Nothing written."
    );
  }
  return { id: found[0]!.id, people: await checkFolder(token, found[0]!.id) };
}

/** Every file in the folder, with its owner and who can open it: one request for all. */
async function folderFiles(token: string, folderId: string): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  const q = encodeURIComponent(`${driveQuoted(folderId)} in parents and trashed=false`);
  let page = "";
  do {
    const res = await drive(
      `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=1000` +
        "&fields=nextPageToken,files(id,name,ownedByMe,permissions(type,emailAddress))" +
        (page ? `&pageToken=${encodeURIComponent(page)}` : ""),
      { headers: { Authorization: `Bearer ${token}` }, timeoutMs: 30_000 },
      "listing of the folder"
    );
    if (!res.ok)
      throw new Error(`Drive could not list the folder (${res.status}). Nothing written.`);
    const body = (await res.json()) as { files?: DriveFile[]; nextPageToken?: string };
    files.push(...(body.files ?? []));
    page = body.nextPageToken ?? "";
  } while (page);
  return files;
}

/**
 * The file each export file replaces (null: create it), checked for every file before any is
 * written, so a problem stops the run with the folder untouched:
 *   - two files with a table's name (an editor's copy saved under it): refreshing only one
 *     would leave the other holding old data, people erased since included;
 *   - a file ec@ does not own: its owner, not ec@, decides who it is shared with;
 *   - a file shared beyond loveiq.org people: sharing a single file does not show on the folder.
 */
export function plan(files: ExportFile[], existing: DriveFile[]): Array<string | null> {
  const problems: string[] = [];
  const ids = files.map((f) => {
    const same = existing.filter((e) => e.name === f.name);
    if (same.length > 1) problems.push(`${same.length} files are named ${f.name}`);
    const file = same.length === 1 ? same[0]! : null;
    if (file && file.ownedByMe !== true)
      problems.push(`${f.name} belongs to someone other than ec@`);
    if (file) problems.push(...openTo(file.permissions).map((why) => `${f.name}: ${why}`));
    return file?.id ?? null;
  });
  if (problems.length) {
    throw new Error(
      `refusing to upload: ${[...new Set(problems)].join("; ")}. Rename, unshare or delete those ` +
        "files in the Drive folder, then run again. Nothing written."
    );
  }
  return ids;
}

async function driveUpload(
  token: string,
  folderId: string,
  file: ExportFile,
  existing: string | null
): Promise<void> {
  const auth = { Authorization: `Bearer ${token}` };
  /**
   * `writersCanShare: false` on every file, new or replaced. The folder's own setting does not
   * reach the files in it: until 2026-10-11 all 77 let an editor share them with anyone.
   */
  const start = await drive(
    existing
      ? `https://www.googleapis.com/upload/drive/v3/files/${existing}?uploadType=resumable`
      : "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
    {
      method: existing ? "PATCH" : "POST",
      headers: { ...auth, "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify(
        existing
          ? { writersCanShare: false }
          : { name: file.name, parents: [folderId], writersCanShare: false }
      ),
      timeoutMs: 15_000,
    },
    `start of the upload of ${file.name}`
  );
  // Resumable, because a simple upload stops at 5 MB and the larger tables pass it.
  const session = start.headers.get("location");
  if (!start.ok || !session) throw new Error(`Drive refused ${file.name}: ${start.status}`);
  const put = await drive(
    session,
    {
      method: "PUT",
      headers: { "Content-Type": file.name.endsWith(".md") ? "text/markdown" : "text/csv" },
      body: file.body,
      timeoutMs: 90_000,
    },
    `upload of ${file.name}`
  );
  if (!put.ok) throw new Error(`Drive upload of ${file.name} failed: ${put.status}`);

  /**
   * Drive keeps each replaced version for about 30 days, and editors can open them. The old
   * versions go, or a person erased from the database would live on in last week's copy.
   */
  const id = existing ?? ((await put.json()) as { id?: string }).id;
  if (!id) throw new Error(`Drive did not say which file ${file.name} became`);
  const listed = await drive(
    `https://www.googleapis.com/drive/v3/files/${id}/revisions?fields=revisions(id)&pageSize=1000`,
    { headers: auth, timeoutMs: 15_000 },
    `listing of ${file.name}'s versions`
  );
  if (!listed.ok)
    throw new Error(`Drive could not list ${file.name}'s versions (${listed.status})`);
  const revisions =
    ((await listed.json()) as { revisions?: Array<{ id: string }> }).revisions ?? [];
  for (const old of revisions.slice(0, -1)) {
    const gone = await drive(
      `https://www.googleapis.com/drive/v3/files/${id}/revisions/${old.id}`,
      { method: "DELETE", headers: auth, timeoutMs: 15_000 },
      `deletion of an old version of ${file.name}`
    );
    if (!gone.ok) throw new Error(`Drive kept an old version of ${file.name} (${gone.status})`);
  }
}

/**
 * Each file into the folder, replacing its namesake, in order (the README is last). The folder
 * and every file it will replace are checked first, so a check that fails writes nothing; a
 * request that fails part-way leaves the files before it refreshed and the README older than
 * them, and the next run completes it.
 */
export async function uploadExport(
  token: string,
  folderId: string,
  files: ExportFile[],
  isOutOfTime: () => boolean = () => false
): Promise<void> {
  await checkFolder(token, folderId);
  const ids = plan(files, await folderFiles(token, folderId));
  for (const [i, f] of files.entries()) {
    if (isOutOfTime()) throw new OutOfTime(`ran out of time before uploading ${f.name}`);
    await driveUpload(token, folderId, f, ids[i]!);
  }
}
