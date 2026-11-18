import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMiraAccount } from "@features/mira/server/session";
import SignUpFlow from "@features/mira/ui/SignUpFlow";

export const metadata: Metadata = {
  title: "Create your free account | Applied Psychometrics",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Boards 04, 05 and 06: the free account by emailed code. */
export default async function MiraStartPage() {
  if (await getMiraAccount()) redirect("/mira/home");
  return <SignUpFlow />;
}
