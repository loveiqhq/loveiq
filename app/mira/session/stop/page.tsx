import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LINK_COOKIE } from "@features/mira/email-link";
import { miraLinkPreview } from "@features/mira/link-preview";
import { readToken } from "@features/mira/server/nudges";
import { getSlot } from "@features/mira/server/weekly-sessions";
import { SessionStop } from "@features/mira/ui/weekly-session/SessionStop";
import logger from "@shared/observability/logger";

export const metadata: Metadata = {
  title: "Reminder emails | LoveIQ",
  robots: { index: false, follow: false },
  ...miraLinkPreview("/mira/session/stop"),
};

export const dynamic = "force-dynamic";

/**
 * The page behind "Stop reminders" in every weekly-session email. The link's token arrives in the
 * `mira_link` cookie, never the address (proxy.ts, features/mira/email-link.ts), and is checked
 * here (for its own purpose only), so one we did not sign shows "This link doesn't work" without
 * a request that could only fail. A link opened again says the reminders are already off (or that
 * nothing is booked) instead of offering to stop them; unreadable, the button shows as before.
 */
export default async function Page() {
  const t = (await cookies()).get(LINK_COOKIE)?.value ?? null;
  const userId = readToken("session-stop", t);
  const slot = userId
    ? await getSlot(userId).catch((err: unknown) => {
        logger.warn({ err }, "mira: the stop page could not read the weekly session");
        return undefined;
      })
    : undefined;
  return (
    <SessionStop
      token={userId ? t : null}
      already={slot === null ? "none" : slot?.paused ? "done" : undefined}
    />
  );
}
