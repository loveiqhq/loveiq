"use client";

import { useEffect, useRef, useState, type CSSProperties, type FC } from "react";

/**
 * "WHAT SHAPED THIS REPORT / Methodology" — Figma 10392:18465.
 *
 * Universal, archetype-independent content: the eyebrow + heading + intro, a
 * horizontally-scrolled deck of seven science cards (10360:9879, each linking to
 * the chapters it feeds), a pagination dot row, and three source cards.
 */

interface ScienceCard {
  /** Accent, taken from the stroke baked into each card's exported icon —
   * which independently matched a pixel sample of every card's top rule. */
  accent: string;
  icon: string;
  n: string;
  title: string;
  question: string;
  chapters: string[];
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
    chapters: ["Attachment Style", "Challenges in Partnership"],
  },
  {
    accent: "#2fbfba",
    icon: "sexology",
    n: "04",
    title: "Sexology",
    question: "How does arousal actually work, and why is it different from desire or pleasure?",
    chapters: ["Initiation Style", "Fantasy vs. Reality"],
  },
  {
    accent: "#c36ddf",
    icon: "behavioral-science",
    n: "05",
    title: "Behavioral science",
    question: "Why do habits often overwrite intentions? How do we break through self-sabotage?",
    chapters: ["Accelerators & Brakes", "Libido Challenges"],
  },
  {
    accent: "#ff9450",
    icon: "relationship-research",
    n: "06",
    title: "Relationship research",
    question: "What keeps intimacy and desire alive over years?",
    chapters: ["Love Language", "Growth Potentials"],
  },
  {
    accent: "#6b6678",
    icon: "therapy-rooms",
    n: "07",
    title: "Therapy rooms",
    question:
      "What do decades in the room teach? What are 3 practical ways to keep intimacy intact?",
    chapters: ["Reading Recommendations"],
  },
];

/** 10392:18700 — the three source cards under the deck. */
const SOURCES: readonly { title: string; body: string }[] = [
  { title: "Hundreds of papers", body: "peer reviewed from a variety of scientific fields" },
  { title: "Clinical models", body: "what therapists rely on and their practical pointers" },
  { title: "Foundational books", body: "the texts experts return to and their main insights" },
];

const V3Methodology: FC = () => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  // The dot row reflects which card is nearest the scroller's left edge.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onScroll = () => {
      const cards = el.querySelectorAll<HTMLElement>(".rv3-sci__card");
      if (!cards.length) return;
      let nearest = 0;
      let best = Infinity;
      cards.forEach((c, i) => {
        const d = Math.abs(c.offsetLeft - el.scrollLeft);
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
    <section className="rv3-method" data-node-id="10392:18465">
      <p className="rv3-method__eyebrow" data-node-id="10392:18467">
        What shaped this report
      </p>
      <h2 className="rv3-method__heading" data-node-id="10392:18469">
        Methodology
      </h2>
      <p className="rv3-prose rv3-method__intro" data-node-id="10392:18471">
        To support self-understanding, we combined insights from multiple disciplines such as
        neuroscience, psychology and relationship research alongside insights from decades of
        therapeutic experience.
      </p>

      <div className="rv3-sci" data-node-id="10360:9879">
        <div className="rv3-sci__track" ref={trackRef}>
          {CARDS.map((card) => (
            <article
              key={card.title}
              className="rv3-sci__card"
              style={{ "--rv3-accent": card.accent } as CSSProperties}
            >
              <span className="rv3-sci__rule" aria-hidden="true" />
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
                <span className="rv3-sci__n">{card.n}</span>
              </header>
              <h3 className="rv3-sci__title">{card.title}</h3>
              <p className="rv3-sci__q">{card.question}</p>
              <p className="rv3-sci__label">read this in CHAPTER:</p>
              <ul className="rv3-sci__list">
                {card.chapters.map((c) => (
                  <li key={c}>
                    <span className="rv3-sci__bullet" aria-hidden="true" />
                    {c}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <div className="rv3-sci__dots" aria-hidden="true">
          {CARDS.map((c, i) => (
            <span key={c.title} className={i === active ? "is-active" : ""} />
          ))}
        </div>
      </div>

      <div className="rv3-src" data-node-id="10392:18700">
        {SOURCES.map((s) => (
          <div key={s.title} className="rv3-src__card">
            <p className="rv3-src__title">{s.title}</p>
            <p className="rv3-src__body">{s.body}</p>
          </div>
        ))}
      </div>

      <div className="rv3-prose rv3-method__outro" data-node-id="10392:18726">
        <p>
          We translate this knowledge into clear clear and understandable patterns that people can
          recognise in themselves.
        </p>
        <p>
          This report is a <strong>psychometric approximation.</strong> It does not describe you in
          a fixed or absolute way, but highlights{" "}
          <strong>tendencies, patterns, and possible directions of your personality and sexual identity.</strong>
        </p>
        <p>
          With that in mind, it&rsquo;s time to dive into your{" "}
          <strong>personalized LoveIQ report.</strong>
        </p>
      </div>

      <div className="rv3-method__rule" aria-hidden="true" data-node-id="10392:18729" />
    </section>
  );
};

export default V3Methodology;
