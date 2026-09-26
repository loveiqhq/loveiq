import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connectState } from "@features/brain/server/connect";
import JarvisConnect from "@features/brain/ui/JarvisConnect";

export const metadata: Metadata = {
  title: "Connect Jarvis | LoveIQ",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Where Claude sends a person to sign in to Jarvis (Supabase's OAuth authorization path).
 * See features/brain/server/connect.ts.
 */
export default async function JarvisConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string }>;
}) {
  const authorizationId = (await searchParams).authorization_id?.trim() || null;
  const state = await connectState(authorizationId);
  if (state.kind === "redirect") redirect(state.url);
  return <JarvisConnect state={state} authorizationId={authorizationId} />;
}
