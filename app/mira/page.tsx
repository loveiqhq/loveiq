import type { Metadata } from "next";
import { getMiraAccount } from "@features/mira/server/session";
import MiraChat from "@features/mira/ui/MiraChat";

export const metadata: Metadata = {
  title: "Talk to Mira | Applied Psychometrics",
  description: "Mira is an AI coach for body confidence. Her answers draw on research. Beta.",
  robots: { index: false, follow: false },
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
