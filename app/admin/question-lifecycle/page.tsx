import type { Metadata } from "next";
import QuestionLifecyclePanel from "@/components/admin/QuestionLifecyclePanel";

export const metadata: Metadata = {
  title: "Question Lifecycle | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function QuestionLifecyclePage() {
  return <QuestionLifecyclePanel />;
}
