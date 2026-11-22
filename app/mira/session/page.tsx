import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { miraLinkPreview } from "@features/mira/link-preview";
import { sessionKey } from "@features/mira/server/calendar";
import { getMiraAccount } from "@features/mira/server/session";
import { getSlot, markJoined, sessionChat } from "@features/mira/server/weekly-sessions";
import MiraChat from "@features/mira/ui/MiraChat";
import logger from "@shared/observability/logger";

export const metadata: Metadata = {
  title: "Your weekly session | LoveIQ",
  robots: { index: false, follow: false },
  ...miraLinkPreview("/mira/session"),
};

export const dynamic = "force-dynamic";

/**
 * The weekly session's link, in the calendar invite, the reminder and Home's "Join now": a chat in
 * which Mira opens the session (features/mira/server/prompt.ts sessionOpeningInstructions), once
 * per session: a later visit (a reload, Back, the link again) reopens that chat, and next week's
 * session is a new one. A visit while the session is open counts as attending. Session-checked,
 * no token, so a forwarded invite opens nothing: signed out, it signs in first and comes back.
 */
export default async function Page() {
  const account = await getMiraAccount();
  if (!account) redirect(`/mira/start?next=${encodeURIComponent("/mira/session")}`);
  const now = new Date();
  const slot = await getSlot(account.id).catch(() => null);
  if (slot) {
    await markJoined(slot, account.id, now).catch((err) =>
      logger.error({ err }, "mira: a weekly session's attendance was not recorded")
    );
  }
  const opened = await sessionChat(account.id, slot, now).catch(() => null);
  return opened ? (
    <MiraChat signedIn initialChatId={opened} />
  ) : (
    <MiraChat signedIn initialChatId={null} session={sessionKey(slot, now)} />
  );
}
