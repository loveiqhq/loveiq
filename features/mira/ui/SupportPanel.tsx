"use client";

import { useEffect, useRef, type ReactNode } from "react";
import crisisJson from "@features/mira/content/crisis-lines.json";

type Line = { name: string; phone?: string; hours?: string; url?: string };
type Country = { code: string; name: string; lines: Line[]; emergency?: string };
const DATA = crisisJson as unknown as { countries: Country[]; fallback: Country };

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
 * left with the wrong list.
 */
export function SupportPanel({
  highlight,
  onClose,
}: {
  highlight: Country | null;
  onClose: () => void;
}) {
  // A listed country moves to the top; anyone elsewhere sees "Somewhere else" first instead.
  const top = DATA.countries.find((c) => c.code === highlight?.code);
  const ordered = top ? [top, ...DATA.countries.filter((c) => c !== top)] : DATA.countries;
  const elsewhereFirst = Boolean(highlight) && !top;
  const elsewhere = (
    <section aria-label={DATA.fallback.name}>
      <h3 className="text-[14px] font-bold">{DATA.fallback.name}</h3>
      <ul className="mt-1 flex flex-col gap-1 text-[14px] text-ap-body">
        {DATA.fallback.lines.map((l) => (
          <li key={l.name}>
            {l.name}
            {l.url ? (
              <>
                {" · "}
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="underline">
                  website
                </a>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
  return (
    <Modal label="Support right now" onClose={onClose}>
      <h2 data-autofocus tabIndex={-1} className="font-serif text-[24px] font-medium outline-none">
        Support right now
      </h2>
      <p className="mt-1 text-[14px] leading-relaxed text-ap-body">
        If you might hurt yourself or are in danger, call your local emergency number now. You can
        also call one of these lines.
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
            <ul className="mt-1 flex flex-col gap-1 text-[14px] text-ap-body">
              {c.lines.map((l) => (
                <li key={l.name}>
                  {l.name}
                  {l.phone ? (
                    <>
                      {" "}
                      <a
                        href={`tel:${l.phone.replace(/[^\d+]/g, "")}`}
                        className="font-semibold text-[#561dbd] underline"
                      >
                        {l.phone}
                      </a>
                    </>
                  ) : null}
                  {l.hours ? <span className="text-ap-muted"> ({l.hours})</span> : null}
                  {l.url ? (
                    <>
                      {" · "}
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        website
                      </a>
                    </>
                  ) : null}
                </li>
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
