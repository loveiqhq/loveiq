"use client";

import { useState } from "react";

import type { DashboardPayload } from "@features/admin/server/ap/assessment";
import { fmt } from "@features/admin/server/ap/format";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";

import ApFilterBar from "./ApFilterBar";
import { RangeLine } from "./ApOverview";
import { exportTables } from "./csv";
import {
  AllTraffic,
  Bar,
  BlackButton,
  Busy,
  Card,
  DataTable,
  Eyebrow,
  Failed,
  FilterIcon,
  HeaderFilter,
  KpiTile,
  LiveBadge,
  Loading,
  NotTracked,
  PageHeader,
  Pills,
  SectionHead,
  SortIcon,
  TileGrid,
  useHashScroll,
} from "./kit";
import { ASSESSMENT_A } from "./nav";
import { useApFilters } from "./useApFilters";

type Tab = "sources" | "new" | "perf";

export default function ApDashboard() {
  const { params, query } = useApFilters();
  const { data, loading, error, refetch } = useAdminFetch<DashboardPayload>(
    "/api/admin/ap/assessment",
    params
  );
  useHashScroll(Boolean(data));
  const [tab, setTab] = useState<Tab>("sources");

  return (
    <>
      <PageHeader
        crumbs={["Assessments", "Assessment A", "Dashboard"]}
        title="Assessment A"
        badge={<LiveBadge />}
        description={`LoveIQ sexual personality test${data ? ` · ${data.questions} questions` : ""} · 14 archetypes${data ? ` · ${data.range.label}${data.compare ? ` vs ${data.compare.label}` : ""}` : ""}.`}
        actions={
          <BlackButton
            disabled={!data}
            onClick={() =>
              data &&
              exportTables(
                `ap-assessment-a-${data.range.from}-${data.range.to}`,
                [
                  {
                    name: "Scorecard",
                    table: {
                      columns: [
                        { label: "KPI", unit: "text" },
                        { label: "Value", unit: "text" },
                        { label: "Note", unit: "text" },
                      ],
                      rows: data.scorecard.map((s) => ({
                        label: `${s.group} · ${s.label}`,
                        values: [fmt(s.unit, s.value), s.note],
                      })),
                    },
                  },
                  {
                    name: "Journey",
                    table: {
                      columns: [
                        { label: "Step", unit: "text" },
                        { label: "People", unit: "count" },
                        { label: "Step rate", unit: "text" },
                      ],
                      rows: data.journey.map((j) => ({
                        label: j.label,
                        values: [j.value, j.step],
                      })),
                    },
                  },
                  { name: "Sources", table: data.sources },
                  {
                    name: "Prices",
                    table: {
                      columns: [
                        { label: "Plan · price", unit: "text" },
                        { label: "Quoted", unit: "count" },
                        { label: "Checkouts", unit: "count" },
                        { label: "Sales", unit: "count" },
                        { label: "Payment CVR", unit: "pct" },
                        { label: "Revenue", unit: "eur" },
                      ],
                      rows: data.prices.map((r) => ({
                        label: `${r.planLabel} · ${priceText(r)}`,
                        values: [r.quoted, r.checkouts, r.sales, r.cvr, r.revenue],
                      })),
                    },
                  },
                ],
                data.tiles
              )
            }
          >
            Export CSV
          </BlackButton>
        }
      />
      <ApFilterBar scope="assessment" />
      {loading && !data && <Loading label="the dashboard" />}
      {error && <Failed message={error} onRetry={refetch} />}
      {data && !data.launched && (
        <Card>
          <p className="m-0 text-sm text-ap-muted">
            This assessment has not launched yet, so there is nothing to count.
          </p>
        </Card>
      )}
      {data && data.launched && (
        <Busy busy={loading}>
          <RangeLine data={data} withRange={false} />
          <section id="dashboard" aria-labelledby="h-dash" className="flex flex-col gap-4">
            <h2 id="h-dash" className="m-0 font-serif text-2xl font-semibold">
              Dashboard
            </h2>
            <TileGrid min={200}>
              {data.tiles.map((t) => (
                <KpiTile key={t.key} tile={t} size="md" />
              ))}
            </TileGrid>

            <Card labelledBy="h-journey">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 id="h-journey" className="m-0 font-serif text-lg font-semibold">
                  Journey, step by step
                </h3>
                <span className="text-[13px] text-ap-muted">
                  Each step links to its report · % = of the step before
                </span>
              </div>
              <ol
                className="m-0 grid list-none gap-2.5 p-0"
                style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(128px, 100%), 1fr))" }}
              >
                {data.journey.map((j, i) => (
                  <li key={j.n} className="flex">
                    <a
                      href={
                        j.href.startsWith("#")
                          ? j.href
                          : `${ASSESSMENT_A}/${j.href.split("#")[0]}${query}${j.href.includes("#") ? `#${j.href.split("#")[1]}` : ""}`
                      }
                      className={`flex min-h-[120px] flex-1 flex-col gap-1.5 rounded-[14px] p-3.5 text-ap-ink no-underline ${i % 2 ? "bg-ap-ground" : "bg-ap-lilac"}`}
                    >
                      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ap-plum">
                        Step {j.n}
                      </span>
                      <span className="text-[13px] font-bold">{j.label}</span>
                      <span className="font-serif text-[22px] font-semibold tabular-nums">
                        {j.value === null ? "—" : fmt("count", j.value)}
                      </span>
                      <span className="text-xs text-ap-muted">{j.step}</span>
                    </a>
                  </li>
                ))}
              </ol>
              <p className="m-0 text-xs text-ap-muted">
                Steps 4 to 7 follow the people who submitted in the range, up to today.
              </p>
            </Card>
            <Scorecard rows={data.scorecard} />
          </section>

          <section
            id="traffic"
            aria-labelledby="h-traffic"
            className="flex scroll-mt-20 lg:scroll-mt-6 flex-col gap-4"
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-col gap-1.5">
                <Eyebrow>Assessment A · Traffic</Eyebrow>
                <h2 id="h-traffic" className="m-0 font-serif text-2xl font-semibold">
                  Traffic
                </h2>
              </div>
              <Pills
                label="Traffic report"
                onWhite
                options={[
                  { value: "sources", label: "Sources" },
                  { value: "new", label: "New & return" },
                  { value: "perf", label: "Performance" },
                ]}
                value={tab}
                onChange={setTab}
              />
            </div>
            <Card>
              {tab === "sources" && (
                <>
                  <h3 className="m-0 font-serif text-lg font-semibold">Sources</h3>
                  <NotTracked>Split by the survey&apos;s source · visits not split</NotTracked>
                  <DataTable table={data.sources} minWidth={760} />
                </>
              )}
              {tab === "new" && <NewReturningPanel data={data} />}
              {tab === "perf" && (
                <>
                  <h3 className="m-0 font-serif text-lg font-semibold">Performance by source</h3>
                  <NotTracked>Split by the survey&apos;s source · visits not split</NotTracked>
                  <div
                    className="grid gap-6"
                    style={{
                      gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))",
                    }}
                  >
                    <SourceBars
                      title="Survey completion"
                      rows={data.performance.map((r) => ({ label: r.label, value: r.completion }))}
                      unit="pct"
                    />
                    <SourceBars
                      title="Payment CVR (of submissions)"
                      rows={data.performance.map((r) => ({ label: r.label, value: r.paymentCvr }))}
                      unit="pct"
                    />
                    <SourceBars
                      title="€ revenue per submission"
                      rows={data.performance.map((r) => ({ label: r.label, value: r.perSub }))}
                      unit="eur3"
                      color="#fe6839"
                    />
                  </div>
                  <p className="m-0 text-xs text-ap-muted">
                    Per submission, not per visit: visits can&rsquo;t be split by source (the visit
                    log misses most ad clicks).
                  </p>
                </>
              )}
            </Card>
          </section>

          <Card id="payment" labelledBy="h-pay">
            <SectionHead
              id="h-pay"
              eyebrow="Assessment A · Payment"
              title="Prices"
              description="Sales per plan and price point for the prices quoted in the range · comps (€0 unlocks) are not counted as sales"
              align="end"
              right={
                <a
                  href="/admin/ap/explorer?table=report_price_quote"
                  className="text-[13px] font-bold text-ap-plum hover:text-ap-violet"
                >
                  Open report_price_quote →
                </a>
              }
            />
            {data.pricesBlocked ? (
              <p className="m-0 text-sm text-ap-muted">{data.pricesBlocked}</p>
            ) : (
              <PricesTable rows={data.prices} />
            )}
            <p className="m-0 text-xs text-ap-muted">
              Quoted and checkouts come from report_price_quote; sales and revenue from payment, on
              those quotes. Payment CVR = sales ÷ quoted. A reader is quoted every plan, so the rows
              of one price list share their readers.
            </p>
          </Card>
        </Busy>
      )}
    </>
  );
}

