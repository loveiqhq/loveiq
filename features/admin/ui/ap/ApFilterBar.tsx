"use client";

import { useState } from "react";

import {
  ASSESSMENTS,
  FUNNELS,
  FUNNEL_NOTE,
  DEVICES,
  PERIODS,
  SOURCES,
  SURVEY_TRACKING_FROM,
  TIERS,
  VISITORS,
  filterParams,
  filterSummary,
  parseFilters,
  rangeLabel,
  type ApFilters,
} from "@features/admin/server/ap/filters";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import { getCsrfToken } from "@shared/http/csrf-client";

import { useApRole } from "./status";
import { useApFilters } from "./useApFilters";

interface Saved {
  id: number;
  name: string;
  is_shared: boolean;
  mine: boolean;
  filters: Record<string, string>;
}

const control =
  "min-h-11 w-full rounded-lg border border-ap-ink/[0.18] bg-white px-3 font-sans text-sm text-ap-ink disabled:cursor-not-allowed disabled:bg-ap-ground disabled:text-ap-muted";
const fieldLabel = "flex min-w-0 flex-col gap-1 text-xs font-bold text-ap-muted";

/** The same state, whatever order its parameters came in. */
function sameFilters(a: ApFilters, b: ApFilters): boolean {
  return JSON.stringify(filterParams(a)) === JSON.stringify(filterParams(b));
}

/**
 * The shared filter bar (the design's "Report filters"): saved filters, the period (always
 * compared with the one before it), and the narrowing filters. Collapsible; the state lives in
 * the URL.
 */
/** Filters a page cannot apply: shown greyed at their "all" value, with the reason. */
type Fixed = "funnel" | "source" | "device" | "tier" | "visitor";

const SAVED_PARAMS = { kind: "filter" };

/** When the referrer and tablets started being recorded, as the note says it. */
const trackingDay = rangeLabel(SURVEY_TRACKING_FROM, SURVEY_TRACKING_FROM);

