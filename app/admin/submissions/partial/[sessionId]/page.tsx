import type { Metadata } from "next";
import SubmissionDetail from "@/components/admin/SubmissionDetail";

export const metadata: Metadata = {
  title: "Saved Survey Session | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default async function PartialSubmissionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <SubmissionDetail id={sessionId} mode="partial" />;
}
