"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  GOAL_TEXT_MAX,
  MAX_ACTIVE_GOALS,
  localDay,
  progress,
  type Day,
} from "../../server/goal-progress";
import { MiraAppFrame } from "../MiraAppFrame";
import { PrimaryButton } from "../MiraShell";
import { ASK_MIRA_FOR_A_GOAL } from "./GoalSuggestion";
import {
  ChallengePills,
  FOCUS,
  MinusIcon,
  PlusIcon,
  SparkIcon,
  TickButton,
  WeekBars,
  WeekLine,
  aimLabel,
  onTheGo,
} from "./parts";
import { useGoals, type Goal } from "./useGoals";

/**
 * /mira/goals, Challenges & goals: the person's notebook of small goals. The goals on the go,
 * each with this week, "Did it today", the last 8 weeks and weeks in a row; a new goal (or Mira's
 * help with one); and what is done or put away, a tap from coming back. A missed week is never
 * named: the bars show it quietly and the total only grows. Signed-in only (the page redirects).
 */

type Actions = ReturnType<typeof useGoals>;

const QUIET = `inline-flex min-h-[44px] items-center rounded-full px-3 text-[14px] font-semibold transition-colors hover:bg-ap-ground ${FOCUS}`;
const TEXT_BUTTON = `${QUIET} text-ap-body hover:text-ap-ink`;
const DANGER_BUTTON = `${QUIET} text-ap-bad-ink`;
const H2 = "font-serif text-[22px] font-medium";

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export default function GoalsPage() {
  const g = useGoals();
  const [said, setSaid] = useState<string | null>(null);
  const [popped, setPopped] = useState<string | null>(null);
  const today = g.today || localDay(new Date());
  const active = g.goals.filter(onTheGo);
  const done = g.goals.filter((x) => x.completed_at);
  const away = g.goals.filter((x) => x.archived_at && !x.completed_at);

  // "Write your own" on Home's card lands on the form.
  useEffect(() => {
    if (g.load === "ready" && window.location.hash === "#new") {
      document.getElementById("new-goal-text")?.focus();
    }
  }, [g.load]);

  return (
    <MiraAppFrame active="goals">
      {/* "feedback" marks no tab: MiraAppFrame has no Goals tab yet and isn't edited on this
          branch; the lead adds one when the nav is composed. */}
      <div className="max-w-[720px]">
        <h1 className="font-serif text-[34px] font-medium leading-tight">Challenges &amp; goals</h1>
        <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-ap-body">
          Small, doable steps in your own words. Tick the days you do one, and watch it build over
          the weeks. Mira can check in on them in the chat.
        </p>
        <div className="mt-4">
          <ChallengePills goals={g.goals} />
        </div>

        <p role="status" className="sr-only">
          {said}
        </p>

        {g.load === "loading" ? (
          <div aria-hidden="true" className="mt-8 flex flex-col gap-3">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-[132px] rounded-3xl bg-ap-ground motion-safe:animate-pulse"
              />
            ))}
          </div>
        ) : g.load !== "ready" ? (
          <div className="mt-8 rounded-3xl border border-ap-line p-5">
            <p role="alert" className="text-[15px] text-ap-body">
              {g.load === "signed-out" ? "Please sign in to see your goals." : g.loadError}
            </p>
            <div className="mt-3">
              {g.load === "signed-out" ? (
                <Link href="/mira/start" className={`text-[14px] font-semibold underline ${FOCUS}`}>
                  Sign in
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={g.reload}
                  className={`${TEXT_BUTTON} border border-ap-line`}
                >
                  Try again
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <section aria-labelledby="on-the-go-h" className="mt-9">
              <h2 id="on-the-go-h" className={H2}>
                On the go
              </h2>
              {active.length === 0 ? (
                <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-ap-body">
                  {g.goals.length === 0
                    ? "Nothing here yet. Start with one small step you could take this week: something you can do in a few minutes, and would like to feel easier."
                    : "No goals on the go right now. Bring one back below, or set a new one."}
                </p>
              ) : (
                <ul className="mt-3 flex flex-col divide-y divide-ap-line rounded-3xl border border-ap-line px-5">
                  {active.map((goal) => (
                    <GoalEntry
                      key={goal.id}
                      goal={goal}
                      today={today}
                      g={g}
                      pop={popped === goal.id}
                      onTicked={(on) => setPopped(on ? goal.id : null)}
                      say={setSaid}
                    />
                  ))}
                </ul>
              )}
            </section>

            <section id="new" aria-labelledby="new-goal-h" className="mt-9 scroll-mt-6">
              <h2 id="new-goal-h" className={H2}>
                A new goal
              </h2>
              {active.length >= MAX_ACTIVE_GOALS ? (
                <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-ap-body">
                  {MAX_ACTIVE_GOALS} goals on the go is plenty. Mark one done or put one away, and
                  there is room for a new one.
                </p>
              ) : (
                <div className="mt-3 flex flex-col gap-4">
                  <GoalForm
                    inputId="new-goal-text"
                    submitLabel="Add goal"
                    onSubmit={async (text, target) => {
                      const err = await g.create(text, target);
                      if (!err) setSaid("Goal added.");
                      return err;
                    }}
                  />
                  <p className="text-[14px] text-ap-body">
                    Not sure what to try?{" "}
                    <Link
                      href={ASK_MIRA_FOR_A_GOAL}
                      className={`font-semibold text-ap-plum underline underline-offset-4 ${FOCUS}`}
                    >
                      Ask Mira to help you find one
                    </Link>
                  </p>
                </div>
              )}
            </section>

            {done.length > 0 ? (
              <PastGoals
                id="done"
                title="Done"
                goals={done}
                note={(x) =>
                  `Done ${longDate(x.completed_at!)} · ${x.days.length === 1 ? "1 day" : `${x.days.length} days`} ticked`
                }
                g={g}
                say={setSaid}
              />
            ) : null}
            {away.length > 0 ? (
              <PastGoals
                id="away"
                title="Put away"
                goals={away}
                note={(x) => `Put away ${longDate(x.archived_at!)}`}
                g={g}
                say={setSaid}
              />
            ) : null}

            <AboutYourGoals g={g} say={setSaid} />
          </>
        )}
      </div>
    </MiraAppFrame>
  );
}

