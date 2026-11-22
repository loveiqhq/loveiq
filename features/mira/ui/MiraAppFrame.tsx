"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useSupportCountry } from "./MiraLook";
import { DISCLAIMER, LegalLinks, Wordmark } from "./MiraShell";
import { Modal, SupportPanel } from "./SupportPanel";
import { useReloadWhenRestored } from "./api";
import { FOCUS_RING } from "./kit";

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

type Page = { href: string; label: string; key: MiraPage; icon: ReactNode; short?: string };

/**
 * Every signed-in page, in the menu's order: `label` on the desktop menu and in More. A page with
 * a `short` name has its place on the phone's bottom bar (round-2 decision 8); the rest are in
 * the bar's More sheet.
 */
const PAGES: Page[] = [
  {
    href: "/mira/home",
    label: "Home",
    short: "Home",
    key: "home",
    icon: <path d="M4 10.2 12 4l8 6.2V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />,
  },
  {
    href: "/mira",
    label: "Chat with Mira",
    short: "Chat",
    key: "chats",
    icon: <path d="M20 11.5a7.5 7.5 0 0 1-10.9 6.7L4.5 19.5l1.2-4.1A7.5 7.5 0 1 1 20 11.5z" />,
  },
  {
    href: "/mira/journal",
    label: "Daily journal",
    short: "Journal",
    key: "journal",
    icon: (
      <>
        <rect x="4.5" y="3.5" width="15" height="17" rx="1.5" />
        <path d="M8.5 3.5v17M12 8h4M12 11.5h4" />
      </>
    ),
  },
  {
    href: "/mira/goals",
    label: "Challenges & goals",
    short: "Goals",
    key: "goals",
    icon: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <circle cx="12" cy="12" r="4.5" />
        <circle cx="12" cy="12" r="1" fill="currentColor" />
      </>
    ),
  },
  {
    href: "/mira/assessments",
    label: "Assessments",
    key: "assessments",
    icon: (
      <>
        <path d="M9 4.5H7.5A1.5 1.5 0 0 0 6 6v13.5A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H15" />
        <rect x="9" y="3" width="6" height="3" rx="1" />
        <path d="m9.5 13.5 2 2 3.5-4" />
      </>
    ),
  },
  {
    href: "/mira/recordings",
    label: "Voice sessions",
    key: "recordings",
    icon: <path d="M3.5 10.5v3M7.5 7v10M12 4v16M16.5 8v8M20.5 10.5v3" />,
  },
  {
    href: "/mira/coaches",
    label: "Coaches",
    key: "coaches",
    icon: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M3 20a6 6 0 0 1 12 0M16 4.6a3.5 3.5 0 0 1 0 6.8M17 14.3a6 6 0 0 1 4 5.7" />
      </>
    ),
  },
  // NEXT_PUBLIC_MIRA_GUIDE_URL can point the guide elsewhere (inlined at build time).
  {
    href: process.env.NEXT_PUBLIC_MIRA_GUIDE_URL || "/mira/guide",
    label: "Guide",
    key: "guide",
    icon: (
      <path d="M12 6.5C10.5 5 8.3 4.5 4 4.5v14c4.3 0 6.5.5 8 2 1.5-1.5 3.7-2 8-2v-14c-4.3 0-6.5.5-8 2zM12 6.5v14" />
    ),
  },
  {
    href: "/mira/settings",
    label: "Settings",
    key: "settings",
    icon: (
      <>
        <path d="M10.22 4.82 10.42 2.53h3.16l.2 2.29a7.4 7.4 0 0 1 2.04.84l1.76-1.47 2.23 2.23-1.47 1.76a7.4 7.4 0 0 1 .84 2.04l2.29.2v3.16l-2.29.2a7.4 7.4 0 0 1-.84 2.04l1.47 1.76-2.23 2.23-1.76-1.47a7.4 7.4 0 0 1-2.04.84l-.2 2.29h-3.16l-.2-2.29a7.4 7.4 0 0 1-2.04-.84l-1.76 1.47-2.23-2.23 1.47-1.76a7.4 7.4 0 0 1-.84-2.04l-2.29-.2v-3.16l2.29-.2a7.4 7.4 0 0 1 .84-2.04L4.19 6.42l2.23-2.23 1.76 1.47a7.4 7.4 0 0 1 2.04-.84z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
  },
];

const MORE_ICON = (
  <>
    <circle cx="5.5" cy="12" r="1.3" fill="currentColor" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" />
    <circle cx="18.5" cy="12" r="1.3" fill="currentColor" />
  </>
);

/** One stroke, like the chat's icons. */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/**
 * A place on the menu: on phones a cell of the bottom bar (the icon in a soft pill, the short name
 * under it, the whole cell the target); from lg a row of the side menu, as before.
 */
const PLACE = `flex h-full flex-col items-center justify-center gap-1 whitespace-nowrap rounded-2xl text-[12px] leading-none transition-colors outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ap-purple lg:h-auto lg:flex-row lg:justify-start lg:rounded-xl lg:px-3 lg:py-2 lg:text-[14px] lg:leading-normal`;
const placeClass = (on: boolean) =>
  `${PLACE} ${
    on
      ? "font-bold text-ap-ink lg:bg-ap-ground lg:font-semibold"
      : "font-medium text-ap-muted hover:text-ap-ink lg:font-normal lg:hover:bg-ap-ground"
  }`;
/** The pill behind a bar icon: filled on the current place. */
const pill = (on: boolean) =>
  `flex h-8 w-14 items-center justify-center rounded-full transition-colors lg:hidden ${
    on ? "bg-ap-mist" : ""
  }`;

