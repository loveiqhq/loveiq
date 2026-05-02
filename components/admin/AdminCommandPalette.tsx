"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { AdminCommandAnswer } from "@/lib/admin/intelligence-types";
import type { AdminKnowledgeSnapshot } from "@/lib/admin/knowledge-types";

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

interface CommandThreadEntry {
  id: string;
  query: string;
  loading: boolean;
  error: string | null;
  answer: AdminCommandAnswer | null;
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

function createThreadId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function confidenceTone(confidence: AdminCommandAnswer["confidence"]) {
  if (confidence === "high") return "text-emerald-300";
  if (confidence === "medium") return "text-amber-300";
  return "text-red-300";
}

export default function AdminCommandPalette({ open, onOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [payload, setPayload] = useState<SearchPayload>({ pages: [], results: [] });
  const [knowledgeSnapshot, setKnowledgeSnapshot] = useState<AdminKnowledgeSnapshot | null>(null);
  const [chatHistory, setChatHistory] = useState<CommandThreadEntry[]>([]);
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

  useEffect(() => {
    if (!open) return;
    if (deferredQuery.trim().length < 3) return;

    let cancelled = false;
    fetch(
      `/api/admin/knowledge?q=${encodeURIComponent(deferredQuery)}&surface=command-center&days=30`
    )
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error((body as { error?: string } | null)?.error || "Knowledge failed.");
        }
        return res.json();
      })
      .then((json) => {
        if (!cancelled) {
          setKnowledgeSnapshot(json as AdminKnowledgeSnapshot);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setKnowledgeSnapshot(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [deferredQuery, open]);

  const runCommand = (nextQuery: string) => {
    const trimmed = nextQuery.trim();
    if (trimmed.length < 2) return;

    const id = createThreadId();
    setChatHistory((current) => [
      ...current,
      {
        id,
        query: trimmed,
        loading: true,
        error: null,
        answer: null,
      },
    ]);

    fetch(`/api/admin/command?q=${encodeURIComponent(trimmed)}&surface=command-center&days=30`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error((body as { error?: string } | null)?.error || "Command failed.");
        }
        return res.json();
      })
      .then((json) => {
        setChatHistory((current) =>
          current.map((entry) =>
            entry.id === id
              ? {
                  ...entry,
                  loading: false,
                  answer: json as AdminCommandAnswer,
                }
              : entry
          )
        );
      })
      .catch((error: unknown) => {
        setChatHistory((current) =>
          current.map((entry) =>
            entry.id === id
              ? {
                  ...entry,
                  loading: false,
                  error: error instanceof Error ? error.message : "Command failed.",
                }
              : entry
          )
        );
      });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    runCommand(query);
  };

  const handlePromptClick = (promptQuery: string) => {
    startTransition(() => setQuery(promptQuery));
    runCommand(promptQuery);
  };

  const localMatches = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    if (!needle) return QUICK_ACTIONS;
    return QUICK_ACTIONS.filter((item) =>
      [item.title, ...item.keywords].some((value) => matches(value, needle))
    );
  }, [deferredQuery]);

  const visiblePayload = deferredQuery.trim().length < 2 ? { pages: [], results: [] } : payload;
  const visibleKnowledgeSnapshot = deferredQuery.trim().length < 3 ? null : knowledgeSnapshot;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="mx-auto mt-12 w-full max-w-6xl px-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0c111d] shadow-2xl shadow-black/40">
          <div className="border-b border-white/10 px-5 py-4">
            <form
              onSubmit={handleSubmit}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
            >
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
                placeholder="Ask leadership questions, search memory, or open an admin surface"
                className="w-full bg-transparent text-sm text-text-primary placeholder-text-muted/60 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-medium text-text-primary transition hover:bg-white/15"
              >
                Ask
              </button>
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-text-muted">
                Esc
              </span>
            </form>
          </div>

          <div className="grid gap-6 px-5 py-5 xl:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-5">
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

              {visibleKnowledgeSnapshot && visibleKnowledgeSnapshot.artifacts.length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-text-muted">
                    Knowledge Hits
                  </p>
                  <div className="mt-3 space-y-2">
                    {visibleKnowledgeSnapshot.artifacts.slice(0, 4).map((artifact) => (
                      <a
                        key={artifact.id}
                        href={artifact.href}
                        className="block rounded-2xl border border-white/10 bg-white/5 px-4 py-3 transition hover:border-white/20 hover:bg-white/[0.07]"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-text-primary">{artifact.title}</p>
                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-text-muted">
                            {artifact.type}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-text-muted">{artifact.summary}</p>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-5">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-text-muted">
                  Executive Command Chat
                </p>
                <div className="mt-3 space-y-3">
                  {chatHistory.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-text-muted">
                      Ask a leadership question to get a grounded answer with cross-surface
                      intelligence, memory artifacts, and citations.
                    </div>
                  )}

                  {chatHistory.map((entry) => (
                    <div key={entry.id} className="space-y-3">
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.24em] text-text-muted">
                          You asked
                        </p>
                        <p className="mt-2 text-sm font-medium text-text-primary">{entry.query}</p>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-[#11192b] px-4 py-4">
                        {entry.loading && (
                          <div className="flex items-center gap-3 text-sm text-text-muted">
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
                            Building a grounded answer...
                          </div>
                        )}

                        {!entry.loading && entry.error && (
                          <p className="text-sm text-red-300">{entry.error}</p>
                        )}

                        {!entry.loading && entry.answer && (
                          <div className="space-y-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-text-muted">
                                command-center
                              </span>
                              <span
                                className={`rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] ${confidenceTone(entry.answer.confidence)}`}
                              >
                                {entry.answer.confidence} confidence
                              </span>
                            </div>
                            <p className="text-sm font-medium leading-6 text-text-primary">
                              {entry.answer.answer}
                            </p>

                            {entry.answer.supportingItems.length > 0 && (
                              <div>
                                <p className="text-[11px] uppercase tracking-[0.24em] text-text-muted">
                                  Supporting Sources
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {entry.answer.supportingItems.map((item) => (
                                    <a
                                      key={`${entry.id}-${item.href}-${item.title}`}
                                      href={item.href}
                                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-text-muted transition hover:bg-white/10 hover:text-text-primary"
                                    >
                                      {item.capability}: {item.title}
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}

                            {entry.answer.citations.length > 0 && (
                              <div className="grid gap-2 sm:grid-cols-2">
                                {entry.answer.citations.map((citation, index) => (
                                  <a
                                    key={`${entry.id}-${citation.label}-${index}`}
                                    href={citation.href}
                                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 transition hover:border-white/20 hover:bg-white/[0.07]"
                                  >
                                    <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">
                                      {citation.label}
                                    </p>
                                    <p className="mt-1 text-sm text-text-primary">
                                      {citation.value}
                                    </p>
                                  </a>
                                ))}
                              </div>
                            )}

                            {entry.answer.suggestedPrompts.length > 0 && (
                              <div>
                                <p className="text-[11px] uppercase tracking-[0.24em] text-text-muted">
                                  Follow-ups
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {entry.answer.suggestedPrompts.map((prompt) => (
                                    <button
                                      key={`${entry.id}-${prompt.query}`}
                                      type="button"
                                      onClick={() => handlePromptClick(prompt.query)}
                                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-text-muted transition hover:bg-white/10 hover:text-text-primary"
                                    >
                                      {prompt.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
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
    </div>
  );
}