/** One goal on the go: this week, "Did it today", its weeks, and what can be done with it. */
function GoalEntry({
  goal,
  today,
  g,
  pop,
  onTicked,
  say,
}: {
  goal: Goal;
  today: Day;
  g: Actions;
  pop: boolean;
  onTicked: (on: boolean) => void;
  say: (s: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editRef = useRef<HTMLButtonElement | null>(null);
  const p = progress(
    { days: goal.days, target: goal.weekly_target, since: localDay(new Date(goal.created_at)) },
    today
  );
  const headingId = useId();

  async function act(run: () => Promise<string | null>, done: string) {
    setError(null);
    const err = await run();
    if (err) setError(err);
    else say(done);
  }

  if (editing) {
    return (
      <li className="py-5">
        <GoalForm
          initial={{ text: goal.text, target: goal.weekly_target }}
          submitLabel="Save"
          onCancel={() => {
            setEditing(false);
            requestAnimationFrame(() => editRef.current?.focus());
          }}
          onSubmit={async (text, target) => {
            const err = await g.update(goal, { text, weeklyTarget: target });
            if (!err) {
              setEditing(false);
              say("Saved.");
              requestAnimationFrame(() => editRef.current?.focus());
            }
            return err;
          }}
        >
          <DeleteGoal goal={goal} g={g} say={say} />
        </GoalForm>
      </li>
    );
  }

  return (
    <li
      aria-labelledby={headingId}
      className="grid grid-cols-1 gap-y-4 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-6"
    >
      <div className="contents">
        <div className="flex min-w-0 flex-col gap-1 sm:col-start-1">
          <h3
            id={headingId}
            className="font-serif text-[19px] font-medium leading-snug [overflow-wrap:anywhere]"
          >
            {goal.text}
          </h3>
          <p className="text-[13px] text-ap-muted">
            {aimLabel(goal.weekly_target)}
            {goal.via === "mira" ? " · from a chat with Mira" : ""}
          </p>
        </div>
        <div className="sm:col-start-1">
          <WeekLine p={p} target={goal.weekly_target} pop={pop} aimShown />
        </div>
        <TickButton
          goal={goal}
          done={p.doneToday}
          pop={pop}
          busy={g.ticking.has(goal.id)}
          onToggle={() => {
            const t = g.tick(goal);
            if (!t) return;
            onTicked(t.done);
            void act(() => t.saved, t.done ? "Ticked for today." : "Tick taken back.");
          }}
        />
      </div>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2 sm:col-start-1">
        <WeekBars p={p} target={goal.weekly_target} today={today} />
        <p className="flex flex-col text-[13px] leading-snug">
          {p.streak >= 2 ? (
            <span className="inline-flex items-center gap-1 font-semibold text-ap-plum">
              <SparkIcon />
              {p.streak} weeks in a row
            </span>
          ) : null}
          <span className="text-ap-muted">
            {p.total === 0
              ? "No days ticked yet"
              : `${p.total === 1 ? "1 day" : `${p.total} days`} so far`}
          </span>
        </p>
      </div>
      <div className="-ml-3 flex flex-wrap items-center sm:col-start-1">
        <button
          ref={editRef}
          type="button"
          aria-label={`Edit: ${goal.text}`}
          className={TEXT_BUTTON}
          onClick={() => setEditing(true)}
        >
          Edit
        </button>
        <button
          type="button"
          aria-label={`Mark done: ${goal.text}`}
          className={TEXT_BUTTON}
          onClick={() =>
            void act(() => g.update(goal, { completed: true }), "Marked done. Well done.")
          }
        >
          Mark done
        </button>
        <button
          type="button"
          aria-label={`Put away: ${goal.text}`}
          className={TEXT_BUTTON}
          onClick={() => void act(() => g.update(goal, { archived: true }), "Put away.")}
        >
          Put away
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-[13px] text-ap-bad-ink sm:col-start-1">
          {error}
        </p>
      ) : null}
    </li>
  );
}

