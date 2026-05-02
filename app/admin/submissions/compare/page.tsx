import type { Metadata } from "next";
import SubmissionComparison from "@/components/admin/SubmissionComparison";

export const metadata: Metadata = {
  title: "Compare Submissions | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function ComparePage() {
  return <SubmissionComparison />;
}
