import type { Metadata } from "next";
import ArchetypeOverview from "@features/admin/ui/ArchetypeOverview";

export const metadata: Metadata = {
  title: "Archetypes | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function ArchetypesPage() {
  return <ArchetypeOverview />;
}
