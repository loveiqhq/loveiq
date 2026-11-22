import type { Metadata } from "next";
import { miraLinkPreview } from "@features/mira/link-preview";
import { redirect } from "next/navigation";
import { getMiraAccount } from "@features/mira/server/session";
import CoachRoster from "@features/mira/ui/coaches/CoachRoster";

export const metadata: Metadata = {
  title: "Coaches | LoveIQ",
  robots: { index: false, follow: false },
  ...miraLinkPreview("/mira/coaches"),
};

export const dynamic = "force-dynamic";

/** Board Coaches: Mira and the coaches on their way (features/mira/ui/coaches). */
export default async function Page() {
  if (!(await getMiraAccount())) redirect("/mira/start?next=%2Fmira%2Fcoaches");
  return <CoachRoster />;
}