/** The goal's words and how many days a week: a new goal, or one being edited. */
function GoalForm({
  initial,
  inputId,
  submitLabel,
  onSubmit,
  onCancel,
  children,
}: {
  initial?: { text: string; target: number | null };
  inputId?: string;
  submitLabel: string;
  onSubmit: (text: string, target: number | null) => Promise<string | null>;
  onCancel?: () => void;
  children?: ReactNode;
}) {
  const [text, setText] = useState(initial?.text ?? "");
  const [target, setTarget] = useState<number | null>(initial?.target ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ownId = useId();
  const id = inputId ?? `${ownId}-text`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const words = text.replace(/\s+/g, " ").trim();
    if (!words) return setError("Write your goal in a few words.");
    setBusy(true);
    setError(null);
    const err = await onSubmit(words, target);
    setBusy(false);
    if (err) return setError(err);
    if (!initial) {
      setText("");
      setTarget(null);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-5">
      <label htmlFor={id} className="flex flex-col gap-2 text-[14px] font-semibold">
        Your goal, in your own words
        <input
          id={id}
          value={text}
          maxLength={GOAL_TEXT_MAX}
          autoFocus={Boolean(initial)}
          onChange={(e) => setText(e.target.value)}
          placeholder="For example: leave a soft light on"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="min-h-[48px] rounded-2xl border border-ap-line bg-white px-4 text-[16px] font-normal caret-ap-purple outline-none transition-colors placeholder:text-ap-muted focus:border-ap-purple"
        />
      </label>
      <DaysStepper value={target} onChange={setTarget} />
      <div className="flex flex-wrap items-center gap-2">
        <PrimaryButton type="submit" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </PrimaryButton>
        {onCancel ? (
          <button type="button" onClick={onCancel} className={TEXT_BUTTON}>
            Cancel
          </button>
        ) : null}
        {children}
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[13px] text-ap-bad-ink">
          {error}
        </p>
      ) : null}
    </form>
  );
}

