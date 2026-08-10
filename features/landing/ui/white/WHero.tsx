"use client";

import { useSyncExternalStore, type FC } from "react";
import Image from "next/image";
import Link from "next/link";
import { trackStartSurvey } from "@features/analytics/client";
import WQuestionCard from "./WQuestionCard";

/** Reused from the field-reports rating row so the faces stay consistent. */
const RATING_AVATARS = [
  "/testimonials/rating-1.jpg",
  "/testimonials/rating-2.jpg",
  "/testimonials/rating-3.jpg",
];

/** Plausible band for the "taking the test right now" ticker. */
const CONCURRENT_MIN = 70;
const CONCURRENT_MAX = 100;
const CONCURRENT_SSR = 84;

// Drawn once per page load, so the snapshot below is referentially stable.
const CONCURRENT_CLIENT =
  CONCURRENT_MIN + Math.floor(Math.random() * (CONCURRENT_MAX - CONCURRENT_MIN + 1));

const subscribeNoop = () => () => {};

const WHero: FC = () => {
  // Same pattern as CheckoutPage: the server renders a fixed number (so
  // hydration matches) and the client swaps in the randomised one — without a
  // setState-in-effect and its extra render.
  const concurrent = useSyncExternalStore(
    subscribeNoop,
    () => CONCURRENT_CLIENT,
    () => CONCURRENT_SSR
  );

  return (
    <section className="relative overflow-hidden bg-white pt-[64px]">
      <div className="content-shell">
        <div className="grid items-center gap-10 py-12 lg:grid-cols-[minmax(0,1fr)_471px] lg:gap-14 lg:pb-[82px] lg:pt-[70px]">
          {/* Left: copy */}
          <div className="flex max-w-[38rem] flex-col">
            <div className="animate-on-scroll flex items-center gap-2.5">
              <span className="animate-pulse-glow h-[7px] w-[7px] shrink-0 rounded-full bg-accent-orange" />
              <span className="text-[11px] font-bold uppercase tracking-[0.88px] text-[#5f6675]">
                Anonymous · ~9 minutes · No account
              </span>
            </div>

            <h1 className="animate-on-scroll stagger-1 mt-3.5 font-serif text-[clamp(2.6rem,8.5vw,3.67rem)] font-semibold leading-[1.12] tracking-[-0.01em] text-[#161021]">
              Determine
              <br />
              <span className="whitespace-nowrap">
                Your{" "}
                <span className="bg-gradient-to-r from-[#fe6839] via-[#d95b88] via-[48%] to-[#cb5fc1] bg-clip-text font-medium italic text-transparent">
                  Sexual
                </span>
              </span>
              <br />
              <span className="bg-gradient-to-r from-[#c267c9] via-[#a871f4] via-[48%] to-[#9893f7] bg-clip-text font-medium italic text-transparent">
                Personalities
              </span>
            </h1>

            <p className="animate-on-scroll stagger-2 mt-5 max-w-[470px] text-[16px] font-medium leading-[28px] text-[#5f6675]">
              Grounded in state-of-the-art science &amp; research.
              <br />
              <strong className="font-extrabold text-black">In just 9 minutes</strong>, decode your
              sexual personality and patterns, so you get clear, practical steps to improve
              intimacy.
            </p>

            <div className="animate-on-scroll stagger-3 mt-5">
              <Link
                href="/survey"
                aria-label="Start my free test - hero"
                onClick={() => trackStartSurvey("hero")}
                className="focus-visible-ring group inline-flex items-center justify-center gap-2.5 rounded-full bg-gradient-to-br from-[#fe6839] via-[#bf66d9] via-[43%] to-[#958ef6] px-[22px] py-3.5 text-[16px] font-semibold text-white shadow-[0_10px_26px_-12px_rgba(191,102,217,0.75)] transition duration-300 hover:shadow-[0_14px_30px_-10px_rgba(191,102,217,0.85)] motion-safe:hover:-translate-y-0.5"
              >
                <span>Start my free test</span>
                <svg
                  aria-hidden
                  className="h-[17px] w-[17px] transition-transform duration-300 motion-safe:group-hover:translate-x-1"
                  viewBox="0 0 17 17"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.42"
                >
                  <path d="M3.54 8.5h9.92M9.21 12.75 13.46 8.5 9.21 4.25" />
                </svg>
              </Link>
            </div>

            {/* Social proof */}
            <div className="animate-on-scroll stagger-4 mt-5 flex items-center gap-3">
              <div className="flex items-center">
                {RATING_AVATARS.map((src, i) => (
                  <div
                    key={src}
                    className="relative h-[34px] w-[34px] overflow-hidden rounded-full border-2 border-white"
                    style={{
                      marginRight: i < RATING_AVATARS.length - 1 ? "-9px" : "0",
                      zIndex: RATING_AVATARS.length - i,
                    }}
                  >
                    <Image src={src} alt="" fill sizes="34px" className="object-cover" />
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-0.5 text-[13px]">
                <span aria-hidden className="tracking-[1px] text-accent-orange">
                  ★★★★★
                </span>
                <p className="font-semibold text-[#5f6675]">
                  <strong className="font-bold text-[#161021]">10,000+ people</strong> · 4.9/5
                  rating
                </p>
              </div>
            </div>

            <div className="animate-on-scroll stagger-4 mt-3 flex items-center gap-2">
              {/* Live-ish indicator: a static dot under the halo, so it still
                  reads as a dot when animation is off. */}
              <span className="relative flex h-[7px] w-[7px] shrink-0">
                <span
                  aria-hidden
                  className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-orange opacity-75 motion-reduce:hidden"
                />
                <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-accent-orange" />
              </span>
              <p className="text-[13px] text-[#5f6675]">
                <strong className="font-bold text-[#161021]">{concurrent}</strong> people are taking
                the test right now
              </p>
            </div>

            <p className="animate-on-scroll stagger-5 mt-[18px] text-[16px] leading-[28px] text-black">
              <span className="font-light">Your </span>
              <strong className="font-extrabold">privacy &amp; anonymity</strong>
              <span className="font-light"> come first. Learn more in our </span>
              <Link
                href="/trust-zone"
                className="focus-visible-ring whitespace-nowrap font-bold text-[#c2410c] hover:underline"
              >
                <span aria-hidden className="text-[20px] font-extrabold leading-none">
                  ›
                </span>{" "}
                Trust Center
              </Link>
            </p>
          </div>

          {/* Right: live question 1 */}
          <div className="animate-on-scroll stagger-2 w-full lg:justify-self-end">
            <WQuestionCard size="hero" location="hero" />
          </div>
        </div>
      </div>
    </section>
  );
};

export default WHero;
