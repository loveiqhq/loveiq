"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FC,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

type StageId = "recharging" | "repairing" | "awakening" | "expanding" | "grounded" | "evolving";

interface Stage {
  id: StageId;
  label: string;
  shortLabel: string;
  feels: string;
  focus: string;
  thought: string;
  need: string;
  accent: string;
  eyebrowAccent: string;
}

const STAGES: readonly Stage[] = [
  {
    id: "recharging",
    label: "Recharging / Pausing",
    shortLabel: "Recharging",
    feels: "Quieter, lower-drive, restoring",
    focus: "Rest, nervous system downshift, simplification",
    thought: "Sex feels far away right now.",
    need: "No pressure + recovery",
    accent: "#818cf8",
    eyebrowAccent: "#a5b4fc",
  },
  {
    id: "repairing",
    label: "Repairing / Reconnecting",
    shortLabel: "Repairing",
    feels: "Tender, cautious, sensitive",
    focus: "Healing shame/pain, rebuilding trust, safety in the body",
    thought: "Can I feel safe and open again?",
    need: "Safety, gentleness, repair",
    accent: "#a78bfa",
    eyebrowAccent: "#c4b5fd",
  },
  {
    id: "awakening",
    label: "Awakening / Exploring",
    shortLabel: "Awakening",
    feels: "Curious, warming up, uncertain but alive",
    focus: "Discovering desire, naming preferences, experimenting lightly",
    thought: "What do I actually like?",
    need: "Permission + low-stakes exploration",
    accent: "#c084fc",
    eyebrowAccent: "#d8b4fe",
  },
  {
    id: "expanding",
    label: "Expanding / Experimenting",
    shortLabel: "Expanding",
    feels: "Confident, expressive, more playful",
    focus: "Novelty, communication, co-creating pleasure, skill-building",
    thought: "Let\u2019s try more, what else is possible?",
    need: "Freedom + boundaries + feedback",
    accent: "#e879f9",
    eyebrowAccent: "#f0abfc",
  },
  {
    id: "grounded",
    label: "Grounded / Integrated",
    shortLabel: "Grounded",
    feels: "Steady, familiar, embodied",
    focus: "Consistency, sustainable intimacy, appreciation, rhythm",
    thought: "This works for me.",
    need: "Presence + maintenance + nuance",
    accent: "#f472b6",
    eyebrowAccent: "#f9a8d4",
  },
  {
    id: "evolving",
    label: "Evolving / Transcending",
    shortLabel: "Evolving",
    feels: "Expansive, meaningful, connected beyond the physical",
    focus: "Purpose, intimacy-as-growth, creativity/spirituality, surrender",
    thought: "This is bigger than sex.",
    need: "Integration + grounding + devotion",
    accent: "#fb7185",
    eyebrowAccent: "#fda4af",
  },
];

interface Props {
  userStageLabel: string | null;
}

function resolveUserStageId(userStageLabel: string | null): StageId | null {
  if (!userStageLabel) return null;
  const normalized = userStageLabel.toLowerCase().trim();
  for (const stage of STAGES) {
    if (
      normalized.startsWith(stage.id) ||
      normalized.startsWith(stage.shortLabel.toLowerCase()) ||
      normalized.includes(stage.shortLabel.toLowerCase())
    ) {
      return stage.id;
    }
  }
  return null;
}

const ORBIT_SIZE_PX = 520;
const ORBIT_RING_RADIUS_PCT = 54; // distance of chip centre from orbit centre — slightly outside the circle so chips graze the perimeter, matching Figma.
const MOBILE_ORBIT_DOT_RADIUS_PCT = 47; // dots sit just inside the outermost ring on the mobile mini orbit.

