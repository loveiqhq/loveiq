"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { CHECKS, CHECK_IDS, type Check } from "@features/mira/content/checks";
import { MiraAppFrame } from "../MiraAppFrame";
import { AdultsOnly } from "../kit";
import { miraApi } from "../api";
import { SignInAgain } from "../account/SignedOut";
import { SwitchRow, UseChecksSwitch } from "./ChecksSettings";
import { CheckIcon, LoveIqTile } from "./icons";
import {
  FRAME_TAB,
  bandText,
  bodyLine,
  checkLine,
  shortDate,
  sinceLastTime,
  stateOf,
  useChecks,
  useDrafts,
  type CheckResult,
  type CheckState,
} from "./data";

/**
 * /mira/assessments (board 08b, taken further): the self-checks as cards with where the person
 * is and a small trend, the body check and the LoveIQ result, and the two "What Mira may use"
 * switches. The Assessments tab should point here (today: /mira/home#assessments).
 */
export default function AssessmentsPage() {
  const { data, error, minor, setData, retry } = useChecks();
  const found = useDrafts(data?.account, CHECK_IDS);
  const [useError, setUseError] = useState<string | null>(null);
  const [useBusy, setUseBusy] = useState(false);
  const switchId = useId();
  const body = bodyLine(data?.bodyCheck ?? null);

  async function toggleAssessment(on: boolean) {
    setUseError(null);
    setUseBusy(true);
    setData((d) => d && { ...d, useAssessment: on });
    const r = await miraApi("/api/mira/me", { method: "PATCH", body: { use_assessment: on } });
    setUseBusy(false);
    if (!r.ok) {
      setData((d) => d && { ...d, useAssessment: !on });
      setUseError(r.data.error ?? "Unable to save. Please try again.");
    }
  }

  return (
    <MiraAppFrame active={FRAME_TAB} email={data?.email} name={data?.name}>
      <header className="max-w-[640px] motion-safe:animate-mira-in">
        <h1 className="font-serif text-[34px] font-medium leading-tight sm:text-[40px]">
          Assessments
        </h1>
        <p className="mt-2 text-[16px] leading-relaxed text-ap-body">
          Short questionnaires that help you understand yourself, and help Mira tailor her coaching
          if you allow it.
        </p>
      </header>
      {minor ? (
        <AdultsOnly className="mt-6" />
      ) : error ? (
        <p role="alert" className="mt-6 text-[15px] text-ap-bad-ink">
          {error}{" "}
          <button type="button" onClick={retry} className="font-semibold underline">
            Try again
          </button>
        </p>
      ) : null}

      <section aria-labelledby="self-checks-h" className="mt-9">
        <h2 id="self-checks-h" className="font-serif text-[24px] font-medium">
          Self-checks
        </h2>
        <p className="mt-1 max-w-[640px] text-[15px] text-ap-body">
          A few minutes each, about how you&rsquo;ve been lately. Take them again every few weeks to
          see what changes.
        </p>
        <ul className="mt-4 grid gap-4 md:grid-cols-3">
          {CHECKS.map((check) => {
            const summary = data?.checks.find((c) => c.id === check.id);
            return (
              <li key={check.id}>
                {summary ? (
                  <CheckCard
                    check={check}
                    results={summary.results}
                    state={stateOf(summary, found[check.id] ?? null)}
                  />
                ) : error ? null : (
                  <div
                    aria-hidden="true"
                    className="h-[212px] animate-pulse rounded-3xl bg-ap-ground motion-reduce:animate-none"
                  />
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {data ? (
        <section aria-label="More assessments" className="mt-9 grid gap-4 md:grid-cols-2">
          {body ? (
            <div className="flex flex-col gap-3 rounded-3xl border border-ap-line p-5">
              <div className="flex items-center gap-3">
                <CheckIcon id="body" />
                <div>
                  <h2 className="font-serif text-[20px] font-semibold">Body check</h2>
                  <p className="text-[13px] text-ap-muted">
                    Body Appreciation Scale-2 · 10 statements
                  </p>
                </div>
              </div>
              <p className="text-[14px] text-ap-body">
                How you relate to your body, at the start and again four weeks later, to see whether
                things shift. It shows no score.
              </p>
              <p className="text-[14px] font-semibold">{body.status}</p>
              {body.action ? (
                <Link
                  href="/mira/assessments/body"
                  className="mt-auto inline-flex min-h-[44px] w-fit items-center rounded-full bg-ap-ink px-5 text-[14px] font-bold text-white"
                >
                  {body.action}
                </Link>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-col gap-3 rounded-3xl border border-ap-line p-5">
            <div className="flex items-center gap-3">
              <LoveIqTile />
              <div>
                <h2 className="font-serif text-[20px] font-semibold">Sexual Personality</h2>
                <p className="text-[13px] text-ap-muted">LoveIQ · about 9 min</p>
              </div>
            </div>
            {data.assessment ? (
              <>
                <p className="text-[14px] text-ap-body">
                  Your result: <strong className="text-ap-ink">{data.assessment.archetype}</strong>{" "}
                  · taken {shortDate(data.assessment.takenAt)}
                </p>
                {data.assessment.reportPath ? (
                  <a
                    href={data.assessment.reportPath}
                    className="mt-auto inline-flex min-h-[44px] w-fit items-center rounded-full border border-ap-line px-5 text-[14px] font-semibold"
                  >
                    View report
                  </a>
                ) : null}
              </>
            ) : (
              <>
                <p className="text-[14px] text-ap-body">
                  Find out what shapes how you experience desire and closeness. Use the same email
                  as your account and your result shows up here.
                </p>
                <Link
                  href="/"
                  className="mt-auto inline-flex min-h-[44px] w-fit items-center rounded-full bg-ap-ink px-5 text-[14px] font-bold text-white"
                >
                  Take the assessment
                </Link>
              </>
            )}
          </div>
        </section>
      ) : null}

      {data ? (
        <section aria-labelledby="mira-use-h" className="mt-9 flex max-w-[640px] flex-col gap-3">
          <h2 id="mira-use-h" className="font-serif text-[24px] font-medium">
            What Mira may use
          </h2>
          <UseChecksSwitch
            on={data.useChecks}
            onChange={(on) => setData((d) => d && { ...d, useChecks: on })}
          />
          <SwitchRow
            id={switchId}
            label="Mira may use my LoveIQ result"
            description="Your LoveIQ Sexual Personality result tailors the coaching."
            checked={data.useAssessment}
            busy={useBusy}
            onChange={(on) => void toggleAssessment(on)}
          />
          {useError ? (
            <p role="alert" className="text-[13px] text-ap-bad-ink">
              {useError}
              <SignInAgain error={useError} />
            </p>
          ) : null}
        </section>
      ) : null}

      <p className="mt-10 max-w-[640px] text-[12px] leading-relaxed text-ap-muted">
        Results support self-reflection. They are not a diagnosis. You can delete them in Settings.
      </p>
    </MiraAppFrame>
  );
}

function CheckCard({
  check,
  results,
  state,
}: {
  check: Check;
  results: CheckResult[];
  state: CheckState;
}) {
  const line = checkLine(check, state);
  const last = results.at(-1);
  const before = results.length > 1 ? results.at(-2) : undefined;
  const primary = state.kind === "new" || state.kind === "due" || state.kind === "draft";
  return (
    <article className="flex h-full flex-col gap-3 rounded-3xl border border-ap-line p-5 transition-shadow duration-300 hover:shadow-[0_22px_54px_-20px_rgba(103,60,120,0.3)] motion-reduce:transition-none">
      <div className="flex items-center gap-3">
        <CheckIcon id={check.id} />
        <div className="min-w-0">
          <h3 className="font-serif text-[20px] font-semibold leading-tight">{check.title}</h3>
          <p className="text-[13px] text-ap-muted">
            {check.name} · {check.items.length} questions · {check.minutes} min
          </p>
        </div>
      </div>
      {last ? (
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[18px] font-bold leading-tight">{bandText(check, last)}</p>
            <p className="text-[13px] text-ap-muted">
              {shortDate(last.at)}
              {before ? ` · ${sinceLastTime(before.score, last.score)}` : ""}
            </p>
          </div>
          {results.length > 1 ? <Spark check={check} results={results} /> : null}
        </div>
      ) : (
        <p className="text-[14px] text-ap-body">{check.about}</p>
      )}
      {state.kind === "new" ? null : (
        <p className="text-[13px] text-ap-muted">
          {state.kind === "taken"
            ? `Opens again on ${shortDate(state.nextAt)}`
            : state.kind === "due"
              ? "Ready to retake"
              : `In progress: question ${Math.min(state.answered + 1, check.items.length)} of ${check.items.length}`}
        </p>
      )}
      <Link
        href={`/mira/assessments/${check.id}`}
        aria-label={`${line.action}: ${check.title}`}
        className={`mt-auto inline-flex min-h-[44px] w-fit items-center rounded-full px-5 text-[14px] font-bold ${primary ? "bg-ap-ink text-white" : "border border-ap-line text-ap-ink"}`}
      >
        {line.action}
      </Link>
    </article>
  );
}

/** A check's results as a tiny line (lower is better on all three, so the line drops as things ease). */
function Spark({ check, results }: { check: Check; results: CheckResult[] }) {
  const low = check.bands[0]!.min;
  const w = 88;
  const h = 32;
  const pts = results.slice(-8).map((r, i, all) => {
    const x = all.length > 1 ? (i / (all.length - 1)) * (w - 8) + 4 : w / 2;
    const y = 4 + (1 - (r.score - low) / (check.max - low)) * (h - 8);
    return [x, y] as const;
  });
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="shrink-0">
      <polyline
        points={pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}
        fill="none"
        className="stroke-ap-lavender"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={pts.at(-1)![0]} cy={pts.at(-1)![1]} r={3.5} className="fill-ap-ink" />
    </svg>
  );
}
