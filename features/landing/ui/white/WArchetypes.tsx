"use client";

import { useEffect, useState, type FC } from "react";
import Image from "next/image";
import Link from "next/link";
import { trackStartSurvey } from "@features/analytics/client";
import { archetypePresentation } from "@features/report/data/archetypePresentation";
import type { ArchetypeName } from "@features/report/server/archetypeSlug";

const stats = [
  { num: 47, body: "of adults report a sexual concern they have never voiced to a partner." },
  { num: 20, body: "of adults say they are satisfied with their sex life." },
  {
    num: 41,
    body: "higher reported satisfaction when partners can name their own patterns.",
  },
];

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Fire once when the element scrolls into view. Uses a callback ref stored in
 * state (no ref access during render) so the React Compiler lint is happy.
 */
function useInView(): { setNode: (node: Element | null) => void; inView: boolean } {
  const [node, setNode] = useState<Element | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!node || inView) return;
    if (typeof IntersectionObserver === "undefined") {
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) setInView(true);
      });
      return () => {
        cancelled = true;
      };
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { threshold: 0.2, rootMargin: "0px 0px -12% 0px" }
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [node, inView]);
  return { setNode, inView };
}

/** Count 0 → target once `active`, easing out. Respects reduced motion. */
const CountUp: FC<{ target: number; active: boolean }> = ({ target, active }) => {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (prefersReducedMotion()) {
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) setVal(target);
      });
      return () => {
        cancelled = true;
      };
    }
    let raf = 0;
    let start: number | null = null;
    const DURATION = 1400;
    const tick = (ts: number) => {
      if (start === null) start = ts;
      const p = Math.min(1, (ts - start) / DURATION);
      const eased = 1 - Math.pow(1 - p, 4);
      if (p < 1) {
        setVal(target * eased);
        raf = requestAnimationFrame(tick);
      } else {
        setVal(target);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, target]);
  return <>{Math.round(val)}%</>;
};

const scoringSteps = [
  {
    num: "I",
    title: "Your answers",
    body: "≈ 60 calibrated items across the full instrument — situational, not self-flattering.",
  },
  {
    num: "II",
    title: "Twenty-one dimensions scored",
    body: "Each answer loads onto the dimensions below, weighted by a model refined across 30,000+ responses.",
  },
  {
    num: "III",
    title: "Your archetype",
    body: "The shape of your scores is matched to its nearest archetype — with the distance to neighbouring types kept visible.",
  },
];

// Illustrative ranked probabilities (static marketing display — an anonymous
// landing visitor has no real scores yet). Names + order + percentages mirror
// the Figma comp; colours desaturate down the ranking.
const chart: { name: string; pct: number; tagline: string; color: string }[] = [
  {
    name: "Authority Conductor",
    pct: 89.0,
    tagline: "Let me lead the rhythm, set the rules, and build the tension between us.",
    color: "#f59e0b",
  },
  {
    name: "Loyal Ritualist",
    pct: 74.0,
    tagline:
      "Give me the familiar touch, the trusted rhythm, and the comfort of returning to this.",
    color: "#22c55e",
  },
  {
    name: "Explorer of Edges",
    pct: 55.0,
    tagline: "Take me somewhere new, intense, and real enough to shake me awake.",
    color: "#ec4899",
  },
  {
    name: "Spark Seeker",
    pct: 44.0,
    tagline: "Tease me, surprise me, chase me a little — I want sex to feel alive.",
    color: "#f97316",
  },
  {
    name: "Radiant Performer",
    pct: 40.5,
    tagline: "Look at me like you want me, and I’ll show you more of myself.",
    color: "#eab308",
  },
  {
    name: "Spiritual Lover",
    pct: 36.0,
    tagline: "Make it feel meaningful — like our bodies are saying something deeper.",
    color: "#8b5cf6",
  },
  {
    name: "Curious Apprentice",
    pct: 33.5,
    tagline: "Guide me, show me what you like, and let us learn what feels good together.",
    color: "#06b6d4",
  },
  {
    name: "Relational Nurturer",
    pct: 29.0,
    tagline: "Let us make each other feel safe, cared for, and wanted again.",
    color: "#10b981",
  },
  {
    name: "Tender Devotee",
    pct: 24.0,
    tagline: "Tell me I’m wanted, show me I’m enough, and I’ll slowly open to you.",
    color: "#e25fb8",
  },
  {
    name: "Sensual Connector",
    pct: 18.5,
    tagline: "Hold me close, take your time, and let me feel that you are really here with me.",
    color: "#ef4444",
  },
  {
    name: "Analytical Sexualist",
    pct: 16.0,
    tagline:
      "Tell me what works, let me understand your body, and I’ll get better at pleasing you.",
    color: "#6366f1",
  },
  {
    name: "Emotional Voyeur",
    pct: 12.5,
    tagline: "Let me watch, imagine, and feel the tension before I fully step in.",
    color: "#94a3b8",
  },
  {
    name: "Minimalist Companion",
    pct: 8.0,
    tagline: "No pressure, no performance — just be close, be kind, and stay with me.",
    color: "#a8b0bd",
  },
  {
    name: "Quiet Withdrawer",
    pct: 6.5,
    tagline: "Come slowly, ask gently, and let me feel that I can say no and still be safe.",
    color: "#b8bec9",
  },
];

const Eyebrow: FC<{ children: string }> = ({ children }) => (
  <div className="flex items-center gap-2.5">
    <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-accent-orange" />
    <span className="text-[11px] font-bold uppercase tracking-wide text-[#6b6678]">{children}</span>
  </div>
);

