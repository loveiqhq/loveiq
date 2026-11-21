/**
 * /api/mira/journal — the signed-in account's daily journal (features/mira/server/journal.ts).
 *
 *   GET     → the entries of about the last year (newest first) and the journal's settings
 *   PUT     → saves one day's check-in { day, mood?, body?, closeness?, energy?, note? }: each
 *             area 1 to 5 or null, at least one rated, a one-line note. A new entry only for a day
 *             it is somewhere right now (the browser sends the person's today); an older day only
 *             where an entry exists. A note with crisis words gets the chat's support lines
 *             (crisisLines), and is kept.
 *   PATCH   → the settings: { share: "off" | "scores" | "notes" } (what Mira may read) and/or
 *             { reminderTime: "HH:00" | "HH:30" | null } (the daily reminder email)
 *   DELETE ?day=YYYY-MM-DD → one entry;  DELETE ?all=1 → every entry
 *
 * Someone Mira stopped as under 18 is refused (403), as by her other routes.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { AREAS, canStart, NOTE_MAX, type JournalEntry } from "@features/mira/journal";
import { crisisFor, requestCountry } from "@features/mira/server/crisis";
import {
  deleteEntries,
  readJournal,
  saveEntry,
  saveJournalSettings,
} from "@features/mira/server/journal";
import { isMinor } from "@features/mira/server/minor";
import { isCrisisMessage } from "@features/mira/server/safety";
import { getMiraAccount } from "@features/mira/server/session";
import { getProfile, logMiraEvent } from "@features/mira/server/store";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";

const rating = z.number().int().min(1).max(5).nullable().optional();
const putSchema = z
  .object({
    day: z.iso.date(),
    mood: rating,
    body: rating,
    closeness: rating,
    energy: rating,
    // One line: line breaks and runs of spaces become one space.
    note: z
      .string()
      .max(2000)
      .transform((s) => s.replace(/\s+/g, " ").trim())
      .pipe(z.string().max(NOTE_MAX))
      .nullable()
      .optional(),
  })
  .strict()
  .refine((b) => AREAS.some((a) => typeof b[a.id] === "number"), "Rate at least one area");

const patchSchema = z
  .object({
    share: z.enum(["off", "scores", "notes"]).optional(),
    reminderTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[03]0$/)
      .nullable()
      .optional(),
  })
  .strict()
  .refine((b) => b.share !== undefined || b.reminderTime !== undefined);

const deleteSchema = z.union([
  z.object({ day: z.iso.date(), all: z.null() }),
  z.object({ day: z.null(), all: z.literal("1") }),
]);

async function guard(request: Request, write: boolean) {
  if (write && !(await verifyCsrfToken(request))) {
    return { error: NextResponse.json({ error: "Invalid request." }, { status: 403 }) };
  }
  const rate = await checkRateLimit(getClientIp(request), {
    bucket: "mira-journal",
    limit: 60,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return {
      error: NextResponse.json({ error: "Please try again in a minute." }, { status: 429 }),
    };
  }
  const account = await getMiraAccount();
  if (!account) return { error: NextResponse.json({ error: "Please sign in." }, { status: 401 }) };
  // Under 18 (rail 15): no journal, as no coaching. A mark that can't be read refuses too.
  const minor = await isMinor(account.id).catch(() => null);
  if (minor !== false) {
    return {
      error:
        minor === null
          ? NextResponse.json({ error: "Unable to load your journal." }, { status: 500 })
          : NextResponse.json({ error: "The journal isn't available." }, { status: 403 }),
    };
  }
  return { account };
}

export async function GET(request: Request) {
  const g = await guard(request, false);
  if ("error" in g) return g.error;
  try {
    const journal = await readJournal(g.account.id);
    if (!journal) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    return NextResponse.json(journal, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logger.error({ err }, "mira: could not read a journal");
    return NextResponse.json({ error: "Unable to load your journal." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const g = await guard(request, true);
  if ("error" in g) return g.error;
  const parsed = putSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const b = parsed.data;
  const entry: JournalEntry = {
    day: b.day,
    mood: b.mood ?? null,
    body: b.body ?? null,
    closeness: b.closeness ?? null,
    energy: b.energy ?? null,
    note: b.note || null,
  };
  const who = { userId: g.account.id };
  // Crisis words get the support lines whatever happens to the save (the chat's rule).
  const crisis = entry.note !== null && isCrisisMessage(entry.note);
  let saved: boolean | null = null;
  try {
    saved = await saveEntry(g.account.id, entry, canStart(entry.day, new Date()));
  } catch (err) {
    logger.error({ err }, "mira: a journal entry was not saved");
  }
  if (saved) {
    const areas = AREAS.filter((a) => entry[a.id] !== null).length;
    logMiraEvent("journal_saved", who, { areas, note: entry.note !== null });
  }
  if (crisis) {
    const profile = await getProfile(g.account.id).catch(() => null);
    const country =
      profile?.country && profile.country !== "OTHER" ? profile.country : requestCountry(request);
    // Counted with the chat's support lines (nudges and reminders then wait 14 days); no words.
    logMiraEvent("crisis_shown", who, { country, from: "journal" });
    return NextResponse.json({
      success: saved === true,
      crisis: true,
      crisisLines: crisisFor(country),
    });
  }
  if (saved === null) {
    return NextResponse.json(
      { error: "Your check-in didn't save. Please try again." },
      { status: 500 }
    );
  }
  if (!saved) {
    return NextResponse.json({ error: "There's no check-in on that day." }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}

export async function PATCH(request: Request) {
  const g = await guard(request, true);
  if ("error" in g) return g.error;
  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    await saveJournalSettings(g.account.id, parsed.data);
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "mira: journal settings were not saved");
    return NextResponse.json({ error: "Unable to save." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const g = await guard(request, true);
  if ("error" in g) return g.error;
  const params = new URL(request.url).searchParams;
  const query = deleteSchema.safeParse({ day: params.get("day"), all: params.get("all") });
  if (!query.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    await deleteEntries(g.account.id, query.data.day ?? undefined);
    logMiraEvent("journal_deleted", { userId: g.account.id }, { all: query.data.all === "1" });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "mira: journal entries were not deleted");
    return NextResponse.json(
      { error: "Unable to delete right now. Please try again." },
      { status: 500 }
    );
  }
}
