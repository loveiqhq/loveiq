import type { Metadata } from "next";
import { miraLinkPreview } from "@features/mira/link-preview";
import { redirect } from "next/navigation";
import { isMinor } from "@features/mira/server/minor";
import { getMiraAccount } from "@features/mira/server/session";
import MiraFeedback from "@features/mira/ui/MiraFeedback";

export const metadata: Metadata = {
  title: "Beta feedback | LoveIQ",
  robots: { index: false, follow: false },
  ...miraLinkPreview("/mira/feedback"),
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const account = await getMiraAccount();
  if (!account) redirect("/mira/start?next=%2Fmira%2Ffeedback");
  // Stopped as under 18: the one refusal in place of the form from the start, never after the
  // person wrote and sent (round-3 R3-DATA-5). Unsure is not stopped: the route still refuses.
  return <MiraFeedback minor={await isMinor(account.id).catch(() => false)} />;
}
