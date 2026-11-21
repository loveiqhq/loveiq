"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  bandOf,
  changeSince,
  checkById,
  nextTakeAt,
  type Check,
  type CheckId,
} from "@features/mira/content/checks";
import { BodyCheck } from "../BodyCheck";
import { MiraAppFrame } from "../MiraAppFrame";
import { MiraCloud, PrimaryButton } from "../MiraShell";
import { SupportPanel } from "../SupportPanel";
import { miraApi } from "../api";
import { CheckRunner } from "./CheckRunner";
import { UseChecksSwitch } from "./ChecksSettings";
import { TrendChart, trendSummary } from "./TrendChart";
import { FRAME_TAB, drafts, shortDate, useChecks, type CheckResult, type ChecksData } from "./data";

/**
 * /mira/assessments/<check>: a self-check's own page. Before the first check ever, a plain note on
 * what is kept and who sees it; then the questions (CheckRunner); then the result as a person
 * would want to hear it (the band in plain words, what it can mean day to day and for body
 * confidence and intimacy, two or three next steps, the change since last time), and the history
 * with its trend. The mood check's question 9 opens the support lines the moment it is answered
 * above "Not at all", whatever the total.
 */

export type Practice = { number: number; name: string; time: string; bestFor: string };

type Saved = {
  result: CheckResult;
  previous: { at: string; score: number } | null;
  support: boolean;
};

const EYEBROW = "text-[12px] font-semibold uppercase tracking-[0.12em] text-ap-muted";
const PLUM_LINK =
  "inline-flex min-h-[44px] items-center gap-1 font-semibold text-ap-purple underline-offset-4 hover:text-ap-violet hover:underline";