/** How many days a week, 1 to 7, or none: a stepper that fits a 320 px phone. */
function DaysStepper({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const id = useId();
  const n = value ?? 0;
  // At an end the button says so (aria-disabled) and ignores the press, keeping keyboard focus.
  const round = `flex h-11 w-11 items-center justify-center rounded-full border border-ap-line bg-white text-ap-ink transition-colors hover:bg-ap-ground aria-disabled:cursor-not-allowed aria-disabled:text-ap-quiet aria-disabled:hover:bg-white ${FOCUS}`;
  return (
    <div role="group" aria-labelledby={`${id}-label`} className="flex flex-col gap-2">
      <span id={`${id}-label`} className="text-[14px] font-semibold">
        How many days a week? <span className="font-normal text-ap-muted">Optional</span>
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Fewer days"
          aria-disabled={n === 0 || undefined}
          onClick={() => n > 0 && onChange(n - 1 || null)}
          className={round}
        >
          <MinusIcon />
        </button>
        <output
          aria-live="polite"
          className="min-w-[124px] text-center text-[15px] font-semibold tabular-nums"
        >
          {aimLabel(value)}
        </output>
        <button
          type="button"
          aria-label="More days"
          aria-disabled={n === 7 || undefined}
          onClick={() => n < 7 && onChange(n + 1)}
          className={round}
        >
          <PlusIcon />
        </button>
      </div>
    </div>
  );
}

/**
 * A deletion behind a question. The question opens on its way out (Keep), which takes focus;
 * Keep puts focus back on the button that asked. `run` answers null, or the message to show.
 */
function Confirm({
  label,
  question,
  action,
  keep,
  className,
  run,
}: {
  label: string;
  question: string;
  action: string;
  keep: string;
  className: string;
  run: () => Promise<string | null>;
}) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const keepRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (asking) keepRef.current?.focus();
  }, [asking]);
  if (!asking) {
    return (
      <button ref={opener} type="button" onClick={() => setAsking(true)} className={className}>
        {label}
      </button>
    );
  }
  return (
    <div className="flex w-full flex-wrap items-center gap-2 rounded-2xl border border-ap-bad p-3 text-[14px]">
      <p className="flex-1 basis-[200px]">{question}</p>
      <button
        type="button"
        onClick={async () => {
          setError(null);
          const err = await run();
          if (err) setError(err);
        }}
        className={`min-h-[44px] rounded-full bg-ap-bad px-5 font-semibold text-white ${FOCUS}`}
      >
        {action}
      </button>
      <button
        ref={keepRef}
        type="button"
        onClick={() => {
          setAsking(false);
          requestAnimationFrame(() => opener.current?.focus());
        }}
        className={TEXT_BUTTON}
      >
        {keep}
      </button>
      {error ? (
        <p role="alert" className="w-full text-[13px] text-ap-bad-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Deleting one goal, with a word of warning first. */
function DeleteGoal({ goal, g, say }: { goal: Goal; g: Actions; say: (s: string) => void }) {
  return (
    <Confirm
      label="Delete goal"
      question="Delete this goal and its ticks? This can't be undone."
      action="Delete"
      keep="Keep it"
      className={`${DANGER_BUTTON} sm:ml-auto`}
      run={async () => {
        const err = await g.remove(goal);
        if (!err) say("Goal deleted.");
        return err;
      }}
    />
  );
}

/** Done or put away: each a tap from coming back on the go (or, put away, from deletion). */
function PastGoals({
  id,
  title,
  goals,
  note,
  g,
  say,
}: {
  id: string;
  title: string;
  goals: Goal[];
  note: (goal: Goal) => string;
  g: Actions;
  say: (s: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  async function back(goal: Goal) {
    setError(null);
    const err = await g.update(
      goal,
      goal.completed_at ? { completed: false } : { archived: false }
    );
    if (err) setError(err);
    else say("Back on the go.");
  }
  return (
    <section aria-labelledby={`${id}-h`} className="mt-9">
      <h2 id={`${id}-h`} className={`${H2} flex items-center gap-2`}>
        {title}
        {id === "done" ? <SparkIcon /> : null}
      </h2>
      <ul className="mt-2 flex flex-col divide-y divide-ap-line">
        {goals.map((goal) => (
          <li
            key={goal.id}
            className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <div className="min-w-0">
              <p className="text-[15px] leading-snug [overflow-wrap:anywhere]">{goal.text}</p>
              <p className="text-[13px] text-ap-muted">{note(goal)}</p>
            </div>
            <div className="-ml-3 flex shrink-0 items-center sm:ml-0">
              <button
                type="button"
                aria-label={`Bring back: ${goal.text}`}
                onClick={() => void back(goal)}
                className={TEXT_BUTTON}
              >
                Bring back
              </button>
              {id === "away" ? <DeleteGoal goal={goal} g={g} say={say} /> : null}
            </div>
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="text-[13px] text-ap-bad-ink">
          {error}
        </p>
      ) : null}
    </section>
  );
}

/** Who sees the goals, and deleting all of them. */
function AboutYourGoals({ g, say }: { g: Actions; say: (s: string) => void }) {
  return (
    <section aria-labelledby="your-goals-data-h" className="mt-12 border-t border-ap-line pt-6">
      <h2 id="your-goals-data-h" className="text-[14px] font-semibold">
        Who sees your goals
      </h2>
      <p className="mt-1 max-w-[62ch] text-[13px] leading-relaxed text-ap-body">
        You do. When you chat, Mira sees the goals on the go and this week&apos;s ticks, so she can
        ask how one is going, now and then. As on the rest of our site, our analytics tools record
        what&apos;s on screen, so they see your goals too. We count how many goals people set and
        tick, never what they say.{" "}
        <Link href="/mira/privacy" className="underline underline-offset-2">
          How Mira handles your data
        </Link>
      </p>
      {g.goals.length > 0 ? (
        <div className="mt-3">
          <Confirm
            label="Delete all goals"
            question="Delete all your goals and their ticks? This can't be undone."
            action="Delete all"
            keep="Keep them"
            className={`${DANGER_BUTTON} -ml-3`}
            run={async () => {
              const err = await g.removeAll();
              if (!err) say("All your goals are deleted.");
              return err;
            }}
          />
        </div>
      ) : null}
    </section>
  );
}
