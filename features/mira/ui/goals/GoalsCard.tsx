"use client";

import Link from "next/link";
import { useState } from "react";
import { localDay, progress } from "../../server/goal-progress";
import { useSignedOut } from "../api";
import { AdultsOnly, SectionLink } from "../kit";
import { LoadFailed, useRetry } from "../kit/load-failed";
import { ASK_MIRA_FOR_A_GOAL } from "./GoalSuggestion";
import { ChallengePills, FOCUS, TickButton, WeekLine, onTheGo } from "./parts";
import { useGoals, type Goal } from "./useGoals";

/** Goals shown on Home; the rest are a tap away on the goals page. */
const ON_HOME = 3;

/**
 * Home's "Challenges & goals" card (board "Home", 21 Nov 2026): the person's challenges, up to
 * three goals on the go with this week and "Did it today", and, before any goal, a first step:
 * ask Mira for one (the chat opens with the question written, not sent) or write one. Loads its
 * own data from /api/mira/goals; signed-in pages only.
 */
export default function GoalsCard() {
  const g = useGoals();
  const again = useRetry(g.load === "loading", g.reload);
  // A lost sign-in, here or anywhere on the page: the one notice, with the way back (HAB-16).
  const out = useSignedOut() || g.load === "signed-out";
  const [popped, setPopped] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = g.goals.filter(onTheGo);
  const today = g.today || localDay(new Date());

  async function toggle(goal: Goal) {
    const t = g.tick(goal);
    if (!t) return;
    setError(null);
    setPopped(t.done ? goal.id : null);
    setError(await t.saved);
  }

  // Home says a lost sign-in once, above its cards (HAB-16): the card goes quiet.
  if (out) return null;

  return (
    <section
      aria-labelledby="goals-card-h"
      aria-busy={g.load === "loading"}
      className="rounded-3xl border border-ap-line p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          id="goals-card-h"
          tabIndex={-1}
          className="font-serif text-[20px] font-semibold outline-none"
        >
          Challenges &amp; goals
        </h2>
        {g.load === "ready" && g.goals.length > 0 ? (
          <SectionLink href="/mira/goals" what="goals" />
        ) : null}
      </div>
      {g.load === "minor" ? null : (
        <div className="mt-3">
          <ChallengePills goals={g.goals} />
        </div>
      )}

      {g.load === "loading" && !again.busy ? (
        <div className="mt-5 flex flex-col gap-4" aria-hidden="true">
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-col gap-2.5">
              <span className="h-4 w-3/4 rounded-full bg-ap-track motion-safe:animate-pulse" />
              <span className="h-3 w-1/3 rounded-full bg-ap-track motion-safe:animate-pulse" />
            </div>
          ))}
          <span className="sr-only">Loading your goals</span>
        </div>
      ) : g.load === "minor" ? (
        <AdultsOnly className="mt-4" />
      ) : g.load === "error" || again.busy ? (
        <LoadFailed what="Your goals" {...again} className="mt-4" />
      ) : active.length > 0 ? (
        <ul className="mt-4 flex flex-col divide-y divide-ap-line">
          {active.slice(0, ON_HOME).map((goal) => {
            const p = progress(
              {
                days: goal.days,
                target: goal.weekly_target,
                since: localDay(new Date(goal.created_at)),
              },
              today
            );
            return (
              <li
                key={goal.id}
                className="flex flex-col gap-3 py-4 first:pt-1 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <div className="flex min-w-0 flex-col gap-2">
                  <p className="text-[15px] font-semibold leading-snug [overflow-wrap:anywhere]">
                    {goal.text}
                  </p>
                  <WeekLine p={p} target={goal.weekly_target} pop={popped === goal.id} />
                </div>
                <TickButton
                  goal={goal}
                  done={p.doneToday}
                  pop={popped === goal.id}
                  busy={g.ticking.has(goal.id)}
                  onToggle={() => void toggle(goal)}
                />
              </li>
            );
          })}
          {active.length > ON_HOME ? (
            <li className="pt-3">
              <Link
                href="/mira/goals"
                className={`inline-flex min-h-[44px] items-center text-[14px] font-semibold text-ap-plum hover:underline ${FOCUS}`}
              >
                {active.length - ON_HOME === 1
                  ? "1 more goal on your goals page"
                  : `${active.length - ON_HOME} more goals on your goals page`}
              </Link>
            </li>
          ) : null}
        </ul>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <p className="max-w-[46ch] text-[14px] leading-relaxed text-ap-body">
            {g.goals.length === 0
              ? "Pick one small, doable step and tick the days you do it. It builds up over the weeks, and Mira can help you find a first one."
              : "No goals on the go right now. Set a new one whenever you're ready."}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link
              href={ASK_MIRA_FOR_A_GOAL}
              className={`inline-flex min-h-[44px] items-center rounded-full bg-ap-ink px-5 text-[14px] font-bold text-white transition-colors hover:bg-ap-ink/90 ${FOCUS}`}
            >
              Ask Mira to help
            </Link>
            <Link
              href="/mira/goals#new"
              className={`inline-flex min-h-[44px] items-center px-1 text-[14px] font-semibold underline underline-offset-4 ${FOCUS}`}
            >
              Write your own
            </Link>
          </div>
        </div>
      )}
      {error ? (
        <p role="alert" className="mt-3 text-[13px] text-ap-bad-ink">
          {error}
        </p>
      ) : null}
    </section>
  );
}
