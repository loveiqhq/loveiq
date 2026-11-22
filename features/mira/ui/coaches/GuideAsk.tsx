import Image from "next/image";
import Link from "next/link";
import type { GuidePractice } from "@features/mira/content/guide";
import { QUIET_PILL } from "./styles";

/**
 * "Ask Mira about this" after each of the guide's practices (board ReportEmbed, calmer): the
 * chat opens with a starter naming the practice in the composer, for the person to send or
 * change (app/mira/page.tsx, `?ask=`). The guide itself still keeps nothing: the chat counts the
 * open once (guide_ask) and takes `?ask=` out of the address (MiraChat).
 */
export function AskMiraAbout({ practice }: { practice: GuidePractice }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[20px] bg-ap-lilac/70 px-4 py-3">
      <Image
        src="/images/mira/mira.webp"
        alt=""
        width={32}
        height={32}
        unoptimized
        className="h-8 w-8 shrink-0 rounded-full object-cover"
      />
      <p className="!mt-0 min-w-[12ch] flex-1 text-[14px] leading-snug text-ap-body">
        Questions about this practice? Mira can talk it through with you.
      </p>
      <Link href={`/mira?ask=${practice.number}`} prefetch={false} className={QUIET_PILL}>
        Ask Mira about this
        <span className="sr-only">
          : practice {practice.number}, {practice.name}
        </span>
      </Link>
    </div>
  );
}
