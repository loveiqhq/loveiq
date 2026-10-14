"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { CatalogPayload, CatalogTable, SourceKey } from "@features/admin/server/ap/catalog";
import {
  berlinTime,
  isDateType,
  isNumeric,
  isTextLike,
  MASKED_TEXT_OPS,
  OPS,
  PAGE_SIZES,
  type ExplorerResult,
  type Op,
} from "@features/admin/server/ap/explorer-spec";
import { addDays } from "@features/admin/server/ap/days";
import { EMPTY } from "@features/admin/server/ap/format";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import { getCsrfToken } from "@shared/http/csrf-client";
import { reportingDay } from "@shared/time/reporting-day";

import { Failed, FilterIcon, Loading, PageHeader, SortIcon } from "./kit";
import { useApRole, useApStatus } from "./status";

const OP_LABELS: Record<Op, string> = {
  eq: "=",
  neq: "≠",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  contains: "contains",
  in: "is one of",
  null: "is empty",
  notnull: "is not empty",
};

const SOURCE_NAMES: Record<SourceKey, string> = {
  production: "Production",
  posthog: "PostHog",
  ga4: "Google Analytics",
  ads: "Google Ads",
};

type Filter = [string, Op, string];

interface Saved {
  id: number;
  name: string;
  filters: Record<string, string>;
  is_shared: boolean;
  mine: boolean;
  owner: string;
}

const control =
  "min-h-11 w-full rounded-lg border border-ap-ink/[0.18] bg-white px-3 font-sans text-sm text-ap-ink disabled:bg-ap-ground disabled:text-ap-muted";
const fieldLabel = "flex min-w-0 flex-col gap-1 text-xs font-bold text-ap-muted";
const pill =
  "min-h-11 cursor-pointer rounded-full border border-ap-line bg-white px-[18px] font-sans text-sm font-semibold text-ap-ink disabled:cursor-not-allowed disabled:opacity-50";

const SAVED_PARAMS = { kind: "explorer" };

/** Which state lives in the URL, so a link (and a saved view) carries the query. */
const KEYS = [
  "source",
  "table",
  "date",
  "from",
  "to",
  "filters",
  "cols",
  "sort",
  "dir",
  "size",
  "page",
  "cursor",
] as const;

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** A cell as the page shows it, days and times in Berlin. The CSV keeps what is stored. */
function shownText(v: unknown, type: string | undefined): string {
  if (v === null || v === undefined) return EMPTY;
  if (typeof v === "string" && type && isDateType(type)) return berlinTime(v) ?? v;
  return cellText(v);
}

/** A status pill's colours, as the design draws it: green when done, red when it failed. */
function statusTone(v: string): string {
  if (/^(succeeded|completed|submitted|generated|paid)$/i.test(v))
    return "bg-ap-good/10 text-ap-good-ink";
  if (/^(failed|canceled|cancelled|refunded)$/i.test(v)) return "bg-ap-bad/10 text-ap-bad-ink";
  return "bg-ap-ground text-ap-body";
}

/** Whom a disabled button is for, said on it. */
function why(reason: string | null) {
  return reason ? <span className="text-xs font-medium">{` · ${reason}`}</span> : null;
}

function QuickRanges({
  today,
  onPick,
}: {
  today: string;
  onPick: (from: string, to: string) => void;
}) {
  const month = `${today.slice(0, 8)}01`;
  const ranges: Array<[string, string, string]> = [
    ["Today", today, today],
    ["7 days", addDays(today, -7), addDays(today, -1)],
    ["30 days", addDays(today, -30), addDays(today, -1)],
    ["This month", month, today],
  ];
  return (
    <>
      <span className="ml-auto text-[13px] text-ap-muted">Quick ranges:</span>
      {ranges.map(([label, from, to]) => (
        <button
          key={label}
          type="button"
          onClick={() => onPick(from, to)}
          className="min-h-9 cursor-pointer rounded-full border-0 bg-ap-ground px-3 font-sans text-xs font-semibold text-ap-body"
        >
          {label}
        </button>
      ))}
    </>
  );
}

