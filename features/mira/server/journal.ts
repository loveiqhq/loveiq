import { Resend } from "resend";
import { addDays } from "@features/admin/server/ap/days";
import { fetchAllRows, supabaseFetch } from "@features/admin/server/supabase";
import { getEmailSiteUrl } from "@shared/emails/site-url";
import { isEmailSuppressed } from "@shared/emails/suppression";
import logger from "@shared/observability/logger";
import nudgeConfig from "../content/nudges.json";
import { forMira, type JournalEntry, type JournalShare } from "../journal";
import { miraEmail } from "./email-shell";
import {
  CRISIS_QUIET_DAYS,
  hadCrisis,
  inWindow,
  localParts,
  makeToken,
  miraEmailFrom,
  type NudgeTime,
} from "./nudges";
import { logMiraEvent } from "./store";

/**
 * The daily journal's reads and writes (supabase/migrations/20261122020000_mira_journal.sql), with
 * the service role from API routes. Every one is scoped to the signed-in account's id. Entries are
 * special-category data: only the person sees them, and Mira reads them only while they let her.
 */

const enc = encodeURIComponent;
const COLS = "day,mood,body,closeness,energy,note";
/** What one read brings back: a year and a bit, enough for every streak the beta can have. */
const DAYS_READ = 400;

export type JournalSettings = {
  share: JournalShare;
  /** "20:00" in the person's time zone, or null: no reminder. */
  reminderTime: string | null;
  timeZone: string;
};

async function ok(res: Response, what: string): Promise<Response> {
  if (!res.ok) throw new Error(`mira journal ${what} failed (${res.status})`);
  return res;
}

/** The account's entries (newest first) and settings; null when the account has no profile. */
export async function readJournal(
  userId: string,
  now = new Date()
): Promise<{ entries: JournalEntry[]; settings: JournalSettings } | null> {
  const since = addDays(now.toISOString().slice(0, 10), -DAYS_READ);
  const [user, entries] = await Promise.all([
    supabaseFetch(
      `/rest/v1/mira_user?id=eq.${enc(userId)}&select=journal_share,journal_reminder_time,time_zone&limit=1`
    ).then((r) => ok(r, "read")),
    supabaseFetch(
      `/rest/v1/mira_journal_entry?user_id=eq.${enc(userId)}&day=gte.${since}&select=${COLS}&order=day.desc&limit=${DAYS_READ + 2}`
    ).then((r) => ok(r, "read")),
  ]);
  const [u] = (await user.json()) as Array<{
    journal_share: JournalShare;
    journal_reminder_time: string | null;
    time_zone: string;
  }>;
  if (!u) return null;
  return {
    entries: (await entries.json()) as JournalEntry[],
    settings: {
      share: u.journal_share,
      reminderTime: u.journal_reminder_time,
      timeZone: u.time_zone,
    },
  };
}

/**
 * Saves a check-in. `start`: a new one may be made for this day (it is today somewhere), so it is
 * written whether or not one exists; otherwise only an existing entry changes, and false says
 * there was none.
 */
export async function saveEntry(
  userId: string,
  entry: JournalEntry,
  start: boolean
): Promise<boolean> {
  const { day, ...fields } = entry;
  const updated_at = new Date().toISOString();
  if (start) {
    await supabaseFetch("/rest/v1/mira_journal_entry?on_conflict=user_id,day", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ user_id: userId, day, ...fields, updated_at }),
    }).then((r) => ok(r, "save"));
    return true;
  }
  const res = await supabaseFetch(
    `/rest/v1/mira_journal_entry?user_id=eq.${enc(userId)}&day=eq.${day}&select=day`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ...fields, updated_at }),
    }
  ).then((r) => ok(r, "save"));
  return ((await res.json()) as unknown[]).length > 0;
}

/** One day's entry, or (no day) the whole journal. Settings stay as they are. */
export async function deleteEntries(userId: string, day?: string): Promise<void> {
  await supabaseFetch(
    `/rest/v1/mira_journal_entry?user_id=eq.${enc(userId)}${day ? `&day=eq.${day}` : ""}`,
    { method: "DELETE" }
  ).then((r) => ok(r, "delete"));
}

async function patchUser(userId: string, body: Record<string, unknown>): Promise<void> {
  await supabaseFetch(`/rest/v1/mira_user?id=eq.${enc(userId)}`, {
    method: "PATCH",
    body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }),
  }).then((r) => ok(r, "settings"));
}

/**
 * "Let Mira read my journal" (and its notes), with the time of the choice: an explicit consent the
 * person can take back in one tap. The daily reminder's time, or null for none.
 */
