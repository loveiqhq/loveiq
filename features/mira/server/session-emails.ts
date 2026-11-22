import { Resend } from "resend";
import { fetchAllRows, supabaseFetch } from "@features/admin/server/supabase";
import { getEmailSiteUrl } from "@shared/emails/site-url";
import { isUndeliverable } from "@shared/emails/suppression";
import { escapeHtml } from "@shared/format/html-escape";
import { checkRateLimit } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";
import { reminderDue, sessionIcs, slotLabel, zoneLabel, type WeeklySlot } from "./calendar";
import { COMPANY_LINE, from, makeToken } from "./nudges";
import { logMiraEvent } from "./store";
import {
  calendarText,
  getSlot,
  SLOT_COLS,
  slotView,
  toSlot,
  type StoredSlot,
} from "./weekly-sessions";

/**
 * The weekly session's emails, which the person asked for by booking: the invite when booked or
 * moved (an .ics REQUEST with the same UID and a higher SEQUENCE), the cancellation (an .ics
 * CANCEL), and a reminder 30 to 60 minutes before each start (the cron, every 15 minutes). Sent
 * like the nudges, from "Mira", in the same shell. Neutral subjects and words, never anything from
 * a chat: the person may share an inbox. Each has a one-click stop (List-Unsubscribe-Post, RFC 8058)
 * and a stop link that needs no sign-in; both pause the reminders.
 */

export type SessionEmailKind = "booked" | "moved" | "reminder" | Cancellation;
/**
 * The emails that take the session out of a calendar (an .ics CANCEL): the person cancelled it,
 * deleted the account, or changed its email (the session goes on, its emails to the new address).
 */
type Cancellation = "cancelled" | "account-deleted" | "address-changed";
const isCancellation = (kind: SessionEmailKind): kind is Cancellation =>
  kind === "cancelled" || kind === "account-deleted" || kind === "address-changed";

const SERVICE_FOOTER =
  "Session emails from Mira come with the weekly session you booked: the invite, changes, and a reminder before each session.";
/** An entry added with the email's Google Calendar button is the person's own copy. */
const GOOGLE_COPY =
  "Added it with “Add to Google Calendar”? This update can’t reach that copy: delete it in Google Calendar yourself.";

/** The links in a session email. The stop links carry a signed token for the account. */
export function sessionLinks(userId: string) {
  const site = getEmailSiteUrl();
  const t = encodeURIComponent(makeToken("session-stop", userId) ?? "");
  return {
    open: `${site}/mira/session`,
    stop: `${site}/mira/session/stop?t=${t}`,
    oneClick: `${site}/api/mira/weekly-session/stop?t=${t}`,
    manage: `${site}/mira/settings#weekly-session`,
    book: `${site}/mira/home`,
  };
}

const css = (rules: Record<string, string>) =>
  Object.entries(rules)
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ");