function SourceBars({
  title,
  rows,
  unit,
  color = "#795fc8",
}: {
  title: string;
  rows: Array<{ label: string; value: number | null }>;
  unit: "pct" | "eur3";
  color?: string;
}) {
  const max = Math.max(0, ...rows.map((r) => r.value ?? 0)) || 1;
  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-[13px] font-bold text-ap-body">{title}</span>
      {rows.map((r) => (
        <div
          key={r.label}
          className="grid items-center gap-2.5 text-[13px]"
          style={{ gridTemplateColumns: "120px minmax(0,1fr) 64px" }}
        >
          <span>{r.label}</span>
          <Bar pct={r.value === null ? null : r.value / max} color={color} />
          <span className="text-right font-bold tabular-nums">{fmt(unit, r.value)}</span>
        </div>
      ))}
    </div>
  );
}

function NewReturningPanel({ data }: { data: DashboardPayload }) {
  const nr = data.newReturning;
  if (!nr || !nr.ok) {
    return (
      <>
        <h3 className="m-0 font-serif text-lg font-semibold">New &amp; returning visitors</h3>
        <p className="m-0 text-sm text-ap-muted">
          PostHog could not be read: {nr && !nr.ok ? nr.error : "no answer"}
        </p>
      </>
    );
  }
  const total = nr.value.new.visitors + nr.value.returning.visitors;
  const share = (n: number) => (total ? n / total : null);
  return (
    <div className="flex flex-col gap-4">
      <h3 className="m-0 font-serif text-lg font-semibold">New &amp; returning visitors</h3>
      <NotTracked>From PostHog · sees about a quarter of our visits · from 23 Aug 2026</NotTracked>
      <AllTraffic note={data.narrowed} />
      <div className="flex h-[18px] overflow-hidden rounded-full" aria-hidden="true">
        <span
          style={{ width: `${(share(nr.value.new.visitors) ?? 0) * 100}%`, background: "#795fc8" }}
        />
        <span
          style={{
            width: `${(share(nr.value.returning.visitors) ?? 0) * 100}%`,
            background: "#fe6839",
          }}
        />
      </div>
      <div
        className="grid gap-3.5"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))" }}
      >
        {(
          [
            ["New", nr.value.new, "#795fc8"],
            ["Returning", nr.value.returning, "#fe6839"],
          ] as const
        ).map(([label, g, color]) => (
          <div key={label} className="flex flex-col gap-1.5 rounded-[14px] bg-ap-ground p-4">
            <span className="flex items-center gap-2 text-[13px] font-bold">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: color }}
              />
              {label} · {fmt("pct", share(g.visitors), 0)}
            </span>
            <span className="font-serif text-2xl font-semibold">{fmt("count", g.visitors)}</span>
            <span className="text-[13px] text-ap-muted">
              Survey CVR {fmt("pct", g.visitors ? g.completed / g.visitors : null)} · started{" "}
              {fmt("pct", g.visitors ? g.started / g.visitors : null)}
            </span>
          </div>
        ))}
      </div>
      <p className="m-0 text-xs leading-relaxed text-ap-muted">
        A visitor is new when PostHog had not seen their browser before the range. Survey CVR:
        finished the survey ÷ visitors. Revenue per visit is not split here: our payments cannot be
        tied to PostHog&apos;s visitors, and its own purchase event comes from the browser and
        misses sales.
      </p>
    </div>
  );
}

