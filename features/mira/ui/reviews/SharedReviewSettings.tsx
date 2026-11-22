"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { REJECT_REASON_LABEL } from "@features/mira/reviews";
import type { MyReview } from "@features/mira/server/reviews";
import { miraApi } from "../api";
import { AdultsOnly } from "../kit";
import { RatingForm } from "./ReviewAsk";

/**
 * Settings › "Your rating of Mira" (mounted by the Settings page): "Rate Mira" for anyone who has
 * talked with her, at any time (the chat's ask is only a reminder, so the ratings aren't only
 * from good moments); then what the person shared, where their words stand (with the team's
 * reason if they weren't shown), and taking either back. Taking back is as easy as giving: one
 * tap, shown nowhere from the next page view (features/mira/server/reviews.ts).
 */
type Loaded = { review: MyReview | null; name: string; canRate: boolean };

const BUTTON =
  "min-h-[44px] rounded-full border border-ap-line bg-white px-5 text-[14px] font-semibold text-ap-ink transition-colors hover:bg-ap-ground disabled:cursor-not-allowed disabled:opacity-50";

export default function SharedReviewSettings() {
  // "minor": this browser or the account was stopped as under 18, so reading is refused (403);
  // taking back never is, so that stays on offer.
  const [state, setState] = useState<Loaded | "loading" | "failed" | "minor">("loading");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    const r = await miraApi<Partial<Loaded>>("/api/mira/reviews/mine");
    setState(
      r.ok
        ? {
            review: r.data.review ?? null,
            name: r.data.name ?? "",
            canRate: r.data.canRate === true,
          }
        : r.minor
          ? "minor"
          : "failed"
    );
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
    heading.current?.focus(); // the pressed button goes with what it took back
    setDone(
      what === "words"
        ? "Your words are no longer shown, and we’ve deleted them."
        : state === "minor"
          ? "Nothing this account rated is kept or shown."
          : "Your rating is removed."
    );
    setState((s) =>
      typeof s !== "object" || !s.review
        ? s
        : what === "all"
          ? // Rated before, so they have talked with Mira: open to rate again.
            { ...s, review: null, canRate: true }
          : {
              ...s,
              review: {
                ...s.review,
                quote: null,
                published: null,
                status: "none",
                reason: null,
                name: null,
                age: null,
              },
            }
    );
  }

  /** Rated here: the form goes, so the heading takes the focus; then what they shared shows. */
  function rated(sent: { words: boolean }) {
    heading.current?.focus();
    setError(null);
    setDone(
      sent.words
        ? "Thank you. Your rating is in, and our team reads your words before they show."
        : "Thank you. Your rating is in."
    );
    void load();
  }

  const review = typeof state === "object" ? state.review : null;
  const signedAs = review?.name ? `${review.name}${review.age ? `, ${review.age}` : ""}` : "";
  // Initials end in a full stop already ("R."): one is enough (round-2 SET-16).
  const asShown = signedAs.endsWith(".") ? signedAs : `${signedAs}.`;
  return (
    <section aria-labelledby="mira-your-rating" className="flex flex-col gap-3">
      <h2
        ref={heading}
        id="mira-your-rating"
        tabIndex={-1}
        className="font-serif text-[22px] font-medium outline-none"
      >
        Your rating of Mira
      </h2>
      {state === "loading" ? (
        <div aria-hidden="true" className="h-[92px] animate-pulse rounded-2xl bg-ap-ground" />
      ) : state === "minor" ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-ap-line p-4">
          <AdultsOnly className="font-semibold text-ap-ink" />
          {done ? null : (
            <>
              <p className="text-[14px] text-ap-body">
                If this account rated Mira, you can remove the rating and any words with it.
              </p>
              <div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void takeBack("all")}
                  className={BUTTON}
                >
                  Remove my rating
                </button>
              </div>
            </>
          )}
        </div>
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
              <span className="text-ap-mist">{"★".repeat(5 - review.stars)}</span>
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
            <figure className="m-0 flex flex-col gap-1.5 border-l-2 border-ap-mist pl-3">
              <blockquote className="m-0 font-serif text-[15px] italic leading-relaxed text-ap-ink">
                “{review.status === "approved" ? review.published : review.quote}”
              </blockquote>
              <figcaption className="text-[13px] leading-snug text-ap-muted">
                {review.status === "approved"
                  ? `Shown on Mira’s pages as ${asShown}`
                  : `Waiting for our team to read it. Once approved, it shows as ${asShown}`}
                {review.status === "approved" && review.published !== review.quote ? (
                  <>
                    {" "}
                    We took out a detail that could identify someone, as you allowed.
                    <span className="mt-1 block">You wrote: “{review.quote}”</span>
                  </>
                ) : null}
              </figcaption>
            </figure>
          ) : review.status === "rejected" ? (
            <p className="text-[13px] text-ap-muted">
              Your words aren’t shown, and we didn’t keep them.
              {review.reason ? ` Our team’s reason: ${REJECT_REASON_LABEL[review.reason]}.` : ""}
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
          <p className="text-[13px] text-ap-muted">
            To change your stars or your words, remove this rating and rate again.
          </p>
        </div>
      ) : state.canRate ? (
        <div className="rounded-2xl border border-ap-line p-4">
          <RatingForm
            via="settings"
            name={state.name}
            onSent={rated}
            head={
              <>
                <h3 className="text-[16px] font-bold">Rate Mira</h3>
                <p className="mt-1 text-[14px] leading-normal text-ap-body">
                  Every rating counts, high or low, and helps others decide whether to talk to her.
                </p>
              </>
            }
          />
        </div>
      ) : (
        <p className="text-[14px] text-ap-body">
          You can rate Mira once you’ve talked with her a little: three messages of your own.
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
        <Link href="/mira/privacy#ratings" className="underline">
          How Mira handles your data
        </Link>
      </p>
    </section>
  );
}
