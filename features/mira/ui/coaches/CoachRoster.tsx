"use client";

import Link from "next/link";
import { MiraRatingLine } from "../reviews/PublicReviews";
import { useEffect, useRef, useState } from "react";
import {
  AREAS,
  MIRA_TRAINED_ON,
  searchCoaches,
  type AreaId,
  type Coach,
  type CoachId,
} from "@features/mira/content/coaches";
import { MiraAppFrame } from "../MiraAppFrame";
import { SignedOutNotice } from "../account/SignedOut";
import { CoachFinder } from "./CoachFinder";
import { track, useCoachData, useEmptySearchCount } from "./data";
import { AdultsOnly } from "../kit";
import { CoachPortrait, CompassIcon, NotifyButton, SearchIcon, SparkIcon } from "./parts";
import { FOCUS, INK_PILL, QUIET_PILL } from "./styles";

const FILTERS: Array<[AreaId | "all", string]> = [["all", "All areas"], ...AREAS];

/**
 * /mira/coaches (board Coaches): meeting the coaches rather than browsing products. Mira first,
 * live, with her photo, motto and the trained-on line; then the five on their way, each a face
 * (a monogram), a name, a motto and an honest "Coming soon" with Notify me. Search in the
 * person's own words, areas, and "Find my challenge" when they aren't sure.
 */
export default function CoachRoster() {
  const { state } = useCoachData();
  const data = state.status === "ready" ? state.data : null;
  const [query, setQuery] = useState("");
  const [area, setArea] = useState<AreaId | "all">("all");
  const [finder, setFinder] = useState(false);
  // What the person asked for on this page, over what the server knew when it loaded.
  const [asked, setAsked] = useState<CoachId[] | null>(null);
  const known = asked ?? data?.notified ?? [];
  const finderButton = useRef<HTMLButtonElement | null>(null);

  const shown = searchCoaches(query, area);
  const mira = shown.find((c) => c.live);
  const soon = shown.filter((c) => !c.live);
  const narrowed = query.trim() !== "" || area !== "all";
  useEmptySearchCount("roster", query.trim() !== "" && shown.length === 0);

  useEffect(() => {
    track("coaches_viewed");
    // A link straight to the finder (Home's search, #finder) opens it once the page is here.
    if (window.location.hash === "#finder") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the hash is only readable here
      setFinder(true);
      track("finder_started");
    }
  }, []);

  function setNotified(id: CoachId, on: boolean) {
    setAsked((a) => {
      const base = a ?? data?.notified ?? [];
      return on ? [...new Set([...base, id])] : base.filter((x) => x !== id);
    });
  }
  function openFinder() {
    if (!finder) track("finder_started");
    setFinder(true);
  }

  // A lost sign-in: said here, with the way back, never a move to sign-in of the page's own (the
  // sign-in page may still see the session and send the person straight back).
  if (state.status === "out") {
    return (
      <MiraAppFrame active="coaches">
        <h1 className="font-serif text-[32px] font-medium leading-tight">Coaches</h1>
        <SignedOutNotice />
      </MiraAppFrame>
    );
  }
  if (state.status === "closed") {
    return (
      <MiraAppFrame active="coaches">
        <h1 className="font-serif text-[32px] font-medium leading-tight">Coaches</h1>
        <AdultsOnly className="mt-3" />
      </MiraAppFrame>
    );
  }

  return (
    // No Coaches tab in the frame yet: nothing is marked current until the nav gets one.
    <MiraAppFrame active="coaches" email={data?.email} name={data?.name}>
      <h1 className="text-balance font-serif text-[32px] font-medium leading-[1.15] tracking-[-0.01em] [overflow-wrap:anywhere] motion-safe:animate-mira-in sm:text-[42px]">
        Who would you like to learn from?
      </h1>
      <p className="mt-3 max-w-[58ch] text-[15px] leading-relaxed text-ap-body [animation-delay:120ms] motion-safe:animate-mira-in sm:text-[16px]">
        Each coach knows one challenge well, so the answers stay specific. They are AI coaches, not
        people. Mira is here now, and the others are on their way.
      </p>

      <div className="mt-7 flex flex-col gap-3 [animation-delay:200ms] motion-safe:animate-mira-in sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <label htmlFor="coach-search" className="sr-only">
            Search coaches
          </label>
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ap-muted" />
          <input
            id="coach-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={80}
            autoComplete="off"
            enterKeyHint="search"
            placeholder="Try “lights off”, “no desire”"
            className="h-12 w-full rounded-full border border-ap-field bg-white pl-11 pr-4 text-[16px] text-ap-ink caret-ap-purple shadow-[0_6px_24px_-16px_rgba(22,16,33,0.25)] outline-none transition-colors placeholder:text-ap-muted focus-visible:border-ap-lavender focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ap-purple"
          />
        </div>
        <button
          ref={finderButton}
          type="button"
          onClick={openFinder}
          aria-expanded={finder}
          className={INK_PILL}
        >
          <CompassIcon />
          Not sure? Find my challenge
        </button>
      </div>

      <div
        role="group"
        aria-label="Area"
        // Phones: one row that scrolls sideways, its edge fading to say there is more.
        className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [animation-delay:240ms] [scrollbar-width:none] motion-safe:animate-mira-in max-sm:[mask-image:linear-gradient(to_right,#000_calc(100%-32px),transparent)] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {FILTERS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={area === id}
            onClick={() => setArea(id)}
            className={`min-h-[44px] shrink-0 whitespace-nowrap rounded-full border px-4 text-[14px] transition-[background-color,border-color] ${
              area === id
                ? "border-ap-purple bg-ap-lilac font-semibold text-ap-ink"
                : "border-ap-line bg-white text-ap-body hover:border-ap-mist hover:bg-ap-ground"
            } ${FOCUS}`}
          >
            {label}
          </button>
        ))}
      </div>

      {finder ? (
        <CoachFinder
          known={known}
          onNotify={setNotified}
          onClose={() => {
            setFinder(false);
            finderButton.current?.focus();
          }}
        />
      ) : null}

      <p aria-live="polite" className="sr-only">
        {narrowed ? `${shown.length} ${shown.length === 1 ? "coach" : "coaches"}` : ""}
      </p>

      {mira ? <MiraCard mira={mira} /> : null}

      {soon.length ? (
        <section aria-labelledby="soon-h" className="mt-12">
          <h2 id="soon-h" className="font-serif text-[24px] font-medium leading-tight">
            On their way
          </h2>
          <p className="mt-1.5 max-w-[60ch] text-[15px] leading-relaxed text-ap-body">
            Each will focus on one challenge, like Mira. They can’t talk yet: ask to hear when one
            is ready, and talk to Mira meanwhile.
          </p>
          <ul className="mt-4 grid gap-x-10 sm:grid-cols-2">
            {soon.map((c, i) => (
              <li
                key={c.id}
                id={`coach-${c.id}`}
                className="group scroll-mt-24 border-t border-ap-line py-2"
              >
                <div
                  style={{ animationDelay: `${120 + i * 70}ms` }}
                  className="-mx-3 flex gap-4 rounded-[20px] px-3 py-4 transition-colors duration-700 motion-safe:animate-mira-in group-[:target]:bg-ap-lilac"
                >
                  <CoachPortrait coach={c} size={52} />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-serif text-[21px] font-semibold leading-tight">{c.name}</h3>
                    <p className="mt-0.5 text-[13px] text-ap-muted">{c.challenge} · Coming soon</p>
                    <p className="mt-3 font-serif text-[16px] italic leading-snug text-ap-ink">
                      “{c.motto}”
                    </p>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-ap-body">{c.desc}</p>
                    <div className="mt-3">
                      <NotifyButton coach={c} done={known.includes(c.id)} onChange={setNotified} />
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {shown.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-[28px] border border-dashed border-ap-line px-6 py-10 text-center motion-safe:animate-mira-in">
          <h2 className="font-serif text-[22px] font-medium">No coach for that yet</h2>
          <p className="max-w-[46ch] text-[15px] leading-relaxed text-ap-body">
            Try other words, or let us help you name what’s going on. Two quick questions are often
            enough.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setArea("all");
              }}
              className={QUIET_PILL}
            >
              Clear search
            </button>
            <button type="button" onClick={openFinder} className={INK_PILL}>
              Find my challenge
            </button>
          </div>
        </div>
      ) : null}
    </MiraAppFrame>
  );
}

