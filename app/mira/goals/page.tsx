import type { Metadata } from "next";
import { miraLinkPreview } from "@features/mira/link-preview";
import { redirect } from "next/navigation";
import { getMiraAccount } from "@features/mira/server/session";
import GoalsPage from "@features/mira/ui/goals/GoalsPage";

export const metadata: Metadata = {
  title: "Challenges & goals | LoveIQ",
  robots: { index: false, follow: false },
  ...miraLinkPreview("/mira/goals"),
};

export const dynamic = "force-dynamic";

export default async function Page() {
  if (!(await getMiraAccount())) redirect("/mira/start?next=%2Fmira%2Fgoals");
  return <GoalsPage />;
}
