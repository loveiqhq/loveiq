/**
 * Read ONE WhatsApp group from the local WhatsApp Desktop database and push it into
 * the brain.
 *
 * WHY THIS EXISTS. There is no way to read an existing WhatsApp group over an API.
 * Meta's 2026 Groups API covers only groups the business itself created, capped at 8
 * members. The unofficial libraries that CAN read a real group work by impersonating
 * a linked device over WhatsApp's protocol — that is the Terms of Service clause
 * that gets numbers permanently banned, typically within 2-8 weeks.
 *
 * This does neither. WhatsApp Desktop is a first-party linked device, and it keeps
 * every message in a plain SQLite file on this Mac. This script opens that file
 * READ-ONLY. It never speaks to WhatsApp's servers, so the automation clause simply
 * does not apply: it is your own messages, at rest, on your own machine.
 *
 * THE SAFEGUARD THAT MATTERS. That database holds every chat on the account,
 * including private ones. This is scoped to a single group JID and refuses to run
 * without one — an allowlist, not a filter. No query in this file can reach another
 * conversation.
 *
 *   npx tsx scripts/whatsapp-sync.ts
 *
 * Needs Full Disk Access for whatever runs it (System Settings -> Privacy &
 * Security -> Full Disk Access), because macOS protects the app container.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** The ONLY conversation this script may read. */
const GROUP_JID = process.env.WHATSAPP_GROUP_JID ?? "120363422139124113@g.us";
const CHAT_NAME = process.env.WHATSAPP_GROUP_NAME ?? "LoveIQ";

/**
 * Oldest day worth indexing.
 *
 * A linked desktop keeps back-filling in the background — 53 days of history when
 * first linked, 306 a few hours later. Anything before this is skipped, and the
 * sweep removes it if an earlier run already indexed it — so this default is what
 * decides the corpus, and an env override alone would be UNDONE by the next
 * ordinary run.
 *
 * WAS 2026-05-01, on the grounds that older chat was "not worth the storage or the
 * embedding cost". Measured 2026-09-19 against the desktop database, that was wrong
 * by orders of magnitude: the cutoff excluded 1,006 of the group's 2,373 messages —
 * 42%, across 116 days — for 59,586 characters of text, about twenty-five chunks.
 * The Postgres volume is 8.35 GB with 82% free. What it actually cost was the
 * company's first six months, which is the period most dense with founding
 * decisions and the one nobody can reconstruct from memory.
 */
const SINCE_DAY = process.env.WHATSAPP_SINCE ?? "2025-10-01";

const DB = join(
  homedir(),
  "Library/Group Containers/group.net.whatsapp.WhatsApp.shared/ChatStorage.sqlite"
);
/** Core Data counts seconds from 2001-01-01, not from 1970. */
const CORE_DATA_EPOCH = 978_307_200;

