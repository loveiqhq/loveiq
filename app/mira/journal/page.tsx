import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { miraLinkPreview } from "@features/mira/link-preview";
import { getMiraAccount } from "@features/mira/server/session";
import JournalPage from "@features/mira/ui/journal/JournalPage";

export const metadata: Metadata = {
  title: "Daily journal | LoveIQ",
  robots: { index: false, follow: false },
  ...miraLinkPreview("/mira/journal"),
};

export const dynamic = "force-dynamic";

/**
 * The daily journal. Signed out, sign-in comes first and returns here (session.ts safeNext), to the
 * check-in when the reminder's button asked for it.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ checkin?: string | string[] }>;
}) {
  const checkIn = (await searchParams).checkin === "1";
  if (!(await getMiraAccount())) {
    const back = checkIn ? "/mira/journal?checkin=1" : "/mira/journal";
    redirect(`/mira/start?next=${encodeURIComponent(back)}`);
  }
  return <JournalPage startCheckIn={checkIn} />;
}