export default function ApFilterBar({
  scope = "overall",
  fixed = [],
  fixedNote,
}: {
  scope?: "overall" | "assessment";
  fixed?: Fixed[];
  fixedNote?: string;
}) {
  const { filters: chosen, today, update, reset, apply } = useApFilters();
  const { canEdit } = useApRole();
  const off = (k: Fixed) => fixed.includes(k);
  // What the page shows: a fixed filter reads as its "all" value.
  // An assessment's own pages are that assessment's: only A has pages so far.
  const assessmentFixed = scope === "assessment";
  const filters = {
    ...chosen,
    ...(assessmentFixed ? { assessment: "a" as const } : {}),
    ...(off("funnel") ? { funnel: "all" as const } : {}),
    ...(off("source") ? { source: "all" as const } : {}),
    ...(off("device") ? { device: "all" as const } : {}),
    ...(off("tier") ? { tier: "all" as const } : {}),
    ...(off("visitor") ? { visitor: "all" as const } : {}),
  };
  // Open at every width until the reader closes it, as the design starts it.
  const [open, setOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftShared, setDraftShared] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const savedList = useAdminFetch<{ saved: Saved[] }>("/api/admin/ap/saved-filters", SAVED_PARAMS);
  const saved = savedList.data?.saved ?? [];
  const load = savedList.refetch;

  const save = async () => {
    setError(null);
    const name = draftName.trim() || `Filter ${saved.filter((s) => s.mine).length + 1}`;
    const res = await fetch("/api/admin/ap/saved-filters", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": getCsrfToken() ?? "" },
      body: JSON.stringify({
        kind: "filter",
        name,
        shared: draftShared,
        filters: filterParams(chosen),
      }),
    });
    if (!res.ok) {
      setError(
        ((await res.json().catch(() => null)) as { error?: string } | null)?.error ??
          "Could not save."
      );
      return;
    }
    setSaving(false);
    setDraftName("");
    setDraftShared(false);
    load();
  };

  const [removeError, setRemoveError] = useState<string | null>(null);
  const remove = async (id: number) => {
    setRemoveError(null);
    const res = await fetch(`/api/admin/ap/saved-filters?id=${id}`, {
      method: "DELETE",
      headers: { "x-csrf-token": getCsrfToken() ?? "" },
    });
    if (res.ok) load();
    else setRemoveError("Could not delete that filter. Try again.");
  };

  const active = saved.find((s) => sameFilters(parseFilters(s.filters, today), chosen));
  const summary = filterSummary(filters, today);

  return (
    <section
      aria-label="Report filters"
      className="flex flex-col gap-3.5 rounded-[20px] border border-ap-line bg-white px-[18px] py-4 shadow-ap"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-[1_1_320px] flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-serif text-base font-semibold">Filters</span>
          {!open && (
            <span className="text-[13px] leading-normal text-ap-body">
              {summary}
              {active ? ` · saved: ${active.name}` : ""}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(!open);
            setSaving(false);
          }}
          aria-expanded={open}
          aria-controls="ap-filter-body"
          className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-ap-line bg-white px-4 text-[13px] font-bold text-ap-ink"
        >
          {open ? "Hide filters" : "Show filters"}
          <svg
            viewBox="0 0 16 16"
            width="12"
            height="12"
            aria-hidden="true"
            style={{ transform: `rotate(${open ? 180 : 0}deg)` }}
          >
            <path
              d="M4 6l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </button>
      </div>

      {open && (
        <div id="ap-filter-body" className="flex flex-col gap-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[11px] font-bold uppercase tracking-[0.1em] text-ap-label">
              Saved filters
            </span>
            {savedList.loading && !savedList.data && (
              <span className="text-[13px] text-ap-muted">Loading…</span>
            )}
            {savedList.error && !savedList.data && (
              <span role="alert" className="text-[13px] text-ap-bad-ink">
                Could not load saved filters.{" "}
                <button
                  type="button"
                  onClick={load}
                  className="cursor-pointer border-0 bg-transparent p-0 font-bold text-ap-plum underline"
                >
                  Try again
                </button>
              </span>
            )}
            {savedList.data && saved.length === 0 && (
              <span className="text-[13px] text-ap-muted">None yet</span>
            )}
            {saved.map((s) => {
              const on = active?.id === s.id;
              return (
                <span key={s.id} className="inline-flex items-center">
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => apply(parseFilters(s.filters, today))}
                    className={`inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold ${
                      on
                        ? "border-ap-purple bg-ap-purple/10 text-ap-violet"
                        : "border-ap-line bg-white text-ap-ink"
                    } ${s.mine ? "rounded-r-none border-r-0" : ""}`}
                  >
                    {s.name}
                    {s.is_shared && (
                      <span className="text-[11px] font-bold text-ap-muted">· team</span>
                    )}
                  </button>
                  {s.mine && (
                    <button
                      type="button"
                      aria-label={`Delete saved filter ${s.name}`}
                      onClick={() => void remove(s.id)}
                      className={`inline-flex min-h-10 cursor-pointer items-center rounded-r-full border px-2.5 text-ap-muted ${
                        on ? "border-ap-purple bg-ap-purple/10" : "border-ap-line bg-white"
                      }`}
                    >
                      <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
                        <path
                          d="M4 4l8 8M12 4l-8 8"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  )}
                </span>
              );
            })}
            {removeError && (
              <span role="alert" className="text-xs text-ap-bad-ink">
                {removeError}
              </span>
            )}
            <span className="flex-auto" />
            {!saving && canEdit && (
              <button
                type="button"
                onClick={() => setSaving(true)}
                className="min-h-10 cursor-pointer rounded-full border border-dashed border-ap-ink/[0.18] bg-white px-4 text-[13px] font-bold text-ap-ink"
              >
                Save current filter
              </button>
            )}
          </div>

          {saving && (
            <div className="flex flex-wrap items-end gap-2.5 rounded-[14px] bg-ap-lilac px-3.5 py-3">
              <label className={`${fieldLabel} flex-[1_1_240px]`}>
                Name this filter
                <input
                  type="text"
                  value={draftName}
                  maxLength={80}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="e.g. Paid search · mobile · 30 days"
                  className={control}
                />
              </label>
              <label className="flex min-h-11 items-center gap-2 text-[13px] font-semibold text-ap-body">
                <input
                  type="checkbox"
                  checked={draftShared}
                  onChange={() => setDraftShared((v) => !v)}
                  className="h-[18px] w-[18px] accent-[#795fc8]"
                />
                Share with team
              </label>
              <button
                type="button"
                onClick={() => void save()}
                className="min-h-11 cursor-pointer rounded-full border-0 bg-black px-5 text-sm font-bold text-white"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setSaving(false)}
                className="min-h-11 cursor-pointer rounded-full border border-ap-line bg-white px-[18px] text-sm font-semibold text-ap-body"
              >
                Cancel
              </button>
              {error && (
                <span role="alert" className="text-xs text-ap-bad-ink">
                  {error}
                </span>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-3 border-t border-ap-line pt-3.5">
            <label className={`${fieldLabel} flex-[1_1_180px]`}>
              Period
              <select
                value={filters.period}
                onChange={(e) => update({ period: e.target.value as ApFilters["period"] })}
                className={control}
              >
                {PERIODS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${fieldLabel} flex-[1_1_150px]`}>
              From
              <input
                type="date"
                value={filters.from}
                max={filters.to}
                onChange={(e) => e.target.value && update({ from: e.target.value })}
                className={control}
              />
            </label>
            <label className={`${fieldLabel} flex-[1_1_150px]`}>
              To
              <input
                type="date"
                value={filters.to}
                min={filters.from}
                max={today}
                onChange={(e) => e.target.value && update({ to: e.target.value })}
                className={control}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className={`${fieldLabel} flex-[1_1_170px]`}>
              Assessment
              <select
                value={filters.assessment}
                disabled={assessmentFixed}
                onChange={(e) => update({ assessment: e.target.value as ApFilters["assessment"] })}
                className={control}
              >
                {ASSESSMENTS.filter((a) => scope === "overall" || a.value !== "all").map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${fieldLabel} flex-[1_1_170px]`}>
              Funnel
              <select
                value={filters.funnel ?? "all"}
                onChange={(e) => update({ funnel: e.target.value as ApFilters["funnel"] })}
                className={control}
                title={off("funnel") ? fixedNote : FUNNEL_NOTE}
                disabled={off("funnel")}
              >
                {FUNNELS.map((f) => (
                  <option key={f.value} value={f.value} disabled={"live" in f && !f.live}>
                    {"live" in f && !f.live ? `${f.label} (on the Pay to start page)` : f.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${fieldLabel} flex-[1_1_170px]`}>
              Source
              <select
                value={filters.source}
                disabled={off("source")}
                onChange={(e) => update({ source: e.target.value as ApFilters["source"] })}
                className={control}
              >
                {SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${fieldLabel} flex-[1_1_150px]`}>
              Device
              <select
                value={filters.device}
                disabled={off("device")}
                onChange={(e) => update({ device: e.target.value as ApFilters["device"] })}
                className={control}
              >
                {DEVICES.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${fieldLabel} flex-[1_1_150px]`}>
              Country tier
              <select
                value={filters.tier}
                disabled={off("tier")}
                onChange={(e) => update({ tier: e.target.value as ApFilters["tier"] })}
                className={control}
              >
                {TIERS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${fieldLabel} flex-[1_1_170px]`}>
              Visitor
              <select
                value={filters.visitor}
                disabled={off("visitor")}
                onChange={(e) => update({ visitor: e.target.value as ApFilters["visitor"] })}
                className={control}
                aria-describedby="ap-visitor-note"
              >
                {VISITORS.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={reset}
              className="min-h-11 cursor-pointer rounded-full border-0 bg-transparent px-3 text-[13px] font-bold text-ap-plum"
            >
              Reset
            </button>
          </div>
          {/* A page's own reason for the filters it fixes stays in view. */}
          {fixedNote && <p className="m-0 text-xs text-ap-muted">{fixedNote}</p>}

          {/* Not in the design: kept, folded away. */}
          <details className="text-xs text-ap-muted">
            <summary className="cursor-pointer font-semibold text-ap-body">
              How these filters work
            </summary>
            <p id="ap-visitor-note" className="m-0 mt-2 text-xs text-ap-muted">
              New or returning comes from PostHog: whether the person had visited before the visit
              they finished the survey in. It splits finished surveys, their reports and payments;
              visits, survey starts and ad spend can&rsquo;t be split that way. Meta Ads: a Meta
              link tagged as paid; Meta&rsquo;s click id alone counts as Social. An untagged visit
              is sorted by the site it came from, recorded from {trackingDay} (before, those read as
              Direct): a search engine is Organic search, an email app or webmail Email, a social
              site Social, an AI assistant AI assistants, another site Referral, and only no site at
              all is Direct. Gmail on the web opens links through Google, so an untagged email click
              there can read as organic search. Tablets are told apart from {trackingDay}: before,
              they count as Mobile, or as Desktop for newer iPads, which present themselves as Macs.
              {assessmentFixed && (
                <> These pages are Assessment A&rsquo;s; B and C have not launched.</>
              )}
            </p>
          </details>
        </div>
      )}
    </section>
  );
}
