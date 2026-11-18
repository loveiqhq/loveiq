"use client";

import crisisJson from "@features/mira/content/crisis-lines.json";

type Line = { name: string; phone?: string; hours?: string; url?: string };
type Country = { code: string; name: string; lines: Line[]; emergency?: string };
const DATA = crisisJson as unknown as { countries: Country[]; fallback: Country };

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
  // Only a listed country moves to the top; "Somewhere else" already closes the list.
  const top = DATA.countries.find((c) => c.code === highlight?.code);
  const ordered = top ? [top, ...DATA.countries.filter((c) => c !== top)] : DATA.countries;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Support right now"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center"
    >
      <div className="max-h-[90vh] w-full max-w-[560px] overflow-y-auto rounded-3xl bg-white p-6 shadow-xl">
        <h2 className="font-serif text-[24px] font-medium">Support right now</h2>
        <p className="mt-1 text-[14px] leading-relaxed text-ap-body">
          If you might hurt yourself or are in danger, call your local emergency number now. You can
          also call one of these lines.
        </p>
        <div className="mt-4 flex flex-col gap-4">
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
          <section aria-label={DATA.fallback.name}>
            <h3 className="text-[14px] font-bold">{DATA.fallback.name}</h3>
            <ul className="mt-1 flex flex-col gap-1 text-[14px] text-ap-body">
              {DATA.fallback.lines.map((l) => (
                <li key={l.name}>
                  {l.name}
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
      </div>
    </div>
  );
}