function query<T>(sql: string): T[] {
  const out = execFileSync("sqlite3", ["-readonly", "-json", `file:${DB}?immutable=1`, sql], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.trim() ? (JSON.parse(out) as T[]) : [];
}

/**
 * Why the run failed, if it did. Every run records itself as `brain-whatsapp` in cron_run,
 * so the stall watcher can say when this laptop job has gone quiet: it pauses whenever the
 * Mac is closed, and the watcher counts only successful runs.
 */
let failure: string | undefined;
/** Whether this run wrote or removed anything: a run that changed nothing records sparingly. */
let changed = false;
function fail(message: string): void {
  console.error(message);
  failure ??= message.split("\n")[0];
  process.exitCode = 1;
}

async function main(): Promise<void> {
  if (!GROUP_JID.endsWith("@g.us")) {
    fail("WHATSAPP_GROUP_JID must be a group jid ending in @g.us — refusing to run.");
    return;
  }
  if (!existsSync(DB)) {
    fail(`No WhatsApp Desktop database at ${DB}\nInstall WhatsApp Desktop and link it.`);
    return;
  }

  const esc = GROUP_JID.replace(/'/g, "''");
  const session = query<{ pk: number }>(
    `select Z_PK as pk from ZWACHATSESSION where ZCONTACTJID = '${esc}' limit 1;`
  )[0];
  if (!session) {
    fail(`That group is not in this database. Is WhatsApp Desktop linked and synced?`);
    return;
  }

  // Sender names live in a separate table, keyed by the member's jid. Group members
  // are `@lid` identifiers now rather than phone numbers, and ZCONTACTNAME is empty,
  // so this table is the only place a readable name exists.
  const names = new Map<string, string>();
  for (const r of query<{ jid: string; name: string }>(
    `select ZJID as jid, ZPUSHNAME as name from ZWAPROFILEPUSHNAME
      where ZJID in (select ZMEMBERJID from ZWAGROUPMEMBER where ZCHATSESSION = ${session.pk});`
  )) {
    if (r.jid && r.name) names.set(r.jid, r.name);
  }

  /**
   * TAKE THE CAPTION TOO, NOT JUST `ZTEXT`.
   *
   * A first pass read `ZTEXT` alone and silently dropped 111 of 614 messages — 18%
   * of the group. They are not empty: a photo or voice note posted with a caption
   * stores that caption on the MEDIA row as `ZTITLE`, and those captions are real
   * sentences ("Traffic has been stable over the last 4 weeks…", "I am capturing all
   * insights and what I think we should do…"). Losing them loses arguments.
   *
   * Checked the other way round too: every column in both tables was enumerated for
   * this chat. `ZVCARDSTRING` is a MIME type, `ZVCARDNAME` a hash, `ZMEDIAURL` an
   * expiring CDN link — none are content. External links do appear in `ZMETADATA`,
   * but all 44 of those messages already carry the link in `ZTEXT`, so nothing is
   * lost by ignoring it.
   */
  // Core Data counts from 2001, so the floor has to be converted before it can be
  // compared against ZMESSAGEDATE.
  const sinceCoreData = Math.floor(Date.parse(`${SINCE_DAY}T00:00:00Z`) / 1000) - CORE_DATA_EPOCH;

  const rows = query<{ ts: number; text: string | null; mine: number; jid: string | null }>(
    `select m.ZMESSAGEDATE as ts,
            coalesce(nullif(m.ZTEXT, ''), nullif(i.ZTITLE, '')) as text,
            m.ZISFROMME as mine,
            g.ZMEMBERJID as jid
       from ZWAMESSAGE m
       left join ZWAGROUPMEMBER g on g.Z_PK = m.ZGROUPMEMBER
       left join ZWAMEDIAITEM i on i.ZMESSAGE = m.Z_PK
      where m.ZCHATSESSION = ${session.pk}
        and coalesce(nullif(m.ZTEXT, ''), nullif(i.ZTITLE, '')) is not null
        and m.ZMESSAGEDATE >= ${sinceCoreData}
      order by m.ZMESSAGEDATE asc;`
  );

  const { dayFingerprint, dayRows, daysToWrite, groupQuietDays, GROUP_QUIET_LIMIT_DAYS } =
    await import("@features/brain/server/ingest/whatsapp");
  const messages = rows.map((r) => {
    const at = new Date((r.ts + CORE_DATA_EPOCH) * 1000);
    return {
      day: at.toISOString().slice(0, 10),
      time: at.toISOString().slice(11, 16),
      sender: r.mine ? "Eman" : (r.jid && names.get(r.jid)) || "someone",
      text: r.text ?? "",
      at: at.getTime(),
    };
  });

  // A frozen copy syncs "successfully" forever, so a quiet week fails the run, and the rest
  // still syncs.
  const quiet = groupQuietDays(
    messages.map((m) => m.at),
    Date.now()
  );
  if (quiet > GROUP_QUIET_LIMIT_DAYS) {
    fail(
      `No new message in the group for ${Number.isFinite(quiet) ? Math.floor(quiet) : "any"} ` +
        `days: is WhatsApp Desktop open on this Mac, and still under Linked devices on the phone?`
    );
  }

  const { loadPeople, peopleIn } = await import("@features/brain/server/people");
  const byAlias = await loadPeople();
  if (!byAlias) {
    // Without it every fingerprint changes and every day would be rewritten without its
    // people. The next run, five minutes on, tries again.
    fail("The people registry could not be read, so nothing was written.");
    return;
  }

  const stampedAt = new Date().toISOString();
  const parts = dayRows({
    source: "whatsapp",
    idBase: `wa:${GROUP_JID}`,
    chat: CHAT_NAME,
    url: null,
    messages,
    stampedAt,
  }).map((row) => ({
    ...row,
    meta: {
      ...(row.meta ?? {}),
      fingerprint: dayFingerprint(row, peopleIn(row.meta ?? {}, byAlias)),
    },
  }));

  const { readAll } = await import("@features/brain/server/read-all");
  const stored = await readAll<{ source_id: string; fingerprint: string | null }>(
    `/rest/v1/brain_chunk?select=source_id,fingerprint:meta->>fingerprint&source=eq.whatsapp`
  );
  // Unreadable: write every day, as every run did before the fingerprints.
  const toWrite = stored
    ? daysToWrite(parts, new Map(stored.map((r) => [r.source_id, r.fingerprint])))
    : parts;

  const { upsertChunks, sweepMissing } = await import("@features/brain/server/ingest/upsert");
  const written = toWrite.length ? await upsertChunks(toWrite) : 0;
  if (written !== toWrite.length)
    fail(`Wrote ${written} of the ${toWrite.length} days that changed.`);

  /**
   * Remove the days this run no longer produces (a day cut into fewer parts, a moved floor).
   * By id, not by write time: an unchanged day is not rewritten, so its write time is old
   * and says nothing. `sweepMissing` keeps the majority guard, so a bad read cannot wipe
   * the source. Asked only when a stored day is missing from this run, which is rare, so
   * the usual five-minute run does not re-read every row.
   */
  const current = new Set(parts.map((r) => r.source_id));
  const gone = stored === null || stored.some((r) => !current.has(r.source_id));
  const swept = gone ? await sweepMissing("whatsapp", current) : 0;
  changed = written + swept > 0;

  const days = new Set(messages.map((m) => m.day));
  console.log(
    `${CHAT_NAME}: ${messages.length} messages since ${SINCE_DAY} across ${days.size} days -> ` +
      `${written} of ${parts.length} day parts written, ${swept} removed`
  );
  if (written) console.log(`speakers: ${[...new Set(messages.map((m) => m.sender))].join(", ")}`);
}

const started = Date.now();
void main()
  .catch((err: unknown) => {
    fail(err instanceof Error ? err.message : String(err));
  })
  .finally(async () => {
    // Every failure and every run that changed something, and otherwise one an hour: a run
    // every five minutes would otherwise record "nothing new" 288 times a day.
    if (!failure && !changed && (await succeededWithinTheHour())) return;
    const { recordCronRun } = await import("@shared/observability/slack-alert-dedup");
    await recordCronRun("brain-whatsapp", started, failure ? "error" : "success", failure);
  });

/** Whether a successful run was recorded in the last 55 minutes. False when unsure. */
async function succeededWithinTheHour(): Promise<boolean> {
  try {
    const { supabaseFetch } = await import("@features/admin/server/supabase");
    const since = new Date(Date.now() - 55 * 60_000).toISOString();
    const res = await supabaseFetch(
      `/rest/v1/cron_run?select=id&cron_name=eq.brain-whatsapp&status=eq.success` +
        `&started_at=gte.${encodeURIComponent(since)}&limit=1`
    );
    return res.ok && ((await res.json()) as unknown[]).length > 0;
  } catch {
    return false;
  }
}
