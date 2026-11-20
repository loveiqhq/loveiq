import type { Metadata } from "next";
import { MIRA_TITLE, miraLinkPreview } from "@features/mira/link-preview";
import { getMiraAccount } from "@features/mira/server/session";
import MiraChat from "@features/mira/ui/MiraChat";

export const metadata: Metadata = {
  title: MIRA_TITLE,
  robots: { index: false, follow: false },
  ...miraLinkPreview("/mira"),
};

export const dynamic = "force-dynamic";

/** Boards 01, 01b, 03 and 08a: Mira's chat, anonymous or signed in. */
export default async function MiraPage({
  searchParams,
}: {
  searchParams: Promise<{ chat?: string }>;
}) {
  const account = await getMiraAccount();
  const chat = (await searchParams).chat;
  const chatId = account && chat && /^[0-9a-f-]{36}$/i.test(chat) ? chat : null;
  return <MiraChat signedIn={Boolean(account)} initialChatId={chatId} />;
}
