import type { Metadata } from "next";
import { miraLinkPreview } from "@features/mira/link-preview";
import { redirect } from "next/navigation";
import { getMiraAccount } from "@features/mira/server/session";
import RecordingsPage from "@features/mira/ui/recordings/Recordings";

export const metadata: Metadata = {
  title: "Voice sessions | LoveIQ",
  robots: { index: false, follow: false },
  ...miraLinkPreview("/mira/recordings"),
};

export const dynamic = "force-dynamic";

/** Talking to Mira, kept as words: every voice session of the account. */
export default async function Page() {
  if (!(await getMiraAccount())) redirect("/mira/start?next=%2Fmira%2Frecordings");
  return <RecordingsPage />;
}
