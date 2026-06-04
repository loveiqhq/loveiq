import type { Metadata } from "next";
import DataExplorer from "@features/admin/ui/explorer/DataExplorer";

export const metadata: Metadata = {
  title: "Data Explorer | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function ExplorerPage() {
  return <DataExplorer />;
}
