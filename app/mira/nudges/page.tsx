import type { Metadata } from "next";
import { Suspense } from "react";
import MiraNudges from "@features/mira/ui/MiraNudges";

export const metadata: Metadata = {
  title: "Email preferences | LoveIQ",
  robots: { index: false, follow: false },
};

/** The page behind every nudge email's "Fewer nudges", "Pause" and "Unsubscribe" links. */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <MiraNudges />
    </Suspense>
  );
}
