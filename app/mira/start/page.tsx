import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { googleClient } from "@features/mira/server/google";
import { getMiraAccount, safeNext } from "@features/mira/server/session";
import { getProfile } from "@features/mira/server/store";
import SignUpFlow from "@features/mira/ui/SignUpFlow";

export const metadata: Metadata = {
  title: "Create your free account | LoveIQ",
  robots: { index: false, follow: false },
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
  return (
    <SignUpFlow
      googleEnabled={googleClient() !== null}
      googleResult={googleResult}
      needsAbout={about === "1"}
      next={next}
    />
  );
}
