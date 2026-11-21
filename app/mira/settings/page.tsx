import type { Metadata } from "next";
import { miraLinkPreview } from "@features/mira/link-preview";
import { redirect } from "next/navigation";
import { getMiraAccount } from "@features/mira/server/session";
import MiraSettings from "@features/mira/ui/MiraSettings";
import SecuritySettings from "@features/mira/ui/account/SecuritySettings";
import ChecksSettings from "@features/mira/ui/checks/ChecksSettings";
import { JournalSettings } from "@features/mira/ui/journal/JournalSettings";
import SharedReviewSettings from "@features/mira/ui/reviews/SharedReviewSettings";
import { WeeklySessionSettings } from "@features/mira/ui/weekly-session/WeeklySessionSettings";

export const metadata: Metadata = {
  title: "Settings | LoveIQ",
  robots: { index: false, follow: false },
  ...miraLinkPreview("/mira/settings"),
};

export const dynamic = "force-dynamic";

export default async function Page() {
  if (!(await getMiraAccount())) redirect("/mira/start");
  return (
    <MiraSettings
      security={<SecuritySettings />}
      checks={<ChecksSettings />}
      sharedReview={<SharedReviewSettings />}
      journal={<JournalSettings />}
      weeklySession={<WeeklySessionSettings />}
    />
  );
}