export async function saveJournalSettings(
  userId: string,
  patch: { share?: JournalShare; reminderTime?: string | null }
): Promise<void> {
  await patchUser(userId, {
    ...(patch.share !== undefined
      ? { journal_share: patch.share, journal_share_at: new Date().toISOString() }
      : {}),
    ...(patch.reminderTime !== undefined ? { journal_reminder_time: patch.reminderTime } : {}),
  });
  if (patch.share !== undefined) {
    logMiraEvent("journal_share_set", { userId }, { share: patch.share });
  }
  if (patch.reminderTime !== undefined) {
    logMiraEvent("journal_reminder_set", { userId }, { on: patch.reminderTime !== null });
  }
}

/** The reminder email's stop link: no more reminders, whatever else is on. */
export async function stopReminder(userId: string): Promise<void> {
  await patchUser(userId, { journal_reminder_time: null });
  logMiraEvent("journal_reminder_stopped", { userId });
}

/**
 * Under 18 (server/minor.ts): the journal goes, and so do Mira's reading of it and the reminder.
 */
export async function forgetJournal(userId: string): Promise<void> {
  await deleteEntries(userId);
  await patchUser(userId, { journal_share: "off", journal_reminder_time: null });
}

/**
 * What Mira may read of the journal in a chat (forMira): nothing unless the person let her, and
 * the notes are not even read unless they allowed those too. The days are the person's own.
 */
export async function journalContext(userId: string, now = new Date()): Promise<string | null> {
  const res = await supabaseFetch(
    `/rest/v1/mira_user?id=eq.${enc(userId)}&select=journal_share,time_zone&limit=1`
  ).then((r) => ok(r, "read"));
  const [u] = (await res.json()) as Array<{ journal_share: JournalShare; time_zone: string }>;
  if (!u || u.journal_share === "off") return null;
  const today = localParts(now, u.time_zone).day;
  const cols = u.journal_share === "notes" ? COLS : COLS.replace(",note", "");
  const rows = await supabaseFetch(
    `/rest/v1/mira_journal_entry?user_id=eq.${enc(userId)}&day=gte.${addDays(today, -6)}&day=lte.${today}&select=${cols}&order=day.asc`
  ).then((r) => ok(r, "read"));
  const entries = ((await rows.json()) as JournalEntry[]).map((e) => ({
    ...e,
    note: e.note ?? null,
  }));
  return forMira(entries, u.journal_share, today);
}

// ── The daily reminder: the nudges' cron, sender, signed links and suppression list ─────────────

/** The reminder's words. Never anything from the journal: no ratings, notes or streaks. */
const REMINDER = {
  subject: "Your check-in for today",
  body: "How is life feeling today? A few taps, and a line if you feel like writing one.",
  button: "Do today’s check-in",
  why: "You asked Mira for a daily check-in reminder. One email a day at most.",
  stop: "Stop these reminders",
};

export function reminderEmail(input: { checkInUrl: string; stopUrl: string }): {
  subject: string;
  html: string;
  text: string;
} {
  // The shell all of Mira's emails share (email-shell.ts), with the nudges' neutral preview line.
  const { html, text } = miraEmail({
    preheader: nudgeConfig.preheader,
    heading: REMINDER.subject,
    paragraphs: [REMINDER.body],
    button: { label: REMINDER.button, url: input.checkInUrl },
    footer: {
      why: REMINDER.why,
      links: [
        { label: REMINDER.stop, url: input.stopUrl },
        { label: "Privacy", url: `${getEmailSiteUrl()}/mira/privacy` },
      ],
    },
  });
  return { subject: REMINDER.subject, html, text };
}

type ReminderUser = {
  id: string;
  email: string;
  time_zone: string;
  journal_reminder_time: string;
  journal_reminded_on: string | null;
};

export type ReminderRunSummary = {
  candidates: number;
  due: number;
  sent: number;
  skipped: Record<string, number>;
  errors: number;
  stoppedEarly: boolean;
};

let resend: Resend | null = null;

/**
 * Called by the nudge cron every 30 minutes (app/api/cron/mira-nudges). Each person with the
 * reminder on is due in the hour from their time on their own clock, like a nudge; at most one a
 * day, claimed on the account before the email goes; none once they checked in that day, to a
 * suppressed address, after support lines were shown in the last 14 days, or to anyone Mira
 * stopped as under 18.
 * ponytail: one person at a time, about a second each, so a few hundred per slot fit the budget;
 * add runNudges' workers when more people share one time.
 */
