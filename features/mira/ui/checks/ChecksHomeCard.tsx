"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CHECKS, CHECK_IDS } from "@features/mira/content/checks";
import { SectionLink } from "../kit";
import { CheckIcon, LoveIqTile } from "./icons";
import { bodyLine, checkLine, shortDate, stateOf, useChecks, useDrafts } from "./data";

/**
 * Home's "Your assessments" card (board 08, Mark's Home): the LoveIQ Sexual Personality result,
 * the three self-checks and the body check, each with where the person is (not taken, in progress
 * in this tab, the latest band and date, ready to retake) and one link. Loads its own data; the
 * lead mounts it in MiraHome in place of the Assessments section.
 */
export default function ChecksHomeCard() {
  const { data, error, retry } = useChecks();
  const found = useDrafts(data?.account, CHECK_IDS);
  const body = bodyLine(data?.bodyCheck ?? null);
  return (
    <section
      id="assessments"
      aria-labelledby="your-assessments-h"
      className="scroll-mt-6 rounded-3xl border border-ap-line p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="your-assessments-h" className="font-serif text-[20px] font-semibold">
          Your assessments
        </h2>
        <SectionLink href="/mira/assessments" what="assessments" />
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-[14px] text-ap-bad-ink">
          {error}{" "}
          <button type="button" onClick={retry} className="font-semibold underline">
            Try again
          </button>
        </p>
      ) : null}
      {data ? (
        <ul className="mt-1 flex flex-col divide-y divide-ap-line">
          <Row
            icon={<LoveIqTile />}
            title="Sexual Personality"
            status={
              data.assessment
                ? `${data.assessment.archetype} · ${shortDate(data.assessment.takenAt)}`
                : "Not taken yet · about 9 min"
            }
            href={data.assessment ? data.assessment.reportPath : "/"}
            action={data.assessment ? "View report" : "Take it"}
          />
          {CHECKS.map((check) => {
            const summary = data.checks.find((c) => c.id === check.id)!;
            const line = checkLine(check, stateOf(summary, found[check.id] ?? null));
            return (
              <Row
                key={check.id}
                icon={<CheckIcon id={check.id} />}
                title={check.title}
                status={line.status}
                href={`/mira/assessments/${check.id}`}
                action={line.action}
              />
            );
          })}
          {body ? (
            <Row
              icon={<CheckIcon id="body" />}
              title="Body check"
              status={body.status}
              href={body.action ? "/mira/assessments/body" : null}
              action={body.action}
            />
          ) : null}
        </ul>
      ) : !error ? (
        <div aria-hidden="true" className="mt-3 flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-11 animate-pulse rounded-xl bg-ap-ground motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : null}
      <p className="mt-3 text-[12px] text-ap-muted">
        Results support self-reflection. They are not a diagnosis.
      </p>
    </section>
  );
}

/** One assessment: the whole row is its link (when it has one), at least 60px tall. */
function Row({
  icon,
  title,
  status,
  href,
  action,
}: {
  icon: ReactNode;
  title: string;
  status: string;
  href: string | null;
  action: string | null;
}) {
  const inner = (
    <>
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-ap-ink">{title}</span>
        <span className="block text-[13px] text-ap-muted">{status}</span>
      </span>
      {href && action ? (
        <span className="shrink-0 whitespace-nowrap text-[13px] font-semibold text-ap-purple transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-ap-violet motion-reduce:transition-none">
          {action} <span aria-hidden="true">→</span>
        </span>
      ) : null}
    </>
  );
  return (
    <li>
      {href && action ? (
        <Link
          href={href}
          prefetch={false}
          className="group -mx-2 flex min-h-[60px] items-center gap-3 rounded-2xl px-2 py-2.5 transition-colors hover:bg-ap-lilac/50 motion-reduce:transition-none"
        >
          {inner}
        </Link>
      ) : (
        <div className="flex min-h-[60px] items-center gap-3 py-2.5">{inner}</div>
      )}
    </li>
  );
}
