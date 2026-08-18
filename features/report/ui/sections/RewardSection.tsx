"use client";

import { useState, type CSSProperties, type FC } from "react";
import LockedPreviewImage from "./LockedPreviewImage";
import PremiumOverlay, { type PremiumOverlayTier } from "./PremiumOverlay";
import { useRevealOnView } from "../hooks/useRevealOnView";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";
import { renderEduPara } from "./eduPara";

/**
 * Server-resolved reward copy (`getReport2Section(name, "reward")`), threaded as
 * a prop because the 634KB copy module is server-only (see
 * `app/api/report/route.ts` → `rewardCopy`).
 *
 * GATING (Part III, FULL_REPORT tier — this section is NOT in
 * `ESSENTIALS_SECTION_IDS`, so it only unlocks at the full_report tier): the
 * educational slots (`gate.hook`, `edu.*`, `learn.*`) are universal and always
 * shipped. The per-archetype payload — `takeaway` (verdict) and the reward
 * `config` (chemical order / roles / meter fills) — is the gated content:
 * shipped ONLY when the report is unlocked at the full_report tier. A locked
 * client (`locked: true`) receives `takeaway: null` + `config: null` and renders
 * the hook teaser + PremiumOverlay instead. Never send locked per-archetype
 * content to an unpaid client.
 *
 * `stat1` / `stat1.caption` are per-archetype but universal-safe education (the
 * ranked-prevalence stat), always shipped. Per the "never fabricate a stat"
 * rule they render only when present; absent ⇒ the stat block is omitted.
 */
export interface RewardCopy {
  "gate.hook"?: string | null;
  takeaway?: string | null;
  "edu.eyebrow"?: string | null;
  "edu.teaser"?: string | null;
  "edu.body.p1"?: string | null;
  "edu.body.p2"?: string | null;
  "edu.body.p3"?: string | null;
  stat1?: string | null;
  "stat1.caption"?: string | null;
  "learn.eyebrow"?: string | null;
  "learn.body"?: string | null;
  /** True when the per-archetype takeaway + reward config were withheld (unpaid). */
  locked: boolean;
}

/**
 * Reward-meter config from `getReport2Config(name)` — normalized server-side and
 * only sent when unlocked (null otherwise). `order` is the four neurochemicals
 * in the reader's rank order; `meters` the fill % per rank (0–100). Only
 * Spiritual Lover carries full meters today (`[88,56,30,12]`); Spark Seeker /
 * Sensual Connector carry `order` but null meters, and the other 11 carry no
 * order — in those cases the bars are omitted rather than fabricated.
 */
export interface RewardConfig {
  /** e.g. ["oxytocin","endorphins","dopamine","adrenaline"]. */
  order: string[];
  /** e.g. ["lead","support","amplifier","disruptor"] — role per rank, may be shorter. */
  roles: string[];
  /** e.g. [88,56,30,12] — meter fill % per rank; empty when absent. */
  meters: number[];
}