/**
 * The signed-in frame of boards 08 to 10, in the calm chat's language: a banner with the logo and
 * the menu, the page, and a foot with the beta note, the support line and the legal links.
 *
 * Phones (round-2 decision 8, 22 Nov 2026): the menu is a bar fixed to the bottom with Home, Chat,
 * Journal, Goals and More, which opens a sheet with the other pages. It keeps clear of the home
 * indicator and the notch (safe areas) and steps up over the cookie banner while it shows
 * (--liq-consent-h); its height grows with the text size (--mira-bar), and the page leaves that
 * much room under its foot, so the bar never covers it. The chat (/mira) has no frame: its own
 * full-screen header and composer stay as they are. From lg the menu is the side column it was.
 */
export function MiraAppFrame({
  active,
  email,
  name,
  children,
}: {
  /** The page shown, marked in the menu; none for a page outside it (not found, an error). */
  active?: MiraPage;
  email?: string;
  name?: string | null;
  children: ReactNode;
}) {
  const [support, setSupport] = useState(false);
  const [more, setMore] = useState(false);
  const country = useSupportCountry();
  useReloadWhenRestored();
  const inMore = PAGES.some((p) => !p.short && p.key === active);
  return (
    <div className="flex min-h-screen flex-col bg-white pb-[calc(var(--mira-bar)+env(safe-area-inset-bottom)+var(--liq-consent-h,0px))] font-sans text-ap-ink selection:bg-ap-lilac [--mira-bar:calc(60px*var(--mira-fs,1))] lg:flex-row lg:pb-0">
      <header className="lg:flex lg:w-[248px] lg:shrink-0 lg:flex-col lg:gap-6 lg:border-r lg:border-ap-line lg:px-5 lg:py-6">
        <div className="px-4 pt-3 sm:px-10 lg:p-0">
          <Wordmark home />
        </div>
        <nav
          aria-label="Mira"
          className="fixed inset-x-0 bottom-[var(--liq-consent-h,0px)] z-30 border-t border-ap-line bg-white pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] lg:static lg:z-auto lg:border-t-0 lg:bg-transparent lg:p-0"
        >
          <ul className="mx-auto grid h-[var(--mira-bar)] max-w-[560px] grid-cols-5 px-1 lg:flex lg:h-auto lg:max-w-none lg:flex-col lg:gap-0.5 lg:px-0">
            {PAGES.map((p) => {
              const on = p.key === active;
              return (
                <li key={p.key} className={p.short ? "py-1 lg:py-0" : "hidden lg:block"}>
                  <Link
                    href={p.href}
                    aria-current={on ? "page" : undefined}
                    className={placeClass(on)}
                  >
                    <span aria-hidden="true" className={pill(on)}>
                      <Icon>{p.icon}</Icon>
                    </span>
                    <span className="lg:hidden">{p.short}</span>
                    <span className="hidden lg:inline">{p.label}</span>
                  </Link>
                </li>
              );
            })}
            <li className="py-1 lg:hidden">
              <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={more}
                onClick={() => setMore(true)}
                className={`${placeClass(inMore)} w-full`}
              >
                <span aria-hidden="true" className={pill(inMore)}>
                  <Icon>{MORE_ICON}</Icon>
                </span>
                More
              </button>
            </li>
          </ul>
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
      </header>
      <div className="flex min-w-0 flex-1 flex-col">
        <main id="main-content" className="flex-1 px-4 pt-7 sm:px-10 lg:pt-10">
          <div className="max-w-[860px]">{children}</div>
        </main>
        <footer className="mt-12 px-4 pb-7 text-[12px] leading-relaxed text-ap-muted sm:px-10 lg:pb-10">
          <div className="max-w-[760px]">
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
          </div>
        </footer>
      </div>
      {more ? (
        <MoreSheet
          active={active}
          onClose={() => setMore(false)}
          onSupport={() => {
            setMore(false);
            setSupport(true);
          }}
        />
      ) : null}
      {support ? (
        <SupportPanel
          highlight={country ? { code: country } : null}
          onClose={() => setSupport(false)}
        />
      ) : null}
    </div>
  );
}

/** The bar's More (phones): the pages without a place on the bar, and the support line. */
function MoreSheet({
  active,
  onClose,
  onSupport,
}: {
  active?: MiraPage;
  onClose: () => void;
  onSupport: () => void;
}) {
  return (
    <Modal label="More" onClose={onClose}>
      <h2 data-autofocus tabIndex={-1} className="font-serif text-[24px] font-medium outline-none">
        More
      </h2>
      <ul className="-mx-2 mt-3 flex flex-col gap-0.5">
        {PAGES.filter((p) => !p.short).map((p) => {
          const on = p.key === active;
          return (
            <li key={p.key}>
              <Link
                href={p.href}
                aria-current={on ? "page" : undefined}
                onClick={onClose}
                className={`flex min-h-[52px] items-center gap-3 rounded-2xl px-3 text-[16px] transition-colors ${
                  on ? "bg-ap-ground font-semibold" : "hover:bg-ap-ground"
                } ${FOCUS_RING}`}
              >
                <span aria-hidden="true" className={on ? "text-ap-ink" : "text-ap-muted"}>
                  <Icon>{p.icon}</Icon>
                </span>
                {p.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ap-line pt-4">
        <button
          type="button"
          onClick={onSupport}
          className={`min-h-[44px] text-[14px] text-ap-plum underline ${FOCUS_RING}`}
        >
          Need support right now?
        </button>
        <button
          type="button"
          onClick={onClose}
          className={`ml-auto min-h-[44px] rounded-full border border-ap-line px-5 text-[15px] font-semibold ${FOCUS_RING}`}
        >
          Close
        </button>
      </div>
    </Modal>
  );
}
