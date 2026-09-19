import type { FC, ReactNode } from "react";

/**
 * White-variant trust row — "Actionable · Science-backed · 100% Private" (Figma
 * node 7828:10367). Three columns with line-icons, divided by vertical hairlines.
 */

const items: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />,
    title: "Actionable",
    body: "Personalized next steps, bite-size practices, and guided reflection prompts, so you know exactly what to try this week.",
  },
  {
    icon: (
      <>
        <path d="M9 3h6" />
        <path d="M10 3v5l-5 9a3 3 0 0 0 3 4.5h8a3 3 0 0 0 3-4.5l-5-9V3" />
        <path d="M7.5 15h9" />
      </>
    ),
    title: "Science-backed",
    body: "Based on over +100 scientific papers & books from the world's leading therapists and researchers.",
  },
  {
    icon: (
      <>
        <path d="M3 3l18 18" />
        <path d="M10.6 6.1A10.8 10.8 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-2.3 3.1M6.6 6.7A17 17 0 0 0 2.5 12s3.5 6 9.5 6a10.6 10.6 0 0 0 3.4-.5" />
        <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      </>
    ),
    title: "100% Private",
    body: "Your data is anonymous. We prioritize your privacy and do not sell your personal information or link results to your identity.",
  },
];

const WTrustRow: FC = () => (
  <section className="bg-white py-12 lg:py-16">
    <div className="content-shell grid gap-10 sm:grid-cols-3 sm:gap-0">
      {items.map((it, i) => (
        <div
          key={it.title}
          className={`animate-on-scroll flex flex-col gap-4 ${
            i > 0 ? "sm:border-l sm:border-black/[0.08] sm:pl-10" : "sm:pr-10"
          } ${i === 1 ? "sm:px-10" : ""}`}
        >
          <svg
            aria-hidden
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#161021"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {it.icon}
          </svg>
          <h3 className="font-serif text-[18px] font-bold text-[#161021]">{it.title}</h3>
          <p className="text-[14px] leading-relaxed text-[#69707d]">{it.body}</p>
        </div>
      ))}
    </div>
  </section>
);

export default WTrustRow;
