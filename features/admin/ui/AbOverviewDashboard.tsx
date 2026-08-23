"use client";

/**
 * The /admin landing page: how the funnel is doing and how the A/B tests are
 * actually performing, readable without asking an engineer.
 *
 * Written for a non-technical reader, so two rules apply throughout:
 *  - every number is shown with its sample size, and
 *  - the verdict is a sentence, not a percentage the reader has to interpret.
 *
 * Charts are hand-drawn to match the existing admin style (FunnelChart's
 * width-% bars with an opacity fade, BarChart's `h-2 rounded-full bg-white/5`
 * track) rather than pulling in a charting dependency.
 */

import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";

interface ArmStat {
  arm: string;
  label: string;
  retired: boolean;
  n: number;
  purchases: number;
  rate: number;
  revenue: number;
}

interface ExperimentReadout {
  axis: string;
  title: string;
  arms: ArmStat[];
  unattributed: number;
  verdict: string;
  significance: string;
}

export interface AbOverview {
  windowDays: number;
  generatedAt: string;
  funnel: Array<{ step: string; count: number; pctOfTop: number; dropFromPrev: number }>;
  experiments: ExperimentReadout[];
  totals: { submissions: number; purchases: number; revenue: number; currency: string };
  truncated: boolean;
}

const OPACITY_STEPS = [1, 0.88, 0.76, 0.64, 0.52, 0.4, 0.3];

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-surface p-5">
      <h2 className="font-serif text-lg font-semibold text-text-primary">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-text-muted">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function HeadlineNumber({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-surface p-5">
      <p className="text-sm text-text-muted">{label}</p>
      <p className="mt-1 font-serif text-3xl font-semibold text-text-primary">{value}</p>
      {hint && <p className="mt-1 text-xs text-text-muted">{hint}</p>}
    </div>
  );
}

