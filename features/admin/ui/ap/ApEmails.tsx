"use client";

import { useMemo, useState } from "react";

import type { Table } from "@features/admin/server/ap/common";
import {
  CLICK_DAYS,
  FUNNEL_NAMES,
  MIN_DELIVERED,
  type Funnel,
  type Scope,
} from "@features/admin/server/ap/email-registry";
import type { EmailRow, EmailsPayload, Stat } from "@features/admin/server/ap/emails";
import { addDays, shortDate } from "@features/admin/server/ap/days";
import { EMPTY, fmt } from "@features/admin/server/ap/format";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";

import ApFilterBar from "./ApFilterBar";
import { exportTables } from "./csv";
import { Info } from "./field-info";
import { bucketTitles } from "./hover";
import {
  BlackButton,
  Busy,
  Card,
  Failed,
  KpiTileV2,
  Loading,
  PageHeader,
  Pills,
  RangeLine,
  SectionHead,
  SectionNav,
  SortIcon,
  Spark,
  STANDING,
  TileGrid,
  useHashScroll,
} from "./kit";
import { useApFilters } from "./useApFilters";

type Data = EmailsPayload;

const NOTE = "m-0 text-xs leading-relaxed text-ap-muted";
const HEAD = "text-[11px] font-bold uppercase tracking-[0.06em] text-ap-muted";
const PURPLE = "#795fc8";
const ORANGE = "#c2650a";

const pct1 = (v: number | null) => fmt("pct", v, 1);
const count = (n: number | null) => fmt("count", n);
const ratio = (a: number | null, b: number) => (a === null || !b ? null : a / b);

/** The funnel pills' colours, as the design draws them. */
const FUNNEL_PILL: Record<Funnel, string> = {
  after: "bg-[#ece9f1] text-[#3f3a4d]",
  full: "bg-[#efe9fb] text-[#4a3592]",
  pre: "bg-[#fbeee2] text-[#8a4507]",
  gate: "bg-[#e6f2ec] text-[#1f5c42]",
  shared: "bg-ap-ground text-ap-muted",
};
const SHORT: Record<Funnel, string> = {
  after: "Pay after report",
  full: "Pay to start €29.99",
  pre: "Pay to start €1.99",
  gate: "€1.99 after survey",
  shared: "Sharing",
};

const MIX_COLORS = ["#5a42a6", ORANGE, "#2e7d5b", "#c0b4e6", "#9c95a3"];

type SortKey =
  | "name"
  | "group"
  | "goal"
  | "sent"
  | "conv"
  | "click"
  | "del"
  | "bnc"
  | "open"
  | "unsub"
  | "trend";

interface Column {
  key: SortKey;
  label: string;
  /** As the narrow header writes it: a soft hyphen where a long word may break. */
  display?: string;
  info?: string;
  right?: boolean;
}

function columns(scope: Scope): Column[] {
  return [
    { key: "name", label: "Email" },
    { key: "group", label: scope === "overall" ? "Assessment" : "Funnel" },
    { key: "goal", label: "CVR goal", info: "emails.goal" },
    { key: "sent", label: "Sent", info: "emails.sent", right: true },
    {
      key: "conv",
      label: "Conversions",
      display: "Conver\u00adsions",
      info: "emails.conversions",
      right: true,
    },
    { key: "click", label: "Clicked", info: "emails.clicked", right: true },
    {
      key: "del",
      label: "Delivered",
      display: "Deliv\u00adered",
      info: "emails.delivered",
      right: true,
    },
    { key: "bnc", label: "Bounced", info: "emails.bounced", right: true },
    { key: "open", label: "Opened", info: "emails.opened", right: true },
    {
      key: "unsub",
      label: "Unsubscribed",
      display: "Unsub\u00adscribed",
      info: "emails.unsubscribed",
      right: true,
    },
    { key: "trend", label: `Clicks · ${CLICK_DAYS} days`, info: "emails.clicks30" },
  ];
}
// The design's columns (Assessment A · Emails); its headers wrap rather than overlap.
const GRID =
  "minmax(160px,1.3fr) minmax(100px,0.8fr) minmax(120px,1fr) repeat(7, minmax(70px,1fr)) minmax(120px,1.2fr)";

