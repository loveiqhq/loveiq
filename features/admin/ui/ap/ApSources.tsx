"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type {
  CatalogField,
  CatalogPayload,
  CatalogSource,
  CatalogTable,
  SourceKey,
} from "@features/admin/server/ap/catalog";
import { berlinTime } from "@features/admin/server/ap/explorer-spec";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import { getCsrfToken } from "@shared/http/csrf-client";

import { exportTables } from "./csv";
import { AP_BASE } from "./nav";
import { Failed, FilterIcon, HeaderFilter, Loading, PageHeader, SortIcon } from "./kit";
import { useApRole, useApStatus, type ApStatus } from "./status";

const PRIVACY_TAG: Record<"masked" | "partly", { label: string; title: string }> = {
  masked: { label: "PII", title: "Personal: masked in the raw data explorer unless unlocked" },
  partly: {
    label: "Partly PII",
    title: "Some values are personal (the email, name and postcode answers): those are masked",
  },
};

const FACT = "rounded-full bg-ap-ground px-2.5 py-1.5 text-xs text-ap-body";
const FIELD_COLUMNS =
  "minmax(170px,1.2fr) minmax(100px,0.7fr) minmax(260px,2.4fr) minmax(90px,0.6fr)";
const HEAD =
  "flex items-center gap-1 px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-ap-muted";
const headButton = (on: boolean) =>
  `inline-flex cursor-pointer border-0 bg-transparent p-0.5 ${on ? "text-ap-violet" : "text-ap-muted"}`;

/**
 * PostHog's card from the live check the sidebar makes (its last event), not from whether a
 * key is set.
 */
function livePosthog(s: CatalogSource, live: ApStatus | null, failed: boolean): CatalogSource {
  if (!s.ok) return s;
  if (!live) return { ...s, ok: false, status: failed ? "Unknown" : "Checking" };
  if (!live.posthog.ok) return { ...s, ok: false, status: "Not reachable" };
  const last = live.posthog.lastEvent;
  return {
    ...s,
    status: last ? "Live" : "Connected",
    fresh: last ? `Last event ${berlinTime(last, ", ")}` : "No events in two days",
  };
}

/** The catalog's place in the URL: source, table and search. */
function useCatalogState(payload: CatalogPayload | null) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const source = (params.get("source") ?? "production") as SourceKey;
  const tables = payload?.tables.filter((t) => t.source === source) ?? [];
  const table =
    tables.find((t) => t.name === params.get("table")) ??
    tables.find((t) => t.name === "survey_submission") ??
    tables[0] ??
    null;
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  return { source, tables, table, q: params.get("q") ?? "", set };
}

function Description({
  value,
  origin,
  editedBy,
  editedAt,
  onSave,
  label,
  reveal = false,
}: {
  value: string;
  origin: CatalogField["origin"];
  editedBy: string | null;
  editedAt: string | null;
  onSave: (text: string) => Promise<string | null>;
  label: string;
  /** Edit appears on the row's hover or on keyboard focus (a field row); always on touch. */
  reveal?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const { canEdit } = useApRole();
  const [text, setText] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (editing) {
    return (
      <span className="flex flex-col gap-1.5">
        <textarea
          aria-label={`Description of ${label}`}
          value={text}
          maxLength={600}
          rows={3}
          onChange={(e) => setText(e.target.value)}
          className="w-full rounded-lg border border-ap-ink/20 p-2 font-sans text-[13px] leading-normal text-ap-ink"
        />
        <span className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const err = await onSave(text.trim());
              setBusy(false);
              if (err) setError(err);
              else {
                setError(null);
                setEditing(false);
              }
            }}
            className="min-h-9 cursor-pointer rounded-full border-0 bg-black px-3.5 text-xs font-bold text-white disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setText(value);
              setError(null);
              setEditing(false);
            }}
            className="min-h-9 cursor-pointer rounded-full border border-ap-line bg-white px-3.5 text-xs font-semibold text-ap-ink"
          >
            Cancel
          </button>
          <span className="text-[11px] text-ap-muted">Empty and save to go back to the draft.</span>
          {error && <span className="text-xs text-ap-bad-ink">{error}</span>}
        </span>
      </span>
    );
  }
  return (
    <span className="flex flex-col gap-1">
      <span className={value ? "" : "italic text-ap-muted"}>{value || "No description yet."}</span>
      <span className="flex flex-wrap items-center gap-2 text-[11px] text-ap-muted">
        {origin === "team" && editedBy && (
          <span>
            By {editedBy}, {editedAt?.slice(0, 10)}
          </span>
        )}
        {origin === "draft" && (
          <span className="rounded-full bg-ap-ground px-2 py-0.5 font-semibold">draft</span>
        )}
        {origin === "database" && <span>From the database</span>}
        {canEdit && (
          <button
            type="button"
            aria-label={`Edit the description of ${label}`}
            onClick={() => {
              setText(value);
              setEditing(true);
            }}
            className={`inline-flex min-h-8 cursor-pointer items-center border-0 bg-transparent px-1 text-[12px] font-bold text-ap-plum underline-offset-2 hover:underline ${
              reveal
                ? "focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:opacity-0"
                : ""
            }`}
          >
            Edit
          </button>
        )}
      </span>
    </span>
  );
}

