import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMiraAccount } from "@features/mira/server/session";
import MiraHome from "@features/mira/ui/MiraHome";

export const metadata: Metadata = {
  title: "Home | LoveIQ",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function Page() {
  if (!(await getMiraAccount())) redirect("/mira/start");
  return <MiraHome />;
}
