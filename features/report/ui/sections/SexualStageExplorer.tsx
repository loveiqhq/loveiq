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
import { resolveStageId, STAGES, type Stage, type StageId } from "@/data/report2-stages";

/**
 * A chip in the wheel: one of the six canonical stages, or `your-stage` — the
 * reader's own stage phrase when it is not one of the six.
 */
type ChipId = StageId | "your-stage";

interface Props {
  userStageLabel: string | null;
}

const ORBIT_SIZE_PX = 520;
const ORBIT_RING_RADIUS_PCT = 54; // distance of chip centre from orbit centre — slightly outside the circle so chips graze the perimeter, matching Figma.
// Extra ring radius for chips low in the circle when a sixth chip has to fit —
// see the `lowness` note at the ring's placement.
const CROWDED_RING_EXTRA_PCT = 10;
const MOBILE_ORBIT_DOT_RADIUS_PCT = 47; // dots sit just inside the outermost ring on the mobile mini orbit.

const SexualStageExplorer: FC<Props> = ({ userStageLabel }) => {
  const userStageId = useMemo(() => resolveStageId(userStageLabel), [userStageLabel]);
  /**
   * The reader's stage EXACTLY as the copy matrix words it — "Deepening /
   * Balancing", "Rooting / Sustaining", "Leading / Opening". Ten of the fourteen
   * archetypes carry a phrase that is not one of the six canonical stages, so
   * `resolveStageId` returns null for them and the anchor used to fall back to
   * "Awakening / Exploring": the wheel marked a stage the reader is not in, one
   * card below the card naming the stage they are.
   *
   * Figma 8435:688 settles it — that node is still NAMED "3. Awakening (Current
   * Active Stage)" from the template but its text reads "Evolving / Transcending",
   * the sample archetype's own phrase, under the "YOUR likely CURRENT STAGE"
   * eyebrow. The anchor carries the reader's words, whatever they are.
   */
  const userStageName = userStageLabel?.trim() || null;
  const anchorId: ChipId = userStageId ?? (userStageName ? "your-stage" : "awakening");
  const [selectedId, setSelectedId] = useState<ChipId>(anchorId);
  const [hoveredId, setHoveredId] = useState<ChipId | null>(null);

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
    // Only when the reader's stage IS one of the six; otherwise the carousel is a
    // plain explainer and opens at the first stage rather than on a card that
    // isn't theirs.
    if (!userStageId) return 0;
    const idx = STAGES.findIndex((s) => s.id === userStageId);
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

  // The reader's stage is always the large chip at the top of the orbit.
  // Hovering/selecting other chips swaps their detail without moving this anchor.
  // STAGES has 6 entries; index 2 always exists, so both branches return a Stage.
  const anchorStyleStage: Stage = STAGES.find((s) => s.id === userStageId) ?? STAGES[2]!;
  const anchorLabel = userStageName ?? anchorStyleStage.label;
  // A ring chip is dropped only when the ANCHOR occupies that canonical stage —
  // it would otherwise appear twice (and, with no stage at all, the anchor's
  // "awakening" fallback would collide with awakening's own ring chip). When the
  // reader's phrase is its own, `anchorId` is `your-stage` and all six canonical
  // stages stay on the ring: none of the model is withheld to make room.
  const ringStages = useMemo(() => STAGES.filter((s) => s.id !== anchorId), [anchorId]);

  // Order around the orbit, going clockwise from top: anchor first, then the
  // remaining stages in their natural array order.
  const orbitOrder = useMemo<readonly ChipId[]>(
    () => [anchorId, ...ringStages.map((s) => s.id)],
    [anchorId, ringStages]
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
      const nextId = orbitOrder[nextIdx]!;
      setSelectedId(nextId);
      const root = rootRef.current;
      if (!root) return;
      const nextChip = root.querySelector<HTMLButtonElement>(`[data-chip-id="${nextId}"]`);
      nextChip?.focus();
    },
    [orbitOrder]
  );

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
          {/* `--crowded` when a sixth chip has to share the ring: the reader's own
              phrase holds the anchor and no canonical stage is displaced, so the
              two chips nearest the bottom sit 50° apart and need narrower pills to
              clear each other (see the CSS rule of the same name). */}
          <div
            className={`stage-explorer__orbit${
              ringStages.length > 5 ? " stage-explorer__orbit--crowded" : ""
            }`}
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

            {/* Anchor (the reader's own stage) — large card at top */}
            <button
              key={anchorId}
              type="button"
              data-chip-id={anchorId}
              className={`stage-explorer__chip stage-explorer__chip--anchor${
                selectedId === anchorId ? " is-selected" : ""
              }${userStageName ? " is-user-stage" : ""}`}
              style={
                {
                  "--chip-accent": anchorStyleStage.accent,
                  "--chip-eyebrow-accent": anchorStyleStage.eyebrowAccent,
                  "--chip-delay": "0ms",
                } as CSSProperties
              }
              aria-pressed={selectedId === anchorId}
              aria-label={`${anchorLabel}${userStageName ? " — your current stage" : ""}`}
              onClick={() => setSelectedId(anchorId)}
              onMouseEnter={() => setHoveredId(anchorId)}
              onMouseLeave={() => setHoveredId(null)}
              onFocus={() => setHoveredId(anchorId)}
              onBlur={() => setHoveredId(null)}
              onKeyDown={(e) => onChipKeyDown(e, 0)}
            >
              {userStageName ? (
                <span className="stage-explorer__chip-eyebrow">YOUR LIKELY CURRENT STAGE</span>
              ) : null}
              <span className="stage-explorer__chip-row">
                <span className="stage-explorer__chip-dot" aria-hidden="true" />
                <span className="stage-explorer__chip-title">{anchorLabel}</span>
              </span>
            </button>

            {/* Ring stages — single-line pills around the perimeter that
                expand vertically in place on hover/focus to reveal the
                stage's detail rows + need block, while the four un-hovered
                siblings dim to focus attention. */}
            {ringStages.map((stage, ringIdx) => {
              const positionIndex = ringIdx + 1; // 1..N (anchor occupies 0)
              // Distribute the ring chips evenly across the bottom 300° of the
              // circle, leaving the anchor's slot at the top free. Angles measured
              // clockwise from top (12 o'clock = 0°). Five chips land on the
              // design's 60° spacing; six (when the reader's own phrase takes the
              // anchor and no canonical stage is displaced) land on 50°.
              const angleDegFromTop = (300 / ringStages.length) * positionIndex;
              // Convert to standard math angle (counter-clockwise from +x axis).
              const angleRad = ((angleDegFromTop - 90) * Math.PI) / 180;
              // At six chips the two nearest the bottom sit ~51° apart, and at the
              // design's radius their pills overlapped by 64px. Chips low in the
              // circle push outward, where the same angle buys more horizontal
              // separation; 0 at the top, full at the bottom, and untouched in the
              // five-chip case that matches the design.
              const lowness = Math.max(0, -Math.cos((angleDegFromTop * Math.PI) / 180));
              const radius =
                ORBIT_RING_RADIUS_PCT +
                (ringStages.length > 5 ? CROWDED_RING_EXTRA_PCT * lowness : 0);
              const x = 50 + radius * Math.cos(angleRad);
              const y = 50 + radius * Math.sin(angleRad);
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
        <div className="stage-explorer__mobile-pill" aria-live={userStageName ? "polite" : "off"}>
          {userStageName ? (
            <>
              <span className="stage-explorer__mobile-pill-eyebrow">YOUR CURRENT STAGE</span>
              {/* Their phrase, not the nearest canonical stage — the ten
                  archetypes whose stage is its own read the generic explainer
                  line here before, while desktop showed them a wrong stage. */}
              <span className="stage-explorer__mobile-pill-value">{userStageName}</span>
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
