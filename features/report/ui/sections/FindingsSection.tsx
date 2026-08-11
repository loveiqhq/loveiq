"use client";

import type { FC } from "react";

/**
 * Server-resolved findings copy (`getReport2Section(name, "findings")`), threaded
 * as a prop because the 634KB copy module is server-only (see
 * `app/api/report/route.ts` → `findingsCopy`). Findings 1-2 are always the real
 * head/body. For findings 3-5 the server sends EITHER the real head/body (paid)
 * OR the universal `.locked.` teaser (unpaid) — the real f3-5 text is never
 * shipped to a locked client. `locked` tells the client which it received so it
 * can render the blur/lock treatment + upsell.
 */
export interface FindingsCopy {
  "f1.head"?: string | null;
  "f1.body"?: string | null;
  "f2.head"?: string | null;
  "f2.body"?: string | null;
  "f3.head"?: string | null;
  "f3.body"?: string | null;
  "f4.head"?: string | null;
  "f4.body"?: string | null;
  "f5.head"?: string | null;
  "f5.body"?: string | null;
  "upsell.line"?: string | null;
  /** True when f3-5 carry the locked teaser text (user lacks paid access). */
  locked: boolean;
}

interface Props {
  copy: FindingsCopy | null;
  onUnlock: () => void;
}

const LockIcon: FC = () => (
  <svg viewBox="0 0 24 24" fill="none" className="report-findings__lock-icon" aria-hidden="true">
    <rect
      x="4.5"
      y="10.5"
      width="15"
      height="10"
      rx="2.5"
      stroke="currentColor"
      strokeWidth="1.8"
    />
    <path
      d="M8 10.5V7.5a4 4 0 0 1 8 0v3"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

const FindingRow: FC<{
  index: number;
  head: string | null | undefined;
  body: string | null | undefined;
  locked: boolean;
}> = ({ index, head, body, locked }) => {
  if (!head && !body) return null;
  return (
    <div className={`report-findings__row${locked ? " report-findings__row--locked" : ""}`}>
      <span className="report-findings__num">{String(index).padStart(2, "0")}</span>
      <div className="report-findings__text">
        <div className="report-findings__body-wrap">
          {head ? <h4 className="report-findings__head">{head}</h4> : null}
          {body ? <p className="report-findings__body">{body}</p> : null}
        </div>
        {locked ? (
          <span className="report-findings__lock" aria-hidden="true">
            <LockIcon />
          </span>
        ) : null}
      </div>
    </div>
  );
};

const FindingsSection: FC<Props> = ({ copy, onUnlock }) => {
  if (!copy) return null;

  const locked = copy.locked;
  const rows = [
    { head: copy["f1.head"], body: copy["f1.body"], locked: false },
    { head: copy["f2.head"], body: copy["f2.body"], locked: false },
    { head: copy["f3.head"], body: copy["f3.body"], locked },
    { head: copy["f4.head"], body: copy["f4.body"], locked },
    { head: copy["f5.head"], body: copy["f5.body"], locked },
  ];

  // Nothing to render (archetype without a findings block) — bail.
  if (rows.every((r) => !r.head && !r.body)) return null;

  const upsellLine = copy["upsell.line"] ?? null;

  return (
    <div className="report-findings">
      <h3 className="report-findings__heading">Five things this report found</h3>

      <article className="report-findings__card">
        <div className="report-findings__rows">
          {rows.map((r, i) => (
            <FindingRow key={i} index={i + 1} head={r.head} body={r.body} locked={r.locked} />
          ))}
        </div>

        {locked ? (
          <div className="report-findings__upsell">
            {upsellLine ? <p className="report-findings__upsell-line">{upsellLine}</p> : null}
            {/* Figma locked page 8988:16141 labels this CTA "Unlock the Full
                Report →" — distinct from PremiumOverlay's "Unlock your report"
                (8993:19194), which is a different component in the design. */}
            <button type="button" className="report-findings__unlock" onClick={onUnlock}>
              Unlock the Full Report →
            </button>
          </div>
        ) : null}
      </article>
    </div>
  );
};

export default FindingsSection;
