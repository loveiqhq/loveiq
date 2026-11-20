import type { Metadata } from "next";
import { miraLinkPreview } from "@features/mira/link-preview";
import { redirect } from "next/navigation";
import { getMiraAccount } from "@features/mira/server/session";
import MiraFeedback from "@features/mira/ui/MiraFeedback";

export const metadata: Metadata = {
  title: "Beta feedback | Applied Psychometrics",
  robots: { index: false, follow: false },
  ...miraLinkPreview("/mira/feedback"),
};

export const dynamic = "force-dynamic";

export default async function Page() {
  if (!(await getMiraAccount())) redirect("/mira/start");
  return <MiraFeedback />;
}
