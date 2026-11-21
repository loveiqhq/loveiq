import type { Metadata } from "next";
import { miraLinkPreview } from "@features/mira/link-preview";
import { redirect } from "next/navigation";
import { getMiraAccount } from "@features/mira/server/session";
import AssessmentsPage from "@features/mira/ui/checks/AssessmentsPage";

export const metadata: Metadata = {
  title: "Assessments | LoveIQ",
  robots: { index: false, follow: false },
  ...miraLinkPreview("/mira/assessments"),
};

export const dynamic = "force-dynamic";

/** Mira's assessments: the self-checks, the body check and the LoveIQ result. */
export default async function Page() {
  if (!(await getMiraAccount())) redirect("/mira/start?next=%2Fmira%2Fassessments");
  return <AssessmentsPage />;
}