type PriceKey = "planLabel" | "price" | "quoted" | "checkouts" | "sales" | "cvr" | "revenue";

type PriceFilter = "plan" | "price";

const priceText = (r: DashboardPayload["prices"][number]) =>
  `${fmt("eur", r.price, 2)}${r.priceArm ? ` · ${r.priceArm}` : ""}`;

function PricesTable({ rows: all }: { rows: DashboardPayload["prices"] }) {
  const [sort, setSort] = useState<{ key: PriceKey; dir: 1 | -1 } | null>(null);
  const [open, setOpen] = useState<PriceFilter | null>(null);
  const [filter, setFilter] = useState<Record<PriceFilter, string>>({ plan: "", price: "" });
  if (all.length === 0)
    return <p className="m-0 text-sm text-ap-muted">No price was quoted in this range.</p>;
  const has = (text: string, k: PriceFilter) =>
    text.toLowerCase().includes(filter[k].trim().toLowerCase());
  const kept = all.filter((r) => has(r.planLabel, "plan") && has(priceText(r), "price"));
  const rows = sort
    ? [...kept].sort((a, b) => {
        const x = a[sort.key];
        const y = b[sort.key];
        if (typeof x === "string" || typeof y === "string")
          return String(x).localeCompare(String(y)) * sort.dir;
        return ((x ?? -Infinity) - (y ?? -Infinity)) * sort.dir;
      })
    : kept;
  const head: Array<[string, PriceKey | null]> = [
    ["Plan", "planLabel"],
    ["Price", "price"],
    ["Quoted", "quoted"],
    ["Checkouts", "checkouts"],
    ["Sales", "sales"],
    ["Payment CVR", "cvr"],
    ["Revenue", "revenue"],
  ];
  const gtc = "minmax(130px,1.2fr) minmax(110px,0.9fr) repeat(5, minmax(90px,1fr))";
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      {open && (
        <HeaderFilter
          label={open === "plan" ? "Plan" : "Price"}
          value={filter[open]}
          onChange={(v) => setFilter((f) => ({ ...f, [open]: v }))}
        />
      )}
      <div className="overflow-x-auto rounded-[14px] border border-ap-line">
        <div role="table" aria-label="Prices" style={{ minWidth: 700 }}>
          <div role="row" className="grid bg-ap-ground" style={{ gridTemplateColumns: gtc }}>
            {head.map(([h, key], i) => (
              <span
                key={h}
                role="columnheader"
                aria-sort={
                  key && sort?.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"
                }
                className={`flex items-center gap-1 px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-ap-muted ${i > 1 ? "justify-end text-right" : ""}`}
              >
                {h}
                {i < 2 &&
                  (() => {
                    const k: PriceFilter = i === 0 ? "plan" : "price";
                    return (
                      <button
                        type="button"
                        aria-label={`Filter ${h}`}
                        aria-expanded={open === k}
                        onClick={() => {
                          if (open === k) setFilter((f) => ({ ...f, [k]: "" }));
                          setOpen(open === k ? null : k);
                        }}
                        className={`inline-flex cursor-pointer border-0 bg-transparent p-0.5 ${open === k || filter[k] ? "text-ap-violet" : "text-ap-muted"}`}
                      >
                        <FilterIcon />
                      </button>
                    );
                  })()}
                {key && (
                  <button
                    type="button"
                    aria-label={`Sort by ${h}`}
                    onClick={() =>
                      setSort((x) =>
                        x?.key === key
                          ? { key, dir: x.dir === 1 ? -1 : 1 }
                          : { key, dir: key === "planLabel" ? 1 : -1 }
                      )
                    }
                    className={`inline-flex cursor-pointer border-0 bg-transparent p-0.5 ${sort?.key === key ? "text-ap-violet" : "text-ap-muted"}`}
                  >
                    <SortIcon dir={sort?.key === key ? sort.dir : null} />
                  </button>
                )}
              </span>
            ))}
          </div>
          {rows.map((r) => (
            <div
              key={`${r.plan}${r.price}${r.priceArm}`}
              role="row"
              className="grid border-t border-ap-line"
              style={{ gridTemplateColumns: gtc }}
            >
              <span role="cell" className="px-3.5 py-3 text-sm font-semibold">
                {r.planLabel}
              </span>
              <span role="cell" className="px-3.5 py-3 text-sm">
                <span className="rounded-full bg-ap-purple/10 px-2.5 py-[3px] text-xs font-bold text-ap-plum">
                  {priceText(r)}
                </span>
              </span>
              <span role="cell" className="px-3.5 py-3 text-right text-sm tabular-nums">
                {fmt("count", r.quoted)}
              </span>
              <span role="cell" className="px-3.5 py-3 text-right text-sm tabular-nums">
                {fmt("count", r.checkouts)}
              </span>
              <span role="cell" className="px-3.5 py-3 text-right text-sm tabular-nums">
                {fmt("count", r.sales)}
              </span>
              <span role="cell" className="px-3.5 py-3 text-right text-sm tabular-nums">
                {fmt("pct", r.cvr)}
              </span>
              <span
                role="cell"
                className="px-3.5 py-3 text-right text-sm font-semibold tabular-nums"
              >
                {fmt("eur", r.revenue, 2)}
              </span>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="m-0 border-t border-ap-line px-3.5 py-3 text-sm text-ap-muted">
              No price matches the filter.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The scorecard every assessment is run against. Not in Marcus's design: it sits after the
 * journey, and the KPIs nothing can measure yet fold into one line rather than rows of "—".
 */
function Scorecard({ rows }: { rows: DashboardPayload["scorecard"] }) {
  const measured = rows.filter((r) => r.value !== null);
  const blank = rows.filter((r) => r.value === null);
  const groups = Object.entries(
    measured.reduce<Record<string, typeof rows>>((acc, r) => {
      (acc[r.group] ??= []).push(r);
      return acc;
    }, {})
  );
  return (
    <Card labelledBy="h-score">
      <SectionHead
        id="h-score"
        level={3}
        title="Scorecard"
        description="Every assessment is run against the same scorecard (Product Vision & Playbook, 13 Oct 2026)."
      />
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))" }}
      >
        {groups.map(([group, list]) => (
          <div key={group} className="flex flex-col gap-2.5 rounded-[14px] bg-ap-ground p-3.5">
            <Eyebrow>{group}</Eyebrow>
            {list.map((r) => (
              <div key={r.label} className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 flex-col">
                  <span className="text-[13px] font-semibold">{r.label}</span>
                  <span className="text-[11px] leading-snug text-ap-muted">{r.note}</span>
                </span>
                <span className="shrink-0 font-serif text-lg font-semibold tabular-nums">
                  {fmt(r.unit, r.value, r.unit === "ratio" ? 2 : undefined)}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
      {blank.length > 0 && (
        <details className="text-xs text-ap-muted">
          <summary className="cursor-pointer font-semibold text-ap-body">
            Not measurable yet: {blank.map((r) => r.label).join(", ")}
          </summary>
          <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
            {blank.map((r) => (
              <li key={r.label}>
                <strong className="text-ap-body">{r.label}</strong>: {r.note}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
