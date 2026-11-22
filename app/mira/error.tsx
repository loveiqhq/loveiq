"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";
import { useEffect } from "react";
import { MiraAppFrame, type MiraPage } from "@features/mira/ui/MiraAppFrame";
import { MiraFrame, PrimaryButton } from "@features/mira/ui/MiraShell";
import { recoverFromError } from "@shared/ui/chunkLoadError";

/**
 * The pages only a signed-in person reaches (each sends anyone else to sign in), by address: an
 * error there keeps the app's frame and menu. The chat, the guide and the pages an email links to
 * are open, so they keep the open frame.
 */
const SIGNED_IN: Array<[RegExp, MiraPage]> = [
  [/^\/mira\/home$/, "home"],
  [/^\/mira\/journal$/, "journal"],
  [/^\/mira\/goals$/, "goals"],
  [/^\/mira\/assessments(\/[\w-]+)?$/, "assessments"],
  [/^\/mira\/recordings(\/[\w-]+)?$/, "recordings"],
  [/^\/mira\/coaches$/, "coaches"],
  [/^\/mira\/settings$/, "settings"],
  [/^\/mira\/feedback$/, "feedback"],
];

/**
 * A Mira page that failed (round-2 SET-17), for example its code didn't arrive over a dropped
 * connection: said plainly in the person's look, with Try again (a reload when the code itself
 * failed to load, shared/ui/chunkLoadError.ts) and the way Home, instead of the site's generic
 * error page. Still reported to PostHog, as app/error.tsx does: this boundary now catches first.
 */
export default function MiraError({ error, retry }: { error: unknown; retry: () => void }) {
  const path = usePathname() ?? "";
  const page = SIGNED_IN.find(([re]) => re.test(path))?.[1];
  useEffect(() => {
    console.error(error);
    try {
      posthog.captureException(error, {
        error_boundary: "app/mira/error.tsx",
        digest: (error as { digest?: string } | null)?.digest,
      });
    } catch {
      // Reporting must never break the page that says something broke.
    }
  }, [error]);
  const body = (
    <div className="max-w-[560px] pb-6 pt-2">
      <h1 className="font-serif text-[34px] font-medium leading-tight">
        This page didn&apos;t load
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ap-body">
        It may be the connection, or a fault on our side.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <PrimaryButton onClick={() => recoverFromError(error, retry)}>Try again</PrimaryButton>
        <Link
          href={page ? "/mira/home" : "/mira"}
          className="inline-flex min-h-[48px] items-center rounded-full border border-ap-line px-6 text-[15px] font-semibold transition-colors hover:bg-ap-ground"
        >
          {page ? "Go to Home" : "Talk to Mira"}
        </Link>
      </div>
    </div>
  );
  return page ? <MiraAppFrame active={page}>{body}</MiraAppFrame> : <MiraFrame>{body}</MiraFrame>;
}
