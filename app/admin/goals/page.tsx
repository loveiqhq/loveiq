import type { Metadata } from "next";
import GoalTracker from "@/components/admin/GoalTracker";

export const metadata: Metadata = {
  title: "Goals | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function GoalsPage() {
  return <GoalTracker />;
}