function Funnel({ steps }: { steps: AbOverview["funnel"] }) {
  const top = Math.max(...steps.map((s) => s.count), 1);
  return (
    <div className="space-y-2">
      {steps.map((step, idx) => (
        <div key={step.step}>
          {idx > 0 && step.dropFromPrev > 0 && (
            <div className="flex items-center gap-2 py-1 sm:pl-4">
              <svg
                className="h-3.5 w-3.5 shrink-0 text-text-muted"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12l7 7 7-7" />
              </svg>
              <span className="text-xs text-text-muted">
                {step.dropFromPrev}% of them stopped here
              </span>
            </div>
          )}

          {/*
           * Stacked on mobile, side-by-side from sm up. A fixed label column at
           * 390px left only ~100px for the bar, which squashed every step to the
           * same width and pushed the counts out of sight — the chart stopped
           * saying anything at all on a phone.
           */}
          <div className="sm:flex sm:items-center sm:gap-3">
            <div className="mb-1 flex items-baseline justify-between gap-2 sm:mb-0 sm:w-44 sm:shrink-0 sm:justify-end">
              <span className="text-sm text-text-muted sm:text-right">{step.step}</span>
              <span className="text-sm tabular-nums text-text-primary sm:hidden">
                {step.count.toLocaleString()}
                <span className="ml-2 text-text-muted">{step.pctOfTop}%</span>
              </span>
            </div>

            <div className="h-6 flex-1 rounded-md bg-white/5">
              <div
                className="h-6 rounded-md bg-accent-orange"
                style={{
                  width: `${Math.max((step.count / top) * 100, step.count > 0 ? 2 : 0)}%`,
                  opacity: OPACITY_STEPS[Math.min(idx, OPACITY_STEPS.length - 1)],
                }}
              />
            </div>

            {/* Counts live OUTSIDE the bar: at 0.2% of the top step the bar is a
                sliver and any text inside it overflowed its own edge. */}
            <div className="hidden w-16 shrink-0 text-right text-sm tabular-nums text-text-primary sm:block">
              {step.count.toLocaleString()}
            </div>
            <div className="hidden w-12 shrink-0 text-right text-sm tabular-nums text-text-muted sm:block">
              {step.pctOfTop}%
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** One experiment: a bar per arm, the sample size beside it, and a plain verdict. */
function Experiment({ readout }: { readout: ExperimentReadout }) {
  const withData = readout.arms.filter((a) => a.n > 0);
  const best = Math.max(...readout.arms.map((a) => a.rate), 0.0001);

  const tone =
    readout.significance === "significant-lift" || readout.significance === "significant-regression"
      ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-300"
      : "border-amber-500/20 bg-amber-500/5 text-amber-200";

  return (
    <Card title={readout.title}>
      {withData.length === 0 ? (
        <p className="text-sm text-text-muted">
          Nobody has been recorded in this test yet, so there is nothing to compare.
        </p>
      ) : (
        <>
          <div className="space-y-3">
            {readout.arms.map((arm) => (
              <div key={arm.arm}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 text-text-primary">
                    {arm.label}
                    {arm.retired && (
                      <span className="ml-2 text-xs text-text-muted">(no longer running)</span>
                    )}
                  </span>
                  <span className="shrink-0 whitespace-nowrap tabular-nums text-text-muted">
                    <span className="font-medium text-text-primary">{arm.rate}%</span> ·{" "}
                    {arm.purchases}/{arm.n.toLocaleString()}
                  </span>
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-white/5">
                  <div
                    className="h-2 rounded-full bg-accent-purple"
                    style={{ width: `${Math.max((arm.rate / best) * 100, arm.rate > 0 ? 3 : 0)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className={`mt-4 rounded-lg border p-3 text-sm ${tone}`}>{readout.verdict}</p>
        </>
      )}
    </Card>
  );
}

export default function AbOverviewDashboard() {
  const { data, loading, error } = useAdminFetch<AbOverview>("/api/admin/ab-overview?days=90");
  return <AbOverviewView data={data ?? null} loading={loading} error={error ?? null} />;
}

/** Presentation only — exported so it can be rendered from fixtures without a session. */
export function AbOverviewView({
  data,
  loading,
  error,
}: {
  data: AbOverview | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple"
          role="status"
          aria-label="Loading"
        />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center text-sm text-red-400"
        role="alert"
      >
        {error ?? "Unable to load the overview."}
      </div>
    );
  }

  const { totals, funnel, experiments } = data;
  const visitors = funnel[0]?.count ?? 0;
  const paid = funnel.at(-1)?.count ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <HeadlineNumber
          label="People who visited"
          value={visitors.toLocaleString()}
          hint={`last ${data.windowDays} days`}
        />
        <HeadlineNumber
          label="Finished the survey"
          value={totals.submissions.toLocaleString()}
          hint={
            visitors > 0
              ? `${Math.round((totals.submissions / visitors) * 1000) / 10}% of visitors`
              : undefined
          }
        />
        <HeadlineNumber
          label="Paid for a report"
          value={paid.toLocaleString()}
          hint={
            visitors > 0 ? `${Math.round((paid / visitors) * 1000) / 10}% of visitors` : undefined
          }
        />
        <HeadlineNumber
          label="Revenue"
          value={`${totals.currency} ${totals.revenue.toLocaleString()}`}
          hint={`${totals.purchases} purchase${totals.purchases === 1 ? "" : "s"}`}
        />
      </div>

      <Card
        title="Where people drop out"
        subtitle="Each bar is how many people reached that step. The arrows show how many gave up between steps."
      >
        <Funnel steps={funnel} />
      </Card>

      <div>
        <h2 className="mb-1 font-serif text-xl font-semibold text-text-primary">
          What our tests are telling us
        </h2>
        <p className="mb-4 text-sm text-text-muted">
          We show different versions of the site to different people. This is how each version is
          doing. &ldquo;Bought&rdquo; means they paid for a report after finishing the survey.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          {experiments.map((readout) => (
            <Experiment key={readout.axis} readout={readout} />
          ))}
        </div>
      </div>

      {data.truncated && (
        <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-200">
          There was more data than this page reads in one go, so these numbers cover only the most
          recent slice.
        </p>
      )}
      <p className="text-xs text-text-muted">
        Updated {new Date(data.generatedAt).toLocaleString()} · refreshed at most once a minute.
      </p>
    </div>
  );
}
