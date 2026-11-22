import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LINK_COOKIE } from "@features/mira/email-link";
import { miraLinkPreview } from "@features/mira/link-preview";
import { readToken } from "@features/mira/server/nudges";
import { MiraFrame } from "@features/mira/ui/MiraShell";
import { SessionStop } from "@features/mira/ui/weekly-session/SessionStop";

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
 * a request that could only fail.
 */
export default async function Page() {
  const t = (await cookies()).get(LINK_COOKIE)?.value ?? null;
  const token = t && readToken("session-stop", t) ? t : null;
  return (
    <MiraFrame>
      <SessionStop token={token} />
    </MiraFrame>
  );
}
