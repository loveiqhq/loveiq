"use client";

import { useState, type FC } from "react";
import PremiumOverlay, { type PremiumOverlayTier } from "./PremiumOverlay";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";

/**
 * Server-resolved libido copy (`getReport2Section(name, "libido")`), threaded as
 * a prop because the 634KB copy module is server-only (see
 * `app/api/report/route.ts` → `libidoCopy`).
 *
 * GATING (Part IV, FULL_REPORT tier — this section is
 * `libido_challenges_in_relationships`, section 28, NOT in
 * ESSENTIALS_SECTION_IDS, so it only unlocks at the full_report tier). The
 * framing slots (`gate.hook`, `eyebrow`, `row1.label`..`row4.label`,
 * `practical.label`, `learn.*`) are UNIVERSAL and always shipped. The
 * per-archetype payload — `result` (the loop name, e.g. "The Waiting Loop"),
 * `row1.value`..`row4.value`, `practical.teaser`, `practical.line1..3` PLUS the
 * loop config (name + steps) — is the gated content: shipped ONLY when unlocked
 * at the full_report tier. A locked client (`locked: true`) receives those
 * null + null loop and renders the hook teaser + PremiumOverlay instead. Never
 * send locked per-archetype content to an unpaid client.
 */
export interface LibidoCopy {
  // Universal (always shipped) — these frame the section for locked clients too.
  "gate.hook"?: string | null;
  eyebrow?: string | null;
  "row1.label"?: string | null;
  "row2.label"?: string | null;
  "row3.label"?: string | null;
  "row4.label"?: string | null;
  "practical.label"?: string | null;
  "learn.eyebrow"?: string | null;
  "learn.body"?: string | null;
  // Per-archetype — withheld (null) from locked clients.
  result?: string | null;
  "row1.value"?: string | null;
  "row2.value"?: string | null;
  "row3.value"?: string | null;
  "row4.value"?: string | null;
  "practical.teaser"?: string | null;
  "practical.line1"?: string | null;
  "practical.line2"?: string | null;
  "practical.line3"?: string | null;
  /** True when the per-archetype result/values/copy/loop were withheld. */
  locked: boolean;
}

/**
 * Loop config from `getReport2Config(name).loop` — `{ name, steps }` (e.g.
 * Spiritual Lover `{ name: "The Waiting Loop", steps: 3 }`). Only sent when
 * unlocked (null otherwise). The named loop renders as a cycle of `steps`
 * connected chips. `loop` is null for the 11 archetypes without one → the
 * component renders WITHOUT the chips rather than fabricating a cycle.
 */
export interface LibidoConfig {
  name: string;
  steps: number;
}

interface Props {
  archetype: string;
  copy: LibidoCopy | null;
  /** Named-loop config (name + steps); null when locked or absent. */
  config: LibidoConfig | null;
  offerDeadline?: number;
  onUnlock: () => void;
  quote?: ReportPriceQuoteSnapshot | null;
  sectionTitle: string;
  tier?: PremiumOverlayTier;
}

const BookIcon: FC = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15.5H5.5A1.5 1.5 0 0 1 4 18V5.5Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15.5h5.5A1.5 1.5 0 0 0 20 18V5.5Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);

/** Lightbulb — the gold "practical" block summary icon (Figma 8762:16071). */
const BulbIcon: FC = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.45 1 1.16 1 1.95V16h5.2v-.25c0-.79.4-1.5 1-1.95A6 6 0 0 0 12 3Z"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * The named loop rendered as a cycle of connected chips (Figma 8427:2593/2594):
 * `steps` numbered white chips stacked vertically, joined by a dashed connector
 * on the left that loops back to the top — the "circular/connected" visual. The
 * chip prose is the reader's own pattern beats (`row1..N.value`, the same
 * per-archetype content shown expanded in the rows below), so the loop is
 * per-archetype and gated — never fabricated. Renders only when `config.loop`
 * exists AND there are step values to show (absent loop ⇒ no chips).
 */
const LoopChips: FC<{ steps: string[] }> = ({ steps }) => (
  <div className="report-libido__loop" role="img" aria-label="The repeating loop, step by step">
    <span className="report-libido__loop-connector" aria-hidden="true" />
    <ol className="report-libido__loop-steps">
      {steps.map((step, i) => (
        <li key={i} className="report-libido__loop-chip">
          <span className="report-libido__loop-num">{i + 1}</span>
          <span className="report-libido__loop-text">{step}</span>
        </li>
      ))}
    </ol>
  </div>
);