const SexualStageExplorer: FC<Props> = ({ userStageLabel }) => {
  const userStageId = useMemo(() => resolveUserStageId(userStageLabel), [userStageLabel]);
  const initialSelected: StageId = userStageId ?? "awakening";
  const [selectedId, setSelectedId] = useState<StageId>(initialSelected);
  const [hoveredId, setHoveredId] = useState<StageId | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const [isRevealed, setIsRevealed] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    const el = rootRef.current;
    if (!el || isRevealed) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setIsRevealed(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isRevealed]);

  // Mobile carousel
  const carouselRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const orbitIndicatorRef = useRef<HTMLSpanElement>(null);
  const cardSpacingRef = useRef(0);
  const initialMobileIndex = useMemo(() => {
    const idx = STAGES.findIndex((s) => s.id === (userStageId ?? "awakening"));
    return idx >= 0 ? idx : 0;
  }, [userStageId]);
  const [mobileActiveIndex, setMobileActiveIndex] = useState(initialMobileIndex);

  // Smoothly scroll the carousel to a given card index. Used by both the
  // orbit dots and the pager dots so they share one well-behaved code path.
  const scrollCarouselToIndex = useCallback((idx: number) => {
    const carousel = carouselRef.current;
    const card = cardRefs.current[idx];
    if (!carousel || !card) return;
    const offset = card.offsetLeft - (carousel.clientWidth - card.clientWidth) / 2;
    const left = Math.max(0, offset);
    if (typeof carousel.scrollTo === "function") {
      carousel.scrollTo({ left, behavior: "smooth" });
    } else {
      carousel.scrollLeft = left;
    }
  }, []);

  // Continuously rotate the orbit indicator so it tracks the carousel's
  // scroll position 1:1. As scrollLeft moves between two card slots the
  // indicator interpolates smoothly along the perimeter — both for finger
  // swipes and for programmatic smooth-scrolls (orbit/pager dot taps).
  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    const updateIndicator = () => {
      const indicator = orbitIndicatorRef.current;
      if (!indicator) return;
      // Cache card spacing on first measurement.
      if (!cardSpacingRef.current) {
        const card0 = cardRefs.current[0];
        const card1 = cardRefs.current[1];
        if (card0 && card1) {
          cardSpacingRef.current = card1.offsetLeft - card0.offsetLeft;
        }
      }
      const spacing = cardSpacingRef.current;
      if (!spacing) return;
      const fractional = carousel.scrollLeft / spacing;
      const rotationDeg = fractional * 60;
      indicator.style.setProperty("--orbit-rot", `${rotationDeg}deg`);
    };

    let rafId = 0;
    const onScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updateIndicator);
    };

    // Sync initial position once layout is ready.
    onScroll();
    carousel.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      cancelAnimationFrame(rafId);
      carousel.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        let best: IntersectionObserverEntry | null = null;
        for (const entry of entries) {
          if (!best || entry.intersectionRatio > best.intersectionRatio) {
            best = entry;
          }
        }
        if (best && best.intersectionRatio > 0.55) {
          const target = best.target as HTMLElement;
          const idx = Number(target.dataset.cardIndex);
          if (Number.isFinite(idx)) setMobileActiveIndex(idx);
        }
      },
      { root: carousel, threshold: [0.55, 0.75, 0.95] }
    );

    cardRefs.current.forEach((card) => {
      if (card) observer.observe(card);
    });

    return () => observer.disconnect();
  }, []);

  // Centre the user's stage card on first reveal so they see it immediately
  const didInitialScrollRef = useRef(false);
  useEffect(() => {
    if (!isRevealed || didInitialScrollRef.current) return;
    didInitialScrollRef.current = true;
    if (!userStageId) return;
    const idx = STAGES.findIndex((s) => s.id === userStageId);
    if (idx < 0) return;
    const carousel = carouselRef.current;
    const card = cardRefs.current[idx];
    if (!carousel || !card) return;
    const offset = card.offsetLeft - (carousel.clientWidth - card.clientWidth) / 2;
    if (typeof carousel.scrollTo === "function") {
      carousel.scrollTo({ left: Math.max(0, offset), behavior: "auto" });
    } else {
      carousel.scrollLeft = Math.max(0, offset);
    }
  }, [isRevealed, userStageId]);

  // The user's current stage (or a sensible fallback) is always rendered as
  // the large card at the top of the orbit. Hovering/selecting other chips
  // swaps the detail card content without changing this anchor.
  const anchorStageId: StageId = userStageId ?? "awakening";
  // STAGES has 6 entries; index 2 always exists. Both branches return Stage, never undefined.
  const anchorStage: Stage = STAGES.find((s) => s.id === anchorStageId) ?? STAGES[2]!;
  const ringStages = useMemo(() => STAGES.filter((s) => s.id !== anchorStageId), [anchorStageId]);

  // Order around the orbit, going clockwise from top: anchor first, then the
  // five remaining stages in their natural array order.
  const orbitOrder = useMemo<readonly Stage[]>(
    () => [anchorStage, ...ringStages],
    [anchorStage, ringStages]
  );

  const onChipKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
      const isLeft = e.key === "ArrowLeft" || e.key === "ArrowUp";
      const isRight = e.key === "ArrowRight" || e.key === "ArrowDown";
      if (!isLeft && !isRight) return;
      e.preventDefault();
      const dir = isRight ? 1 : -1;
      const nextIdx = (currentIndex + dir + orbitOrder.length) % orbitOrder.length;
      // nextIdx is mod orbitOrder.length, so the lookup is always defined.
      const nextId = orbitOrder[nextIdx]!.id;
      setSelectedId(nextId);
      const root = rootRef.current;
      if (!root) return;
      const nextChip = root.querySelector<HTMLButtonElement>(`[data-chip-id="${nextId}"]`);
      nextChip?.focus();
    },
    [orbitOrder]
  );

  const userStage = userStageId ? (STAGES.find((s) => s.id === userStageId) ?? null) : null;

  return (
    <div
      ref={rootRef}
      className={`stage-explorer${isRevealed ? " is-revealed" : ""}`}
      data-user-stage-id={userStageId ?? ""}
    >
      {/* Desktop: orbit only. The static "Your Likely Stage" card above the
          orbit (rendered by SexualStageSection) replaces the old detail card. */}
      <div className="stage-explorer__desktop">
        <div className="stage-explorer__orbit-wrap">
          <div
            className="stage-explorer__orbit"
            style={{ "--orbit-size": `${ORBIT_SIZE_PX}px` } as CSSProperties}
          >
            <span className="stage-explorer__ring stage-explorer__ring--outer" aria-hidden="true" />
            <span className="stage-explorer__ring stage-explorer__ring--mid" aria-hidden="true" />
            <span className="stage-explorer__ring stage-explorer__ring--inner" aria-hidden="true" />

            <div className="stage-explorer__center">
              <CycleIcon />
              <p className="stage-explorer__center-caption">
                If you want to check out other stages, hover over each of them to reveal info that
                is connected to that stage.
              </p>
            </div>

            {/* Anchor (user's current stage) — large card at top */}
            <button
              key={anchorStage.id}
              type="button"
              data-chip-id={anchorStage.id}
              className={`stage-explorer__chip stage-explorer__chip--anchor${
                selectedId === anchorStage.id ? " is-selected" : ""
              }${userStage ? " is-user-stage" : ""}`}
              style={
                {
                  "--chip-accent": anchorStage.accent,
                  "--chip-eyebrow-accent": anchorStage.eyebrowAccent,
                  "--chip-delay": "0ms",
                } as CSSProperties
              }
              aria-pressed={selectedId === anchorStage.id}
              aria-label={`${anchorStage.label}${userStage ? " — your current stage" : ""}`}
              onClick={() => setSelectedId(anchorStage.id)}
              onMouseEnter={() => setHoveredId(anchorStage.id)}
              onMouseLeave={() => setHoveredId(null)}
              onFocus={() => setHoveredId(anchorStage.id)}
              onBlur={() => setHoveredId(null)}
              onKeyDown={(e) => onChipKeyDown(e, 0)}
            >
              {userStage ? (
                <span className="stage-explorer__chip-eyebrow">YOUR LIKELY CURRENT STAGE</span>
              ) : null}
              <span className="stage-explorer__chip-row">
                <span className="stage-explorer__chip-dot" aria-hidden="true" />
                <span className="stage-explorer__chip-title">{anchorStage.label}</span>
              </span>
            </button>

            {/* Ring stages — single-line pills around the perimeter that
                expand vertically in place on hover/focus to reveal the
                stage's detail rows + need block, while the four un-hovered
                siblings dim to focus attention. */}
            {ringStages.map((stage, ringIdx) => {
              const positionIndex = ringIdx + 1; // 1..5 (anchor occupies 0)
              // Distribute the five ring chips evenly across the bottom 300°
              // of the circle, leaving the anchor's slot at the top free.
              // Angles measured clockwise from top (12 o'clock = 0°).
              const angleDegFromTop = 60 * positionIndex;
              // Convert to standard math angle (counter-clockwise from +x axis).
              const angleRad = ((angleDegFromTop - 90) * Math.PI) / 180;
              const x = 50 + ORBIT_RING_RADIUS_PCT * Math.cos(angleRad);
              const y = 50 + ORBIT_RING_RADIUS_PCT * Math.sin(angleRad);
              const isSelected = selectedId === stage.id;
              const isHovered = hoveredId === stage.id;
              const isExpanded = isHovered || isSelected;
              const slotStyle = {
                left: `${x}%`,
                top: `${y}%`,
                "--chip-accent": stage.accent,
                "--chip-eyebrow-accent": stage.eyebrowAccent,
                "--chip-delay": `${positionIndex * 70}ms`,
              } as CSSProperties;

              return (
                <div
                  key={stage.id}
                  className="stage-explorer__chip-slot"
                  style={slotStyle}
                  onMouseEnter={() => setHoveredId(stage.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <button
                    type="button"
                    data-chip-id={stage.id}
                    className={`stage-explorer__chip${isSelected ? " is-selected" : ""}${
                      isExpanded ? " is-expanded" : ""
                    }`}
                    aria-pressed={isSelected}
                    aria-expanded={isExpanded}
                    aria-label={stage.label}
                    onClick={() => setSelectedId(stage.id)}
                    onFocus={() => setHoveredId(stage.id)}
                    onBlur={() => setHoveredId(null)}
                    onKeyDown={(e) => onChipKeyDown(e, positionIndex)}
                  >
                    <span className="stage-explorer__chip-row">
                      <span className="stage-explorer__chip-dot" aria-hidden="true" />
                      <span className="stage-explorer__chip-title">{stage.label}</span>
                    </span>
                    <span className="stage-explorer__chip-detail" aria-hidden={!isExpanded}>
                      <span className="stage-explorer__chip-rows">
                        <span className="stage-explorer__chip-rows-row">
                          <span className="stage-explorer__chip-rows-label">How it Feels</span>
                          <span className="stage-explorer__chip-rows-value">{stage.feels}</span>
                        </span>
                        <span className="stage-explorer__chip-rows-row">
                          <span className="stage-explorer__chip-rows-label">
                            What You&rsquo;re Focused On
                          </span>
                          <span className="stage-explorer__chip-rows-value">{stage.focus}</span>
                        </span>
                        <span className="stage-explorer__chip-rows-row">
                          <span className="stage-explorer__chip-rows-label">Common Thought</span>
                          <span className="stage-explorer__chip-rows-value">
                            &ldquo;{stage.thought}&rdquo;
                          </span>
                        </span>
                      </span>
                      <span className="stage-explorer__chip-need">
                        <span className="stage-explorer__chip-need-label">Main Need Right Now</span>
                        <span className="stage-explorer__chip-need-value">{stage.need}</span>
                      </span>
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Mobile: pill header → heading → mini orbit → card carousel → pager */}
      <div className="stage-explorer__mobile">
        <div className="stage-explorer__mobile-pill" aria-live={userStage ? "polite" : "off"}>
          {userStage ? (
            <>
              <span className="stage-explorer__mobile-pill-eyebrow">YOUR CURRENT STAGE</span>
              <span className="stage-explorer__mobile-pill-value">{userStage.label}</span>
            </>
          ) : (
            <span className="stage-explorer__mobile-pill-value">Explore the 6 sexual stages</span>
          )}
        </div>

        <h3 className="stage-explorer__mobile-heading">Explore other sexual stages</h3>

        {/* Mini orbit — six dots distribute around the perimeter; the dot
            that matches the carousel's currently-visible card is enlarged
            and highlighted. As the user swipes through the cards, the
            highlight hops clockwise from one dot to the next. */}
        <div className="stage-explorer__mobile-orbit" aria-hidden="true">
          <span className="stage-explorer__ring stage-explorer__ring--outer" />
          <span className="stage-explorer__ring stage-explorer__ring--mid" />
          <span className="stage-explorer__ring stage-explorer__ring--inner" />

          <div className="stage-explorer__mobile-orbit-center">
            <CycleIcon />
            <p>Flip the below cards to explore other sexual stages.</p>
          </div>

          {STAGES.map((stage, idx) => {
            const angleDeg = -90 + idx * 60;
            const angleRad = (angleDeg * Math.PI) / 180;
            const x = 50 + MOBILE_ORBIT_DOT_RADIUS_PCT * Math.cos(angleRad);
            const y = 50 + MOBILE_ORBIT_DOT_RADIUS_PCT * Math.sin(angleRad);
            return (
              <button
                key={stage.id}
                type="button"
                className="stage-explorer__mobile-orbit-dot"
                style={
                  {
                    left: `${x}%`,
                    top: `${y}%`,
                    "--dot-accent": stage.accent,
                  } as CSSProperties
                }
                aria-label={`Show ${stage.label}`}
                onClick={() => scrollCarouselToIndex(idx)}
              />
            );
          })}

          {/* Smooth indicator that rides the orbit perimeter, driven by the
              carousel's scrollLeft so it always matches what the user sees. */}
          <span
            ref={orbitIndicatorRef}
            className="stage-explorer__mobile-orbit-indicator"
            aria-hidden="true"
          />
        </div>

        <div
          ref={carouselRef}
          className="stage-explorer__carousel"
          role="region"
          aria-roledescription="carousel"
          aria-label="Sexual stages"
        >
          <div className="stage-explorer__carousel-track">
            {STAGES.map((stage, idx) => {
              const isUserStage = userStageId === stage.id;
              const isActive = mobileActiveIndex === idx;
              const cardStyle = {
                "--card-accent": stage.accent,
                "--card-eyebrow-accent": stage.eyebrowAccent,
              } as CSSProperties;

              return (
                <article
                  key={stage.id}
                  ref={(el) => {
                    cardRefs.current[idx] = el;
                  }}
                  className={`stage-card${isActive ? " is-active" : ""}${
                    isUserStage ? " is-user-stage" : ""
                  }`}
                  data-card-index={idx}
                  aria-roledescription="slide"
                  aria-label={`${stage.label} (${idx + 1} of ${STAGES.length})`}
                  style={cardStyle}
                >
                  <header className="stage-card__header">
                    <span className="stage-card__dot" aria-hidden="true" />
                    <h4 className="stage-card__title">{stage.label}</h4>
                    {isUserStage ? <span className="stage-card__current">CURRENT</span> : null}
                  </header>
                  <StageRows stage={stage} />
                  <div className="stage-card__need">
                    <span className="stage-card__need-label">Main Need Right Now</span>
                    <span className="stage-card__need-value">{stage.need}</span>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div className="stage-explorer__pager" role="tablist" aria-label="Stage carousel pages">
          {STAGES.map((stage, idx) => {
            const isActive = mobileActiveIndex === idx;
            return (
              <Fragment key={stage.id}>
                {idx > 0 ? (
                  <span className="stage-explorer__pager-line" aria-hidden="true" />
                ) : null}
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-label={`Show ${stage.label}`}
                  className={`stage-explorer__pager-dot${isActive ? " is-active" : ""}`}
                  onClick={() => scrollCarouselToIndex(idx)}
                />
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const StageRows: FC<{ stage: Stage }> = ({ stage }) => (
  <dl className="stage-rows">
    <div className="stage-rows__row">
      <dt>How it Feels</dt>
      <dd>{stage.feels}</dd>
    </div>
    <div className="stage-rows__row">
      <dt>{"What You\u2019re Focused On"}</dt>
      <dd>{stage.focus}</dd>
    </div>
    <div className="stage-rows__row">
      <dt>Common Thought</dt>
      <dd>&ldquo;{stage.thought}&rdquo;</dd>
    </div>
  </dl>
);

const CycleIcon: FC = () => (
  <svg
    className="stage-explorer__center-icon"
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    aria-hidden="true"
  >
    <path d="M2 8a6 6 0 0 1 10.5-3.9" strokeLinecap="round" />
    <path d="M14 8a6 6 0 0 1-10.5 3.9" strokeLinecap="round" />
    <path d="M11.5 1.5l1 2.6-2.6 1" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4.5 14.5l-1-2.6 2.6-1" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default SexualStageExplorer;
