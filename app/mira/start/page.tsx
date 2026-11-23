import type { Metadata } from "next";
import { miraLinkPreview } from "@features/mira/link-preview";
import { redirect } from "next/navigation";
import { googleClient } from "@features/mira/server/google";
import { isMinor } from "@features/mira/server/minor";
import { getMiraAccount, safeNext } from "@features/mira/server/session";
import { getProfile } from "@features/mira/server/store";
import SignUpFlow from "@features/mira/ui/SignUpFlow";

export const metadata: Metadata = {
  title: "Create your free account | LoveIQ",
  robots: { index: false, follow: false },
  ...miraLinkPreview("/mira/start", "Create your free Mira account | LoveIQ"),
};

export const dynamic = "force-dynamic";

/** Boards 04, 05 and 06: the free account by emailed code or Google. */
export default async function MiraStartPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string; about?: string; next?: string }>;
}) {
  const { google, about, next: asked } = await searchParams;
  // Where to go once signed in: a Mira page only (a nudge's chat), else Home.
  const next = safeNext(asked);
  const account = await getMiraAccount();
  // Signed in counts only with a Mira profile. A session whose profile is missing (its save
  // failed at sign-in) is sent here to sign in again; Home would only send it back (a loop).
  const signedIn = Boolean(account && (await getProfile(account.id).catch(() => null)));
  // Back from Google, signed in: stay to bring the chat along and ask "About you".
  if (signedIn && google !== "done") redirect(next ?? "/mira/home");
  const googleResult = google === "done" ? (signedIn ? "done" : "failed") : (google ?? null);
  // A browser or account stopped as under 18 (the stop's cookie, the account, or Google's return
  // refused for it): the page says "Mira is only for adults." at once, never a form, the 18+ tick,
  // a code or "About you" (round-4 R4-CORE-1, as the chat starts stopped). Unsure is not stopped.
  const minor = google === "minor" || (await isMinor(account?.id ?? null).catch(() => false));
  return (
    <SignUpFlow
      googleEnabled={googleClient() !== null}
      googleResult={googleResult}
      needsAbout={about === "1"}
      minor={minor}
      next={next}
    />
  );
}
