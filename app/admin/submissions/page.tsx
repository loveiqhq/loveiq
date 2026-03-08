import type { Metadata } from "next";
import SubmissionBrowser from "@/components/admin/SubmissionBrowser";

export const metadata: Metadata = {
  title: "Submissions | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function SubmissionsPage() {
  return <SubmissionBrowser />;
}
