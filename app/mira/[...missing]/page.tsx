import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Page not found | LoveIQ",
  robots: { index: false, follow: false },
};

/**
 * Any other address under /mira (/mira/foo, /mira/goals/1): Mira's own "not here" page
 * (../not-found.tsx) in the person's look, not the site's marketing 404 (round-2 SET-5). Only the
 * root not-found sees unmatched addresses, so this route sends them to Mira's.
 */
export default function MissingPage(): never {
  notFound();
}
