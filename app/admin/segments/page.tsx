import type { Metadata } from "next";
import SegmentBuilder from "@/components/admin/SegmentBuilder";

export const metadata: Metadata = {
  title: "Segments | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function SegmentsPage() {
  return <SegmentBuilder />;
}
