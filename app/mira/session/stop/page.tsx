import type { Metadata } from "next";
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
 * The page behind "Stop reminders" in every weekly-session email. The link's token is checked
 * here (for its own purpose only), so one we did not sign shows "This link doesn't work" without
 * a request that could only fail.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ t?: string | string[] }>;
}) {
  const { t } = await searchParams;
  const token = typeof t === "string" && readToken("session-stop", t) ? t : null;
  return (
    <MiraFrame>
      <SessionStop token={token} />
    </MiraFrame>
  );
}
