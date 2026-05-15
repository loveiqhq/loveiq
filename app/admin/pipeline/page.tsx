import type { Metadata } from "next";
import ConversionPipeline from "@features/admin/ui/ConversionPipeline";

export const metadata: Metadata = {
  title: "Conversion Pipeline | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default function PipelinePage() {
  return <ConversionPipeline />;
}
