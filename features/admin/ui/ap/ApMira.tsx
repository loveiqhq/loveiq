"use client";

import type { ReactNode } from "react";

import { shortDate } from "@features/admin/server/ap/days";
import { EMPTY, fmt } from "@features/admin/server/ap/format";
import type { CohortRow, MiraPayload } from "@features/admin/server/ap/mira";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";

import ApFilterBar from "./ApFilterBar";
import { bucketTitles } from "./hover";
import {
  Bar,
  Busy,
  Card,
  Failed,
  KpiTileV2,
  Loading,
  NotTracked,
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
            description="How the daily nudges perform by type: opens, clicks, conversations they start, how deep those conversations go, and unsubscribes."
          >
            <NotMeasured
              id="nudge-figures"
              title="Nudges sent, opened, clicked and unsubscribed"
              description="Sent, open rate, CTR, conversations started, messages and minutes per conversation, unsubscribes, by nudge type."
              why="The daily nudge emails aren’t built yet: this section fills in once they send."
            />
          </Board>
          <p className={NOTE}>
            The team is left out: accounts with a team address (ADMIN_TEST_EMAIL_REGEX, @loveiq.org
            by default) and the browsers they signed in from. An anonymous browser that never signed
            in, and a deleted account (its events lose both links), can&rsquo;t be told apart, so
            they are counted.
          </p>
        </Busy>
      )}
    </>
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
            digits={t.unit === "ratio" ? 2 : undefined}
          />
        );
      })}
    </TileGrid>
  );
}

function NotMeasured({
  id,
  title,
  description,
  why,
}: {
  id: string;
  title: string;
  description: string;
  why: string;
}) {
  return (
    <Card id={id} labelledBy={`h-${id}`}>
      <SectionHead
        id={`h-${id}`}
        level={3}
        title={title}
        description={description}
        right={<NotTracked>Not measured yet</NotTracked>}
      />
      <p className={NOTE}>{why}</p>
    </Card>
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
        Conversations: chats started in the range (a new chat&rsquo;s first message), signed in or
        not. Pass 10 conversations and the CVR are of the people who started a conversation in the
        range: the share with 10 or more conversations since the beta began, and the share with a
        free account by the range&rsquo;s last day. Signed-up users: free accounts created in the
        range; a deleted account drops out.
      </p>
      <Scorecard data={data} />
      <Funnel data={data} />
    </Board>
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
      <p className={NOTE}>
        People: an account, or a browser before it signs in (one that signs in counts as its
        account). Each step counts the people who also passed every step above it in the range. A
        real conversation is a chat started in the range with 3 or more messages from the person:
        messages carry no chat id, so each counts in the chat its person started last. Subscribed:
        paid plans start after the beta.
      </p>
    </Card>
  );
}

function Engagement({ data }: { data: Data }) {
  const week4 = data.tiles.weekFour!;
  return (
    <Board
      id="engagement"
      title="Engagement & retention"
      description="Whether people build a habit with Mira and keep coming back: active users, the 10-conversation mark and sign-up cohorts."
    >
      <Tiles data={data} keys={["dau", "wau", "stickiness", "timeSpent", "passTen"]} />
      <p className={NOTE}>
        DAU % and WAU %: each day, the share of the accounts open by then that sent a message that
        day, or in the 7 days to it, averaged over the range&rsquo;s days. Stickiness: DAU % ÷ WAU
        %. Each tile&rsquo;s line is its figure per point of the range (hover a line to read it).
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
        note="Average conversations per user so far (every conversation since the beta began, anonymous ones before signing up too), by the end of each week. Weeks run Monday to Sunday, Berlin time; a week shows once it is over."
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
              value: null,
              note: "Not measured yet: the nudge emails aren’t built yet.",
            }}
          />
        </div>
        <p className={NOTE}>
          Week-4 return rate: of the accounts whose sign-up week&rsquo;s week 4 is over by the
          range&rsquo;s last day, the share who sent a message in it.
        </p>
      </Card>
    </Board>
  );
}

function PerUser({ data }: { data: Data }) {
  return (
    <Card id="per-user" labelledBy="h-per-user">
      <SectionHead
        id="h-per-user"
        level={3}
        title="Conversations per user"
        description="How far the people who chatted in the range have got with Mira, since the beta began."
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
      <NotMeasured
        id="starter-chips"
        title="Most used starter chips"
        description="Which suggested prompts people tap to start a chat, and which lead to a real conversation."
        why="A chat doesn’t record whether it began with a starter chip (chat_started holds only whether the person was signed in), and anonymous chats aren’t stored."
      />
      <NotMeasured
        id="prompts"
        title="Most common prompts"
        description="What people bring to Mira in their own words, grouped into topics."
        why="Grouping first messages into topics isn’t built yet."
      />
      <NotMeasured
        id="therapeutic"
        title="Therapeutic success"
        description="Body image after 4 weeks with Mira, compared with each user’s own baseline."
        why="No body-image scale is asked in the chat yet (the design asks one at week 0 and week 4, with consent)."
      />
      <NotMeasured
        id="satisfaction"
        title="Satisfaction"
        description="Net Promoter Score, asked after the 3rd conversation and then monthly."
        why="No screen asks the NPS question yet."
      />
      <Knows data={data} />
      <Safety data={data} />
    </Board>
  );
}

function Knows({ data }: { data: Data }) {
  const { accounts, style, result } = data.knows;
  const rows: Array<[string, number | null, string]> = [
    ["Root-cause screen", null, "No screen asks it yet"],
    ["Baseline scales", null, "No screen asks them yet"],
    ["Goals", null, "No screen asks them yet"],
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
        no history of these. Users can export or delete this data anytime.
      </p>
    </Card>
  );
}

function Safety({ data }: { data: Data }) {
  const { conversations, crisis, notHelpful } = data.safety;
  const per = (k: number) => (conversations ? fmt("count", (k / conversations) * 1000, 1) : EMPTY);
  const rows: Array<[string, number | null, string]> = [
    ["Stopped coaching", crisis, "Crisis or support lines shown, the team reviews each case"],
    [
      "Referred on",
      null,
      "Not measured yet: replies don’t record a doctor or therapist suggestion",
    ],
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
        raised the stop rail). Per 1,000 of the range&rsquo;s conversations.
      </p>
    </Card>
  );
}
