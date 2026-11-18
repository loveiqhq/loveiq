import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMiraAccount } from "@features/mira/server/session";
import MiraFeedback from "@features/mira/ui/MiraFeedback";

export const metadata: Metadata = {
  title: "Beta feedback | Applied Psychometrics",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function Page() {
  if (!(await getMiraAccount())) redirect("/mira/start");
  return <MiraFeedback />;
}
