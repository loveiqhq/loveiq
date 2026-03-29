import type { Metadata } from "next";
import ConversionPipeline from "@/components/admin/ConversionPipeline";

export const metadata: Metadata = {
  title: "Conversion Pipeline | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function PipelinePage() {
  return <ConversionPipeline />;
}
