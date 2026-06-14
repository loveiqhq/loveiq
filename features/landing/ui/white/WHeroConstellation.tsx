"use client";

import { useEffect, useRef, useState, type FC } from "react";

/**
 * Hero "constellation" (Figma 7809-19694 + the LoveIQ Report Card animation
 * reference). The LoveIQ molecule sits centered (reusing /images/white/hero-bg.png,
 * which already bakes in the dot-cluster + faint rings + halo), and the product's
 * 14 archetype names and its dimension words gently appear and disappear ONE BY
 * ONE at varied spots around it — a living constellation.
 *
 * Motion language is lifted from the provided reference: fade + a small rise +
 * subtle scale, ~0.5s, cubic-bezier(.22,1,.36,1), staggered per position so labels
 * never pop in all at once. Each position runs an independent in → hold → out →
 * gap cycle on `setTimeout` (NOT a per-frame rAF), so it's cheap and never fights
 * Lenis smooth-scroll or the WArchetypeCards marquee. Pauses when scrolled out of
 * view, and respects prefers-reduced-motion (renders a calm static handful).
 *
 * Layout: on the wide desktop hero the molecule is the centered backdrop and the
 * labels ring it — each label's dot sits on the OUTER edge with its text flowing
 * INWARD toward the molecule, so text always moves away from the copy/stats columns
 * (collision-proof at any width). Below `xl` the hero stacks and labels appear
 * centered above/below the molecule.
 */

const ARCHETYPES = [
  "Authority Conductor",
  "Loyal Ritualist",
  "Explorer of Edges",
  "Spark Seeker",
  "Radiant Performer",
  "Spiritual Lover",
  "Curious Apprentice",
  "Relational Nurturer",
  "Tender Devotee",
  "Sensual Connector",
  "Analytical Sexualist",
  "Emotional Voyeur",
  "Minimalist Companion",
  "Quiet Withdrawer",
];

const DIMENSIONS = [
  "Power",
  "Stability",
  "Novelty",
  "Care",
  "Depth",
  "Desire",
  "Communication",
  "Openness",
  "Trust",
  "Closeness",
  "Playfulness",
  "Control",
];

type Item = { text: string; kind: "archetype" | "dimension" };
// Position = the DOT location as a percent of the (square) container. Labels with
// x>50 sit on the right and flow their text left (inward); x<50 sit on the left and
// flow right (inward); x===50 is centered (used for the stacked mobile layout).
type Position = { x: number; y: number };

// A ring around the molecule: top, bottom, and the four diagonals. We deliberately
// skip the 3-o'clock / 9-o'clock spots — at mid-height the inward-flowing text would
// cross the dense dot-cluster (and the left dot would creep toward the copy on wide
// screens). Left and right arcs are vertically offset (~10%) so two inward labels
// never converge, and every spot avoids the cluster's y36–64 band.
const DESKTOP_POSITIONS: Position[] = [
  { x: 50, y: 4 }, // top
  { x: 76, y: 18 }, // upper right
  { x: 76, y: 82 }, // lower right
  { x: 50, y: 96 }, // bottom
  { x: 24, y: 72 }, // lower left
  { x: 24, y: 28 }, // upper left
];

// Mobile: no room for a side ring, so labels stack centered above and below the
// molecule (center-anchored → even long archetype names never overflow). Two above,
// two below, well spaced so two visible at once won't touch.
const MOBILE_POSITIONS: Position[] = [
  { x: 50, y: 1 },
  { x: 50, y: 19 },
  { x: 50, y: 81 },
  { x: 50, y: 99 },
];

const IN_MS = 520;
const OUT_MS = 440;
const DESKTOP_MIN_WIDTH = 1280; // matches the `xl` breakpoint used in WHero.

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

type SlotState = { item: Item | null; visible: boolean };

const EMPTY_SLOT: SlotState = { item: null, visible: false };

// Calm static set shown to reduced-motion users (no cycling).
const STATIC_SAMPLE: Item[] = [
  { text: "Authority Conductor", kind: "archetype" },
  { text: "Desire", kind: "dimension" },
  { text: "Tender Devotee", kind: "archetype" },
  { text: "Closeness", kind: "dimension" },
  { text: "Spark Seeker", kind: "archetype" },
  { text: "Openness", kind: "dimension" },
  { text: "Loyal Ritualist", kind: "archetype" },
  { text: "Novelty", kind: "dimension" },
];

const Dot: FC = () => (
  <span
    className="block h-[9px] w-[9px] shrink-0 rounded-[4px]"
    style={{
      backgroundImage: "linear-gradient(105deg,#ff6a3a 0%,#cf5afb 52%,#7d88ff 100%)",
      boxShadow: "0 0 0 4px rgba(207,90,251,0.1)",
    }}
    aria-hidden
  />
);

