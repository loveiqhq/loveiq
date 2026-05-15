import type { Metadata } from "next";
import AnswerExplorer from "@features/admin/ui/AnswerExplorer";

export const metadata: Metadata = {
  title: "Answer Explorer | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function AnswersPage() {
  return <AnswerExplorer />;
}
