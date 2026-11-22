"use client";

import { shortDate } from "@features/admin/server/ap/days";
import type { FeedbackItem } from "@features/admin/server/ap/mira-feedback";

import { Card, SectionHead } from "./kit";

const LABEL = "text-xs font-bold uppercase tracking-[0.08em] text-ap-muted";

/**
 * AP › Mira › Outcomes & satisfaction: "Beta feedback" (features/admin/server/ap/mira-feedback.ts,
 * decision 11). /mira/feedback tells people "Every answer is read by our team": this is where the
 * team reads them.
 */
export function ApMiraFeedback({ feedback }: { feedback: FeedbackItem[] | null }) {
  return (
    <Card id="beta-feedback" labelledBy="h-beta-feedback">
      <SectionHead
        id="h-beta-feedback"
        level={3}
        title="Beta feedback"
        description="What people sent from Mira’s feedback page in the range, newest first: the challenges they would like a coach for, and their own words. The page tells them every answer is read by our team."
      />
      {feedback === null ? (
        <p role="alert" className="m-0 text-sm text-ap-bad-ink">
          The feedback could not be read just now. Reload the page to try again.
        </p>
      ) : feedback.length === 0 ? (
        <p className="m-0 text-sm text-ap-body">No feedback in the range.</p>
      ) : (
        <ol className="m-0 flex list-none flex-col divide-y divide-ap-line p-0">
          {feedback.map((f, i) => (
            <li key={i} className="flex flex-col gap-2 py-3.5">
              <span className="text-sm font-bold tabular-nums">{shortDate(f.day)}</span>
              {f.challenges.length ? (
                <p className="m-0 text-sm text-ap-body">
                  <span className={LABEL}>Coach for </span>
                  {f.challenges.join(", ")}
                </p>
              ) : null}
              {f.wish ? (
                <p className="m-0 whitespace-pre-line text-sm text-ap-ink">
                  <span className={LABEL}>Wishes Mira could </span>
                  {f.wish}
                </p>
              ) : null}
              {f.other ? (
                <p className="m-0 whitespace-pre-line text-sm text-ap-ink">
                  <span className={LABEL}>Other ideas </span>
                  {f.other}
                </p>
              ) : null}
              {f.email ? (
                <p className="m-0 text-sm text-ap-body">
                  <span className={LABEL}>May be emailed </span>
                  <a href={`mailto:${f.email}`} className="font-semibold text-ap-link underline">
                    {f.email}
                  </a>
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      <p className="m-0 text-xs leading-relaxed text-ap-muted">
        Every answer sent in the range, the team&rsquo;s left out as above. An address shows only
        where the person ticked &ldquo;You may email me with a follow-up question about my
        feedback&rdquo;. Answers are kept 12 months, and go when the person deletes their account.
      </p>
    </Card>
  );
}