const rates = {
  conv: (s: Stat) => (s.conv === null ? null : ratio(s.conv, s.convSent)),
  click: (s: Stat) => ratio(s.clicked, s.delivered),
  del: (s: Stat) => ratio(s.delivered, s.sent),
  bnc: (s: Stat) => ratio(s.bounced, s.sent),
  open: (s: Stat) => ratio(s.opened, s.openBase),
  unsub: (s: Stat) => (s.unsub === null ? null : ratio(s.unsub, s.delivered)),
};

/** A row's figure to sort by; null sorts last. */
function sortValue(r: EmailRow, k: SortKey, scope: Scope): number | string | null {
  if (k === "name") return r.name;
  if (k === "group")
    return scope === "overall" ? (r.assessment ?? "~") : r.funnel ? FUNNEL_NAMES[r.funnel] : "~";
  if (k === "goal") return r.goal;
  if (!r.stat) return null;
  if (k === "sent") return r.stat.sent;
  if (k === "trend") return r.clicks.reduce((a, b) => a + b, 0);
  return rates[k](r.stat);
}

/** One cell: the figure, and its count under it. */
function Cell({
  value,
  sub,
  standing = "plain",
  title,
}: {
  value: string;
  sub: string;
  standing?: EmailRow["standing"]["conv"];
  title?: string;
}) {
  const tone =
    standing === "thin"
      ? "text-ap-quiet"
      : standing === "plain"
        ? "text-ap-ink"
        : STANDING[standing];
  const word =
    standing === "best"
      ? " (best)"
      : standing === "worst"
        ? " (worst)"
        : standing === "thin"
          ? ` (fewer than ${MIN_DELIVERED} delivered)`
          : "";
  return (
    <span
      title={title}
      className={`flex flex-col items-end gap-0.5 rounded-md px-1.5 py-1 text-right tabular-nums ${tone}`}
    >
      <span className="text-[13px] font-bold">
        {value}
        {word && <span className="sr-only">{word}</span>}
      </span>
      <span className="text-[11px] font-medium text-ap-muted">{sub}</span>
    </span>
  );
}

function statCells(r: EmailRow, finished: number) {
  const s = r.stat!;
  const st = r.standing;
  return [
    <Cell
      key="sent"
      value={count(s.sent)}
      sub={r.version ? "" : finished ? `${pct1(s.sent / finished)} of submissions` : ""}
    />,
    s.conv === null ? (
      <Cell key="conv" value={EMPTY} sub="not tracked" title={r.goalNote ?? undefined} />
    ) : s.convSent === 0 ? (
      <Cell
        key="conv"
        value={EMPTY}
        sub={s.sent ? "under 7 days" : ""}
        title={s.sent ? "Its emails are still inside their 7 days" : undefined}
      />
    ) : (
      <Cell
        key="conv"
        value={pct1(rates.conv(s))}
        sub={count(s.conv)}
        standing={st.conv}
        title={
          s.convSent < s.sent
            ? `Read for the ${count(s.convSent)} emails whose 7 days are over`
            : undefined
        }
      />
    ),
    <Cell key="click" value={pct1(rates.click(s))} sub={count(s.clicked)} standing={st.click} />,
    <Cell key="del" value={pct1(rates.del(s))} sub={count(s.delivered)} />,
    <Cell key="bnc" value={pct1(rates.bnc(s))} sub={count(s.bounced)} standing={st.bounce} />,
    <Cell
      key="open"
      value={pct1(rates.open(s))}
      sub={s.openBase ? `${count(s.opened)} of ${count(s.openBase)}` : "no opens known"}
      standing={st.open}
    />,
    s.unsub === null ? (
      <Cell key="unsub" value={EMPTY} sub="by email only" />
    ) : (
      <Cell key="unsub" value={pct1(rates.unsub(s))} sub={count(s.unsub)} standing={st.unsub} />
    ),
  ];
}

