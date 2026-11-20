import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMiraAccount } from "@features/mira/server/session";
import MiraChat from "@features/mira/ui/MiraChat";

export const metadata: Metadata = {
  title: "Talk to Mira | LoveIQ",
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
  const chatId = typeof chat === "string" && /^[0-9a-f-]{36}$/i.test(chat) ? chat : null;
  // A stored chat opened while signed out (a nudge read on another device): sign in first, then
  // straight back to it.
  if (chatId && !account)
    redirect(`/mira/start?next=${encodeURIComponent(`/mira?chat=${chatId}`)}`);
  return <MiraChat signedIn={Boolean(account)} initialChatId={account ? chatId : null} />;
}
