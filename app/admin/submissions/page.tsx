import type { Metadata } from "next";
import SubmissionBrowser from "@features/admin/ui/SubmissionBrowser";

export const metadata: Metadata = {
  title: "Submissions | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function SubmissionsPage() {
  return <SubmissionBrowser />;
}
