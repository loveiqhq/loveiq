import type { Metadata } from "next";
import { miraLinkPreview } from "@features/mira/link-preview";
import { notFound, redirect } from "next/navigation";
import { getMiraAccount } from "@features/mira/server/session";
import RecordingDetail from "@features/mira/ui/recordings/RecordingDetail";

export const metadata: Metadata = {
  title: "Voice session | LoveIQ",
  robots: { index: false, follow: false },
  ...miraLinkPreview("/mira/recordings"),
};

export const dynamic = "force-dynamic";

/**
 * One voice session: its key points, what was said, and a way to delete it. Signed out, the
 * sign-in comes back to this session (server/session.ts safeNext lets it through).
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  if (!(await getMiraAccount())) {
    redirect(`/mira/start?next=${encodeURIComponent(`/mira/recordings/${id}`)}`);
  }
  return <RecordingDetail id={id} />;
}
