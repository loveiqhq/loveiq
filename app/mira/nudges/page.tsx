import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LINK_COOKIE } from "@features/mira/email-link";
import { miraLinkPreview } from "@features/mira/link-preview";
import { readToken } from "@features/mira/server/nudges";
import { getMiraAccount } from "@features/mira/server/session";
import MiraNudges from "@features/mira/ui/MiraNudges";

export const metadata: Metadata = {
  title: "Email preferences | LoveIQ",
  robots: { index: false, follow: false },
  ...miraLinkPreview("/mira/nudges"),
};

export const dynamic = "force-dynamic";

/**
 * The page behind every nudge email's "Fewer nudges", "Pause" and "Unsubscribe" links. The link's
 * token arrives in the `mira_link` cookie, never the address (proxy.ts,
 * features/mira/email-link.ts), and is checked here, so one we did not sign shows "This link
 * doesn't work" without a request that could only fail. The link alone can only stop the nudges;
 * reading or changing the choices needs its own account signed in (round-4 security SEC-R4-2).
 */
export default async function Page() {
  const token = (await cookies()).get(LINK_COOKIE)?.value ?? "";
  const userId = readToken("prefs", token);
  const signedIn = userId !== null && (await getMiraAccount())?.id === userId;
  return <MiraNudges token={token} invalid={userId === null} signedIn={signedIn} />;
}
