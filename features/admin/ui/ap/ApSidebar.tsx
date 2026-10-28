"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import posthog from "posthog-js";
import { useMemo, useState } from "react";

import { activeKey, AP_BASE, NAV, navHref } from "./nav";
import { addDays, shortDate } from "@features/admin/server/ap/days";
import { getCsrfToken } from "@shared/http/csrf-client";
import { reportingDay } from "@shared/time/reporting-day";

import { useApStatus } from "./status";
import { useApFilters } from "./useApFilters";

type Health = "ok" | "stale" | "down" | null;

/** Ends the admin session (the server signs out of Supabase) and returns to the sign-in page. */
async function signOut() {
  const response = await fetch("/api/admin/logout", {
    method: "POST",
    headers: { "x-csrf-token": getCsrfToken() },
  }).catch(() => null);
  if (response?.ok) posthog.reset();
  window.location.href = "/admin/login";
}

/** Green while fresh, amber once a source falls behind, red when it cannot be read. */
function Dot({ health }: { health: Health }) {
  const tone =
    health === "ok"
      ? "bg-ap-good"
      : health === "stale"
        ? "bg-[#d99a00]"
        : health === "down"
          ? "bg-ap-bad"
          : "bg-ap-quiet";
  return <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${tone}`} />;
}

/**
 * GA4 syncs every 15 minutes with today's partial day: a last day before yesterday means syncs
 * have stopped (just after midnight the new day may not have rows yet).
 */
function ga4Health(lastDay: string | null | undefined, today: string): Health {
  if (lastDay === undefined) return null;
  if (lastDay === null) return "down";
  return lastDay < addDays(today, -1) ? "stale" : "ok";
}

/** PostHog hears the site all day: half a day of silence is worth a look. */
function postHogHealth(ok: boolean | undefined, lastEvent: string | null | undefined): Health {
  if (ok === undefined) return null;
  if (!ok) return "down";
  if (!lastEvent) return "stale";
  return Date.now() - Date.parse(lastEvent) > 12 * 3_600_000 ? "stale" : "ok";
}

/** The design's logo mark: a centre dot in a ring of eight. */
export function Mark() {
  return (
    <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
      <circle cx="16" cy="16" r="3.4" fill="#D05976" />
      {[
        [16, 8, 2.2],
        [16, 24, 2.2],
        [8, 16, 2.2],
        [24, 16, 2.2],
        [10.3, 10.3, 1.8],
        [21.7, 10.3, 1.8],
        [10.3, 21.7, 1.8],
        [21.7, 21.7, 1.8],
      ].map(([cx, cy, r]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="#A78BFA" />
      ))}
    </svg>
  );
}

function ago(iso: string | null): string {
  if (!iso) return "no data";
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 60) return `${Math.max(mins, 1)} min ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

export default function ApSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { query } = useApFilters();
  const active = activeKey(pathname);
  const [search, setSearch] = useState("");
  const { status, error: statusError } = useApStatus();

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return NAV;
    return NAV.map((g) => ({
      ...g,
      items: g.items.filter((i) => i.label.toLowerCase().includes(term)),
    })).filter((g) => g.items.length > 0);
  }, [search]);

  return (
    <nav
      aria-label="AP-Analytics"
      className="flex min-h-full w-full flex-col gap-[22px] border-r border-ap-line bg-white px-3.5 pb-7 pt-5 font-sans text-ap-ink"
    >
      <Link
        href={`${AP_BASE}${query}`}
        onClick={onNavigate}
        className="flex min-h-11 items-center gap-2.5 px-2 py-1 text-ap-ink no-underline"
      >
        <Mark />
        <span className="flex flex-col leading-[1.15]">
          <span className="font-serif text-[17px] font-bold">AP-Analytics</span>
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ap-plum">
            Admin
          </span>
        </span>
      </Link>

      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (search.trim()) {
            router.push(`${AP_BASE}/sources?q=${encodeURIComponent(search.trim())}`);
            onNavigate?.();
          }
        }}
        className="px-1"
      >
        <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-ap-label">
          Search
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Reports, tables, fields"
            className="min-h-11 w-full rounded-lg border border-ap-ink/[0.18] bg-ap-ground px-3 text-sm font-medium normal-case tracking-normal text-ap-ink"
          />
        </label>
        {search.trim() && (
          <button
            type="submit"
            className="mt-1.5 cursor-pointer border-0 bg-transparent p-0 text-left text-xs font-semibold text-ap-plum underline"
          >
            Search tables and fields for “{search.trim()}”
          </button>
        )}
      </form>

      {groups.map((g) => (
        <div key={g.title} className="flex flex-col gap-0.5">
          <span className="px-2.5 pb-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-ap-label">
            {g.title}
          </span>
          {g.items.map((it) => {
            const on = it.key === active;
            const href = navHref(it, query);
            const cls = `flex items-center justify-between gap-2 rounded-full no-underline ${
              it.level === 2 ? "min-h-9 pl-[26px] pr-2.5 text-[13px]" : "min-h-10 px-2.5 text-sm"
            } ${on ? "bg-ap-purple/10 font-bold text-ap-violet" : it.level === 2 ? "font-medium text-ap-body" : "font-semibold text-ap-ink"}`;
            const badge = it.badge ? (
              <span className="text-[11px] font-semibold text-ap-muted">{it.badge}</span>
            ) : null;
            return href ? (
              <Link
                key={it.key}
                href={href}
                aria-current={on ? "page" : undefined}
                onClick={onNavigate}
                className={`${cls} hover:bg-ap-ground`}
              >
                <span>{it.label}</span>
                {badge}
              </Link>
            ) : (
              <span
                key={it.key}
                aria-disabled="true"
                title="Not launched yet"
                className={`${cls} cursor-default opacity-70`}
              >
                <span>{it.label}</span>
                {badge}
              </span>
            );
          })}
        </div>
      ))}

      <div className="mt-auto flex flex-col gap-2.5 border-t border-ap-line px-2.5 pt-3.5 text-xs text-ap-body">
        {statusError && <span className="text-ap-bad-ink">Status unavailable: {statusError}</span>}
        <span className="flex items-center gap-2">
          <Dot health={status ? (status.production.ok ? "ok" : "down") : null} />
          Production ·{" "}
          {status
            ? status.production.ok
              ? "live"
              : "not reachable"
            : statusError
              ? "unknown"
              : "checking"}
        </span>
        <span className="flex items-center gap-2">
          <Dot health={ga4Health(status?.ga4.lastDay, reportingDay(new Date()))} />
          GA4 ·{" "}
          {status
            ? status.ga4.lastDay
              ? `synced every 15 minutes, to ${shortDate(status.ga4.lastDay)}`
              : "no data"
            : statusError
              ? "unknown"
              : "checking"}
        </span>
        <span className="flex items-center gap-2">
          <Dot health={postHogHealth(status?.posthog.ok, status?.posthog.lastEvent)} />
          PostHog ·{" "}
          {status
            ? status.posthog.ok
              ? status.posthog.lastEvent
                ? `last event ${ago(status.posthog.lastEvent)}`
                : "no events in two days"
              : "not reachable"
            : statusError
              ? "unknown"
              : "checking"}
        </span>
        {status && (
          <span className="text-ap-muted">
            Signed in as {status.email} ·{" "}
            {status.role.charAt(0).toUpperCase() + status.role.slice(1)}
          </span>
        )}
        <button
          type="button"
          onClick={signOut}
          className="min-h-6 cursor-pointer self-start border-0 bg-transparent p-0 font-sans text-xs font-semibold text-ap-plum underline-offset-2 hover:underline"
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
