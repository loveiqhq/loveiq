import type { Metadata } from "next";
import QuestionEffectivenessDashboard from "@/components/admin/QuestionEffectivenessDashboard";

export const metadata: Metadata = {
  title: "Question Effectiveness | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function QuestionEffectivenessPage() {
  return <QuestionEffectivenessDashboard />;
}
