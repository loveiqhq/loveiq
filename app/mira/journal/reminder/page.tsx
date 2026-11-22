import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LINK_COOKIE } from "@features/mira/email-link";
import { miraLinkPreview } from "@features/mira/link-preview";
import { readToken } from "@features/mira/server/nudges";
import { ReminderStop } from "@features/mira/ui/journal/ReminderStop";

export const metadata: Metadata = {
  title: "Email preferences | LoveIQ",
  robots: { index: false, follow: false },
  ...miraLinkPreview("/mira/journal/reminder"),
};

export const dynamic = "force-dynamic";

/**
 * Behind the journal reminder email's "Stop these reminders" link. The link's token arrives in the
 * `mira_link` cookie, never the address (proxy.ts, features/mira/email-link.ts), and is checked
 * here, so one we did not sign (or a nudge's) shows "This link doesn't work" without a request
 * that could only fail.
 */
export default async function Page() {
  const token = (await cookies()).get(LINK_COOKIE)?.value ?? "";
  return <ReminderStop token={token} valid={readToken("journal-stop", token) !== null} />;
}