function AddFilter({
  table,
  masked,
  preset,
  onAdd,
}: {
  table: CatalogTable;
  masked: boolean;
  /** The column whose header funnel was pressed: opens the filter on it. */
  preset?: string;
  onAdd: (f: Filter) => void;
}) {
  const [open, setOpen] = useState(Boolean(preset));
  const [column, setColumn] = useState(
    preset ?? table.fields.find((f) => !(masked && f.privacy))?.name ?? ""
  );
  const [op, setOp] = useState<Op>("eq");
  const [value, setValue] = useState("");
  const type = table.fields.find((f) => f.name === column)?.type ?? "text";
  // JSON and lists can only be empty or not, as the server checks. While masked, text matches
  // whole: searching inside it could spell out what the mask hides.
  const ops: readonly Op[] = /^jsonb?$|\[\]$/.test(type)
    ? ["null", "notnull"]
    : masked && isTextLike(type)
      ? OPS.filter((o) => MASKED_TEXT_OPS.includes(o))
      : OPS;
  const chosen = ops.includes(op) ? op : ops[0]!;
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-10 cursor-pointer rounded-full border border-dashed border-ap-ink/20 bg-white px-3.5 font-sans text-[13px] font-semibold text-ap-body"
      >
        + Add filter
      </button>
    );
  }
  const needsValue = chosen !== "null" && chosen !== "notnull";
  return (
    <span className="flex flex-wrap items-center gap-2 rounded-2xl bg-ap-ground p-2">
      <select
        aria-label="Filter field"
        value={column}
        onChange={(e) => setColumn(e.target.value)}
        className={`${control} !min-h-10 !w-auto font-mono text-xs`}
      >
        {/* While masked, a personal field cannot be filtered on: not offered, as its header shows no funnel. */}
        {table.fields
          .filter((f) => !(masked && f.privacy))
          .map((f) => (
            <option key={f.name} value={f.name}>
              {f.name}
            </option>
          ))}
      </select>
      <select
        aria-label="Filter condition"
        value={chosen}
        autoFocus={Boolean(preset) && !needsValue}
        onChange={(e) => setOp(e.target.value as Op)}
        className={`${control} !min-h-10 !w-auto`}
      >
        {ops.map((o) => (
          <option key={o} value={o}>
            {OP_LABELS[o]}
          </option>
        ))}
      </select>
      {needsValue && (
        <input
          aria-label="Filter value"
          value={value}
          autoFocus={Boolean(preset)}
          maxLength={200}
          placeholder={chosen === "in" ? "a, b, c" : "value"}
          onChange={(e) => setValue(e.target.value)}
          className={`${control} !min-h-10 !w-44`}
        />
      )}
      <button
        type="button"
        disabled={needsValue && !value.trim()}
        onClick={() => {
          onAdd([column, chosen, needsValue ? value.trim() : ""]);
          setValue("");
          setOpen(false);
        }}
        className="min-h-10 cursor-pointer rounded-full border-0 bg-black px-3.5 text-xs font-bold text-white disabled:opacity-50"
      >
        Add
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="min-h-10 cursor-pointer rounded-full border-0 bg-transparent px-2 text-xs font-semibold text-ap-muted"
      >
        Cancel
      </button>
    </span>
  );
}

