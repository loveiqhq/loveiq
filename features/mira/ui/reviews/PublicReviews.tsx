"use client";

import { useEffect, useState } from "react";
import { REVIEWS_MIN_PEOPLE, type TodaysReviews } from "@features/mira/reviews";
import { miraApi } from "../api";

/**
 * Mira's real ratings on her pages (features/mira/reviews.ts): Mark's board D, "faces, ★ 4.9 ·
 * loved by N people, one quote", with initials for faces and honest words ("rated by"). Each part
 * fetches the public figures itself and shows nothing at all until there are real ones: at least
 * 20 people, none of them the team's, and a quote the team approved.
 *
 * Mounts: ReviewsWelcome under Mira's welcome in MiraChat (place "under" on phones, "foot" above
 * the "Mira is an AI" line on wider screens, as on the board); MiraRatingLine on Mira's card in
 * the coach roster.
 */

let inflight: Promise<TodaysReviews | null> | null = null;

/** One request for the parts that mount together; each visit asks afresh. */
function load(): Promise<TodaysReviews | null> {
  inflight ??= miraApi<{ reviews?: TodaysReviews | null }>("/api/mira/reviews")
    .then((r) => (r.ok ? (r.data.reviews ?? null) : null))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function usePublicReviews(): TodaysReviews | null {
  const [reviews, setReviews] = useState<TodaysReviews | null>(null);
  useEffect(() => {
    let live = true;
    void load().then((r) => {
      if (live) setReviews(r);
    });
    return () => {
      live = false;
    };
  }, []);
  return reviews;
}

/**
 * Under Mira's welcome. Nothing at all until the figures arrive (not even an empty box, which
 * the welcome's gap would space out); then it mounts closed and opens on the next frame, so the
 * welcome eases up instead of jumping (at once for anyone who asks for less motion).
 */
export function ReviewsWelcome({ place }: { place: "under" | "foot" }) {
  const reviews = usePublicReviews();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!reviews) return;
    const frame = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(frame);
  }, [reviews]);
  if (!reviews) return null;
  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none [@media(max-height:480px)]:hidden ${
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      } ${place === "under" ? "sm:hidden" : "max-sm:hidden"}`}
    >
      <div className="min-h-0 overflow-hidden">
        <ReviewsBlock reviews={reviews} className={place === "under" ? "pt-2" : "pb-1 pt-3"} />
      </div>
    </div>
  );
}

/** For Mira's card in the coach roster: the rating line and how we check it, or nothing yet. */
export function MiraRatingLine({ className = "" }: { className?: string }) {
  const reviews = usePublicReviews();
  if (!reviews) return null;
  return (
    <div
      className={`flex flex-wrap items-center gap-x-1 gap-y-0.5 motion-safe:animate-mira-in ${className}`}
    >
      <RatingLine reviews={reviews} />
      <HowWeCheck />
    </div>
  );
}

/** Soft tints for the initials, in Mira's coral, orchid and lavender. */
const TINTS = [
  "bg-ap-lilac text-ap-plum",
  "bg-ap-orange/15 text-ap-pii",
  "bg-ap-mist/50 text-ap-violet",
];

function ReviewsBlock({ reviews: r, className }: { reviews: TodaysReviews; className: string }) {
  return (
    <section
      aria-label="What people say about Mira"
      className={`flex flex-col items-center gap-2 px-1 text-center ${className}`}
    >
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="flex">
          {r.initials.map((x, i) => (
            <span
              key={x}
              className={`-ml-2 grid h-[26px] w-[26px] place-items-center rounded-full border-2 border-white text-[10px] font-bold tracking-[0.02em] first:ml-0 ${TINTS[i % TINTS.length]}`}
            >
              {x}
            </span>
          ))}
        </span>
        <RatingLine reviews={r} />
      </div>
      <figure className="m-0 max-w-[44ch] text-balance">
        <blockquote className="m-0 inline font-serif text-[13px] italic leading-snug text-ap-body sm:text-[14px]">
          “{r.quote.text}”
        </blockquote>{" "}
        <figcaption className="inline whitespace-nowrap text-[12px] text-ap-muted">
          — {r.quote.name}
          {r.quote.age ? `, ${r.quote.age}` : ""}
        </figcaption>
      </figure>
      <HowWeCheck />
    </section>
  );
}

function RatingLine({ reviews: r }: { reviews: TodaysReviews }) {
  return (
    <p className="m-0 flex items-center gap-1 text-[13px] text-ap-muted">
      <svg
        aria-hidden="true"
        width="13"
        height="13"
        viewBox="0 0 24 24"
        className="shrink-0 fill-ap-orange"
      >
        <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" />
      </svg>
      <span>
        <b className="font-semibold text-ap-ink">{r.average.toFixed(1)}</b>
        <span className="sr-only"> out of 5</span> · rated by{" "}
        <b className="font-semibold text-ap-ink">{r.people.toLocaleString("en")}</b> people
      </span>
    </p>
  );
}

/**
 * Whether and how we check reviews, beside every rating shown (UWG §5b(3)): a native disclosure,
 * so it works with a keyboard, a screen reader and no script.
 */
export function HowWeCheck() {
  return (
    <details className="group text-[12px] text-ap-muted">
      <summary className="inline-flex min-h-[32px] cursor-pointer list-none items-center gap-1 rounded-full px-2 underline decoration-ap-mist underline-offset-[3px] transition-colors hover:text-ap-body [&::-webkit-details-marker]:hidden">
        How we check reviews
        <svg
          aria-hidden="true"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-transform group-open:rotate-180 motion-reduce:transition-none"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <p className="mx-auto mb-1 mt-1 max-w-[46ch] text-pretty text-left leading-relaxed text-ap-body motion-safe:animate-mira-in">
        Only people signed in to Mira can rate her, once each, and our team&rsquo;s own accounts
        never count. Every quote is read by our team before it shows, and only with the
        writer&rsquo;s permission. We never change anyone&rsquo;s words, except to take out a detail
        that could identify someone, marked […]. Nothing shows until {REVIEWS_MIN_PEOPLE} people
        have rated her.
      </p>
    </details>
  );
}
