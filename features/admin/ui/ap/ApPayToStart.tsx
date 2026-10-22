"use client";

import type { ReactNode } from "react";

import { rangeLabel } from "@features/admin/server/ap/filters";
import { EMPTY, fmt } from "@features/admin/server/ap/format";
import type { PtsArm, PtsPayload } from "@features/admin/server/ap/pay-to-start";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";

import ApFilterBar from "./ApFilterBar";
import { Busy, Card, Eyebrow, Failed, Loading, PageHeader, SectionHead } from "./kit";
import { useApFilters } from "./useApFilters";

/**
 * AP-Analytics, Assessment A · Pay to start: the pay-first funnel on a page of its own (22.10
 * sync), led by what its ads cost: cost per click and cost per paying customer, per offer.
 * The core pages' funnel is the free survey's; this page is where the pay-first one is read.
 */

const FIXED_NOTE =
  "This page reads the pay-first funnel as a whole: its checkouts and ads carry no source, device, tier or visitor narrowing yet.";

function Stat({ label, value, sub }: { label: string; value: string; sub?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-[20px] border border-ap-line bg-white px-[18px] py-4 text-ap-ink shadow-ap">
      <Eyebrow>{label}</Eyebrow>
      <span className="font-serif text-[28px] font-semibold leading-none tabular-nums">
        {value}
      </span>
      {sub && <span className="text-xs leading-snug text-ap-muted">{sub}</span>}
    </div>
  );
}

interface Col {
  key: string;
  label: string;
  value: (a: PtsArm) => string;
}

/** What each offer's ads cost, and what a euro of them bought: the 22.10 sync's focus. */
const COST_COLUMNS: Col[] = [
  { key: "spend", label: "Ad spend", value: (a) => fmt("eur", a.spend) },
  { key: "clicks", label: "Clicks", value: (a) => fmt("count", a.clicks) },
  { key: "cpc", label: "CPC", value: (a) => fmt("eur", a.cpc, 2) },
  { key: "ctr", label: "CTR", value: (a) => fmt("pct", a.ctr) },
  { key: "click-paid", label: "Click → paid", value: (a) => fmt("pct", a.clickToPaid) },
  {
    key: "cost-paid",
    label: "Cost / paying customer",
    value: (a) => fmt("eur", a.costPerPaid, 2),
  },
  {
    key: "cost-finished",
    label: "Cost / finished survey",
    value: (a) => fmt("eur", a.costPerFinished, 2),
  },
  {
    key: "roas",
    label: "ROAS",
    value: (a) => (a.roas === null ? EMPTY : `${a.roas.toFixed(2)}×`),
  },
];

/** How far each offer's buyers got, from checkout to the full report. */
const BUYER_COLUMNS: Col[] = [
  { key: "checkouts", label: "Checkouts started", value: (a) => fmt("count", a.checkouts) },
  { key: "paid", label: "Paid", value: (a) => fmt("count", a.paid) },
  { key: "refunded", label: "Refunded", value: (a) => fmt("count", a.refunded) },
  { key: "revenue", label: "Revenue", value: (a) => fmt("eur", a.revenue, 2) },
  { key: "finished", label: "Finished survey", value: (a) => fmt("count", a.finished) },
  { key: "opened", label: "Report opened", value: (a) => fmt("count", a.opened) },
  {
    key: "upgrades",
    label: "€1.99 → full",
    value: (a) => (a.offer === "full" ? EMPTY : fmt("count", a.upgrades)),
  },
  {
    key: "upgrade-revenue",
    label: "Upgrade revenue",
    value: (a) => (a.offer === "full" ? EMPTY : fmt("eur", a.upgradeRevenue, 2)),
  },
];

