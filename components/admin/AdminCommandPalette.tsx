"use client";

import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

interface CommandPaletteProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}

interface SearchResult {
  type: string;
  title: string;
  snippet: string;
  href: string;
  meta: string;
}

interface SearchPayload {
  pages: Array<{ title: string; href: string; keywords?: string[] }>;
  results: SearchResult[];
}

const QUICK_ACTIONS = [
  { title: "Open Org Directory", href: "/admin/org", keywords: ["ownership", "assets"] },
  { title: "Open Strategy Hub", href: "/admin/strategy", keywords: ["guardrails", "triage"] },
  { title: "Generate Executive Memo", href: "/admin/report-builder", keywords: ["memo", "report"] },
  {
    title: "Review Decision Journal",
    href: "/admin/changelog",
    keywords: ["decision", "governance"],
  },
  { title: "Inspect Fraud Signals", href: "/admin/risk-score", keywords: ["fraud", "duplicate"] },
  { title: "Check Tracking Health", href: "/admin/health", keywords: ["integration", "tracking"] },
];

function matches(text: string, query: string) {
  return text.toLowerCase().includes(query.toLowerCase());
}

export default function AdminCommandPalette({ open, onOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [payload, setPayload] = useState<SearchPayload>({ pages: [], results: [] });
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (!open) onOpen();
      }
      if (event.key === "Escape" && open) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, onOpen]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (deferredQuery.trim().length < 2) return;

    let cancelled = false;
    fetch(`/api/admin/search/semantic?q=${encodeURIComponent(deferredQuery)}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error((body as { error?: string } | null)?.error || "Search failed.");
        }
        return res.json();
      })
      .then((json) => {
        if (!cancelled) {
          setPayload(json as SearchPayload);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPayload({ pages: [], results: [] });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [deferredQuery, open]);

  const localMatches = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    if (!needle) return QUICK_ACTIONS;
    return QUICK_ACTIONS.filter((item) =>
      [item.title, ...item.keywords].some((value) => matches(value, needle))
    );
  }, [deferredQuery]);

  const visiblePayload = deferredQuery.trim().length < 2 ? { pages: [], results: [] } : payload;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="mx-auto mt-16 w-full max-w-3xl px-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0c111d] shadow-2xl shadow-black/40">
          <div className="border-b border-white/10 px-5 py-4">
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <svg
                className="h-5 w-5 text-text-muted"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => startTransition(() => setQuery(event.target.value))}
                placeholder="Search submissions, decisions, themes, or admin pages"
                className="w-full bg-transparent text-sm text-text-primary placeholder-text-muted/60 focus:outline-none"
              />
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-text-muted">
                Esc
              </span>
            </div>
          </div>

          <div className="grid gap-6 px-5 py-5 lg:grid-cols-[300px_minmax(0,1fr)]">
            <div className="space-y-3">
              <p className="text-[11px] uppercase tracking-[0.24em] text-text-muted">
                Quick Actions
              </p>
              <div className="space-y-2">
                {localMatches.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className="block rounded-2xl border border-white/10 bg-white/5 px-4 py-3 transition hover:border-white/20 hover:bg-white/[0.07]"
                  >
                    <p className="text-sm font-medium text-text-primary">{item.title}</p>
                    <p className="mt-1 text-xs text-text-muted">{item.href}</p>
                  </a>
                ))}
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-text-muted">Pages</p>
                <div className="mt-3 space-y-2">
                  {visiblePayload.pages.map((page) => (
                    <a
                      key={page.href}
                      href={page.href}
                      className="block rounded-2xl border border-white/10 bg-white/5 px-4 py-3 transition hover:border-white/20 hover:bg-white/[0.07]"
                    >
                      <p className="text-sm font-medium text-text-primary">{page.title}</p>
                      <p className="mt-1 text-xs text-text-muted">{page.href}</p>
                    </a>
                  ))}
                  {deferredQuery.trim().length >= 2 && visiblePayload.pages.length === 0 && (
                    <p className="rounded-2xl border border-dashed border-white/10 px-4 py-3 text-sm text-text-muted">
                      No page matches for this search yet.
                    </p>
                  )}
                </div>
              </div>

              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-text-muted">
                  Semantic Results
                </p>
                <div className="mt-3 space-y-2">
                  {visiblePayload.results.map((item) => (
                    <a
                      key={`${item.type}-${item.href}-${item.title}`}
                      href={item.href}
                      className="block rounded-2xl border border-white/10 bg-white/5 px-4 py-3 transition hover:border-white/20 hover:bg-white/[0.07]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-text-primary">{item.title}</p>
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-text-muted">
                          {item.meta}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-text-muted">{item.snippet}</p>
                    </a>
                  ))}
                  {deferredQuery.trim().length >= 2 && visiblePayload.results.length === 0 && (
                    <p className="rounded-2xl border border-dashed border-white/10 px-4 py-3 text-sm text-text-muted">
                      No semantic matches yet. Try a question, theme, or admin object name.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
