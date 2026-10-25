"use client";

import { useState } from "react";

import { shortDate } from "@features/admin/server/ap/days";
import type { Table } from "@features/admin/server/ap/common";
import { EMPTY, fmt } from "@features/admin/server/ap/format";
import type { UnlockFeedbackPayload } from "@features/admin/server/ap/unlock-feedback";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import { reportingDay } from "@shared/time/reporting-day";

import ApFilterBar from "./ApFilterBar";
import UnlockFeedbackSend from "./UnlockFeedbackSend";
import { exportTables } from "./csv";
import { bucketTitles, IndexHover } from "./hover";
import {
  Bar,
  BlackButton,
  Busy,
  Card,
  Eyebrow,
  Failed,
  KpiTileV2,
  Loading,
  PageHeader,
  RangeLine,
  SectionHead,
  SectionNav,
  TileGrid,
  useHashScroll,
} from "./kit";
import { useApRole } from "./status";
import { useApFilters } from "./useApFilters";

type Data = UnlockFeedbackPayload;

const SECTIONS = [
  { id: "funnel", label: "Funnel" },
  { id: "reasons", label: "Reasons" },
  { id: "segments", label: "Segments" },
  { id: "subjects", label: "Subject test" },
  { id: "after", label: "After the unlock" },
  { id: "answers", label: "Written answers" },
];

const PURPLE = "#795fc8";
const VIOLET = "#4000b6";
const HEAD = "px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-ap-muted";
const NOTE = "m-0 text-xs leading-relaxed text-ap-muted";

/** A share with a tenth, as the design writes them ("19.7%"); "—" without one. */
const pct1 = (v: number | null) => fmt("pct", v, 1);
const count = (n: number) => fmt("count", n);
const plural = (n: number, one: string) => `${count(n)} ${one}${n === 1 ? "" : "s"}`;
const people = (n: number) => `${count(n)} ${n === 1 ? "person" : "people"}`;

/** "18 Oct · 09:41", Berlin. */
function when(at: string): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
  return `${shortDate(reportingDay(d))} · ${time}`;
}

/** The time from send to answer as the design writes it: "40 min", "5 h", "3.2 days". */
function waitText(ms: number | null): string {
  if (ms === null) return EMPTY;
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  return fmt("days", hours / 24);
}

/** The design's heat: a share of 42% or more is the full purple, white figures from half way. */
function heat(v: number): { background: string; color: string } {
  const a = Math.min(1, (v * 100) / 42);
  return {
    background: `rgba(121,95,200,${(0.06 + a * 0.9).toFixed(2)})`,
    color: a > 0.5 ? "#ffffff" : "#161021",
  };
}

