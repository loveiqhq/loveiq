import type { Metadata } from "next";
import { miraLinkPreview } from "@features/mira/link-preview";
import { redirect } from "next/navigation";
import { googleClient } from "@features/mira/server/google";
import { getMiraAccount } from "@features/mira/server/session";
import { getProfile } from "@features/mira/server/store";
import SignUpFlow from "@features/mira/ui/SignUpFlow";

export const metadata: Metadata = {
  title: "Create your free account | Applied Psychometrics",
  robots: { index: false, follow: false },
  ...miraLinkPreview("/mira/start"),
};

export const dynamic = "force-dynamic";

/** Boards 04, 05 and 06: the free account by emailed code or Google. */
export default async function MiraStartPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string; about?: string }>;
}) {
  const { google, about } = await searchParams;
  const account = await getMiraAccount();
  // Signed in counts only with a Mira profile. A session whose profile is missing (its save
  // failed at sign-in) is sent here to sign in again; Home would only send it back (a loop).
  const signedIn = Boolean(account && (await getProfile(account.id).catch(() => null)));
  // Back from Google, signed in: stay to bring the chat along and ask "About you".
  if (signedIn && google !== "done") redirect("/mira/home");
  const googleResult = google === "done" ? (signedIn ? "done" : "failed") : (google ?? null);
  return (
    <SignUpFlow
      googleEnabled={googleClient() !== null}
      googleResult={googleResult}
      needsAbout={about === "1"}
    />
  );
}
