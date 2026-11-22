import type { Metadata } from "next";
import { miraLinkPreview } from "@features/mira/link-preview";
import { notFound, redirect } from "next/navigation";
import { getMiraAccount } from "@features/mira/server/session";
import RecordingDetail from "@features/mira/ui/recordings/RecordingDetail";

type Props = { params: Promise<{ id: string }> };

const isId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

/** Not an id: the not-found page's metadata, not "Voice session | LoveIQ" (R3-UXA-11). */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!isId((await params).id)) notFound();
  return {
    title: "Voice session | LoveIQ",
    robots: { index: false, follow: false },
    ...miraLinkPreview("/mira/recordings"),
  };
}

export const dynamic = "force-dynamic";

/**
 * One voice session: its key points, what was said, and a way to delete it. Signed out, the
 * sign-in comes back to this session (server/session.ts safeNext lets it through).
 */
export default async function Page({ params }: Props) {
  const { id } = await params;
  if (!isId(id)) notFound();
  if (!(await getMiraAccount())) {
    redirect(`/mira/start?next=${encodeURIComponent(`/mira/recordings/${id}`)}`);
  }
  return <RecordingDetail id={id} />;
}
