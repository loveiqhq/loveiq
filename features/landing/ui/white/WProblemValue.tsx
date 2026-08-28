import type { FC } from "react";

const points = [
  {
    num: "01",
    title: "Decode your patterns",
    body: "See how your attachment and communication styles interact — not in jargon, but in plain language tied to your own life.",
  },
  {
    num: "02",
    title: "Speak the unspeakable",
    body: "Desire is complex. Without the right words, needs go unmet and frustrations build silently.",
  },
  {
    num: "03",
    title: "Grow on your own timeline",
    body: "Because every psychology is unique, one-size-fits-all advice doesn’t work. We all need guidance tailored to our emotional blueprint.",
  },
];

const WProblemValue: FC = () => {
  return (
    <section className="bg-white py-16 lg:py-24">
      <div className="content-shell grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
        {/* Left: framing */}
        <div className="animate-on-scroll flex flex-col gap-6">
          <div className="flex items-center gap-2.5">
            <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-accent-orange" />
            <span className="text-[11px] font-bold tracking-wide text-[#6b6678]">The problem</span>
          </div>
          <h2 className="font-serif text-[clamp(2.25rem,5.5vw,3.25rem)] font-medium italic leading-[1.15] tracking-tight text-black">
            Great intimacy requires a{" "}
            <span className="bg-gradient-to-r from-[#fe6839] via-[#bf66d9] to-[#958ef6] bg-clip-text not-italic text-transparent">
              vocabulary
            </span>{" "}
            most of us were never taught.
          </h2>
          <p className="text-[17px] text-[#3f3a4d]">
            LoveIQ gives you the language to name what you feel, want, and need.
          </p>
        </div>

        {/* Right: 3 points */}
        <div className="flex flex-col">
          {points.map((p) => (
            <div
              key={p.num}
              className="animate-on-scroll flex gap-8 border-b border-black/[0.06] py-6 last:border-b-0"
            >
              <span className="shrink-0 pt-1 text-[11px] font-bold text-[#6b6678]">{p.num}</span>
              <div className="flex flex-col gap-2.5">
                <h3 className="font-serif text-[19px] font-bold text-[#161021]">{p.title}</h3>
                <p className="text-[15px] leading-6 text-[#69707d]">{p.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WProblemValue;
