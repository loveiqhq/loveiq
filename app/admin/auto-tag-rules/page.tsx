import type { Metadata } from "next";
import AutoTagRules from "@features/admin/ui/AutoTagRules";

export const metadata: Metadata = {
  title: "Auto-Tag Rules | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function AutoTagRulesPage() {
  return <AutoTagRules />;
}
