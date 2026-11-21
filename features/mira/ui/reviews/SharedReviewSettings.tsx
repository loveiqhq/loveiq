"use client";

import { useCallback, useEffect, useState } from "react";
import type { MyReview } from "@features/mira/server/reviews";
import { miraApi } from "../api";

/**
 * Settings › "Your rating of Mira" (mounted by the Settings page): what the person shared, where
 * their words stand, and taking either back. Taking back is as easy as giving: one tap, shown
 * nowhere from the next page view (features/mira/server/reviews.ts).
 */
type Loaded = { review: MyReview | null };

const BUTTON =
  "min-h-[44px] rounded-full border border-ap-line bg-white px-5 text-[14px] font-semibold text-ap-ink transition-colors hover:bg-ap-ground disabled:cursor-not-allowed disabled:opacity-50";

export default function SharedReviewSettings() {
  const [state, setState] = useState<Loaded | "loading" | "failed">("loading");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    const r = await miraApi<Loaded>("/api/mira/reviews/mine");
    setState(r.ok ? { review: r.data.review ?? null } : "failed");
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first load, after mount
    void load();
  }, [load]);

  async function takeBack(what: "words" | "all") {
    setBusy(true);
    setError(null);
    setDone(null);
    const r = await miraApi(`/api/mira/reviews/mine?what=${what}`, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) return setError(r.data.error ?? "That didn't go through. Please try again.");
    setDone(
      what === "words"
        ? "Your words are no longer shown, and we’ve deleted them."
        : "Your rating is removed."
    );
    setState((s) =>
      typeof s !== "object" || !s.review
        ? s
        : {
            review:
              what === "all"
                ? null
                : {
                    ...s.review,
                    quote: null,
                    published: null,
                    status: "none",
                    name: null,
                    age: null,
                  },
          }
    );
  }

  const review = typeof state === "object" ? state.review : null;
  const signedAs = review?.name ? `${review.name}${review.age ? `, ${review.age}` : ""}` : "";
  return (
    <section aria-labelledby="mira-your-rating" className="flex flex-col gap-3">
      <h2 id="mira-your-rating" className="font-serif text-[22px] font-medium">
        Your rating of Mira
      </h2>
      {state === "loading" ? (
        <div aria-hidden="true" className="h-[92px] animate-pulse rounded-2xl bg-ap-ground" />
      ) : state === "failed" ? (
        <p role="alert" className="text-[14px] text-ap-bad-ink">
          We couldn’t load what you shared.{" "}
          <button type="button" onClick={() => void load()} className="font-semibold underline">
            Try again
          </button>
        </p>
      ) : review ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-ap-line p-4">
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[14px] text-ap-body">
            <span aria-hidden="true" className="tracking-[0.12em] text-ap-orange">
              {"★".repeat(review.stars)}
              <span className="text-[#d9d4e2]">{"★".repeat(5 - review.stars)}</span>
            </span>
            <span>
              You rated Mira {review.stars} out of 5 on{" "}
              {new Date(review.createdAt).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
              .
            </span>
          </p>
          {review.status === "pending" || review.status === "approved" ? (
            <figure className="m-0 flex flex-col gap-1.5 border-l-2 border-[#e7d8f8] pl-3">
              <blockquote className="m-0 font-serif text-[15px] italic leading-relaxed text-ap-ink">
                “{review.status === "approved" ? review.published : review.quote}”
              </blockquote>
              <figcaption className="text-[13px] leading-snug text-ap-muted">
                {review.status === "approved"
                  ? `Shown on Mira’s pages as ${signedAs}.`
                  : `Waiting for our team to read it. Once approved, it shows as ${signedAs}.`}
                {review.status === "approved" && review.published !== review.quote
                  ? " We took out a detail that could identify someone, as you allowed."
                  : ""}
              </figcaption>
            </figure>
          ) : review.status === "rejected" ? (
            <p className="text-[13px] text-ap-muted">
              Your words weren’t published, and we didn’t keep them.
            </p>
          ) : (
            <p className="text-[13px] text-ap-muted">No words shared, only your stars.</p>
          )}
          <div className="flex flex-wrap gap-2.5">
            {review.status === "pending" || review.status === "approved" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void takeBack("words")}
                className={BUTTON}
              >
                Stop showing my words
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => void takeBack("all")}
              className={BUTTON}
            >
              Remove my rating
            </button>
          </div>
        </div>
      ) : (
        <p className="text-[14px] text-ap-body">
          You haven’t rated Mira. When she asks, you can leave a rating and, if you like, a sentence
          for others.
        </p>
      )}
      <p role="status" className="text-[14px] text-ap-good-ink empty:hidden">
        {done}
      </p>
      {error ? (
        <p role="alert" className="text-[14px] text-ap-bad-ink">
          {error}
        </p>
      ) : null}
      <p className="text-[12px] leading-relaxed text-ap-muted">
        Your stars count toward the average on Mira’s pages, without your name. Your words show only
        with your permission, after our team has read them, and disappear the moment you take them
        back.{" "}
        <a href="/mira/privacy#ratings" className="underline">
          How Mira handles your data
        </a>
      </p>
    </section>
  );
}
