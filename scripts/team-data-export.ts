/**
 * The team's copy of the production data: every customer and product table, one CSV each,
 * for the team to explore freely.
 *
 * EVERYTHING, UNMASKED, BY DECISION. Eman, 2026-10-10: the team (Eman, Marcus, Mark, Fatih,
 * Sanjin, Ajna) gets all of it, with nothing removed or masked: emails, names, free-text
 * answers, report links, payment details. The folder it goes to is shared with those six and
 * nobody else.
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
 *
 * Usage, from the repository root:
 *   npx tsx --env-file=.env.local scripts/team-data-export.ts --out <folder outside any git repo>
 *     [--drive-folder <Google Drive folder id>]
 * With --drive-folder each CSV replaces the file of the same name in that folder, uploaded as
 * ec@ through domain-wide delegation, so the folder's link and sharing stay as they are.
 * See docs/runbooks/TEAM_DATA_EXPORT.md.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { POSTGREST_MAX_ROWS, supabaseFetch } from "@features/admin/server/supabase";
import { evaluateTestSubmission } from "@features/admin/server/test-submission";
import { DRIVE_WRITE_SCOPE, getDelegatedToken } from "@shared/http/google-oauth";

type Row = Record<string, unknown>;
export type Dataset = Record<string, Row[]>;

/** A table as the database describes it: its columns in order, and its primary key. */
export interface TableSpec {
  name: string;
  columns: string[];
  key: string[];
}

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
export function assertNobodyRestricted(data: Dataset): void {
  const restricted = (data.app_user ?? []).filter((u) => u.processing_restricted_at != null);
  if (restricted.length) {
    throw new Error(
      `${restricted.length} people asked us to restrict processing their data (app_user.processing_restricted_at); ` +
        "the export stops rather than risk copying them: see docs/runbooks/TEAM_DATA_EXPORT.md. Nothing written."
    );
  }
}

