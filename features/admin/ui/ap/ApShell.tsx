"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";

import ApSidebar, { Mark } from "./ApSidebar";
import { FieldInfoProvider } from "./field-info";
import { ApStatusProvider } from "./status";

/**
 * The light frame of AP-Analytics: the sidebar on the left from 1024px, behind a menu button
 * on narrower screens, and the page beside it. The admin's dark shell is not used here.
 */
export default function ApShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  // The site's body is dark; the bounce past either end of the page should not be.
  useEffect(() => {
    const before = document.body.style.background;
    document.body.style.background = "#f5f6f8";
    return () => {
      document.body.style.background = before;
    };
  }, []);

  return (
    <ApStatusProvider>
      {/* The design's keyboard focus: a 2px purple ring, 2px out. */}
      <div className="min-h-screen bg-ap-ground font-sans text-ap-ink lg:flex [&_:focus-visible]:outline [&_:focus-visible]:outline-2 [&_:focus-visible]:outline-offset-2 [&_:focus-visible]:outline-ap-purple">
        <div className="sticky top-0 z-30 flex items-center justify-between border-b border-ap-line bg-white px-4 py-2 lg:hidden">
          <span className="flex items-center gap-2">
            <Mark />
            <span className="font-serif text-base font-bold">AP-Analytics</span>
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ap-label">
              Admin
            </span>
          </span>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="ap-sidebar"
            onClick={() => setOpen((o) => !o)}
            className="min-h-11 cursor-pointer rounded-full border border-ap-line bg-white px-4 text-sm font-bold text-ap-ink"
          >
            {open ? "Close menu" : "Menu"}
          </button>
        </div>
        <div
          id="ap-sidebar"
          className={`${open ? "block" : "hidden"} lg:sticky lg:top-0 lg:block lg:h-screen lg:w-[248px] lg:shrink-0 lg:overflow-y-auto`}
        >
          <Suspense fallback={null}>
            <ApSidebar onNavigate={() => setOpen(false)} />
          </Suspense>
        </div>
        <main className="min-w-0 flex-1 px-4 pb-[72px] pt-7 sm:px-[clamp(16px,3vw,40px)]">
          <div className="mx-auto flex max-w-[1160px] flex-col gap-6">
            <Suspense fallback={null}>
              <FieldInfoProvider>{children}</FieldInfoProvider>
            </Suspense>
          </div>
        </main>
      </div>
    </ApStatusProvider>
  );
}
