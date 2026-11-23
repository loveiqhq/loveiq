import type { Metadata } from "next";
import { miraLinkPreview } from "@features/mira/link-preview";
import { redirect } from "next/navigation";
import { isMinor } from "@features/mira/server/minor";
import { CRISIS_QUIET_DAYS, hadCrisis, localParts } from "@features/mira/server/nudges";
import { getMiraAccount } from "@features/mira/server/session";
import { getProfile } from "@features/mira/server/store";
import MiraHome from "@features/mira/ui/MiraHome";

export const metadata: Metadata = {
  title: "Home | LoveIQ",
  robots: { index: false, follow: false },
  ...miraLinkPreview("/mira/home"),
};

export const dynamic = "force-dynamic";

/**
 * Home's greeting is known before the page is sent (round-2 UX-15: it no longer turns from
 * "Hello" into "Good morning, Robin" once the account loads): the name, the hour on the person's
 * own clock (their time zone, as the nudges use), and whether the support lines showed in the
 * last 14 days, the quiet the nudges and reminders keep (CHAT-17). A failed read errs on the
 * calm side: "Hello", and quiet. Also whether Mira stopped the account or this browser as under 18,
 * so Home says it once from the first paint (round-3 R3-UXA-8); unsure is not stopped, as
 * /api/mira/me answers, and the cards then each refuse on their own.
 */
export default async function Page() {
  const account = await getMiraAccount();
  if (!account) redirect("/mira/start?next=%2Fmira%2Fhome");
  const now = new Date();
  const [profile, quiet, minor] = await Promise.all([
    getProfile(account.id).catch(() => null),
    hadCrisis(account.id, new Date(now.getTime() - CRISIS_QUIET_DAYS * 86_400_000)).catch(
      () => true
    ),
    isMinor(account.id).catch(() => false),
  ]);
  return (
    <MiraHome
      account={account.id}
      name={profile?.name ?? null}
      hour={profile ? Math.floor(localParts(now, profile.time_zone).minutes / 60) : null}
      quiet={quiet}
      minor={minor}
    />
  );
}
