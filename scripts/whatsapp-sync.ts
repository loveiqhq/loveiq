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
import { existsSync, statSync } from "node:fs";
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

  // A frozen database syncs "successfully" forever, so say so, and keep syncing what is there.
  const { desktopSilenceHours, DESKTOP_SILENCE_LIMIT_H } =
    await import("@features/brain/server/ingest/whatsapp");
  const mtimes = [DB, `${DB}-wal`].map((f) => (existsSync(f) ? statSync(f).mtimeMs : NaN));
  const silent = desktopSilenceHours(mtimes, Date.now());
  if (silent > DESKTOP_SILENCE_LIMIT_H) {
    fail(
      `WhatsApp Desktop has not written its database for ${Math.round(silent)}h: open it on ` +
        `this Mac, and check the phone still lists it under Linked devices.`
    );
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

  const { dayRows } = await import("@features/brain/server/ingest/whatsapp");
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

  const stampedAt = new Date().toISOString();
  const chunks = dayRows({
    source: "whatsapp",
    idBase: `wa:${GROUP_JID}`,
    chat: CHAT_NAME,
    url: null,
    messages,
    stampedAt,
  });

  const { upsertChunks, sweepStale } = await import("@features/brain/server/ingest/upsert");
  const written = await upsertChunks(chunks);

  /**
   * Remove chunks this run did not write.
   *
   * Without it, changing how the chat is cut leaves the previous shape behind as
   * orphans — the day-chunks this replaced would have sat there forever answering
   * questions with stale, truncated copies of the same conversation. `sweepStale`
   * has the majority guard, so a bad run cannot wipe the source.
   */
  const swept = await sweepStale("whatsapp", stampedAt, written);

  const days = new Set(messages.map((m) => m.day));
  console.log(
    `${CHAT_NAME}: ${messages.length} messages since ${SINCE_DAY} across ${days.size} days -> ` +
      `${written} chunks written, ${swept} stale swept`
  );
  console.log(`speakers: ${[...new Set(messages.map((m) => m.sender))].join(", ")}`);
}

const started = Date.now();
void main()
  .catch((err: unknown) => {
    fail(err instanceof Error ? err.message : String(err));
  })
  .finally(async () => {
    const { recordCronRun } = await import("@shared/observability/slack-alert-dedup");
    await recordCronRun("brain-whatsapp", started, failure ? "error" : "success", failure);
  });
