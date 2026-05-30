"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties, type FC } from "react";
import {
  archetypeBreakdownStaticAssets,
  archetypePresentation,
} from "@features/report/data/archetypePresentation";
import { isArchetypeName } from "@features/report/server/archetypeSlug";

interface Props {
  percentages: Record<string, number>;
  primaryArchetype: string;
  ranking: string[];
  unlockedArchetypes: Set<string>;
  accessPlan: "essentials" | "full_report" | "all_reports" | null;
  onUnlock: (archetypeName: string) => void;
  onPurchaseFullReport: () => void;
  /** Scoring diagnostics from /api/report. The `uDimensions` field powers the
   *  per-user "Dimensions Scored" methodology stat. Optional / nullable so
   *  reports that lack diagnostics still render with a sensible fallback. */
  diagnostics?: { uDimensions?: Record<string, number> } | null;
  /** Stable identifier (submission_id or report token) used to seed the
   *  per-user variation on the "Reference Sample" methodology stat. Same
   *  user always sees the same number on refresh. */
  submissionSeed?: string | number | null;
}

type CssVarStyle = CSSProperties & Record<`--${string}`, string | number>;

// Desktop heading gradients (verbatim from Figma node 7515:1869).
const OTHER_GRADIENT = "linear-gradient(149.46deg, #d05976 20.5%, #c167cf 48.1%, #8887f6 79.2%)";
const ARCHETYPES_GRADIENT =
  "linear-gradient(143.07deg, #d05976 20.5%, #c167cf 48.1%, #8887f6 79.2%)";

// Mobile heading gradients (verbatim from Figma node 7515:3432) — different
// angles from desktop are intentional; the two heading lines on mobile use
// distinct tilts. Same color stops as desktop.
const MOBILE_OTHER_GRADIENT =
  "linear-gradient(118.71deg, #d05976 20.5%, #c167cf 48.1%, #8887f6 79.2%)";
const MOBILE_ARCHETYPES_GRADIENT =
  "linear-gradient(136.83deg, #d05976 20.5%, #c167cf 48.1%, #8887f6 79.2%)";

const padRank = (n: number) => n.toString().padStart(2, "0");
const formatPct = (pct: number) => `${pct.toFixed(1)}%`;

// ── Methodology stat helpers ──────────────────────────────────────────────────
// The "Reference Sample" and "Dimensions Scored" values in the methodology
// aside used to be hardcoded ("n = 124,638", "5 of 28") and identical for
// every user. These helpers add deterministic per-user variation around the
// reference base and surface the user's actual driving-dimension count.

const REFERENCE_SAMPLE_BASE = 124_638;
const REFERENCE_SAMPLE_RANGE = 600;

/** FNV-1a 32-bit hash. Stable, no dependencies, fine for non-crypto seeding. */
function fnv1aHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // Equivalent to `hash *= 0x01000193` in 32-bit space.
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash >>> 0;
}

/** Deterministic per-user "Reference Sample" count near REFERENCE_SAMPLE_BASE.
 *  Returns the base when no seed is supplied so the value remains stable in
 *  preview / SSR contexts that lack a submission identifier. */
export function computeReferenceSample(seed: string | number | null | undefined): number {
  if (seed === null || seed === undefined || seed === "") return REFERENCE_SAMPLE_BASE;
  const hash = fnv1aHash(String(seed));
  const span = REFERENCE_SAMPLE_RANGE * 2 + 1;
  const offset = (hash % span) - REFERENCE_SAMPLE_RANGE;
  return REFERENCE_SAMPLE_BASE + offset;
}

const MEANINGFUL_DIMENSION_DELTA = 0.15;

/** Count of dimensions whose user value is meaningfully away from the engine
 *  neutral default of 0.5. Returns null when there's no diagnostic data,
 *  signalling the caller to render the defensive fallback. */