const Label: FC<{ item: Item }> = ({ item }) =>
  item.kind === "archetype" ? (
    <span className="whitespace-nowrap font-serif text-[clamp(15px,1.4vw,24px)] italic leading-none text-[#161021]">
      {item.text}
    </span>
  ) : (
    <span className="whitespace-nowrap font-sans text-[11px] font-bold uppercase leading-none tracking-[1.6px] text-[#9a96a6]">
      {item.text}
    </span>
  );

const WHeroConstellation: FC<{ className?: string }> = ({ className = "" }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [active, setActive] = useState(false); // in view
  const [slots, setSlots] = useState<Record<number, SlotState>>({});
  const positions = isDesktop ? DESKTOP_POSITIONS : MOBILE_POSITIONS;

  // Responsive position set (setState wrapped in `apply` per the project idiom,
  // so it isn't a synchronous setState in the effect body).
  useEffect(() => {
    const apply = () => setIsDesktop(window.innerWidth >= DESKTOP_MIN_WIDTH);
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  // prefers-reduced-motion (live).
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Activate the cycle only while the hero is on-screen (stops timers once scrolled
  // away, and a display:none copy never intersects so it stays paused).
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const enable = () => setActive(true);
    if (typeof IntersectionObserver === "undefined") {
      enable();
      return;
    }
    const obs = new IntersectionObserver((entries) => setActive(!!entries[0]?.isIntersecting), {
      threshold: 0,
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // The cycling engine: each position runs an independent in → hold → out → gap
  // loop, staggered, drawing from a shared shuffled queue so no label shows twice
  // at once. One pending timer per slot (overwritten each step) → bounded + clean.
  // All setState happens inside setTimeout callbacks (never synchronously in the
  // effect body), so it never triggers cascading renders.
  const itemsRef = useRef<Item[]>([]);
  const cursorRef = useRef(0);
  useEffect(() => {
    if (!active || reduced) return;
    if (itemsRef.current.length === 0) {
      itemsRef.current = shuffle([
        ...ARCHETYPES.map((text) => ({ text, kind: "archetype" as const })),
        ...DIMENSIONS.map((text) => ({ text, kind: "dimension" as const })),
      ]);
    }
    const nextItem = (): Item => {
      const arr = itemsRef.current;
      const it = arr[cursorRef.current % arr.length]!;
      cursorRef.current += 1;
      return it;
    };

    const timers: Record<number, ReturnType<typeof setTimeout>> = {};
    const setSlot = (i: number, patch: Partial<SlotState>) =>
      setSlots((prev) => ({ ...prev, [i]: { ...(prev[i] ?? EMPTY_SLOT), ...patch } }));

    const runSlot = (i: number) => {
      const item = nextItem();
      setSlot(i, { item, visible: false });
      timers[i] = setTimeout(() => {
        setSlot(i, { visible: true }); // fade in
        const hold = 2600 + ((i * 137) % 1100);
        timers[i] = setTimeout(() => {
          setSlot(i, { visible: false }); // fade out
          const gap = 420 + ((i * 211) % 700);
          timers[i] = setTimeout(() => runSlot(i), OUT_MS + gap);
        }, IN_MS + hold);
      }, 40);
    };

    positions.forEach((_, i) => {
      timers[i] = setTimeout(() => runSlot(i), i * 600);
    });
    return () => Object.values(timers).forEach(clearTimeout);
  }, [active, reduced, positions]);

  // Reduced-motion users get a calm static set; everyone else reads live slots.
  const rendered: SlotState[] = positions.map((_, i) =>
    reduced
      ? { item: STATIC_SAMPLE[i % STATIC_SAMPLE.length]!, visible: true }
      : (slots[i] ?? EMPTY_SLOT)
  );

  return (
    <div
      ref={rootRef}
      className={`pointer-events-none relative aspect-square ${className}`}
      aria-hidden
    >
      {/* Molecule + rings + halo (baked into the asset), centered. */}
      <img
        src="/images/white/hero-bg.png"
        alt=""
        className="animate-logo-drift absolute inset-0 h-full w-full object-contain"
      />

      {rendered.map((s, i) => {
        const pos = positions[i]!;
        const isCenter = pos.x === 50;
        const onRight = pos.x > 50;
        // Anchor the dot at (x, y); flow text inward toward the molecule.
        const translate = isCenter
          ? "-translate-x-1/2 -translate-y-1/2"
          : onRight
            ? "-translate-x-full -translate-y-1/2"
            : "-translate-y-1/2";
        const flex = onRight ? "flex-row-reverse" : "flex-row";
        return (
          <div
            key={i}
            className={`absolute ${translate}`}
            style={{ top: `${pos.y}%`, left: `${pos.x}%` }}
          >
            {s.item && (
              <div
                className={`flex items-center gap-2.5 transition-all duration-500 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none ${flex} ${
                  s.visible
                    ? "translate-y-0 scale-100 opacity-100"
                    : "translate-y-[6px] scale-[0.96] opacity-0"
                }`}
              >
                <Dot />
                <Label item={s.item} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default WHeroConstellation;
