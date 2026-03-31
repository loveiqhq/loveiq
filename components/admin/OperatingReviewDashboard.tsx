"use client";

import { useMemo, useState } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import StatCard from "@/components/admin/StatCard";
import TimeRangeSelector from "@/components/admin/TimeRangeSelector";
import type { AdminOsSnapshot } from "@/lib/admin/os-types";

interface ExecutiveMemoResponse {
  generatedAt: string;
  generatedBy: string;
  period: { days: number; since: string };
  headline: string;
  metrics: {
    submissions: { current: number; prior: number; delta: number };
    completionRate: { current: number; prior: number; delta: number };
    waitlist: { current: number; prior: number; delta: number };
    activeExperiments: number;
    openInvestigations: number;
    reportCoverage: number;
    paidConversions: number;
  };
  sections: {
    wins: Array<{ title: string; detail: string; href: string }>;
    risks: Array<{ title: string; detail: string; href: string }>;
    watchlist: Array<{ title: string; detail: string; href: string }>;
    decisions: Array<{ title: string; detail: string; href: string }>;
    actions: Array<{ title: string; detail: string; href: string }>;
  };
  trust: {
    detail: string;
    warning: string | null;
    lastUpdated: string | null;
  };
}

interface ReviewQueueResponse {
  summary: {
    total: number;
    requested: number;
    inReview: number;
    approved: number;
    changesRequested: number;
    overdue: number;
  };
  items: Array<{
    id: number;
    title: string;
    status: string;
    impact_level: string;
    reviewer_email: string | null;
    due_date: string | null;
    source_href: string | null;
  }>;
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function SectionCard({
  title,
  items,
}: {
  title: string;
  items: Array<{ title: string; detail: string; href: string }>;
}) {
  return (
    <section>
      <h3 className="font-serif text-xl font-semibold text-text-primary">{title}</h3>
      <div className="mt-3 space-y-3">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-text-muted">
            No items for this section.
          </div>
        ) : (
          items.map((item) => (
            <a
              key={`${title}-${item.title}`}
              href={item.href}
              className="block rounded-xl border border-white/10 bg-surface p-4 transition hover:border-white/20"
            >
              <p className="font-medium text-text-primary">{item.title}</p>
              <p className="mt-2 text-sm text-text-muted">{item.detail}</p>
            </a>
          ))
        )}
      </div>
    </section>
  );
}