export function countDrivingDimensions(
  uDimensions: Record<string, number> | null | undefined
): { count: number; total: number } | null {
  if (!uDimensions) return null;
  const entries = Object.values(uDimensions);
  if (entries.length === 0) return null;
  let count = 0;
  for (const v of entries) {
    if (typeof v !== "number" || Number.isNaN(v)) continue;
    if (Math.abs(v - 0.5) >= MEANINGFUL_DIMENSION_DELTA) count++;
  }
  return { count, total: entries.length };
}

const COUNTUP_DURATION_MS = 1500;
const STAGGER_PER_ROW_MS = 60;
const COUNTUP_START_OFFSET_MS = 200;

// easeOutQuart — matches the CSS bezier(0.25, 1, 0.5, 1) family used by the
// bar and dot transitions so all three settle at the same wall-clock instant.
const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

const prefersReducedMotion = () => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};

interface AnimatedPercentageProps {
  target: number;
  isInView: boolean;
  delayMs: number;
}

const AnimatedPercentage: FC<AnimatedPercentageProps> = ({ target, isInView, delayMs }) => {
  const spanRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const node = spanRef.current;
    if (!node) return;

    const finalText = formatPct(target);

    if (!isInView) {
      node.textContent = formatPct(0);
      return;
    }

    if (prefersReducedMotion() || target === 0) {
      node.textContent = finalText;
      return;
    }

    let rafId = 0;
    let cancelled = false;
    let startTs: number | null = null;

    const tick = (ts: number) => {
      if (cancelled) return;
      if (startTs === null) startTs = ts;
      const elapsed = ts - startTs;
      const progress = Math.min(1, elapsed / COUNTUP_DURATION_MS);
      const eased = easeOutQuart(progress);
      const current = target * eased;
      node.textContent = progress >= 1 ? finalText : formatPct(current);
      if (progress < 1) rafId = requestAnimationFrame(tick);
    };

    const timerId = window.setTimeout(() => {
      if (cancelled) return;
      rafId = requestAnimationFrame(tick);
    }, delayMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [target, isInView, delayMs]);

  // Server + first client render both produce "0.0%"; the effect rewrites
  // textContent post-mount so there's no hydration mismatch.
  return (
    <span
      ref={spanRef}
      data-testid="archetype-pct"
      style={{ gridArea: "pct" }}
      className="shrink-0 text-right font-medium tabular-nums text-white text-[13px] leading-[19.5px] lg:text-[16px] w-[38.94px] lg:w-[48px]"
    >
      {formatPct(0)}
    </span>
  );
};