/** The table's row count and newest row; `fresh` is the source's, for a table without a date. */
function TableStats({ table, fresh }: { table: CatalogTable; fresh: string }) {
  const params = useMemo(
    () => ({ source: table.source, table: table.name }),
    [table.source, table.name]
  );
  const { data, loading } = useAdminFetch<{ rows: number | null; newest: string | null }>(
    "/api/admin/ap/catalog/rows",
    params
  );
  const newest = data?.newest ? berlinTime(data.newest, ", ") : null;
  return (
    <>
      <span className={FACT}>
        <strong>Rows</strong>{" "}
        {loading
          ? "…"
          : data?.rows === null || data?.rows === undefined
            ? "—"
            : data.rows.toLocaleString("en-US")}
      </span>
      <span className={FACT}>
        <strong>Fresh</strong> {loading ? "…" : newest ? `newest row ${newest}` : fresh}
      </span>
    </>
  );
}

/** A table's fields: filtered by name, type and privacy, sorted by name, as the design draws. */
function FieldGrid({
  table,
  q,
  onSave,
}: {
  table: CatalogTable;
  q: string;
  onSave: (column: string, text: string) => Promise<string | null>;
}) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [typing, setTyping] = useState(false);
  const [type, setType] = useState("");
  const [personal, setPersonal] = useState(false);
  const [dir, setDir] = useState<1 | -1 | null>(null);
  const types = [...new Set(table.fields.map((f) => f.type))].sort();
  const needle = name.trim().toLowerCase();
  const fields = table.fields.filter(
    (f) =>
      (!needle || f.name.toLowerCase().includes(needle)) &&
      (!type || f.type === type) &&
      (!personal || f.privacy)
  );
  if (dir) fields.sort((a, b) => a.name.localeCompare(b.name) * dir);
  const hit = q.trim().toLowerCase();
  return (
    <>
      {(naming || typing) && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {naming && <HeaderFilter label="Field" value={name} onChange={setName} />}
          {typing && (
            <label className="flex items-center gap-2 text-xs font-semibold text-ap-body">
              <span>Filter type</span>
              <select
                autoFocus
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="min-h-9 rounded-full border border-ap-line bg-white px-3.5 font-mono text-[13px] text-ap-ink"
              >
                <option value="">All types</option>
                {types.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      <div className="overflow-x-auto rounded-[14px] border border-ap-line">
        <div role="table" aria-label={`Fields of ${table.name}`} style={{ minWidth: 720 }}>
          <div
            role="row"
            className="grid bg-ap-ground"
            style={{ gridTemplateColumns: FIELD_COLUMNS }}
          >
            <span
              role="columnheader"
              aria-sort={dir ? (dir === 1 ? "ascending" : "descending") : "none"}
              className={HEAD}
            >
              Field
              <button
                type="button"
                aria-label="Filter Field"
                aria-expanded={naming}
                onClick={() => {
                  if (naming) setName("");
                  setNaming(!naming);
                }}
                className={headButton(naming || Boolean(name))}
              >
                <FilterIcon />
              </button>
              <button
                type="button"
                aria-label="Sort by Field"
                onClick={() => setDir(dir === 1 ? -1 : 1)}
                className={headButton(dir !== null)}
              >
                <SortIcon dir={dir} />
              </button>
            </span>
            <span role="columnheader" className={HEAD}>
              Type
              <button
                type="button"
                aria-label="Filter Type"
                aria-expanded={typing}
                onClick={() => {
                  if (typing) setType("");
                  setTyping(!typing);
                }}
                className={headButton(typing || Boolean(type))}
              >
                <FilterIcon />
              </button>
            </span>
            <span role="columnheader" className={HEAD}>
              Description
            </span>
            <span role="columnheader" className={HEAD}>
              Privacy
              <button
                type="button"
                aria-label="Personal fields only"
                aria-pressed={personal}
                onClick={() => setPersonal(!personal)}
                className={headButton(personal)}
              >
                <FilterIcon />
              </button>
            </span>
          </div>
          {fields.length === 0 && (
            <p className="m-0 border-t border-ap-line px-3.5 py-3 text-sm text-ap-muted">
              No fields match the filters.
            </p>
          )}
          {fields.map((f) => (
            <div
              key={f.name}
              role="row"
              className={`group grid items-start border-t border-ap-line ${hit && f.name.toLowerCase().includes(hit) ? "bg-ap-lilac" : ""}`}
              style={{ gridTemplateColumns: FIELD_COLUMNS }}
            >
              <span
                role="cell"
                className="flex flex-col gap-0.5 px-3.5 py-[11px] font-mono text-[13px] font-semibold text-ap-violet [overflow-wrap:anywhere]"
              >
                {f.name}
                {(f.pk || f.joins) && (
                  <span className="font-sans text-[11px] font-medium text-ap-muted">
                    {f.pk ? "key" : `joins ${f.joins}`}
                  </span>
                )}
              </span>
              <span role="cell" className="px-3.5 py-[11px] font-mono text-xs text-ap-muted">
                {f.type}
              </span>
              <span
                role="cell"
                className="px-3.5 py-[11px] text-[13px] leading-normal text-ap-body"
              >
                <Description
                  key={`${table.source}.${table.name}.${f.name}`}
                  label={f.name}
                  value={f.description}
                  origin={f.origin}
                  editedBy={f.editedBy}
                  editedAt={f.editedAt}
                  onSave={(text) => onSave(f.name, text)}
                  reveal
                />
              </span>
              <span role="cell" className="px-3.5 py-[11px]">
                {f.privacy && (
                  <span
                    title={PRIVACY_TAG[f.privacy].title}
                    className="rounded-full bg-ap-pii/[0.12] px-2 py-[3px] text-[11px] font-bold text-ap-pii"
                  >
                    {PRIVACY_TAG[f.privacy].label}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function SearchResults({
  payload,
  q,
  onPick,
}: {
  payload: CatalogPayload;
  q: string;
  onPick: (t: CatalogTable) => void;
}) {
  const needle = q.trim().toLowerCase();
  const hits = payload.tables.flatMap((t) => {
    const fields = t.fields.filter(
      (f) => f.name.toLowerCase().includes(needle) || f.description.toLowerCase().includes(needle)
    );
    const own =
      t.name.toLowerCase().includes(needle) || t.description.toLowerCase().includes(needle);
    return own || fields.length ? [{ t, fields }] : [];
  });
  const sourceName = (k: SourceKey) => payload.sources.find((s) => s.key === k)?.name ?? k;
  return (
    <section
      aria-label="Search results"
      className="flex flex-col gap-2 rounded-[20px] border border-ap-line bg-white p-4 shadow-ap"
    >
      <span className="px-2 text-[11px] font-bold uppercase tracking-[0.1em] text-ap-label">
        {hits.length} {hits.length === 1 ? "table" : "tables"} match &ldquo;{q.trim()}&rdquo;
      </span>
      {hits.slice(0, 40).map(({ t, fields }) => (
        <button
          key={`${t.source}.${t.name}`}
          type="button"
          onClick={() => onPick(t)}
          className="flex cursor-pointer flex-col items-start gap-0.5 rounded-xl border-0 bg-transparent px-2.5 py-2 text-left hover:bg-ap-ground"
        >
          <span className="font-mono text-[13px] font-semibold text-ap-violet">
            {t.name}{" "}
            <span className="font-sans text-[11px] font-semibold text-ap-muted">
              · {sourceName(t.source)} · {t.group}
            </span>
          </span>
          {fields.length > 0 && (
            <span className="font-mono text-xs text-ap-body">
              {fields
                .slice(0, 8)
                .map((f) => f.name)
                .join(", ")}
              {fields.length > 8 ? ` +${fields.length - 8}` : ""}
            </span>
          )}
        </button>
      ))}
    </section>
  );
}

export default function ApSources() {
  const { data, loading, error, refetch } = useAdminFetch<CatalogPayload>("/api/admin/ap/catalog");
  const { source, tables, table, q, set } = useCatalogState(data);
  const [search, setSearch] = useState(q);
  const { status: live, error: liveError } = useApStatus();

  const save = async (
    t: CatalogTable,
    column: string,
    description: string
  ): Promise<string | null> => {
    const res = await fetch("/api/admin/ap/catalog", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-csrf-token": getCsrfToken() ?? "" },
      body: JSON.stringify({ source: t.source, table: t.name, column, description }),
    });
    if (!res.ok)
      return (
        ((await res.json().catch(() => null)) as { error?: string } | null)?.error ??
        "Could not save."
      );
    refetch();
    return null;
  };

  const current = data?.sources.find((s) => s.key === source);
  return (
    <>
      <PageHeader
        crumbs={["Data sources", "Catalog"]}
        title="Data sources"
        description="Every source, its tables and what each field means. Open any table as raw data with date and field filters."
        actions={
          <label className="flex w-full min-w-0 flex-col gap-1 text-xs font-bold text-ap-muted sm:w-[340px]">
            Search tables and fields
            <input
              type="search"
              value={search}
              placeholder="e.g. utm_source, refund, archetype"
              onChange={(e) => {
                setSearch(e.target.value);
                set({ q: e.target.value || null });
              }}
              className="min-h-11 w-full rounded-lg border border-ap-ink/[0.18] bg-white px-3 font-sans text-sm font-normal text-ap-ink"
            />
          </label>
        }
      />
      {loading && !data && <Loading label="the catalog" />}
      {error && <Failed message={error} onRetry={refetch} />}
      {data && (
        <>
          <div
            className="grid gap-3.5"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))" }}
          >
            {data.sources.map((src) => {
              const s = src.key === "posthog" ? livePosthog(src, live, Boolean(liveError)) : src;
              const on = s.key === source;
              return (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set({ source: s.key, table: null })}
                  className={`flex cursor-pointer flex-col gap-2.5 rounded-[20px] bg-white p-[18px] text-left text-ap-ink shadow-ap ${
                    on ? "border-2 border-ap-purple" : "border border-ap-line"
                  }`}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="font-serif text-lg font-semibold">{s.name}</span>
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-bold ${s.ok ? "text-ap-good" : "text-ap-muted"}`}
                    >
                      <span
                        aria-hidden="true"
                        className={`h-2 w-2 rounded-full ${s.ok ? "bg-ap-good" : "bg-ap-muted"}`}
                      />
                      {s.status}
                    </span>
                  </span>
                  <span className="text-[13px] leading-normal text-ap-muted">{s.description}</span>
                  <span className="flex flex-wrap gap-3.5 text-xs text-ap-body">
                    <span>
                      <strong>{s.tables}</strong> {s.tables === 1 ? "table" : "tables"}
                    </span>
                    <span>{s.fresh}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {q.trim() && (
            <SearchResults
              payload={data}
              q={q}
              onPick={(t) => {
                setSearch("");
                set({ source: t.source, table: t.name, q: null });
              }}
            />
          )}

          <div className="flex flex-wrap items-start gap-5">
            {/* Its own scroll, so the table's fields stay in reach; beside them it stays put. */}
            <nav
              aria-label="Tables"
              className="flex max-h-[420px] min-w-0 flex-[1_1_300px] flex-col gap-1 overflow-y-auto rounded-[20px] border border-ap-line bg-white p-4 xl:sticky xl:top-6 xl:max-h-[calc(100vh-48px)]"
            >
              <span className="px-2 pb-2 pt-1 text-[11px] font-bold uppercase tracking-[0.1em] text-ap-label">
                {current?.name} · tables
              </span>
              {tables.length === 0 && (
                <span className="px-2 text-sm text-ap-muted">No tables could be read.</span>
              )}
              {tables.map((t) => {
                const on = t.name === table?.name;
                return (
                  <button
                    key={t.name}
                    type="button"
                    title={t.name}
                    aria-pressed={on}
                    onClick={() => set({ table: t.name })}
                    className={`flex min-h-10 cursor-pointer items-center justify-between gap-2 rounded-full border-0 px-2.5 py-1 text-left font-sans text-[13px] ${
                      on
                        ? "bg-ap-purple/10 font-bold text-ap-violet"
                        : "bg-transparent font-medium text-ap-ink hover:bg-ap-ground"
                    }`}
                  >
                    <span className="min-w-0 truncate">{t.name}</span>
                    <span className="shrink-0 text-[11px] font-semibold text-ap-muted">
                      {t.group}
                    </span>
                  </button>
                );
              })}
            </nav>

            {table && (
              <section
                aria-labelledby="h-table"
                className="flex min-w-0 flex-[999_1_560px] flex-col gap-[18px] rounded-[20px] border border-ap-line bg-white p-5 shadow-ap sm:p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ap-label">
                      {current?.name} · {table.group}
                    </span>
                    <h2
                      id="h-table"
                      className="m-0 break-all font-mono text-[22px] font-semibold text-ap-ink"
                    >
                      {table.name}
                    </h2>
                    <div className="text-sm leading-relaxed text-ap-body">
                      <Description
                        key={`${table.source}.${table.name}`}
                        label={table.name}
                        value={table.description}
                        origin={table.origin}
                        editedBy={table.editedBy}
                        editedAt={table.editedAt}
                        onSave={(text) => save(table, "", text)}
                      />
                    </div>
                    {table.closed && (
                      <p className="m-0 text-xs font-semibold text-ap-plum">{table.closed}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!table.closed ? (
                      <a
                        href={`${AP_BASE}/explorer?source=${table.source}&table=${table.name}`}
                        className="inline-flex min-h-11 items-center rounded-full bg-black px-[18px] text-sm font-bold text-white no-underline"
                      >
                        Open raw data
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="min-h-11 cursor-pointer rounded-full border border-ap-line bg-white px-[18px] font-sans text-sm font-semibold text-ap-ink"
                      onClick={() =>
                        exportTables(`ap-catalog-${table.source}-${table.name}`, [
                          {
                            name: `${table.name} (${current?.name})`,
                            table: {
                              columns: [
                                { label: "Field", unit: "text" },
                                { label: "Type", unit: "text" },
                                { label: "Description", unit: "text" },
                                { label: "Privacy", unit: "text" },
                              ],
                              rows: table.fields.map((f) => ({
                                label: f.name,
                                values: [
                                  f.type,
                                  f.description,
                                  f.privacy ? PRIVACY_TAG[f.privacy].label : "",
                                ],
                              })),
                            },
                          },
                        ])
                      }
                    >
                      Export field list
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    ["Key", table.key.join(" + ") || "none"],
                    ["Joins", table.joins.join(", ") || "none"],
                    ["Fields", String(table.fields.length)],
                  ].map(([k, v]) => (
                    <span key={k} className={FACT}>
                      <strong>{k}</strong> {v}
                    </span>
                  ))}
                  <TableStats
                    key={`${table.source}.${table.name}`}
                    table={table}
                    fresh={current?.fresh ?? ""}
                  />
                </div>
                <FieldGrid
                  key={`${table.source}.${table.name}`}
                  table={table}
                  q={q}
                  onSave={(column, text) => save(table, column, text)}
                />
                <p className="m-0 text-xs leading-relaxed text-ap-muted">
                  Field names come from the live schema. Descriptions are drafts for the team to
                  confirm; edit them in place. PII fields read [masked] in the raw data explorer, as
                  in the team&rsquo;s copy of the data; free text keeps its words, so a name someone
                  typed can remain. Not listed: the company brain&rsquo;s own index, job plumbing
                  and the log of deletion requests.
                </p>
              </section>
            )}
          </div>
        </>
      )}
    </>
  );
}
