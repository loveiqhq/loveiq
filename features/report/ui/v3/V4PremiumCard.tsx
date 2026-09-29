import Image from "next/image";
import type { FC } from "react";

/**
 * The paywall card that floats over a gated chapter, practice or article.
 *
 * Mark, 29.09 (1945959774 / 1945959900): "We have updated the paywall CTAs". Every
 * card in the file was redrawn: a gradient lock beside "Unlock full insights!", the
 * guarantee box, and a gradient "Unlock Report →" pill. The practice and article gates
 * draw it 330x205 (1015:1207, 1015:1232 and their siblings); the chapter-body gates
 * 330x363, with three ticked features between the box and the pill (1015:1163,
 * 1015:1004, 1015:1257, 1015:1379).
 *
 * THE GUARANTEE: the frames say "7-day money-back". Fatih, 29.09: keep the 14 days the
 * Terms, the landing page and every other surface promise; the 7 is flagged to Mark.
 *
 * NOT a reuse of features/report/ui/sections/PremiumOverlay.tsx: no price, no
 * strike-through, no "SAVE" pill, and its DOM is bound to `.report-premium-overlay__*`
 * in report.css, which the V4 surfaces never load.
 *
 * Purely presentational, and deliberately WITHOUT its own onClick: the gate band
 * around it owns the handler, so a tap anywhere on the blurred block opens the
 * paywall. PremiumOverlay.tsx:214-221 records why both firing is a bug — it opened the
 * pricing modal twice. The click still bubbles, so Enter and Space on this button
 * behave exactly as a button should.
 *
 * The geometry is still a uniform x0.71941 scale of a larger original (0.719 was 1px,
 * 17.268 was 24), so the fractional numbers are the design, not rounding noise.
 */

interface Props {
  /** "body" is the chapter-body card, with its three features (1015:1163). */
  variant?: "gate" | "body";
  /** The frame's own node, when a chapter's card has one. */
  nodeId?: string;
}

/** 1015:1186 / 1015:1192 / 1015:1199. */
const FEATURES = [
  "Your complete archetype report",
  "+20 chapters and personalised growth",
  "Finally understand old patterns and learn how to move past them",
] as const;

const V4PremiumCard: FC<Props> = ({ variant = "gate", nodeId }) => {
  const body = variant === "body";
  return (
    <div
      className={`rv4-premium${body ? " rv4-premium--body" : ""}`}
      data-node-id={nodeId ?? (body ? "1015:1163" : "1015:1207")}
      data-name="Premium content card"
    >
      {/* 1015:1165 — the lock and the headline, 9.824 apart. */}
      <div className="rv4-premium__head">
        <span className="rv4-premium__lock" aria-hidden="true">
          <Image src="/report/v3/locks/lock-14.svg" alt="" width={14} height={14} unoptimized />
        </span>
        <h3 className="rv4-premium__title">Unlock full insights!</h3>
      </div>

      {/* 1015:1174 / 1015:1218 */}
      <div className="rv4-premium__guarantee">
        <span className="rv4-premium__shield" aria-hidden="true">
          <Image
            className="rv4-premium__shield-bg"
            src="/report/v3/premium/shield.svg"
            alt=""
            width={29}
            height={29}
            unoptimized
          />
          <Image
            className="rv4-premium__shield-tick"
            src={body ? "/report/v3/premium/tick-body.svg" : "/report/v3/premium/tick.svg"}
            alt=""
            width={body ? 14 : 13}
            height={16}
            unoptimized
          />
        </span>
        <span className="rv4-premium__guarantee-text">
          <span className="rv4-premium__guarantee-head">14-day money-back</span>
          <span className="rv4-premium__guarantee-sub">Guaranteed, no questions asked.</span>
        </span>
      </div>

      {body ? (
        <ul className="rv4-premium__feats">
          {FEATURES.map((feature) => (
            <li key={feature}>
              <Image src="/report/v3/premium/check.svg" alt="" width={16} height={16} unoptimized />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* 1015:1229 / 1015:1205 — a no-break space: the pill is a flex box, which drops
       * a plain one at the start of the arrow's run. */}
      <button type="button" className="rv4-premium__cta">
        Unlock Report<span aria-hidden="true">{" →"}</span>
      </button>
    </div>
  );
};

export default V4PremiumCard;
