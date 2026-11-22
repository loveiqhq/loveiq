import type { Metadata } from "next";
import { miraLinkPreview } from "@features/mira/link-preview";
import { redirect } from "next/navigation";
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
 * calm side: "Hello", and quiet.
 */
export default async function Page() {
  const account = await getMiraAccount();
  if (!account) redirect("/mira/start?next=%2Fmira%2Fhome");
  const now = new Date();
  const [profile, quiet] = await Promise.all([
    getProfile(account.id).catch(() => null),
    hadCrisis(account.id, new Date(now.getTime() - CRISIS_QUIET_DAYS * 86_400_000)).catch(
      () => true
    ),
  ]);
  return (
    <MiraHome
      name={profile?.name ?? null}
      hour={profile ? Math.floor(localParts(now, profile.time_zone).minutes / 60) : null}
      quiet={quiet}
    />
  );
}
