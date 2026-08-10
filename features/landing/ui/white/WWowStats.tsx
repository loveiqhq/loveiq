import type { FC, ReactNode } from "react";

/**
 * "Why it matters" — three sourced stat cards (Figma node 8947:7588).
 *
 * The three graphics are the designer's own exports, kept as static SVGs under
 * public/images/white/wowstats/ rather than hand-rebuilt: the dot matrix is 100
 * circles with 47 per-dot gradients, and the flame is a grey outline with a
 * gradient arc stroked over ~41% of it. Re-deriving either by hand is how the
 * first attempt ended up wrong.
 *
 * Layout mirrors the Figma graphic box (282 × 110) as percentages so the cards
 * scale down cleanly on mobile.
 */

/** Figma positions inside the 282 × 110 graphic box, as percentages. */
const PEOPLE = [
  { left: 84, top: 22, on: false },
  { left: 126, top: 22, on: false },
  { left: 168, top: 22, on: false },
  { left: 107, top: 57, on: true },
  { left: 149, top: 55, on: false },
];

const DotMatrix: FC = () => (
  // eslint-disable-next-line @next/next/no-img-element -- static decorative SVG; next/image adds nothing here
  <img
    src="/images/white/wowstats/dots.svg"
    alt=""
    aria-hidden
    width={282}
    height={110}
    className="h-full w-full object-contain"
  />
);

const PersonGroup: FC = () => (
  <div className="relative h-full w-full">
    {PEOPLE.map((p) => (
      // eslint-disable-next-line @next/next/no-img-element -- static decorative SVG
      <img
        key={`${p.left}-${p.top}`}
        src={`/images/white/wowstats/person-${p.on ? "on" : "off"}.svg`}
        alt=""
        aria-hidden
        width={38}
        height={38}
        className="absolute aspect-square"
        style={{
          left: `${(p.left / 282) * 100}%`,
          top: `${(p.top / 110) * 100}%`,
          width: `${(38 / 282) * 100}%`,
        }}
      />
    ))}
  </div>
);

/** Grey flame outline with the brand gradient stroked over ~41% of its path. */
const FlameMeter: FC = () => (
  <div className="relative h-full w-full">
    {/* eslint-disable-next-line @next/next/no-img-element -- static decorative SVG */}
    <img
      src="/images/white/wowstats/flame.svg"
      alt=""
      aria-hidden
      width={128}
      height={128}
      className="absolute aspect-square"
      style={{
        left: `${(77 / 282) * 100}%`,
        top: `${(-12 / 110) * 100}%`,
        width: `${(128 / 282) * 100}%`,
      }}
    />
  </div>
);

const stats: { graphic: ReactNode; value: string; body: string }[] = [
  {
    graphic: <DotMatrix />,
    value: "47%",
    body: "of adults carry a sexual concern they have never voiced to a partner.",
  },
  {
    graphic: <PersonGroup />,
    value: "1 in 5",
    body: "adults say they are satisfied with their sex life. Only one in five.",
  },
  {
    graphic: <FlameMeter />,
    value: "+41%",
    body: "higher reported satisfaction when partners can name their own patterns.",
  },
];

const WWowStats: FC = () => (
  <section className="bg-white py-16 lg:py-[92px]" aria-labelledby="w-wowstats-heading">
    <div className="content-shell flex flex-col items-center">
      <div className="animate-on-scroll flex items-center gap-2.5">
        <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-accent-orange" />
        <span className="text-[11px] font-bold tracking-[0.88px] text-[#5f6675]">
          Why it matters
        </span>
      </div>

      <h2
        id="w-wowstats-heading"
        className="animate-on-scroll stagger-1 mt-3.5 max-w-[760px] text-center font-serif text-[clamp(1.6rem,4.5vw,2.125rem)] font-medium leading-[1.3] tracking-[-0.01em] text-[#161021]"
      >
        Knowing your personality is the difference between guessing and asking.
      </h2>

      <ul className="m-0 mt-10 grid w-full max-w-[1035px] list-none gap-[22px] p-0 sm:grid-cols-3">
        {stats.map((s, i) => (
          <li
            key={s.value}
            className={`animate-on-scroll stagger-${i + 1} flex flex-col items-center rounded-[20px] border border-[#e9e6ee] bg-white px-6 pb-[26px] pt-[30px] shadow-[0_2px_5px_rgba(20,15,33,0.05)] transition duration-300 hover:shadow-[0_10px_28px_-14px_rgba(20,15,33,0.25)] motion-safe:hover:-translate-y-1`}
          >
            <div className="aspect-[282/110] w-full max-w-[282px]">{s.graphic}</div>
            <p className="mt-4 bg-gradient-to-r from-[#fe6839] via-[#bf66d9] to-[#958ef6] bg-clip-text text-center font-serif text-[40px] font-semibold leading-none text-transparent">
              {s.value}
            </p>
            <p className="mt-2 max-w-[282px] text-center text-[13px] font-semibold leading-[19px] text-[#5f6675]">
              {s.body}
            </p>
          </li>
        ))}
      </ul>

      <p className="animate-on-scroll mt-[26px] max-w-[860px] text-center text-[10px] leading-[15px] text-[#6f6a7a]">
        Sources: LoveHoney Global Sex Survey 2023 · ASHA National Sexual Health Survey 2024 ·
        Frontiers in Psychology 2024 · Columbia University Medical Center 2022
      </p>
    </div>
  </section>
);

export default WWowStats;
