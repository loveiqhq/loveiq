"use client";

import { fmt } from "@features/admin/server/ap/format";
import type { CoachesKpi } from "@features/admin/server/ap/mira-coaches";

import { Card, SectionHead, StatBox } from "./kit";

const HEAD = "px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-ap-muted";
const CELL = "px-3 py-2.5 text-right text-sm tabular-nums";
const NOTE = "m-0 text-xs leading-relaxed text-ap-muted";
const count = (n: number) => fmt("count", n);
const share = (a: number, b: number) => (b ? a / b : null);

/**
 * AP › Mira, "Coaches & picks" (features/admin/server/ap/mira-coaches.ts): Notify me per coach
 * (the demand signal for which coach to build next), the coaches page and its finder, Home's
 * picks, the guide's "Ask Mira about this" per practice, and searches that found nothing.
 */
export default function ApMiraCoaches({ k }: { k: CoachesKpi }) {
  const finderRows = k.finder.outcomes.filter((o) => o.people > 0);
  return (
    <Card id="coaches" labelledBy="h-coaches">
      <SectionHead
        id="h-coaches"
        level={3}
        title="Coaches & picks"
        description="Who people want to talk to next, and whether the coaches page, Home’s picks and the guide lead them back to Mira."
      />
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))" }}
      >
        <StatBox
          stat={{
            label: "Coaches page",
            unit: "count",
            value: k.roster.people,
            note: `people, ${count(k.roster.views)} ${k.roster.views === 1 ? "view" : "views"}`,
          }}
        />
        <StatBox
          stat={{
            label: "Find my challenge finished",
            unit: "pct",
            value: share(k.finder.done, k.finder.started),
            note: `${count(k.finder.done)} of ${count(k.finder.started)} who opened it`,
          }}
        />
        <StatBox
          stat={{
            label: "Picks clicked",
            unit: "pct",
            value: share(k.picks.clicks, k.picks.views),
            note: `${count(k.picks.clicks)} clicks on ${count(k.picks.views)} Home views`,
          }}
        />
        <StatBox
          stat={{
            label: "Searches with no result",
            unit: "count",
            value: k.emptySearches.home + k.emptySearches.roster,
            note: `Home ${count(k.emptySearches.home)}, coaches page ${count(k.emptySearches.roster)}`,
          }}
        />
      </div>

      <Table
        label="Notify me, per coach"
        columns={["Coming-soon coach", "In the range", "Since the beta"]}
        rows={k.notify.map((r) => ({
          key: r.id,
          head: r.name,
          sub: r.challenge,
          cells: [r.inRange, r.allTime],
        }))}
      />

      <Table
        label="“Ask Mira about this”, per practice"
        columns={["Guide practice", "Opened the chat", "Then wrote"]}
        rows={k.guide.map((g) => ({
          key: String(g.practice),
          head: `${g.practice}. ${g.name}`,
          cells: [g.opened, g.started],
        }))}
      />

      {finderRows.length ? (
        <Table
          label="Find my challenge, where people ended"
          columns={["Outcome", "People"]}
          rows={finderRows.map((o) => ({ key: o.id, head: o.label, cells: [o.people] }))}
        />
      ) : null}

      <p className={NOTE}>
        People: an account, or a browser before it signs in; the team is left out as everywhere on
        this page. Notify me counts each person once per coach, Home&rsquo;s older card
        (&ldquo;Libido challenges&rdquo;, &ldquo;Saying what you want&rdquo;) included; since the
        beta means up to the range&rsquo;s last day, and these requests are who to tell when a coach
        is ready. Picks clicked: clicks on Home&rsquo;s &ldquo;Picked for you&rdquo; per Home view
        that showed picks ({count(k.picks.personal)} of {count(k.picks.views)} from the
        person&rsquo;s own chats, the rest the guide&rsquo;s first practice;{" "}
        {count(k.picks.practiceClicks)} on practices, {count(k.picks.coachClicks)} on coaches). Then
        wrote: a first message within 30 minutes of opening the chat from the practice. Searches are
        counted once they settle, never with their words. Recorded from 22 Nov 2026.
      </p>
    </Card>
  );
}

function Table({
  label,
  columns,
  rows,
}: {
  label: string;
  columns: string[];
  rows: Array<{ key: string; head: string; sub?: string; cells: number[] }>;
}) {
  const gtc = `minmax(200px,2fr) ${columns
    .slice(1)
    .map(() => "120px")
    .join(" ")}`;
  return (
    <div className="overflow-x-auto rounded-[14px] border border-ap-line">
      <div role="table" aria-label={label} style={{ minWidth: 440 }}>
        <div role="row" className="grid bg-ap-ground" style={{ gridTemplateColumns: gtc }}>
          {columns.map((h, i) => (
            <span key={h} role="columnheader" className={`${HEAD} ${i ? "text-right" : ""}`}>
              {h}
            </span>
          ))}
        </div>
        {rows.map((r) => (
          <div
            key={r.key}
            role="row"
            className="grid items-center border-t border-ap-line"
            style={{ gridTemplateColumns: gtc }}
          >
            <span role="rowheader" className="flex flex-col px-3 py-2.5">
              <span className="text-sm font-bold">{r.head}</span>
              {r.sub ? <span className="text-xs text-ap-muted">{r.sub}</span> : null}
            </span>
            {r.cells.map((c, i) => (
              <span key={i} role="cell" className={CELL}>
                {count(c)}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
