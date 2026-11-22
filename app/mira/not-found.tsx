import type { Metadata } from "next";
import Link from "next/link";
import { getMiraAccount } from "@features/mira/server/session";
import { MiraAppFrame } from "@features/mira/ui/MiraAppFrame";
import { MiraFrame } from "@features/mira/ui/MiraShell";

/**
 * A Mira address that isn't there (round-2 SET-5): a check that doesn't exist, a session id that
 * isn't one, a mistyped address. In the person's look and, signed in, in the app's frame with the
 * menu, instead of the site's marketing 404.
 *
 * Its tab title too (round-3 R3-UXA-11), not the address's ("Assessment | LoveIQ"): Next.js uses
 * this metadata when a route's generateMetadata calls notFound(), as every Mira route that can
 * answer "not here" does (assessments/[check], recordings/[id]); [...missing] has its own.
 */
export const metadata: Metadata = {
  title: "Page not found | LoveIQ",
  robots: { index: false, follow: false },
};

export default async function MiraNotFound() {
  const signedIn = Boolean(await getMiraAccount());
  const body = (
    <div className="max-w-[560px] pb-6 pt-2">
      <h1 className="font-serif text-[34px] font-medium leading-tight">This page isn’t here</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ap-body">
        The link may be old, or the address may have a typo.
      </p>
      <Link
        href={signedIn ? "/mira/home" : "/mira"}
        className="mt-6 inline-flex min-h-[48px] items-center rounded-full bg-ap-ink px-6 text-[15px] font-bold text-white transition-colors hover:bg-ap-ink/90"
      >
        {signedIn ? "Go to Home" : "Talk to Mira"}
      </Link>
    </div>
  );
  return signedIn ? <MiraAppFrame>{body}</MiraAppFrame> : <MiraFrame>{body}</MiraFrame>;
}
