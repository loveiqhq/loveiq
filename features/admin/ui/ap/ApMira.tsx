"use client";

import { useState, type ReactNode } from "react";

import { shortDate } from "@features/admin/server/ap/days";
import { EMPTY, fmt } from "@features/admin/server/ap/format";
import type { CohortRow, MiraPayload } from "@features/admin/server/ap/mira";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import { getCsrfToken } from "@shared/http/csrf-client";

import ApFilterBar from "./ApFilterBar";
import { bucketTitles } from "./hover";
import {
  Bar,
  Busy,
  Card,
  Failed,
  KpiTileV2,
  Loading,
  PageHeader,
  RangeLine,
  SectionHead,
  SectionNav,
  StatBox,
  TileGrid,
  useHashScroll,
} from "./kit";
import { useApFilters } from "./useApFilters";

/**
 * Mira (beta): Marcus's four "MVP success" boards (Overview, Engagement & retention, Outcomes &
 * satisfaction, Nudge emails) as sections of one page, in AP's style. Real figures only: what
 * nothing records yet says "Not measured yet" and why, and no target has been set.
 */
type Data = MiraPayload;

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "engagement", label: "Engagement & retention" },
  { id: "outcomes", label: "Outcomes & satisfaction" },
  { id: "nudges", label: "Nudge emails" },
];

const PURPLE = "#795fc8";
const LAVENDER = "#9d8ad7";
const VIOLET = "#4000b6";
const HEAD = "px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-ap-muted";
const NOTE = "m-0 text-xs leading-relaxed text-ap-muted";
const pct = (v: number | null) => fmt("pct", v);
const count = (n: number) => fmt("count", n);
const share = (a: number, b: number) => (b ? a / b : null);

export default function ApMira() {
  const { params } = useApFilters();
  const { data, loading, error, refetch } = useAdminFetch<Data>("/api/admin/ap/mira", params);
  useHashScroll(Boolean(data));
  return (
    <>
      <div className="flex flex-col gap-4">
        <PageHeader
          crumbs={["AI coach", "Mira (beta)"]}
          title="Mira (beta)"
          description="How Mira’s beta is doing against the guiding goals: conversion, engagement, therapeutic success, satisfaction, retention and user familiarity."
        />
        <SectionNav label="Mira sections" sections={SECTIONS} ready={Boolean(data)} />
      </div>
      <ApFilterBar
        fixed={["assessment", "funnel", "source", "device", "tier", "visitor"]}
        fixedNote="Mira is a product of her own, so only the period applies: every chat with her counts, signed in or not."
      />
      {loading && !data && <Loading label="the Mira page" />}
      {error && <Failed message={error} onRetry={refetch} />}
      {data && (
        <Busy busy={loading}>
          <RangeLine
            data={data}
            sources="Production database (Mira's tables)"
            trend={data.tiles.conversations?.trend}
          />
          <Overview data={data} />
          <Engagement data={data} />
          <Outcomes data={data} />
          <Board
            id="nudges"
            title="Daily nudge emails"
            description="How the daily nudges perform by type: opens, clicks, the conversations they start, how many messages those have, and unsubscribes."
          >
            <Tiles
              data={data}
              keys={[
                "nudgesSent",
                "nudgeOpen",
                "nudgeCtr",
                "nudgeStarted",
                "nudgeMessages",
                "nudgeUnsub",
              ]}
            />
            <NudgeTypes data={data} />
          </Board>
          <p className={NOTE}>
            The team is left out: accounts with a team address (ADMIN_TEST_EMAIL_REGEX, @loveiq.org
            by default) and the browsers they signed in from, and, from 21 Nov 2026, team browsers
            (one signed in to AP, marked below, or one of our probes) with every account created or
            signed in from them and all they did before. Anyone else&rsquo;s anonymous browser, and
            a deleted account (its events lose both links), can&rsquo;t be told apart, so they are
            counted; a deleted account&rsquo;s own messages belong to nobody any more, so they make
            no conversation.
          </p>
          <TeamBrowser />
        </Busy>
      )}
    </>
  );
}

/**
 * "This browser counts as team": its Mira events and accounts stay out of the numbers
 * (shared/http/team-cookie.ts). The cookie is httpOnly, so the server reads and sets it.
 */
function TeamBrowser() {
  const url = "/api/admin/ap/team-browser";
  const { data } = useAdminFetch<{ team?: boolean }>(url);
  const [saved, setSaved] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const team = saved ?? data?.team === true;
  const toggle = async () => {
    setBusy(true);
    setFailed(false);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": getCsrfToken() },
      body: JSON.stringify({ team: !team }),
    }).catch(() => null);
    const body = res?.ok
      ? ((await res.json().catch(() => null)) as { team?: boolean } | null)
      : null;
    if (typeof body?.team === "boolean") setSaved(body.team);
    else setFailed(true);
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-2 text-sm font-semibold text-ap-ink">
        <input
          type="checkbox"
          className="h-4 w-4 accent-ap-purple"
          checked={team}
          disabled={!data || busy}
          onChange={() => void toggle()}
        />
        This browser counts as team
      </label>
      <p className={NOTE}>
        {failed
          ? "Not saved. Please try again."
          : "Its Mira chats and accounts stay out of these numbers. Every AP sign-in turns it on; turn it off on a browser someone outside the team uses."}
      </p>
    </div>
  );
}

