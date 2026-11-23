import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LINK_COOKIE } from "@features/mira/email-link";
import { miraLinkPreview } from "@features/mira/link-preview";
import { readJournal } from "@features/mira/server/journal";
import { readToken } from "@features/mira/server/nudges";
import { ReminderStop } from "@features/mira/ui/journal/ReminderStop";
import logger from "@shared/observability/logger";

export const metadata: Metadata = {
  // One name with the session's reminder page (round-4 R4-UXA-6); the nudges keep theirs.
  title: "Reminder emails | LoveIQ",
  robots: { index: false, follow: false },
  ...miraLinkPreview("/mira/journal/reminder"),
};

export const dynamic = "force-dynamic";

/**
 * Behind the journal reminder email's "Stop these reminders" link. The link's token arrives in the
 * `mira_link` cookie, never the address (proxy.ts, features/mira/email-link.ts), and is checked
 * here, so one we did not sign (or a nudge's) shows "This link doesn't work" without a request
 * that could only fail. A link opened again says the reminder is already off (or that there is no
 * account, so nothing to stop) instead of offering to stop it; unreadable, the button shows as
 * before.
 */
export default async function Page() {
  const token = (await cookies()).get(LINK_COOKIE)?.value ?? "";
  const userId = readToken("journal-stop", token);
  // ponytail: reads the journal with its settings for one field; a one-field read if this page
  // ever gets traffic.
  const journal = userId
    ? await readJournal(userId).catch((err: unknown) => {
        logger.warn({ err }, "mira: the reminder's stop page could not read the reminder");
        return undefined;
      })
    : undefined;
  return (
    <ReminderStop
      token={token}
      valid={userId !== null}
      already={
        journal === null ? "none" : journal?.settings.reminderTime === null ? "done" : undefined
      }
    />
  );
}
