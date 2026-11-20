import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMiraAccount } from "@features/mira/server/session";
import MiraSettings from "@features/mira/ui/MiraSettings";

export const metadata: Metadata = {
  title: "Settings | LoveIQ",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function Page() {
  if (!(await getMiraAccount())) redirect("/mira/start");
  return <MiraSettings />;
}
