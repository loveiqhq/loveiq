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

async function main(): Promise<void> {
  if (!GROUP_JID.endsWith("@g.us")) {
    console.error("WHATSAPP_GROUP_JID must be a group jid ending in @g.us — refusing to run.");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(DB)) {
    console.error(`No WhatsApp Desktop database at ${DB}\nInstall WhatsApp Desktop and link it.`);
    process.exitCode = 1;
    return;
  }

  const esc = GROUP_JID.replace(/'/g, "''");
  const session = query<{ pk: number }>(
    `select Z_PK as pk from ZWACHATSESSION where ZCONTACTJID = '${esc}' limit 1;`
  )[0];
  if (!session) {
    console.error(`That group is not in this database. Is WhatsApp Desktop linked and synced?`);
    process.exitCode = 1;
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

  const rows = query<{ ts: number; text: string | null; mine: number; jid: string | null }>(
    `select m.ZMESSAGEDATE as ts, m.ZTEXT as text, m.ZISFROMME as mine, g.ZMEMBERJID as jid
       from ZWAMESSAGE m
       left join ZWAGROUPMEMBER g on g.Z_PK = m.ZGROUPMEMBER
      where m.ZCHATSESSION = ${session.pk} and m.ZTEXT is not null and m.ZTEXT <> ''
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
    };
  });

  const chunks = dayRows({
    source: "whatsapp",
    idBase: `wa:${GROUP_JID}`,
    chat: CHAT_NAME,
    url: null,
    messages,
    stampedAt: new Date().toISOString(),
  });

  const { upsertChunks } = await import("@features/brain/server/ingest/upsert");
  const written = await upsertChunks(chunks);

  const days = new Set(messages.map((m) => m.day));
  console.log(
    `${CHAT_NAME}: ${messages.length} messages across ${days.size} days -> ${written} chunks written`
  );
  console.log(`speakers: ${[...new Set(messages.map((m) => m.sender))].join(", ")}`);
}

void main();