/** One of the design's boards: a heading over its tiles and cards. */
function Board({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`h-${id}`}
      className="flex scroll-mt-20 flex-col gap-4 lg:scroll-mt-6"
    >
      <div className="flex flex-col gap-1.5">
        <h2
          id={`h-${id}`}
          className="m-0 font-serif text-[28px] font-semibold leading-tight text-ap-ink"
        >
          {title}
        </h2>
        <p className="m-0 text-[15px] leading-relaxed text-ap-body">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Tiles({ data, keys }: { data: Data; keys: string[] }) {
  const titles = bucketTitles(data.range.from, data.range.to);
  return (
    <TileGrid min={170}>
      {keys.map((k) => {
        const t = data.tiles[k]!;
        return (
          <KpiTileV2
            key={k}
            tile={t}
            foot
            titles={titles}
            digits={k === "stickiness" ? 2 : undefined}
          />
        );
      })}
    </TileGrid>
  );
}

function Overview({ data }: { data: Data }) {
  return (
    <Board
      id="overview"
      title="Overview"
      description="Conversations, the 10-conversation mark, sign-ups and the way from a first message to an account."
    >
      <Tiles data={data} keys={["conversations", "passTen", "signups", "signupRate", "nps"]} />
      <p className={NOTE}>
        Conversations: a person&rsquo;s messages split wherever more than 30 minutes pass between
        two; each part with 3 or more messages is a conversation, counted when its 3rd message is
        sent, signed in or not. Pass 10 conversations: of the people with a conversation in the
        range, the share with 10 or more since the beta began. CVR: of the people who started a chat
        signed out in the range, the share who created a free account after it, by the range&rsquo;s
        last day. Signed-up users: free accounts created in the range; a deleted account drops out.
        NPS: the share of 9&ndash;10 answers minus the share of 0&ndash;6, from &minus;100 to +100.
      </p>
      <Scorecard data={data} />
      <Funnel data={data} />
      <KeepCard data={data} />
      <StyleTipCard data={data} />
      <Sources data={data} />
    </Board>
  );
}

/** The "Keep this chat" card: shown, Keep, an account after it, and Not now. */
function KeepCard({ data }: { data: Data }) {
  const { shown, kept, accounts, notNow } = data.keepCard;
  return (
    <FunnelCard
      id="keep-card"
      title="“Keep this chat” card"
      description="How many people the card reaches, and how many keep their chat by creating an account."
      base={shown}
      rows={[
        ["Shown the card", shown, "People who saw “Keep this chat” in the range"],
        ["Tapped Keep", kept, "Of those shown it, in the range"],
        [
          "Created an account after it",
          accounts,
          "Of those who tapped Keep, by the range’s last day",
        ],
        ["Tapped Not now", notNow, "Of those shown it, in the range"],
      ]}
      note="People: an account, or a browser before it signs in. Bars and shares are of the people shown the card in the range. An account counts when it was created after the person’s first Keep in the range, by its last day; signing in to an older account is no new one. Recorded from 21 Nov 2026."
    />
  );
}

/** The "Make Mira yours" tip on the chat's coaching-style button: shown, opened, a style saved. */
function StyleTipCard({ data }: { data: Data }) {
  const { shown, opened, saved } = data.styleTip;
  return (
    <FunnelCard
      id="style-tip"
      title="“Make Mira yours” tip"
      description="How many people the coaching-style tip reaches, and how many open the panel and save a style."
      base={shown}
      rows={[
        ["Shown the tip", shown, "People who saw the tip after a reply of Mira’s, in the range"],
        ["Opened the panel from it", opened, "Of those shown it, in the range"],
        [
          "Saved a coaching style",
          saved,
          "Of those shown it, after the tip, by the range’s last day",
        ],
      ]}
      note="The tip shows once per browser, after one of Mira’s replies. People: an account, or a browser before it signs in. Saved styles count from either the tip or the header button. Recorded from 21 Nov 2026."
    />
  );
}

/** One funnel as bars: each row's count and its share of `base`. */
function FunnelCard({
  id,
  title,
  description,
  base,
  rows,
  note,
}: {
  id: string;
  title: string;
  description: string;
  base: number;
  rows: Array<[label: string, n: number, note: string]>;
  note: string;
}) {
  return (
    <Card id={id} labelledBy={`h-${id}`}>
      <SectionHead id={`h-${id}`} level={3} title={title} description={description} />
      <div className="flex max-w-[860px] flex-col gap-3">
        {rows.map(([label, n, rowNote]) => (
          <div
            key={label}
            className="grid items-center gap-3"
            style={{ gridTemplateColumns: "minmax(150px,240px) minmax(0,1fr) 110px" }}
          >
            <span className="flex flex-col">
              <span className="text-sm font-semibold">{label}</span>
              <span className="text-xs leading-snug text-ap-muted">{rowNote}</span>
            </span>
            <Bar pct={share(n, base)} color={PURPLE} />
            <span className="text-right text-sm font-bold tabular-nums">
              {count(n)} <span className="font-medium text-ap-muted">({pct(share(n, base))})</span>
            </span>
          </div>
        ))}
      </div>
      <p className={NOTE}>{note}</p>
    </Card>
  );
}

function Sources({ data }: { data: Data }) {
  const gtc = "minmax(200px,2fr) 110px 120px 140px 110px";
  return (
    <Card id="sources" labelledBy="h-sources">
      <SectionHead
        id="h-sources"
        level={3}
        title="Where people came from"
        description="The people who opened Mira in the range, by the link or site that brought them, and how many of them started a chat and created an account."
      />
      {data.sources.length === 0 ? (
        <p className="m-0 text-sm text-ap-muted">Nobody opened Mira in the range.</p>
      ) : (
        <div className="overflow-x-auto rounded-[14px] border border-ap-line">
          <div role="table" aria-label="Where people came from" style={{ minWidth: 680 }}>
            <div role="row" className="grid bg-ap-ground" style={{ gridTemplateColumns: gtc }}>
              {[
                "Source",
                "Opened Mira",
                "Started a chat",
                "Created an account",
                "Sign-up rate",
              ].map((h, i) => (
                <span key={h} role="columnheader" className={`${HEAD} ${i ? "text-right" : ""}`}>
                  {h}
                </span>
              ))}
            </div>
            {data.sources.map((r) => (
              <div
                key={r.label}
                role="row"
                className="grid items-center border-t border-ap-line"
                style={{ gridTemplateColumns: gtc }}
              >
                <span role="rowheader" className="break-all px-3 py-2.5 text-sm font-bold">
                  {r.label}
                </span>
                {[count(r.opened), count(r.started), count(r.accounts), pct(r.rate)].map((v, i) => (
                  <span key={i} role="cell" className="px-3 py-2.5 text-right text-sm tabular-nums">
                    {v}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      <p className={NOTE}>
        A person counts under the first source recorded for them: a tagged link&rsquo;s source
        (utm_source), else the site that linked to Mira, else Direct. Not recorded: nothing was
        recorded before 21 Nov 2026. Started a chat and Created an account count the people who
        opened Mira in the range and did so in it; the sign-up rate is Created an account ÷ Opened
        Mira.
      </p>
    </Card>
  );
}

const GOALS: Array<[string, Array<[string, string]>]> = [
  [
    "Conversion",
    [
      ["signupRate", "User sign-up rate"],
      ["subscription", "Subscription rate"],
    ],
  ],
  [
    "Engagement",
    [
      ["passTen", "Pass 10 conversations"],
      ["dau", "DAU %"],
      ["wau", "WAU %"],
      ["timeSpent", "Daily time spent"],
    ],
  ],
  ["Therapeutic success", [["bodyImage", "Body image improvement"]]],
  ["Satisfaction", [["nps", "NPS"]]],
  [
    "Retention",
    [
      ["churn", "Subscriber churn"],
      ["weekFour", "Week-4 return rate"],
    ],
  ],
  ["User familiarity", [["profileDepth", "Profile depth"]]],
];

function Scorecard({ data }: { data: Data }) {
  return (
    <Card id="goals" labelledBy="h-goals">
      <SectionHead
        id="h-goals"
        level={3}
        title="Guiding goals scorecard"
        description="Every guiding goal with its current value. The team hasn’t set the targets yet, so no goal has a status."
      />
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))" }}
      >
        {GOALS.map(([group, items]) => (
          <div key={group} className="flex flex-col rounded-[14px] border border-ap-line px-4 py-3">
            <h4 className="m-0 border-b border-ap-line pb-2 font-serif text-lg font-semibold">
              {group}
            </h4>
            {items.map(([key, label]) => {
              const t = data.tiles[key]!;
              return (
                <div
                  key={key}
                  className="flex flex-col gap-1 border-b border-ap-line py-3 last:border-b-0"
                >
                  <span className="text-sm font-bold">{label}</span>
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-serif text-[24px] font-semibold tabular-nums">
                      {t.blocked ? EMPTY : fmt(t.unit, t.value)}
                    </span>
                    <span className="text-xs text-ap-muted">Target not set</span>
                  </span>
                  {t.blocked && <span className="text-xs text-ap-muted">{t.blocked}</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Card>
  );
}

function Funnel({ data }: { data: Data }) {
  const gtc = "minmax(200px,1.4fr) minmax(180px,2fr) 130px 100px";
  const signups = data.tiles.signups?.value ?? 0;
  return (
    <Card id="funnel" labelledBy="h-funnel">
      <SectionHead
        id="h-funnel"
        level={3}
        title="From first message to subscriber"
        description="Where people drop off between opening Mira and paying. Bars show the share of everyone who opened her."
      />
      <div className="overflow-x-auto rounded-[14px] border border-ap-line">
        <div role="table" aria-label="From first message to subscriber" style={{ minWidth: 640 }}>
          <div role="row" className="grid bg-ap-ground" style={{ gridTemplateColumns: gtc }}>
            <span role="columnheader" className={HEAD}>
              Step
            </span>
            <span role="columnheader" className={HEAD}>
              Share of who opened Mira
            </span>
            <span role="columnheader" className={`${HEAD} text-right`}>
              People
            </span>
            <span role="columnheader" className={`${HEAD} text-right`}>
              Of step before
            </span>
          </div>
          {data.funnel.map((s) => (
            <div
              key={s.key}
              role="row"
              className="grid items-center border-t border-ap-line"
              style={{ gridTemplateColumns: gtc }}
            >
              <span role="rowheader" className="flex flex-col gap-0.5 px-3 py-2.5">
                <span className="text-sm font-bold">{s.label}</span>
                <span className="text-xs leading-snug text-ap-muted">{s.note}</span>
              </span>
              <span role="cell" className="px-3 py-2.5">
                <Bar pct={s.ofFirst} color={PURPLE} />
              </span>
              <span role="cell" className="px-3 py-2.5 text-right text-sm font-bold tabular-nums">
                {s.n === null ? (
                  <span className="font-medium text-ap-muted">Not measured yet</span>
                ) : (
                  `${count(s.n)} · ${pct(s.ofFirst)}`
                )}
              </span>
              <span role="cell" className="px-3 py-2.5 text-right text-[13px] tabular-nums">
                {pct(s.ofPrev)}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))" }}
      >
        <StatBox
          stat={{
            label: "Shown the sign-up card",
            unit: "count",
            value: data.gate,
            note: "People, each once: signed out, with their free messages used up",
          }}
        />
        <StatBox
          stat={{
            label: "Signed up with email",
            unit: "count",
            value: data.signupsBy.email,
            note: `of ${count(signups)} sign-ups in the range`,
          }}
        />
        <StatBox
          stat={{
            label: "Signed up with Google",
            unit: "count",
            value: data.signupsBy.google,
            note: `of ${count(signups)} sign-ups in the range`,
          }}
        />
      </div>
      <p className={NOTE}>
        People: an account, or a browser before it signs in (one that signs in counts as its
        account). Each step counts the people who also passed every step above it in the range. Gave
        consent: ticked the first-message consent in the range or before, or has an account (signing
        up asks for it). A real conversation: 3 or more messages with no gap of more than 30
        minutes, the 3rd sent in the range. Subscribed: paid plans start after the beta. A
        sign-up&rsquo;s method is that of the account&rsquo;s first sign-in.
      </p>
    </Card>
  );
}

function Engagement({ data }: { data: Data }) {
  const week4 = data.tiles.weekFour!;
  const fromNudges = data.tiles.reactivated!;
  return (
    <Board
      id="engagement"
      title="Engagement & retention"
      description="Whether people build a habit with Mira and keep coming back: active users, time spent, the 10-conversation mark and sign-up cohorts."
    >
      <Tiles data={data} keys={["dau", "wau", "stickiness", "timeSpent", "passTen"]} />
      <p className={NOTE}>
        DAU % and WAU %: each day, the share of the accounts open by then that sent a message that
        day, or in the 7 days to it, averaged over the range&rsquo;s days. Stickiness: DAU % ÷ WAU
        %. Daily time spent: each day, an account&rsquo;s time between its messages, counting only
        gaps of 5 minutes or less (a single message counts no time), averaged over the accounts that
        wrote that day, then over the range&rsquo;s days. Each tile&rsquo;s line is its figure per
        point of the range (hover a line to read it).
      </p>
      <PerUser data={data} />
      <Cohorts
        id="cohort-conversations"
        title="Conversations over time by cohort"
        description="How many conversations users have, week by week after signing up."
        rows={data.cohorts}
        read={(c, users) => {
          const avg = c.convos / users;
          return [Math.min(1, avg / 10), fmt("ratio", avg)];
        }}
        note="Average conversations per user so far (3 or more messages with no gap of more than 30 minutes; every one since the beta began, anonymous ones before signing up too), by the end of each week. Weeks run Monday to Sunday, Berlin time; a week shows once it is over."
      />
      <Cohorts
        id="retention"
        title="Retention by sign-up week"
        description="Do people keep coming back after signing up?"
        rows={data.cohorts}
        users
        read={(c, users) => [c.active / users, pct(c.active / users)]}
        note="Share of each sign-up week who sent Mira a message in each week after it (week 0 is the sign-up week). Week 4 is the beta’s retention proxy until paid plans and churn start."
      />
      <Card id="churn" labelledBy="h-churn">
        <SectionHead
          id="h-churn"
          level={3}
          title="Retention and churn"
          description="Churn starts with paid plans; until then, week-4 returns stand in for it."
        />
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))" }}
        >
          <StatBox
            stat={{
              label: "Subscriber churn",
              unit: "pct",
              value: null,
              note: "Not measured yet: paid plans start after the beta.",
            }}
          />
          <StatBox
            stat={{
              label: "Week-4 return rate",
              unit: "pct",
              value: week4.value,
              prev: week4.prev,
              note: week4.foot,
            }}
          />
          <StatBox
            stat={{
              label: "Reactivated by nudges",
              unit: "pct",
              value: fromNudges.value,
              prev: fromNudges.prev,
              note: fromNudges.foot,
            }}
          />
        </div>
        <p className={NOTE}>
          Week-4 return rate: of the accounts whose sign-up week&rsquo;s week 4 is over by the
          range&rsquo;s last day, the share who sent a message in it. Reactivated by nudges: of the
          people a nudge sent in the range reached after 7 or more days without a message, the share
          who wrote to Mira within 48 hours of it.
        </p>
      </Card>
      <WeeklySessions data={data} />
    </Board>
  );
}

/** Weekly sessions (21 Nov 2026): booked, in place, reminders sent, joined on time, cancelled. */
function WeeklySessions({ data }: { data: Data }) {
  const { scheduled, active, reminders, attended, cancelled } = data.weeklySessions;
  return (
    <Card id="weekly-sessions" labelledBy="h-weekly-sessions">
      <SectionHead
        id="h-weekly-sessions"
        level={3}
        title="Weekly sessions"
        description="Whether people book a regular 15 minutes with Mira, keep it, and turn up."
      />
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))" }}
      >
        <StatBox
          stat={{ label: "Booked", unit: "count", value: scheduled, note: "People, in the range" }}
        />
        <StatBox
          stat={{
            label: "In place",
            unit: "count",
            value: active,
            note: "Booked and not cancelled, at the range’s end",
          }}
        />
        <StatBox
          stat={{
            label: "Reminders sent",
            unit: "count",
            value: reminders,
            note: "One per session, 30 to 60 minutes before it",
          }}
        />
        <StatBox
          stat={{
            label: "Joined on time",
            unit: "pct",
            value: share(attended, reminders),
            note: `${count(attended)} of ${count(reminders)} reminded sessions`,
          }}
        />
        <StatBox
          stat={{
            label: "Cancelled",
            unit: "count",
            value: cancelled,
            note: "People, in the range",
          }}
        />
      </div>
      <p className={NOTE}>
        Sessions need an account, so people are accounts. Booked: booked a weekly session in the
        range (a later change of time doesn&rsquo;t count again). In place: booked and not
        cancelled, or ended by an under-18 stop, by the range&rsquo;s last day, reminders on or
        paused. Joined on time: of the sessions reminded in the range, the share opened from the
        session&rsquo;s link within 30 minutes of their start. Recorded from 21 Nov 2026.
      </p>
    </Card>
  );
}

function PerUser({ data }: { data: Data }) {
  return (
    <Card id="per-user" labelledBy="h-per-user">
      <SectionHead
        id="h-per-user"
        level={3}
        title="Conversations per user"
        description="How far the people with a conversation in the range have got with Mira, since the beta began."
      />
      <div className="flex max-w-[860px] flex-col gap-2.5">
        {data.perUser.map((b) => (
          <div
            key={b.label}
            className="grid items-center gap-3"
            style={{ gridTemplateColumns: "110px minmax(0,1fr) 110px" }}
          >
            <span className="text-sm font-semibold">{b.label}</span>
            <Bar pct={b.share} color={b.pastTen ? VIOLET : LAVENDER} height={12} />
            <span className="text-right text-sm font-bold tabular-nums">
              {pct(b.share)} <span className="font-medium text-ap-muted">({count(b.n)})</span>
            </span>
          </div>
        ))}
      </div>
      <p className={NOTE}>Darker bars: people past the 10-conversation mark.</p>
    </Card>
  );
}

/** A share 0..1 as the cell's purple, white figures from half way. */
function heat(v: number): { background: string; color: string } {
  const a = Math.max(0, Math.min(1, v));
  return {
    background: `rgba(121,95,200,${(0.08 + a * 0.72).toFixed(2)})`,
    color: a > 0.55 ? "#ffffff" : "#161021",
  };
}

function Cohorts({
  id,
  title,
  description,
  rows,
  read,
  note,
  users = false,
}: {
  id: string;
  title: string;
  description: string;
  rows: CohortRow[];
  /** A cell's shade (0..1) and its figure as written. */
  read: (c: { active: number; convos: number }, users: number) => [number, string];
  note: string;
  users?: boolean;
}) {
  const weeks = rows[0]?.cells.length ?? 8;
  return (
    <Card id={id} labelledBy={`h-${id}`}>
      <SectionHead id={`h-${id}`} level={3} title={title} description={description} />
      {rows.length === 0 ? (
        <p className="m-0 text-sm text-ap-muted">No sign-ups by the range&rsquo;s last day yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-[14px] border border-ap-line">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead className="bg-ap-ground">
              <tr>
                <th scope="col" className={`${HEAD} text-left`}>
                  Sign-up week
                </th>
                {users && (
                  <th scope="col" className={`${HEAD} text-right`}>
                    Users
                  </th>
                )}
                {Array.from({ length: weeks }, (_, k) => (
                  <th key={k} scope="col" className={`${HEAD} text-center`}>
                    Wk {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.week} className="border-t border-ap-line">
                  <th scope="row" className="px-3 py-2.5 text-left font-semibold">
                    Week of {shortDate(r.week)}
                  </th>
                  {users && <td className="px-3 py-2.5 text-right tabular-nums">{r.users}</td>}
                  {r.cells.map((c, k) => {
                    if (!c) return <td key={k} />;
                    const [v, text] = read(c, r.users);
                    return (
                      <td key={k} className="px-3 py-2.5 text-center tabular-nums" style={heat(v)}>
                        {text}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className={NOTE}>{note}</p>
    </Card>
  );
}

function Outcomes({ data }: { data: Data }) {
  return (
    <Board
      id="outcomes"
      title="Outcomes & satisfaction"
      description="Whether Mira actually helps: body-image change, satisfaction, how well she knows each user, and safety."
    >
      <Tiles data={data} keys={["bodyImage", "nps", "helpful", "profileDepth"]} />
      <p className={NOTE}>
        Helpful answers: thumbs up of all the thumbs given on Mira&rsquo;s replies in the range,
        signed in or not; most replies are never rated.
      </p>
      <Chips data={data} />
      <Topics data={data} />
      <Therapeutic data={data} />
      <Satisfaction data={data} />
      <Knows data={data} />
      <Safety data={data} />
    </Board>
  );
}

function Chips({ data }: { data: Data }) {
  const gtc = "minmax(220px,2fr) 110px 140px 190px";
  return (
    <Card id="starter-chips" labelledBy="h-starter-chips">
      <SectionHead
        id="h-starter-chips"
        level={3}
        title="Most used starter chips"
        description="Which suggested prompts people tap to start a chat, and which lead to a real conversation."
      />
      <div className="overflow-x-auto rounded-[14px] border border-ap-line">
        <div role="table" aria-label="Most used starter chips" style={{ minWidth: 660 }}>
          <div role="row" className="grid bg-ap-ground" style={{ gridTemplateColumns: gtc }}>
            {[
              "Starter chip",
              "Chats opened",
              "Share of new chats",
              "Became a real conversation",
            ].map((h, i) => (
              <span key={h} role="columnheader" className={`${HEAD} ${i ? "text-right" : ""}`}>
                {h}
              </span>
            ))}
          </div>
          {data.chips.map((c) => (
            <div
              key={c.label}
              role="row"
              className="grid items-center border-t border-ap-line"
              style={{ gridTemplateColumns: gtc }}
            >
              <span role="rowheader" className="px-3 py-2.5 text-sm font-bold">
                {c.label}
              </span>
              <span role="cell" className="px-3 py-2.5 text-right text-sm tabular-nums">
                {count(c.chats)}
              </span>
              <span role="cell" className="px-3 py-2.5 text-right text-sm tabular-nums">
                {pct(c.share)}
              </span>
              <span role="cell" className="px-3 py-2.5 text-right text-sm tabular-nums">
                {pct(c.real)}
              </span>
            </div>
          ))}
        </div>
      </div>
      <p className={NOTE}>
        The range&rsquo;s new chats by their first message: a starter chip, or the person&rsquo;s
        own words. A real conversation: 3 or more messages before a gap of more than 30 minutes. A
        chat whose first message was a crisis message records no chip, nor do chats before 20 Nov
        2026: both are left out.
      </p>
    </Card>
  );
}

function Topics({ data }: { data: Data }) {
  const gtc = "minmax(240px,2.2fr) 100px 110px 90px";
  const arrow = (now: number | null, before: number | null) => {
    if (now === null || before === null) return { sign: EMPTY, label: "no earlier period" };
    const d = now - before;
    if (Math.abs(d) < 0.02) return { sign: "→", label: "about the same as before" };
    return d > 0 ? { sign: "↗", label: "up on before" } : { sign: "↘", label: "down on before" };
  };
  return (
    <Card id="prompts" labelledBy="h-prompts">
      <SectionHead
        id="h-prompts"
        level={3}
        title="Most common prompts"
        description="What people bring to Mira in their own words, grouped into topics."
      />
      <div className="overflow-x-auto rounded-[14px] border border-ap-line">
        <div role="table" aria-label="Most common prompts" style={{ minWidth: 600 }}>
          <div role="row" className="grid bg-ap-ground" style={{ gridTemplateColumns: gtc }}>
            {["Topic", "New chats", "Share", "Trend"].map((h, i) => (
              <span key={h} role="columnheader" className={`${HEAD} ${i ? "text-right" : ""}`}>
                {h}
              </span>
            ))}
          </div>
          {data.topics.map((t) => {
            const a = arrow(t.share, t.prevShare);
            return (
              <div
                key={t.id}
                role="row"
                className="grid items-center border-t border-ap-line"
                style={{ gridTemplateColumns: gtc }}
              >
                <span role="rowheader" className="flex flex-col px-3 py-2.5">
                  <span className="text-sm font-bold">{t.label}</span>
                  {t.example ? (
                    <span className="text-xs text-ap-muted">&ldquo;{t.example}&rdquo;</span>
                  ) : null}
                </span>
                <span role="cell" className="px-3 py-2.5 text-right text-sm tabular-nums">
                  {count(t.chats)}
                </span>
                <span role="cell" className="px-3 py-2.5 text-right text-sm tabular-nums">
                  {pct(t.share)}
                </span>
                <span
                  role="cell"
                  aria-label={a.label}
                  title={a.label}
                  className="px-3 py-2.5 text-right text-sm"
                >
                  {a.sign}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <p className={NOTE}>
        The range&rsquo;s new chats opened in the person&rsquo;s own words (a starter chip is in the
        table above), by the topic Mira gave the first message; only the topic is kept, never the
        words. The quotes are the design&rsquo;s paraphrased examples, not anyone&rsquo;s message.
        The trend compares each share with the period before, when the page compares; weight and
        shape topics route through Mira&rsquo;s safety rules.{" "}
        {data.untopical
          ? `${count(data.untopical)} own-words ${data.untopical === 1 ? "chat has" : "chats have"} no topic: a crisis first message, a reply without one, or a chat from before 20 Nov 2026.`
          : null}
      </p>
    </Card>
  );
}

function Therapeutic({ data }: { data: Data }) {
  const b = data.bodyCheck;
  const rows: Array<[string, number, string]> = [
    ["Improved", b.improved, `Up ${fmt("count", b.reliableChange, 1)} points or more`],
    ["No clear change", b.pairs - b.improved - b.worse, "Within the scale’s noise"],
    [
      "Worse",
      b.worse,
      `Down ${fmt("count", b.reliableChange, 1)} points or more, reviewed monthly`,
    ],
  ];
  return (
    <Card id="therapeutic" labelledBy="h-therapeutic">
      <SectionHead
        id="h-therapeutic"
        level={3}
        title="Therapeutic success"
        description="Body image after 4 weeks with Mira, compared with each user’s own baseline."
        right={
          <span className="font-serif text-[24px] font-semibold tabular-nums">
            {b.change === null
              ? EMPTY
              : `${b.change >= 0 ? "+" : "−"}${fmt("count", Math.abs(b.change), 2)} avg.`}
          </span>
        }
      />
      <div className="flex max-w-[860px] flex-col gap-3">
        {rows.map(([label, k, note]) => (
          <div
            key={label}
            className="grid items-center gap-3"
            style={{ gridTemplateColumns: "minmax(150px,220px) minmax(0,1fr) 110px" }}
          >
            <span className="flex flex-col">
              <span className="text-sm font-semibold">{label}</span>
              <span className="text-xs leading-snug text-ap-muted">{note}</span>
            </span>
            <Bar pct={share(k, b.pairs)} />
            <span className="text-right text-sm font-bold tabular-nums">
              {pct(share(k, b.pairs))} ({count(k)})
            </span>
          </div>
        ))}
      </div>
      <p className={NOTE}>
        The body check is the Body Appreciation Scale-2 (Tylka &amp; Wood-Barcalow, 2015): ten
        statements, scored 1 to 5, offered in the chat to signed-up users, only if they start it.
        Counted here: the four-week checks finished in the range ({count(b.pairs)}), each against
        the person&rsquo;s first. A change of {fmt("count", b.reliableChange, 1)} points or more is
        beyond the scale&rsquo;s noise (the reliable change index from its published SD and
        test&ndash;retest reliability). Without a control group this shows change, not cause. In the
        range: offered to {count(b.offered)}, started by {count(b.started)}; first checks{" "}
        {count(b.baselines)}, four-week checks {count(b.followUps)}.
      </p>
    </Card>
  );
}

function Satisfaction({ data }: { data: Data }) {
  const { answers, notNow, promoters, detractors, score } = data.nps;
  const rows: Array<[string, number]> = [
    ["Promoters (9–10)", promoters],
    ["Passives (7–8)", answers - promoters - detractors],
    ["Detractors (0–6)", detractors],
  ];
  return (
    <Card id="satisfaction" labelledBy="h-satisfaction">
      <SectionHead
        id="h-satisfaction"
        level={3}
        title="Satisfaction"
        description="Net Promoter Score, asked after the 3rd conversation and then monthly."
        right={
          <span className="font-serif text-[24px] font-semibold tabular-nums">
            NPS {fmt("count", score)}
          </span>
        }
      />
      <div className="flex max-w-[860px] flex-col gap-3">
        {rows.map(([label, k]) => (
          <div
            key={label}
            className="grid items-center gap-3"
            style={{ gridTemplateColumns: "minmax(150px,220px) minmax(0,1fr) 110px" }}
          >
            <span className="text-sm font-semibold">{label}</span>
            <Bar pct={share(k, answers)} />
            <span className="text-right text-sm font-bold tabular-nums">
              {pct(share(k, answers))} ({count(k)})
            </span>
          </div>
        ))}
      </div>
      <p className={NOTE}>
        From {count(answers)} scores in the range: the share of promoters minus the share of
        detractors, from &minus;100 to +100. &ldquo;Not now&rdquo; gives no score: it was{" "}
        {pct(share(notNow, answers + notNow))} of the {count(answers + notNow)} replies.
      </p>
    </Card>
  );
}

function Knows({ data }: { data: Data }) {
  const { accounts, style, result, rootCause, baseline, goals } = data.knows;
  const rows: Array<[string, number | null, string]> = [
    [
      "Root-cause screen",
      rootCause,
      "Answered where it shows up and when it started (Mira’s intake questions)",
    ],
    ["Baseline scales", baseline, "Did the first body check (Body Appreciation Scale-2)"],
    ["Goals", goals, "Said what they would do if it felt easier (the intake’s goal question)"],
    ["Preferences", style, "A coaching style saved"],
    [
      "Other LoveIQ assessments",
      result,
      "“Use my LoveIQ result” on, with a finished LoveIQ survey under the account’s address",
    ],
  ];
  return (
    <Card id="knows" labelledBy="h-knows">
      <SectionHead
        id="h-knows"
        level={3}
        title="How well Mira knows each user"
        description="Profile depth across the 5 key areas from the guiding goals: the share of signed-up users for whom Mira knows each."
      />
      <div className="flex max-w-[860px] flex-col gap-3">
        {rows.map(([area, n, note]) => (
          <div
            key={area}
            className="grid items-center gap-3"
            style={{ gridTemplateColumns: "minmax(150px,220px) minmax(0,1fr) 110px" }}
          >
            <span className="flex flex-col">
              <span className="text-sm font-semibold">{area}</span>
              <span className="text-xs leading-snug text-ap-muted">{note}</span>
            </span>
            {n === null ? (
              <span className="text-[13px] text-ap-muted">Not measured yet</span>
            ) : (
              <Bar pct={share(n, accounts)} />
            )}
            <span className="text-right text-sm font-bold tabular-nums">
              {n === null ? EMPTY : `${pct(share(n, accounts))} (${count(n)})`}
            </span>
          </div>
        ))}
      </div>
      <p className={NOTE}>
        Of today&rsquo;s {count(accounts)} signed-up accounts, whatever the range: an account keeps
        no history of these. An intake answer counts whether it was tapped or typed, signed in or
        before signing up; only which question was answered is kept, never the answer. Profile depth
        is the average share of the five areas Mira knows per account. Users can ask for a copy or
        delete it anytime.
      </p>
    </Card>
  );
}

function NudgeTypes({ data }: { data: Data }) {
  const rate = (a: number, b: number) => (b ? fmt("pct", a / b) : EMPTY);
  const gtc = "minmax(200px,2fr) 80px 100px 90px 120px 150px 120px";
  return (
    <Card id="nudge-types" labelledBy="h-nudge-types">
      <SectionHead
        id="h-nudge-types"
        level={3}
        title="Performance by nudge type"
        description="Which nudges people open, click and turn into a conversation, and which make them unsubscribe."
      />
      <div className="overflow-x-auto rounded-[14px] border border-ap-line">
        <div role="table" aria-label="Performance by nudge type" style={{ minWidth: 880 }}>
          <div role="row" className="grid bg-ap-ground" style={{ gridTemplateColumns: gtc }}>
            {[
              "Nudge type",
              "Sent",
              "Open rate",
              "CTR",
              "Conv. started",
              "Avg. messages / conv.",
              "Unsubscribe",
            ].map((h, i) => (
              <span key={h} role="columnheader" className={`${HEAD} ${i ? "text-right" : ""}`}>
                {h}
              </span>
            ))}
          </div>
          {data.nudgeTypes.map((r) => (
            <div
              key={r.type}
              role="row"
              className="grid items-center border-t border-ap-line"
              style={{ gridTemplateColumns: gtc }}
            >
              <span role="rowheader" className="px-3 py-2.5 text-sm font-bold">
                {r.title}
              </span>
              {[
                count(r.sent),
                rate(r.opened, r.delivered),
                rate(r.clicked, r.sent),
                rate(r.started, r.sent),
                r.started ? fmt("ratio", r.messages / r.started) : EMPTY,
                rate(r.stopped, r.delivered),
              ].map((v, i) => (
                <span key={i} role="cell" className="px-3 py-2.5 text-right text-sm tabular-nums">
                  {v}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      <p className={NOTE}>
        Open rate and unsubscribes are counted per nudge delivered, CTR and conversations started
        per nudge sent. Deliveries and opens come from the email provider; Apple Mail opens every
        email it receives to protect its users&rsquo; privacy, and those opens are included, so the
        open rate reads high. A conversation counts when the person writes to Mira within 24 hours
        of clicking; its messages are theirs from then until a gap of more than 30 minutes. An
        unsubscribe is a stop (from the email, its page or Settings) or a pause, counted against the
        last nudge the person got before it. Minutes per conversation aren&rsquo;t measured yet.
      </p>
    </Card>
  );
}

function Safety({ data }: { data: Data }) {
  const { conversations, crisis, declined, minorStops, notHelpful, referred } = data.safety;
  const per = (k: number) => (conversations ? fmt("count", (k / conversations) * 1000, 1) : EMPTY);
  const rows: Array<[string, number | null, string]> = [
    ["Stopped coaching", crisis, "Crisis or support lines shown, the team reviews each case"],
    ["Declined replies", declined, "Support lines shown instead of a reply"],
    ["Under-18 stops", minorStops, "Coaching stopped for someone under 18"],
    ["Referred on", referred, "Doctor or therapist suggested, coaching continues"],
    ["Handed over", null, "Not measured yet: other coaches start after the beta"],
    ["Answers rated not helpful", notHelpful, "Sampled weekly to improve prompts and sources"],
  ];
  const gtc = "minmax(170px,1.2fr) 90px 130px minmax(220px,2fr)";
  return (
    <Card id="safety" labelledBy="h-safety">
      <SectionHead
        id="h-safety"
        level={3}
        title="Safety and quality"
        description="Not a goal to grow, but checked every week alongside the goals."
      />
      <div className="overflow-x-auto rounded-[14px] border border-ap-line">
        <div role="table" aria-label="Safety and quality" style={{ minWidth: 640 }}>
          <div role="row" className="grid bg-ap-ground" style={{ gridTemplateColumns: gtc }}>
            {["Event", "Count", "Per 1,000 conversations", "What happens"].map((h, i) => (
              <span
                key={h}
                role="columnheader"
                className={`${HEAD} ${i === 1 || i === 2 ? "text-right" : ""}`}
              >
                {h}
              </span>
            ))}
          </div>
          {rows.map(([event, n, what]) => (
            <div
              key={event}
              role="row"
              className="grid items-center border-t border-ap-line"
              style={{ gridTemplateColumns: gtc }}
            >
              <span role="rowheader" className="px-3 py-2.5 text-sm font-bold">
                {event}
              </span>
              <span role="cell" className="px-3 py-2.5 text-right text-sm tabular-nums">
                {n === null ? EMPTY : count(n)}
              </span>
              <span role="cell" className="px-3 py-2.5 text-right text-sm tabular-nums">
                {n === null ? EMPTY : per(n)}
              </span>
              <span role="cell" className="px-3 py-2.5 text-[13px] text-ap-body">
                {what}
              </span>
            </div>
          ))}
        </div>
      </div>
      <p className={NOTE}>
        Stopped coaching: the support lines shown in the range (a crisis message, or a reply that
        raised the stop rail). Declined replies: replies Mira declined, with the support lines shown
        instead; Under-18 stops: coaching stopped because the person is under 18 (both recorded from
        21 Nov 2026). Referred on: Mira&rsquo;s replies that suggested a therapist, doctor or other
        professional, at most one per person and conversation, from 20 Nov 2026. Per 1,000 of the
        range&rsquo;s conversations (3 or more messages with no gap of more than 30 minutes).
      </p>
    </Card>
  );
}
