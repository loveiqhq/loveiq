/**
 * /api/mira/weekly-session — the signed-in person's weekly session (features/mira/server/
 * weekly-sessions.ts): one weekly slot, 15 minutes, with a calendar invite and reminders.
 *
 *   GET                → { slot: null | { weekday, time, timeZone, paused, next, googleUrl },
 *                          timeZone } (the profile's zone, to book in)
 *   GET ?format=ics    → the invite as a download (METHOD:PUBLISH), for Apple or Outlook
 *   PUT { weekday, time, timeZone, source }  → books it, or moves it; emails the invite
 *   PATCH { paused }   → reminder emails off or back on (the slot and calendar entry stay)
 *   DELETE             → cancels it; emails the cancellation that clears it from the calendar
 *                        ({ emailed }), or, when that email can't go, answers with it (`ics`) to
 *                        download
 *
 * Someone Mira stopped as under 18 is refused (403, `minor: true`) on every call, before anything
 * is read; the pages hide sessions only then (a failed CSRF check is a 403 too, to retry).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { sessionIcs } from "@features/mira/server/calendar";
import { isMinor } from "@features/mira/server/minor";
import { from, isValidTimeZone } from "@features/mira/server/nudges";
import { cancellationIcs, sendSessionEmail } from "@features/mira/server/session-emails";
import { getMiraAccount } from "@features/mira/server/session";
import { getProfile, logMiraEvent } from "@features/mira/server/store";
import {
  calendarText,
  deleteSlot,
  getSlot,
  saveSlot,
  setPaused,
  slotView,
} from "@features/mira/server/weekly-sessions";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export const dynamic = "force-dynamic";

const putSchema = z
  .object({
    weekday: z.number().int().min(1).max(7),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    // An IANA name only (Intl also takes offsets such as "+01:00", whose ":" would break the
    // invite's TZID), stored as the zone database spells it.
    timeZone: z
      .string()
      .max(64)
      .regex(/^[A-Za-z][\w+/-]*$/)
      .refine(isValidTimeZone)
      .transform(
        (tz) => new Intl.DateTimeFormat("en-US", { timeZone: tz }).resolvedOptions().timeZone
      ),
    /** Where it was booked: the chat's time picker, Home's card or Settings. */
    source: z.enum(["chat", "home", "settings"]),
  })
  .strict();
const patchSchema = z.object({ paused: z.boolean() }).strict();

async function guard(request: Request, write: boolean) {
  if (write && !(await verifyCsrfToken(request))) {
    return { error: NextResponse.json({ error: "Invalid request." }, { status: 403 }) };
  }
  const rate = await checkRateLimit(getClientIp(request), {
    bucket: "mira-weekly-session",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return {
      error: NextResponse.json({ error: "Please try again in a minute." }, { status: 429 }),
    };
  }
  const account = await getMiraAccount();
  if (!account) return { error: NextResponse.json({ error: "Please sign in." }, { status: 401 }) };
  if (await isMinor(account.id)) {
    return {
      error: NextResponse.json({ error: "Not available.", minor: true }, { status: 403 }),
    };
  }
  return { account };
}

const noStore = { headers: { "Cache-Control": "no-store" } };

export async function GET(request: Request) {
  try {
    const g = await guard(request, false);
    if ("error" in g) return g.error;
    if (new URL(request.url).searchParams.get("format") === "ics") {
      const slot = await getSlot(g.account.id);
      if (!slot) return NextResponse.json({ error: "No weekly session." }, { status: 404 });
      const text = calendarText();
      const ics = sessionIcs({
        uid: slot.id,
        sequence: slot.sequence,
        method: "PUBLISH",
        slot,
        organizer: /<([^>]+)>/.exec(from())?.[1] ?? from(),
        summary: text.summary,
        description: text.details,
        url: text.url,
        now: new Date(),
      });
      return new NextResponse(ics, {
        headers: {
          "Content-Type": "text/calendar; charset=utf-8",
          "Content-Disposition": 'attachment; filename="mira-weekly-session.ics"',
          "Cache-Control": "no-store",
        },
      });
    }
    const [slot, profile] = await Promise.all([getSlot(g.account.id), getProfile(g.account.id)]);
    return NextResponse.json(
      { slot: slot ? slotView(slot) : null, timeZone: profile?.time_zone ?? "Europe/Berlin" },
      noStore
    );
  } catch (err) {
    logger.error({ err }, "mira: could not read the weekly session");
    return NextResponse.json({ error: "Unable to load your weekly session." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const g = await guard(request, true);
    if ("error" in g) return g.error;
    const parsed = putSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    const { source, ...wanted } = parsed.data;
    const { account } = g;
    const saved = await saveSlot(account.id, wanted);
    let emailed = false;
    if (saved.change !== "same") {
      logMiraEvent(
        saved.change === "booked" ? "session_scheduled" : "session_changed",
        { userId: account.id },
        { source }
      );
      emailed = await sendSessionEmail(saved.change, {
        userId: account.id,
        email: account.email,
        slot: saved.slot,
      });
    }
    return NextResponse.json(
      {
        slot: slotView(saved.slot),
        timeZone: saved.slot.timeZone,
        change: saved.change,
        emailed,
      },
      noStore
    );
  } catch (err) {
    logger.error({ err }, "mira: could not book the weekly session");
    return NextResponse.json({ error: "Unable to book right now." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const g = await guard(request, true);
    if ("error" in g) return g.error;
    const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    const slot = await setPaused(g.account.id, parsed.data.paused);
    if (!slot) return NextResponse.json({ error: "No weekly session." }, { status: 404 });
    logMiraEvent(
      parsed.data.paused ? "session_paused" : "session_resumed",
      { userId: g.account.id },
      { source: "app" }
    );
    return NextResponse.json({ slot: slotView(slot), timeZone: slot.timeZone }, noStore);
  } catch (err) {
    logger.error({ err }, "mira: could not change the weekly session's reminders");
    return NextResponse.json({ error: "Unable to save." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const g = await guard(request, true);
    if ("error" in g) return g.error;
    const { account } = g;
    const slot = await deleteSlot(account.id);
    if (!slot) return NextResponse.json({ error: "No weekly session." }, { status: 404 });
    logMiraEvent("session_cancelled", { userId: account.id }, { source: "app" });
    const emailed = await sendSessionEmail("cancelled", {
      userId: account.id,
      email: account.email,
      slot,
    });
    return NextResponse.json(
      {
        slot: null,
        timeZone: slot.timeZone,
        emailed,
        // Not emailed: the same update, for the person to open in their calendar.
        ...(emailed ? {} : { ics: cancellationIcs(slot, account.email) }),
      },
      noStore
    );
  } catch (err) {
    logger.error({ err }, "mira: could not cancel the weekly session");
    return NextResponse.json(
      { error: "Unable to cancel right now. Please try again." },
      { status: 500 }
    );
  }
}