/** The email's words, and its HTML in the nudge email's shell. */
export function sessionEmail(
  kind: SessionEmailKind,
  input: { slot: WeeklySlot; links: ReturnType<typeof sessionLinks>; googleUrl: string }
): { subject: string; html: string; text: string } {
  const { slot, links } = input;
  const day = slotLabel(slot).replace(/s at .*/, ""); // "Tuesday"
  const when = `every ${day} at ${slot.time} (${zoneLabel(slot.timeZone)})`;
  const copy = (() => {
    switch (kind) {
      case "booked":
        return {
          subject: "Your weekly session is booked",
          preheader: "Your calendar invite is attached.",
          paragraphs: [
            `You’re booked in: ${when}, 15 minutes with me.`,
            "Your calendar invite is attached, so the time stays yours. I’ll send a short reminder 30 to 60 minutes before each session.",
            "When it’s time, open the session from your calendar or the reminder, and we’ll take it from there.",
          ],
          button: { label: "Add to Google Calendar", url: input.googleUrl },
          note: "Apple Calendar or Outlook: open the attached invite.",
        };
      case "moved":
        return {
          subject: "Your weekly session has a new time",
          preheader: "Your updated invite is attached.",
          paragraphs: [
            `Done: from now on we meet ${when}.`,
            "The updated invite is attached; opening it moves the session in your calendar.",
          ],
          button: { label: "Add the new time to Google Calendar", url: input.googleUrl },
          note: "Added the old time with a Google Calendar link? Delete that one.",
        };
      case "reminder":
        return {
          subject: `See you at ${slot.time}`,
          preheader: "Your weekly 15 minutes.",
          paragraphs: [
            `Your weekly session starts at ${slot.time} (${zoneLabel(slot.timeZone)}).`,
            "Find a quiet spot if you can. When you’re ready, open the session and I’ll be there.",
          ],
          button: { label: "Open my session", url: links.open },
          note: null,
        };
      case "cancelled":
        return {
          subject: "Your weekly session is cancelled",
          preheader: "This update takes it out of your calendar.",
          paragraphs: [
            `Your weekly session on ${day}s at ${slot.time} is cancelled.`,
            "The attached update takes it out of your calendar. Whenever you’d like a regular time again, you can book one in a minute.",
          ],
          button: { label: "Book a new time", url: links.book },
          note: GOOGLE_COPY,
          footer: "That’s the last session email, unless you book again.",
        };
      case "account-deleted":
        return {
          subject: "Your weekly session is cancelled",
          preheader: "This update takes it out of your calendar.",
          paragraphs: [
            `Your weekly session on ${day}s at ${slot.time} is cancelled, as your account was deleted.`,
            "The attached update takes it out of your calendar.",
          ],
          button: null,
          note: GOOGLE_COPY,
          footer: "That’s the last session email.",
        };
      case "address-changed":
        return {
          subject: "Your weekly session moved to another address",
          preheader: "This update takes it out of this calendar.",
          paragraphs: [
            `Your weekly session on ${day}s at ${slot.time} now goes to the new email address on your account, with its reminders.`,
            "The attached update takes it out of the calendar for this address. To add it to your new calendar, open Home in Mira and choose “Add to calendar”.",
          ],
          button: { label: "Open Mira", url: links.book },
          note: GOOGLE_COPY,
          footer: "That’s the last session email to this address.",
        };
    }
  })();

  const footer = copy.footer ?? SERVICE_FOOTER;
  const ink = { color: "#3f3a4d", "font-size": "15px", "line-height": "1.6" };
  const link = (href: string, label: string) =>
    `<a href="${href}" style="${css({ color: "#c4b5fd", "font-weight": "700", "margin-right": "18px" })}">${label}</a>`;
  const hidden = css({
    display: "none",
    "max-height": "0",
    "max-width": "0",
    overflow: "hidden",
    opacity: "0",
    "mso-hide": "all",
    "font-size": "1px",
    "line-height": "1px",
    color: "#ffffff",
  });
  const html = [
    `<!doctype html><html><body style="${css({ margin: "0", background: "#ffffff" })}">`,
    `<div style="${hidden}">${escapeHtml(copy.preheader)}${"&#8199;&#65279;&#847; ".repeat(60)}</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${css({ "max-width": "560px", margin: "0 auto", "font-family": "Arial, sans-serif" })}">`,
    `<tr><td style="${css({ padding: "24px 20px 8px", "font-weight": "700" })}">Mira</td></tr>`,
    `<tr><td style="${css({ padding: "8px 20px 24px" })}">`,
    ...copy.paragraphs.map(
      (p) => `<p style="${css({ margin: "0 0 16px", ...ink })}">${escapeHtml(p)}</p>`
    ),
    copy.button
      ? `<a href="${copy.button.url}" style="${css({ display: "inline-block", padding: "14px 24px", "border-radius": "9999px", background: "#000000", color: "#ffffff", "font-weight": "700", "text-decoration": "none" })}">${escapeHtml(copy.button.label)}</a>`
      : "",
    copy.note
      ? `<p style="${css({ margin: "16px 0 0", color: "#6b6678", "font-size": "13px" })}">${escapeHtml(copy.note)}</p>`
      : "",
    `</td></tr>`,
    `<tr><td style="${css({ background: "#161021", color: "#e2dafb", padding: "24px", "font-size": "13px" })}">`,
    `<p style="${css({ margin: "0 0 12px", "font-size": "18px", "font-weight": "700" })}">Applied Psychometrics</p>`,
    `<p style="${css({ margin: "0 0 12px" })}">${escapeHtml(footer)}</p>`,
    isCancellation(kind)
      ? ""
      : `<p style="${css({ margin: "0 0 12px" })}">${link(links.stop, "Stop reminders")}${link(links.manage, "Change or cancel")}</p>`,
    `<p style="${css({ margin: "0", color: "#b6aecb", "font-size": "12px" })}">${COMPANY_LINE}</p>`,
    `</td></tr></table></body></html>`,
  ].join("\n");
  const text = [
    copy.preheader,
    "",
    ...copy.paragraphs.flatMap((p) => [p, ""]),
    ...(copy.button ? [`${copy.button.label}: ${copy.button.url}`] : []),
    ...(copy.note ? [copy.note] : []),
    "",
    footer,
    ...(isCancellation(kind)
      ? []
      : [`Stop reminders: ${links.stop}`, `Change or cancel: ${links.manage}`]),
    "",
    COMPANY_LINE,
  ].join("\n");
  return { subject: copy.subject, html, text };
}