/** The whole transformation: test flags in. Nothing else changes. */
export function prepare(data: Dataset): Dataset {
  assertNobodyRestricted(data);
  const emailOfUser = new Map((data.app_user ?? []).map((u) => [u.id, String(u.email ?? "")]));
  const out: Dataset = {};
  for (const [table, rows] of Object.entries(data)) {
    out[table] = rows.map((row) => withTestFlag(table, row, emailOfUser));
  }
  return out;
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

/**
 * Customer data must never land where `git add` can reach it: not in this repository, and
 * not in any other checkout either (a worktree's export pointed at the main checkout would
 * pass a check against this repository alone).
 */
export function assertOutsideRepo(dir: string, repoRoot = resolve(__dirname, "..")): void {
  const target = resolve(dir);
  const rel = relative(repoRoot, target);
  let inside = rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  if (!inside) {
    let probe = target;
    while (!existsSync(probe) && dirname(probe) !== probe) probe = dirname(probe);
    const git = spawnSync("git", ["-C", probe, "rev-parse", "--is-inside-work-tree"], {
      encoding: "utf8",
    });
    inside = git.stdout?.trim() === "true";
  }
  if (inside) {
    throw new Error(
      `refusing to write inside a git repository (${dir}): this is customer data and must never be committed`
    );
  }
}

export function readme(specs: TableSpec[], data: Dataset, generatedAt: string): string {
  return [
    "# LoveIQ team data export",
    "",
    `Generated ${generatedAt} from the production database by scripts/team-data-export.ts.`,
    "Everything, unmasked: emails, names, free-text answers, report links and payment details",
    "included. For the LoveIQ team only (Eman, Marcus, Mark, Fatih, Sanjin, Ajna): it holds",
    "customers' answers about their sex lives, so keep it in this folder and do not forward it.",
    "",
    "| File | Rows |",
    "| --- | --- |",
    ...specs.map((s) => `| ${s.name}.csv | ${data[s.name]?.length ?? 0} |`),
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
async function tableSpecs(): Promise<TableSpec[]> {
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
async function readAll(spec: TableSpec): Promise<Row[]> {
  const rows: Row[] = [];
  const keyset = spec.key.length === 1 ? spec.key[0]! : null;
  const order = (keyset ? [keyset] : spec.key.length ? spec.key : spec.columns)
    .map((c) => `${c}.asc`)
    .join(",");
  let after: unknown = null;
  for (let offset = 0; ; offset += POSTGREST_MAX_ROWS) {
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

/** A value inside a quoted Drive query term: backslashes and single quotes escaped. */
export function driveQuoted(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

/**
 * The one file a refresh replaces, or none to create. Two files with a table's name (an
 * editor's copy saved under it) stop the run: refreshing only the first would leave the
 * other holding old data, people erased since included.
 */
export function fileToReplace(found: Array<{ id: string }>, name: string): string | null {
  if (found.length > 1) {
    throw new Error(
      `${found.length} files are named ${name} in the Drive folder; rename or delete the extra ones, then run again`
    );
  }
  return found[0]?.id ?? null;
}

async function driveUpload(token: string, folderId: string, name: string, body: string) {
  const auth = { Authorization: `Bearer ${token}` };
  const q = encodeURIComponent(
    `${driveQuoted(folderId)} in parents and name=${driveQuoted(name)} and trashed=false`
  );
  const search = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
    headers: auth,
  });
  // Stop rather than guess: an unread folder would otherwise get a second copy of every file.
  if (!search.ok) throw new Error(`Drive could not list the folder (${search.status})`);
  const existing = fileToReplace(
    ((await search.json()) as { files?: Array<{ id: string }> }).files ?? [],
    name
  );
  // Resumable, because a simple upload stops at 5 MB and the larger tables pass it.
  const start = await fetch(
    existing
      ? `https://www.googleapis.com/upload/drive/v3/files/${existing}?uploadType=resumable`
      : "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
    {
      method: existing ? "PATCH" : "POST",
      headers: { ...auth, "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify(existing ? {} : { name, parents: [folderId] }),
    }
  );
  const session = start.headers.get("location");
  if (!start.ok || !session) throw new Error(`Drive refused ${name}: ${start.status}`);
  const put = await fetch(session, {
    method: "PUT",
    headers: { "Content-Type": name.endsWith(".md") ? "text/markdown" : "text/csv" },
    body,
  });
  if (!put.ok) throw new Error(`Drive upload of ${name} failed: ${put.status}`);

  /**
   * Drive keeps each replaced version for about 30 days, and editors can open them. The old
   * versions go, or a person erased from the database would live on in last week's copy.
   */
  const id = existing ?? ((await put.json()) as { id?: string }).id;
  if (!id) throw new Error(`Drive did not say which file ${name} became`);
  const listed = await fetch(
    `https://www.googleapis.com/drive/v3/files/${id}/revisions?fields=revisions(id)&pageSize=1000`,
    { headers: auth }
  );
  if (!listed.ok) throw new Error(`Drive could not list ${name}'s versions (${listed.status})`);
  const revisions =
    ((await listed.json()) as { revisions?: Array<{ id: string }> }).revisions ?? [];
  for (const old of revisions.slice(0, -1)) {
    const gone = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}/revisions/${old.id}`,
      {
        method: "DELETE",
        headers: auth,
      }
    );
    if (!gone.ok) throw new Error(`Drive kept an old version of ${name} (${gone.status})`);
  }
}

async function main(): Promise<void> {
  const arg = (flag: string) => {
    const at = process.argv.indexOf(flag);
    if (at === -1) return undefined;
    const value = process.argv[at + 1];
    // An unset shell variable leaves the flag with nothing after it: say so, never skip it.
    if (!value || value.startsWith("--")) throw new Error(`${flag} needs a value`);
    return value;
  };
  const out = arg("--out");
  if (!out) throw new Error("--out <folder outside any git repository> is required");
  assertOutsideRepo(out);
  const folder = arg("--drive-folder");
  const driveToken = async () => {
    const token = await getDelegatedToken("ec@loveiq.org", DRIVE_WRITE_SCOPE);
    if (!token) {
      throw new Error("no Drive token: needs GOOGLE_IMPERSONATE_SERVICE_ACCOUNT and gcloud ADC");
    }
    return token;
  };
  // Before the long read, so a missing Google login fails in a second, not after minutes.
  if (folder) await driveToken();

  const specs = await tableSpecs();
  const raw: Dataset = {};
  for (const spec of specs) {
    raw[spec.name] = await readAll(spec);
    console.log(`read ${spec.name}: ${raw[spec.name]!.length} rows`);
  }
  const data = prepare(raw);
  const files = specs.map((s) => ({
    name: `${s.name}.csv`,
    body: toCsv(data[s.name]!, s.columns),
  }));
  // Last, so a run that fails part-way never shows a README dated after files it did not write.
  files.push({
    name: "README.md",
    body: readme(specs, data, new Date().toISOString()),
  });

  mkdirSync(out, { recursive: true, mode: 0o700 });
  for (const f of files) writeFileSync(join(out, f.name), f.body, { mode: 0o600 });
  console.log(`wrote ${files.length} files to ${out}`);

  if (folder) {
    // A fresh token: one lasts an hour, and the read before this can be long.
    const token = await driveToken();
    for (const f of files) await driveUpload(token, folder, f.name, f.body);
    console.log(`uploaded ${files.length} files to Drive folder ${folder}`);
  }
}

if (process.argv[1]?.endsWith("team-data-export.ts")) {
  main().catch((err) => {
    console.error(String(err instanceof Error ? err.message : err));
    process.exit(1);
  });
}
