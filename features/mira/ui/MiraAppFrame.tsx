"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { DISCLAIMER, Wordmark } from "./MiraShell";
import { SupportPanel } from "./SupportPanel";
import { useReloadWhenRestored } from "./api";

/** The signed-in frame of boards 08 to 10: menu on the left, beta note, the page on the right. */
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
  const item = (href: string, label: string, key?: string) => (
    <Link
      href={href}
      aria-current={key === active ? "page" : undefined}
      className={`rounded-xl px-3 py-2 text-[14px] ${key === active ? "bg-ap-lilac font-semibold" : "text-ap-body hover:bg-ap-track"}`}
    >
      {label}
    </Link>
  );
  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-ap-ink lg:flex-row">
      <aside className="flex flex-col gap-4 border-b border-ap-line bg-[#faf9fc] p-5 lg:w-[250px] lg:shrink-0 lg:border-b-0 lg:border-r">
        <Wordmark />
        <nav aria-label="Mira" className="flex flex-wrap gap-1 lg:flex-col">
          {item("/mira/home", "Home", "home")}
          {item("/mira", "Coach & chats")}
          {item("/mira/home#assessments", "Assessments")}
          {item("/mira/settings", "Settings", "settings")}
          {["Challenges & goals", "Daily journal", "Session recordings"].map((t) => (
            <span
              key={t}
              className="flex items-center justify-between rounded-xl px-3 py-2 text-[14px] text-ap-quiet"
            >
              {t} <span className="ml-2 text-[11px]">Soon</span>
            </span>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => setSupport(true)}
          className="text-left text-[13px] text-ap-plum underline lg:mt-auto"
        >
          Need support right now?
        </button>
        {email ? (
          <p className="text-[12px] text-ap-muted [overflow-wrap:anywhere]">
            {name ? <strong className="block text-ap-ink">{name}</strong> : null}
            {email}
          </p>
        ) : null}
      </aside>
      <main className="flex-1 px-4 py-6 sm:px-10">
        <div className="mb-6 flex flex-col gap-2 rounded-2xl bg-ap-lilac px-4 py-3 text-[14px] sm:flex-row sm:items-center sm:justify-between">
          <span>
            <strong>Beta.</strong> Things may change, and your feedback shapes what comes next.
          </span>
          <Link href="/mira/feedback" className="font-semibold text-[#561dbd] underline">
            Share feedback
          </Link>
        </div>
        <div className="max-w-[860px]">{children}</div>
        <p className="mt-10 max-w-[760px] text-[12px] leading-relaxed text-ap-muted">
          {DISCLAIMER}
        </p>
      </main>
      {support ? <SupportPanel highlight={null} onClose={() => setSupport(false)} /> : null}
    </div>
  );
}
