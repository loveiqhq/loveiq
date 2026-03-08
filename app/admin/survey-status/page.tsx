import type { Metadata } from "next";
import SurveyStatus from "@/components/admin/SurveyStatus";

export const metadata: Metadata = {
  title: "Survey Status | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function SurveyStatusPage() {
  return <SurveyStatus />;
}
