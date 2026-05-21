import type { Metadata } from "next";
import ExperimentRegistry from "@features/admin/ui/ExperimentRegistry";

export const metadata: Metadata = {
  title: "Experiments | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function ExperimentsPage() {
  return <ExperimentRegistry />;
}