export default function CheckPage({
  checkId,
  practice,
}: {
  checkId: CheckId;
  practice: Practice | null;
}) {
  const check = checkById(checkId)!;
  const { data, error, setData } = useChecks();
  const [mode, setMode] = useState<"intro" | "run" | "result" | null>(null);
  const [draft, setDraft] = useState<number[] | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<{ text: string; retry: boolean } | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [panel, setPanel] = useState<"q9" | "help" | null>(null);
  const supportShown = useRef(false);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const summary = data?.checks.find((c) => c.id === checkId);

  // Once the account is loaded: its draft in this tab, then the result or the introduction.
  useEffect(() => {
    if (!data || mode !== null) return;
    /* eslint-disable react-hooks/set-state-in-effect -- sessionStorage is read after mount */
    setDraft(drafts.read(data.account, checkId));
    setMode(summary?.results.length ? "result" : "intro");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [data, mode, summary, checkId]);

  useEffect(() => {
    if (mode === "result" && saved) headingRef.current?.focus();
  }, [mode, saved]);

  function begin(resume: boolean) {
    if (!data) return;
    if (!resume) {
      drafts.clear(data.account, checkId);
      void miraApi("/api/mira/event", {
        body: { type: "track", name: `${checkId}_check_started` },
      });
    }
    supportShown.current = false;
    setAnswers(resume && draft ? draft : []);
    setSaved(null);
    setSaveError(null);
    setMode("run");
  }

  function answered(next: number[], index: number) {
    if (!data) return;
    drafts.save(data.account, checkId, next);
    setDraft(next);
    // The mood check's question 9: any answer above "Not at all" opens the support lines now.
    const value = next[index]!;
    if (index === check.crisisItem && value > check.options[0]!.value && !supportShown.current) {
      supportShown.current = true;
      setPanel("q9");
      void miraApi("/api/mira/event", { body: { type: "track", name: "check_support_shown" } });
    }
  }

  async function save(all: number[]) {
    if (!data) return;
    setAnswers(all);
    setSaving(true);
    setSaveError(null);
    const r = await miraApi<Saved & { nextAt?: string }>("/api/mira/checks", {
      body: { check: checkId, answers: all },
    });
    setSaving(false);
    if (r.ok) {
      drafts.clear(data.account, checkId);
      setDraft(null);
      setSaved(r.data);
      setData(
        (d) =>
          d && {
            ...d,
            checks: d.checks.map((c) =>
              c.id === checkId
                ? {
                    ...c,
                    results: [...c.results, r.data.result],
                    nextAt: nextTakeAt(check, r.data.result.at).toISOString(),
                  }
                : c
            ),
          }
      );
      setMode("result");
    } else if (r.status === 409 && r.data.nextAt) {
      drafts.clear(data.account, checkId);
      setDraft(null);
      setSaveError({
        text: `You’ve taken this check recently, so it can’t be saved again yet. It opens again on ${shortDate(r.data.nextAt)}.`,
        retry: false,
      });
    } else {
      setSaveError({
        text: r.data.error ?? "Your answers didn’t save. Please try again.",
        retry: true,
      });
    }
  }

  const supportPanel = panel ? (
    <SupportPanel
      highlight={data ? { code: data.support } : null}
      onClose={() => {
        setPanel(null);
        // The result may have arrived behind the panel: land on it, not on the page's top.
        window.requestAnimationFrame(() => headingRef.current?.focus());
      }}
    >
      {panel === "q9" ? <QuestionNineWords /> : null}
    </SupportPanel>
  ) : null;

  return (
    <MiraAppFrame active={FRAME_TAB} email={data?.email} name={data?.name}>
      <nav aria-label="Breadcrumb" className="text-[13px] text-ap-muted">
        <Link href="/mira/assessments" className="underline-offset-4 hover:underline">
          Assessments
        </Link>{" "}
        <span aria-hidden="true">/</span> {check.title}
      </nav>
      {error ? (
        <p role="alert" className="mt-6 text-[15px] text-ap-bad-ink">
          {error}
        </p>
      ) : null}
      {!data && !error ? <Skeleton /> : null}

      {data && mode === "intro" ? (
        <Intro
          check={check}
          firstEver={data.checks.every((c) => c.results.length === 0)}
          draft={draft}
          onStart={begin}
        />
      ) : null}

      {data && mode === "run" ? (
        <div className="mt-6">
          <CheckRunner
            check={check}
            initial={answers}
            saving={saving}
            onAnswer={answered}
            onFinish={(all) => void save(all)}
            onStop={() => setMode(summary?.results.length ? "result" : "intro")}
          />
          {saveError ? (
            <p role="alert" className="mt-4 max-w-[600px] text-[14px] text-ap-bad-ink">
              {saveError.text}{" "}
              {saveError.retry ? (
                <button
                  type="button"
                  onClick={() => void save(answers)}
                  className="font-semibold underline"
                >
                  Try again
                </button>
              ) : (
                <Link href="/mira/assessments" className="font-semibold underline">
                  Back to assessments
                </Link>
              )}
            </p>
          ) : null}
        </div>
      ) : null}

      {data && mode === "result" && summary?.results.length ? (
        <Result
          check={check}
          data={data}
          results={summary.results}
          nextAt={summary.nextAt}
          saved={saved}
          draft={draft}
          practice={practice}
          headingRef={headingRef}
          onStart={begin}
          onHelp={() => setPanel(saved?.support ? "q9" : "help")}
          onUseChecks={(on) => setData((d) => d && { ...d, useChecks: on })}
        />
      ) : null}
      {supportPanel}
    </MiraAppFrame>
  );
}

/** The words for the moment the mood check's question 9 opens the support lines. */
function QuestionNineWords() {
  return (
    <div className="mt-2 rounded-2xl bg-ap-lilac px-4 py-3 text-[15px] leading-relaxed text-ap-ink">
      <p>
        Thank you for answering honestly. You said you&rsquo;ve had thoughts of being better off
        dead or of hurting yourself. That sounds really hard, and you don&rsquo;t have to carry it
        on your own.
      </p>
      <p className="mt-2">
        You can also{" "}
        <Link href="/mira?say=support" className="font-semibold text-[#561dbd] underline">
          talk to Mira now
        </Link>
        .
      </p>
    </div>
  );
}

function Skeleton() {
  return (
    <div aria-hidden="true" className="mt-8 flex max-w-[600px] flex-col gap-4">
      <div className="h-9 w-2/3 animate-pulse rounded-xl bg-ap-ground motion-reduce:animate-none" />
      <div className="h-4 w-full animate-pulse rounded bg-ap-ground motion-reduce:animate-none" />
      <div className="h-4 w-5/6 animate-pulse rounded bg-ap-ground motion-reduce:animate-none" />
    </div>
  );
}

function Intro({
  check,
  firstEver,
  draft,
  onStart,
}: {
  check: Check;
  firstEver: boolean;
  draft: number[] | null;
  onStart: (resume: boolean) => void;
}) {
  const n = check.items.length;
  return (
    <article className="relative mt-6 max-w-[600px] motion-safe:animate-mira-in">
      <p className={EYEBROW}>
        Self-check · {n} questions · about {check.minutes} min
      </p>
      <h1 className="mt-2 font-serif text-[34px] font-medium leading-tight sm:text-[40px]">
        {check.title}
      </h1>
      <p className="mt-3 text-[16px] leading-relaxed text-ap-body">
        {check.about} Answer with whatever comes first; there are no right answers.
      </p>
      {firstEver ? <PrivacyNote /> : null}
      <div className="mt-7 flex flex-wrap items-center gap-3">
        {draft?.length ? (
          <>
            <PrimaryButton onClick={() => onStart(true)}>
              Continue from question {Math.min(draft.length + 1, n)}
            </PrimaryButton>
            <button
              type="button"
              onClick={() => onStart(false)}
              className="inline-flex min-h-[48px] items-center rounded-full border border-ap-line px-5 text-[15px] font-semibold hover:border-ap-ink"
            >
              Start over
            </button>
          </>
        ) : (
          <PrimaryButton onClick={() => onStart(false)}>Start</PrimaryButton>
        )}
      </div>
      <SourceLine check={check} />
    </article>
  );
}

/** Before the first check ever: what is kept, who sees it and how it goes, in plain words. */
function PrivacyNote() {
  const items = [
    "Your answers are health information. We keep them in your account so you can follow how you’re doing over time.",
    "Your results are for you. Mira sees only the band, like “mild”, and only if you allow it. Our own statistics count checks, never answers.",
    "As on the rest of our site, our analytics tools record what’s on screen, so they see your answers here too.",
    "Delete your results whenever you like in Settings, or by deleting your account.",
  ];
  return (
    <section
      aria-labelledby="privacy-note-h"
      className="mt-6 rounded-3xl border border-ap-line bg-ap-ground/60 p-5"
    >
      <h2 id="privacy-note-h" className="text-[15px] font-bold">
        Before your first check
      </h2>
      <ul className="mt-3 flex flex-col gap-2.5 text-[14px] leading-relaxed text-ap-body">
        {items.map((t) => (
          <li key={t} className="flex gap-2.5">
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#795fc8"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mt-[3px] shrink-0"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
            {t}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[13px] text-ap-muted">
        By starting, you agree that we keep your answers this way.{" "}
        <Link href="/mira/privacy#self-checks" className="underline">
          How Mira handles your data
        </Link>
      </p>
    </section>
  );
}

function SourceLine({ check }: { check: Check }) {
  return (
    <p className="mt-8 max-w-[600px] text-[12px] leading-relaxed text-ap-muted">
      Source: {check.source}
      {check.bandNote ? ` ${check.bandNote}` : ""} This check supports self-reflection. It is not a
      diagnosis.
    </p>
  );
}

function Result({
  check,
  data,
  results,
  nextAt,
  saved,
  draft,
  practice,
  headingRef,
  onStart,
  onHelp,
  onUseChecks,
}: {
  check: Check;
  data: ChecksData;
  results: CheckResult[];
  nextAt: string | null;
  saved: Saved | null;
  draft: number[] | null;
  practice: Practice | null;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onStart: (resume: boolean) => void;
  onHelp: () => void;
  onUseChecks: (on: boolean) => void;
}) {
  const last = results.at(-1)!;
  const band = bandOf(check, last.score);
  const before = results.length > 1 ? results.at(-2)! : null;
  const change = before ? changeSince(check, before.score, last.score) : null;
  const help = band.professional || saved?.support;
  const steps: ReactNode[] = [];
  if (help) {
    steps.push(
      <Step key="help" title="Talk to someone who can help" body={check.helpText}>
        <button type="button" onClick={onHelp} className={PLUM_LINK}>
          See support lines <span aria-hidden="true">→</span>
        </button>
      </Step>
    );
  }
  steps.push(
    <Step
      key="mira"
      title="Talk to Mira about this"
      body="She can help you make sense of it for your body and your closeness with others, at your pace."
    >
      <Link href={`/mira?say=${check.id}`} className={PLUM_LINK}>
        Open the chat <span aria-hidden="true">→</span>
      </Link>
    </Step>
  );
  if (practice) {
    steps.push(
      <Step
        key="practice"
        title={`Try a practice: ${practice.name}`}
        body={`${practice.time}. Best for: ${practice.bestFor.toLowerCase()}.`}
      >
        <Link href={`/mira/guide#practice-${practice.number}`} className={PLUM_LINK}>
          Read the practice <span aria-hidden="true">→</span>
        </Link>
      </Step>
    );
  }
  return (
    <article className="mt-6">
      {saved?.support ? (
        <section
          aria-labelledby="q9-h"
          className="mb-6 max-w-[680px] rounded-3xl border border-[#d9c8f6] bg-ap-lilac p-5 motion-safe:animate-mira-in"
        >
          <h2 id="q9-h" className="font-serif text-[22px] font-medium">
            You don&rsquo;t have to carry this alone
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-ap-body">
            You said you&rsquo;ve had thoughts of being better off dead or of hurting yourself. If
            you might act on them or are in danger, call your local emergency number now. You can
            also call or text a support line, or talk it through with Mira.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <PrimaryButton onClick={onHelp}>See support lines</PrimaryButton>
            <Link
              href="/mira?say=support"
              className="inline-flex min-h-[48px] items-center rounded-full border border-ap-ink/20 bg-white px-5 text-[15px] font-semibold"
            >
              Talk to Mira
            </Link>
          </div>
        </section>
      ) : null}

      <header className="relative isolate max-w-[680px] overflow-hidden rounded-[28px] border border-ap-line px-5 pb-6 pt-5 sm:px-7 sm:pt-6">
        {saved ? <MiraCloud className="-z-10 !h-[340px] !w-[560px] opacity-80" /> : null}
        <p className={EYEBROW}>
          {check.title} · {shortDate(last.at)}
        </p>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className={`mt-3 font-serif text-[27px] font-medium leading-snug text-ap-ink outline-none [text-wrap:balance] sm:text-[32px] ${saved ? "motion-safe:animate-mira-in" : ""}`}
        >
          {band.headline}
        </h1>
        <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[14px] text-ap-body">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 font-semibold text-ap-ink ring-1 ring-ap-line">
            {band.label}
          </span>
          <span className="tabular-nums">
            {last.score} of {check.max}
          </span>
          {change && before ? (
            <span>
              {change.diff === 0
                ? `Same score as on ${shortDate(before.at)}`
                : `${Math.abs(change.diff)} ${change.diff < 0 ? "lower" : "higher"} than on ${shortDate(before.at)}`}
              {change.diff !== 0 && change.reliable === true ? " · a real change" : ""}
              {change.diff !== 0 && change.reliable === false
                ? " · within the usual ups and downs"
                : ""}
            </span>
          ) : null}
        </p>
      </header>

      <div className="mt-6 grid max-w-[680px] gap-5 sm:grid-cols-2">
        <section>
          <h2 className={EYEBROW}>In daily life</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-ap-body">{band.daily}</p>
        </section>
        <section>
          <h2 className={EYEBROW}>For body confidence and intimacy</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-ap-body">{band.intimacy}</p>
        </section>
      </div>

      <section aria-labelledby="next-h" className="mt-10 max-w-[680px]">
        <h2 id="next-h" className="font-serif text-[22px] font-medium">
          Next steps
        </h2>
        <ol className="mt-4 flex flex-col gap-3">{steps}</ol>
      </section>

      {!data.useChecks ? (
        <section aria-label="What Mira may use" className="mt-8 max-w-[680px]">
          <UseChecksSwitch on={data.useChecks} onChange={onUseChecks} />
        </section>
      ) : null}

      <History check={check} results={results} />

      <div className="mt-8 flex max-w-[680px] flex-wrap items-center gap-3">
        {nextAt ? (
          <p className="text-[14px] text-ap-body">
            {check.retakeDays === 14 ? "This check looks back over two weeks, so it" : "It"} opens
            again on <strong>{shortDate(nextAt)}</strong>.
          </p>
        ) : draft?.length ? (
          <>
            <PrimaryButton onClick={() => onStart(true)}>
              Continue from question {Math.min(draft.length + 1, check.items.length)}
            </PrimaryButton>
            <button
              type="button"
              onClick={() => onStart(false)}
              className="inline-flex min-h-[48px] items-center rounded-full border border-ap-line px-5 text-[15px] font-semibold hover:border-ap-ink"
            >
              Start over
            </button>
          </>
        ) : (
          <PrimaryButton onClick={() => onStart(false)}>Take it again</PrimaryButton>
        )}
      </div>
      <SourceLine check={check} />
    </article>
  );
}

function Step({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return (
    <li className="rounded-2xl border border-ap-line p-4 transition-colors hover:border-ap-mist">
      <p className="text-[15px] font-bold">{title}</p>
      <p className="mt-1 text-[14px] leading-relaxed text-ap-body">{body}</p>
      <div className="mt-1">{children}</div>
    </li>
  );
}

function History({ check, results }: { check: Check; results: CheckResult[] }) {
  return (
    <section aria-labelledby="history-h" className="mt-10 max-w-[680px]">
      <h2 id="history-h" className="font-serif text-[22px] font-medium">
        Over time
      </h2>
      <p className="mt-2 text-[14px] leading-relaxed text-ap-body">
        {trendSummary(check, results)}
      </p>
      <div className="mt-4 rounded-2xl border border-ap-line p-3">
        <TrendChart check={check} results={results} />
      </div>
      <table className="mt-4 w-full text-left text-[14px]">
        <caption className="sr-only">Your {check.title.toLowerCase()} results</caption>
        <thead className="text-[12px] uppercase tracking-[0.08em] text-ap-muted">
          <tr>
            <th scope="col" className="py-2 font-semibold">
              Date
            </th>
            <th scope="col" className="py-2 font-semibold">
              Band
            </th>
            <th scope="col" className="py-2 text-right font-semibold">
              Score
            </th>
          </tr>
        </thead>
        <tbody>
          {[...results].reverse().map((r) => (
            <tr key={r.at} className="border-t border-ap-line">
              <td className="py-2.5">{shortDate(r.at)}</td>
              <td className="py-2.5">{bandOf(check, r.score).label}</td>
              <td className="py-2.5 text-right tabular-nums">
                {r.score} <span className="text-ap-muted">of {check.max}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/**
 * /mira/assessments/body: the body check (Body Appreciation Scale-2) outside the chat, through
 * the chat's own card (ui/BodyCheck.tsx) and route, so its storage and AP numbers don't change.
 * No score is shown: it measures, it doesn't judge.
 */
export function BodyCheckPage() {
  const router = useRouter();
  const { data, error } = useChecks();
  const body = data?.bodyCheck;
  return (
    <MiraAppFrame active={FRAME_TAB} email={data?.email} name={data?.name}>
      <nav aria-label="Breadcrumb" className="text-[13px] text-ap-muted">
        <Link href="/mira/assessments" className="underline-offset-4 hover:underline">
          Assessments
        </Link>{" "}
        <span aria-hidden="true">/</span> Body check
      </nav>
      <h1 className="mt-6 font-serif text-[34px] font-medium leading-tight sm:text-[40px]">
        Body check
      </h1>
      {error ? (
        <p role="alert" className="mt-4 text-ap-bad-ink">
          {error}
        </p>
      ) : null}
      {data && !body ? (
        <p role="alert" className="mt-4 text-ap-bad-ink">
          Your body checks couldn&rsquo;t be loaded. Please try again.
        </p>
      ) : null}
      <div className="mt-6 max-w-[600px]">
        {body?.due ? (
          <BodyCheck
            due={body.due}
            onStart={() => undefined}
            onClose={() => router.push("/mira/assessments")}
          />
        ) : body ? (
          <p className="text-[16px] leading-relaxed text-ap-body">
            {body.nextAt
              ? `You took your first body check on ${shortDate(body.taken[0]!)}. The second one opens on ${shortDate(body.nextAt)}, four weeks on, to see what has changed.`
              : "You’ve done both body checks. Thank you."}
          </p>
        ) : null}
      </div>
      <p className="mt-8 max-w-[600px] text-[12px] leading-relaxed text-ap-muted">
        Source: Body Appreciation Scale-2 (Tylka and Wood-Barcalow, 2015), free to use. It supports
        self-reflection. It is not a diagnosis.
      </p>
    </MiraAppFrame>
  );
}