function OfferTable({
  arms,
  columns,
  caption,
}: {
  arms: PtsArm[];
  columns: Col[];
  caption: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-[13px] tabular-nums">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-ap-line text-left text-[11px] font-bold uppercase tracking-[0.06em] text-ap-muted">
            <th scope="col" className="py-2.5 pr-4 font-bold">
              Offer
            </th>
            {columns.map((c) => (
              <th key={c.key} scope="col" className="px-2 py-2.5 text-right font-bold">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {arms.map((a) => (
            <tr
              key={a.offer}
              className={`border-b border-ap-line last:border-0 ${a.offer === "all" ? "font-semibold" : ""}`}
            >
              <th scope="row" className="py-2.5 pr-4 text-left font-semibold text-ap-ink">
                {a.label}
              </th>
              {columns.map((c) => (
                <td key={c.key} className="px-2 py-2.5 text-right text-ap-ink">
                  {c.value(a)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Funnel({ d }: { d: PtsPayload }) {
  const all = d.arms.find((a) => a.offer === "all")!;
  const steps: Array<{ label: string; n: number | null; base: number | null }> = [
    { label: "Visits to the pay-to-start pages", n: d.visits, base: null },
    { label: "Started checkout", n: all.checkouts, base: d.visits },
    { label: "Paid", n: all.paid, base: all.checkouts },
    { label: "Finished the survey", n: all.finished, base: all.paid },
    { label: "Opened the report", n: all.opened, base: all.finished },
  ];
  return (
    <ol className="m-0 flex list-none flex-col gap-2 p-0">
      {steps.map((s) => (
        <li
          key={s.label}
          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-ap-line py-2 last:border-0"
        >
          <span className="text-sm text-ap-body">{s.label}</span>
          <span className="text-sm font-semibold tabular-nums text-ap-ink">
            {fmt("count", s.n)}
            {s.n !== null && s.base !== null && s.base > 0 && (
              <span className="ml-2 font-normal text-ap-muted">
                {fmt("pct", s.n / s.base)} of the step before
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Days({ d }: { d: PtsPayload }) {
  const rows = [...d.days].reverse();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-[13px] tabular-nums">
        <caption className="sr-only">Pay to start by day, newest first</caption>
        <thead>
          <tr className="border-b border-ap-line text-left text-[11px] font-bold uppercase tracking-[0.06em] text-ap-muted">
            <th scope="col" className="py-2.5 pr-4 font-bold">
              Day
            </th>
            <th scope="col" className="px-2 py-2.5 text-right font-bold">
              Visits
            </th>
            <th scope="col" className="px-2 py-2.5 text-right font-bold">
              Checkouts · full
            </th>
            <th scope="col" className="px-2 py-2.5 text-right font-bold">
              Paid · full
            </th>
            <th scope="col" className="px-2 py-2.5 text-right font-bold">
              Checkouts · €1.99
            </th>
            <th scope="col" className="px-2 py-2.5 text-right font-bold">
              Paid · €1.99
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.day} className="border-b border-ap-line last:border-0">
              <th scope="row" className="py-2 pr-4 text-left font-medium text-ap-ink">
                {rangeLabel(r.day, r.day)}
              </th>
              <td className="px-2 py-2 text-right">{fmt("count", r.visits)}</td>
              <td className="px-2 py-2 text-right">{r.checkouts.full}</td>
              <td className="px-2 py-2 text-right">{r.paid.full}</td>
              <td className="px-2 py-2 text-right">{r.checkouts.pre}</td>
              <td className="px-2 py-2 text-right">{r.paid.pre}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ApPayToStart() {
  const { params } = useApFilters();
  const { data, loading, error, refetch } = useAdminFetch<PtsPayload>(
    "/api/admin/ap/pay-to-start",
    params
  );
  const all = data?.arms.find((a) => a.offer === "all");
  return (
    <>
      <PageHeader
        crumbs={["Assessments", "Assessment A", "Pay to start"]}
        title="Pay to start"
        description="The pay-first funnel on its own: what its ads cost per click and per paying customer, for each offer, and how far its buyers get."
      />
      <ApFilterBar
        scope="assessment"
        fixed={["source", "device", "tier", "visitor"]}
        fixedNote={FIXED_NOTE}
      />
      {loading && !data && <Loading label="the pay-to-start page" />}
      {error && <Failed message={error} onRetry={refetch} />}
      {data && all && (
        <Busy busy={loading}>
          <p className="m-0 text-sm text-ap-muted">
            {rangeLabel(data.range.from, data.range.to)} · Production database and Google Ads
            {data.liveFrom
              ? ` · first checkout ${rangeLabel(data.liveFrom, data.liveFrom)}`
              : " · no checkout yet"}
          </p>
          <div
            className="grid gap-3.5"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))" }}
          >
            <Stat
              label="Ad spend"
              value={fmt("eur", all.spend)}
              sub={data.ads.ok ? "On ads landing on the two pages" : data.ads.note}
            />
            <Stat
              label="CPC"
              value={fmt("eur", all.cpc, 2)}
              sub={`${fmt("count", all.clicks)} clicks`}
            />
            <Stat
              label="Cost / paying customer"
              value={fmt("eur", all.costPerPaid, 2)}
              sub={`${all.paid} paid`}
            />
            <Stat
              label="Paying customers"
              value={fmt("count", all.paid)}
              sub={`of ${all.checkouts} checkouts started`}
            />
            <Stat label="Revenue" value={fmt("eur", all.revenue, 2)} sub="Refunds left out" />
            <Stat
              label="Finished survey"
              value={fmt("count", all.finished)}
              sub={
                all.paid > 0
                  ? `${fmt("pct", all.finished / all.paid)} of ${all.paid} payers`
                  : "No payer yet"
              }
            />
            <Stat
              label="Cost / finished survey"
              value={fmt("eur", all.costPerFinished, 2)}
              sub="Ad spend ÷ buyers who finished"
            />
            <Stat
              label="ROAS"
              value={all.roas === null ? EMPTY : `${all.roas.toFixed(2)}×`}
              sub="Revenue and €1.99 upgrades ÷ ad spend"
            />
          </div>
          <Card id="offers" labelledBy="pts-offers">
            <SectionHead
              id="pts-offers"
              eyebrow="By offer"
              title="€29.99 full against €1.99 pre"
              description="Each offer's ads are the ones landing on its page (/sexual-archetype or /sexual-archetype/initial), so the split holds whatever the campaigns are called. Paid counts the charge's day; refunds stay in Paid and leave Revenue."
            />
            <OfferTable
              arms={data.arms}
              columns={COST_COLUMNS}
              caption="What each offer's ads cost"
            />
            <OfferTable
              arms={data.arms}
              columns={BUYER_COLUMNS}
              caption="How far each offer's buyers got"
            />
          </Card>
          <Card id="funnel" labelledBy="pts-funnel">
            <SectionHead
              id="pts-funnel"
              eyebrow="Both offers"
              title="From visit to report"
              description="Each step as a share of the step before. Visits are the journey's: both pages share one label."
            />
            <Funnel d={data} />
          </Card>
          <Card id="days" labelledBy="pts-days">
            <SectionHead id="pts-days" eyebrow="Day by day" title="Checkouts and payments" />
            <Days d={data} />
          </Card>
          {data.notes.length > 0 && (
            <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-xs leading-snug text-ap-muted">
              {data.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </Busy>
      )}
    </>
  );
}
