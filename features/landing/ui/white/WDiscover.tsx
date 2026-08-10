import type { FC, ReactNode } from "react";

/**
 * "What you'll find out" — 2×2 rule-separated list with gradient icon tiles
 * (Figma node 8947:7491).
 *
 * The tile gradient reaches full purple at 71.4%, not 100% (Figma's stop) —
 * ramping all the way to the corner leaves the tile visibly too orange.
 */

const items: { icon: ReactNode; title: string; body: string }[] = [
  {
    title: "What actually turns you on",
    body: "Your desire has a logic. We put it into plain words you can use.",
    icon: (
      <path d="M11 2.75c.611 2.444 1.833 4.431 3.667 5.958C16.5 10.236 17.417 11.917 17.417 13.75a6.417 6.417 0 1 1-12.834 0c0-.992.322-1.957.917-2.75a2.292 2.292 0 0 0 4.583 0c0-1.833-1.375-2.75-1.375-4.583 0-1.223.764-2.445 2.292-3.667Z" />
    ),
  },
  {
    title: "What raises the heat, and what kills it",
    body: "The exact conditions that switch desire on for you, and the ones that shut it down.",
    icon: (
      <path d="M12.833 13.328V3.667a1.833 1.833 0 1 0-3.666 0v9.661a4.125 4.125 0 1 0 3.666 0Z" />
    ),
  },
  {
    title: "Words for what you crave",
    body: "You can't ask for what you can't name. This gives you the vocabulary.",
    icon: (
      <path d="M2.829 16.05a1.375 1.375 0 0 0-.086-1.07 9.167 9.167 0 1 1 4.379 4.326 1.375 1.375 0 0 0-1.008-.085l-3.128.915a.688.688 0 0 1-.851-.87l.694-3.216Z" />
    ),
  },
  {
    title: "Where you and a partner keep missing each other",
    body: "See how your patterns collide in bed, and where the real gap is.",
    icon: (
      <>
        <path d="M8.25 14.667a6.417 6.417 0 1 0 0-12.834 6.417 6.417 0 0 0 0 12.834Z" />
        <path d="M13.75 20.167a6.417 6.417 0 1 0 0-12.834 6.417 6.417 0 0 0 0 12.834Z" />
      </>
    ),
  },
];

const WDiscover: FC = () => (
  <section className="bg-white py-16 lg:py-[92px]" aria-labelledby="w-discover-heading">
    <div className="content-shell">
      <div className="animate-on-scroll flex items-center gap-2.5">
        <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-accent-orange" />
        <span className="text-[11px] font-bold tracking-[0.88px] text-[#5f6675]">
          What you&apos;ll find out
        </span>
      </div>

      <h2
        id="w-discover-heading"
        className="animate-on-scroll stagger-1 mt-3.5 max-w-[620px] font-serif text-[clamp(2rem,5.5vw,2.875rem)] font-medium leading-[1.18] tracking-[-0.01em] text-[#161021]"
      >
        In 9 minutes, you&apos;ll know things about yourself most people never learn.
      </h2>

      <div className="mt-10 grid gap-x-14 md:grid-cols-2">
        {items.map((it, i) => (
          <div
            key={it.title}
            className={`animate-on-scroll stagger-${(i % 2) + 1} flex items-start gap-[18px] border-t border-[#e9e6ee] py-6`}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#fe6839] from-0% to-[#bf66d9] to-[71.429%]">
              <svg
                aria-hidden
                className="h-[22px] w-[22px]"
                viewBox="0 0 22 22"
                fill="none"
                stroke="#ffffff"
                strokeWidth="1.83"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {it.icon}
              </svg>
            </span>
            <div className="flex flex-col gap-[5px]">
              <h3 className="text-[16.5px] font-bold leading-snug text-[#161021]">{it.title}</h3>
              <p className="text-[14.5px] leading-[1.5] text-[#5f6675]">{it.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default WDiscover;