export default function OperatingReviewDashboard() {
  const [days, setDays] = useState(7);
  const memo = useAdminFetch<ExecutiveMemoResponse>("/api/admin/executive-memo", {
    days: String(days),
  });
  const os = useAdminFetch<AdminOsSnapshot>("/api/admin/os", { days: String(days) });
  const reviews = useAdminFetch<ReviewQueueResponse>("/api/admin/reviews");

  const loading = memo.loading || os.loading || reviews.loading;
  const error = memo.error || os.error || reviews.error;

  const agenda = useMemo(() => {
    if (!memo.data || !os.data || !reviews.data) return [];
    return [
      {
        title: "North-star state",
        detail: memo.data.headline,
        href: "/admin",
      },
      {
        title: "Risks to cover",
        detail:
          memo.data.sections.risks[0]?.detail ||
          os.data.watchlist[0]?.detail ||
          "No major risks surfaced in the selected window.",
        href: memo.data.sections.risks[0]?.href || os.data.watchlist[0]?.href || "/admin",
      },
      {
        title: "Reviews needing disposition",
        detail: `${reviews.data.summary.requested + reviews.data.summary.inReview + reviews.data.summary.changesRequested} items are open, ${reviews.data.summary.overdue} overdue.`,
        href: "/admin/tools",
      },
      {
        title: "Release and experiment readouts",
        detail: os.data.timeline[0]?.detail || "No recent release or experiment activity logged.",
        href: os.data.timeline[0]?.href || "/admin/changelog",
      },
      {
        title: "Action follow-through",
        detail: `${os.data.actionBoard.summary.totalOpen} open actions, ${os.data.actionBoard.summary.overdue} overdue, ${os.data.actionBoard.summary.blocked} blocked.`,
        href: "/admin",
      },
    ];
  }, [memo.data, os.data, reviews.data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
      </div>
    );
  }

  if (error || !memo.data || !os.data || !reviews.data) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center text-sm text-red-400">
        {error || "Failed to load operating review mode."}
      </div>
    );
  }

  const openReviews =
    reviews.data.summary.requested +
    reviews.data.summary.inReview +
    reviews.data.summary.changesRequested;
  const activeReviewItems = reviews.data.items
    .filter((item) => item.status !== "approved" && item.status !== "rejected")
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">
            Weekly Operating Review
          </p>
          <h2 className="mt-2 font-serif text-3xl font-bold text-text-primary">Review Mode</h2>
          <p className="mt-2 max-w-4xl text-sm text-text-muted">{memo.data.headline}</p>
          <p className="mt-2 text-xs text-text-muted">
            Generated {formatTimestamp(memo.data.generatedAt)} by {memo.data.generatedBy}
          </p>
        </div>
        <TimeRangeSelector value={days} onChange={setDays} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Completion"
          value={`${memo.data.metrics.completionRate.current}%`}
          delta={memo.data.metrics.completionRate.delta}
          sub="vs prior window"
        />
        <StatCard
          label="Submission Delta"
          value={memo.data.metrics.submissions.current}
          delta={memo.data.metrics.submissions.delta}
          sub="current vs prior window"
        />
        <StatCard
          label="Waitlist Delta"
          value={memo.data.metrics.waitlist.current}
          delta={memo.data.metrics.waitlist.delta}
          sub="demand movement"
        />
        <StatCard
          label="Open Reviews"
          value={openReviews}
          sub="requested / in-review / changes-requested"
        />
        <StatCard
          label="Overdue Reviews"
          value={reviews.data.summary.overdue}
          sub="review queue pressure"
        />
      </div>

      <section>
        <h3 className="font-serif text-xl font-semibold text-text-primary">Meeting Agenda</h3>
        <div className="mt-3 grid gap-4 xl:grid-cols-5">
          {agenda.map((item, index) => (
            <a
              key={item.title}
              href={item.href}
              className="rounded-xl border border-white/10 bg-surface p-4 transition hover:border-white/20"
            >
              <p className="text-xs uppercase tracking-wide text-text-muted">{index + 1}</p>
              <p className="mt-2 font-medium text-text-primary">{item.title}</p>
              <p className="mt-2 text-sm text-text-muted">{item.detail}</p>
            </a>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Wins" items={memo.data.sections.wins} />
        <SectionCard title="Risks" items={memo.data.sections.risks} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Watchlist" items={memo.data.sections.watchlist} />
        <SectionCard title="Actions To Push" items={memo.data.sections.actions} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <section>
          <h3 className="font-serif text-xl font-semibold text-text-primary">Review Queue</h3>
          <div className="mt-3 space-y-3">
            {activeReviewItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 p-6 text-sm text-text-muted">
                No active review requests.
              </div>
            ) : (
              activeReviewItems.map((item) => (
                <a
                  key={item.id}
                  href={item.source_href || "/admin/tools"}
                  className="block rounded-xl border border-white/10 bg-surface p-4 transition hover:border-white/20"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-text-primary">{item.title}</p>
                    <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-semibold text-text-primary">
                      {item.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-text-muted">
                    {item.impact_level}
                    {item.reviewer_email ? ` | reviewer ${item.reviewer_email}` : ""}
                    {item.due_date ? ` | due ${item.due_date}` : ""}
                  </p>
                </a>
              ))
            )}
          </div>
        </section>

        <section>
          <h3 className="font-serif text-xl font-semibold text-text-primary">Operating Timeline</h3>
          <div className="mt-3 space-y-3">
            {os.data.timeline.map((item) => (
              <a
                key={item.id}
                href={item.href}
                className="block rounded-xl border border-white/10 bg-surface p-4 transition hover:border-white/20"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-text-primary">{item.title}</p>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                    {item.kind}
                  </span>
                </div>
                <p className="mt-2 text-sm text-text-muted">{item.detail}</p>
              </a>
            ))}
          </div>
        </section>
      </div>

      <div className="rounded-2xl border border-white/10 bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-serif text-xl font-semibold text-text-primary">Trust Note</h3>
            <p className="mt-2 text-sm text-text-muted">{memo.data.trust.detail}</p>
          </div>
          <div className="text-xs text-text-muted">
            {memo.data.trust.lastUpdated
              ? `Latest source update ${formatTimestamp(memo.data.trust.lastUpdated)}`
              : "No recent source timestamp"}
          </div>
        </div>
      </div>
    </div>
  );
}
