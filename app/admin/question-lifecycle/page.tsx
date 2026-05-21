import type { Metadata } from "next";
import QuestionLifecyclePanel from "@features/admin/ui/QuestionLifecyclePanel";

export const metadata: Metadata = {
  title: "Question Lifecycle | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function QuestionLifecyclePage() {
  return <QuestionLifecyclePanel />;
}