const LibidoSection: FC<Props> = ({
  archetype,
  copy,
  config,
  offerDeadline,
  onUnlock,
  quote = null,
  sectionTitle,
  tier = "full_report",
}) => {
  const [expanded, setExpanded] = useState(false);
  if (!copy) return null;

  const locked = copy.locked;

  // The four labelled rows: labels universal, values per-archetype (withheld
  // when locked). A row renders only when it has a value (never a bare label).
  const rows = [
    { label: copy["row1.label"], value: copy["row1.value"] },
    { label: copy["row2.label"], value: copy["row2.value"] },
    { label: copy["row3.label"], value: copy["row3.value"] },
    { label: copy["row4.label"], value: copy["row4.value"] },
  ].filter((r): r is { label: string; value: string } => !!r.label && !!r.value);

  // Loop chips — the named cycle. Use the first `config.steps` row VALUES as the
  // chip beats (the pattern, per-archetype). Only when config present + we have
  // that many values; otherwise no chips (never fabricate a loop).
  const loopSteps =
    config && config.steps > 0
      ? [copy["row1.value"], copy["row2.value"], copy["row3.value"], copy["row4.value"]]
          .filter((v): v is string => !!v)
          .slice(0, config.steps)
      : [];
  const hasLoop = loopSteps.length > 0;

  // Practical ("The Exit") block — per-archetype but the label is universal;
  // teaser/lines withheld (null) for a locked client. Same peek→expand pattern.
  const practicalLines = [
    copy["practical.line1"],
    copy["practical.line2"],
    copy["practical.line3"],
  ].filter((p): p is string => !!p);
  const hasPractical = !!copy["practical.teaser"] || practicalLines.length > 0;

  return (
    <div className="report-libido">
      <h3 className="report-libido__heading">Libido Challenges</h3>

      {copy["learn.body"] ? (
        <div className="report-libido__learn-pill-wrap">
          <span className="report-libido__learn-pill">
            <span className="report-libido__learn-pill-icon" aria-hidden="true">
              <BookIcon />
            </span>
            {copy["learn.eyebrow"] ?? "What you will learn"}
          </span>
          <p className="report-libido__learn-body">{copy["learn.body"]}</p>
        </div>
      ) : null}

      <article className="report-libido__card">
        {locked ? (
          <>
            {copy["gate.hook"] ? <p className="report-libido__hook">{copy["gate.hook"]}</p> : null}
            <div className="report-libido__preview">
              <div className="report-libido__preview-fade" aria-hidden="true">
                {/* Blurred stand-in — the real per-archetype loop/rows/practical
                    are withheld server-side; generic filler under the blur. */}
                <p className="report-libido__pattern-eyebrow">The Pattern</p>
                <p className="report-libido__loop-name">The Waiting Loop</p>
                <div className="report-libido__loop">
                  <span className="report-libido__loop-connector" />
                  <ol className="report-libido__loop-steps">
                    <li className="report-libido__loop-chip">
                      <span className="report-libido__loop-num">1</span>
                      <span className="report-libido__loop-text">
                        Daily life feels ordinary — not sacred, not inviting
                      </span>
                    </li>
                    <li className="report-libido__loop-chip">
                      <span className="report-libido__loop-num">2</span>
                      <span className="report-libido__loop-text">
                        You wait for the right mood — it rarely arrives on its own
                      </span>
                    </li>
                    <li className="report-libido__loop-chip">
                      <span className="report-libido__loop-num">3</span>
                      <span className="report-libido__loop-text">
                        Chances pass, doubt grows — and tomorrow looks like today
                      </span>
                    </li>
                  </ol>
                </div>
              </div>
              <PremiumOverlay
                archetype={archetype}
                sectionTitle={sectionTitle}
                tier={tier}
                quote={quote}
                offerDeadline={offerDeadline}
                onUnlock={onUnlock}
              />
            </div>
          </>
        ) : (
          <>
            <div className="report-libido__pattern-head">
              <p className="report-libido__pattern-eyebrow">{copy.eyebrow ?? "The Pattern"}</p>
              {copy.result ? <p className="report-libido__loop-name">{copy.result}</p> : null}
            </div>

            {hasLoop ? <LoopChips steps={loopSteps} /> : null}

            {rows.length > 0 ? (
              <div className="report-libido__rows">
                {rows.map((row, i) => (
                  <div key={i} className="report-libido__row">
                    <p className="report-libido__row-term">{row.label}</p>
                    <p className="report-libido__row-detail">{row.value}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        )}

        {hasPractical ? (
          <div className="report-libido__details">
            <button
              type="button"
              className="report-libido__details-summary"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              <span className="report-libido__details-icon" aria-hidden="true">
                <BulbIcon />
              </span>
              <span className="report-libido__details-eyebrow">
                {copy["practical.label"] ?? "The Exit"}
              </span>
              <span
                className={`report-libido__details-chevron${expanded ? " is-open" : ""}`}
                aria-hidden="true"
              >
                ⌄
              </span>
            </button>

            {!expanded ? (
              <div className="report-libido__details-peek">
                {copy["practical.teaser"] ? (
                  <p className="report-libido__details-teaser">{copy["practical.teaser"]}</p>
                ) : null}
                {practicalLines.length > 0 ? (
                  <button
                    type="button"
                    className="report-libido__peek-cta"
                    onClick={() => setExpanded(true)}
                  >
                    Read the full practice
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="report-libido__details-body">
                {practicalLines.map((para, i) => (
                  <p key={i} className="report-libido__details-para">
                    {para}
                  </p>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </article>
    </div>
  );
};

export default LibidoSection;