export async function runJournalReminders(
  now = new Date(),
  opts: { outOfTime?: () => boolean } = {}
): Promise<ReminderRunSummary> {
  const summary: ReminderRunSummary = {
    candidates: 0,
    due: 0,
    sent: 0,
    skipped: {},
    errors: 0,
    stoppedEarly: false,
  };
  const skipped = new Map<string, number>();
  const skip = (why: string) => {
    skipped.set(why, (skipped.get(why) ?? 0) + 1);
    summary.skipped = Object.fromEntries(skipped);
  };
  if (!process.env.RESEND_API_KEY) return (skip("no-email-setup"), summary);
  const mail = (resend ??= new Resend(process.env.RESEND_API_KEY));
  const users = await fetchAllRows<ReminderUser>(
    "/rest/v1/mira_user?journal_reminder_time=not.is.null&minor_at=is.null&select=id,email,time_zone,journal_reminder_time,journal_reminded_on&order=created_at.asc,id.asc"
  );
  if (!users) throw new Error("mira journal reminder candidates read failed");
  summary.candidates = users.length;
  // Any "HH:MM" works with the nudges' window, not only their three times.
  const due = users.filter((u) =>
    inWindow(localParts(now, u.time_zone), u.journal_reminder_time as NudgeTime)
  );
  summary.due = due.length;
  const site = getEmailSiteUrl();

  for (const user of due) {
    if (opts.outOfTime?.()) {
      summary.stoppedEarly = true;
      break;
    }
    try {
      const day = localParts(now, user.time_zone).day;
      if (user.journal_reminded_on === day) {
        skip("already-today");
        continue;
      }
      const done = await supabaseFetch(
        `/rest/v1/mira_journal_entry?user_id=eq.${enc(user.id)}&day=eq.${day}&select=day&limit=1`
      ).then((r) => ok(r, "read"));
      if (((await done.json()) as unknown[]).length) {
        skip("checked-in");
        continue;
      }
      if (await isEmailSuppressed(user.email)) {
        skip("suppressed");
        continue;
      }
      if (await hadCrisis(user.id, new Date(now.getTime() - CRISIS_QUIET_DAYS * 86_400_000))) {
        skip("recent-crisis");
        continue;
      }
      const token = makeToken("journal-stop", user.id);
      if (!token) {
        skip("no-email-setup");
        continue;
      }
      // The day is claimed first: whichever run claims it sends, and only while still on.
      const claim = await supabaseFetch(
        `/rest/v1/mira_user?id=eq.${enc(user.id)}&journal_reminder_time=not.is.null&minor_at=is.null&or=(journal_reminded_on.is.null,journal_reminded_on.neq.${day})&select=id`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ journal_reminded_on: day }),
        }
      ).then((r) => ok(r, "claim"));
      if (!((await claim.json()) as unknown[]).length) {
        skip("already-today");
        continue;
      }
      const stopUrl = `${site}/api/mira/journal/unsubscribe?t=${enc(token)}`;
      const email = reminderEmail({
        checkInUrl: `${site}/mira/journal?checkin=1`,
        stopUrl: `${site}/mira/journal/reminder?t=${enc(token)}`,
      });
      let sent = false;
      try {
        const mailed = await mail.emails.send(
          {
            from: miraEmailFrom(),
            to: user.email,
            subject: email.subject,
            html: email.html,
            text: email.text,
            headers: {
              "List-Unsubscribe": `<${stopUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          },
          // Per run, like a nudge's per claim: a retried call can't send it twice, and the
          // slot's second run is a new request, never a replay of this one's failure.
          { idempotencyKey: `mira-journal-reminder-${user.id}-${day}-${now.getTime()}` }
        );
        if (mailed.error) {
          summary.errors++;
          logger.error({ err: mailed.error.name }, "mira: a journal reminder was not sent");
          continue;
        }
        sent = true;
      } finally {
        // Not sent (an error or a throw): the day goes back, so the slot's second run can send it.
        if (!sent) {
          await supabaseFetch(`/rest/v1/mira_user?id=eq.${enc(user.id)}`, {
            method: "PATCH",
            body: JSON.stringify({ journal_reminded_on: user.journal_reminded_on }),
          }).then((r) => ok(r, "claim"));
        }
      }
      summary.sent++;
      logMiraEvent("journal_reminder_sent", { userId: user.id });
    } catch (err) {
      summary.errors++;
      logger.error({ err }, "mira: a journal reminder failed");
    }
  }
  return summary;
}
