import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { miraLinkPreview } from "@features/mira/link-preview";
import { getMiraAccount } from "@features/mira/server/session";
import MiraChat from "@features/mira/ui/MiraChat";

export const metadata: Metadata = {
  title: "Your weekly session | LoveIQ",
  robots: { index: false, follow: false },
  ...miraLinkPreview("/mira/session"),
};

export const dynamic = "force-dynamic";

/**
 * The weekly session's link, in the calendar invite and the reminder: a new chat in which Mira
 * opens the session (features/mira/server/prompt.ts sessionOpeningInstructions). Session-checked,
 * no token, so a forwarded invite opens nothing: signed out, it signs in first and comes back.
 */
export default async function Page() {
  if (!(await getMiraAccount())) {
    redirect(`/mira/start?next=${encodeURIComponent("/mira/session")}`);
  }
  return <MiraChat signedIn initialChatId={null} session />;
}