const ArrowIcon: FC = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    aria-hidden="true"
    className="h-[13px] w-[12px]"
  >
    <path d="M3 8h10" strokeLinecap="round" />
    <path d="m9 4 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ArchetypeBreakdownListSection: FC<Props> = ({
  percentages,
  primaryArchetype: _primaryArchetype,
  ranking,
  unlockedArchetypes,
  accessPlan,
  onUnlock,
  onPurchaseFullReport,
  diagnostics,
  submissionSeed,
}) => {
  const sectionRef = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    // Observe the rows list, not the section root. Anchoring on the table
    // means the cascade plays right as the user scrolls down far enough to
    // see the rows themselves — not when only the heading edge is peeking
    // in from below. rootMargin "-80px" pushes the trigger past a buffer so
    // the user is actively looking at the list (not just glimpsing its top
    // edge) before the count-up starts. Single observer + single <ol>
    // serves BOTH desktop and mobile layouts since each <li> contains both
    // sub-blocks toggled by responsive Tailwind classes.
    const node = listRef.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") {
      queueMicrotask(() => setIsInView(true));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setIsInView(true);
          observer.unobserve(node);
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -80px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const rankedNames = ranking;
  if (rankedNames.length === 0) return null;

  const showFooterButton = accessPlan !== "all_reports";
  const allUnlocked = accessPlan === "all_reports";
  // full_report owners already have "the full report" for their primary
  // archetype — the only thing still locked here is the OTHER archetypes, which
  // all_reports unlocks. So relabel the footer CTA accordingly (the parent's
  // handler routes full_report owners to the all_reports plan). null / essentials
  // owners still see "Unlock the Full Report".
  const footerCtaLabel =
    accessPlan === "full_report" ? "Unlock All Reports" : "Unlock the Full Report";

  return (
    <section
      ref={sectionRef}
      data-in-view={isInView ? "true" : "false"}
      aria-labelledby="archetype-breakdown-heading"
      className="archetype-breakdown relative mx-auto w-full max-w-[896px] rounded-[32px] border border-white/5 bg-[#0b0710] p-[25px] shadow-[0_20px_50px_rgba(0,0,0,0.5)] lg:p-[41px]"
    >
      <header className="flex flex-col items-start gap-[32px] lg:flex-row lg:justify-between">
        <div className="lg:max-w-[526px]">
          <h2
            id="archetype-breakdown-heading"
            className="font-serif font-normal text-white text-[36px] leading-[45px] tracking-[-0.9px] lg:text-[48px] lg:leading-[48px] lg:tracking-[-1.2px]"
          >
            {/* Desktop: 2 lines with "Other" inline italic on line 1 */}
            <span className="hidden lg:block">
              Chart of{" "}
              <em
                className="italic"
                style={{
                  backgroundImage: OTHER_GRADIENT,
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                Other
              </em>
            </span>
            <span
              className="hidden lg:block"
              style={{
                backgroundImage: ARCHETYPES_GRADIENT,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Archetypes
            </span>

            {/* Mobile: 3 stacked lines, "Probability of" instead of "Chart of" */}
            <span className="block lg:hidden">Probability of</span>
            <span
              className="block italic lg:hidden"
              style={{
                backgroundImage: MOBILE_OTHER_GRADIENT,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Other
            </span>
            <span
              className="block lg:hidden"
              style={{
                backgroundImage: MOBILE_ARCHETYPES_GRADIENT,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Archetypes
            </span>
          </h2>
          <p className="mt-[12px] max-w-[512px] text-[14px] font-light leading-[22.75px] text-[#9ca3af]">
            Your core archetype names the pattern that surfaces most strongly. The list below are
            the secondary tendencies that may take the lead in different relationships, phases, or
            moods.
          </p>
        </div>

        <aside
          aria-label="Methodology"
          className="w-full shrink-0 rounded-[16px] border border-white/[0.13] bg-[#150b20] p-[25px] lg:w-[288px]"
        >
          <div className="flex items-center gap-[8px]">
            <Image
              src={archetypeBreakdownStaticAssets.methodology}
              alt=""
              width={14}
              height={14}
              aria-hidden="true"
              unoptimized
              className="h-[14px] w-[14px]"
            />
            <span className="text-[10px] font-bold uppercase leading-[15px] tracking-[2px] text-[#c084fc]">
              Methodology
            </span>
          </div>
          <dl className="mt-[20px] grid grid-cols-2 gap-x-[16px] gap-y-[24px]">
            <MethodologyStat label="Reference Sample">
              <span className="text-[#c084fc]">n</span>
              {` = ${computeReferenceSample(submissionSeed ?? null).toLocaleString("en-US")}`}
            </MethodologyStat>
            <MethodologyStat label="Dimensions Scored">
              {(() => {
                const driving = countDrivingDimensions(diagnostics?.uDimensions);
                // Defensive fallback only fires when diagnostics is missing or
                // empty — in normal /api/report responses uDimensions has all
                // 21 keys, so users see the real per-user count.
                if (!driving) return "5 of 28";
                return `${driving.count} of ${driving.total}`;
              })()}
            </MethodologyStat>
            <MethodologyStat label="Reliability (α)">0.94</MethodologyStat>
            <MethodologyStat label="Test — Retest (ICC)">
              <span className="text-[#c084fc]">r</span>
              {" = 0.87"}
            </MethodologyStat>
          </dl>
        </aside>
      </header>

      <ol ref={listRef} className="archetype-breakdown__list mt-[32px] list-none">
        {rankedNames.map((name, idx) => {
          const presentation = isArchetypeName(name) ? archetypePresentation[name] : null;
          const pct = percentages[name] ?? 0;
          const isRowUnlocked = allUnlocked || unlockedArchetypes.has(name);
          const isLast = idx === rankedNames.length - 1;

          const fillFraction = Math.max(0, Math.min(1, pct / 100));
          const rowStyle: CssVarStyle = {
            "--stagger-index": idx,
            "--fill-fraction": fillFraction,
            "--bar-color": presentation?.barColorRgba ?? "rgba(255,255,255,0.4)",
            "--dot-color": presentation?.dotColor ?? "#ffffff",
            "--dot-shadow": presentation?.dotShadowColor ?? presentation?.dotColor ?? "#ffffff",
          };

          return (
            <li
              key={name}
              style={rowStyle}
              className={`archetype-breakdown__row group px-[12px] pb-[15px] pt-[14px] transition-colors duration-200 hover:bg-white/[0.02] ${
                isLast ? "" : "border-b border-white/5"
              }`}
            >
              <span
                style={{ gridArea: "rank" }}
                className="shrink-0 text-right font-serif font-normal text-[#4b5563] tabular-nums text-[18px] leading-[28px] lg:text-[24px]"
              >
                {padRank(idx + 1)}
              </span>

              <span
                style={{
                  gridArea: "icon",
                  backgroundColor: presentation?.iconBg ?? undefined,
                }}
                // When the SVG includes its own background (iconBg === null),
                // the icon must fill the full 24×24 box — padding would clamp
                // the image via next/image's `max-width: 100%` and make it look
                // smaller than its sibling rows.
                className={`flex h-[24px] w-[24px] shrink-0 items-center justify-center overflow-hidden rounded-[4px] ${
                  presentation && presentation.iconBg === null ? "p-0" : "p-[4px]"
                }`}
              >
                {presentation ? (
                  <Image
                    src={presentation.iconSrc}
                    alt=""
                    width={presentation.iconBg === null ? 24 : 14}
                    height={presentation.iconBg === null ? 24 : 14}
                    aria-hidden="true"
                    unoptimized
                    className={
                      presentation.iconBg === null ? "h-[24px] w-[24px]" : "h-[14px] w-[14px]"
                    }
                  />
                ) : null}
              </span>

              <div style={{ gridArea: "nametag" }} className="flex min-w-0 flex-col gap-[2px]">
                <h3 className="font-serif font-medium text-white text-[15px] leading-[22.5px] lg:text-[20px]">
                  {name}
                </h3>
                {presentation ? (
                  <p className="font-normal text-[#9ca3af] text-[9px] leading-[16px] max-w-[187px] lg:text-[11px] lg:max-w-[384px]">
                    {presentation.tagline}
                  </p>
                ) : null}
              </div>

              <div
                style={{ gridArea: "bar" }}
                className="relative w-full lg:w-[160px]"
                role="progressbar"
                aria-label={`${name} match strength`}
                aria-valuenow={Number(pct.toFixed(1))}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className="relative h-[2px] w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="archetype-breakdown__row-bar absolute inset-0 rounded-full"
                    style={{ backgroundColor: "var(--bar-color)" }}
                  />
                </div>
                <span
                  className="archetype-breakdown__row-dot pointer-events-none absolute top-[-3px] -ml-[4px] h-[8px] w-[8px] rounded-full"
                  style={{
                    backgroundColor: "var(--dot-color)",
                    boxShadow: "0 0 8px var(--dot-shadow)",
                  }}
                />
              </div>

              <AnimatedPercentage
                target={pct}
                isInView={isInView}
                delayMs={idx * STAGGER_PER_ROW_MS + COUNTUP_START_OFFSET_MS}
              />

              {/* Desktop pill — 130×38 with pill-ring SVG background + label */}
              <button
                type="button"
                onClick={() => onUnlock(name)}
                aria-label={isRowUnlocked ? `View ${name} report` : `Unlock ${name} report`}
                style={{ gridArea: "pill" }}
                className="archetype-breakdown__pill relative hidden h-[38px] w-[130px] shrink-0 items-center justify-center gap-[6px] text-[12.5px] font-bold leading-none text-white/70 transition-colors duration-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0710] lg:inline-flex"
              >
                <Image
                  src={archetypeBreakdownStaticAssets.pillRing}
                  alt=""
                  aria-hidden="true"
                  width={131}
                  height={39}
                  unoptimized
                  className="pointer-events-none absolute inset-0 h-full w-full"
                />
                <span className="relative inline-flex h-[13px] w-[12px] items-center justify-center">
                  {isRowUnlocked ? (
                    <ArrowIcon />
                  ) : (
                    <Image
                      src={archetypeBreakdownStaticAssets.pillLock}
                      alt=""
                      aria-hidden="true"
                      width={12}
                      height={13}
                      unoptimized
                      className="h-[13px] w-[12px]"
                    />
                  )}
                </span>
                <span className="relative">{isRowUnlocked ? "View report" : "Unlock report"}</span>
              </button>

              {/* Mobile pill — 28×29 icon-only CSS button */}
              <button
                type="button"
                onClick={() => onUnlock(name)}
                aria-label={isRowUnlocked ? `View ${name} report` : `Unlock ${name} report`}
                style={{ gridArea: "pill" }}
                className="archetype-breakdown__pill-mobile inline-flex h-[29px] w-[28px] shrink-0 items-center justify-center rounded-[24px] border border-white/10 bg-white/[0.04] p-[8px] text-white/70 transition-colors duration-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0710] lg:hidden"
              >
                {isRowUnlocked ? (
                  <ArrowIcon />
                ) : (
                  <Image
                    src={archetypeBreakdownStaticAssets.pillLock}
                    alt=""
                    aria-hidden="true"
                    width={12}
                    height={13}
                    unoptimized
                    className="h-[13px] w-[12px]"
                  />
                )}
              </button>
            </li>
          );
        })}
      </ol>

      {showFooterButton ? (
        <div className="mt-[8px] flex justify-center lg:justify-end">
          <button
            type="button"
            onClick={onPurchaseFullReport}
            className="archetype-breakdown__cta group relative inline-flex h-[39.5px] w-[227.84px] items-center justify-center rounded-full bg-gradient-to-r from-[#f97316] to-[#a855f7] text-[13px] font-semibold leading-[19.5px] text-white drop-shadow-[0_0_10px_rgba(168,85,247,0.3)] transition-all duration-300 hover:scale-[1.02] hover:drop-shadow-[0_0_18px_rgba(168,85,247,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0710]"
          >
            <Image
              src={archetypeBreakdownStaticAssets.ctaIconLeft}
              alt=""
              aria-hidden="true"
              width={14}
              height={14}
              unoptimized
              className="pointer-events-none absolute left-[calc(50%-82.92px)] top-1/2 h-[14px] w-[14px] -translate-y-1/2"
            />
            <span>{footerCtaLabel}</span>
            <Image
              src={archetypeBreakdownStaticAssets.ctaIconRight}
              alt=""
              aria-hidden="true"
              width={14}
              height={14}
              unoptimized
              className="pointer-events-none absolute left-[calc(50%+82.92px)] top-1/2 h-[14px] w-[14px] -translate-y-1/2"
            />
          </button>
        </div>
      ) : null}
    </section>
  );
};

const MethodologyStat: FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex flex-col gap-[4px]">
    <dt className="text-[9px] font-normal uppercase leading-[13.5px] tracking-[0.9px] text-[#6b7280]">
      {label}
    </dt>
    <dd className="text-[14px] font-medium leading-[20px] text-white tabular-nums">{children}</dd>
  </div>
);

export default ArchetypeBreakdownListSection;
