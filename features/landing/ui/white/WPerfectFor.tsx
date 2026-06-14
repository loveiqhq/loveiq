import type { FC } from "react";

/**
 * White-variant "Who is this perfect for?" — the Figma "Audience map" (node
 * 7828:10762): a quadrant scatter plot on the left, a 5-item numbered list on
 * the right.
 */

type Audience = { n: number; title: string; tag: string; body: string; x: number; y: number };

const audiences: Audience[] = [
  {
    n: 1,
    title: "Singles",
    tag: "Inward · Reflective",
    body: "Understand what you want — before the next relationship shapes it for you.",
    x: 19,
    y: 40,
  },
  {
    n: 2,
    title: "People in relationships",
    tag: "Shared · Active",
    body: "Strengthen communication, sexual alignment, and long-term compatibility.",
    x: 48,
    y: 73,
  },
  {
    n: 3,
    title: "Couples exploring growth",
    tag: "Shared · Growth",
    body: "Map where you each stand, then move toward each other with intent.",
    x: 79,
    y: 52,
  },
  {
    n: 4,
    title: "Self-development lovers",
    tag: "Inward · Active",
    body: "For readers, journalers, and inner-work types who take themselves seriously.",
    x: 31,
    y: 62,
  },
  {
    n: 5,
    title: "Therapists & coaches",
    tag: "Shared · Reflective",
    body: "A shared vocabulary and a structured map to ground your work with clients.",
    x: 68,
    y: 22,
  },
];

const NumberBadge: FC<{ n: number; className?: string }> = ({ n, className = "" }) => (
  <span
    className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#fe6839] via-[#cf5afb] to-[#7d88ff] font-bold text-white ${className}`}
  >
    {n}
  </span>
);

const WPerfectFor: FC = () => {
  return (
    <section className="bg-[#f5f6f8] py-16 lg:py-24">
      <div className="content-shell">
        <div className="animate-on-scroll mb-10 max-w-2xl">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-accent-orange" />
            <span className="text-[11px] font-bold uppercase tracking-wide text-[#6b6678]">
              Audience map
            </span>
          </div>
          <h2 className="font-serif text-3xl font-medium leading-tight sm:text-[44px]">
            <span className="bg-gradient-to-r from-[#fe6839] via-[#d95b88] to-[#cb5fc1] bg-clip-text text-transparent">
              Who is this perfect for?
            </span>
          </h2>
          <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-[#6b7280]">
            This is for people who are ready to explore who they are, grow with more awareness, and
            bring more intention into their sexual lives. We built it for you, and we built it for
            ourselves too.
          </p>
        </div>

        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          {/* Quadrant map */}
          <div className="animate-on-scroll rounded-2xl border border-black/[0.08] bg-white p-6 sm:p-8">
            <div className="flex gap-3">
              <span className="flex rotate-180 items-center justify-center text-[9px] font-medium uppercase tracking-wide text-[#9a96a6] [writing-mode:vertical-rl]">
                Self-understanding ← → Active change
              </span>
              <div className="flex-1">
                <div className="relative aspect-square w-full rounded-lg border border-black/[0.06]">
                  {/* dashed quadrant grid */}
                  <div className="absolute inset-y-0 left-1/3 border-l border-dashed border-black/[0.07]" />
                  <div className="absolute inset-y-0 left-2/3 border-l border-dashed border-black/[0.07]" />
                  <div className="absolute inset-x-0 top-1/3 border-t border-dashed border-black/[0.07]" />
                  <div className="absolute inset-x-0 top-2/3 border-t border-dashed border-black/[0.07]" />
                  <span className="absolute left-3 top-2 text-[10px] font-medium uppercase tracking-wide text-[#9a96a6]">
                    Solo
                  </span>
                  <span className="absolute right-3 top-2 text-[10px] font-medium uppercase tracking-wide text-[#9a96a6]">
                    Shared
                  </span>
                  {audiences.map((a) => (
                    <span
                      key={a.n}
                      className="absolute -translate-x-1/2 -translate-y-1/2"
                      style={{ left: `${a.x}%`, top: `${a.y}%` }}
                    >
                      <NumberBadge n={a.n} className="h-7 w-7 text-[12px] shadow-md" />
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-center text-[9px] font-medium uppercase tracking-wide text-[#9a96a6]">
                  Inward / Solo ← → Shared / Relational
                </p>
              </div>
            </div>
          </div>

          {/* List */}
          <div className="flex flex-col">
            {audiences.map((a) => (
              <div
                key={a.n}
                className="animate-on-scroll flex flex-col gap-1.5 border-b border-black/[0.06] py-4 last:border-b-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <NumberBadge n={a.n} className="h-6 w-6 text-[11px]" />
                    <h3 className="font-serif text-lg font-bold text-[#161021]">{a.title}</h3>
                  </div>
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-[#9a96a6]">
                    {a.tag}
                  </span>
                </div>
                <p className="pl-9 text-[14px] leading-relaxed text-[#6b7280]">{a.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default WPerfectFor;