const TREND_TONE = {
  good: "text-ap-good",
  bad: "text-ap-bad",
  flat: "text-ap-muted",
  none: "text-ap-quiet",
} as const;

function ClicksLine({
  clicks,
  trend,
  from,
}: {
  clicks: number[];
  trend: EmailRow["clickTrend"];
  from: string;
}) {
  const titles = clicks.map((_, i) => shortDate(addDays(from, i)));
  return (
    <span className="flex flex-col gap-1">
      {trend.tone !== "none" && <Spark values={clicks} height={28} titles={titles} name="Clicks" />}
      <span className={`text-[11px] font-semibold ${TREND_TONE[trend.tone]}`}>{trend.text}</span>
    </span>
  );
}

function EveryEmail({ data }: { data: Data }) {
  const overall = data.scope === "overall";
  const [tab, setTab] = useState<string>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const cols = columns(data.scope);

  const tabs = overall
    ? [
        { value: "all", label: "All emails" },
        { value: "A", label: "Assessment A" },
        { value: "none", label: "Not tied to an assessment" },
      ]
    : [
        { value: "all", label: "All funnels" },
        ...(Object.keys(FUNNEL_NAMES) as Funnel[]).map((f) => ({
          value: f,
          label: FUNNEL_NAMES[f],
        })),
      ];

  const shown = useMemo(() => {
    const inTab = (r: EmailRow) =>
      tab === "all" ||
      (overall
        ? (r.assessment ?? "none") === tab
        : r.funnel === tab || r.also.includes(tab as Funnel));
    const needle = q.trim().toLowerCase();
    let main = data.rows.filter(
      (r) => r.version === null && inTab(r) && (!needle || r.name.toLowerCase().includes(needle))
    );
    if (sort) {
      main = [...main].sort((x, y) => {
        const a = sortValue(x, sort.key, data.scope);
        const b = sortValue(y, sort.key, data.scope);
        if (a === null && b === null) return 0;
        if (a === null) return 1;
        if (b === null) return -1;
        const c =
          typeof a === "string" ? a.localeCompare(String(b)) : (a as number) - (b as number);
        return c * sort.dir;
      });
    }
    // Each email's versions stay under it, whatever the order.
    return main.flatMap((r) => [
      r,
      ...data.rows.filter((v) => v.version !== null && v.key === r.key),
    ]);
  }, [data, tab, q, sort, overall]);

  const counted = shown.filter((r) => r.version === null && r.stat);
  const sum = (k: keyof Stat) =>
    counted.reduce((a, r) => a + ((r.stat![k] as number | null) ?? 0), 0);
  const convRows = counted.filter((r) => r.stat!.conv !== null);
  const total: Stat = {
    sent: sum("sent"),
    delivered: sum("delivered"),
    bounced: sum("bounced"),
    opened: sum("opened"),
    openBase: sum("openBase"),
    clicked: sum("clicked"),
    complained: sum("complained"),
    unsub: sum("unsub"),
    conv: convRows.length ? convRows.reduce((a, r) => a + r.stat!.conv!, 0) : null,
    convSent: convRows.reduce((a, r) => a + r.stat!.convSent, 0),
  };
  const mainShown = shown.filter((r) => r.version === null);
  const totalClicks = new Array<number>(CLICK_DAYS).fill(0);
  for (const r of mainShown) r.clicks.forEach((c, i) => (totalClicks[i]! += c));
  const isAll = tab === "all" && !q.trim();

  return (
    <Card id="every-email" labelledBy="h-every">
      <SectionHead
        id="h-every"
        title="Every email"
        description={`One row per email, in the order a reader meets them; a test's versions sit under their email. Green is the best rate among emails with at least ${MIN_DELIVERED} delivered, red the worst; grey rates rest on fewer.`}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Pills
          label={overall ? "Assessment" : "Funnel"}
          options={tabs}
          value={tab}
          onChange={setTab}
        />
        <label className="flex min-h-10 items-center gap-2 rounded-full border border-ap-line bg-white px-3">
          <svg
            viewBox="0 0 24 24"
            width="15"
            height="15"
            fill="none"
            stroke="#6b6678"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="M15.5 15.5 21 21" />
          </svg>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search emails"
            aria-label="Search emails"
            className="min-w-0 border-0 bg-transparent text-sm text-ap-ink outline-none"
          />
        </label>
      </div>
      <div className="relative min-w-0 max-w-full overflow-x-auto rounded-[14px] border border-ap-line">
        <div role="table" aria-label="Every email" lang="en" className="min-w-[1050px]">
          <div
            role="row"
            className="grid items-start gap-x-1 bg-ap-ground px-3 py-2.5"
            style={{ gridTemplateColumns: GRID }}
          >
            {cols.map((c) => {
              const on = sort?.key === c.key;
              return (
                <span
                  key={c.key}
                  role="columnheader"
                  aria-sort={on ? (sort!.dir === 1 ? "ascending" : "descending") : "none"}
                  className={`flex min-w-0 flex-wrap items-start gap-x-1 gap-y-0.5 px-1 ${c.right ? "justify-end text-right" : ""} text-xs font-bold leading-tight text-ap-ink`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setSort(
                        on && sort!.dir === -1 ? { key: c.key, dir: 1 } : { key: c.key, dir: -1 }
                      )
                    }
                    className={`inline-flex min-w-0 max-w-full cursor-pointer items-start gap-[3px] whitespace-normal border-0 bg-transparent p-0 text-xs font-bold leading-tight text-ap-ink ${c.right ? "text-right" : "text-left"}`}
                    aria-label={`Sort by ${c.label}`}
                  >
                    {c.display ?? c.label}
                    <span className={on ? "text-ap-violet" : "text-ap-quiet"}>
                      <SortIcon dir={on ? sort!.dir : null} />
                    </span>
                  </button>
                  {c.info && <Info k={c.info} label={c.label} />}
                </span>
              );
            })}
          </div>
          {shown.map((r) => {
            const own = data.scope === "overall" || tab === "all" || r.funnel === tab;
            const group = overall
              ? {
                  text: r.assessment ? "Assessment A" : "No assessment",
                  cls: r.assessment ? FUNNEL_PILL.full : FUNNEL_PILL.shared,
                }
              : r.funnel
                ? {
                    text: own ? SHORT[r.funnel] : `Counted under ${SHORT[r.funnel]}`,
                    cls: FUNNEL_PILL[r.funnel],
                  }
                : null;
            return (
              <div
                key={`${r.key}:${r.version ?? ""}`}
                role="row"
                className={`grid items-center gap-x-1 border-t px-3 py-2 ${r.version !== null ? "border-[#f0eef4] bg-[#faf9fc]" : "border-ap-line"} ${r.stat ? "" : "opacity-80"}`}
                style={{ gridTemplateColumns: GRID }}
              >
                <span
                  role="cell"
                  className={`flex min-w-0 flex-col ${r.version !== null ? "pl-4" : ""}`}
                >
                  <span
                    className={`line-clamp-2 ${r.version !== null ? "text-[13px] font-semibold text-ap-muted" : "text-sm font-bold leading-snug text-ap-ink"}`}
                    title={r.name}
                  >
                    {r.name}
                  </span>
                  {r.version === null && r.note && (
                    <span className="text-[11px] text-ap-muted">{r.note}</span>
                  )}
                </span>
                <span role="cell" className="min-w-0">
                  {r.version === null && group && (
                    <span
                      title={group.text}
                      className={`block truncate rounded-full px-2.5 py-1 text-[11px] font-bold ${group.cls}`}
                    >
                      {group.text}
                    </span>
                  )}
                </span>
                <span
                  role="cell"
                  className="truncate text-[13px] text-ap-body"
                  title={r.goalNote ? `${r.goal}: ${r.goalNote}` : r.goal}
                >
                  {r.version === null ? r.goal : ""}
                </span>
                {r.stat
                  ? statCells(r, data.finished).map((c, i) => (
                      <span role="cell" key={i}>
                        {c}
                      </span>
                    ))
                  : Array.from({ length: 7 }, (_, i) => (
                      <span role="cell" key={i}>
                        <Cell value={EMPTY} sub="" />
                      </span>
                    ))}
                <span role="cell">
                  {r.version === null && (
                    <ClicksLine clicks={r.clicks} trend={r.clickTrend} from={data.clicksFrom} />
                  )}
                </span>
              </div>
            );
          })}
          <div
            role="row"
            className="grid items-center gap-x-1 border-t-2 border-ap-ink/15 bg-ap-ground/60 px-3 py-2.5"
            style={{ gridTemplateColumns: GRID }}
          >
            <span role="cell" className="text-sm font-bold text-ap-ink">
              {isAll ? (overall ? "All emails" : "All Assessment A emails") : "Shown emails"}
            </span>
            <span role="cell" className="text-[11px] text-ap-muted">
              {mainShown.length} {mainShown.length === 1 ? "email" : "emails"}
              {mainShown.length > counted.length
                ? `, ${mainShown.length - counted.length} not counted`
                : ""}
            </span>
            <span role="cell" />
            {counted.length
              ? statCells(
                  {
                    ...counted[0]!,
                    version: null,
                    stat: total,
                    standing: {
                      conv: "plain",
                      click: "plain",
                      open: "plain",
                      bounce: "plain",
                      unsub: "plain",
                    },
                  },
                  data.finished
                ).map((c, i) => (
                  <span role="cell" key={i}>
                    {c}
                  </span>
                ))
              : Array.from({ length: 7 }, (_, i) => (
                  <span role="cell" key={i}>
                    <Cell value={EMPTY} sub="" />
                  </span>
                ))}
            <span role="cell">
              <ClicksLine
                clicks={totalClicks}
                trend={trendOf(totalClicks)}
                from={data.clicksFrom}
              />
            </span>
          </div>
        </div>
      </div>
      <p className={NOTE}>
        Sent counts each email once; delivered and bounced are shares of it. Opened is opens ÷
        delivered, known from 16 Oct; clicked is clicks ÷ delivered. A click implies an open and an
        open a delivery, as on Unlock feedback. Conversions: readers who did the email’s goal within
        7 days of it, of the emails sent; read per reader only. Some email apps load images by
        themselves, so an open can be counted without a read: trust clicks over opens.
        {data.off
          ? ` ${data.off} more emails from Mark’s rework are built and switched off; each is listed from its first send.`
          : ""}
      </p>
    </Card>
  );
}