let resend: Resend | null = null;
const mailer = () => (resend ??= new Resend(process.env.RESEND_API_KEY));
/** The sender's address alone: the invite's organizer. */
const organizer = () => /<([^>]+)>/.exec(from())?.[1] ?? from();

/** The invite as the person's calendar reads it: a REQUEST (booked, moved) or a CANCEL. */
function inviteIcs(
  slot: StoredSlot,
  ics: { method: "REQUEST" | "CANCEL"; sequence: number },
  attendee: string,
  now: Date
): string {
  const text = calendarText();
  return sessionIcs({
    uid: slot.id,
    sequence: ics.sequence,
    method: ics.method,
    slot,
    organizer: organizer(),
    attendee,
    summary: text.summary,
    description: text.details,
    url: text.url,
    now,
  });
}

/**
 * The cancellation's calendar update: one more change to the series than the stored invite
 * (RFC 5546), so a calendar takes it over the invite. Emailed, or downloaded when it couldn't be.
 */
export const cancellationIcs = (slot: StoredSlot, attendee: string, now = new Date()) =>
  inviteIcs(slot, { method: "CANCEL", sequence: slot.sequence + 1 }, attendee, now);

function message(
  kind: SessionEmailKind,
  to: string,
  userId: string,
  slot: StoredSlot,
  now: Date,
  ics?: { method: "REQUEST" | "CANCEL"; sequence: number }
) {
  const links = sessionLinks(userId);
  const email = sessionEmail(kind, { slot, links, googleUrl: slotView(slot, now).googleUrl });
  return {
    from: from(),
    to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    headers: {
      "List-Unsubscribe": `<${links.oneClick}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    ...(ics
      ? {
          attachments: [
            {
              filename: "invite.ics",
              // Resend reads a string as base64.
              content: Buffer.from(inviteIcs(slot, ics, to, now)).toString("base64"),
              contentType: `text/calendar; charset=utf-8; method=${ics.method}`,
            },
          ],
        }
      : {}),
  };
}

/** At most 10 session emails a day per account: changing the time over and over can't flood an inbox. */
async function mayEmail(userId: string): Promise<boolean> {
  const r = await checkRateLimit(userId, {
    bucket: "mira-session-mail",
    limit: 10,
    windowMs: 86_400_000,
  });
  return r.allowed;
}

/**
 * The invite (booked, moved) or a cancellation, straight after the person's own action, within
 * the day's 10 session emails. Not to an address that bounced or complained (an unsubscribe from
 * marketing doesn't stop an invite the person just asked for, as with sign-in codes). True when
 * Resend took it.
 */
export async function sendSessionEmail(
  kind: "booked" | "moved" | Cancellation,
  input: { userId: string; email: string; slot: StoredSlot; now?: Date }
): Promise<boolean> {
  if (!process.env.RESEND_API_KEY || !makeToken("session-stop", input.userId)) return false;
  if (!(await mayEmail(input.userId))) return false;
  if (await isUndeliverable(input.email)) return false;
  const now = input.now ?? new Date();
  // A cancellation is one more change to the series (RFC 5546): its sequence is one higher.
  const cancel = isCancellation(kind);
  const sequence = input.slot.sequence + (cancel ? 1 : 0);
  const method = cancel ? "CANCEL" : "REQUEST";
  const sent = await mailer().emails.send(
    message(kind, input.email, input.userId, input.slot, now, { method, sequence }),
    // A retried request can't send it twice.
    { idempotencyKey: `mira-session-${kind}-${input.slot.id}-${sequence}` }
  );
  if (sent.error) {
    logger.error({ err: sent.error.name, kind }, "mira: a session email was not sent");
    return false;
  }
  return true;
}

/**
 * The address a weekly session's invite went to is going away: the account is being deleted (call
 * it before the slot goes with the account), or its email changed (the session goes on, its emails
 * to the new address). A cancellation takes the session out of that calendar. Best effort and
 * never throws: nothing here may stop the deletion or the change. True when Resend took it.
 */
export async function cancelSessionInvite(
  account: { id: string; email: string },
  why: "account-deleted" | "address-changed"
): Promise<boolean> {
  try {
    const slot = await getSlot(account.id);
    if (!slot) return false;
    return await sendSessionEmail(why, { userId: account.id, email: account.email, slot });
  } catch (err) {
    logger.error({ err, why }, "mira: a weekly session's cancellation was not sent");
    return false;
  }
}

// ── The reminders (the cron calls this every 15 minutes) ─────────────────────────────────────────

type Candidate = Parameters<typeof toSlot>[0] & {
  user_id: string;
  mira_user: { email: string | null; minor_at: string | null } | null;
};

export type ReminderRunSummary = {
  candidates: number;
  due: number;
  sent: number;
  skipped: Record<string, number>;
  errors: number;
  stoppedEarly: boolean;
};

/**
 * One reminder per start, 30 to 60 minutes before it: every booked slot with reminders on, of a
 * person not stopped as under 18 (the read's filter, checked again here). Reminders are what the
 * person booked, so like the invite they skip only an address that bounced or complained, not an
 * unsubscribe from LoveIQ's other emails; the session emails' own stop pauses them. The start is
 * claimed before the email goes (UNIQUE slot_id, starts_at), so the window's two runs send it
 * once; a failed send gives the claim back for the second run.
 */
export async function runSessionReminders(
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
  if (
    !process.env.RESEND_API_KEY ||
    !makeToken("session-stop", "00000000-0000-4000-8000-000000000000")
  )
    return (skip("no-email-setup"), summary);

  const rows = await fetchAllRows<Candidate>(
    `/rest/v1/mira_session_slot?paused_at=is.null&mira_user.minor_at=is.null&select=${SLOT_COLS},user_id,mira_user!inner(email,minor_at)&order=id.asc`
  );
  if (!rows) throw new Error("mira session reminder candidates read failed");
  summary.candidates = rows.length;
  const due = rows.flatMap((row) => {
    const start = reminderDue(toSlot(row), now);
    return start ? [{ row, start }] : [];
  });
  summary.due = due.length;

  // ponytail: one at a time; at ~0.5 s a send, the 20 s budget is ~40 a run and the window has two
  // runs. Send a few at once (as the nudges do) when one window holds more people than that.
  for (const { row, start } of due) {
    if (opts.outOfTime?.()) {
      summary.stoppedEarly = true;
      break;
    }
    const person = row.mira_user;
    if (!person?.email) continue;
    if (person.minor_at) {
      skip("minor");
      continue;
    }
    try {
      if (await isUndeliverable(person.email)) {
        skip("undeliverable");
        continue;
      }
      const claimed = await supabaseFetch(
        "/rest/v1/mira_session_reminder?on_conflict=slot_id,starts_at&select=id",
        {
          method: "POST",
          headers: { Prefer: "return=representation,resolution=ignore-duplicates" },
          body: JSON.stringify({ slot_id: row.id, starts_at: start.toISOString() }),
        }
      );
      if (!claimed.ok) throw new Error(`mira session reminder claim failed (${claimed.status})`);
      const id = ((await claimed.json()) as Array<{ id?: string }>)[0]?.id;
      if (!id) {
        skip("already-sent");
        continue;
      }
      const sent = await mailer().emails.send(
        message("reminder", person.email, row.user_id, toSlot(row), now),
        { idempotencyKey: `mira-session-reminder-${id}` }
      );
      if (sent.error) {
        summary.errors++;
        logger.error({ err: sent.error.name }, "mira: a session reminder was not sent");
        await supabaseFetch(`/rest/v1/mira_session_reminder?id=eq.${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        continue;
      }
      summary.sent++;
      logMiraEvent("session_reminder_sent", { userId: row.user_id });
    } catch (err) {
      summary.errors++;
      logger.error({ err }, "mira: a session reminder failed");
    }
  }
  return summary;
}