function toCsv(d: Data): Array<{ name: string; table: Table }> {
  return [
    {
      name: "From send to answer",
      table: {
        columns: [
          { label: "Step", unit: "text" },
          { label: "People", unit: "count" },
          { label: "Of step before", unit: "pct" },
          { label: "Of delivered", unit: "pct" },
        ],
        rows: d.funnel.map((s) => ({ label: s.name, values: [s.n, s.ofPrev, s.ofDelivered] })),
      },
    },
    {
      name: "Data quality",
      table: {
        columns: [
          { label: "Line", unit: "text" },
          { label: "Emails or taps", unit: "count" },
        ],
        rows: d.quality.map((q) => ({ label: q.name, values: [q.minus ? -q.n : q.n] })),
      },
    },
    {
      name: "Why they didn't unlock",
      table: {
        columns: [
          { label: "Reason", unit: "text" },
          { label: "Theme", unit: "text" },
          { label: "Answers", unit: "count" },
          { label: "Share of answers", unit: "pct" },
          { label: "Added detail", unit: "count" },
        ],
        rows: d.reasons.map((r) => ({
          label: r.label,
          values: [r.theme, r.n, r.share, r.detail],
        })),
      },
    },
    {
      name: "Follow-up chips",
      table: {
        columns: [
          { label: "Reason and chip", unit: "text" },
          { label: "Picked", unit: "count" },
        ],
        rows: d.reasons.flatMap((r) =>
          r.chips.map((c) => ({ label: `${r.label} · ${c.label}`, values: [c.n] }))
        ),
      },
    },
    {
      name: "Reasons by segment (share of the group's answers)",
      table: {
        columns: [
          { label: "Reason", unit: "text" },
          ...d.segments.columns.map((c) => ({
            label: `${c.name} (n = ${c.n})`,
            unit: "pct" as const,
          })),
        ],
        rows: d.segments.rows.map((r) => ({ label: r.label, values: r.cells })),
      },
    },
    {
      name: "Answers per day after send",
      table: {
        columns: [
          { label: "Day", unit: "text" },
          { label: "Answers", unit: "count" },
        ],
        rows: d.time.days.map((x) => ({ label: x.label, values: [x.n] })),
      },
    },
    {
      name: "Subject test",
      table: {
        columns: [
          { label: "Arm", unit: "text" },
          { label: "Subject", unit: "text" },
          { label: "Delivered", unit: "count" },
          { label: "Answers", unit: "count" },
          { label: "Answer rate", unit: "pct" },
          { label: "90% interval, low", unit: "pct" },
          { label: "90% interval, high", unit: "pct" },
        ],
        rows: d.arms.map((a) => ({
          label: a.arm,
          values: [a.subject, a.delivered, a.answers, a.rate, a.lo, a.hi],
        })),
      },
    },
    {
      name: "After the free unlock",
      table: {
        columns: [
          { label: "Metric", unit: "text" },
          { label: `Free unlock (n = ${d.after.free})`, unit: "text" },
          { label: `Paid (n = ${d.after.paid})`, unit: "text" },
        ],
        rows: d.after.rows.map((r) => ({
          label: r.name,
          values: [fmt(r.unit, r.free, r.digits), fmt(r.unit, r.paid, r.digits)],
        })),
      },
    },
    {
      name: "Written answers (masked)",
      table: {
        columns: [
          { label: "When (Berlin)", unit: "text" },
          { label: "Reason", unit: "text" },
          { label: "Answer", unit: "text" },
          { label: "Archetype", unit: "text" },
          { label: "Device", unit: "text" },
        ],
        rows: d.written.rows.map((w) => ({
          label: when(w.at),
          values: [w.reason, w.text, w.archetype ?? "", w.device ?? ""],
        })),
      },
    },
  ];
}

export default function ApUnlockFeedback() {
  const { params } = useApFilters();
  const { data, loading, error, refetch } = useAdminFetch<Data>(
    "/api/admin/ap/unlock-feedback",
    params
  );
  useHashScroll(Boolean(data));
  const { isAdmin } = useApRole();
  return (
    <>
      <div className="flex flex-col gap-4">
        <PageHeader
          crumbs={["Assessments", "Assessment A", "Unlock feedback"]}
          title="Unlock feedback"
          description="Why people who saw their free result didn’t unlock the full report. One answer in the email unlocks the report for free; this page reads those answers."
          actions={
            <>
              {data && <Running running={data.running} />}
              <BlackButton
                disabled={!data}
                onClick={() =>
                  data &&
                  exportTables(
                    `ap-unlock-feedback-${data.range.from}-${data.range.to}`,
                    toCsv(data),
                    data.tiles
                  )
                }
              >
                Export CSV
              </BlackButton>
            </>
          }
        />
        <SectionNav label="Unlock feedback sections" sections={SECTIONS} ready={Boolean(data)} />
      </div>
      <ApFilterBar
        scope="assessment"
        fixed={["funnel", "source", "device", "tier", "visitor"]}
        fixedNote="This page reads every unlock feedback email over all traffic (they go to free survey readers only), so the funnel, source, device, tier and visitor filters do not apply. Its segments split the answers by device, gender and age."
      />
      {isAdmin && <UnlockFeedbackSend />}
      {loading && !data && <Loading label="the unlock feedback page" />}
      {error && <Failed message={error} onRetry={refetch} />}
      {data && (
        <Busy busy={loading}>
          <RangeLine data={data} sources="Production database and Resend" />
          <TileGrid min={170}>
            {data.tiles.map((t) => (
              <KpiTileV2
                key={t.key}
                tile={t}
                foot
                titles={bucketTitles(data.range.from, data.range.to)}
              />
            ))}
          </TileGrid>
          <Funnel data={data} />
          <Quality data={data} />
          <Reasons data={data} />
          <Segments data={data} />
          <Time data={data} />
          <Subjects data={data} />
          <After data={data} />
          <Written data={data} />
          <p className={NOTE}>Staff and test entries left out, as on every AP page.</p>
        </Busy>
      )}
    </>
  );
}

