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
 * while mounted: the parent unmounts it to close.
 */
let openDialogs = 0;

export function Modal({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
      opener?.focus();
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
      className="mb-4 mt-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-[560px] overflow-y-auto rounded-3xl bg-white p-6 text-ap-ink shadow-xl backdrop:bg-black/30 sm:mb-auto"
    >
      {children}
    </dialog>
  );
}

/**
 * "Need support right now?" and the crisis panel. When Mira's safety rule fired, the person's
 * country (from the server) comes first; every other country's lines follow, so nobody is
 * left with the wrong list. `children`, when given, come first under the heading: the words for
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
