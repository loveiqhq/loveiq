"use client";

import { useEffect, useRef, type ReactNode } from "react";
import crisisJson from "@features/mira/content/crisis-lines.json";

/**
 * One support line (content/crisis-lines.json, each checked on its operator's site): a number to
 * call and/or to text (with the word to send, where the service asks for one), who it is for
 * when that isn't everyone, its hours and its website.
 */
export type SupportLine = {
  name: string;
  who?: string;
  phone?: string;
  text?: string;
  keyword?: string;
  hours?: string;
  note?: string;
  url?: string;
};
export type SupportCountry = {
  code: string;
  name: string;
  lines: SupportLine[];
  emergency?: string;
};
const DATA = crisisJson as unknown as { countries: SupportCountry[]; fallback: SupportCountry };
const digits = (n: string) => n.replace(/[^\d+]/g, "");
const LINK = "font-semibold text-ap-link underline";

/** "Shout: text SHOUT to 85258 · 24/7 · website", with call and text links that work on phones. */
function LineItem({ line: l }: { line: SupportLine }) {
  return (
    <li>
      <span className="font-semibold text-ap-ink">{l.name}</span>
      {l.who ? <span className="text-ap-muted"> ({l.who})</span> : null}
      {l.phone || l.text ? ": " : null}
      {l.phone ? (
        <>
          call{" "}
          <a href={`tel:${digits(l.phone)}`} className={LINK}>
            {l.phone}
          </a>
        </>
      ) : null}
      {l.phone && l.text ? " or " : null}
      {l.text ? (
        <>
          text {l.keyword ? <strong>{l.keyword}</strong> : null}
          {l.keyword ? " to " : null}
          <a href={`sms:${digits(l.text)}`} className={LINK}>
            {l.text}
          </a>
        </>
      ) : null}
      {l.hours ? <span className="text-ap-muted"> · {l.hours}</span> : null}
      {l.url ? (
        <>
          {" · "}
          <a href={l.url} target="_blank" rel="noopener noreferrer" className="underline">
            website
          </a>
        </>
      ) : null}
      {l.note ? <span className="block text-[13px] text-ap-muted">{l.note}</span> : null}
    </li>
  );
}

/**
 * Mira's panels, on the native <dialog>: showModal() keeps focus inside and the page behind
 * inert, Escape (or Android's back) closes it, the page can't scroll behind it, focus starts on
 * the element marked data-autofocus (the heading) and goes back to the opener on close. Shown
 * while mounted: the parent unmounts it to close. The opener is the focused control, or, when the
 * page itself has the focus (a tap in WebKit focuses no button), the control the tap landed on.
 *
 * When closing removed the opener (a save swapped "Do today’s check-in" for "Edit today’s
 * check-in", A11Y-2), focus goes to the control now in its place in its section (a header, footer
 * or menu counts as one; the main part's first control when no opener is known), unless the caller
 * placed it meanwhile: never to the page itself. `closeOnBackdrop`: a tap on the dimmed page closes
 * it too, for a sheet that guards nothing (the phone's More); never a delete, a consent, answers
 * not saved yet or the support lines.
 */
let openDialogs = 0;
const CONTROLS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
/** What the last click landed on: a panel's opener when the click focused nothing (WebKit). */
let clicked: Element | null = null;
if (typeof document !== "undefined") {
  document.addEventListener(
    "click",
    (e) => {
      clicked = e.target instanceof Element ? e.target : null;
    },
    true
  );
}

