import type { Metadata } from "next";
import ExperimentRegistry from "@/components/admin/ExperimentRegistry";

export const metadata: Metadata = {
  title: "Experiments | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function ExperimentsPage() {
  return <ExperimentRegistry />;
}
