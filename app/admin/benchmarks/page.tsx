import type { Metadata } from "next";
import BenchmarkRegistry from "@/components/admin/BenchmarkRegistry";

export const metadata: Metadata = {
  title: "Benchmarks | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function BenchmarksPage() {
  return <BenchmarkRegistry />;
}
