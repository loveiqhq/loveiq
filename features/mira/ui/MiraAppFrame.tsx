"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { DISCLAIMER, LegalLinks, Wordmark } from "./MiraShell";
import { SupportPanel } from "./SupportPanel";
import { useReloadWhenRestored } from "./api";

export type MiraPage =
  | "home"
  | "chats"
  | "coaches"
  | "assessments"
  | "goals"
  | "journal"
  | "recordings"
  | "guide"
  | "settings"
  | "feedback";

/**
 * Every signed-in page, in the menu's order. `short` is the phone tab's label; `wide` false keeps
 * it off the phone row (the header's "Chat with Mira" already leads to the chat).
 */
const PAGES: Array<{ href: string; label: string; short: string; key: MiraPage; phone?: false }> = [
  { href: "/mira/home", label: "Home", short: "Home", key: "home" },
  { href: "/mira", label: "Coach & chats", short: "Chats", key: "chats", phone: false },
  { href: "/mira/journal", label: "Daily journal", short: "Journal", key: "journal" },
  { href: "/mira/goals", label: "Challenges & goals", short: "Goals", key: "goals" },
  { href: "/mira/assessments", label: "Assessments", short: "Assessments", key: "assessments" },
  { href: "/mira/recordings", label: "Voice sessions", short: "Voice", key: "recordings" },
  { href: "/mira/coaches", label: "Coaches", short: "Coaches", key: "coaches" },
  // NEXT_PUBLIC_MIRA_GUIDE_URL can point the guide elsewhere (inlined at build time).
  {
    href: process.env.NEXT_PUBLIC_MIRA_GUIDE_URL || "/mira/guide",
    label: "Guide",
    short: "Guide",
    key: "guide",
  },
  { href: "/mira/settings", label: "Settings", short: "Settings", key: "settings" },
];

/**
 * The signed-in frame of boards 08 to 10, in the calm chat's language (21 Nov 2026): on phones a
 * white header with the way back to the chat and one row of tabs that fits; from lg the menu on
 * the left. The beta note, the support line and the legal links close every page.
 */
export function MiraAppFrame({
  active,
  email,
  name,
  children,
}: {
  active: MiraPage;
  email?: string;
  name?: string | null;
  children: ReactNode;
}) {
  const [support, setSupport] = useState(false);
  const nav = useRef<HTMLElement>(null);
  useReloadWhenRestored();
  // Phones: the tab row scrolls sideways, so the page's own tab comes into view (never the page).
  useEffect(() => {
    const row = nav.current;
    const tab = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (row && tab && row.scrollWidth > row.clientWidth) {
      row.scrollLeft = Math.max(0, tab.offsetLeft - (row.clientWidth - tab.offsetWidth) / 2);
    }
  }, [active]);
  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-ap-ink selection:bg-ap-lilac lg:flex-row">
      <aside className="border-b border-ap-line lg:flex lg:w-[248px] lg:shrink-0 lg:flex-col lg:gap-6 lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
        <div className="flex items-center justify-between gap-3 px-4 pb-1 pt-3 lg:p-0">
          <Wordmark />
          <Link
            href="/mira"
            className="inline-flex min-h-[40px] items-center whitespace-nowrap rounded-full bg-ap-ink px-4 text-[14px] font-bold text-white lg:hidden"
          >
            Chat with Mira
          </Link>
        </div>
        <nav
          ref={nav}
          aria-label="Mira"
          className="flex gap-5 overflow-x-auto px-4 [mask-image:linear-gradient(to_right,#000_calc(100%-28px),transparent)] [scrollbar-width:none] lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0 lg:[mask-image:none] [&::-webkit-scrollbar]:hidden"
        >
          {PAGES.map(({ href, label, short, key, phone }) => {
            const on = key === active;
            return (
              <Link
                key={href}
                href={href}
                aria-current={on ? "page" : undefined}
                className={`relative shrink-0 whitespace-nowrap py-3 text-[14px] transition-colors last:pr-6 lg:rounded-xl lg:px-3 lg:py-2 lg:last:pr-3 ${
                  phone === false ? "hidden lg:block" : ""
                } ${
                  on
                    ? "font-semibold after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:rounded-full after:bg-ap-ink lg:bg-ap-ground lg:after:hidden"
                    : "text-ap-muted hover:text-ap-ink lg:hover:bg-ap-ground"
                }`}
              >
                <span className="lg:hidden">{short}</span>
                <span className="hidden lg:inline">{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="hidden lg:mt-auto lg:flex lg:flex-col lg:gap-3">
          <button
            type="button"
            onClick={() => setSupport(true)}
            className="text-left text-[13px] text-ap-plum underline"
          >
            Need support right now?
          </button>
          {email ? (
            <p className="text-[12px] text-ap-muted [overflow-wrap:anywhere]">
              {name ? <strong className="block text-ap-ink">{name}</strong> : null}
              {email}
            </p>
          ) : null}
        </div>
      </aside>
      <main id="main-content" className="flex-1 px-4 py-7 sm:px-10 lg:py-10">
        <div className="max-w-[860px]">{children}</div>
        <footer className="mt-12 max-w-[760px] text-[12px] leading-relaxed text-ap-muted">
          <p>
            Mira is in beta: things may change, and your feedback shapes what comes next.{" "}
            <Link href="/mira/feedback" className="font-semibold text-ap-ink underline">
              Share feedback
            </Link>
            <span className="lg:hidden">
              {" · "}
              <button type="button" onClick={() => setSupport(true)} className="underline">
                Need support right now?
              </button>
            </span>
          </p>
          <p className="mt-3">{DISCLAIMER}</p>
          <LegalLinks className="mt-6" />
        </footer>
      </main>
      {support ? <SupportPanel highlight={null} onClose={() => setSupport(false)} /> : null}
    </div>
  );
}
