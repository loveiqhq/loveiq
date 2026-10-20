"use client";

import Image from "next/image";
import type { FC } from "react";
import { PAYGATE_REVIEWS } from "../paygateReviews";
import { GATE_COPY } from "./gateContent";

/**
 * "Why unlock your Archetype?" (1604:2495, 1604:2496): four benefit cards, the pricing
 * modal's (paygate.css `rpg-why`) with the gate's own words.
 */
export const GateWhyUnlock: FC = () => (
  <section className="iug-why animate-on-scroll" aria-labelledby="iug-why-title">
    <h2 id="iug-why-title" className="rpg__section-title iug-why__title">
      {GATE_COPY.why.title.lead}
      <em className="rpg-gradient">{GATE_COPY.why.title.emph}</em>
      {GATE_COPY.why.title.tail}
    </h2>
    <div className="rpg__why-grid">
      {GATE_COPY.why.cards.map(({ green, lead, emph, body }) => (
        <article key={emph} className="rpg-why">
          <h3 className="rpg-why__title">
            {green ? <span className="rpg-why__green">{green} </span> : null}
            {lead}
            <em className="rpg-gradient">{emph}</em>
          </h3>
          <p className="rpg-why__body">{body}</p>
        </article>
      ))}
    </div>
  </section>
);

/**
 * "Real people love & appreciate our insights." (1604:2511): the pricing modal's four
 * reviews (paygateReviews.ts), the same people and words the frame draws.
 */
export const GateReviews: FC = () => (
  <section className="iug-reviews animate-on-scroll" aria-labelledby="iug-reviews-title">
    <h2 id="iug-reviews-title" className="rpg__section-title iug-section-title">
      Real <em className="rpg-gradient">People</em> Love &amp; Appreciate Our{" "}
      <em className="rpg-gradient">Insights.</em>
    </h2>
    <ul className="iug-reviews__list">
      {PAYGATE_REVIEWS.map((review) => (
        <li key={review.name} className="rpg-review">
          <div className="rpg-review__head">
            <Image
              className="rpg-review__avatar"
              src={review.avatar}
              alt=""
              width={40}
              height={40}
            />
            <span className="rpg-review__who">
              <span className="rpg-review__name">{review.name}</span>
              <span className="rpg-review__role">{review.role}</span>
            </span>
            <Image
              className="rpg-review__stars"
              src="/report/paygate/stars.svg"
              alt="5 out of 5 stars"
              width={58}
              height={10}
              unoptimized
            />
          </div>
          <blockquote className="rpg-review__quote">
            {review.pre}
            <span className="rpg-review__emph">{review.emph}</span>
            {review.post}
          </blockquote>
        </li>
      ))}
    </ul>
  </section>
);
