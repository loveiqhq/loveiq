import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { guideStarter } from "@features/mira/content/coaches";
import { starterFor } from "@features/mira/content/checks";
import { MIRA_TITLE, miraLinkPreview } from "@features/mira/link-preview";
import { getMiraAccount } from "@features/mira/server/session";
import MiraChat from "@features/mira/ui/MiraChat";
import GuideAskCount from "@features/mira/ui/coaches/GuideAskCount";

export const metadata: Metadata = {
  title: MIRA_TITLE,
  robots: { index: false, follow: false },
  ...miraLinkPreview("/mira"),
};

export const dynamic = "force-dynamic";

/**
 * Boards 01, 01b, 03 and 08a: Mira's chat, anonymous or signed in. `?ask=N` (the guide's "Ask
 * Mira about this", practice N of 7) and `?say=<check>` (a self-check's "Talk to Mira about
 * this") start a new chat with a fixed starter in the composer, built here from the id, so a link
 * can never put other words there.
 */
export default async function MiraPage({
  searchParams,
}: {
  searchParams: Promise<{ chat?: string; ask?: string; say?: string }>;
}) {
  const account = await getMiraAccount();
  const { chat, ask, say } = await searchParams;
  const chatId = typeof chat === "string" && /^[0-9a-f-]{36}$/i.test(chat) ? chat : null;
  // A stored chat opened while signed out (a nudge read on another device): sign in first, then
  // straight back to it.
  if (chatId && !account)
    redirect(`/mira/start?next=${encodeURIComponent(`/mira?chat=${chatId}`)}`);
  const practice = typeof ask === "string" && /^[1-7]$/.test(ask) ? Number(ask) : null;
  // "Talk to Mira about this" on a self-check's result (`?say=<check>`, signed in): only its fixed
  // starter, never text from the link, so no link can put words in someone's mouth.
  const starter = chatId
    ? null
    : practice
      ? guideStarter(practice)
      : account
        ? (starterFor(say) ?? null)
        : null;
  const view = (
    <MiraChat
      signedIn={Boolean(account)}
      initialChatId={account ? chatId : null}
      starter={starter}
    />
  );
  return starter && practice ? (
    <>
      {view}
      <GuideAskCount practice={practice} />
    </>
  ) : (
    view
  );
}
