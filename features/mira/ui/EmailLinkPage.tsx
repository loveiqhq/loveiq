import type { ReactNode, Ref } from "react";
import { LegalLinks, Wordmark } from "./MiraShell";

/** Every heading on these pages: one size and weight, focusable for the screen changes. */
export const HEADING = "font-serif text-[30px] font-semibold leading-tight outline-none";
export const LINK = "font-semibold text-ap-plum underline underline-offset-2";

/**
 * The pages behind Mira's email links (features/mira/email-link.ts): a nudge's preferences
 * (`MiraNudges`), the journal reminder's stop (`journal/ReminderStop`) and a weekly session's
 * (`weekly-session/SessionStop`). No sign-in, as the link's token stands for the person: one
 * frame for all three.
 */
export function EmailLinkPage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-ap-ink">
      <header className="flex h-[60px] items-center justify-between border-b border-ap-line px-5">
        <Wordmark />
        <span className="text-[12px] font-semibold text-ap-muted">Email preferences</span>
      </header>
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-5 px-5 pb-10 pt-8"
      >
        {children}
      </main>
      <footer className="mx-auto w-full max-w-[480px] px-5 pb-8">
        <LegalLinks />
      </footer>
    </div>
  );
}

/**
 * A link we didn't sign, one cut short, or a page opened again after its cookie's hour: the same
 * words on all three pages, and where else the change can be made. The tokens never expire, so
 * nothing says "anymore".
 */
export function LinkDoesNotWork({
  elsewhere,
  headingRef,
}: {
  /** The end of the sentence "…, or …": where else to make the change, with its link. */
  elsewhere: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  return (
    <>
      <h1 ref={headingRef} tabIndex={-1} className={HEADING}>
        This link doesn’t work
      </h1>
      <p className="text-[15px] leading-relaxed text-ap-body">
        It may be incomplete. Open it again from the email, or {elsewhere}
      </p>
    </>
  );
}