export function Modal({
  label,
  onClose,
  closeOnBackdrop = false,
  children,
}: {
  label: string;
  onClose: () => void;
  closeOnBackdrop?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const focused = document.activeElement;
    const opener =
      focused instanceof HTMLElement && focused !== document.body
        ? focused
        : clicked?.isConnected
          ? clicked.closest<HTMLElement>(CONTROLS)
          : null;
    // Where the opener sits, should closing replace it: its section (or the main part, with no
    // opener known) and its place among the section's controls (the dialog's own left out).
    const home =
      (opener ?? document.querySelector("main"))?.closest<HTMLElement>(
        "section, article, form, main, header, footer, nav"
      ) ?? null;
    const controls = () =>
      home
        ? [...home.querySelectorAll<HTMLElement>(CONTROLS)].filter((c) => !dialog.contains(c))
        : [];
    const place = opener ? controls().indexOf(opener) : -1;
    // One lock for however many panels are open, released when the last one closes.
    const root = document.documentElement;
    if (openDialogs++ === 0) root.style.overflow = "hidden";
    // A browser without showModal (Safari before 15.4) still shows the panel, just not modal.
    const modal = typeof dialog.showModal === "function";
    if (!modal) dialog.setAttribute("open", "");
    else if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      if (--openDialogs === 0) root.style.overflow = "";
      if (modal && dialog.open) dialog.close();
      if (opener?.isConnected) return opener.focus();
      // A frame later, so a caller (or a panel opening next) that put the focus anywhere since
      // has had its say. A section that went too (the page changed) is left to the page showing.
      let moved = false;
      const mark = () => (moved = true);
      document.addEventListener("focusin", mark);
      requestAnimationFrame(() => {
        document.removeEventListener("focusin", mark);
        const now = document.activeElement;
        if (moved || (now && now !== document.body) || !home?.isConnected) return;
        const left = controls();
        left[Math.min(Math.max(place, 0), left.length - 1)]?.focus();
      });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // The backdrop's taps reach the dialog itself, outside its box (its padding is inside).
        // ponytail: a text drag from inside that ends on the backdrop closes it too; check where
        // the press began as well if that ever matters.
        if (!closeOnBackdrop || e.target !== e.currentTarget) return;
        const box = e.currentTarget.getBoundingClientRect();
        const { clientX: x, clientY: y } = e;
        if (x < box.left || x > box.right || y < box.top || y > box.bottom) onClose();
      }}
      // On phones it sits on the bottom bar where the page has one (--mira-dock, MiraAppFrame), so
      // the bar's labels never show cut beneath it (round-3 R3-UXA-12); elsewhere 1rem above the
      // edge, as before. From sm it is centred.
      className="mb-[var(--mira-dock,1rem)] mt-auto max-h-[calc(100dvh-var(--mira-dock,1rem)-1.5rem)] w-[calc(100%-2rem)] max-w-[560px] overflow-y-auto rounded-3xl bg-white p-6 text-ap-ink shadow-xl backdrop:bg-black/30 sm:mb-auto sm:max-h-[90dvh]"
    >
      {children}
    </dialog>
  );
}

/**
 * "Need support right now?" and the crisis panel. `highlight`'s country comes first: the one the
 * server named when Mira's safety rule fired, else the account's "Where you're based" (its hint
 * promises that country's lines first; round-2 audit SET-9), and "Somewhere else" first for a
 * country not on the list. Every other country's lines follow, so nobody is left with the wrong
 * list. `children`, when given, come first under the heading: the words for
 * the moment that opened it (the mood check's question 9, ui/checks/CheckPage.tsx).
 */
export function SupportPanel({
  highlight,
  onClose,
  children,
}: {
  highlight: Pick<SupportCountry, "code"> | null;
  onClose: () => void;
  children?: ReactNode;
}) {
  // A listed country moves to the top; anyone elsewhere sees "Somewhere else" first instead.
  const top = DATA.countries.find((c) => c.code === highlight?.code);
  const ordered = top ? [top, ...DATA.countries.filter((c) => c !== top)] : DATA.countries;
  const elsewhereFirst = Boolean(highlight) && !top;
  const elsewhere = (
    <section aria-label={DATA.fallback.name}>
      <h3 className="text-[14px] font-bold">{DATA.fallback.name}</h3>
      <ul className="mt-1 flex flex-col gap-1.5 text-[14px] text-ap-body">
        {DATA.fallback.lines.map((l) => (
          <LineItem key={l.name} line={l} />
        ))}
      </ul>
    </section>
  );
  return (
    <Modal label="Support right now" onClose={onClose}>
      <h2 data-autofocus tabIndex={-1} className="font-serif text-[24px] font-medium outline-none">
        Support right now
      </h2>
      {children}
      <p className="mt-1 text-[14px] leading-relaxed text-ap-body">
        If you might hurt yourself or are in danger, call your local emergency number now. You can
        also call or text one of these lines.
      </p>
      <div className="mt-4 flex flex-col gap-4">
        {elsewhereFirst ? elsewhere : null}
        {ordered.map((c) => (
          <section key={c.code} aria-label={c.name}>
            <h3 className="text-[14px] font-bold">
              {c.name}
              {c.emergency ? (
                <span className="font-normal text-ap-muted"> · emergency {c.emergency}</span>
              ) : null}
            </h3>
            <ul className="mt-1 flex flex-col gap-1.5 text-[14px] text-ap-body">
              {c.lines.map((l) => (
                <LineItem key={l.name} line={l} />
              ))}
            </ul>
          </section>
        ))}
        {elsewhereFirst ? null : elsewhere}
      </div>
      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] rounded-full border border-ap-line px-5 text-[15px] font-semibold"
        >
          Close
        </button>
      </div>
    </Modal>
  );
}