function Unlock({
  table,
  onUnlocked,
  denied,
}: {
  table: CatalogTable;
  onUnlocked: (token: string, until: string) => void;
  /** Why this admin may not unlock, shown on the disabled button; "" while the role loads. */
  denied: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        disabled={denied !== null}
        onClick={() => setOpen(true)}
        className={`${pill} self-start`}
      >
        Unlock personal fields
        {why(denied)}
      </button>
    );
  }
  return (
    <div
      role="dialog"
      aria-label="Unlock personal fields"
      className="flex w-full flex-col gap-2 rounded-2xl border border-ap-pii/30 bg-white p-4"
    >
      <span className="text-sm font-bold text-ap-ink">Unlock {table.name} for 15 minutes</span>
      <span className="text-xs leading-relaxed text-ap-muted">
        Admins only. Your reason is written to the admin audit log with your name and the time, and
        so is every unmasked export.
      </span>
      <textarea
        aria-label="Reason"
        value={reason}
        rows={2}
        maxLength={300}
        placeholder="Why you need the personal fields (at least 10 characters)"
        onChange={(e) => setReason(e.target.value)}
        className="w-full rounded-lg border border-ap-ink/20 p-2 font-sans text-sm text-ap-ink"
      />
      <span className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || reason.trim().length < 10}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const res = await fetch("/api/admin/ap/explorer/unlock", {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-csrf-token": getCsrfToken() ?? "" },
              body: JSON.stringify({
                source: table.source,
                table: table.name,
                reason: reason.trim(),
              }),
            });
            setBusy(false);
            const body = (await res.json().catch(() => null)) as {
              token?: string;
              until?: string;
              error?: string;
            } | null;
            if (!res.ok || !body?.token || !body.until) {
              setError(body?.error ?? "Could not unlock.");
              return;
            }
            setOpen(false);
            setReason("");
            onUnlocked(body.token, body.until);
          }}
          className="min-h-10 cursor-pointer rounded-full border-0 bg-black px-4 text-xs font-bold text-white disabled:opacity-50"
        >
          Unlock and log
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="min-h-10 cursor-pointer rounded-full border-0 bg-transparent px-2 text-xs font-semibold text-ap-muted"
        >
          Cancel
        </button>
        {error && <span className="text-xs text-ap-bad-ink">{error}</span>}
      </span>
    </div>
  );
}