/** The design's "Epic running · day 10": since the first email went out. */
function Running({ running }: { running: Data["running"] }) {
  return (
    <span
      className={`inline-flex min-h-9 items-center gap-2 rounded-full border border-ap-line bg-white px-3.5 text-[13px] font-bold ${running ? "text-ap-good-ink" : "text-ap-muted"}`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${running ? "bg-ap-good" : "bg-ap-quiet"}`}
      />
      {running ? `Epic running · day ${running.day}` : "Not sent yet"}
    </span>
  );
}

function Funnel({ data }: { data: Data }) {
  const gtc = "minmax(220px,1.6fr) minmax(240px,2fr) 90px 110px 110px";
  return (
    <Card id="funnel" labelledBy="h-fun">
      <SectionHead
        id="h-fun"
        title="From send to answer"
        description="Every step as % of the step before and % of delivered. An answer counts only when the page loads in a real browser."
      />
      <div className="overflow-x-auto rounded-[14px] border border-ap-line">
        <div role="table" aria-label="From send to answer" style={{ minWidth: 760 }}>
          <div role="row" className="grid bg-ap-ground" style={{ gridTemplateColumns: gtc }}>
            <span role="columnheader" className={HEAD}>
              Step
            </span>
            <span role="columnheader" className={HEAD}>
              Share of delivered
            </span>
            {["People", "Of step before", "Of delivered"].map((h) => (
              <span key={h} role="columnheader" className={`${HEAD} text-right`}>
                {h}
              </span>
            ))}
          </div>
          {data.funnel.map((s) => (
            <div
              key={s.key}
              role="row"
              className="grid items-center border-t border-ap-line"
              style={{ gridTemplateColumns: gtc }}
            >
              <span role="rowheader" className="flex flex-col gap-0.5 px-3 py-2.5">
                <span className="text-sm font-bold">{s.name}</span>
                <span className="text-xs leading-snug text-ap-muted">{s.note}</span>
              </span>
              <span role="cell" className="px-3 py-2.5">
                <Bar pct={s.bar} color={s.key === "answered" ? VIOLET : PURPLE} />
              </span>
              <span role="cell" className="px-3 py-2.5 text-right text-sm font-bold tabular-nums">
                {count(s.n)}
              </span>
              <span role="cell" className="px-3 py-2.5 text-right text-[13px] tabular-nums">
                {pct1(s.ofPrev)}
              </span>
              <span role="cell" className="px-3 py-2.5 text-right text-[13px] tabular-nums">
                {pct1(s.ofDelivered)}
              </span>
            </div>
          ))}
        </div>
      </div>
      <p className={NOTE}>
        Opens are inflated by Apple Mail privacy protection: read them as a ceiling, not a rate.
        Source: email_message_event (Resend) for send to click; unlock_feedback for answers; report
        events for &ldquo;Opened report&rdquo;.
      </p>
      <p className={NOTE}>
        Sent: the emails sent in the range (unlock_feedback.sent_at), each followed to now; a bounce
        is not delivered ({plural(data.bounced, "bounce")} here). A step implies the ones before it:
        an answer was a click on a reason, a click needs the email open, an open needs it delivered,
        so an email read with its images off still counts as opened. Answer confirmed: /why recorded
        it in a browser (answered_at), less the answers under 2 s after delivery, which are scanners
        and bots (see Data quality). Added detail: a chip picked or words written on the follow-up
        page; a change of answer alone is none. Opened report is of the free unlocks: after the
        unlock, a second or more in a chapter past the first, or anything used in it (the
        report&rsquo;s own reading per chapter).
      </p>
    </Card>
  );
}

const QUALITY_TONE = { ink: "text-ap-ink", bad: "text-ap-bad-ink", muted: "text-ap-body" };

function Quality({ data }: { data: Data }) {
  return (
    <Card id="quality" labelledBy="h-qual">
      <SectionHead
        id="h-qual"
        title="Data quality"
        description="How the raw clicks on a reason become the answers we count."
      />
      <div className="flex max-w-[720px] flex-col">
        {data.quality.map((q) => (
          <div
            key={q.key}
            className="grid items-center gap-4 border-b border-ap-line py-2.5 last:border-b-0"
            style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}
          >
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-bold text-ap-ink">{q.name}</span>
              <span className="text-xs leading-snug text-ap-muted">{q.note}</span>
            </span>
            <span
              className={`text-right font-serif text-[22px] tabular-nums ${q.strong ? "font-bold" : "font-semibold"} ${QUALITY_TONE[q.tone]}`}
            >
              {q.minus && q.n > 0 ? `−${count(q.n)}` : count(q.n)}
            </span>
          </div>
        ))}
      </div>
      <p className={NOTE}>
        Raw reason clicks: the first click Resend saw in each email, or an answer where it saw none.
        The answers we count are those clicks less the scanner and bot clicks. Repeat taps and
        reloads: every time /why recorded the answer again after the first, so they are not clicks
        of their own.
      </p>
    </Card>
  );
}

function Reasons({ data }: { data: Data }) {
  const [picked, setPicked] = useState<string | null>(null);
  const sel = data.reasons.find((r) => r.code === picked) ?? data.reasons[0];
  const chipTop = Math.max(1, ...(sel?.chips ?? []).map((c) => c.n));
  // On a phone the bar goes (the share is beside it as a number), so the row fits the screen.
  const cols =
    "grid-cols-[minmax(0,1fr)_56px_44px] sm:grid-cols-[minmax(180px,1.4fr)_minmax(140px,1.6fr)_56px_44px]";
  return (
    <Card id="reasons" labelledBy="h-rea">
      <SectionHead
        id="h-rea"
        title="Why they didn’t unlock"
        description={`Share of ${plural(data.answers, "confirmed answer")}. Pick a reason to see what people added on the follow-up page.`}
        align="end"
        right={
          <div className="flex flex-wrap gap-2">
            {data.themes.map((t) => (
              <span
                key={t.name}
                className="inline-flex min-h-8 items-baseline gap-1.5 rounded-full bg-ap-ground px-3 py-1.5 text-[13px] text-ap-body"
              >
                <span className="font-semibold">{t.name}</span>
                <span className="font-bold tabular-nums text-ap-ink">{pct1(t.share)}</span>
              </span>
            ))}
          </div>
        }
      />
      <div className="flex flex-wrap items-start gap-5">
        <div role="list" className="flex min-w-0 flex-[3_1_520px] flex-col gap-1">
          {data.reasons.map((r) => {
            const on = r.code === sel?.code;
            return (
              <div role="listitem" key={r.code}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked(r.code)}
                  className={`grid ${cols} min-h-[52px] w-full cursor-pointer items-center gap-3.5 rounded-[14px] border px-3.5 py-2.5 text-left font-sans text-ap-ink ${on ? "border-ap-purple bg-ap-purple/10" : "border-ap-line bg-white hover:bg-ap-ground"}`}
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-bold">{r.label}</span>
                    <span className="text-xs text-ap-muted">{r.theme}</span>
                  </span>
                  <span className="hidden sm:block">
                    <Bar pct={r.bar} />
                  </span>
                  <span className="text-right text-sm font-bold tabular-nums">{pct1(r.share)}</span>
                  <span className="text-right text-[13px] tabular-nums text-ap-muted">
                    {count(r.n)}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
        {sel && (
          <aside
            aria-label="Selected reason"
            className="flex min-w-0 flex-[2_1_340px] flex-col gap-4 rounded-[20px] bg-ap-ground p-5"
          >
            <div className="flex flex-col gap-1">
              <Eyebrow>Follow-up page</Eyebrow>
              <span className="font-serif text-xl font-semibold leading-snug">{sel.label}</span>
              <span className="text-[13px] text-ap-body">
                {sel.n
                  ? `${plural(sel.n, "answer")} · ${count(sel.detail)} added detail (${fmt("pct", sel.detail / sel.n, 0)})`
                  : "No answers in this range"}
              </span>
            </div>
            <div className="flex flex-col gap-2.5">
              <span className="text-[13px] font-bold">{sel.question}</span>
              {sel.chips.map((c) => (
                <div
                  key={c.label}
                  className="grid items-center gap-2.5"
                  style={{ gridTemplateColumns: "minmax(0,1.5fr) minmax(80px,1fr) 40px" }}
                >
                  <span className="text-[13px] text-ap-body">{c.label}</span>
                  <Bar pct={c.n / chipTop} height={8} track="#ffffff" />
                  <span className="text-right text-[13px] font-bold tabular-nums">
                    {count(c.n)}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-bold">In their words</span>
              {sel.quotes.length === 0 && (
                <span className="text-[13px] text-ap-muted">
                  Nobody wrote anything for this reason in this range.
                </span>
              )}
              {sel.quotes.map((q, i) => (
                <p
                  key={i}
                  className="m-0 rounded-[14px] bg-white px-3.5 py-3 font-serif text-[15px] italic leading-[1.45] text-ap-ink"
                >
                  &ldquo;{q}&rdquo;
                </p>
              ))}
            </div>
          </aside>
        )}
      </div>
      <p className={NOTE}>
        Of the answers we count, by the answer now (a reader can change it; the last one is kept).
        Chips are counted for the reason they were picked under; In their words shows the two newest
        notes, masked.
      </p>
    </Card>
  );
}

function Segments({ data }: { data: Data }) {
  const cols = data.segments.columns;
  const gtc = `minmax(240px,2fr) repeat(${cols.length}, minmax(76px,1fr))`;
  return (
    <Card id="segments" labelledBy="h-seg">
      <SectionHead
        id="h-seg"
        title="Reasons by segment"
        description="Each column adds up to 100%. Darker means a bigger share of that group."
      />
      <div className="overflow-x-auto rounded-[14px] border border-ap-line">
        <div
          role="table"
          aria-label="Reasons by segment"
          style={{ minWidth: 240 + cols.length * 92 }}
        >
          <div role="row" className="grid bg-ap-ground" style={{ gridTemplateColumns: gtc }}>
            <span role="columnheader" className={HEAD}>
              Reason
            </span>
            {cols.map((c) => (
              <span
                key={c.key}
                role="columnheader"
                className={`${HEAD} flex flex-col gap-0.5 text-center ${c.small ? "opacity-60" : ""}`}
              >
                <span>{c.name}</span>
                <span className="font-semibold normal-case tracking-normal">n = {count(c.n)}</span>
              </span>
            ))}
          </div>
          {data.segments.rows.map((r) => (
            <div
              key={r.code}
              role="row"
              className="grid items-stretch border-t border-ap-line"
              style={{ gridTemplateColumns: gtc }}
            >
              <span
                role="rowheader"
                className="flex items-center px-3 py-2.5 text-[13px] font-semibold"
              >
                {r.label}
              </span>
              {r.cells.map((v, i) => {
                const small = cols[i]!.small;
                return (
                  <span
                    key={cols[i]!.key}
                    role="cell"
                    className={`m-[3px] rounded-lg p-2 text-center text-[13px] font-bold tabular-nums ${small || v === null ? "bg-ap-ground text-ap-quiet" : ""}`}
                    style={small || v === null ? undefined : heat(v)}
                  >
                    {fmt("pct", v, 0)}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className={NOTE}>
        Groups under 20 answers are greyed out and not compared. Gender and age come from the survey
        answers, as on every AP page; the device is the one the first answer came from.
      </p>
    </Card>
  );
}

function Time({ data }: { data: Data }) {
  const t = data.time;
  const days = t.days;
  const total = days.reduce((a, d) => a + d.n, 0);
  const top = Math.max(1, ...days.map((d) => d.n));
  return (
    <Card id="time" labelledBy="h-time">
      <SectionHead
        id="h-time"
        title="Answers per day after send"
        description={`${total ? `${fmt("pct", t.within48h, 0)} of the answers came in the first 48 hours.` : "No answers in this range yet."} No reminder is sent in this version.`}
      />
      <div className="relative">
        <div
          role="img"
          aria-label={`Answers per day after send: ${days.map((d) => `${d.label} ${d.n}`).join(", ")}.`}
          className="flex h-[200px] items-end gap-2 pt-2"
        >
          {days.map((d) => (
            <div
              key={d.label}
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
            >
              <span className="text-[11px] font-bold tabular-nums text-ap-body">{count(d.n)}</span>
              <span
                className="w-full max-w-8 rounded-b-sm rounded-t-md bg-ap-purple"
                style={{ height: `${Math.round((d.n / top) * 150)}px` }}
              />
              <span className="text-[11px] text-ap-muted">{d.label}</span>
            </div>
          ))}
        </div>
        <IndexHover
          xs={days.map((_, i) => ((i + 0.5) / days.length) * 100)}
          label="Answers per day after send"
          band={(i) => ({ left: (i / days.length) * 100, width: 100 / days.length })}
          tip={(i) => ({
            title: i === days.length - 1 ? "Day 10 or later" : `Day ${i} after the send`,
            sub:
              i === days.length - 1
                ? "240 hours or more after it"
                : `${i * 24} to ${(i + 1) * 24} hours after it`,
            rows: [
              { label: "Answers", value: count(days[i]!.n), color: PURPLE, mark: "square" },
              {
                label: "Of all answers",
                value: total ? fmt("pct", days[i]!.n / total, 1) : EMPTY,
                strong: true,
              },
            ],
          })}
        />
      </div>
      <div
        className="grid gap-2.5"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(170px, 100%), 1fr))" }}
      >
        <Box label="Median time to answer" value={waitText(t.medianMs)} />
        <Box label="From reminder" value="None" note="No reminder in this version" />
        <Box label="Unsubscribed" value={pct1(t.unsubRate)} note={people(t.unsubscribed)} />
      </div>
      <p className={NOTE}>
        Days of 24 hours from the send: D0 is its first day, D10+ day 10 and later. Median time to
        answer: from the send to the answer we count. Unsubscribed: through this email&rsquo;s link
        (campaign unlock_feedback), of the emails delivered.
      </p>
    </Card>
  );
}

function Box({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[14px] bg-ap-ground p-3">
      <span className="text-xs text-ap-muted">{label}</span>
      <span className="font-serif text-[22px] font-semibold tabular-nums">{value}</span>
      {note && <span className="text-xs text-ap-muted">{note}</span>}
    </div>
  );
}

function Subjects({ data }: { data: Data }) {
  // The axis reaches the highest interval, in steps of 5%.
  const top = Math.max(0.05, Math.ceil(Math.max(0, ...data.arms.map((a) => a.hi ?? 0)) * 20) / 20);
  const at = (v: number) => `${((v / top) * 100).toFixed(2)}%`;
  const gtc = "44px minmax(220px,2fr) minmax(200px,2fr) 150px";
  return (
    <Card id="subjects" labelledBy="h-subj">
      <SectionHead
        id="h-subj"
        title="Subject test"
        description="Answer rate per subject line, of the emails delivered, with its 90% interval."
      />
      <div className="overflow-x-auto rounded-[14px] border border-ap-line">
        <div role="table" aria-label="Subject test" style={{ minWidth: 720 }}>
          <div role="row" className="grid bg-ap-ground" style={{ gridTemplateColumns: gtc }}>
            <span role="columnheader" className={HEAD}>
              Arm
            </span>
            <span role="columnheader" className={HEAD}>
              Subject line
            </span>
            <span role="columnheader" className={`${HEAD} flex justify-between`}>
              <span>0%</span>
              <span>{fmt("pct", top, 0)}</span>
            </span>
            <span role="columnheader" className={`${HEAD} text-right`}>
              Answer rate
            </span>
          </div>
          {data.arms.map((a) => (
            <div
              key={a.arm}
              role="row"
              className="grid items-center border-t border-ap-line"
              style={{ gridTemplateColumns: gtc }}
            >
              <span role="cell" className="px-3 py-3">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-ap-purple/10 text-[13px] font-bold text-ap-violet">
                  {a.arm}
                </span>
              </span>
              <span role="rowheader" className="px-3 py-3 text-sm font-semibold">
                {a.subject}
              </span>
              <span role="cell" className="px-3 py-3">
                <span className="relative block h-3 rounded-full bg-ap-track" aria-hidden="true">
                  {a.rate !== null && a.lo !== null && a.hi !== null && (
                    <>
                      <span
                        className="absolute inset-y-0 rounded-full bg-ap-purple/40"
                        style={{ left: at(a.lo), width: at(a.hi - a.lo) }}
                      />
                      <span
                        className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ap-violet shadow-[0_0_0_2px_#ffffff]"
                        style={{ left: at(a.rate) }}
                      />
                    </>
                  )}
                </span>
              </span>
              <span role="cell" className="flex flex-col items-end px-3 py-3 tabular-nums">
                <span className="text-sm font-bold">{pct1(a.rate)}</span>
                <span className="text-xs text-ap-muted">
                  {a.delivered
                    ? `${count(a.answers)} of ${count(a.delivered)} · ${fmt("pct", a.lo, 1)} to ${fmt("pct", a.hi, 1)}`
                    : "none delivered"}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
      <p className={NOTE}>
        Each email draws one of the four subject lines at random, an equal split, so the arms differ
        by their subject alone. Answer rate: the answers we count of the emails delivered; the bar
        is its 90% Wilson interval, the dot the rate. Arm D names the reader&rsquo;s archetype.
      </p>
    </Card>
  );
}

function After({ data }: { data: Data }) {
  const a = data.after;
  const gtc = "minmax(0,1.6fr) minmax(0,1fr) minmax(0,1fr)";
  return (
    <Card id="after" labelledBy="h-aft">
      <SectionHead
        id="h-aft"
        title="After the free unlock"
        description={`What the ${people(a.free)} did with their full report, against readers who paid to unlock theirs in the same period (pay to start's full-report buyers, whose report came unlocked, left out).`}
      />
      <div className="overflow-hidden rounded-[14px] border border-ap-line">
        <div role="table" aria-label="After the free unlock">
          <div role="row" className="grid bg-ap-ground" style={{ gridTemplateColumns: gtc }}>
            <span role="columnheader" className={HEAD}>
              Metric
            </span>
            {[
              { label: "Free unlock", n: a.free },
              { label: "Paid", n: a.paid },
            ].map((g) => (
              <span
                key={g.label}
                role="columnheader"
                className={`${HEAD} flex flex-col items-end gap-0.5 text-right`}
              >
                <span>{g.label}</span>
                <span className="font-semibold normal-case tracking-normal">n = {count(g.n)}</span>
              </span>
            ))}
          </div>
          {a.rows.map((r) => (
            <div
              key={r.key}
              role="row"
              className="grid border-t border-ap-line"
              style={{ gridTemplateColumns: gtc }}
            >
              <span role="rowheader" className="px-3 py-2.5 text-[13px] font-semibold">
                {r.name}
              </span>
              <span
                role="cell"
                className="px-3 py-2.5 text-right text-[13px] font-bold tabular-nums"
              >
                {fmt(r.unit, r.free, r.digits)}
              </span>
              <span
                role="cell"
                className="px-3 py-2.5 text-right text-[13px] tabular-nums text-ap-body"
              >
                {fmt(r.unit, r.paid, r.digits)}
              </span>
            </div>
          ))}
        </div>
      </div>
      <p className={NOTE}>
        Free unlock: the readers whose answer unlocked their report, from the moment it did. Paid:
        readers whose first full unlock (Full, Full All or Core) was paid in the range, from the
        first email on, from the moment they paid; anyone this email gifted the report to first is
        left out. Opened the full report: read past the first chapter. Avg. time: over the readers
        whose reading was recorded, each visit up to 30 minutes. Chapters opened: per reader who
        opened any. Thumbs up: of the chapter votes. Shared or invited: shared the report or invited
        someone to the test.
      </p>
    </Card>
  );
}

const SHOWN = 8;

function Written({ data }: { data: Data }) {
  const [search, setSearch] = useState("");
  const [all, setAll] = useState(false);
  const w = data.written;
  const term = search.trim().toLowerCase();
  const matches = term
    ? w.rows.filter((r) =>
        [r.text, r.reason, r.archetype ?? "", r.device ?? ""].join(" ").toLowerCase().includes(term)
      )
    : w.rows;
  const shown = all ? matches : matches.slice(0, SHOWN);
  const gtc = "110px minmax(180px,1.1fr) minmax(300px,2.4fr) 120px 90px";
  return (
    <Card id="answers" labelledBy="h-ans">
      <SectionHead
        id="h-ans"
        title="Written answers"
        description="Newest first. Masked like the raw data explorer: no email addresses or phone numbers."
        align="end"
        right={
          <label className="flex flex-[0_1_280px] flex-col gap-1 text-xs font-bold text-ap-muted">
            Search answers
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setAll(false);
              }}
              placeholder="e.g. partner, price, chapter"
              className="min-h-11 rounded-lg border border-ap-ink/[0.18] bg-white px-3 font-sans text-sm text-ap-ink"
            />
          </label>
        }
      />
      <div className="overflow-x-auto rounded-[14px] border border-ap-line">
        <div role="table" aria-label="Written answers" style={{ minWidth: 860 }}>
          <div role="row" className="grid bg-ap-ground" style={{ gridTemplateColumns: gtc }}>
            {["When", "Reason", "Answer", "Archetype", "Device"].map((h) => (
              <span key={h} role="columnheader" className={HEAD}>
                {h}
              </span>
            ))}
          </div>
          {shown.length === 0 && (
            <p className="m-0 border-t border-ap-line px-3 py-3 text-sm text-ap-muted">
              {w.rows.length
                ? "No answer matches the search."
                : "No written answers in this range."}
            </p>
          )}
          {shown.map((r, i) => (
            <div
              key={`${r.at}-${i}`}
              role="row"
              className="grid items-start border-t border-ap-line"
              style={{ gridTemplateColumns: gtc }}
            >
              <span role="cell" className="p-3 text-xs tabular-nums text-ap-muted">
                {when(r.at)}
              </span>
              <span role="cell" className="p-3">
                <span className="inline-block rounded-full bg-ap-purple/10 px-2.5 py-1 text-xs font-bold text-ap-violet">
                  {r.reason}
                </span>
              </span>
              <span role="cell" className="p-3 text-sm leading-normal text-ap-ink">
                {r.text}
              </span>
              <span role="cell" className="p-3 text-[13px] text-ap-body">
                {r.archetype ?? EMPTY}
              </span>
              <span role="cell" className="p-3 text-[13px] text-ap-body">
                {r.device ?? EMPTY}
              </span>
            </div>
          ))}
        </div>
      </div>
      {matches.length > SHOWN && (
        <button
          type="button"
          onClick={() => setAll((a) => !a)}
          aria-expanded={all}
          className="min-h-11 cursor-pointer self-center rounded-full border border-ap-line bg-white px-[22px] text-sm font-bold text-ap-ink"
        >
          {all ? "Show fewer" : `Show all ${count(matches.length)}`}
        </button>
      )}
      {w.total > w.rows.length && (
        <p className={NOTE}>
          The table holds the newest {count(w.rows.length)} of the range&rsquo;s{" "}
          {plural(w.total, "written answer")}.
        </p>
      )}
    </Card>
  );
}