/** The trend text for a line the page didn't build (a tab's or a search's total). */
function trendOf(days: number[]): EmailRow["clickTrend"] {
  const total = days.reduce((a, b) => a + b, 0);
  if (!total) return { text: "no clicks", tone: "none" };
  const n = days.length;
  const mx = (n - 1) / 2;
  const my = total / n;
  let num = 0;
  let den = 0;
  days.forEach((y, i) => {
    num += (i - mx) * (y - my);
    den += (i - mx) * (i - mx);
  });
  const wk = (den ? num / den : 0) * 7;
  const clicks = `${total.toLocaleString("en-US")} click${total === 1 ? "" : "s"}`;
  if (Math.abs(wk) < 0.05) return { text: `${clicks} · flat`, tone: "flat" };
  return {
    text: `${clicks} · ${wk > 0 ? "+" : "−"}${Math.abs(wk).toFixed(1)}/wk`,
    tone: wk > 0 ? "good" : "bad",
  };
}

function Overview({ data }: { data: Data }) {
  const overall = data.scope === "overall";
  const titles = bucketTitles(data.range.from, data.range.to);
  const totalMix = data.mix.reduce((a, m) => a + m.n, 0);
  const trend = (tile: string, unit: "count" | "pct") =>
    overall ? { route: "emails", tile, unit } : undefined;
  const info: Record<string, string> = {
    sent: "emails.sent",
    delivered: "emails.delivered",
    bounced: "emails.bounced",
    opened: "emails.opened",
    clicked: "emails.clicked",
    complaints: "emails.complaints",
    unsub: "emails.unsubscribed",
  };
  return (
    <Card id="overview" labelledBy="h-overview">
      <SectionHead
        id="h-overview"
        title={overall ? "All emails" : "Assessment A emails"}
        description={`${data.range.label}, ${overall ? "every email together, any assessment or none" : "the emails Assessment A’s survey, report and payments send"}.`}
      />
      <TileGrid min={128}>
        {data.tiles.map((t) => (
          <KpiTileV2
            key={t.key}
            tile={t}
            foot
            digits={t.unit === "pct" ? 1 : undefined}
            titles={titles}
            info={{ k: info[t.key] ?? "", trend: trend(t.key, t.unit === "pct" ? "pct" : "count") }}
          />
        ))}
      </TileGrid>
      {totalMix > 0 && (
        <div className="flex flex-col gap-2">
          <span className={HEAD}>Where the emails go</span>
          <div
            role="img"
            aria-label={`Emails sent by email: ${data.mix.map((m) => `${m.label} ${count(m.n)}`).join(", ")}`}
            className="flex h-3.5 overflow-hidden rounded-full bg-ap-track"
          >
            {data.mix.map((m, i) => (
              <span
                key={m.label}
                title={`${m.label}: ${count(m.n)}`}
                style={{
                  width: `${((m.n / totalMix) * 100).toFixed(2)}%`,
                  background: MIX_COLORS[i % MIX_COLORS.length],
                }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {data.mix.map((m, i) => (
              <span key={m.label} className="flex items-center gap-1.5 text-xs text-ap-body">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full"
                  style={{ background: MIX_COLORS[i % MIX_COLORS.length] }}
                />
                {m.label} <strong className="tabular-nums">{count(m.n)}</strong>
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function ByAssessment({ data }: { data: Data }) {
  return (
    <Card id="assessments" labelledBy="h-assess">
      <SectionHead
        id="h-assess"
        title="By assessment"
        description="Emails that follow an assessment’s survey, report or payment sit with that assessment; its own Emails page splits them by funnel. Emails that stand on their own sit apart."
      />
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))" }}
      >
        {data.byAssessment.map((a) => {
          const s = a.stat;
          return (
            <div
              key={a.name}
              className={`flex flex-col gap-3 rounded-[16px] border p-4 ${a.status === "live" ? "border-ap-line" : "border-dashed border-ap-line opacity-75"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-serif text-lg font-semibold text-ap-ink">{a.name}</span>
                <span className="rounded-full bg-ap-ground px-2.5 py-0.5 text-[11px] font-bold text-ap-muted">
                  {a.status === "live" ? "Live" : a.status === "soon" ? "Soon" : "Nothing sent yet"}
                </span>
              </div>
              <p className={NOTE}>
                {a.status === "soon"
                  ? "Its emails show here once it launches."
                  : a.status === "none"
                    ? "Emails that stand on their own, like a newsletter: each shows here from its first send."
                    : `${a.emails} ${a.emails === 1 ? "email" : "emails"} from its survey, report, payments and sharing.`}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  ["Sent", s ? count(s.sent) : EMPTY],
                  ["Opened", s ? pct1(rates.open(s)) : EMPTY],
                  ["Clicked", s ? pct1(rates.click(s)) : EMPTY],
                ].map(([label, v]) => (
                  <span key={label} className="flex flex-col">
                    <span className="text-[11px] text-ap-muted">{label}</span>
                    <span className="font-bold tabular-nums text-ap-ink">{v}</span>
                  </span>
                ))}
              </div>
              {a.name === "Assessment A" && (
                <a
                  href={`/admin/ap/assessment-a/emails`}
                  className="text-[13px] font-semibold text-ap-violet"
                >
                  Its funnels and versions →
                </a>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Weeks({ data }: { data: Data }) {
  const maxSent = Math.max(1, ...data.weeks.map((w) => w.sent));
  const top = Math.max(10, Math.ceil(maxSent / 10) * 10);
  const rateOf = (w: Data["weeks"][number]) => ratio(w.clicked, w.sent);
  const maxRate = Math.max(0.05, ...data.weeks.map((w) => rateOf(w) ?? 0));
  const rateTop = Math.ceil(maxRate * 20) / 20;
  const n = data.weeks.length;
  const pts = data.weeks
    .map((w, i) => {
      const r = rateOf(w);
      return r === null
        ? null
        : `${(((i + 0.5) / n) * 100).toFixed(2)},${(100 - (r / rateTop) * 100).toFixed(2)}`;
    })
    .filter(Boolean)
    .join(" ");
  return (
    <Card id="weeks" labelledBy="h-weeks">
      <SectionHead
        id="h-weeks"
        title="Week by week"
        info="emails.weeks"
        description="Bars: emails sent each week (Monday to Sunday, cut at the range’s ends). Line: clicks per email sent that week. A week’s latest emails are still being opened and clicked."
      />
      <div className="flex flex-wrap gap-4 text-xs text-ap-body">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-sm"
            style={{ background: "#c0b4e6" }}
          />
          Emails sent (left axis)
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-0.5 w-4" style={{ background: ORANGE }} />
          Clicks per email sent (right axis)
        </span>
      </div>
      <div className="relative h-56 pl-10 pr-10">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <span
            key={t}
            aria-hidden="true"
            className="absolute left-10 right-10 border-t border-ap-line"
            style={{ bottom: `${t * 100}%` }}
          >
            <span className="absolute -left-10 -translate-y-1/2 text-[11px] tabular-nums text-ap-muted">
              {count(Math.round(t * top))}
            </span>
            <span className="absolute -right-10 -translate-y-1/2 text-[11px] tabular-nums text-ap-muted">
              {fmt("pct", t * rateTop, 0)}
            </span>
          </span>
        ))}
        <div className="absolute inset-y-0 left-10 right-10 flex items-end">
          {data.weeks.map((w) => (
            <span
              key={w.from}
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
            >
              <span className="text-[11px] font-bold tabular-nums text-ap-ink">
                {count(w.sent)}
              </span>
              <span
                title={`${w.label}: ${count(w.sent)} sent, ${count(w.clicked)} clicked`}
                className="w-1/2 max-w-12 rounded-t-md"
                style={{ height: `${(w.sent / top) * 100}%`, background: "#c0b4e6" }}
              />
            </span>
          ))}
        </div>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          role="img"
          aria-label={`Emails sent per week and clicks per email sent: ${data.weeks.map((w) => `${w.label} ${count(w.sent)} sent, ${pct1(rateOf(w))}`).join("; ")}`}
          className="absolute inset-y-0 left-10 right-10 h-full w-[calc(100%-5rem)] overflow-visible"
        >
          <polyline
            points={pts}
            fill="none"
            stroke={ORANGE}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      <div className="flex pl-10 pr-10">
        {data.weeks.map((w) => (
          <span key={w.from} className="flex flex-1 flex-col items-center text-center">
            <span className="text-[11px] text-ap-muted">{w.label}</span>
            <span className="text-[11px] font-bold tabular-nums" style={{ color: ORANGE }}>
              {pct1(rateOf(w))}
            </span>
          </span>
        ))}
      </div>
    </Card>
  );
}

function toCsv(d: Data): Array<{ name: string; table: Table }> {
  const v = (s: Stat | null, f: (s: Stat) => number | null) => (s ? f(s) : null);
  return [
    {
      name: "Every email",
      table: {
        columns: [
          { label: "Email", unit: "text" },
          { label: "Version", unit: "text" },
          { label: d.scope === "overall" ? "Assessment" : "Funnel", unit: "text" },
          { label: "CVR goal", unit: "text" },
          { label: "Sent", unit: "count" },
          { label: "Conversions", unit: "count" },
          { label: "Conversion rate", unit: "pct" },
          { label: "Clicked", unit: "count" },
          { label: "Click rate", unit: "pct" },
          { label: "Delivered", unit: "count" },
          { label: "Bounced", unit: "count" },
          { label: "Opened", unit: "count" },
          { label: "Open rate", unit: "pct" },
          { label: "Spam complaints", unit: "count" },
          { label: "Unsubscribed", unit: "count" },
          { label: "Note", unit: "text" },
        ],
        rows: d.rows.map((r) => ({
          label:
            r.version === null
              ? r.name
              : `${r.name} (${d.rows.find((x) => x.key === r.key && x.version === null)?.name ?? ""})`,
          values: [
            r.version ?? "",
            d.scope === "overall"
              ? r.assessment
                ? "Assessment A"
                : "No assessment"
              : r.funnel
                ? FUNNEL_NAMES[r.funnel]
                : "",
            r.goal,
            v(r.stat, (s) => s.sent),
            v(r.stat, (s) => s.conv),
            v(r.stat, rates.conv),
            v(r.stat, (s) => s.clicked),
            v(r.stat, rates.click),
            v(r.stat, (s) => s.delivered),
            v(r.stat, (s) => s.bounced),
            v(r.stat, (s) => s.opened),
            v(r.stat, rates.open),
            v(r.stat, (s) => s.complained),
            v(r.stat, (s) => s.unsub),
            r.note ?? r.goalNote ?? "",
          ],
        })),
      },
    },
    {
      name: "Week by week",
      table: {
        columns: [
          { label: "Week", unit: "text" },
          { label: "Emails sent", unit: "count" },
          { label: "Clicked", unit: "count" },
          { label: "Clicks per email sent", unit: "pct" },
        ],
        rows: d.weeks.map((w) => ({
          label: w.label,
          values: [w.sent, w.clicked, ratio(w.clicked, w.sent)],
        })),
      },
    },
  ];
}

export default function ApEmails({ scope }: { scope: Scope }) {
  const { params } = useApFilters();
  const query = useMemo(() => ({ ...params, scope }), [params, scope]);
  const { data, loading, error, refetch } = useAdminFetch<Data>("/api/admin/ap/emails", query);
  useHashScroll(Boolean(data));
  const overall = scope === "overall";
  const sections = [
    { id: "overview", label: "Overview" },
    ...(overall ? [{ id: "assessments", label: "By assessment" }] : []),
    { id: "every-email", label: "Every email" },
    { id: "weeks", label: "Week by week" },
  ];
  return (
    <>
      <div className="flex flex-col gap-4">
        <PageHeader
          crumbs={overall ? ["Reports", "Emails"] : ["Assessments", "Assessment A", "Emails"]}
          title="Emails"
          description={
            overall
              ? "Every email we send, across all assessments and the emails that stand on their own: how many arrive, are opened and clicked, and how many readers then did what the email is for."
              : "The emails Assessment A sends, all together and funnel by funnel: how many arrive, are opened and clicked, and how many readers then did what the email is for."
          }
          actions={
            <BlackButton
              disabled={!data}
              onClick={() =>
                data &&
                exportTables(
                  `ap-emails-${scope}-${data.range.from}-${data.range.to}`,
                  toCsv(data),
                  data.tiles
                )
              }
            >
              Export CSV
            </BlackButton>
          }
        />
        <SectionNav label="Emails sections" sections={sections} ready={Boolean(data)} />
      </div>
      <ApFilterBar
        scope={scope}
        fixed={["funnel", "source", "device", "tier", "visitor"]}
        fixedNote="This page reads every email over all traffic, so the funnel, source, device, tier and visitor filters do not apply. Its funnel tabs split Assessment A's emails by the funnel that sends them."
      />
      {loading && !data && <Loading label="the emails page" />}
      {error && <Failed message={error} onRetry={refetch} />}
      {data && (
        <Busy busy={loading}>
          <RangeLine data={data} sources="Production database and Resend" />
          <Overview data={data} />
          {overall && <ByAssessment data={data} />}
          <EveryEmail data={data} />
          <Weeks data={data} />
          <p className={NOTE}>
            Staff, test entries and our own probes left out, as on every AP page, wherever an email
            is counted per reader. Survey paused, share and invite are counted from Resend’s daily
            counts, where they can’t be.
          </p>
        </Busy>
      )}
    </>
  );
}
