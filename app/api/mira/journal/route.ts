/**
 * /api/mira/journal — the signed-in account's daily journal (features/mira/server/journal.ts).
 *
 *   GET     → the entries of about the last year (newest first) and the journal's settings
 *   PUT     → saves one day's check-in { day, mood?, body?, closeness?, energy?, note?, base }:
 *             each area 1 to 5 or null, at least one rated, a one-line note. `base` is the version
 *             the browser started from: null for a new check-in, or the entry's `updated_at` (GET
 *             gives it, a save answers it as `updatedAt`). A new entry only for yesterday or today
 *             in the person's zone (the browser sends their today); an older day only where an
 *             entry exists (404). Never over a day another tab or device changed meanwhile: 409
 *             { conflict, current } with the day as it is now (null: deleted). A note with crisis
 *             words gets the chat's support lines (crisisLines), and is kept.
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
  type SaveOutcome,
} from "@features/mira/server/journal";
import { MINOR_REFUSAL } from "@features/mira/server/goals";
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
    base: z.iso.datetime({ offset: true }).nullable(),
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
      // Known, so a crisis note's support lines are still logged for the account (PUT).
      refused: account,
      error:
        minor === null
          ? NextResponse.json({ error: "Unable to load your journal." }, { status: 500 })
          : NextResponse.json(MINOR_REFUSAL, { status: 403 }),
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

/** A body far bigger than any check-in is refused before it is parsed or searched. */
const MAX_BODY_CHARS = 20_000;

/**
 * The chat's support lines for a note with crisis words, with this person's country first; logged
 * as the chat logs them (nudges and reminders then wait 14 days), never with the words.
 */
async function supportLines(
  request: Request,
  userId: string | null,
  outcome: SaveOutcome | null = null
) {
  const profile = userId ? await getProfile(userId).catch(() => null) : null;
  const country =
    profile?.country && profile.country !== "OTHER" ? profile.country : requestCountry(request);
  if (userId) logMiraEvent("crisis_shown", { userId }, { country, from: "journal" });
  return NextResponse.json({
    success: false,
    ...answer(outcome),
    crisis: true,
    crisisLines: crisisFor(country),
  });
}

/** What a save answers besides its status: the new version, or the day as another tab left it. */
function answer(outcome: SaveOutcome | null) {
  if (outcome === null || outcome === "missing") return {};
  return "updatedAt" in outcome
    ? { success: true, updatedAt: outcome.updatedAt }
    : {
        conflict: true,
        current: outcome.conflict,
        error: outcome.conflict
          ? "This day's check-in changed in another tab or on another device."
          : "This check-in was deleted in another tab or on another device.",
      };
}

export async function PUT(request: Request) {
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }
  const text = await request.text().catch(() => "");
  if (text.length > MAX_BODY_CHARS) {
    return NextResponse.json({ error: "Invalid input" }, { status: 413 });
  }
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  // Read leniently first, as the chat does: crisis words get the support lines whatever else
  // stops the save below (nothing rated, a limit, an account stopped as under 18, the database).
  const raw = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const crisis = typeof raw.note === "string" && isCrisisMessage(raw.note);
  const g = await guard(request, false);
  if ("error" in g) {
    return crisis ? supportLines(request, g.refused?.id ?? null) : g.error;
  }
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return crisis
      ? supportLines(request, g.account.id)
      : NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const b = parsed.data;
  const entry: JournalEntry = {
    day: b.day,
    mood: b.mood ?? null,
    body: b.body ?? null,
    closeness: b.closeness ?? null,
    energy: b.energy ?? null,
    note: b.note || null,
  };
  let saved: SaveOutcome | null = null;
  try {
    const zone = (await getProfile(g.account.id))?.time_zone ?? "UTC";
    saved = await saveEntry(g.account.id, entry, canStart(entry.day, new Date(), zone), b.base);
  } catch (err) {
    logger.error({ err }, "mira: a journal entry was not saved");
  }
  if (saved !== null && typeof saved === "object" && "updatedAt" in saved) {
    const areas = AREAS.filter((a) => entry[a.id] !== null).length;
    logMiraEvent("journal_saved", { userId: g.account.id }, { areas, note: entry.note !== null });
  }
  if (crisis) return supportLines(request, g.account.id, saved);
  if (saved === null) {
    return NextResponse.json(
      { error: "Your check-in didn't save. Please try again." },
      { status: 500 }
    );
  }
  if (saved === "missing") {
    return NextResponse.json({ error: "There's no check-in on that day." }, { status: 404 });
  }
  return NextResponse.json(answer(saved), { status: "conflict" in saved ? 409 : 200 });
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