/** Mira, the coach who is here: her photo with a soft breathing aura, motto and trained-on line. */
function MiraCard({ mira }: { mira: Coach }) {
  return (
    <article
      id="coach-mira"
      aria-labelledby="coach-mira-name"
      className="relative mt-8 overflow-hidden rounded-[28px] border border-ap-line bg-white p-5 shadow-[0_22px_54px_-30px_rgba(103,60,120,0.35)] [animation-delay:120ms] motion-safe:animate-mira-in sm:p-7"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-28 h-[320px] w-[320px] rounded-full bg-[radial-gradient(closest-side,rgba(254,104,57,0.14),rgba(191,102,217,0.13)_45%,rgba(149,142,246,0)_100%)] blur-2xl motion-safe:animate-mira-cloud"
      />
      <div className="relative flex items-center gap-4">
        <CoachPortrait coach={mira} size={76} />
        <div className="min-w-0">
          <h2 id="coach-mira-name" className="font-serif text-[28px] font-medium leading-tight">
            Mira
          </h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[14px] text-ap-muted">
            <span>{mira.challenge}</span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-ap-good-ink">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-ap-good" />
              Here now
            </span>
          </p>
        </div>
      </div>
      <p className="relative mt-5 max-w-[34ch] text-balance font-serif text-[20px] italic leading-snug text-ap-ink sm:text-[23px]">
        “{mira.motto}”
      </p>
      <p className="relative mt-2 max-w-[60ch] text-[15px] leading-relaxed text-ap-body">
        {mira.desc}
      </p>
      <p className="relative mt-4 text-[13px] leading-snug text-ap-muted">
        <SparkIcon />
        Trained on <b className="font-semibold text-ap-body">{MIRA_TRAINED_ON.papers}</b> &amp;{" "}
        <b className="font-semibold text-ap-body">{MIRA_TRAINED_ON.words}</b> {MIRA_TRAINED_ON.rest}
      </p>
      {/* Real ratings only: nothing shows until enough real people rated (features/mira/reviews.ts). */}
      <MiraRatingLine className="relative mt-2 text-[13px]" />
      <div className="relative mt-6 flex flex-wrap items-center gap-2">
        <Link href="/mira" className={INK_PILL}>
          Talk to Mira
        </Link>
      </div>
    </article>
  );
}