export default function ApExplorer() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const today = reportingDay(new Date());
  const catalog = useAdminFetch<CatalogPayload>("/api/admin/ap/catalog");
  const { canEdit, isAdmin } = useApRole();
  const { status } = useApStatus();
  // What a role may not do stays on the page, disabled, saying whom it is for once the role
  // is known (null: allowed).
  const denied = (allowed: boolean, who: string) => (allowed ? null : status ? who : "");
  const saveDenied = denied(canEdit, "Editors and admins");
  const adminDenied = denied(isAdmin, "Admins only");
  const [back, setBack] = useState<string[]>([]);

  const source = (params.get("source") ?? "production") as SourceKey;
  const tables = useMemo(
    () => catalog.data?.tables.filter((t) => t.source === source && !t.closed) ?? [],
    [catalog.data, source]
  );

  const table =
    tables.find((t) => t.name === params.get("table")) ??
    tables.find((t) => t.name === "admin_submission_facts") ??
    tables.find((t) => t.name === "survey_submission") ??
    tables[0] ??
    null;
  const at = table ? `${table.source}.${table.name}` : "";
  const masks = source === "production" || source === "posthog";
  // The column a header's funnel opened "+ Add filter" on; the count reopens it on the next press.
  const [preset, setPreset] = useState<{ at: string; column: string; n: number } | null>(null);
  const presetHere = preset?.at === at ? preset : null;

  const set = useCallback(
    (patch: Partial<Record<(typeof KEYS)[number], string | null>>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      // A new query starts on its first page.
      if (!("page" in patch) && !("cursor" in patch)) {
        next.delete("page");
        next.delete("cursor");
        setBack([]);
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router]
  );

  const filters: Filter[] = useMemo(() => {
    try {
      const f = JSON.parse(params.get("filters") ?? "[]") as Filter[];
      return Array.isArray(f) ? f : [];
    } catch {
      return [];
    }
  }, [params]);
  const from = params.get("from") ?? addDays(today, -30);
  const to = params.get("to") ?? addDays(today, -1);
  const dateField = table
    ? params.has("date")
      ? params.get("date") || ""
      : (table.dateFields[0] ?? "")
    : "";
  const columns = useMemo(() => {
    if (!table) return [];
    const chosen = (params.get("cols") ?? "")
      .split(",")
      .filter((c) => table.fields.some((f) => f.name === c));
    return chosen.length ? chosen : table.fields.slice(0, 10).map((f) => f.name);
  }, [params, table]);
  const size = Number(params.get("size") ?? 12);
  const page = Math.max(1, Number(params.get("page") ?? 1));
  const sort = params.get("sort") ?? "";
  const dir = params.get("dir") === "asc" ? "asc" : "desc";

  // PostHog pages by time: the cursors of the pages before, for Previous.
  const cursor = params.get("cursor") ?? "";
  const posthog = source === "posthog";

  // The unlock lives in memory only: a reload or a shared link is masked again.
  const [unlock, setUnlock] = useState<{ table: string; token: string; until: string } | null>(
    null
  );
  const unlockToken =
    unlock &&
    table &&
    unlock.table === `${table.source}.${table.name}` &&
    new Date(unlock.until) > new Date()
      ? unlock.token
      : null;
  useEffect(() => {
    if (!unlock) return;
    const ms = new Date(unlock.until).getTime() - Date.now();
    const t = setTimeout(() => setUnlock(null), Math.max(0, ms));
    return () => clearTimeout(t);
  }, [unlock]);

  const query = useMemo(() => {
    if (!table) return null;
    const q: Record<string, string> = {
      source: table.source,
      table: table.name,
      from,
      to,
      cols: columns.join(","),
      dir,
      page: String(page),
      size: String(size),
    };
    if (dateField) q.date = dateField;
    if (filters.length) q.filters = JSON.stringify(filters);
    if (sort) q.sort = sort;
    if (unlockToken) q.unlock = unlockToken;
    if (posthog && cursor) q.cursor = cursor;
    return q;
  }, [
    table,
    from,
    to,
    columns,
    dir,
    page,
    size,
    dateField,
    filters,
    sort,
    unlockToken,
    posthog,
    cursor,
  ]);

  const result = useAdminFetch<ExplorerResult>(
    "/api/admin/ap/explorer",
    query ?? undefined,
    Boolean(query)
  );

  const [saveName, setSaveName] = useState<string | null>(null);
  const [saveShared, setSaveShared] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const savedList = useAdminFetch<{ saved: Saved[] }>("/api/admin/ap/saved-filters", SAVED_PARAMS);
  const saved = savedList.data?.saved ?? [];
  const loadSaved = savedList.refetch;

  const viewParams = () => {
    const v: Record<string, string> = {};
    for (const k of KEYS) {
      const val = params.get(k);
      // An empty date is a choice (no date range), not a missing one.
      if (val !== null && (val || k === "date") && k !== "page" && k !== "cursor") v[k] = val;
    }
    if (table) {
      v.source = table.source;
      v.table = table.name;
    }
    return v;
  };

  const saveView = async () => {
    const name = (saveName ?? "").trim() || `${table?.name} view`;
    const res = await fetch("/api/admin/ap/saved-filters", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": getCsrfToken() ?? "" },
      body: JSON.stringify({ kind: "explorer", name, shared: saveShared, filters: viewParams() }),
    });
    if (!res.ok) {
      setNotice(
        ((await res.json().catch(() => null)) as { error?: string } | null)?.error ??
          "Could not save the view."
      );
      return;
    }
    setSaveName(null);
    setSaveShared(false);
    setNotice(`Saved “${name}”.`);
    loadSaved();
  };

  const removeView = async (id: number) => {
    const res = await fetch(`/api/admin/ap/saved-filters?id=${id}`, {
      method: "DELETE",
      headers: { "x-csrf-token": getCsrfToken() ?? "" },
    });
    if (res.ok) loadSaved();
  };

  const [exporting, setExporting] = useState(false);
  /** Fetched, not navigated to: a refusal (the role, the limit) shows here, not as a raw page. */
  const exportCsv = async () => {
    if (!query) return;
    const qs = new URLSearchParams({ ...query, format: "csv" });
    qs.delete("page");
    qs.delete("cursor");
    setExporting(true);
    try {
      const res = await fetch(`/api/admin/ap/explorer?${qs.toString()}`, { cache: "no-store" });
      if (!res.ok) {
        setNotice(
          ((await res.json().catch(() => null)) as { error?: string } | null)?.error ??
            "Could not export."
        );
        return;
      }
      const name =
        /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ??
        "export.csv";
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(`Exported ${name}. Exports are logged.`);
    } finally {
      setExporting(false);
    }
  };

  const data = result.data;
  const total = data?.total ?? null;
  const first = (page - 1) * size + 1;
  const last = data ? first + data.rows.length - 1 : first;
  const masked = data?.masked ?? masks;
  const keys = new Set(table?.key);
  const types = new Map(table?.fields.map((f) => [f.name, f.type] as const));
  // Amounts sit right; ids (the key, links to other tables) stay left, as the design's do.
  const amounts = new Set(
    table?.fields
      .filter((f) => isNumeric(f.type) && !keys.has(f.name) && !f.joins)
      .map((f) => f.name)
  );

  const sourcePicker = (
    <label className={fieldLabel}>
      Source
      <select
        value={source}
        onChange={(e) => {
          setPreset(null);
          set({
            source: e.target.value,
            table: null,
            cols: null,
            filters: null,
            sort: null,
            date: null,
          });
        }}
        className={control}
      >
        {(Object.keys(SOURCE_NAMES) as SourceKey[]).map((s) => (
          <option key={s} value={s}>
            {SOURCE_NAMES[s]}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <>
      <PageHeader
        crumbs={["Data sources", "Raw data explorer"]}
        title="Raw data explorer"
        description="Pick a table, a date field and filters. Personal fields are masked unless you unlock them for a reason that is logged."
        actions={
          <>
            <button
              type="button"
              className={pill}
              disabled={!table || saveDenied !== null}
              onClick={() => setSaveName(saveName === null ? "" : null)}
            >
              Save view
              {why(saveDenied)}
            </button>
            <button
              type="button"
              className={pill}
              disabled={!data}
              onClick={async () => {
                if (!data) return;
                try {
                  await navigator.clipboard.writeText(data.sql);
                  setNotice("Query copied.");
                } catch {
                  setNotice("Copy failed: the query is under the table.");
                }
              }}
            >
              Copy query
            </button>
            <button
              type="button"
              disabled={!data || exporting || adminDenied !== null}
              onClick={exportCsv}
              className="min-h-11 cursor-pointer rounded-full border-0 bg-black px-5 font-sans text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exporting ? "Exporting…" : "Export CSV"}
              {why(adminDenied)}
            </button>
          </>
        }
      />
      {notice && (
        <p
          role="status"
          className="m-0 rounded-[14px] bg-ap-lilac px-3.5 py-2.5 text-[13px] text-ap-body"
        >
          {notice}
        </p>
      )}
      {catalog.loading && !catalog.data && <Loading label="the tables" />}
      {catalog.error && <Failed message={catalog.error} onRetry={catalog.refetch} />}
      {catalog.data && !table && (
        // The source stays pickable: another one may still be readable.
        <div className="flex flex-wrap items-end gap-3 rounded-[20px] border border-ap-bad/30 bg-white p-5 shadow-ap">
          <p role="alert" className="m-0 flex-[1_1_260px] self-center text-sm text-ap-bad-ink">
            No tables could be read from {SOURCE_NAMES[source] ?? "this source"}.
          </p>
          <div className="w-full sm:w-56">{sourcePicker}</div>
          <button
            type="button"
            onClick={catalog.refetch}
            className="min-h-11 cursor-pointer rounded-full border border-ap-line bg-white px-4 text-sm font-semibold text-ap-ink"
          >
            Try again
          </button>
        </div>
      )}
      {table && (
        <>
          <form
            aria-label="Query"
            onSubmit={(e) => e.preventDefault()}
            className="flex flex-col gap-3.5 rounded-[20px] border border-ap-line bg-white p-[18px] shadow-ap"
          >
            {/* Wide screens give the table's name twice the room, as the design does. */}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(160px,100%),1fr))] gap-3 xl:grid-cols-[1fr_1.7fr_1.3fr_1fr_1fr]">
              {sourcePicker}
              <label className={fieldLabel}>
                Table
                <select
                  value={table.name}
                  onChange={(e) => {
                    setPreset(null);
                    set({
                      table: e.target.value,
                      cols: null,
                      filters: null,
                      sort: null,
                      date: null,
                    });
                  }}
                  className={`${control} font-mono text-[13px]`}
                >
                  {tables.map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={fieldLabel}>
                Date field
                <select
                  value={dateField}
                  disabled={source !== "production"}
                  onChange={(e) => set({ date: e.target.value || "" })}
                  className={`${control} font-mono text-[13px]`}
                >
                  {table.dateFields.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                  <option value="">no date range</option>
                </select>
              </label>
              <label className={fieldLabel}>
                From
                <input
                  type="date"
                  value={from}
                  max={to}
                  disabled={!dateField}
                  onChange={(e) => e.target.value && set({ from: e.target.value })}
                  className={control}
                />
              </label>
              <label className={fieldLabel}>
                To
                <input
                  type="date"
                  value={to}
                  min={from}
                  max={today}
                  disabled={!dateField}
                  onChange={(e) => e.target.value && set({ to: e.target.value })}
                  className={control}
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-ap-muted">Filters</span>
              {filters.map((f, i) => (
                <span
                  key={`${f.join("|")}-${i}`}
                  className="inline-flex items-center gap-1 rounded-full bg-ap-purple/10 pl-3 text-[13px] font-semibold text-ap-violet"
                >
                  <span className="font-mono text-xs">
                    {f[0]} {OP_LABELS[f[1]]} {f[1] === "null" || f[1] === "notnull" ? "" : f[2]}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove filter ${f[0]} ${OP_LABELS[f[1]]} ${f[2]}`}
                    onClick={() => {
                      const next = filters.filter((_, j) => j !== i);
                      set({ filters: next.length ? JSON.stringify(next) : null });
                    }}
                    className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-ap-violet"
                  >
                    <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
                      <path
                        d="M2 2l8 8M10 2l-8 8"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </span>
              ))}
              <AddFilter
                key={`${at}.${presetHere?.n ?? 0}`}
                table={table}
                masked={(source === "production" || source === "posthog") && !unlockToken}
                preset={presetHere?.column}
                onAdd={(f) => set({ filters: JSON.stringify([...filters, f]) })}
              />
              {dateField && (
                <QuickRanges today={today} onPick={(f, t) => set({ from: f, to: t })} />
              )}
            </div>
          </form>

          {saveName !== null && (
            <div className="flex flex-wrap items-center gap-2 rounded-[20px] border border-ap-line bg-white p-4">
              <input
                aria-label="View name"
                value={saveName}
                maxLength={80}
                placeholder={`${table.name} view`}
                onChange={(e) => setSaveName(e.target.value)}
                className={`${control} !w-64`}
              />
              <label className="flex items-center gap-2 text-[13px] text-ap-body">
                <input
                  type="checkbox"
                  checked={saveShared}
                  onChange={(e) => setSaveShared(e.target.checked)}
                  className="h-4 w-4 accent-ap-purple"
                />
                Share with the team
              </label>
              <button
                type="button"
                onClick={saveView}
                className="min-h-10 cursor-pointer rounded-full border-0 bg-black px-4 text-xs font-bold text-white"
              >
                Save
              </button>
            </div>
          )}

          <div className="flex flex-col gap-3.5 rounded-[20px] border border-ap-line bg-white px-[18px] py-4 shadow-ap">
            <div
              role="group"
              aria-label="Saved views"
              className="flex flex-wrap items-center gap-2"
            >
              <span className="mr-1 text-[11px] font-bold uppercase tracking-[0.1em] text-ap-label">
                Saved views
              </span>
              {saved.length === 0 && (
                <span className="text-[13px] text-ap-muted">
                  None yet: set up a query and press Save view.
                </span>
              )}
              {saved.map((v) => (
                <span
                  key={v.id}
                  className="inline-flex items-center rounded-full border border-ap-line"
                >
                  <button
                    type="button"
                    onClick={() => {
                      const next = new URLSearchParams();
                      for (const [k, val] of Object.entries(v.filters))
                        if ((KEYS as readonly string[]).includes(k)) next.set(k, val);
                      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
                    }}
                    className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border-0 bg-transparent px-3.5 font-sans text-[13px] font-semibold text-ap-ink"
                  >
                    {v.name}
                    <span className="text-[11px] font-medium text-ap-muted">
                      · {v.filters.table ?? "?"} ·{" "}
                      {v.mine ? (v.is_shared ? "shared" : "mine") : `${v.owner}, shared`}
                    </span>
                  </button>
                  {v.mine && (
                    <button
                      type="button"
                      aria-label={`Delete view ${v.name}`}
                      onClick={() => removeView(v.id)}
                      className="mr-1 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-ap-muted"
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
            <fieldset className="m-0 flex flex-wrap items-center gap-2 border-0 border-t border-ap-line p-0 pt-3.5">
              <legend className="float-left mr-3 p-0 text-[11px] font-bold uppercase tracking-[0.1em] text-ap-label">
                Columns
              </legend>
              {table.fields.map((f) => {
                const on = columns.includes(f.name);
                return (
                  <label
                    key={f.name}
                    className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full bg-ap-lilac px-3 font-mono text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => {
                        const next = on
                          ? columns.filter((c) => c !== f.name)
                          : table.fields
                              .map((x) => x.name)
                              .filter((n) => n === f.name || columns.includes(n));
                        if (next.length) set({ cols: next.join(",") });
                      }}
                      className="m-0 h-4 w-4 accent-ap-purple"
                    />
                    {f.name}
                    {f.privacy && (
                      <span className="font-sans text-[11px] font-bold text-ap-pii">PII</span>
                    )}
                  </label>
                );
              })}
            </fieldset>
          </div>

          <section
            id="results"
            aria-labelledby="h-res"
            className="flex min-w-0 flex-col gap-3.5 rounded-[20px] border border-ap-line bg-white p-5 shadow-ap"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2.5">
              <h2 id="h-res" className="m-0 break-all font-serif text-xl font-semibold">
                {table.name}
              </h2>
              <span className="text-[13px] text-ap-muted" aria-live="polite">
                {data && result.loading ? "Updating… " : ""}
                {data
                  ? data.rows.length === 0
                    ? "No rows match"
                    : posthog
                      ? `Showing ${data.rows.length.toLocaleString("en-US")} of ${total?.toLocaleString("en-US") ?? "?"} events, ${dir === "asc" && sort ? "oldest" : "newest"} first`
                      : `Showing ${first.toLocaleString("en-US")}–${last.toLocaleString("en-US")}${total !== null ? ` of ${total.toLocaleString("en-US")}` : ""} rows`
                  : result.loading
                    ? "Loading…"
                    : ""}
                {masks
                  ? masked
                    ? " · masked"
                    : ` · unlocked until ${unlock ? new Date(unlock.until).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : ""}`
                  : ""}
              </span>
            </div>
            {masks && masked && (
              <Unlock
                key={`${table.source}.${table.name}`}
                table={table}
                denied={adminDenied}
                onUnlocked={(token, until) =>
                  setUnlock({ table: `${table.source}.${table.name}`, token, until })
                }
              />
            )}
            {result.error && <Failed message={result.error} onRetry={result.refetch} />}
            {data && (
              // The rows on screen stay while the next ones load, dimmed, so a reader never
              // takes the old rows for the answer to the new query.
              <div
                aria-busy={result.loading}
                className={`overflow-x-auto rounded-[14px] border border-ap-line transition-opacity ${result.loading ? "opacity-50" : ""}`}
              >
                <table className="w-full border-collapse text-[13px] tabular-nums">
                  <thead className="bg-ap-ground">
                    <tr>
                      {data.columns.map((c) => {
                        const f = table.fields.find((x) => x.name === c);
                        // While masked, a personal field neither filters nor sorts (the server
                        // refuses both): no funnel and no arrows on it.
                        const usable = !(masked && f?.privacy);
                        const sortable =
                          usable &&
                          (!posthog || c === "timestamp") &&
                          !(
                            f &&
                            (f.type === "json" || f.type === "jsonb" || f.type.endsWith("[]"))
                          );
                        return (
                          <th
                            key={c}
                            scope="col"
                            aria-sort={
                              sort === c ? (dir === "asc" ? "ascending" : "descending") : "none"
                            }
                            className={`whitespace-nowrap px-3 py-2.5 font-mono text-[11px] font-bold text-ap-muted ${amounts.has(c) ? "text-right" : "text-left"}`}
                          >
                            {c}
                            {usable && (
                              <button
                                type="button"
                                aria-label={`Filter ${c}`}
                                onClick={() =>
                                  setPreset((p) => ({ at, column: c, n: (p?.n ?? 0) + 1 }))
                                }
                                className={`ml-1 inline-flex cursor-pointer border-0 bg-transparent p-0 align-[-1px] ${filters.some((x) => x[0] === c) ? "text-ap-violet" : "text-ap-muted"}`}
                              >
                                <FilterIcon />
                              </button>
                            )}
                            {sortable && (
                              <button
                                type="button"
                                aria-label={`Sort by ${c}`}
                                onClick={() =>
                                  set({
                                    sort: c,
                                    dir: sort === c && dir === "desc" ? "asc" : "desc",
                                  })
                                }
                                className={`ml-1 inline-flex cursor-pointer border-0 bg-transparent p-0 align-[-1px] ${sort === c ? "text-ap-violet" : "text-ap-muted"}`}
                              >
                                <SortIcon dir={sort === c ? (dir === "asc" ? 1 : -1) : null} />
                              </button>
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r, i) => (
                      <tr key={i} className="border-t border-ap-line">
                        {data.columns.map((c) => {
                          const type = types.get(c);
                          const empty = r[c] === null || r[c] === undefined;
                          const raw = cellText(r[c]);
                          const text = shownText(r[c], type);
                          const tone =
                            text === "[masked]"
                              ? "text-ap-pii"
                              : empty
                                ? "text-ap-muted"
                                : keys.has(c)
                                  ? "text-ap-violet"
                                  : "text-ap-ink";
                          return (
                            <td
                              key={c}
                              // The stored value, where the cell shortens or rewrites it.
                              title={
                                !empty && (raw !== text || raw.length > 80)
                                  ? raw.slice(0, 1000)
                                  : undefined
                              }
                              className={`max-w-[320px] truncate px-3 py-2.5 ${tone} ${amounts.has(c) ? "text-right" : ""} ${keys.has(c) ? "font-mono text-xs" : ""}`}
                            >
                              {c === "status" && !empty && text !== "[masked]" ? (
                                <span
                                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${statusTone(text)}`}
                                >
                                  {text}
                                </span>
                              ) : text.length > 120 ? (
                                `${text.slice(0, 120)}…`
                              ) : (
                                text
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-2.5">
              <label className="flex items-center gap-2 text-[13px] text-ap-muted">
                Rows per page
                <select
                  value={size}
                  onChange={(e) => set({ size: e.target.value })}
                  className={`${control} !min-h-10 !w-auto`}
                >
                  {PAGE_SIZES.filter((n) => source !== "posthog" || n <= 200).map((n) => (
                    <option key={n} value={n}>
                      {n.toLocaleString("en-US")}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  className={pill}
                  disabled={posthog ? back.length === 0 : page <= 1}
                  onClick={() => {
                    if (!posthog) return set({ page: String(page - 1) });
                    const prev = back[back.length - 1] ?? "";
                    setBack(back.slice(0, -1));
                    set({ cursor: prev || null });
                  }}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className={pill}
                  disabled={
                    posthog
                      ? !data?.next
                      : !data || data.rows.length < size || (total !== null && last >= total)
                  }
                  onClick={() => {
                    if (!posthog) return set({ page: String(page + 1) });
                    if (!data?.next) return;
                    setBack([...back, cursor]);
                    set({ cursor: data.next });
                  }}
                >
                  Next
                </button>
              </div>
            </nav>
            {data && (
              <details className="text-xs text-ap-muted">
                <summary className="cursor-pointer font-semibold">The query</summary>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-xl bg-ap-ground p-3 font-mono text-xs text-ap-body">
                  {data.sql}
                </pre>
              </details>
            )}
            <p className="m-0 text-xs leading-relaxed text-ap-muted">
              Masked as the team&rsquo;s copy of the data is: emails read as a code (the same
              address, the same code, all day), names, links, tokens, card details and the email,
              name and postcode answers read [masked]. While masked, filters and sorting cannot use
              a personal field or look for an email address, and text is matched whole. Save view:
              editors and admins. Unlock and Export CSV: admins only; an export reads up to 10,000
              rows (PostHog 200) and is logged.
            </p>
            {posthog && (
              <p className="m-0 text-xs leading-relaxed text-ap-muted">
                PostHog pages by time, newest first, and sorts by time only.
              </p>
            )}
          </section>
        </>
      )}
    </>
  );
}