interface Props {
  archetype: string;
  copy: RewardCopy | null;
  /** Reward config (order/roles/meters); null when locked or absent for the archetype. */
  config: RewardConfig | null;
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

/**
 * The four neurochemicals are UNIVERSAL — the same four for every archetype;
 * only the ranking (`order`) and fill (`meters`) vary per reader. Display name +
 * a neutral one-line "what it is" blurb are hardcoded here (universal science,
 * mirrored from the section's own `edu.body` copy — NOT per-archetype text), so
 * the row heading/description are correct for all 14 without fabricating any
 * archetype-specific line. Keyed by the `order` slug from config.
 */
const CHEMICALS: Record<string, { name: string; blurb: string }> = {
  oxytocin: {
    name: "Oxytocin",
    blurb: "The bonding current — released through eye contact, touch, and trust.",
  },
  endorphins: {
    name: "Endorphins",
    blurb: "Warmth, calm, and afterglow — the reward of rhythm and repetition.",
  },
  dopamine: {
    name: "Dopamine",
    blurb: 'The "wanting" chemical — anticipation, novelty, and the chase.',
  },
  adrenaline: {
    name: "Adrenaline",
    blurb: "Edge, risk, and intensity — the charge of taboo and shock.",
  },
};

/**
 * Role → verb label shown on the right of each row (Figma: "leads" / "supports"
 * / "amplifies" / "disrupts"). Config `roles` carry noun forms; this maps them
 * to the verb the Figma renders. Unknown/absent role falls back to "".
 */
const ROLE_VERBS: Record<string, string> = {
  lead: "leads",
  support: "supports",
  amplifier: "amplifies",
  disruptor: "disrupts",
  // Spark Seeker's config uses "settler" for rank 4.
  settler: "settles",
};

/**
 * Meter color per RANK (not per chemical) — the Figma tints rows by position:
 * rank 1 solid purple, rank 2 lighter purple, rank 3 grey, rank 4 orange. This
 * generalizes to any archetype's `order` regardless of which chemical sits
 * where. The 5th+ entry (never expected — only four chemicals) reuses grey.
 */
const RANK_STYLES = [
  { fill: "#9d8ad7", track: "rgba(157,138,215,0.6)", glow: "#a78bfa", role: "#3f3a4d" },
  { fill: "#a78bfa", track: "rgba(167,139,250,0.5)", glow: "#c4b5fd", role: "#3f3a4d" },
  { fill: "#a6a0b5", track: "rgba(107,102,120,0.4)", glow: "#c9c3d8", role: "#3f3a4d" },
  { fill: "#d98a63", track: "rgba(194,84,47,0.35)", glow: "#e8b39a", role: "#c2542f" },
] as const;

/** One ranked chemical row: index · name+blurb · meter bar · role verb. */
const RewardRow: FC<{
  index: number;
  name: string;
  blurb: string;
  role: string;
  meter: number | null;
}> = ({ index, name, blurb, role, meter }) => {
  const style = RANK_STYLES[Math.min(index, RANK_STYLES.length - 1)]!;
  const verb = ROLE_VERBS[role] ?? "";
  // Fill % clamped to the track; the dot sits at the fill end.
  const fill = meter == null ? null : Math.max(0, Math.min(100, meter));

  return (
    // `--row` staggers this row's meter behind the one above it (.report-chart-reveal).
    <li className="report-reward__row" style={{ "--row": index } as CSSProperties}>
      <span className="report-reward__rank" aria-hidden="true">
        {String(index + 1).padStart(2, "0")}
      </span>
      <span className="report-reward__row-main">
        <span className="report-reward__chem">
          {name}
          {verb ? <span className="report-reward__chem-role"> — the {role}</span> : null}
        </span>
        <span className="report-reward__blurb">{blurb}</span>
      </span>
      {fill != null ? (
        <span className="report-reward__meter" aria-hidden="true">
          <span className="report-reward__meter-track" />
          <span
            className="report-reward__meter-fill"
            style={{ width: `${fill}%`, background: style.track }}
          />
          <span
            className="report-reward__meter-dot"
            style={{ left: `${fill}%`, background: style.fill, boxShadow: `0 0 9px ${style.glow}` }}
          />
        </span>
      ) : (
        <span className="report-reward__meter report-reward__meter--empty" aria-hidden="true" />
      )}
      {verb ? (
        <span className="report-reward__role-label" style={{ color: style.role }}>
          {verb}
        </span>
      ) : (
        <span className="report-reward__role-label" />
      )}
    </li>
  );
};

/**
 * The rarity dots above the stat line — Figma 9114:839 → 9114:840. Seven dots,
 * d=11.41 on a 16.3 pitch across a 109.211-wide viewBox; the first carries the
 * purple gradient (#B7A6E3 → #795FC8 across the dot's own box) and the remaining
 * six sit at #9D8AD7 / 16%. It reads as "you are the one in many". This was the
 * piece missing from the section: the card, its border, the stat type and the
 * caption already matched the design, but the dot row was absent entirely.
 */
/** Figma's geometry: d=11.41 dots on a 16.3 pitch. */
const DOT_D = 11.41;
const DOT_PITCH = 16.3;
const DOT_FALLBACK = { filled: 1, total: 7 };

/**
 * How many dots to draw, read off the stat line itself.
 *
 * The frame hardcodes seven dots with one filled and prints "1 IN 4" beneath
 * them, so the graphic contradicts its own number — tolerable when it read as a
 * loose "one in many" motif, but not once a precise ratio sits directly under it
 * inviting you to count. Deriving the row from the stat makes the two agree for
 * every archetype instead of only the one the frame mocked.
 *
 * Stats that aren't a ratio ("about half", "Rarely first", "ease-led") have
 * nothing to count, so they keep the frame's decorative seven.
 */
export function rewardStatDots(stat: string | null | undefined): { filled: number; total: number } {
  const m = stat?.match(/(\d+)\s*in\s*(\d+)/i);
  if (!m) return DOT_FALLBACK;
  const filled = Number(m[1]);
  const total = Number(m[2]);
  // A row long enough to need scrolling, or one that can't be counted, helps
  // nobody — fall back rather than render something worse than the motif.
  if (!Number.isFinite(filled) || !Number.isFinite(total)) return DOT_FALLBACK;
  if (total < 2 || total > 14 || filled < 1 || filled >= total) return DOT_FALLBACK;
  return { filled, total };
}

/**
 * The reader's real ranking. Separate from the locked blurred stand-in so only
 * this one carries the scroll reveal — the stand-in sits under a blur behind the
 * paywall overlay, where animating meters would be motion nobody can read.
 */
const RewardRankedList: FC<{
  rows: { name: string; blurb: string; role: string; meter: number | null }[];
}> = ({ rows }) => {
  const [listRef, revealed] = useRevealOnView<HTMLOListElement>();
  return (
    <ol
      ref={listRef}
      className={`report-reward__list report-chart-reveal${revealed ? " is-revealed" : ""}`}
    >
      {rows.map((row, i) => (
        <RewardRow
          key={i}
          index={i}
          name={row.name}
          blurb={row.blurb}
          role={row.role}
          meter={row.meter}
        />
      ))}
    </ol>
  );
};

const RewardStatDots: FC<{ stat?: string | null }> = ({ stat }) => {
  const { filled, total } = rewardStatDots(stat);
  const width = (total - 1) * DOT_PITCH + DOT_D;
  return (
    <svg
      className="report-reward__stat-dots"
      viewBox={`0 0 ${width.toFixed(3)} ${DOT_D}`}
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="report-reward-stat-dot"
          x1="0"
          y1="0"
          x2={DOT_D}
          y2={DOT_D}
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#B7A6E3" />
          <stop offset="1" stopColor="#795FC8" />
        </linearGradient>
      </defs>
      {Array.from({ length: total }, (_, i) => (
        <circle
          key={i}
          cx={DOT_D / 2 + i * DOT_PITCH}
          cy={DOT_D / 2}
          r={DOT_D / 2}
          fill={i < filled ? "url(#report-reward-stat-dot)" : "#9D8AD7"}
          fillOpacity={i < filled ? 1 : 0.16}
        />
      ))}
    </svg>
  );
};

const RewardSection: FC<Props> = ({
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

  // Educational block is universal — always safe to show.
  const eduParas = [copy["edu.body.p1"], copy["edu.body.p2"], copy["edu.body.p3"]].filter(
    (p): p is string => !!p
  );
  const hasEdu = !!copy["edu.teaser"] || eduParas.length > 0;

  // Rows: only when config carries a real `order` (never fabricated). Meters
  // align by rank; absent meters ⇒ that row renders name+role+blurb, no bar.
  const rows =
    config && config.order.length > 0
      ? config.order.map((slug, i) => {
          const chem = CHEMICALS[slug] ?? { name: slug, blurb: "" };
          return {
            name: chem.name,
            blurb: chem.blurb,
            role: config.roles[i] ?? "",
            meter: config.meters[i] ?? null,
          };
        })
      : [];

  // Stat block — per-archetype but universal-safe education. Render only when
  // both the number and caption are present (never fabricate a stat).
  const stat = copy.stat1?.trim();
  const statCaption = copy["stat1.caption"]?.trim();
  const hasStat = !!stat && !!statCaption;

  return (
    <div className="report-reward">
      <h3 className="report-reward__heading">Reward System</h3>

      {copy["learn.body"] ? (
        <div className="report-reward__learn-pill-wrap">
          <span className="report-reward__learn-pill">
            <span className="report-reward__learn-pill-icon" aria-hidden="true">
              <BookIcon />
            </span>
            {copy["learn.eyebrow"] ?? "What you will learn"}
          </span>
          <p className="report-reward__learn-body">{copy["learn.body"]}</p>
        </div>
      ) : null}

      <article className="report-reward__card">
        {locked ? (
          <>
            {copy["gate.hook"] ? <p className="report-reward__hook">{copy["gate.hook"]}</p> : null}
            <div className="report-reward__preview">
              {/* A pre-blurred render of the REAL chapter. Blurring the PIXELS at
                  build time means the paid copy is not in the file that ships, so
                  it cannot be read back out of the DOM. See LockedPreviewImage. */}
              <div
                className="report-reward__preview-fade report-preview-fade--image"
                aria-hidden="true"
              >
                <LockedPreviewImage name="reward" />
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
            {rows.length > 0 ? <RewardRankedList rows={rows} /> : null}

            {hasStat ? (
              <div className="report-reward__stat">
                <RewardStatDots stat={stat} />
                <span className="report-reward__stat-num">{stat}</span>
                <span className="report-reward__stat-caption">{statCaption}</span>
              </div>
            ) : null}

            {copy.takeaway ? (
              <div className="report-reward__verdict">
                <span className="report-reward__star" aria-hidden="true">
                  &#10037;
                </span>
                <p className="report-reward__takeaway">{copy.takeaway}</p>
              </div>
            ) : null}
          </>
        )}

        {hasEdu ? (
          <div className="report-reward__details">
            <button
              type="button"
              className="report-reward__details-summary"
              aria-expanded={locked ? false : expanded}
              onClick={locked ? onUnlock : () => setExpanded((v) => !v)}
            >
              <span className="report-reward__details-icon" aria-hidden="true">
                <BookIcon />
              </span>
              <span className="report-reward__details-eyebrow">
                {copy["edu.eyebrow"] ?? "Learn: the chemistry"}
              </span>
              <span
                className={`report-reward__details-chevron${expanded ? " is-open" : ""}`}
                aria-hidden="true"
              >
                ⌄
              </span>
            </button>

            {locked || !expanded ? (
              <div className="report-reward__details-peek report-learn-peek">
                {copy["edu.teaser"] ? (
                  <p className="report-reward__details-teaser report-learn-teaser">
                    {copy["edu.teaser"]}
                    {copy["edu.body.p1"] ? ` ${copy["edu.body.p1"]}` : null}
                  </p>
                ) : null}
                {locked || eduParas.length > 0 ? (
                  <button
                    type="button"
                    className="report-reward__peek-cta report-learn-cta"
                    onClick={locked ? onUnlock : () => setExpanded(true)}
                  >
                    {locked ? "Unlock to read the full explanation" : "Read the full explanation"}
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="report-reward__details-body">
                {copy["edu.teaser"] ? (
                  <p className="report-reward__details-teaser report-learn-teaser-full">
                    {copy["edu.teaser"]}
                  </p>
                ) : null}
                {eduParas.map((para, i) => (
                  <p key={i} className="report-reward__details-para">
                    {renderEduPara(para)}
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

export default RewardSection;
