import type { Metadata } from "next";
import { Suspense } from "react";
import { readToken } from "@features/mira/server/nudges";
import MiraNudges from "@features/mira/ui/MiraNudges";

export const metadata: Metadata = {
  title: "Email preferences | Applied Psychometrics",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The page behind every nudge email's "Fewer nudges", "Pause" and "Unsubscribe" links. The link
 * is checked here, so one we did not sign shows "This link doesn't work" without a request that
 * could only fail.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ t?: string | string[] }>;
}) {
  const { t } = await searchParams;
  const signed = readToken("prefs", typeof t === "string" ? t : null) !== null;
  return (
    <Suspense fallback={null}>
      <MiraNudges invalid={!signed} />
    </Suspense>
  );
}
