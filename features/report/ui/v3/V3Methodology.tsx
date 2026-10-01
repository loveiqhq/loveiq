"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type FC } from "react";
import { REPORT_V4_CLOSING } from "@/data/report3-archetype-page";
import PagerChevron from "./PagerChevron";
import useSciPager from "./useSciPager";
import V4Runs from "./V4Runs";

/**
 * "WHAT SHAPED THIS REPORT / Methodology" — Figma 10392:18465.
 *
 * Universal, archetype-independent content: the eyebrow + heading + intro, a
 * horizontally-scrolled deck of seven science cards (10360:9879, each linking to
 * the chapters it feeds), a pagination dot row, and three source cards.
 *
 * From 700px V4's deck is a gallery (Mark's desktop review, 28.09): one row of tiles
 * sized so two and a half are in view (never under 1.25x the phone's), the third cut by
 * the column's edge, and a pager under it (useSciPager).
 * The phone keeps its dot row, which only reports; the pager is drawn nowhere else.
 */

interface ScienceCard {
  /** Accent, taken from the stroke baked into each card's exported icon —
   * which independently matched a pixel sample of every card's top rule. */
  accent: string;
  icon: string;
  n: string;
  title: string;
  question: string;
  /** Report V4's own wording of the question (1:222 and siblings, 493:7082). */
  questionV4?: string;
  chapters: string[];
  /** Report V4's own chapter list, where it differs (493:7082). */
  chaptersV4?: string[];
}

/** 10360:9880 … 10360:10068, transcribed from the frame. */
const CARDS: readonly ScienceCard[] = [
  {
    accent: "#fe6839",
    icon: "neuroscience",
    n: "01",
    title: "Neuroscience",
    question: "What happens in the brain when you feel desire?",
    chapters: ["Reward System", "Arousal Style", "Energy & Risk"],
  },
  {
    accent: "#8887f6",
    icon: "psychology",
    n: "02",
    title: "Psychology",
    question: "Which beliefs about sex do you hold that you never chose?",
    chapters: ["Typical Beliefs", "Core Insecurities"],
  },
  {
    accent: "#ff3d76",
    icon: "attachment-research",
    n: "03",
    title: "Attachment research",
    question: "How you connect in relationships and what throws you off?",
    questionV4: "How does emotional security shape desire and intimacy?",
    chapters: ["Attachment Style", "Challenges in Partnership"],
    chaptersV4: ["Attachment Style"],
  },
  {
    accent: "#2fbfba",
    icon: "sexology",
    n: "04",
    title: "Sexology",
    question: "How does arousal actually work, and why is it different from desire or pleasure?",
    questionV4: "How does arousal actually work?",
    chapters: ["Initiation Style", "Fantasy vs. Reality"],
  },
  {
    accent: "#c36ddf",
    icon: "behavioral-science",
    n: "05",
    title: "Behavioral science",
    question: "Why do habits often overwrite intentions? How do we break through self-sabotage?",
    // The frame reads "Why habits beat intentions?dasdads"; the tail is stray typing.
    questionV4: "Why habits beat intentions?",
    chapters: ["Accelerators & Brakes", "Libido Challenges"],
  },
  {
    accent: "#ff9450",
    icon: "relationship-research",
    n: "06",
    title: "Relationship research",
    question: "What keeps intimacy and desire alive over years?",
    // Sanjin's 25.09 rewrite (493:7233), after reading the mobile staging.
    questionV4: "How do relationship dynamics shape desire, intimacy, and connection?",
    chapters: ["Love Language", "Growth Potentials"],
    // Plural, as V4 titles the chapter (38:1675); V3's tile above keeps the singular.
    chaptersV4: ["Love Language", "Challenges in Partnerships"],
  },
  {
    accent: "#6b6678",
    icon: "therapy-rooms",
    n: "07",
    title: "Therapy rooms",
    question:
      "What do decades in the room teach? What are 3 practical ways to keep intimacy intact?",
    questionV4: "What have decades of clinical practice taught us about desire and intimacy?",
    chapters: ["Reading Recommendations"],
  },
];

/**
 * Report V4's order (493:7082, 2026-09-24): Relationship research and Attachment
 * research trade places. `?v3=1` keeps CARDS as they are.
 */
