import type { Metadata } from "next";
import BenchmarkRegistry from "@features/admin/ui/BenchmarkRegistry";

export const metadata: Metadata = {
  title: "Metrics & Benchmarks | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function BenchmarksPage() {
  return <BenchmarkRegistry />;
}
