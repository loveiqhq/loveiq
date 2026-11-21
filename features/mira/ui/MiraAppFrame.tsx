"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { DISCLAIMER, LegalLinks, Wordmark } from "./MiraShell";
import { SupportPanel } from "./SupportPanel";
import { useReloadWhenRestored } from "./api";

const PAGES: Array<[href: string, label: string, key?: "home" | "settings"]> = [
  ["/mira/home", "Home", "home"],
  ["/mira", "Coach & chats"],
  ["/mira/home#assessments", "Assessments"],
  ["/mira/settings", "Settings", "settings"],
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
  active: "home" | "settings" | "feedback";
  email?: string;
  name?: string | null;
  children: ReactNode;
}) {
  const [support, setSupport] = useState(false);
  useReloadWhenRestored();
  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-ap-ink selection:bg-[#efe6fd] lg:flex-row">
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
          aria-label="Mira"
          className="flex gap-5 overflow-x-auto px-4 [scrollbar-width:none] lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden"
        >
          {PAGES.map(([href, label, key]) => {
            const on = key === active;
            return (
              <Link
                key={href}
                href={href}
                aria-current={on ? "page" : undefined}
                className={`relative whitespace-nowrap py-3 text-[14px] transition-colors lg:rounded-xl lg:px-3 lg:py-2 ${
                  on
                    ? "font-semibold after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:rounded-full after:bg-ap-ink lg:bg-ap-ground lg:after:hidden"
                    : "text-ap-muted hover:text-ap-ink lg:hover:bg-ap-ground"
                }`}
              >
                {label}
              </Link>
            );
          })}
          {["Challenges & goals", "Daily journal", "Session recordings"].map((t) => (
            <span
              key={t}
              className="hidden items-center justify-between rounded-xl px-3 py-2 text-[14px] text-ap-quiet lg:flex"
            >
              {t} <span className="ml-2 text-[11px]">Soon</span>
            </span>
          ))}
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
      <main className="flex-1 px-4 py-7 sm:px-10 lg:py-10">
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