const WArchetypes: FC = () => {
  const { setNode: setStatsNode, inView: statsInView } = useInView();
  const { setNode: setChartNode, inView: chartInView } = useInView();

  return (
    <section className="bg-white py-16 lg:py-24">
      <div className="content-shell flex flex-col gap-20">
        {/* Why we built LoveIQ — stats band */}
        <div className="animate-on-scroll rounded-3xl bg-[#f5f6f8] p-8 lg:p-12">
          <Eyebrow>Why we built LoveIQ</Eyebrow>
          <h2 className="mt-3 font-serif text-3xl font-medium leading-tight text-[#161021] sm:text-[40px]">
            Intimacy is studied closely, and discussed almost never.
          </h2>
          <p className="mt-4 max-w-3xl text-[17px] leading-relaxed text-[#3f3a4d]">
            Positive sexual well-being is highly linked to lower stress, anxiety, and depression,
            better cardiovascular health, and higher relationship satisfaction. We want to make
            sexuality something we can explore with curiosity, confidence, and care — not shame or
            confusion.
          </p>
          <div ref={setStatsNode} className="mt-10 grid gap-8 sm:grid-cols-3">
            {stats.map((s) => (
              <div key={s.num} className="flex flex-col gap-2">
                <span className="bg-gradient-to-r from-[#fe6839] via-[#d95b88] to-[#cb5fc1] bg-clip-text font-serif text-5xl font-semibold tabular-nums text-transparent">
                  <CountUp target={s.num} active={statsInView} />
                </span>
                <span className="text-sm leading-relaxed text-[#6b6678]">{s.body}</span>
              </div>
            ))}
          </div>
        </div>

        {/* A shared language — intro + 3-step scoring */}
        <div className="animate-on-scroll flex flex-col gap-10">
          <div className="max-w-3xl">
            <Eyebrow>A shared language</Eyebrow>
            <h2 className="mt-3 font-serif text-3xl font-medium leading-tight text-[#161021] sm:text-[40px]">
              Explore the{" "}
              <span className="bg-gradient-to-r from-[#fe6839] via-[#bf66d9] to-[#958ef6] bg-clip-text text-transparent">
                14 Archetypes
              </span>
            </h2>
            <p className="mt-4 text-[17px] leading-relaxed text-[#3f3a4d]">
              Every person maps onto a signature of how they relate and desire. Your report places
              you precisely, with the nuance between types — never a box, always a position.{" "}
              <strong className="font-bold text-[#161021]">
                Your archetype is not a guess. It is the shape of your answers, scored against a
                validated model.
              </strong>
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {scoringSteps.map((step) => (
              <div key={step.num} className="flex flex-col gap-2 border-t border-black/10 pt-4">
                <span className="font-serif text-3xl text-[#161021]/15">{step.num}</span>
                <h3 className="font-serif text-lg font-bold text-[#161021]">{step.title}</h3>
                <p className="text-sm leading-relaxed text-[#6b6678]">{step.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Probability chart */}
        <div className="animate-on-scroll flex flex-col gap-1">
          <p className="mb-4 text-sm font-medium text-[#6b6678]">
            We will score you against all our existing archetypes:
          </p>
          <ul ref={setChartNode} className="m-0 flex list-none flex-col p-0">
            {chart.map((row, i) => {
              const presentation = archetypePresentation[row.name as ArchetypeName];
              // Match the line/dot to the archetype's icon colour so the lowest-ranked
              // rows carry their real hue instead of reading as dead gray.
              const lineColor = presentation?.iconBg ?? presentation?.dotColor ?? row.color;
              return (
                <li
                  key={row.name}
                  className="grid grid-cols-[28px_minmax(0,1fr)] items-center gap-4 border-b border-black/[0.05] py-4 sm:grid-cols-[28px_minmax(0,1fr)_minmax(180px,300px)_auto]"
                >
                  <span className="font-serif text-2xl text-[#c5c8cc]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg"
                      style={
                        presentation?.iconBg ? { backgroundColor: presentation.iconBg } : undefined
                      }
                    >
                      {presentation && (
                        <Image
                          src={presentation.iconSrc}
                          alt=""
                          width={20}
                          height={20}
                          unoptimized
                          className="h-5 w-5"
                        />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-bold text-black">{row.name}</p>
                      <p className="truncate text-[11px] italic text-[#57595e]">“{row.tagline}”</p>
                    </div>
                  </div>
                  <div className="col-span-2 flex items-center gap-3 sm:col-span-1">
                    {/* Figma-style track line: colored fill + dot, animating L→R on scroll. */}
                    <div className="relative h-[2px] flex-1 rounded-full bg-black/10">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-[900ms] ease-out motion-reduce:transition-none"
                        style={{
                          width: chartInView ? `${row.pct}%` : "0%",
                          backgroundColor: lineColor,
                        }}
                      />
                      <div
                        className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full transition-[left] duration-[900ms] ease-out motion-reduce:transition-none"
                        style={{
                          left: chartInView ? `${row.pct}%` : "0%",
                          backgroundColor: lineColor,
                          boxShadow: `0 0 0 3px ${lineColor}26`,
                        }}
                      />
                    </div>
                    <span className="w-12 shrink-0 text-right text-sm font-medium tabular-nums text-black">
                      {row.pct.toFixed(1)}%
                    </span>
                  </div>
                  <Link
                    href="/survey"
                    onClick={() => trackStartSurvey("archetype-teaser")}
                    className="focus-visible-ring col-span-2 inline-flex items-center justify-center gap-1.5 justify-self-start rounded-full bg-black px-4 py-1.5 text-xs font-bold text-white transition hover:bg-gray-800 sm:col-span-1 sm:justify-self-end"
                  >
                    <svg
                      aria-hidden
                      className="h-3 w-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="5" y="11" width="14" height="9" rx="2" />
                      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                    </svg>
                    Unlock report
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
};

export default WArchetypes;
