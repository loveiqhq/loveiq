import type { Metadata } from "next";
import ArchetypeComparison from "@features/admin/ui/ArchetypeComparison";

export const metadata: Metadata = {
  title: "Compare Archetypes | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function ArchetypeComparePage() {
  return <ArchetypeComparison />;
}
