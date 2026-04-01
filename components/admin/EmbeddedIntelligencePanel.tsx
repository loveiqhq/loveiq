"use client";

import { useMemo, useState } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import { getCsrfToken } from "@/lib/csrf-client";
import type {
  AdminIntelligenceDraft,
  AdminIntelligenceSnapshot,
  AdminIntelligenceSurface,
  AdminIntelligenceTone,
} from "@/lib/admin/intelligence-types";

function toneClasses(tone: AdminIntelligenceTone): string {
  if (tone === "good") return "border-emerald-500/20 bg-emerald-500/5";
  if (tone === "risk") return "border-red-500/20 bg-red-500/5";
  if (tone === "watch") return "border-amber-500/20 bg-amber-500/5";
  return "border-white/10 bg-white/5";
}

function toneBadgeClasses(tone: AdminIntelligenceTone): string {
  if (tone === "good") return "bg-emerald-500/10 text-emerald-300";
  if (tone === "risk") return "bg-red-500/10 text-red-300";
  if (tone === "watch") return "bg-amber-500/10 text-amber-200";
  return "bg-white/10 text-text-muted";
}

interface EmbeddedIntelligencePanelProps {
  surface: AdminIntelligenceSurface;
  days?: number;
  title?: string;
  endpoint?: string;
}

export default function EmbeddedIntelligencePanel({
  surface,
  days = 30,
  title,
  endpoint = "/api/admin/intelligence",
}: EmbeddedIntelligencePanelProps) {
  const params = useMemo(() => ({ surface, days: String(days) }), [days, surface]);
  const { data, loading, error } = useAdminFetch<AdminIntelligenceSnapshot>(endpoint, params);
  const [creatingDraftId, setCreatingDraftId] = useState<string | null>(null);
  const [draftMessage, setDraftMessage] = useState<{
    itemId: string;
    type: "success" | "error";
    text: string;
  } | null>(null);

  async function createActionFromDraft(itemId: string, draft: AdminIntelligenceDraft) {
    if (!draft.actionSeed) return;
    setCreatingDraftId(itemId);
    setDraftMessage(null);

    try {
      const response = await fetch("/api/admin/actions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({
          title: draft.actionSeed.title,
          description: draft.actionSeed.description,
          source_type: draft.actionSeed.sourceType,
          metric_key: draft.actionSeed.metricKey,
          expected_impact: draft.actionSeed.expectedImpact,
          linked_href: draft.actionSeed.linkedHref,
        }),
      });

      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(body?.error || "Unable to create action.");
      }

      setDraftMessage({
        itemId,
        type: "success",
        text: "Action created from intelligence draft.",
      });
    } catch (err) {
      setDraftMessage({
        itemId,
        type: "error",
        text: err instanceof Error ? err.message : "Unable to create action.",
      });
    } finally {
      setCreatingDraftId(null);
    }
  }

  if (loading) {
    return (
      <section className="rounded-xl border border-white/10 bg-surface p-5">
        <div className="flex items-center justify-center py-10">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
        </div>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="rounded-xl border border-red-500/20 bg-red-500/5 p-5 text-sm text-red-300">
        {error || "Unable to load admin intelligence."}
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-white/10 bg-surface p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">
            Admin Intelligence
          </p>
          <h3 className="mt-2 font-serif text-2xl font-semibold text-text-primary">
            {title || data.title}
          </h3>
          <p className="mt-2 max-w-4xl text-sm text-text-muted">{data.headline}</p>
          <p className="mt-2 max-w-4xl text-sm text-text-muted">{data.summary}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.prompts.map((prompt) => (
            <span
              key={prompt.query}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-text-muted"
            >
              {prompt.label}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-5 space-y-5">
        {data.sections.map((section) => (
          <div key={section.key}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="font-semibold text-text-primary">{section.title}</h4>
                <p className="mt-1 text-sm text-text-muted">{section.summary}</p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-text-muted">
                {section.items.length} signals
              </span>
            </div>

            <div className="mt-3 grid gap-4 xl:grid-cols-2">
              {section.items.map((item) => (
                <article
                  key={item.id}
                  className={`rounded-xl border p-4 ${toneClasses(item.tone)}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h5 className="font-medium text-text-primary">{item.title}</h5>
                        <span
                          className={`rounded-full px-2 py-1 text-[11px] font-medium ${toneBadgeClasses(item.tone)}`}
                        >
                          {item.confidence} confidence
                        </span>
                        {item.draft && (
                          <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] text-text-muted">
                            {item.draft.kind}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-sm text-text-muted">{item.detail}</p>
                    </div>
                    <a
                      href={item.href}
                      className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-text-muted transition hover:bg-white/5 hover:text-text-primary"
                    >
                      Open
                    </a>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.capabilities.map((capability) => (
                      <span
                        key={capability}
                        className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-text-muted"
                      >
                        {capability}
                      </span>
                    ))}
                  </div>

                  <div className="mt-4 rounded-lg border border-white/10 bg-page px-3 py-3">
                    <p className="text-[11px] uppercase tracking-wide text-text-muted">
                      Recommendation
                    </p>
                    <p className="mt-1 text-sm text-text-primary">{item.recommendation}</p>
                  </div>

                  {item.caveat && (
                    <div className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                      <p className="text-[11px] uppercase tracking-wide text-text-muted">Caveat</p>
                      <p className="mt-1 text-sm text-text-muted">{item.caveat}</p>
                    </div>
                  )}

                  {item.evidence.length > 0 && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {item.evidence.map((evidence, index) => (
                        <a
                          key={`${item.id}-${evidence.label}-${index}`}
                          href={evidence.href}
                          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 transition hover:border-white/20 hover:bg-white/10"
                        >
                          <p className="text-[11px] uppercase tracking-wide text-text-muted">
                            {evidence.label}
                          </p>
                          <p className="mt-1 text-sm text-text-primary">{evidence.value}</p>
                        </a>
                      ))}
                    </div>
                  )}

                  {item.draft?.actionSeed && (
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        disabled={creatingDraftId === item.id}
                        onClick={() =>
                          void createActionFromDraft(item.id, item.draft as AdminIntelligenceDraft)
                        }
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {creatingDraftId === item.id ? "Creating..." : "Create action"}
                      </button>
                      {draftMessage?.itemId === item.id && (
                        <p
                          className={`text-xs ${draftMessage.type === "success" ? "text-emerald-300" : "text-red-300"}`}
                        >
                          {draftMessage.text}
                        </p>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