const V4_ORDER = [
  "Neuroscience",
  "Psychology",
  "Relationship research",
  "Sexology",
  "Behavioral science",
  "Attachment research",
  "Therapy rooms",
] as const;
const CARDS_V4: readonly ScienceCard[] = V4_ORDER.map((title) =>
  CARDS.find((c) => c.title === title)!
);

/** 10392:18700 — the three source cards under the deck. */
const SOURCES: readonly { title: string; body: string }[] = [
  {
    title: "Hundreds of papers",
    body: "peer reviewed from a variety of scientific fields",
  },
  {
    title: "Clinical models",
    body: "what therapists rely on and their practical pointers",
  },
  {
    title: "Foundational books",
    body: "the texts experts return to and their main insights",
  },
];

interface Props {
  /**
   * "full" (the default) renders the section exactly as `?v3=1` does today, heading
   * and intro included — do not change that default, it is the live V3 report.
   *
   * "deck" is Report V4's 1:195, which is the card deck, the source cards and a
   * plain closing paragraph only: V4 promotes this section's heading and intro into
   * their own collapsible chapter (1:185), so rendering them here too duplicates
   * them, and V4's closing paragraph (1:480) carries no bold.
   */
  chrome?: "full" | "deck";
}

const V3Methodology: FC<Props> = ({ chrome = "full" }) => {
  const deck = chrome === "deck";
  const cards = deck ? CARDS_V4 : CARDS;
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const trackId = useId();
  const pager = useSciPager(trackRef, cards.length, deck);
  // Desktop review 01.10 (Mark: "Can we make the hidden tile clickable so that it moves
  // into view?"): which tiles the frame cuts, read off the track once a frame.
  const [cut, setCut] = useState<readonly boolean[]>([]);

  useEffect(() => {
    const el = trackRef.current;
    if (!deck || !el) return;
    let frame = 0;
    let queued = false;
    const read = () => {
      queued = false;
      const box = el.getBoundingClientRect();
      const from = box.left + el.clientLeft;
      const to = from + el.clientWidth;
      const next = Array.from(el.querySelectorAll<HTMLElement>(".rv3-sci__card"), (card) => {
        const r = card.getBoundingClientRect();
        return r.left < from - 1 || r.left + r.width > to + 1;
      });
      setCut((prev) =>
        prev.length === next.length && prev.every((c, i) => c === next[i]) ? prev : next
      );
    };
    const onChange = () => {
      if (queued) return;
      queued = true;
      frame = requestAnimationFrame(read);
    };
    el.addEventListener("scroll", onChange, { passive: true });
    const resize = typeof ResizeObserver === "function" ? new ResizeObserver(onChange) : null;
    resize?.observe(el);
    onChange();
    return () => {
      el.removeEventListener("scroll", onChange);
      resize?.disconnect();
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
    };
  }, [deck]);

  /**
   * A cut tile glides to the nearest stop that shows it whole: the next one for a tile
   * cut on the right, the one before for a tile cut on the left. Mouse and touch only;
   * the pager below stays the keyboard path, so the tile takes no tab stop.
   */
  const reveal = (index: number) => {
    const el = trackRef.current;
    const card = el?.querySelectorAll<HTMLElement>(".rv3-sci__card")[index];
    if (!el || !card) return;
    const box = el.getBoundingClientRect();
    const r = card.getBoundingClientRect();
    const left = el.scrollLeft + r.left - box.left - el.clientLeft;
    const right = left + r.width;
    const whole = (at: number) => left >= at - 1 && right <= at + el.clientWidth + 1;
    if (whole(el.scrollLeft)) return;
    let best = -1;
    pager.stops.forEach((stop, k) => {
      if (!Number.isFinite(stop.left) || !whole(stop.left)) return;
      const nearer =
        best < 0 ||
        Math.abs(stop.left - el.scrollLeft) < Math.abs(pager.stops[best]!.left - el.scrollLeft);
      if (nearer) best = k;
    });
    if (best >= 0) pager.goTo(best);
  };

  // The dot row reflects which card is nearest the scroller's left edge.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onScroll = () => {
      const cards = el.querySelectorAll<HTMLElement>(".rv3-sci__card");
      if (!cards.length) return;
      // At maximum scroll the last card cannot reach the snap edge — the track's
      // trailing padding is smaller than the gap it would need — so "nearest to the
      // edge" keeps naming the second-to-last one while the last is fully in view.
      // Being at the end IS being on the last card, whatever the geometry says.
      if (el.scrollLeft >= el.scrollWidth - el.clientWidth - 2) {
        setActive(cards.length - 1);
        return;
      }
      // Measure against the scroller's own left edge, not `offsetLeft`.
      // `offsetLeft` is relative to the nearest POSITIONED ancestor — which here is
      // usually <body>, so it silently carries the page's own x-offset. That
      // cancels out in a full-bleed mobile column but not in any centred layout,
      // where every card reads hundreds of pixels too far right and the dots stick
      // on the first one. Bounding rects are already scroll-relative, so this is
      // correct wherever the deck is placed.
      const trackLeft = el.getBoundingClientRect().left;
      let nearest = 0;
      let best = Infinity;
      cards.forEach((c, i) => {
        const d = Math.abs(c.getBoundingClientRect().left - trackLeft);
        if (d < best) {
          best = d;
          nearest = i;
        }
      });
      setActive(nearest);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section
      className={`rv3-method${chrome === "deck" ? " is-v4" : ""}`}
      data-node-id={chrome === "deck" ? "1:195" : "10392:18465"}
    >
      {/* One serif heading. The designer removed the coral "WHAT SHAPED THIS
          REPORT" eyebrow AND the separate "Methodology" heading on 2026-09-05;
          the section now opens straight into this. */}
      {chrome === "full" ? (
        <>
          <h2 className="rv3-method__heading" data-node-id="10392:18469">
            What shaped this report
          </h2>
          <p className="rv3-prose rv3-method__intro" data-node-id="10392:18471">
            To support self-understanding, we combined insights from multiple disciplines such as
            neuroscience, psychology and relationship research alongside insights from decades of
            therapeutic experience.
          </p>
        </>
      ) : null}

      <div className="rv3-sci" data-node-id="10360:9879">
        <div className="rv3-sci__track" ref={trackRef} id={deck ? trackId : undefined}>
          {cards.map((card, i) => (
            <article
              key={card.title}
              className={`rv3-sci__card${deck && cut[i] ? " is-cut" : ""}`}
              style={{ "--rv3-accent": card.accent } as CSSProperties}
              onClick={deck && cut[i] ? () => reveal(i) : undefined}
            >
              {chrome === "full" ? <span className="rv3-sci__rule" aria-hidden="true" /> : null}
              <header className="rv3-sci__head">
                {/* Figma's own exported vector, tinted via a CSS mask. An
                    <img>-loaded SVG cannot see `currentColor`, so masking is what
                    lets one file carry every card's accent. */}
                <span className="rv3-sci__icon" aria-hidden="true">
                  <span
                    className="rv3-sci__glyph"
                    style={
                      { "--rv3-glyph": `url(/report/v3/science/${card.icon}.svg)` } as CSSProperties
                    }
                  />
                </span>
                {/* 1:204 — V4 sets the title beside the icon and drops the number. */}
                {chrome === "deck" ? (
                  <h3 className="rv3-sci__title">{card.title}</h3>
                ) : (
                  <span className="rv3-sci__n">{card.n}</span>
                )}
              </header>
              {chrome === "full" ? <h3 className="rv3-sci__title">{card.title}</h3> : null}
              <p className="rv3-sci__q">
                {chrome === "deck" ? (card.questionV4 ?? card.question) : card.question}
              </p>
              {/* 1:225 — sentence case in V4, against V3's small-caps label. Mark, 28.09
                  (1943960826): "changed the copy … to simply 'More in chapter'". */}
              <p className="rv3-sci__label">
                {chrome === "deck" ? "More in chapter" : "read this in CHAPTER:"}
              </p>
              <ul className="rv3-sci__list">
                {((chrome === "deck" && card.chaptersV4) || card.chapters).map((c) => (
                  <li key={c}>
                    <span className="rv3-sci__bullet" aria-hidden="true" />
                    {c}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        {/* Desktop review 01.10, Mark: "have the arrows also in the middle height of the
         * hidden tile? So that it is clear that you can navigate through that." Where the
         * next tile sits wholly past the frame (1440, measured) there is no sliver to
         * click, so an arrow at the tiles' middle says there is more. Mouse shortcuts, as
         * the cut tile is: the pager row below is the keyboard path. */}
        {deck && pager.stops.length > 1 ? (
          <>
            {(pager.held ?? pager.at) > 0 ? (
              <button
                type="button"
                className="rv3-sci__edge is-prev"
                aria-hidden="true"
                tabIndex={-1}
                onClick={() => pager.step(-1)}
              >
                <PagerChevron back />
              </button>
            ) : null}
            {(pager.held ?? pager.at) < pager.stops.length - 1 ? (
              <button
                type="button"
                className="rv3-sci__edge is-next"
                aria-hidden="true"
                tabIndex={-1}
                onClick={() => pager.step(1)}
              >
                <PagerChevron />
              </button>
            ) : null}
          </>
        ) : null}
        <div className="rv3-sci__dots" aria-hidden="true">
          {cards.map((c, i) => (
            <span key={c.title} className={i === active ? "is-active" : ""} />
          ))}
        </div>
        {/* The desktop gallery's pager: hidden on the phone and in the 393 preview. The
         * arrows stay focusable at the ends (aria-disabled), so a keyboard keeps its place. */}
        {deck && pager.stops.length > 1 ? (
          <div className="rv3-sci__nav" role="group" aria-label="Science cards">
            <button
              type="button"
              className="rv3-sci__arrow"
              aria-label="Previous card"
              aria-controls={trackId}
              aria-disabled={pager.at <= 0 || undefined}
              onClick={() => pager.step(-1)}
            >
              <PagerChevron back />
            </button>
            <div className="rv3-sci__pips">
              {pager.stops.map((stop, k) => (
                <button
                  key={stop.card}
                  type="button"
                  className={`rv3-sci__pip${k === pager.at ? " is-active" : ""}`}
                  aria-label={`Show ${cards[stop.card]!.title}`}
                  aria-current={k === pager.at ? "true" : undefined}
                  aria-controls={trackId}
                  onClick={() => pager.goTo(k)}
                />
              ))}
            </div>
            <button
              type="button"
              className="rv3-sci__arrow"
              aria-label="Next card"
              aria-controls={trackId}
              aria-disabled={pager.at >= pager.stops.length - 1 || undefined}
              onClick={() => pager.step(1)}
            >
              <PagerChevron />
            </button>
          </div>
        ) : null}
      </div>

      {/* V4 draws no source tiles: since 30.09 they are the pre-report wizard's first
       * slide (Figma 1049:1191), and 1:195 hides its own (1:450). */}
      {chrome === "full" ? (
        <div className="rv3-src" data-node-id="10392:18700">
          {SOURCES.map((s) => (
            <div key={s.title} className="rv3-src__card">
              <p className="rv3-src__title">{s.title}</p>
              <p className="rv3-src__body">{s.body}</p>
            </div>
          ))}
        </div>
      ) : null}

      {/* 10392:18726 / V4 1:480. V4 carries its own wording and bold runs now
       * (REPORT_V4_CLOSING); the V3 outro below is the live `?v3=1` copy. */}
      <div
        className="rv3-prose rv3-method__outro"
        data-node-id={chrome === "deck" ? "1:480" : "10392:18726"}
      >
        {chrome === "deck" ? (
          REPORT_V4_CLOSING.map((runs, i) => (
            <p key={i}>
              <V4Runs runs={runs} />
            </p>
          ))
        ) : (
          <>
            <p>
              We translate this knowledge into clear and understandable patterns that people can
              recognise in themselves.
            </p>
            <p>
              This report is a <strong>psychometric approximation.</strong> It does not describe you
              in a fixed or absolute way, but highlights{" "}
              <strong>
                tendencies, patterns, and possible directions of your personality and sexual
                identity.
              </strong>
            </p>
            <p>
              With that in mind, it&rsquo;s time to dive into your{" "}
              <strong>personalized LoveIQ report.</strong>
            </p>
          </>
        )}
      </div>

      {/* 10392:18729 is V3's. V4 draws its hairline at the top of Part II instead
       * (1:484), directly above the part heading, not under this paragraph. */}
      {chrome === "full" ? (
        <div className="rv3-method__rule" aria-hidden="true" data-node-id="10392:18729" />
      ) : null}
    </section>
  );
};

export default V3Methodology;
