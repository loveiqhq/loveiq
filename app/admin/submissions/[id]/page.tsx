import type { Metadata } from "next";
import SubmissionDetail from "@/components/admin/SubmissionDetail";

export const metadata: Metadata = {
  title: "Submission Detail | LoveIQ Admin",
  robots: { index: false, follow: false },
};

export default async function SubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SubmissionDetail id={id} />;
}
